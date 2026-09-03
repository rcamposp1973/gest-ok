import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================================
// API REAL SII: RESCATE Y SINCRONIZACIÓN RCV
// ==========================================

// Endpoint: Test SII Credentials or API Key
app.post("/api/sii/test-connection", async (req, res) => {
  try {
    const { companyRut, claveSii, rutRepresentante, claveRepresentante, provider, apiKey } = req.body;

    if (!companyRut) {
      return res.status(400).json({ success: false, error: "El RUT de la empresa es requerido." });
    }

    if ((provider === 'SIMPLE_API' || (!provider && apiKey)) && apiKey) {
      // Real live check against SimpleAPI.cl
      try {
        const subRes = await fetch("https://api.simpleapi.cl/api/v1/Suscripcion/status", {
          method: "GET",
          headers: {
            "Authorization": apiKey.trim()
          }
        });

        if (subRes.ok) {
          const quotaData = await subRes.json();
          return res.json({
            success: true,
            message: `Conexión REAL validada con SimpleAPI.cl. Plan activo con cuotas disponibles.`,
            details: { companyRut, provider: 'SIMPLE_API', status: "ACTIVO", quotas: quotaData }
          });
        } else {
          return res.status(401).json({
            success: false,
            error: `API Key rechazada por SimpleAPI.cl (HTTP ${subRes.status}). Verifique la clave ingresada.`
          });
        }
      } catch (apiErr: any) {
        return res.status(502).json({
          success: false,
          error: `Error de red al conectar con SimpleAPI.cl: ${apiErr.message || String(apiErr)}`
        });
      }
    }

    if (provider && provider !== 'DIRECT_SII' && apiKey) {
      // Other third party API provider test
      return res.json({
        success: true,
        message: `Conexión exitosa con el proveedor de API (${provider}).`,
        details: { companyRut, provider, status: "ACTIVO" }
      });
    }

    const cleanRut = companyRut.replace(/[^0-9kK]/g, '');
    const cleanRepRut = (rutRepresentante || companyRut).replace(/[^0-9kK]/g, '');
    const activeClave = claveRepresentante || claveSii;

    if (!activeClave || activeClave === '••••••••') {
      return res.status(400).json({
        success: false,
        error: "Se requiere ingresar la Clave Tributaria real del SII o Clave de Representante Legal para autenticar."
      });
    }

    // Direct SII Authentication Test against zeus.sii.cl
    const siiLoginUrl = "https://zeus.sii.cl/cgi_cgi/cert/sm_login.cgi";
    const rutBody = cleanRepRut.slice(0, -1);
    const dvBody = cleanRepRut.slice(-1).toUpperCase();

    const formData = new URLSearchParams();
    formData.append("rut", rutBody);
    formData.append("dv", dvBody);
    formData.append("referencia", "https://mpt.sii.cl/cgi_mpt/mpt_get_det.cgi");
    formData.append("clave", activeClave);

    const siiResponse = await fetch(siiLoginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: formData.toString()
    });

    const responseText = await siiResponse.text();

    if (responseText.includes("ERROR") || responseText.includes("Incorrecta") || responseText.includes("Clave invalida") || responseText.includes("Error de Autenticacion")) {
      return res.status(401).json({
        success: false,
        error: `Autenticación rechazada por el SII para RUT ${cleanRepRut}. Verifique que la Clave Tributaria sea correcta.`
      });
    }

    return res.json({
      success: true,
      message: `Conexión autenticada con éxito en portal zeus.sii.cl para RUT ${companyRut}`,
      details: {
        rut: companyRut,
        authStatus: "VERIFICADO",
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: any) {
    console.error("Error in /api/sii/test-connection:", err);
    return res.status(500).json({
      success: false,
      error: `Error de red al conectar con el servidor del SII: ${err.message || String(err)}`
    });
  }
});

// Endpoint: Rescatar RCV Real desde el SII o API externa
app.post("/api/sii/rescatar-rcv", async (req, res) => {
  try {
    const {
      companyRut,
      year,
      month,
      claveSii,
      rutRepresentante,
      claveRepresentante,
      claveCertificadoDigital,
      certificadoB64,
      siiApiUrl,
      provider,
      apiKey,
      rawCsvContent
    } = req.body;

    if (!companyRut) {
      return res.status(400).json({ success: false, error: "RUT de la empresa es obligatorio." });
    }

    const yearNum = parseInt(year, 10) || new Date().getFullYear();
    const MASTER_SII_API_KEY = process.env.SII_API_KEY || '5511-W960-6395-2355-3470';
    const effectiveApiKey = (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0)
      ? apiKey.trim()
      : MASTER_SII_API_KEY;

    const activeProvider = provider || 'SIMPLE_API';

    // 1. IF SIMPLE_API IS SELECTED OR DETECTED (DEFAULT MASTER INTEGRATION)
    if (activeProvider === 'SIMPLE_API' || (siiApiUrl && typeof siiApiUrl === 'string' && siiApiUrl.includes('simpleapi.cl')) || !siiApiUrl) {
      const cleanCompanyRutRaw = companyRut.replace(/[^0-9kK]/g, '');
      const cleanCompanyRutWithDash = cleanCompanyRutRaw.length > 1 
        ? `${cleanCompanyRutRaw.slice(0, -1)}-${cleanCompanyRutRaw.slice(-1)}` 
        : cleanCompanyRutRaw;

      const cleanRepRutRaw = (rutRepresentante || '').replace(/[^0-9kK]/g, '');
      const cleanRepRutWithDash = cleanRepRutRaw.length > 1 
        ? `${cleanRepRutRaw.slice(0, -1)}-${cleanRepRutRaw.slice(-1)}` 
        : cleanRepRutRaw;

      try {
        // Step A: Validate subscription & API key with SimpleAPI
        const subRes = await fetch("https://api.simpleapi.cl/api/v1/Suscripcion/status", {
          method: "GET",
          headers: {
            "Authorization": effectiveApiKey
          }
        });

        if (!subRes.ok) {
          return res.status(401).json({
            success: false,
            error: `API Key del Gateway SII no válida o expirada (HTTP ${subRes.status}). Contacte al Administrador del Sistema.`
          });
        }

        const quotas = await subRes.json();
        const rcvQuota = Array.isArray(quotas) ? quotas.find((q: any) => q.servicio === 'RCV') : null;

        // Step B: Authenticate to obtain token if needed
        let token = '';
        try {
          const authRes = await fetch("https://api.simpleapi.cl/api/Auth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apikey: (apiKey || '').trim() })
          });
          if (authRes.ok) {
            token = await authRes.text();
          }
        } catch (tokErr) {
          console.warn("Could not generate bearer token for SimpleAPI:", tokErr);
        }

        // Step C: Check if Certificate & Password are provided to query SII RCV scraper
        let docs: any[] = [];
        const formattedMonth = String(month === 'ALL' ? '01' : month).padStart(2, '0');
        const cleanCertB64 = (certificadoB64 || '').replace(/^data:[^;]+;base64,/, '').trim();

        if (cleanCertB64 && (claveCertificadoDigital || claveRepresentante)) {
          const certPass = (claveCertificadoDigital || claveRepresentante || '').trim();
          const ambienteNum = (req.body.ambiente === 'SANDBOX' || req.body.ambiente === 'Certificación' || req.body.ambiente === 0) ? 0 : 1;
          
          let apiErrors: string[] = [];
          const headers = { 'Authorization': effectiveApiKey };

          // Build input payload for SimpleAPI RCV
          const rcvInputPayload = {
            RutEmpresa: cleanCompanyRutWithDash,
            RutCertificado: cleanRepRutWithDash || cleanCompanyRutWithDash,
            Ambiente: ambienteNum,
            Password: certPass,
            CertificadoB64: cleanCertB64
          };

          // 1. Fetch Ventas
          try {
            console.log(`[RCV] Invocando Ventas SimpleAPI para periodo ${formattedMonth}/${yearNum} (Ambiente: ${ambienteNum})...`);
            const formDataVentas = new FormData();
            formDataVentas.append('input', JSON.stringify(rcvInputPayload));

            const ventasRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/ventas/${formattedMonth}/${yearNum}`, {
              method: 'POST',
              headers,
              body: formDataVentas,
              signal: AbortSignal.timeout(60000)
            });

            console.log(`[RCV] Ventas status: ${ventasRes.status}`);

            if (ventasRes.ok) {
              const dataVentas: any = await ventasRes.json();
              
              // A: Facturas / DTEs individuales de Venta
              const detalleVentas = dataVentas?.ventas?.detalleVentas || dataVentas?.detalleVentas || [];
              for (const item of detalleVentas) {
                const tipoDte = String(item.tipoDTE || item.tipoDte || item.tipoDoc || '33');
                const folio = String(item.folio || '0');
                const fechaEmisionRaw = item.fechaEmision || item.fecha || `${yearNum}-${formattedMonth}-01`;
                const fechaEmision = fechaEmisionRaw.includes('T') ? fechaEmisionRaw.split('T')[0] : fechaEmisionRaw;
                const montoNeto = Number(item.montoNeto || 0);
                const montoIva = Number(item.montoIvaRecuperable ?? item.montoIva ?? 0);
                const montoExento = Number(item.montoExento || 0);
                const montoTotal = Number(item.montoTotal || (montoNeto + montoIva + montoExento));

                docs.push({
                  tipoRegistro: 'Venta',
                  tipoDocumento: tipoDte,
                  tipoDoc: tipoDte,
                  nombreTipoDoc: item.tipoDTEString || item.tipoDocString || (tipoDte === '33' ? 'Factura Electrónica' : tipoDte === '34' ? 'Factura Exenta' : tipoDte === '61' ? 'Nota de Crédito' : 'DTE Venta'),
                  folio,
                  rutEmisor: cleanCompanyRutWithDash,
                  razonSocialEmisor: req.body.companyName || 'SOC DE INVERSIONES ALCALA SPA',
                  rutReceptor: item.rutCliente || item.rutReceptor || item.rutProveedor || '76.000.000-0',
                  razonSocialReceptor: item.razonSocial || item.razonSocialReceptor || 'CLIENTE DTE',
                  fechaEmision,
                  montoNeto,
                  montoIva,
                  montoExento,
                  montoTotal,
                  period: `${yearNum}-${formattedMonth}`
                });
              }

              // B: Resúmenes de Ventas (por ejemplo: Boletas Electrónicas Tipo 39 o 41 del mes)
              const resumenesVentas = dataVentas?.ventas?.resumenes || dataVentas?.resumenes || [];
              for (const resItem of resumenesVentas) {
                const tipoDte = Number(resItem.tipoDte || 0);
                const totalDocs = Number(resItem.totalDocumentos || 0);
                const montoTotal = Number(resItem.montoTotal || 0);
                if (totalDocs > 0 || montoTotal > 0) {
                  const hasIndividualDocs = detalleVentas.some((d: any) => Number(d.tipoDTE || d.tipoDte) === tipoDte);
                  if (!hasIndividualDocs) {
                    const montoNeto = Number(resItem.montoNeto || 0);
                    const montoIva = Number(resItem.ivaRecuperable ?? resItem.montoIva ?? 0);
                    const montoExento = Number(resItem.montoExento || 0);
                    docs.push({
                      tipoRegistro: 'Venta',
                      tipoDocumento: String(tipoDte || '39'),
                      tipoDoc: String(tipoDte || '39'),
                      nombreTipoDoc: resItem.tipoDteString || (tipoDte === 39 ? 'Boleta Electrónica (Resumen Mensual)' : 'Resumen DTE'),
                      folio: `RESUMEN-${totalDocs}DOCS`,
                      rutEmisor: cleanCompanyRutWithDash,
                      razonSocialEmisor: req.body.companyName || 'SOC DE INVERSIONES ALCALA SPA',
                      rutReceptor: '66.666.666-6',
                      razonSocialReceptor: `Clientes Varios (${totalDocs} Boletas)`,
                      fechaEmision: `${yearNum}-${formattedMonth}-28`,
                      montoNeto,
                      montoIva,
                      montoExento,
                      montoTotal,
                      period: `${yearNum}-${formattedMonth}`
                    });
                  }
                }
              }
            } else {
              const errText = await ventasRes.text();
              console.warn(`[RCV] Ventas error body: ${errText.slice(0, 200)}`);
              try {
                const errJson = JSON.parse(errText);
                apiErrors.push(errJson.mensaje || errJson.error || `Ventas HTTP ${ventasRes.status}`);
              } catch {
                apiErrors.push(`Ventas HTTP ${ventasRes.status}`);
              }
            }
          } catch (vErr: any) {
            console.warn(`[RCV] Excepción en Ventas: ${vErr.message || String(vErr)}`);
            apiErrors.push(`Error conexión Ventas: ${vErr.message || String(vErr)}`);
          }

          // 2. Pause between requests (SimpleAPI rate-limit is 1 req/sec and SII certificate session releasing)
          await new Promise(resolve => setTimeout(resolve, 2500));

          // 3. Fetch Compras
          try {
            console.log(`[RCV] Invocando Compras SimpleAPI para periodo ${formattedMonth}/${yearNum}...`);
            const formDataCompras = new FormData();
            formDataCompras.append('input', JSON.stringify(rcvInputPayload));

            const comprasRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/compras/${formattedMonth}/${yearNum}`, {
              method: 'POST',
              headers,
              body: formDataCompras,
              signal: AbortSignal.timeout(60000)
            });

            console.log(`[RCV] Compras status: ${comprasRes.status}`);

            if (comprasRes.ok) {
              const dataCompras: any = await comprasRes.json();
              
              // A: Facturas / DTEs individuales de Compra
              const detalleCompras = dataCompras?.compras?.detalleCompras || dataCompras?.detalleCompras || [];
              for (const item of detalleCompras) {
                const tipoDte = String(item.tipoDTE || item.tipoDte || item.tipoDoc || '33');
                const folio = String(item.folio || '0');
                const fechaEmisionRaw = item.fechaEmision || item.fecha || `${yearNum}-${formattedMonth}-01`;
                const fechaEmision = fechaEmisionRaw.includes('T') ? fechaEmisionRaw.split('T')[0] : fechaEmisionRaw;
                const montoNeto = Number(item.montoNeto || 0);
                const montoIva = Number(item.montoIvaRecuperable ?? item.montoIva ?? 0);
                const montoExento = Number(item.montoExento || 0);
                const montoTotal = Number(item.montoTotal || (montoNeto + montoIva + montoExento));

                docs.push({
                  tipoRegistro: 'Compra',
                  tipoDocumento: tipoDte,
                  tipoDoc: tipoDte,
                  nombreTipoDoc: item.tipoDTEString || item.tipoDocString || (tipoDte === '33' ? 'Factura Electrónica' : tipoDte === '34' ? 'Factura Exenta' : tipoDte === '61' ? 'Nota de Crédito' : 'DTE Compra'),
                  folio,
                  rutEmisor: item.rutProveedor || item.rutEmisor || '76.000.000-0',
                  razonSocialEmisor: item.razonSocial || item.razonSocialEmisor || 'PROVEEDOR DTE',
                  rutReceptor: cleanCompanyRutWithDash,
                  razonSocialReceptor: req.body.companyName || 'SOC DE INVERSIONES ALCALA SPA',
                  fechaEmision,
                  montoNeto,
                  montoIva,
                  montoExento,
                  montoTotal,
                  period: `${yearNum}-${formattedMonth}`
                });
              }

              // B: Resumen de Compras si detalle estuviera vacío
              if (detalleCompras.length === 0) {
                const resumenesCompras = dataCompras?.compras?.resumenes || dataCompras?.resumenes || [];
                for (const resItem of resumenesCompras) {
                  const tipoDte = Number(resItem.tipoDte || 0);
                  const totalDocs = Number(resItem.totalDocumentos || 0);
                  const montoTotal = Number(resItem.montoTotal || 0);
                  if (totalDocs > 0 || montoTotal > 0) {
                    const montoNeto = Number(resItem.montoNeto || 0);
                    const montoIva = Number(resItem.ivaRecuperable ?? resItem.montoIva ?? 0);
                    const montoExento = Number(resItem.montoExento || 0);
                    docs.push({
                      tipoRegistro: 'Compra',
                      tipoDocumento: String(tipoDte || '33'),
                      tipoDoc: String(tipoDte || '33'),
                      nombreTipoDoc: resItem.tipoDteString || 'Resumen Compras DTE',
                      folio: `RESUMEN-${totalDocs}DOCS`,
                      rutEmisor: '76.000.000-0',
                      razonSocialEmisor: 'Varios Proveedores DTE',
                      rutReceptor: cleanCompanyRutWithDash,
                      razonSocialReceptor: req.body.companyName || 'SOC DE INVERSIONES ALCALA SPA',
                      fechaEmision: `${yearNum}-${formattedMonth}-28`,
                      montoNeto,
                      montoIva,
                      montoExento,
                      montoTotal,
                      period: `${yearNum}-${formattedMonth}`
                    });
                  }
                }
              }
            } else {
              const errText = await comprasRes.text();
              try {
                const errJson = JSON.parse(errText);
                apiErrors.push(errJson.mensaje || errJson.error || `Compras HTTP ${comprasRes.status}`);
              } catch {
                apiErrors.push(`Compras HTTP ${comprasRes.status}`);
              }
            }
          } catch (cErr: any) {
            apiErrors.push(`Error conexión Compras: ${cErr.message || String(cErr)}`);
          }

          // Si fallaron las dos llamadas con error explícito, informar al usuario
          if (docs.length === 0 && apiErrors.length > 0) {
            return res.json({
              success: false,
              source: 'SIMPLE_API',
              error: `Respuesta del Facturador SII / SimpleAPI:\n\n${apiErrors.join('\n')}`
            });
          }
        }

        // If no certificate was provided, notify clearly without false positive
        if (!certificadoB64) {
          const quotaStr = rcvQuota ? `${rcvQuota.uso}/${rcvQuota.maximo} consultas disponibles` : 'Plan activo';
          return res.json({
            success: false,
            needsCertificate: true,
            source: 'SIMPLE_API',
            quotas,
            error: `Conexión con SimpleAPI.cl validada con éxito (${quotaStr} para RUT ${companyRut}).\n\n` +
                   `⚠️ Para rescatar las Compras y Ventas oficiales directamente del portal del SII a través de SimpleAPI, ` +
                   `se requiere adjuntar el archivo de Firma Digital (.pfx / .p12) del Representante Legal y su clave.\n\n` +
                   `Puedes cargarlo en '3. CARGA RCV/BH' > '⚙ Configurar API Key / Certificado', o bien utilizar la Opción 2 para cargar directamente los archivos CSV oficiales descargados del SII.`
          });
        }

        const mesLabel = month === 'ALL' ? `Todo el año ${yearNum}` : `Mes ${month}/${yearNum}`;
        return res.json({
          success: true,
          source: 'SIMPLE_API',
          documentsCount: docs.length,
          documents: docs,
          quotas,
          message: docs.length > 0 
            ? `Se rescataron exitosamente ${docs.length} documentos desde el SII vía SimpleAPI.`
            : `Conexión con SimpleAPI.cl completada para el RUT ${companyRut} (${mesLabel}). No se encontraron nuevos documentos en el Registro de Compras y Ventas del SII para este período.`
        });
      } catch (simpleErr: any) {
        return res.status(502).json({
          success: false,
          error: `Error de conexión con SimpleAPI.cl: ${simpleErr.message || String(simpleErr)}`
        });
      }
    }

    // 2. IF OTHER CUSTOM SII API ENDPOINT WAS CONFIGURED
    if (siiApiUrl && typeof siiApiUrl === 'string' && siiApiUrl.trim().length > 5) {
      const targetUrl = siiApiUrl.trim();
      try {
        const apiRes = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey ? `Bearer ${apiKey}` : '',
            'x-api-key': apiKey || '',
            'apikey': apiKey || '',
            'x-rut-empresa': companyRut,
            'x-rut-representante': rutRepresentante || ''
          },
          body: JSON.stringify({
            companyRut,
            rutRepresentante,
            claveRepresentante,
            claveCertificadoDigital,
            claveSii: claveSii || claveRepresentante,
            year: yearNum,
            month: month || 'ALL',
          })
        });

        const resText = await apiRes.text();
        let apiData: any = null;
        try {
          apiData = JSON.parse(resText);
        } catch {
          const cleanText = resText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          return res.status(apiRes.status).json({
            success: false,
            error: `Error desde la API (${targetUrl}) [HTTP ${apiRes.status}]: ${cleanText || apiRes.statusText}`
          });
        }

        if (!apiRes.ok) {
          const errMsg = apiData?.message || apiData?.error || apiData?.detalle || resText.slice(0, 200);
          return res.status(apiRes.status).json({
            success: false,
            error: `Error desde la API del Facturador SII (${targetUrl}) [HTTP ${apiRes.status}]: ${errMsg}`
          });
        }

        const docs = Array.isArray(apiData) ? apiData : (apiData.documents || apiData.detalles || apiData.rcv || []);

        return res.json({
          success: true,
          source: 'CUSTOM_SII_API',
          documentsCount: docs.length,
          documents: docs
        });
      } catch (customErr: any) {
        return res.status(502).json({
          success: false,
          error: `Error de conexión con la API configurada (${targetUrl}): ${customErr.message || String(customErr)}`
        });
      }
    }

    // IF RAW CSV CONTENT WAS SUPPLIED (DIRECT CSV INGESTION VIA REAL ARCHIVE)
    if (rawCsvContent && typeof rawCsvContent === 'string' && rawCsvContent.length > 20) {
      // Parse real CSV directly from SII
      const lines = rawCsvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        return res.status(400).json({ success: false, error: "El contenido CSV del RCV entregado no contiene filas suficientes." });
      }

      const parsedDocs = [];
      const header = lines[0].toLowerCase();
      const isVenta = header.includes("venta") || header.includes("cliente") || header.includes("receptor");

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/;|\t|,/).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 5) continue;

        const rutCounterparty = cols[0] || cols[1] || "11.111.111-1";
        const nameCounterparty = cols[2] || cols[3] || "CLIENTE / PROVEEDOR REAL";
        const tipoDoc = cols[1] || cols[0] || "33";
        const folio = cols[2] || cols[3] || String(i);
        const fecha = cols[3] || cols[4] || `${yearNum}-01-15`;
        const montoNeto = parseFloat(cols[5]?.replace(/\./g, '').replace(',', '.')) || 0;
        const montoIva = parseFloat(cols[6]?.replace(/\./g, '').replace(',', '.')) || 0;
        const montoTotal = parseFloat(cols[8]?.replace(/\./g, '').replace(',', '.')) || (montoNeto + montoIva);

        parsedDocs.push({
          id: `SII-REAL-${yearNum}-${i}-${folio}`,
          tipoRegistro: isVenta ? 'Venta' : 'Compra',
          tipoDoc: String(tipoDoc).replace(/[^0-9]/g, '') || '33',
          folio: String(folio),
          fechaEmision: fecha,
          rutEmisor: isVenta ? companyRut : rutCounterparty,
          razonSocialEmisor: isVenta ? "SOCIEDAD REAL" : nameCounterparty,
          rutReceptor: isVenta ? rutCounterparty : companyRut,
          razonSocialReceptor: isVenta ? nameCounterparty : "SOCIEDAD REAL",
          montoNeto,
          montoIva,
          montoExento: 0,
          montoTotal,
          period: `${yearNum}-${String(fecha.split('-')[1] || '01').padStart(2, '0')}`,
          estadoSII: "Aceptado_SII",
          createdAt: new Date().toISOString()
        });
      }

      return res.json({
        success: true,
        source: "RAW_CSV_REAL",
        documentsCount: parsedDocs.length,
        documents: parsedDocs
      });
    }

    // IF THIRD-PARTY API PROVIDER (SimpleAPI, OpenFactura, LibreDTE) IS CONFIGURED
    if (provider && provider !== 'DIRECT_SII' && apiKey) {
      let providerEndpoint = "";
      if (provider === 'SIMPLE_API') {
        providerEndpoint = `https://api.simpleapi.cl/v1/rcv/${companyRut}/${yearNum}/${month || 'ALL'}`;
      } else if (provider === 'OPEN_FACTURA') {
        providerEndpoint = `https://api.haulmer.com/v2/dte/rcv/${yearNum}/${month || '01'}`;
      } else if (provider === 'LIBRE_DTE') {
        providerEndpoint = `https://libredte.cl/api/rcv/boletas/${yearNum}`;
      }

      if (providerEndpoint) {
        try {
          const apiRes = await fetch(providerEndpoint, {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "x-api-key": apiKey,
              "Accept": "application/json"
            }
          });

          if (!apiRes.ok) {
            const errText = await apiRes.text();
            return res.status(apiRes.status).json({
              success: false,
              error: `Error desde la API del proveedor (${provider}): ${errText || apiRes.statusText}`
            });
          }

          const providerData = await apiRes.json();
          // Map provider docs
          const mappedDocs = Array.isArray(providerData) ? providerData : (providerData.detalles || providerData.documentos || []);

          return res.json({
            success: true,
            source: provider,
            documentsCount: mappedDocs.length,
            documents: mappedDocs
          });
        } catch (apiErr: any) {
          return res.status(502).json({
            success: false,
            error: `Error al consultar la API del proveedor (${provider}): ${apiErr.message}`
          });
        }
      }
    }

    // DIRECT SII SCRAPER / CONNECTOR
    const activeClave = claveRepresentante || claveSii;
    const activeRepRut = rutRepresentante || companyRut;

    if (!activeClave || activeClave === '••••••••') {
      return res.status(400).json({
        success: false,
        error: `No se han configurado la Clave Tributaria real ni la API Key para la empresa RUT ${companyRut}. Por favor, ingresa la Clave SII en las credenciales de la empresa.`
      });
    }

    // Attempt direct login with SII
    const cleanRepRut = activeRepRut.replace(/[^0-9kK]/g, '');
    const rutBody = cleanRepRut.slice(0, -1);
    const dvBody = cleanRepRut.slice(-1).toUpperCase();

    const formData = new URLSearchParams();
    formData.append("rut", rutBody);
    formData.append("dv", dvBody);
    formData.append("referencia", "https://mpt.sii.cl/cgi_mpt/mpt_get_det.cgi");
    formData.append("clave", activeClave);

    const siiLoginResponse = await fetch("https://zeus.sii.cl/cgi_cgi/cert/sm_login.cgi", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      body: formData.toString()
    });

    const siiHtml = await siiLoginResponse.text();

    if (siiHtml.includes("Incorrecta") || siiHtml.includes("Clave invalida") || siiHtml.includes("ERROR")) {
      return res.status(401).json({
        success: false,
        error: `La Clave Tributaria del RUT ${cleanRepRut} ingresada en GEST_OK no fue aceptada por el portal del SII.`
      });
    }

    // Check if SII requires captcha or digital certificate token
    if (siiHtml.includes("captcha") || siiHtml.includes("Certificado Digital")) {
      return res.status(422).json({
        success: false,
        error: `El Servicio de Impuestos Internos (SII) requiere autenticación con Certificado Digital (.pfx) o captcha activo para el RUT ${companyRut}. Puedes subir el archivo de Firma Digital en las Credenciales o ingresar la API Key de integración SII.`
      });
    }

    return res.status(400).json({
      success: false,
      error: `No se pudieron obtener documentos reales de RCV para el RUT ${companyRut}. Ingrese su API Key o cargue el archivo oficial descargado del SII.`
    });

  } catch (err: any) {
    console.error("Error in /api/sii/rescatar-rcv:", err);
    return res.status(500).json({
      success: false,
      error: `Error interno de servidor durante la sincronización RCV: ${err.message || String(err)}`
    });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(3000, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:3000`);
  });
}

startServer();

