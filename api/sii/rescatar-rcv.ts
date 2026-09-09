import type { IncomingMessage, ServerResponse } from 'http';

// Helper to parse JSON body in Vercel Serverless Function
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS & Options handling
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const {
      year,
      month,
      tipo = 'ALL',
      apiKey,
      provider = 'SIMPLE_API',
      rutEmpresa,
      rutRepresentante,
      claveRepresentante,
      claveCertificadoDigital,
      certificadoB64,
      companyRut,
      companyName
    } = body;

    const cleanCompanyRut = (rutEmpresa || companyRut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const cleanRepRut = (rutRepresentante || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const yearNum = Number(year) || new Date().getFullYear();

    const formatRut = (raw: string) => {
      if (!raw || raw.length < 2) return '';
      const bodyPart = raw.slice(0, -1);
      const dvPart = raw.slice(-1);
      return `${bodyPart}-${dvPart}`;
    };

    const cleanCompanyRutWithDash = formatRut(cleanCompanyRut);
    const cleanRepRutWithDash = formatRut(cleanRepRut);

    const effectiveApiKey = (apiKey || '5511-W960-6395-2355-3470').trim();

    const cleanCertB64 = (certificadoB64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    const certPass = (claveCertificadoDigital || claveRepresentante || '').trim();
    const formattedMonth = String(month === 'ALL' ? '01' : month).padStart(2, '0');

    // 1. Si no tiene certificado digital, avisar claramente
    if (!cleanCertB64 || !certPass) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        needsCertificate: true,
        error: `Para consultar automáticamente el RCV de ${cleanCompanyRutWithDash || 'la empresa'} desde el SII, se requiere cargar el Certificado Digital (.pfx) en la sección Facturador SII / Configuración.`
      }));
      return;
    }

    // 2. Ejecutar rescate oficial RCV directamente contra SimpleAPI
    let docs: any[] = [];
    const ambienteNum = (body.ambiente === 'SANDBOX' || body.ambiente === 'Certificación' || body.ambiente === 0) ? 0 : 1;
    const headers = { 'Authorization': effectiveApiKey };

    const rcvInputPayload = {
      RutEmpresa: cleanCompanyRutWithDash,
      RutCertificado: cleanRepRutWithDash || cleanCompanyRutWithDash,
      Ambiente: ambienteNum,
      Password: certPass,
      CertificadoB64: cleanCertB64
    };

    let apiErrors: string[] = [];

    // A. Ventas
    if (tipo === 'ALL' || tipo === 'VENTAS' || tipo === 'VENTA') {
      try {
        const formDataVentas = new FormData();
        formDataVentas.append('input', JSON.stringify(rcvInputPayload));

        const ventasRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/ventas/${formattedMonth}/${yearNum}`, {
          method: 'POST',
          headers,
          body: formDataVentas,
          signal: AbortSignal.timeout(60000)
        });

        if (ventasRes.ok) {
          const dataVentas: any = await ventasRes.json();
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
              razonSocialEmisor: companyName || 'EMPRESA EMISORA',
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

          // B: Resúmenes de Ventas (Boletas Electrónicas Tipo 39 o 41 del mes)
          const resumenesVentas = dataVentas?.ventas?.resumenes || dataVentas?.resumenes || dataVentas?.ventas?.resumen || [];
          for (const resItem of resumenesVentas) {
            const tipoDte = Number(resItem.tipoDte || resItem.tipoDTE || 0);
            const totalDocs = Number(resItem.totalDocumentos || resItem.totalDocs || resItem.cantidadDocumentos || 0);
            const montoTotal = Number(resItem.montoTotal || resItem.total || 0);
            if (totalDocs > 0 || montoTotal > 0) {
              const hasIndividualDocs = detalleVentas.some((d: any) => Number(d.tipoDTE || d.tipoDte) === tipoDte);
              if (!hasIndividualDocs) {
                const montoNeto = Number(resItem.montoNeto || resItem.neto || 0);
                const montoIva = Number(resItem.ivaRecuperable ?? resItem.montoIva ?? resItem.iva ?? 0);
                const montoExento = Number(resItem.montoExento || resItem.exento || 0);
                docs.push({
                  tipoRegistro: 'Venta',
                  tipoDocumento: String(tipoDte || '39'),
                  tipoDoc: String(tipoDte || '39'),
                  nombreTipoDoc: resItem.tipoDteString || (tipoDte === 39 ? 'Boleta Electrónica (Resumen Mensual)' : tipoDte === 41 ? 'Boleta Exenta Electrónica' : 'Resumen DTE'),
                  folio: `RESUMEN-${totalDocs}DOCS`,
                  rutEmisor: cleanCompanyRutWithDash,
                  razonSocialEmisor: companyName || 'EMPRESA EMISORA',
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
          const errTxt = await ventasRes.text();
          apiErrors.push(`Ventas (${ventasRes.status}): ${errTxt.slice(0, 120)}`);
        }
      } catch (errV: any) {
        apiErrors.push(`Ventas error: ${errV.message}`);
      }
    }

    // B. Compras
    if (tipo === 'ALL' || tipo === 'COMPRAS' || tipo === 'COMPRA') {
      try {
        const formDataCompras = new FormData();
        formDataCompras.append('input', JSON.stringify(rcvInputPayload));

        const comprasRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/compras/${formattedMonth}/${yearNum}`, {
          method: 'POST',
          headers,
          body: formDataCompras,
          signal: AbortSignal.timeout(60000)
        });

        if (comprasRes.ok) {
          const dataCompras: any = await comprasRes.json();
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
              razonSocialEmisor: item.razonSocial || item.razonSocialEmisor || item.razonSocialProveedor || 'PROVEEDOR DTE',
              rutReceptor: cleanCompanyRutWithDash,
              razonSocialReceptor: companyName || 'EMPRESA RECEPTORA',
              fechaEmision,
              montoNeto,
              montoIva,
              montoExento,
              montoTotal,
              period: `${yearNum}-${formattedMonth}`
            });
          }
        } else {
          const errTxt = await comprasRes.text();
          apiErrors.push(`Compras (${comprasRes.status}): ${errTxt.slice(0, 120)}`);
        }
      } catch (errC: any) {
        apiErrors.push(`Compras error: ${errC.message}`);
      }
    }

    // C. Boletas de Honorarios (BHR)
    if (tipo === 'ALL' || tipo === 'HONORARIOS' || tipo === 'HONORARIO') {
      try {
        const formDataBhr = new FormData();
        formDataBhr.append('input', JSON.stringify(rcvInputPayload));

        const bhrRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/honorarios/${formattedMonth}/${yearNum}`, {
          method: 'POST',
          headers,
          body: formDataBhr,
          signal: AbortSignal.timeout(60000)
        });

        if (bhrRes.ok) {
          const dataBhr: any = await bhrRes.json();
          const detalleBhr = dataBhr?.honorarios?.detalleHonorarios || dataBhr?.detalleHonorarios || [];
          for (const item of detalleBhr) {
            const folio = String(item.folio || '0');
            const fechaEmisionRaw = item.fechaEmision || item.fecha || `${yearNum}-${formattedMonth}-01`;
            const fechaEmision = fechaEmisionRaw.includes('T') ? fechaEmisionRaw.split('T')[0] : fechaEmisionRaw;
            const montoBruto = Number(item.montoBruto || item.bruto || 0);
            const retencion = Number(item.retencion || item.montoRetencion || 0);
            const montoLiquido = Number(item.montoLiquido || item.liquido || (montoBruto - retencion));

            docs.push({
              tipoRegistro: 'Honorario',
              tipoDocumento: 'BH',
              tipoDoc: 'BH',
              nombreTipoDoc: 'Boleta de Honorarios Electrónica',
              folio,
              rutEmisor: item.rutEmisor || item.rutPrestador || '12.345.678-9',
              razonSocialEmisor: item.razonSocialEmisor || item.nombrePrestador || 'PROFESIONAL INDEPENDIENTE',
              rutReceptor: cleanCompanyRutWithDash,
              razonSocialReceptor: companyName || 'EMPRESA RECEPTORA',
              fechaEmision,
              montoNeto: montoLiquido,
              montoIva: retencion,
              montoExento: 0,
              montoTotal: montoBruto,
              period: `${yearNum}-${formattedMonth}`
            });
          }
        }
      } catch (errH: any) {
        console.warn("Honorarios error:", errH);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      count: docs.length,
      documents: docs,
      source: 'SIMPLE_API_SII_LIVE',
      period: `${yearNum}-${formattedMonth}`,
      apiErrors: apiErrors.length > 0 ? apiErrors : undefined
    }));
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: `Error interno al procesar rescate SII: ${error.message}`
    }));
  }
}
