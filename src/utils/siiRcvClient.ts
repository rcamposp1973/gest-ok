export interface FetchRcvParams {
  companyRut: string;
  companyName: string;
  year: number;
  month: string;
  tipo?: string;
  rutRepresentante?: string;
  claveRepresentante?: string;
  claveCertificadoDigital?: string;
  certificadoB64?: string;
  apiKey?: string;
  provider?: string;
  ambiente?: string;
}

export interface FetchRcvResult {
  success: boolean;
  needsCertificate?: boolean;
  count?: number;
  documents?: any[];
  period?: string;
  error?: string;
  message?: string;
  source?: string;
}

const formatRutWithDash = (raw: string): string => {
  const clean = (raw || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (!clean || clean.length < 2) return clean;
  const bodyPart = clean.slice(0, -1);
  const dvPart = clean.slice(-1);
  return `${bodyPart}-${dvPart}`;
};

/**
 * Rescates RCV either through backend API or directly via client-side fallback
 * to ensure 100% functionality on static hostings like Vercel.
 */
export async function fetchRcvFromSii(params: FetchRcvParams): Promise<FetchRcvResult> {
  const {
    companyRut,
    companyName,
    year,
    month,
    tipo = 'ALL',
    rutRepresentante = '',
    claveRepresentante = '',
    claveCertificadoDigital = '',
    certificadoB64 = '',
    apiKey = '',
    ambiente = 'Producción'
  } = params;

  // 1. Try server backend endpoint first
  try {
    const response = await fetch('/api/sii/rescatar-rcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyRut,
        companyName,
        year,
        month,
        tipo,
        rutRepresentante,
        claveRepresentante,
        claveCertificadoDigital,
        certificadoB64,
        apiKey,
        provider: 'SIMPLE_API',
        ambiente
      })
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (response.ok && data.success) {
        return data;
      }
      // If the backend specifically reported needsCertificate or validation error, return it
      if (data.needsCertificate || (data.error && response.status !== 404 && response.status !== 405)) {
        return data;
      }
    }
    // If response was 405 or 404 (static hosting without serverless router), continue to direct client fallback
  } catch (backendErr) {
    console.warn('Backend API not reachable, falling back to direct SimpleAPI client connection...', backendErr);
  }

  // 2. Direct client-side connection to SimpleAPI Gateway (Bypasses HTTP 405 from static web servers)
  return fetchRcvDirectSimpleApi(params);
}

export async function fetchRcvDirectSimpleApi(params: FetchRcvParams): Promise<FetchRcvResult> {
  const {
    companyRut,
    companyName,
    year,
    month,
    tipo = 'ALL',
    rutRepresentante = '',
    claveRepresentante = '',
    claveCertificadoDigital = '',
    certificadoB64 = '',
    apiKey = '',
    ambiente = 'Producción'
  } = params;

  const cleanCompanyRut = formatRutWithDash(companyRut);
  const cleanRepRut = formatRutWithDash(rutRepresentante);

  const cleanCertB64 = (certificadoB64 || '').replace(/^data:[^;]+;base64,/, '').trim();
  const certPass = (claveCertificadoDigital || claveRepresentante || '').trim();
  const formattedMonth = String(month === 'ALL' ? '01' : month).padStart(2, '0');
  const yearNum = Number(year) || new Date().getFullYear();

  if (!cleanCertB64 || !certPass) {
    return {
      success: false,
      needsCertificate: true,
      error: `Para consultar automáticamente el RCV de ${cleanCompanyRut || 'la empresa'} desde el SII, se requiere cargar el Certificado Digital (.pfx) en la sección Facturador SII / Configuración.`
    };
  }

  // Master API Key stored in localStorage or default
  const masterKey = (typeof window !== 'undefined' && localStorage.getItem('gest_ok_master_api_key')) || '';
  const effectiveApiKey = (apiKey || masterKey || '5511-W960-6395-2355-3470').trim();

  const ambienteNum = (ambiente === 'SANDBOX' || ambiente === 'Certificación') ? 0 : 1;
  const headers = { 'Authorization': effectiveApiKey };

  const rcvInputPayload = {
    RutEmpresa: cleanCompanyRut,
    RutCertificado: cleanRepRut || cleanCompanyRut,
    Ambiente: ambienteNum,
    Password: certPass,
    CertificadoB64: cleanCertB64
  };

  const docs: any[] = [];
  const apiErrors: string[] = [];

  // A. Ventas
  if (tipo === 'ALL' || tipo === 'VENTAS' || tipo === 'VENTA') {
    try {
      const formDataVentas = new FormData();
      formDataVentas.append('input', JSON.stringify(rcvInputPayload));

      const ventasRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/ventas/${formattedMonth}/${yearNum}`, {
        method: 'POST',
        headers,
        body: formDataVentas
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

          // Normalize client RUT and Razon Social - ensure emitting company is NOT set as client
          const rawClientRut = (
            item.rutCliente ||
            item.rutReceptor ||
            item.rutRecep ||
            (item.rutRecep && item.dvRecep ? `${item.rutRecep}-${item.dvRecep}` : '') ||
            item.rutComprador ||
            (item.rut && formatRutWithDash(item.rut) !== cleanCompanyRut ? item.rut : '') ||
            ''
          );
          const clientRut = rawClientRut ? formatRutWithDash(rawClientRut) : '76.000.000-0';
          const clientName = (
            item.razonSocialReceptor ||
            item.razonSocialCliente ||
            item.rznSocRecep ||
            item.razonSocial ||
            item.rznSoc ||
            item.nombreReceptor ||
            item.cliente ||
            'CLIENTE FACTURA'
          );

          docs.push({
            tipoRegistro: 'Venta',
            tipoDocumento: tipoDte,
            tipoDoc: tipoDte,
            nombreTipoDoc: item.tipoDTEString || item.tipoDocString || (tipoDte === '33' ? 'Factura Electrónica' : tipoDte === '34' ? 'Factura Exenta' : tipoDte === '61' ? 'Nota de Crédito' : 'DTE Venta'),
            folio,
            rutEmisor: cleanCompanyRut,
            razonSocialEmisor: companyName || 'EMPRESA EMISORA',
            rutReceptor: clientRut,
            razonSocialReceptor: clientName,
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
                rutEmisor: cleanCompanyRut,
                razonSocialEmisor: companyName || 'EMPRESA EMISORA',
                rutReceptor: '66.666.666-6',
                razonSocialReceptor: `Clientes Varios (${totalDocs} Boletas)`,
                fechaEmision: `${yearNum}-${formattedMonth}-28`,
                montoNeto,
                montoIva,
                montoExento,
                montoTotal,
                period: `${yearNum}-${formattedMonth}`,
                isBoletaResumen: true,
                totalDocumentos: totalDocs
              });
            }
          }
        }
      } else {
        const errTxt = await ventasRes.text();
        apiErrors.push(`Ventas (${ventasRes.status}): ${errTxt.slice(0, 150)}`);
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
        body: formDataCompras
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
            rutReceptor: cleanCompanyRut,
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
        apiErrors.push(`Compras (${comprasRes.status}): ${errTxt.slice(0, 150)}`);
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
        body: formDataBhr
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
            rutReceptor: cleanCompanyRut,
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
      console.warn('Honorarios error:', errH);
    }
  }

  if (docs.length === 0 && apiErrors.length > 0) {
    return {
      success: false,
      error: `Error al conectar con el servicio del SII:\n\n${apiErrors.join('\n')}`
    };
  }

  return {
    success: true,
    count: docs.length,
    documents: docs,
    period: `${yearNum}-${formattedMonth}`,
    source: 'DIRECT_SIMPLE_API_CLIENT'
  };
}
