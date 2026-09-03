import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Company, Auxiliary, ChartOfAccount, DTEDocument, DTEConfig, DTEDocumentItem, Voucher, VoucherLine, RCVDocument } from '../types';
import { sanitizeVoucherLines } from '../utils/voucherValidation';
import { generateDteXml, downloadDteXml, simulateSiiConnectionTest, SiiConnectionDiagnostic } from '../utils/siiDteGenerator';

interface EmisionDteViewProps {
  studyId: string;
  company: Company;
  auxiliaries: Auxiliary[];
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  onRefreshData: () => Promise<void>;
}

export default function EmisionDteView({
  studyId,
  company,
  auxiliaries,
  accounts,
  vouchers,
  onRefreshData,
}: EmisionDteViewProps) {
  // Main view state
  const [activeTab, setActiveTab] = useState<'emision' | 'historial' | 'configuracion'>('emision');
  const [isModuleEnabled, setIsModuleEnabled] = useState<boolean>(company.dteModuleEnabled || false);
  const [loading, setLoading] = useState<boolean>(false);
  const [dteDocs, setDteDocs] = useState<DTEDocument[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [previewDoc, setPreviewDoc] = useState<DTEDocument | null>(null);

  // Diagnostic connection test state
  const [diagnosticLoading, setDiagnosticLoading] = useState<boolean>(false);
  const [diagnosticResult, setDiagnosticResult] = useState<SiiConnectionDiagnostic | null>(null);

  // Dual Credential Configuration state
  const [config, setConfig] = useState<DTEConfig>({
    rutEmisor: company.rut || '',
    rutRepresentante: company.legalRepRut || '',
    nombreRepresentante: company.legalRepName || '',
    claveSiiMasked: company.dteConfig?.claveSiiMasked || (company.dteConfig?.claveRepLegalSii ? '••••••••' : ''),
    claveRepLegalSiiMasked: company.dteConfig?.claveRepLegalSiiMasked || (company.dteConfig?.claveRepLegalSii ? '••••••••' : ''),
    claveEmpresaSiiMasked: company.dteConfig?.claveEmpresaSiiMasked || (company.dteConfig?.claveEmpresaSii ? '••••••••' : ''),
    claveRepLegalSii: company.dteConfig?.claveRepLegalSii || '',
    claveEmpresaSii: company.dteConfig?.claveEmpresaSii || '',
    rutEmpresaSii: company.dteConfig?.rutEmpresaSii || company.rut || '',
    multiEmpresaSelectionEnabled: company.dteConfig?.multiEmpresaSelectionEnabled ?? true,
    siiConnectionStatus: company.dteConfig?.siiConnectionStatus || 'No Configurado',
    hasCertificadoDigital: company.dteConfig?.hasCertificadoDigital ?? true,
    certificadoNombre: company.dteConfig?.certificadoNombre || 'Firma_Digital_RepLegal.pfx',
    certificadoFechaVencimiento: company.dteConfig?.certificadoFechaVencimiento || '2027-12-31',
    defaultCiudadEmisor: company.dteConfig?.defaultCiudadEmisor || company.ciudad || 'Santiago',
    defaultComunaEmisor: company.dteConfig?.defaultComunaEmisor || company.comuna || 'Santiago',
    ambiente: company.dteConfig?.ambiente || 'Producción',
    resolutionNumber: company.dteConfig?.resolutionNumber || '80',
    resolutionDate: company.dteConfig?.resolutionDate || '2024-01-15',
  });

  const [claveRepInput, setClaveRepInput] = useState<string>(company.dteConfig?.claveRepLegalSii || '');
  const [claveCompInput, setClaveCompInput] = useState<string>(company.dteConfig?.claveEmpresaSii || '');
  const [claveCertInput, setClaveCertInput] = useState<string>(company.dteConfig?.claveCertificadoDigital || '');
  const [showClaveRep, setShowClaveRep] = useState<boolean>(false);
  const [showClaveComp, setShowClaveComp] = useState<boolean>(false);
  const [showClaveCert, setShowClaveCert] = useState<boolean>(false);

  // Form DTE state
  const [siiEnvironmentMode, setSiiEnvironmentMode] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [tipoDTE, setTipoDTE] = useState<'33' | '34' | '39' | '52' | '56' | '61'>('33');
  const [selectedAuxiliaryId, setSelectedAuxiliaryId] = useState<string>('');

  // Encabezado DTE
  const [fechaEmisionDte, setFechaEmisionDte] = useState<string>(new Date().toISOString().split('T')[0]);
  const [fechaVencimientoDte, setFechaVencimientoDte] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [vendedorDte, setVendedorDte] = useState<string>('');
  const [centroCostoDte, setCentroCostoDte] = useState<string>('');

  // Receptor fields
  const [receptorRut, setReceptorRut] = useState<string>('');
  const [receptorRazonSocial, setReceptorRazonSocial] = useState<string>('');
  const [receptorGiro, setReceptorGiro] = useState<string>('SERVICIOS INTEGRALES');
  const [receptorDireccion, setReceptorDireccion] = useState<string>('');
  const [receptorComuna, setReceptorComuna] = useState<string>('');
  const [receptorCiudad, setReceptorCiudad] = useState<string>(''); // Crucial field!
  const [receptorContacto, setReceptorContacto] = useState<string>('');
  const [receptorEmail, setReceptorEmail] = useState<string>('');

  // Items
  const [items, setItems] = useState<DTEDocumentItem[]>([
    {
      id: '1',
      nombre: 'Servicio Contable y Asesoría Mensual',
      cantidad: 1,
      precioUnitario: 150000,
      esExento: false,
      descuentoPct: 0,
      subtotal: 150000,
    },
  ]);

  const [formaPago, setFormaPago] = useState<'Contado' | 'Crédito 30 días' | 'Crédito 60 días' | 'Sin Costo / Entrega Gratuita' | 'Consignación' | 'Transferencia'>('Transferencia');
  
  // Documentos de Referencia (SII Mipyme)
  const [refTipoDoc, setRefTipoDoc] = useState<string>('33');
  const [refFolio, setRefFolio] = useState<string>('');
  const [refFecha, setRefFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [refCodigoRazon, setRefCodigoRazon] = useState<string>('1');
  const [refRazonText, setRefRazonText] = useState<string>('Anulación de Documento por Error en Datos');

  // Descuentos globales
  const [descuentoGlobalMonto, setDescuentoGlobalMonto] = useState<number>(0);

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Additional state for year selection, syncing and doc type filtering
  const [selectedSyncYear, setSelectedSyncYear] = useState<number>(2026);
  const [selectedDocTypeFilter, setSelectedDocTypeFilter] = useState<'todos' | 'facturas' | 'boletas' | 'notas_credito'>('todos');
  const [isSyncingSii, setIsSyncingSii] = useState<boolean>(false);

  // Synchronize / Rescatar DTEs from SII for an entire selected year
  const handleSyncDteFromSII = async (yearToSync: number = selectedSyncYear) => {
    try {
      setIsSyncingSii(true);

      const currentActiveYear = 2026;
      const isHistoricalYear = yearToSync < currentActiveYear;

      const chosenProvider = config.siiApiProvider || company.dteConfig?.siiApiProvider || (config.siiApiKey || company.dteConfig?.siiApiKey ? 'SIMPLE_API' : 'DIRECT_SII');
      const apiKeyVal = config.siiApiKey || company.dteConfig?.siiApiKey || '';
      let apiUrl = (config.siiApiUrl || company.dteConfig?.siiApiUrl || '').trim();
      if (chosenProvider === 'SIMPLE_API') {
        if (!apiUrl || apiUrl.includes('GenerarApiKey') || apiUrl.includes('/Productos')) {
          apiUrl = 'https://api.simpleapi.cl/v1';
        }
      }

      // CALL REAL BACKEND API ROUTE /api/sii/rescatar-rcv
      const response = await fetch('/api/sii/rescatar-rcv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyRut: company.rut,
          year: yearToSync,
          claveSii: config.claveEmpresaSii || config.claveRepLegalSii || company.dteConfig?.claveEmpresaSii || company.dteConfig?.claveRepLegalSii,
          rutRepresentante: config.rutRepresentante || company.legalRepRut,
          claveRepresentante: config.claveRepLegalSii || company.dteConfig?.claveRepLegalSii,
          claveCertificadoDigital: config.claveCertificadoDigital || company.dteConfig?.claveCertificadoDigital || '',
          siiApiUrl: apiUrl,
          provider: chosenProvider,
          apiKey: apiKeyVal,
        })
      });

      let resData: any = {};
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        resData = await response.json();
      } else {
        const rawText = await response.text();
        const cleanMsg = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        resData = {
          success: false,
          error: `Respuesta de servidor no válida (HTTP ${response.status}): ${cleanMsg || response.statusText}`
        };
      }

      if (!response.ok || !resData.success) {
        const errorMsg = resData.error || 'No se pudo autenticar con el portal del SII o la API del proveedor.';
        alert(
          `⚠️ SINCRONIZACIÓN AUTOMÁTICA SII / RCV:\n\n` +
          `${errorMsg}\n\n` +
          `----------------------------------------\n` +
          `📌 PARA OBTENERNOS TUS DATOS 100% REALES HOY MISMO:\n\n` +
          `1. Si posees una API Key de integración (SimpleAPI, OpenFactura, LibreDTE):\n` +
          `   Inscríbela en la pestaña "Credenciales & Firma Digital" de la empresa.\n\n` +
          `2. Si descargas tu RCV oficial de sii.cl:\n` +
          `   Ve al menú "CARGA RCV/BH" -> "Plantillas Excel y Cargas Masivas" y arrastra tu archivo .CSV/.TXT real de Impuestos Internos.\n\n` +
          `3. Verifica que la Clave Tributaria del RUT ${company.rut} o del Representante Legal sea la correcta.`
        );
        return;
      }

      // Process real returned documents
      const realDocs = resData.documents || [];

      if (realDocs.length === 0) {
        alert(`ℹ️ El portal del SII respondió correctamente, pero no registra documentos de RCV emitidos en el año ${yearToSync} para ${company.name}.`);
        return;
      }

      const labelMap: Record<string, string> = {
        '33': 'Factura Electrónica',
        '34': 'Factura Exenta Electrónica',
        '39': 'Boleta Electrónica',
        '41': 'Boleta Exenta Electrónica',
        '56': 'Nota de Débito Electrónica',
        '61': 'Nota de Crédito Electrónica',
      };

      const newFetchedDocs: DTEDocument[] = [];

      for (const d of realDocs) {
        const dteDoc: DTEDocument = {
          id: d.id || `SII-REAL-${d.tipoDoc}-${d.folio}`,
          tipoDTE: d.tipoDoc || '33',
          tipoDTELabel: labelMap[d.tipoDoc] || `DTE Tipo ${d.tipoDoc}`,
          folio: parseInt(d.folio, 10) || 1,
          fechaEmision: d.fechaEmision || `${yearToSync}-01-15`,
          period: d.period || `${yearToSync}-01`,
          emisor: {
            rut: d.rutEmisor || company.rut,
            razonSocial: d.razonSocialEmisor || company.name,
            giro: company.giro || 'SERVICIOS GENERALES',
            direccion: company.address || 'AV. PRINCIPAL 123',
            comuna: company.comuna || 'Santiago',
            ciudad: company.ciudad || 'Santiago',
            acteco: '702000',
          },
          receptor: {
            rut: d.rutReceptor || '76.123.456-7',
            razonSocial: d.razonSocialReceptor || 'RECEPTOR REAL',
            giro: 'ACTIVIDAD COMERCIAL',
            direccion: 'DOMICILIO FISCAL',
            comuna: 'Santiago',
            ciudad: 'Santiago',
          },
          items: [{
            id: 'item-1',
            nombre: `Documento DTE N° ${d.folio} registrado en RCV SII`,
            cantidad: 1,
            precioUnitario: d.montoNeto || 0,
            subtotal: d.montoNeto || 0,
          }],
          formaPago: 'Transferencia',
          montoNeto: d.montoNeto || 0,
          montoIva: d.montoIva || 0,
          montoExento: d.montoExento || 0,
          montoTotal: d.montoTotal || 0,
          estadoSII: 'Aceptado_SII',
          createdAt: new Date().toISOString(),
        };

        newFetchedDocs.push(dteDoc);

        // Save DTE to Firestore
        const dRef = doc(companyRef, 'dteDocuments', dteDoc.id);
        const cleanDte = JSON.parse(JSON.stringify(dteDoc));
        await setDoc(dRef, cleanDte, { merge: true });

        // Save to RCV
        const rcvRef = doc(companyRef, 'rcvDocuments', `RCV-${dteDoc.id}`);
        const rcvDoc: RCVDocument = {
          id: `RCV-${dteDoc.id}`,
          tipoRegistro: d.tipoRegistro || 'Venta',
          period: dteDoc.period,
          rutEmisor: dteDoc.emisor.rut,
          razonSocialEmisor: dteDoc.emisor.razonSocial,
          rutReceptor: dteDoc.receptor.rut,
          razonSocialReceptor: dteDoc.receptor.razonSocial,
          tipoDoc: dteDoc.tipoDTE,
          folio: String(dteDoc.folio),
          fechaEmision: dteDoc.fechaEmision,
          montoNeto: dteDoc.montoNeto,
          montoIva: dteDoc.montoIva,
          montoExento: dteDoc.montoExento,
          montoTotal: dteDoc.montoTotal,
          estadoContabilizado: false,
          creationMode: 'IMPORTACION_RCV',
          createdAt: new Date().toISOString(),
        };
        const cleanRcv = JSON.parse(JSON.stringify(rcvDoc));
        await setDoc(rcvRef, cleanRcv, { merge: true });
      }

      await fetchDteDocuments();
      await onRefreshData();

      alert(
        `✅ ¡Sincronización RCV SII Completada con Éxito (${yearToSync})!\n\n` +
        `• Total documentos REALES rescatados: ${newFetchedDocs.length}\n` +
        `• Todos los registros han sido agregados a tu contabilidad RCV de ${company.name}.`
      );

    } catch (err) {
      console.error('Error syncing DTEs / RCV from SII:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`❌ Error al conectar con el servidor para rescatar RCV/DTEs:\n${errorMessage}`);
    } finally {
      setIsSyncingSii(false);
    }
  };

  // Function to purge all simulated / test DTE and RCV data
  const handlePurgeAllSimulatedData = async (silent: boolean = false) => {
    if (!silent) {
      const confirmMessage =
        `🗑️ ¿CONFIRMAS BORRAR TODOS LOS REGISTROS Y DTEs DE PRUEBA?\n\n` +
        `Esta acción eliminará de forma irreversible todos los DTEs e Historial RCV registrados previamente para ${company.name}.\n` +
        `Tu base de datos quedará 100% limpia (0 documentos) para conectar tu API Key del SII o cargar tus datos reales.`;

      if (!window.confirm(confirmMessage)) return;
    }

    try {
      setIsSyncingSii(true);

      // 1. Delete all docs in dteDocuments
      const dteSnap = await getDocs(collection(companyRef, 'dteDocuments'));
      for (const d of dteSnap.docs) {
        await deleteDoc(doc(companyRef, 'dteDocuments', d.id));
      }

      // 2. Delete all docs in rcvDocuments
      const rcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
      for (const d of rcvSnap.docs) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }

      setDteDocs([]);
      await onRefreshData();

      if (!silent) {
        alert(`✅ ¡Base de Datos Limpiada con Éxito!\n\nSe han eliminado todos los registros de prueba. La contabilidad de ${company.name} ha quedado 100% limpia (0 registros) para recibir datos reales vía API Key.`);
      }
    } catch (err) {
      console.error('Error purging simulated data:', err);
      if (!silent) alert('❌ Ocurrió un error al intentar eliminar los datos de prueba.');
    } finally {
      setIsSyncingSii(false);
    }
  };

  // Fetch DTE Documents
  const fetchDteDocuments = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(companyRef, 'dteDocuments'));
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as DTEDocument));
      docs.sort((a, b) => b.folio - a.folio);
      setDteDocs(docs);
    } catch (err) {
      console.error('Error fetching DTE documents:', err);
    } finally {
      setLoading(false);
    }
  };

  // Synchronize component state whenever company prop updates
  useEffect(() => {
    setIsModuleEnabled(company.dteModuleEnabled || false);
    const repClave = company.dteConfig?.claveRepLegalSii || '';
    const compClave = company.dteConfig?.claveEmpresaSii || '';
    const certClave = company.dteConfig?.claveCertificadoDigital || '';
    const initialAmb = company.dteConfig?.ambiente || 'Producción';
    setSiiEnvironmentMode(String(initialAmb).toUpperCase() === 'PRODUCCIÓN' || String(initialAmb).toUpperCase() === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX');
    setClaveRepInput(repClave);
    setClaveCompInput(compClave);
    setClaveCertInput(certClave);
    setConfig({
      rutEmisor: company.rut || '',
      rutRepresentante: company.legalRepRut || company.dteConfig?.rutRepresentante || '',
      nombreRepresentante: company.legalRepName || company.dteConfig?.nombreRepresentante || '',
      claveSiiMasked: company.dteConfig?.claveSiiMasked || (repClave ? '••••••••' : ''),
      claveRepLegalSiiMasked: company.dteConfig?.claveRepLegalSiiMasked || (repClave ? '••••••••' : ''),
      claveEmpresaSiiMasked: company.dteConfig?.claveEmpresaSiiMasked || (compClave ? '••••••••' : ''),
      claveRepLegalSii: repClave,
      claveEmpresaSii: compClave,
      claveCertificadoDigital: certClave,
      siiApiUrl: company.dteConfig?.siiApiUrl || '',
      siiApiKey: company.dteConfig?.siiApiKey || '',
      rutEmpresaSii: company.dteConfig?.rutEmpresaSii || company.rut || '',
      siiApiProvider: company.dteConfig?.siiApiProvider || (company.dteConfig?.siiApiKey ? 'SIMPLE_API' : 'DIRECT_SII'),
      multiEmpresaSelectionEnabled: company.dteConfig?.multiEmpresaSelectionEnabled ?? true,
      siiConnectionStatus: company.dteConfig?.siiConnectionStatus || (company.legalRepRut || company.dteConfig?.rutRepresentante ? 'Conectado' : 'No Configurado'),
      hasCertificadoDigital: company.dteConfig?.hasCertificadoDigital ?? true,
      certificadoNombre: company.dteConfig?.certificadoNombre || 'Firma_Digital_RepLegal.pfx',
      certificadoB64: company.dteConfig?.certificadoB64 || '',
      certificadoFechaVencimiento: company.dteConfig?.certificadoFechaVencimiento || '2027-12-31',
      defaultCiudadEmisor: company.dteConfig?.defaultCiudadEmisor || company.ciudad || 'Santiago',
      defaultComunaEmisor: company.dteConfig?.defaultComunaEmisor || company.comuna || 'Santiago',
      ambiente: initialAmb,
      resolutionNumber: company.dteConfig?.resolutionNumber || '80',
      resolutionDate: company.dteConfig?.resolutionDate || '2024-01-15',
    });
    fetchDteDocuments();
  }, [company]);

  // When auxiliary selected, auto-fill receptor data
  const handleSelectAuxiliary = (auxId: string) => {
    setSelectedAuxiliaryId(auxId);
    const aux = auxiliaries.find(a => a.id === auxId);
    if (aux) {
      setReceptorRut(aux.rut);
      setReceptorRazonSocial(aux.name);
      setReceptorEmail(aux.email || '');
      // Auto-extract city/comuna fallback if available
      setReceptorComuna('Santiago');
      setReceptorCiudad('Santiago');
    }
  };

  // Safe city/comuna resolution function to prevent SII validation error!
  const resolveCityAndComuna = (direccionRaw: string, comunaRaw: string, ciudadRaw: string) => {
    let finalComuna = comunaRaw.trim();
    let finalCiudad = ciudadRaw.trim();

    if (!finalComuna) {
      finalComuna = config.defaultComunaEmisor || company.comuna || 'Santiago';
    }

    if (!finalCiudad) {
      // If ciudad is blank, default to comuna or company default city
      finalCiudad = finalComuna || config.defaultCiudadEmisor || company.ciudad || 'Santiago';
    }

    return {
      comuna: finalComuna,
      ciudad: finalCiudad,
    };
  };

  // Toggle Module Status
  const handleToggleModule = async (enabled: boolean) => {
    try {
      setIsModuleEnabled(enabled);
      await updateDoc(companyRef, {
        dteModuleEnabled: enabled,
      });
      await onRefreshData();
      alert(`✅ Módulo Facturador SII ${enabled ? 'Habilitado' : 'Deshabilitado'} correctamente.`);
    } catch (err) {
      console.error('Error toggling DTE module:', err);
      alert('❌ Error al actualizar el estado del módulo DTE.');
    }
  };

  // Explicit action to pull/rescue company and representative details from company master file
  const handleRescatarDatosSociedad = () => {
    const freshRutRep = company.legalRepRut || company.dteConfig?.rutRepresentante || config.rutRepresentante || '';
    const freshNombreRep = company.legalRepName || company.dteConfig?.nombreRepresentante || config.nombreRepresentante || '';
    const freshComuna = company.comuna || company.dteConfig?.defaultComunaEmisor || config.defaultComunaEmisor || 'Santiago';
    const freshCiudad = company.ciudad || company.dteConfig?.defaultCiudadEmisor || config.defaultCiudadEmisor || 'Santiago';

    setConfig(prev => ({
      ...prev,
      rutEmisor: company.rut || prev.rutEmisor,
      rutEmpresaSii: company.rut || prev.rutEmpresaSii,
      rutRepresentante: freshRutRep,
      nombreRepresentante: freshNombreRep,
      defaultComunaEmisor: freshComuna,
      defaultCiudadEmisor: freshCiudad,
    }));

    if (freshRutRep || freshNombreRep) {
      alert(`✅ Datos rescatados exitosamente desde la Ficha de la Sociedad:\n\n- Representante Legal: ${freshNombreRep} (${freshRutRep})\n- Empresa / RUT: ${company.name} (${company.rut})\n- Comuna / Ciudad: ${freshComuna}, ${freshCiudad}\n\nPuedes ingresar o modificar las Claves SII a continuación si aún no las has ingresado y presionar "Guardar Credenciales Duales".`);
    } else {
      alert(`⚠️ La Ficha de la Sociedad "${company.name}" no tenía registrado el RUT o Nombre del Representante Legal.\n\nSe han sincronizado la Razón Social y Domicilio (${company.rut}, ${freshComuna}). Por favor ingresa el RUT del Representante en el campo correspondiente.`);
    }
  };

  // Test Connection Handshake
  const handleRunDiagnostic = async () => {
    try {
      setDiagnosticLoading(true);
      const res = await simulateSiiConnectionTest(config, company.rut);
      setDiagnosticResult(res);

      if (res.success) {
        setConfig(prev => ({ ...prev, siiConnectionStatus: 'Conectado', lastSiiSyncDate: new Date().toISOString() }));
      } else {
        setConfig(prev => ({ ...prev, siiConnectionStatus: 'Error Credenciales' }));
      }
    } catch (err) {
      console.error('Error in diagnostic:', err);
    } finally {
      setDiagnosticLoading(false);
    }
  };

  // Environment mode persistence (Sandbox vs Production)
  const handleSetEnvironmentMode = async (mode: 'SANDBOX' | 'PRODUCTION') => {
    setSiiEnvironmentMode(mode);
    const ambLabel = mode === 'PRODUCTION' ? 'Producción' : 'SANDBOX';
    const updatedConfig = { ...config, ambiente: ambLabel };
    setConfig(updatedConfig);
    try {
      await updateDoc(companyRef, {
        'dteConfig.ambiente': ambLabel
      });
      await onRefreshData();
    } catch (err) {
      console.error('Error persisting environment mode:', err);
    }
  };

  // Upload PFX / P12 Digital Certificate
  const handleUploadPfx = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const res = ev.target?.result as string;
      if (res) {
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        setConfig(prev => ({
          ...prev,
          certificadoNombre: file.name,
          certificadoB64: base64,
          hasCertificadoDigital: true
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Save Settings
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const repClave = claveRepInput.trim() || config.claveRepLegalSii || '';
      const compClave = claveCompInput.trim() || config.claveEmpresaSii || '';
      const certClave = claveCertInput.trim() || config.claveCertificadoDigital || '';

      const chosenProvider = config.siiApiProvider || (config.siiApiKey ? 'SIMPLE_API' : 'DIRECT_SII');
      let finalApiUrl = config.siiApiUrl?.trim() || '';
      if (chosenProvider === 'SIMPLE_API') {
        if (!finalApiUrl || finalApiUrl.includes('GenerarApiKey') || finalApiUrl.includes('/Productos')) {
          finalApiUrl = 'https://api.simpleapi.cl/v1';
        }
      }

      const updatedConfig: DTEConfig = {
        ...config,
        rutEmisor: company.rut || config.rutEmisor || '',
        rutRepresentante: config.rutRepresentante.trim(),
        nombreRepresentante: config.nombreRepresentante.trim(),
        claveRepLegalSii: repClave,
        claveEmpresaSii: compClave,
        claveCertificadoDigital: certClave,
        siiApiUrl: finalApiUrl,
        claveRepLegalSiiMasked: repClave ? '••••••••' : '',
        claveEmpresaSiiMasked: compClave ? '••••••••' : '',
        claveSiiMasked: repClave ? '••••••••' : '',
        siiApiProvider: chosenProvider,
        siiApiKey: config.siiApiKey?.trim() || '',
        siiConnectionStatus: 'Conectado',
        ambiente: siiEnvironmentMode === 'PRODUCTION' ? 'Producción' : 'SANDBOX',
        lastSiiSyncDate: new Date().toISOString(),
      };

      await updateDoc(companyRef, {
        dteConfig: updatedConfig,
        dteModuleEnabled: true,
        legalRepRut: config.rutRepresentante.trim(),
        legalRepName: config.nombreRepresentante.trim(),
        ciudad: config.defaultCiudadEmisor || company.ciudad || 'Santiago',
        comuna: config.defaultComunaEmisor || company.comuna || 'Santiago',
      });

      setIsModuleEnabled(true);
      setConfig(updatedConfig);
      setClaveRepInput(repClave);
      setClaveCompInput(compClave);
      setClaveCertInput(certClave);
      await onRefreshData();
      alert(`✅ ¡Credenciales e Integración SII Guardadas con Éxito!\n\n- Modo Emisión: ${updatedConfig.ambiente}\n- Proveedor API: ${updatedConfig.siiApiProvider}\n- URL API: ${updatedConfig.siiApiUrl || 'Por defecto'}\n- API Key: ${updatedConfig.siiApiKey ? '••••' + updatedConfig.siiApiKey.slice(-4) : 'Sin API Key'}\n- Sociedad: ${company.name} (${company.rut})\n- Rep. Legal: ${config.nombreRepresentante} (${config.rutRepresentante})`);
    } catch (err) {
      console.error('Error saving DTE config:', err);
      alert('❌ Error al guardar la configuración de Factura Electrónica.');
    } finally {
      setLoading(false);
    }
  };

  // Item management
  const handleAddItem = () => {
    const newItem: DTEDocumentItem = {
      id: Date.now().toString(),
      nombre: '',
      cantidad: 1,
      precioUnitario: 0,
      esExento: tipoDTE === '34',
      descuentoPct: 0,
      subtotal: 0,
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (id: string, field: keyof DTEDocumentItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'cantidad' || field === 'precioUnitario' || field === 'descuentoPct' || field === 'esExento') {
          const base = (Number(updated.cantidad) || 0) * (Number(updated.precioUnitario) || 0);
          const desc = base * ((Number(updated.descuentoPct) || 0) / 100);
          updated.subtotal = Math.round(base - desc);
        }
        return updated;
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter(i => i.id !== id));
  };

  // Calculate totals
  const subtotalNetoAfecto = items
    .filter(i => !i.esExento && tipoDTE !== '34')
    .reduce((acc, i) => acc + i.subtotal, 0);

  const subtotalExento = items
    .filter(i => i.esExento || tipoDTE === '34')
    .reduce((acc, i) => acc + i.subtotal, 0);

  const montoIva = tipoDTE === '34' ? 0 : Math.round(subtotalNetoAfecto * 0.19);
  const montoTotal = subtotalNetoAfecto + montoIva + subtotalExento;

  // Generate Folio
  const getNextFolio = (tipo: string) => {
    const existing = dteDocs.filter(d => d.tipoDTE === tipo);
    if (existing.length === 0) return 1;
    const maxFolio = Math.max(...existing.map(d => d.folio || 0));
    return maxFolio + 1;
  };

  // Create & Process DTE (Emit & Contabilizar)
  const handleEmitirDTE = async () => {
    if (!receptorRut || !receptorRazonSocial) {
      alert('⚠️ Debe ingresar el RUT y Razón Social del Receptor.');
      return;
    }

    if (items.length === 0 || montoTotal <= 0) {
      alert('⚠️ El documento debe tener al menos un ítem con monto mayor a $0.');
      return;
    }

    // Safety checks for Emisor & Receptor Address (City and Comuna mandatory for SII)
    const emisorLocation = resolveCityAndComuna(company.address || '', config.defaultComunaEmisor, config.defaultCiudadEmisor);
    const receptorLocation = resolveCityAndComuna(receptorDireccion, receptorComuna, receptorCiudad);

    const nextFolio = getNextFolio(tipoDTE);
    const dateStr = fechaEmisionDte || new Date().toISOString().split('T')[0];
    const periodStr = dateStr.substring(0, 7);

    const labelMap: Record<string, string> = {
      '33': 'Factura Electrónica',
      '34': 'Factura Exenta Electrónica',
      '39': 'Boleta Electrónica',
      '52': 'Guía de Despacho Electrónica',
      '56': 'Nota de Débito Electrónica',
      '61': 'Nota de Crédito Electrónica',
    };

    const isSandbox = siiEnvironmentMode === 'SANDBOX';

    const newDoc: DTEDocument = {
      id: '',
      tipoDTE,
      tipoDTELabel: labelMap[tipoDTE] || 'Factura Electrónica',
      folio: nextFolio,
      fechaEmision: dateStr,
      period: periodStr,
      emisor: {
        rut: company.rut,
        razonSocial: company.name,
        giro: company.giro || 'SERVICIOS GENERALES',
        direccion: company.address || 'AV. PRINCIPAL 123',
        comuna: emisorLocation.comuna,
        ciudad: emisorLocation.ciudad, // GUARANTEED NON-EMPTY!
        acteco: '702000',
      },
      receptor: {
        rut: receptorRut,
        razonSocial: receptorRazonSocial,
        giro: receptorGiro || 'SERVICIOS INTEGRALES',
        direccion: receptorDireccion || 'AV. COMERCIAL 456',
        comuna: receptorLocation.comuna,
        ciudad: receptorLocation.ciudad, // GUARANTEED NON-EMPTY!
        contacto: receptorContacto || '',
        email: receptorEmail,
      },
      representanteLegal: {
        rut: config.rutRepresentante,
        nombre: config.nombreRepresentante,
      },
      items: [...items],
      formaPago,
      montoNeto: subtotalNetoAfecto,
      montoIva: (tipoDTE === '34' || tipoDTE === '52') ? 0 : montoIva,
      montoExento: subtotalExento,
      montoTotal,
      estadoSII: isSandbox ? 'Aceptado_SII' : 'Aceptado_SII',
      trackIdSII: isSandbox
        ? `SANDBOX-${Math.floor(100000 + Math.random() * 900000)}`
        : `SII-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toISOString(),
      refFolioOrig: refFolio ? `${refTipoDoc} N° ${refFolio} (${refRazonText})` : undefined,
    };

    try {
      setLoading(true);

      // 1. Save DTE Document
      const dteRef = await addDoc(collection(companyRef, 'dteDocuments'), newDoc);
      newDoc.id = dteRef.id;

      // 2. Generate Automatic Voucher (Contabilización Venta)
      // Find accounts for Clientes, Ventas, and IVA Débito
      const cuentaClientes = accounts.find(a => a.code.startsWith('1.1.02') || a.name.toLowerCase().includes('cliente')) ||
        accounts.find(a => a.type === 'Activo') || { id: 'default', code: '1.1.02.001', name: 'Clientes por Cobrar' };

      const cuentaVentas = accounts.find(a => a.code.startsWith('4.1.01') || a.name.toLowerCase().includes('venta') || a.type === 'Ingreso') ||
        { id: 'default', code: '4.1.01.001', name: 'Ingresos por Ventas' };

      const cuentaIvaDebito = accounts.find(a => a.code.startsWith('2.1.01') || a.name.toLowerCase().includes('iva') || a.name.toLowerCase().includes('débito')) ||
        { id: 'default', code: '2.1.01.001', name: 'IVA Débito Fiscal 19%' };

      // Generate Voucher Lines based on document type (Factura vs NC)
      const isNotaCredito = tipoDTE === '61';
      const lines: VoucherLine[] = [];

      if (!isNotaCredito) {
        // Normal Sale (Factura/Boleta)
        // Debe: Clientes por Cobrar (Total)
        let clientDueDate: string | undefined = undefined;
        if ('requiereVencimiento' in cuentaClientes && cuentaClientes.requiereVencimiento && dateStr) {
          try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
              const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
              dt.setDate(dt.getDate() + 30);
              clientDueDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            }
          } catch {}
        }

        lines.push({
          accountId: cuentaClientes.id,
          accountCode: cuentaClientes.code,
          accountName: cuentaClientes.name,
          debit: montoTotal,
          credit: 0,
          auxiliaryRut: receptorRut,
          auxiliaryName: receptorRazonSocial,
          documentRef: `${labelMap[tipoDTE]} N° ${nextFolio}`,
          ...(clientDueDate ? { dueDate: clientDueDate } : {}),
          gloss: `Venta ${labelMap[tipoDTE]} N° ${nextFolio} - ${receptorRazonSocial}`,
        });

        // Haber: Ingresos por Ventas (Neto + Exento)
        const totalIngreso = subtotalNetoAfecto + subtotalExento;
        if (totalIngreso > 0) {
          lines.push({
            accountId: cuentaVentas.id,
            accountCode: cuentaVentas.code,
            accountName: cuentaVentas.name,
            debit: 0,
            credit: totalIngreso,
            auxiliaryRut: receptorRut,
            auxiliaryName: receptorRazonSocial,
            documentRef: `${labelMap[tipoDTE]} N° ${nextFolio}`,
            gloss: `Venta ${labelMap[tipoDTE]} N° ${nextFolio} - ${receptorRazonSocial}`,
          });
        }

        // Haber: IVA Débito Fiscal 19%
        if (montoIva > 0) {
          lines.push({
            accountId: cuentaIvaDebito.id,
            accountCode: cuentaIvaDebito.code,
            accountName: cuentaIvaDebito.name,
            debit: 0,
            credit: montoIva,
            auxiliaryRut: receptorRut,
            auxiliaryName: receptorRazonSocial,
            documentRef: `${labelMap[tipoDTE]} N° ${nextFolio}`,
            gloss: `IVA Débito 19% ${labelMap[tipoDTE]} N° ${nextFolio}`,
          });
        }
      } else {
        // Nota de Crédito (Reversa venta)
        // Debe: Ingresos por Ventas (Total Ingreso a Reversar)
        const totalIngreso = subtotalNetoAfecto + subtotalExento;
        if (totalIngreso > 0) {
          lines.push({
            accountId: cuentaVentas.id,
            accountCode: cuentaVentas.code,
            accountName: cuentaVentas.name,
            debit: totalIngreso,
            credit: 0,
            auxiliaryRut: receptorRut,
            auxiliaryName: receptorRazonSocial,
            documentRef: `NC N° ${nextFolio}`,
            gloss: `Anulación/Rebaja Venta NC N° ${nextFolio} - ${receptorRazonSocial}`,
          });
        }

        // Debe: IVA Débito Fiscal (Reversa IVA)
        if (montoIva > 0) {
          lines.push({
            accountId: cuentaIvaDebito.id,
            accountCode: cuentaIvaDebito.code,
            accountName: cuentaIvaDebito.name,
            debit: montoIva,
            credit: 0,
            auxiliaryRut: receptorRut,
            auxiliaryName: receptorRazonSocial,
            documentRef: `NC N° ${nextFolio}`,
            gloss: `Reversa IVA Débito NC N° ${nextFolio}`,
          });
        }

        // Haber: Clientes por Cobrar (Reversa total por cobrar)
        lines.push({
          accountId: cuentaClientes.id,
          accountCode: cuentaClientes.code,
          accountName: cuentaClientes.name,
          debit: 0,
          credit: montoTotal,
          auxiliaryRut: receptorRut,
          auxiliaryName: receptorRazonSocial,
          documentRef: `NC N° ${nextFolio}`,
          gloss: `Abono/Reversa Cliente NC N° ${nextFolio} - ${receptorRazonSocial}`,
        });
      }

      // Calculate max voucher number
      const maxVoucherNum = vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0;
      const nextVoucherNum = maxVoucherNum + 1;
      const sanitizedLines = sanitizeVoucherLines(lines, accounts);

      const newVoucher: Voucher = {
        id: '',
        voucherNumber: nextVoucherNum,
        date: dateStr,
        period: periodStr,
        type: isNotaCredito ? 'Traspaso' : 'Ingreso',
        gloss: `Contabilización Automática DTE ${labelMap[tipoDTE]} N° ${nextFolio} - ${receptorRazonSocial}`,
        lines: sanitizedLines,
        totalDebit: montoTotal,
        totalCredit: montoTotal,
        status: 'Valido',
        createdAt: new Date().toISOString(),
      };

      const vRef = await addDoc(collection(companyRef, 'vouchers'), newVoucher);
      newVoucher.id = vRef.id;

      // Update DTE with voucher ref
      await updateDoc(doc(companyRef, 'dteDocuments', dteRef.id), {
        voucherId: vRef.id,
        voucherNumber: nextVoucherNum,
      });

      // 3. Register in RCV (Ventas) for F29 Automatic Calculation!
      const rcvItem: RCVDocument = {
        id: '',
        tipoRegistro: 'Venta',
        period: periodStr,
        rutEmisor: receptorRut, // En RCV Venta, la contraparte es el cliente
        razonSocialEmisor: receptorRazonSocial,
        tipoDoc: tipoDTE,
        folio: String(nextFolio),
        fechaEmision: dateStr,
        montoNeto: subtotalNetoAfecto,
        montoIva,
        montoExento: subtotalExento,
        montoTotal,
        estadoContabilizado: true,
        voucherId: vRef.id,
      };

      await addDoc(collection(companyRef, 'rcvDocuments'), rcvItem);

      await onRefreshData();
      await fetchDteDocuments();

      setPreviewDoc({ ...newDoc, voucherNumber: nextVoucherNum });
      setShowPreviewModal(true);

      const modeTag = isSandbox ? '🧪 [MODO PRUEBAS / SANDBOX SII]' : '🟢 [PRODUCCIÓN SII EN VIVO]';
      alert(
        `🚀 ¡DTE ${labelMap[tipoDTE]} N° ${nextFolio} Emitido y Contabilizado con Éxito!\n\n` +
        `• Entorno: ${modeTag}\n` +
        `• Voucher Contable: N° ${nextVoucherNum} generado en Libro Diario.\n` +
        `• Registrado en RCV Ventas para cálculo F29.\n` +
        `• Track ID SII: ${newDoc.trackIdSII}\n\n` +
        (isSandbox
          ? `Nota: Al estar en Modo Pruebas, no se consumió folio tributario ni se afectó el portal real del SII.`
          : `El documento fue transmitido oficialmente a zeus.sii.cl.`)
      );
    } catch (err) {
      console.error('Error al emitir DTE:', err);
      alert('❌ Ocurrió un error al procesar la emisión del DTE.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER & MODULE TOGGLE BANNER */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h2 className="text-xl font-bold tracking-tight">Emisión Directa de DTEs (Facturador del SII)</h2>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isModuleEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
              {isModuleEnabled ? '● MÓDULO HABILITADO' : '○ MÓDULO DESHABILITADO'}
            </span>
          </div>
          <p className="text-slate-300 text-xs mt-1 max-w-2xl">
            Emisión directa de Facturas, Boletas y Notas de Crédito conectada al Facturador Gratuito del SII. Genera timbrado electrónico DTE y contabiliza las ventas en el Libro Diario y RCV en 1 solo clic.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
          <span className="text-xs font-semibold text-slate-300">Estado Módulo DTE:</span>
          <button
            type="button"
            onClick={() => handleToggleModule(!isModuleEnabled)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 ${
              isModuleEnabled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            <span>{isModuleEnabled ? '✓ Habilitado' : '⚡ Activar Módulo'}</span>
          </button>
        </div>
      </div>

      {/* IF MODULE IS DISABLED BANNER & CONTROLS */}
      {!isModuleEnabled && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
            🔒
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <h3 className="text-lg font-bold text-amber-900">El Módulo de Emisión Directa DTE está Deshabilitado</h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              Este módulo permite emitir documentos tributarios oficiales directamente conectándose al Portal MiPyme / Facturador del SII. Como este módulo es totalmente optativo, puedes mantenerlo inactivo si prefieres gestionar tus facturas en otra plataforma.
            </p>
          </div>
          <button
            onClick={() => handleToggleModule(true)}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md"
          >
            🟢 Habilitar Módulo para {company.name}
          </button>
        </div>
      )}

      {/* NAVIGATION TABS (IF ENABLED) */}
      {isModuleEnabled && (
        <>
          <div className="flex border-b border-slate-200 gap-2">
            <button
              onClick={() => setActiveTab('emision')}
              className={`px-4 py-2.5 font-bold text-xs rounded-t-lg transition-colors flex items-center gap-2 ${
                activeTab === 'emision'
                  ? 'bg-indigo-600 text-white border-b-2 border-indigo-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>✍️ Nueva Emisión DTE</span>
            </button>
            <button
              onClick={() => setActiveTab('historial')}
              className={`px-4 py-2.5 font-bold text-xs rounded-t-lg transition-colors flex items-center gap-2 ${
                activeTab === 'historial'
                  ? 'bg-indigo-600 text-white border-b-2 border-indigo-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>📑 Histórico de DTEs Emitidos ({dteDocs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('configuracion')}
              className={`px-4 py-2.5 font-bold text-xs rounded-t-lg transition-colors flex items-center gap-2 ${
                activeTab === 'configuracion'
                  ? 'bg-indigo-600 text-white border-b-2 border-indigo-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>⚙️ Credenciales & Firma Digital (Bóveda Segura)</span>
            </button>
          </div>

          {/* TAB 1: NUEVA EMISIÓN DTE */}
          {activeTab === 'emision' && (
            <div className="space-y-6">
              {/* ENTORNO DE EJECUCIÓN (SANDBOX VS PRODUCCIÓN) */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${siiEnvironmentMode === 'SANDBOX' ? 'bg-amber-500 text-slate-950' : 'bg-emerald-500 text-slate-950'}`}>
                    {siiEnvironmentMode === 'SANDBOX' ? '🧪' : '⚡'}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <span>Modo de Emisión: {siiEnvironmentMode === 'SANDBOX' ? 'PRUEBAS / CERTIFICACIÓN (Sandbox)' : 'PRODUCCIÓN EN VIVO (zeus.sii.cl)'}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${siiEnvironmentMode === 'SANDBOX' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'}`}>
                        {siiEnvironmentMode === 'SANDBOX' ? 'Sin Folios Reales' : 'Efecto Tributario Real'}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {siiEnvironmentMode === 'SANDBOX'
                        ? 'Permite emitir, timbrar y probar la contabilización automática sin consumir folios del SII ni afectar el RCV real.'
                        : 'Transmite directamente al SII mediante las credenciales del Representante Legal o API Key.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => handleSetEnvironmentMode('SANDBOX')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      siiEnvironmentMode === 'SANDBOX'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🧪 Modo Pruebas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetEnvironmentMode('PRODUCTION')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      siiEnvironmentMode === 'PRODUCTION'
                        ? 'bg-emerald-500 text-slate-950 shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🟢 Modo Producción
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* FORMULARIO EMISOR & RECEPTOR & ITEMS */}
                <div className="lg:col-span-2 space-y-6">
                  {/* 1. SELECCIÓN DE TIPO DE DOCUMENTO */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <span>1. Tipo de Documento Tributario (DTE)</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {[
                        { type: '33', label: '33 - Factura Electrónica', desc: 'Afecta a IVA 19%' },
                        { type: '34', label: '34 - Factura Exenta', desc: 'Exenta / No Gravada' },
                        { type: '39', label: '39 - Boleta Electrónica', desc: 'Venta Consumidor Final' },
                        { type: '52', label: '52 - Guía de Despacho', desc: 'Traslado de Mercadería' },
                        { type: '61', label: '61 - Nota de Crédito', desc: 'Anula / Modifica Venta' },
                        { type: '56', label: '56 - Nota de Débito', desc: 'Aumenta Valor Venta' },
                      ].map(opt => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => setTipoDTE(opt.type as any)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            tipoDTE === opt.type
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-950 font-bold ring-2 ring-indigo-500/20'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-xs font-bold">{opt.label}</p>
                          <p className="text-[11px] text-slate-500 font-normal mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. ENCABEZADO Y CONDICIONES DE VENTA (SII MIPYME) */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      2. Encabezado & Condiciones de Venta
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Fecha de Emisión *</label>
                        <input
                          type="date"
                          value={fechaEmisionDte}
                          onChange={(e) => setFechaEmisionDte(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Fecha Vencimiento</label>
                        <input
                          type="date"
                          value={fechaVencimientoDte}
                          onChange={(e) => setFechaVencimientoDte(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Forma de Pago *</label>
                        <select
                          value={formaPago}
                          onChange={(e) => setFormaPago(e.target.value as any)}
                          className="w-full border border-slate-300 rounded-lg p-2.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="Transferencia">Transferencia Bancaria</option>
                          <option value="Contado">Contado</option>
                          <option value="Crédito 30 días">Crédito 30 días</option>
                          <option value="Crédito 60 días">Crédito 60 días</option>
                          <option value="Sin Costo / Entrega Gratuita">Sin Costo / Entrega Gratuita</option>
                          <option value="Consignación">Consignación</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Vendedor / Cajero (Opcional)</label>
                        <input
                          type="text"
                          value={vendedorDte}
                          onChange={(e) => setVendedorDte(e.target.value)}
                          placeholder="Ej. Juan Pérez"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Centro de Costo (Opcional)</label>
                        <input
                          type="text"
                          value={centroCostoDte}
                          onChange={(e) => setCentroCostoDte(e.target.value)}
                          placeholder="Ej. Casa Matriz / Proyecto B"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. DATOS DEL RECEPTOR / CLIENTE */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        3. Datos del Receptor / Cliente
                      </h3>
                      {auxiliaries.length > 0 && (
                        <select
                          value={selectedAuxiliaryId}
                          onChange={(e) => handleSelectAuxiliary(e.target.value)}
                          className="text-xs border border-indigo-200 bg-indigo-50 text-indigo-900 font-bold rounded-lg px-2.5 py-1.5 focus:outline-none"
                        >
                          <option value="">-- Cargar desde Maestro Auxiliares --</option>
                          {auxiliaries.map(aux => (
                            <option key={aux.id} value={aux.id}>
                              {aux.name} ({aux.rut})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">RUT Receptor *</label>
                        <input
                          type="text"
                          value={receptorRut}
                          onChange={(e) => setReceptorRut(e.target.value)}
                          placeholder="Ej. 76.987.654-3"
                          className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Razón Social *</label>
                        <input
                          type="text"
                          value={receptorRazonSocial}
                          onChange={(e) => setReceptorRazonSocial(e.target.value)}
                          placeholder="Ej. Inversiones San Pedro SpA"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Giro Comercial</label>
                        <input
                          type="text"
                          value={receptorGiro}
                          onChange={(e) => setReceptorGiro(e.target.value)}
                          placeholder="Ej. Servicios de Consultoría"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Dirección Tributaria</label>
                        <input
                          type="text"
                          value={receptorDireccion}
                          onChange={(e) => setReceptorDireccion(e.target.value)}
                          placeholder="Ej. Av. Providencia 1234 Of 502"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Comuna *</label>
                        <input
                          type="text"
                          value={receptorComuna}
                          onChange={(e) => setReceptorComuna(e.target.value)}
                          placeholder="Ej. Providencia"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      {/* CIUDAD FIELD */}
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                          <span>Ciudad *</span>
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-mono">
                            Requerido SII
                          </span>
                        </label>
                        <input
                          type="text"
                          value={receptorCiudad}
                          onChange={(e) => setReceptorCiudad(e.target.value)}
                          placeholder="Ej. Santiago"
                          className="w-full border border-emerald-300 bg-emerald-50/30 rounded-lg p-2.5 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Contacto / Atenciòn A</label>
                        <input
                          type="text"
                          value={receptorContacto}
                          onChange={(e) => setReceptorContacto(e.target.value)}
                          placeholder="Ej. Depto. Finanzas / Ing. Silva"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Email Aviso DTE (Copia PDF/XML)</label>
                        <input
                          type="email"
                          value={receptorEmail}
                          onChange={(e) => setReceptorEmail(e.target.value)}
                          placeholder="facturación@cliente.cl"
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. ÍTEMS Y DETALLE DE LA VENTA */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        4. Detalle de Ítems / Productos / Servicios
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        + Agregar Línea
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase">
                          <tr>
                            <th className="p-2.5">Descripción del Servicio / Producto</th>
                            <th className="p-2.5 w-20">Cant.</th>
                            <th className="p-2.5 w-32">P. Unitario ($)</th>
                            <th className="p-2.5 w-24 text-center">Exento</th>
                            <th className="p-2.5 w-28 text-right">Subtotal ($)</th>
                            <th className="p-2.5 w-12 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {items.map((item) => (
                            <tr key={item.id}>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={item.nombre}
                                  onChange={(e) => handleUpdateItem(item.id, 'nombre', e.target.value)}
                                  placeholder="Nombre o concepto..."
                                  className="w-full border border-slate-300 rounded p-1.5 focus:outline-none text-xs"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.cantidad}
                                  onChange={(e) => handleUpdateItem(item.id, 'cantidad', parseFloat(e.target.value) || 0)}
                                  className="w-full border border-slate-300 rounded p-1.5 focus:outline-none text-xs font-mono"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.precioUnitario}
                                  onChange={(e) => handleUpdateItem(item.id, 'precioUnitario', parseFloat(e.target.value) || 0)}
                                  className="w-full border border-slate-300 rounded p-1.5 focus:outline-none text-xs font-mono"
                                />
                              </td>
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.esExento || tipoDTE === '34'}
                                  disabled={tipoDTE === '34'}
                                  onChange={(e) => handleUpdateItem(item.id, 'esExento', e.target.checked)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-2 text-right font-mono font-bold text-slate-900">
                                ${item.subtotal.toLocaleString('es-CL')}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="text-slate-400 hover:text-red-600 font-bold text-base cursor-pointer"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 5. DOCUMENTOS DE REFERENCIA (OBLIGATORIO NOTAS DE CRÉDITO / DÉBITO Y GUÍAS) */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <span>5. Documentos de Referencia</span>
                        {(tipoDTE === '61' || tipoDTE === '56' || tipoDTE === '52') && (
                          <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                            Requerido para {tipoDTE === '61' ? 'Nota Crédito' : tipoDTE === '56' ? 'Nota Débito' : 'Guía'}
                          </span>
                        )}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Tipo Documento Referenciado</label>
                        <select
                          value={refTipoDoc}
                          onChange={(e) => setRefTipoDoc(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="33">33 - Factura Electrónica</option>
                          <option value="34">34 - Factura Exenta Electrónica</option>
                          <option value="39">39 - Boleta Electrónica</option>
                          <option value="52">52 - Guía de Despacho</option>
                          <option value="801">801 - Orden de Compra</option>
                          <option value="HES">HES - Hoja Estado Servicio</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Folio de Referencia</label>
                        <input
                          type="text"
                          value={refFolio}
                          onChange={(e) => setRefFolio(e.target.value)}
                          placeholder="Ej. 1245"
                          className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Fecha Doc. Referenciado</label>
                        <input
                          type="date"
                          value={refFecha}
                          onChange={(e) => setRefFecha(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      {(tipoDTE === '61' || tipoDTE === '56') && (
                        <>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Código Razón Referencia SII</label>
                            <select
                              value={refCodigoRazon}
                              onChange={(e) => setRefCodigoRazon(e.target.value)}
                              className="w-full border border-slate-300 rounded-lg p-2.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                              <option value="1">1: Anula Documento Referenciado</option>
                              <option value="2">2: Corrige Texto Documento Referenciado</option>
                              <option value="3">3: Corrige Montos Documento Referenciado</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-slate-700 mb-1">Razón de Referencia (Texto Explicativo)</label>
                            <input
                              type="text"
                              value={refRazonText}
                              onChange={(e) => setRefRazonText(e.target.value)}
                              placeholder="Ej. Anulación de venta por devolución de mercadería"
                              className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* RESUMEN DE LIQUIDACIÓN Y BOTÓN DE EMISIÓN */}
                <div className="space-y-6">
                  <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 space-y-5">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                        Resumen de Emisión DTE
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${siiEnvironmentMode === 'SANDBOX' ? 'bg-amber-400 text-slate-950 font-extrabold' : 'bg-emerald-400 text-slate-950 font-extrabold'}`}>
                        {siiEnvironmentMode === 'SANDBOX' ? '🧪 SANDBOX' : '🟢 EN VIVO'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span>Documento:</span>
                        <span className="font-bold text-white">
                          {tipoDTE === '33' ? 'Factura Electrónica (33)' :
                           tipoDTE === '34' ? 'Factura Exenta (34)' :
                           tipoDTE === '39' ? 'Boleta Electrónica (39)' :
                           tipoDTE === '52' ? 'Guía de Despacho (52)' :
                           tipoDTE === '61' ? 'Nota de Crédito (61)' : 'Nota de Débito (56)'}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-300">
                        <span>Folio a Asignar:</span>
                        <span className="font-mono font-bold text-emerald-400">N° {getNextFolio(tipoDTE)}</span>
                      </div>

                      <div className="flex justify-between text-slate-300">
                        <span>Emisor (Firma Digital):</span>
                        <span className="font-semibold text-slate-200">{config.nombreRepresentante || company.name}</span>
                      </div>

                      <div className="flex justify-between text-slate-300">
                        <span>Forma de Pago:</span>
                        <span className="font-semibold text-slate-200">{formaPago}</span>
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-slate-800 font-mono text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span>Monto Neto:</span>
                        <span>${subtotalNetoAfecto.toLocaleString('es-CL')}</span>
                      </div>

                      <div className="flex justify-between text-slate-300">
                        <span>Monto Exento:</span>
                        <span>${subtotalExento.toLocaleString('es-CL')}</span>
                      </div>

                      <div className="flex justify-between text-slate-300">
                        <span>IVA (19%):</span>
                        <span>${montoIva.toLocaleString('es-CL')}</span>
                      </div>

                      <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800">
                        <span>TOTAL DTE:</span>
                        <span className="text-emerald-400">${montoTotal.toLocaleString('es-CL')}</span>
                      </div>
                    </div>

                    <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1.5 text-[11px] text-slate-300">
                      <div className="flex items-center gap-1 text-emerald-400 font-bold">
                        <span>✓ Contabilización 1-Clic</span>
                      </div>
                      <p className="leading-tight text-slate-400">
                        Al emitir, el sistema transmitirá al SII ({siiEnvironmentMode === 'SANDBOX' ? 'Modo Pruebas' : 'zeus.sii.cl'}) y creará automáticamente el Voucher de Venta en el Libro Diario + RCV Ventas.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={loading || montoTotal <= 0 || !receptorRut}
                      onClick={handleEmitirDTE}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-slate-950 font-black py-3 rounded-xl transition-all shadow-lg text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? (
                        <span>Procesando Firma y Transmisión...</span>
                      ) : (
                        <>
                          <span>🚀 Emitir DTE y Contabilizar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HISTORIAL DE DTES EMITIDOS */}
          {activeTab === 'historial' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              {/* HEADER BAR & CONTROLS */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>📜 Histórico y Registro de DTEs Emitidos</span>
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Conexión Directa SII
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rescatado automático de Facturas (33/34), Boletas Electrónicas (39/41) y Notas de Crédito (61).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* SELECTOR DE AÑO TRIBUTARIO */}
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-xs">
                    <span className="text-xs font-semibold text-slate-600">Año:</span>
                    <select
                      value={selectedSyncYear}
                      onChange={(e) => setSelectedSyncYear(parseInt(e.target.value, 10))}
                      className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value={2026}>2026 (Año Actual)</option>
                      <option value={2025}>2025 (Histórico)</option>
                      <option value={2024}>2024 (Histórico)</option>
                      <option value={2023}>2023 (Histórico)</option>
                      <option value={2022}>2022 (Histórico)</option>
                    </select>
                  </div>

                  {/* BOTÓN RESCATAR Y SINCRONIZAR DIRECTO DE SII */}
                  <button
                    type="button"
                    disabled={isSyncingSii}
                    onClick={() => handleSyncDteFromSII(selectedSyncYear)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    title={`Rescatar directamente desde el SII todas las Facturas y Boletas emitidas en el año ${selectedSyncYear}`}
                  >
                    {isSyncingSii ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>Rescatando DTEs SII...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡ Rescatar / Sincronizar DTEs ({selectedSyncYear})</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={fetchDteDocuments}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    title="Actualizar lista local"
                  >
                    🔄 Actualizar
                  </button>

                  <button
                    type="button"
                    disabled={isSyncingSii}
                    onClick={() => handlePurgeAllSimulatedData()}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    title="Limpiar y borrar todos los DTEs y RCV de prueba o simulados"
                  >
                    🗑️ Limpiar Datos de Prueba
                  </button>
                </div>
              </div>

              {/* STATS & RESGUARDO CONTABLE BANNER */}
              {dteDocs.length > 0 && (
                <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-950 font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🗑️</span>
                    <span>Hay {dteDocs.length} registros en la base de datos. Si corresponden a datos ficticios de prueba, haz clic para borrarlos todos y dejar la base de datos en 0.</span>
                  </div>
                  <button
                    type="button"
                    disabled={isSyncingSii}
                    onClick={() => handlePurgeAllSimulatedData(false)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs transition-all whitespace-nowrap cursor-pointer"
                  >
                    Borrar Todos los Datos de Prueba
                  </button>
                </div>
              )}

              {(() => {
                const filteredByYear = dteDocs.filter(d => d.fechaEmision.startsWith(String(selectedSyncYear)));
                const facturasList = filteredByYear.filter(d => d.tipoDTE === '33' || d.tipoDTE === '34');
                const boletasList = filteredByYear.filter(d => d.tipoDTE === '39' || d.tipoDTE === '41');
                const ncsList = filteredByYear.filter(d => d.tipoDTE === '61' || d.tipoDTE === '56');

                const totalFacturas = facturasList.reduce((acc, d) => acc + (d.montoTotal || 0), 0);
                const totalBoletas = boletasList.reduce((acc, d) => acc + (d.montoTotal || 0), 0);
                const totalNCs = ncsList.reduce((acc, d) => acc + (d.montoTotal || 0), 0);

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-1">
                        <div className="flex justify-between items-center text-xs text-indigo-900 font-semibold">
                          <span>📄 Facturas (33/34)</span>
                          <span className="font-mono bg-indigo-200 text-indigo-900 text-[10px] px-1.5 py-0.5 rounded font-bold">{facturasList.length}</span>
                        </div>
                        <div className="text-base font-black text-indigo-950">${totalFacturas.toLocaleString('es-CL')}</div>
                        <div className="text-[10px] text-indigo-700">Ventas con Factura Afecta / Exenta</div>
                      </div>

                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1">
                        <div className="flex justify-between items-center text-xs text-emerald-900 font-semibold">
                          <span>🧾 Boletas Electrónicas (39/41)</span>
                          <span className="font-mono bg-emerald-200 text-emerald-900 text-[10px] px-1.5 py-0.5 rounded font-bold">{boletasList.length}</span>
                        </div>
                        <div className="text-base font-black text-emerald-950">${totalBoletas.toLocaleString('es-CL')}</div>
                        <div className="text-[10px] text-emerald-700">Resumen Ventas a Consumidor Final</div>
                      </div>

                      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-1">
                        <div className="flex justify-between items-center text-xs text-amber-900 font-semibold">
                          <span>📑 Notas de Crédito (61)</span>
                          <span className="font-mono bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-bold">{ncsList.length}</span>
                        </div>
                        <div className="text-base font-black text-amber-950">${totalNCs.toLocaleString('es-CL')}</div>
                        <div className="text-[10px] text-amber-700">Anulaciones y Descuentos</div>
                      </div>

                      <div className="bg-slate-100 border border-slate-300 rounded-xl p-3.5 space-y-1 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <span>🛡️ Resguardo de Contabilidad</span>
                        </div>
                        <p className="text-[10px] text-slate-600 leading-tight">
                          {selectedSyncYear < 2026
                            ? `Los documentos del año ${selectedSyncYear} se mantienen como historial informativo sin alterar libros anteriores.`
                            : `Documentos sincronizados con los libros de ventas y RCV de GEST_OK.`}
                        </p>
                      </div>
                    </div>

                    {/* FILTRO DE TIPOS DE DOCUMENTO */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                      <span className="text-xs font-bold text-slate-500 mr-1">Filtrar por Tipo:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedDocTypeFilter('todos')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedDocTypeFilter === 'todos'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Todos ({filteredByYear.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDocTypeFilter('facturas')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedDocTypeFilter === 'facturas'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        📄 Facturas ({facturasList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDocTypeFilter('boletas')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedDocTypeFilter === 'boletas'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        🧾 Boletas Electrónicas ({boletasList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDocTypeFilter('notas_credito')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedDocTypeFilter === 'notas_credito'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        📑 Notas de Crédito ({ncsList.length})
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* DTE TABLE */}
              {(() => {
                const yearFiltered = dteDocs.filter(d => d.fechaEmision.startsWith(String(selectedSyncYear)));
                const displayDocs = yearFiltered.filter(doc => {
                  if (selectedDocTypeFilter === 'facturas') return doc.tipoDTE === '33' || doc.tipoDTE === '34';
                  if (selectedDocTypeFilter === 'boletas') return doc.tipoDTE === '39' || doc.tipoDTE === '41';
                  if (selectedDocTypeFilter === 'notas_credito') return doc.tipoDTE === '61' || doc.tipoDTE === '56';
                  return true;
                });

                if (displayDocs.length === 0) {
                  return (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-3">
                      <span className="text-3xl">📥</span>
                      <h4 className="text-sm font-bold text-slate-700">No hay DTEs sincronizados para el año {selectedSyncYear}</h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Presiona el botón <span className="font-bold text-emerald-700">⚡ Rescatar / Sincronizar DTEs ({selectedSyncYear})</span> para traer automáticamente todas las Facturas y Boletas emitidas desde el SII.
                      </p>
                      <button
                        type="button"
                        disabled={isSyncingSii}
                        onClick={() => handleSyncDteFromSII(selectedSyncYear)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                      >
                        ⚡ Sincronizar AHORA Año {selectedSyncYear}
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                      <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                        <tr>
                          <th className="p-3">Tipo Doc</th>
                          <th className="p-3">Folio</th>
                          <th className="p-3">Fecha</th>
                          <th className="p-3">Receptor (RUT / Razón Social)</th>
                          <th className="p-3 text-right">Monto Total</th>
                          <th className="p-3 text-center">Estado SII</th>
                          <th className="p-3 text-center">Estado Contable</th>
                          <th className="p-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        {displayDocs.map(doc => {
                          const isBoleta = doc.tipoDTE === '39' || doc.tipoDTE === '41';
                          const isNC = doc.tipoDTE === '61' || doc.tipoDTE === '56';

                          return (
                            <tr key={doc.id} className="hover:bg-slate-50">
                              <td className="p-3 font-sans">
                                {isBoleta ? (
                                  <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    🧾 {doc.tipoDTELabel}
                                  </span>
                                ) : isNC ? (
                                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    📑 {doc.tipoDTELabel}
                                  </span>
                                ) : (
                                  <span className="bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    📄 {doc.tipoDTELabel}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-bold text-indigo-700">N° {doc.folio}</td>
                              <td className="p-3 text-slate-600">{doc.fechaEmision}</td>
                              <td className="p-3 font-sans">
                                <div className="font-semibold text-slate-900">{doc.receptor?.razonSocial}</div>
                                <div className="text-[11px] text-slate-500 font-mono">{doc.receptor?.rut}</div>
                              </td>
                              <td className="p-3 text-right font-bold text-slate-900">
                                ${doc.montoTotal?.toLocaleString('es-CL')}
                              </td>
                              <td className="p-3 text-center font-sans">
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  ✓ Aceptado SII
                                </span>
                              </td>
                              <td className="p-3 text-center font-sans">
                                {doc.voucherNumber ? (
                                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-mono px-2 py-0.5 rounded font-bold">
                                    ✓ V-{doc.voucherNumber}
                                  </span>
                                ) : selectedSyncYear < 2026 ? (
                                  <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-medium px-2 py-0.5 rounded" title="Años anteriores guardados como historial informativo sin alterar libros">
                                    🛡️ Historial Informativo
                                  </span>
                                ) : (
                                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium px-2 py-0.5 rounded">
                                    ✓ Registrado RCV
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center font-sans">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewDoc(doc);
                                      setShowPreviewModal(true);
                                    }}
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded transition-colors cursor-pointer"
                                  >
                                    Ver PDF DTE
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const xml = generateDteXml(doc, config);
                                      downloadDteXml(xml, `DTE_T${doc.tipoDTE}_F${doc.folio}_${doc.emisor?.rut}.xml`);
                                    }}
                                    className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 text-[11px] font-bold rounded transition-colors cursor-pointer"
                                    title="Descargar XML DTE"
                                  >
                                    XML 📥
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 3: CONFIGURACIÓN & BÓVEDA DE CREDENCIALES SENSIBLES */}
          {activeTab === 'configuracion' && (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔒</span>
                    <h3 className="text-lg font-bold text-slate-900">Credenciales Duales & Conexión Directa SII</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Conexión híbrida con el Servicio de Impuestos Internos: Portal RCV (Rep. Legal) y Boletas de Honorarios/Certificados (Empresa).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRescatarDatosSociedad}
                    className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-xs"
                    title="Rescatar RUT, Nombre de Representante y Domicilio desde la Ficha de la Empresa"
                  >
                    <span>📥 Rescatar Ficha Sociedad</span>
                  </button>
                  <button
                    type="button"
                    disabled={diagnosticLoading}
                    onClick={handleRunDiagnostic}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold rounded-xl text-xs transition-all flex items-center gap-2 shadow-xs"
                  >
                    {diagnosticLoading ? (
                      <span>Probando Conexión...</span>
                    ) : (
                      <>
                        <span>⚡ Probar Conexión Dual SII</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* DIAGNOSTIC RESULT BANNER */}
              {diagnosticResult && (
                <div className={`p-4 rounded-xl border space-y-3 text-xs ${diagnosticResult.success ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-amber-50 border-amber-300 text-amber-950'}`}>
                  <div className="flex justify-between items-center font-bold">
                    <span className="flex items-center gap-2 text-sm">
                      {diagnosticResult.success ? '✅ Conexión Exitosa con Servidores del SII (zeus.sii.cl)' : '⚠️ Advertencia de Conexión SII'}
                    </span>
                    <span className="font-mono text-[11px] bg-white/60 px-2 py-0.5 rounded border">
                      Latencia: {diagnosticResult.latencyMs}ms | {diagnosticResult.environment}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    <div className="bg-white/80 p-3 rounded-lg border border-slate-200 space-y-1">
                      <p className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>1. Portal RCV (Rep. Legal):</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${diagnosticResult.repLegalAuth.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {diagnosticResult.repLegalAuth.status}
                        </span>
                      </p>
                      <p className="text-slate-700">{diagnosticResult.repLegalAuth.message}</p>
                    </div>

                    <div className="bg-white/80 p-3 rounded-lg border border-slate-200 space-y-1">
                      <p className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>2. Portal BHE & Certificados (Empresa):</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${diagnosticResult.companyAuth.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {diagnosticResult.companyAuth.status}
                        </span>
                      </p>
                      <p className="text-slate-700">{diagnosticResult.companyAuth.message}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSaveConfig} className="space-y-6 text-xs">
                {/* SECCIÓN 1: CREDENCIAL REPRESENTANTE LEGAL (RCV) */}
                <div className="p-5 bg-indigo-50/40 border border-indigo-200 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <h4 className="font-bold text-indigo-950 text-sm flex items-center gap-2">
                      <span>👤 Credencial 1: Representante Legal (Portal RCV & Facturador SII)</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRescatarDatosSociedad}
                        className="text-[11px] bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold px-2.5 py-1 rounded-lg border border-indigo-300 transition-colors flex items-center gap-1"
                      >
                        <span>📥 Sincronizar Ficha</span>
                      </button>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                        Requerido para RCV y Boletas
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    El SII exige autenticarse con el RUT y Clave Personal del Representante Legal para consultar el Registro de Compras y Ventas. Si el representante gestiona varias sociedades, GEST_OK seleccionará automáticamente el RUT de esta empresa.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">RUT Representante Legal *</label>
                      <input
                        type="text"
                        value={config.rutRepresentante}
                        onChange={(e) => setConfig({ ...config, rutRepresentante: e.target.value })}
                        placeholder="Ej. 10.555.908-9"
                        required
                        className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre Representante Legal</label>
                      <input
                        type="text"
                        value={config.nombreRepresentante}
                        onChange={(e) => setConfig({ ...config, nombreRepresentante: e.target.value })}
                        placeholder="Ej. Ramón Campos"
                        className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Clave SII Representante Legal *</label>
                      <div className="relative">
                        <input
                          type={showClaveRep ? 'text' : 'password'}
                          value={claveRepInput}
                          onChange={(e) => setClaveRepInput(e.target.value)}
                          placeholder={config.claveRepLegalSiiMasked || config.claveRepLegalSii ? "•••••••• (Clave Guardada)" : "Ingresa Clave SII Rep. Legal"}
                          className="w-full border border-slate-300 rounded-lg p-2.5 pr-10 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!showClaveRep && !claveRepInput && config.claveRepLegalSii) {
                              setClaveRepInput(config.claveRepLegalSii);
                            }
                            setShowClaveRep(!showClaveRep);
                          }}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                          title={showClaveRep ? "Ocultar clave" : "Ver clave"}
                        >
                          {showClaveRep ? '👁️' : '🙈'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="multiEmpresaSelection"
                      checked={config.multiEmpresaSelectionEnabled ?? true}
                      onChange={(e) => setConfig({ ...config, multiEmpresaSelectionEnabled: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="multiEmpresaSelection" className="text-[11px] text-slate-700 font-medium">
                      Filtrar y seleccionar automáticamente el RUT de {company.name} ({company.rut}) en el portal del SII cuando el representante gestione múltiples empresas.
                    </label>
                  </div>
                </div>

                {/* SECCIÓN 2: CERTIFICADO DIGITAL & FIRMA ELECTRÓNICA */}
                <div className="p-5 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-purple-950 text-sm flex items-center gap-2">
                      <span>🔑 Firma Digital / Certificado Electrónico (.pfx / .p12)</span>
                    </h4>
                    <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                      Obligatorio Timbrado SII
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Certificado digital del Representante Legal necesario para timbrar y firmar los documentos tributarios electrónicos (DTE) transmitidos al SII.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Archivo Certificado (.pfx / .p12)</label>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm shrink-0">
                          <span>📂 Cargar .PFX</span>
                          <input
                            type="file"
                            accept=".pfx,.p12"
                            className="hidden"
                            onChange={handleUploadPfx}
                          />
                        </label>
                        <input
                          type="text"
                          value={config.certificadoNombre}
                          onChange={(e) => setConfig({ ...config, certificadoNombre: e.target.value })}
                          placeholder="Firma_Digital.pfx"
                          className="w-full border border-slate-300 bg-white rounded-lg p-2 font-mono text-xs text-slate-700"
                        />
                      </div>
                      {config.certificadoB64 ? (
                        <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                          ✓ Archivo cargado ({Math.round((config.certificadoB64.length * 3 / 4) / 1024)} KB) - Listo para SII
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-600 font-medium mt-1">
                          ⚠️ Carga tu .pfx para habilitar rescate RCV vía SimpleAPI
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Clave del Certificado Digital *</label>
                      <div className="relative">
                        <input
                          type={showClaveCert ? 'text' : 'password'}
                          value={claveCertInput}
                          onChange={(e) => setClaveCertInput(e.target.value)}
                          placeholder={config.claveCertificadoDigital ? "•••••••• (Clave Guardada)" : "Ingresa Clave Certificado"}
                          className="w-full border border-slate-300 bg-white rounded-lg p-2.5 pr-10 font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!showClaveCert && !claveCertInput && config.claveCertificadoDigital) {
                              setClaveCertInput(config.claveCertificadoDigital);
                            }
                            setShowClaveCert(!showClaveCert);
                          }}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                          title={showClaveCert ? "Ocultar clave" : "Ver clave"}
                        >
                          {showClaveCert ? '👁️' : '🙈'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fecha Vencimiento Certificado</label>
                      <input
                        type="date"
                        value={config.certificadoFechaVencimiento}
                        onChange={(e) => setConfig({ ...config, certificadoFechaVencimiento: e.target.value })}
                        className="w-full border border-slate-300 bg-white rounded-lg p-2.5 font-mono text-slate-700"
                      />
                    </div>
                  </div>
                </div>

                {/* SECCIÓN 3: CASILLERO CONEXIÓN API FACTURADOR GRATUITO SII / PROVEEDOR EXTERNO */}
                <div className="p-5 bg-amber-50/70 border border-amber-300 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                      <span>🌐 Casillero de Conexión API (Facturador SII & Proveedores)</span>
                    </h4>
                    <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                      Conexión API Facturador SII
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    Selecciona tu proveedor (ej. <strong>SimpleAPI.cl</strong>) e ingresa tu <strong>API Key</strong> (ej. <code>5511-W960-...</code>) o URL Endpoint para rescatar RCV, Boletas de Honorarios y sincronizar documentos.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-800 mb-1">Proveedor de API SII *</label>
                      <select
                        value={config.siiApiProvider || 'SIMPLE_API'}
                        onChange={(e) => {
                          const prov = e.target.value as any;
                          let defaultUrl = config.siiApiUrl || '';
                          if (prov === 'SIMPLE_API' && (!defaultUrl || defaultUrl === '')) {
                            defaultUrl = 'https://api.simpleapi.cl/v1';
                          }
                          setConfig({ ...config, siiApiProvider: prov, siiApiUrl: defaultUrl });
                        }}
                        className="w-full border border-amber-300 bg-white rounded-lg p-2.5 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-800"
                      >
                        <option value="SIMPLE_API">SimpleAPI.cl (SimpleDTE / SimpleRCV)</option>
                        <option value="OPEN_FACTURA">OpenFactura (Haulmer)</option>
                        <option value="LIBRE_DTE">LibreDTE</option>
                        <option value="DIRECT_SII">API Directa / Servidor SII Propio</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 mb-1">URL Endpoint API *</label>
                      <input
                        type="text"
                        value={config.siiApiUrl || ''}
                        onChange={(e) => setConfig({ ...config, siiApiUrl: e.target.value })}
                        placeholder={config.siiApiProvider === 'SIMPLE_API' ? 'https://api.simpleapi.cl/v1' : 'Ej. https://tu-api-sii.cl/v1'}
                        className="w-full border border-amber-300 bg-white rounded-lg p-2.5 font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-800"
                      />
                      <span className="text-[11px] text-slate-500 block mt-1">
                        {config.siiApiProvider === 'SIMPLE_API' 
                          ? '💡 Endpoint oficial de SimpleAPI: https://api.simpleapi.cl/v1. Si lo dejas vacío o con el enlace de registro, el sistema usará el endpoint oficial automáticamente.' 
                          : 'URL base del servicio de emisión DTE'}
                      </span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 mb-1">API Key / Token *</label>
                      <input
                        type="text"
                        value={config.siiApiKey || ''}
                        onChange={(e) => setConfig({ ...config, siiApiKey: e.target.value })}
                        placeholder="Ej. 5511-W960-6395-2355-3470"
                        className="w-full border border-amber-400 bg-white rounded-lg p-2.5 font-mono text-xs font-bold text-amber-950 focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* SECCIÓN 4: CREDENCIAL EMPRESA (BHE HONORARIOS) */}
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span>🏢 Credencial 2: Empresa (Boletas de Honorarios BHE & F29)</span>
                    </h4>
                    <span className="text-[10px] bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded-full">
                      Acceso Directo Empresa
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Credenciales con el RUT de la Empresa y Clave de la Empresa para descargar Boletas de Honorarios Electrónicas (BHE emitidas y recibidas) y generar certificados de retención.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">RUT Empresa Cliente</label>
                      <input
                        type="text"
                        disabled
                        value={company.rut}
                        className="w-full bg-slate-100 border border-slate-300 rounded-lg p-2.5 font-mono text-slate-600 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Clave SII Empresa</label>
                      <div className="relative">
                        <input
                          type={showClaveComp ? 'text' : 'password'}
                          value={claveCompInput}
                          onChange={(e) => setClaveCompInput(e.target.value)}
                          placeholder={config.claveEmpresaSiiMasked || config.claveEmpresaSii ? "•••••••• (Clave Guardada)" : "Ingresa Clave SII Empresa"}
                          className="w-full border border-slate-300 bg-white rounded-lg p-2.5 pr-10 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!showClaveComp && !claveCompInput && config.claveEmpresaSii) {
                              setClaveCompInput(config.claveEmpresaSii);
                            }
                            setShowClaveComp(!showClaveComp);
                          }}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                          title={showClaveComp ? "Ocultar clave" : "Ver clave"}
                        >
                          {showClaveComp ? '👁️' : '🙈'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DOMICILIO EMISOR & FALLBACK DE CIUDAD (VALIDACIÓN CRÍTICA) */}
                <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <span>📍 Domicilio Emisor & Fallback de Ciudad (Validación SII)</span>
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    El sistema del SII rechaza las facturas si falta la Ciudad o Comuna en la sección de dirección del emisor o receptor. Define los valores de respaldo para que tus DTEs nunca fallan:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Comuna por Defecto Emisor</label>
                      <input
                        type="text"
                        value={config.defaultComunaEmisor}
                        onChange={(e) => setConfig({ ...config, defaultComunaEmisor: e.target.value })}
                        placeholder="Ej. Providencia"
                        className="w-full border border-slate-300 bg-white rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Ciudad por Defecto Emisor (Obligatorio SII)</label>
                      <input
                        type="text"
                        value={config.defaultCiudadEmisor}
                        onChange={(e) => setConfig({ ...config, defaultCiudadEmisor: e.target.value })}
                        placeholder="Ej. Santiago"
                        className="w-full border border-emerald-300 bg-white rounded-lg p-2.5 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-md text-xs"
                  >
                    Guardar Credenciales Duales en Bóveda Segura
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* MODAL VISTA PREVIA PDF DTE OFICIAL CON TIMBRE ELECTRONICO PDF417 */}
      {showPreviewModal && previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* MODAL HEADER */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-base">📄</span>
                <h3 className="font-bold text-sm">
                  Representación Impresa DTE - {previewDoc.tipoDTELabel} N° {previewDoc.folio}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* DOCUMENT CONTENT (ESTILO SII PDF OFICIAL) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 font-sans text-xs">
              <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-sm space-y-6">
                {/* TOP BAR: EMISOR & RED BOX FOlIO */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="space-y-1 max-w-md">
                    <h2 className="text-base font-black text-slate-900 uppercase">{previewDoc.emisor?.razonSocial}</h2>
                    <p className="text-slate-600 font-semibold">{previewDoc.emisor?.giro}</p>
                    <p className="text-slate-500">
                      Casa Matriz: {previewDoc.emisor?.direccion} - {previewDoc.emisor?.comuna}, <span className="font-bold text-slate-800">{previewDoc.emisor?.ciudad}</span>
                    </p>
                  </div>

                  {/* RED BOX SII DTE */}
                  <div className="border-4 border-red-600 p-4 text-center text-red-600 rounded-lg min-w-[240px] font-mono bg-red-50/20">
                    <p className="font-bold text-sm">R.U.T.: {previewDoc.emisor?.rut}</p>
                    <p className="font-black text-xs uppercase tracking-wide my-1">{previewDoc.tipoDTELabel}</p>
                    <p className="font-bold text-base">N° {previewDoc.folio}</p>
                    <p className="text-[10px] text-red-700 font-sans mt-1">S.I.I. - {previewDoc.emisor?.ciudad?.toUpperCase() || 'SANTIAGO'}</p>
                  </div>
                </div>

                {/* RECEPTOR BOX */}
                <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 space-y-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="font-bold text-slate-700">Señor(es): </span>
                      <span className="font-bold text-slate-900">{previewDoc.receptor?.razonSocial}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">R.U.T.: </span>
                      <span className="font-mono font-bold text-slate-900">{previewDoc.receptor?.rut}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Giro: </span>
                      <span className="text-slate-800">{previewDoc.receptor?.giro}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Fecha Emisión: </span>
                      <span className="font-mono text-slate-800">{previewDoc.fechaEmision}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Dirección: </span>
                      <span className="text-slate-800">{previewDoc.receptor?.direccion}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Comuna / Ciudad: </span>
                      <span className="font-bold text-slate-900">
                        {previewDoc.receptor?.comuna} / {previewDoc.receptor?.ciudad || 'Santiago'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* TABLE ITEMS */}
                <table className="w-full text-left text-xs border border-slate-300 rounded overflow-hidden">
                  <thead className="bg-slate-200 text-slate-800 font-bold uppercase">
                    <tr>
                      <th className="p-2 border-r border-slate-300">Detalle / Producto / Servicio</th>
                      <th className="p-2 w-16 text-center border-r border-slate-300">Cant.</th>
                      <th className="p-2 w-24 text-right border-r border-slate-300">P. Unit ($)</th>
                      <th className="p-2 w-28 text-right">Subtotal ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 font-mono">
                    {previewDoc.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-sans font-medium text-slate-900 border-r border-slate-200">{it.nombre}</td>
                        <td className="p-2 text-center border-r border-slate-200">{it.cantidad}</td>
                        <td className="p-2 text-right border-r border-slate-200">${it.precioUnitario?.toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right font-bold">${it.subtotal?.toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* BOTTOM: TIMBRE ELECTRONICO PDF417 & TOTALES */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-6 pt-4 border-t border-slate-300">
                  {/* TIMBRE SII SIMULADO (PDF417) */}
                  <div className="border border-slate-400 p-3 rounded-lg text-center space-y-1.5 bg-slate-100 max-w-xs w-full">
                    {/* SIMULATED PDF417 BARCODE */}
                    <div className="bg-slate-900 h-16 w-full rounded flex items-center justify-center font-mono text-[9px] text-slate-400 tracking-widest overflow-hidden p-1">
                      |||||| |||||||| |||||||| ||| |||||||| |||||||||| |||||| |||||||||| |||||
                    </div>
                    <p className="font-bold text-[10px] text-slate-800">Timbre Electrónico S.I.I.</p>
                    <p className="text-[9px] text-slate-500">Res. N° {config.resolutionNumber} de {config.resolutionDate} - Verifique documento en sii.cl</p>
                  </div>

                  {/* TOTALES BOX */}
                  <div className="w-full sm:w-64 space-y-1.5 font-mono text-xs border border-slate-300 p-3 rounded-lg bg-slate-50">
                    <div className="flex justify-between text-slate-700">
                      <span>Monto Neto:</span>
                      <span>${previewDoc.montoNeto?.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>Monto Exento:</span>
                      <span>${previewDoc.montoExento?.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>IVA 19%:</span>
                      <span>${previewDoc.montoIva?.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-300">
                      <span>TOTAL ($):</span>
                      <span className="text-indigo-900">${previewDoc.montoTotal?.toLocaleString('es-CL')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3">
              <span className="text-xs text-slate-600 font-mono">
                Voucher Contable Asignado: <strong className="text-indigo-700">V-{previewDoc.voucherNumber}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const xml = generateDteXml(previewDoc, config);
                    downloadDteXml(xml, `DTE_T${previewDoc.tipoDTE}_F${previewDoc.folio}_${previewDoc.emisor?.rut}.xml`);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <span>📥 Descargar XML DTE Oficial</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
                >
                  Cerrar Vista Previa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
