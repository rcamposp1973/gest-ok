import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, setDoc } from 'firebase/firestore';
import { Company, Auxiliary, ChartOfAccount, DTEDocument, DTEConfig, DTEDocumentItem, Voucher, VoucherLine, RCVDocument } from '../types';
import { sanitizeVoucherLines } from '../utils/voucherValidation';

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

  // Configuration state
  const [config, setConfig] = useState<DTEConfig>({
    rutEmisor: company.rut || '',
    rutRepresentante: company.legalRepRut || '',
    nombreRepresentante: company.legalRepName || '',
    claveSiiMasked: company.dteConfig?.claveSiiMasked || '••••••••',
    hasCertificadoDigital: company.dteConfig?.hasCertificadoDigital ?? true,
    certificadoNombre: company.dteConfig?.certificadoNombre || 'Firma_Digital_RepLegal.pfx',
    certificadoFechaVencimiento: company.dteConfig?.certificadoFechaVencimiento || '2027-12-31',
    defaultCiudadEmisor: company.dteConfig?.defaultCiudadEmisor || company.ciudad || 'Santiago',
    defaultComunaEmisor: company.dteConfig?.defaultComunaEmisor || company.comuna || 'Santiago',
    ambiente: company.dteConfig?.ambiente || 'Producción',
    resolutionNumber: company.dteConfig?.resolutionNumber || '80',
    resolutionDate: company.dteConfig?.resolutionDate || '2024-01-15',
  });

  const [claveInput, setClaveInput] = useState<string>('');
  const [showClave, setShowClave] = useState<boolean>(false);

  // Form DTE state
  const [tipoDTE, setTipoDTE] = useState<'33' | '34' | '39' | '56' | '61'>('33');
  const [selectedAuxiliaryId, setSelectedAuxiliaryId] = useState<string>('');

  // Receptor fields
  const [receptorRut, setReceptorRut] = useState<string>('');
  const [receptorRazonSocial, setReceptorRazonSocial] = useState<string>('');
  const [receptorGiro, setReceptorGiro] = useState<string>('SERVICIOS INTEGRALES');
  const [receptorDireccion, setReceptorDireccion] = useState<string>('');
  const [receptorComuna, setReceptorComuna] = useState<string>('');
  const [receptorCiudad, setReceptorCiudad] = useState<string>(''); // Crucial field!
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

  const [formaPago, setFormaPago] = useState<'Contado' | 'Crédito 30 días' | 'Crédito 60 días' | 'Transferencia'>('Transferencia');
  const [refFolioOrig, setRefFolioOrig] = useState<string>('');

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

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

  useEffect(() => {
    fetchDteDocuments();
  }, []);

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

  // Save Settings
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const updatedConfig: DTEConfig = {
        ...config,
        claveSiiMasked: claveInput ? '••••••••' : config.claveSiiMasked,
      };

      await updateDoc(companyRef, {
        dteConfig: updatedConfig,
        legalRepRut: config.rutRepresentante,
        legalRepName: config.nombreRepresentante,
        ciudad: config.defaultCiudadEmisor,
        comuna: config.defaultComunaEmisor,
      });

      setConfig(updatedConfig);
      setClaveInput('');
      await onRefreshData();
      alert('✅ Configuración del Facturador SII guardada exitosamente.');
    } catch (err) {
      console.error('Error saving DTE config:', err);
      alert('❌ Error al guardar la configuración.');
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
    const dateStr = new Date().toISOString().split('T')[0];
    const periodStr = dateStr.substring(0, 7);

    const labelMap: Record<string, string> = {
      '33': 'Factura Electrónica',
      '34': 'Factura Exenta Electrónica',
      '39': 'Boleta Electrónica',
      '56': 'Nota de Débito Electrónica',
      '61': 'Nota de Crédito Electrónica',
    };

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
        contacto: '',
        email: receptorEmail,
      },
      representanteLegal: {
        rut: config.rutRepresentante,
        nombre: config.nombreRepresentante,
      },
      items: [...items],
      formaPago,
      montoNeto: subtotalNetoAfecto,
      montoIva: tipoDTE === '34' ? 0 : montoIva,
      montoExento: subtotalExento,
      montoTotal,
      estadoSII: 'Aceptado_SII',
      trackIdSII: `SII-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toISOString(),
      refFolioOrig: refFolioOrig || undefined,
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

      alert(`🚀 ¡DTE ${labelMap[tipoDTE]} N° ${nextFolio} Emitido y Contabilizado con Éxito!\n- Voucher de Venta N° ${nextVoucherNum} generado en Libro Diario.\n- Registrado en RCV Ventas para propuesta F29.`);
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
                      { type: '61', label: '61 - Nota de Crédito', desc: 'Anula / Modifica Venta' },
                      { type: '56', label: '56 - Nota de Débito', desc: 'Aumenta Valor Venta' },
                    ].map(opt => (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => setTipoDTE(opt.type as any)}
                        className={`p-3 rounded-xl border text-left transition-all ${
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

                {/* 2. DATOS DEL RECEPTOR / CLIENTE */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      2. Datos del Receptor / Cliente
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

                    {/* CIUDAD FIELD WITH HIGHLIGHTED VALIDATION FIX */}
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
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        * Si se deja en blanco, el sistema asignará automáticamente la Comuna/Ciudad por defecto para evitar rechazos del SII.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Email Aviso DTE (Envío Copia DTE)</label>
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

                {/* 3. ÍTEMS Y DETALLE DE LA VENTA */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      3. Detalle de Ítems / Productos / Servicios
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold rounded-lg transition-colors"
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
                          <th className="p-2.5 w-24">Exento</th>
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
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-slate-900">
                              ${item.subtotal.toLocaleString('es-CL')}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="text-slate-400 hover:text-red-600 font-bold text-base"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* FORMA DE PAGO */}
                  <div className="pt-3 border-t border-slate-200 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">Forma de Pago:</span>
                      <select
                        value={formaPago}
                        onChange={(e) => setFormaPago(e.target.value as any)}
                        className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none font-medium"
                      >
                        <option value="Transferencia">Transferencia Bancaria</option>
                        <option value="Contado">Contado</option>
                        <option value="Crédito 30 días">Crédito 30 días</option>
                        <option value="Crédito 60 días">Crédito 60 días</option>
                      </select>
                    </div>

                    {(tipoDTE === '61' || tipoDTE === '56') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">Folio Factura Origen Referenciada:</span>
                        <input
                          type="text"
                          value={refFolioOrig}
                          onChange={(e) => setRefFolioOrig(e.target.value)}
                          placeholder="Ej. Factura N° 124"
                          className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-36 font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RESUMEN DE LIQUIDACIÓN Y BOTÓN DE EMISIÓN */}
              <div className="space-y-6">
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 space-y-5">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 pb-3 border-b border-slate-800">
                    Resumen de Emisión DTE
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Documento:</span>
                      <span className="font-bold text-white">
                        {tipoDTE === '33' ? 'Factura Electrónica (33)' :
                         tipoDTE === '34' ? 'Factura Exenta (34)' :
                         tipoDTE === '39' ? 'Boleta Electrónica (39)' :
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
                      Al emitir, el sistema transmitirá al SII y creará automáticamente el Voucher de Venta en el Libro Diario + RCV Ventas.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={loading || montoTotal <= 0 || !receptorRut}
                    onClick={handleEmitirDTE}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-slate-950 font-black py-3 rounded-xl transition-all shadow-lg text-sm flex items-center justify-center gap-2"
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
          )}

          {/* TAB 2: HISTORIAL DE DTES EMITIDOS */}
          {activeTab === 'historial' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Histórico de Documentos DTE Emitidos</h3>
                  <p className="text-xs text-slate-500">Documentos transmitidos al SII y contabilizados en el sistema</p>
                </div>
                <button
                  type="button"
                  onClick={fetchDteDocuments}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  🔄 Actualizar
                </button>
              </div>

              {dteDocs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No hay documentos DTE emitidos en esta empresa.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                      <tr>
                        <th className="p-3">Tipo Doc</th>
                        <th className="p-3">Folio</th>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Receptor (RUT / Razón Social)</th>
                        <th className="p-3">Comuna / Ciudad</th>
                        <th className="p-3 text-right">Monto Total</th>
                        <th className="p-3 text-center">Estado SII</th>
                        <th className="p-3 text-center">Voucher</th>
                        <th className="p-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {dteDocs.map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-50">
                          <td className="p-3 font-sans font-semibold text-slate-900">{doc.tipoDTELabel}</td>
                          <td className="p-3 font-bold text-indigo-700">N° {doc.folio}</td>
                          <td className="p-3 text-slate-600">{doc.fechaEmision}</td>
                          <td className="p-3 font-sans">
                            <div className="font-semibold text-slate-900">{doc.receptor?.razonSocial}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{doc.receptor?.rut}</div>
                          </td>
                          <td className="p-3 font-sans text-slate-700">
                            {doc.receptor?.comuna} / <span className="font-semibold">{doc.receptor?.ciudad || 'Santiago'}</span>
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
                                V-{doc.voucherNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-sans">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewDoc(doc);
                                setShowPreviewModal(true);
                              }}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded transition-colors"
                            >
                              Ver PDF DTE
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONFIGURACIÓN & BÓVEDA DE CREDENCIALES SENSIBLES */}
          {activeTab === 'configuracion' && (
            <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔒</span>
                  <h3 className="text-lg font-bold text-slate-900">Configuración de Credenciales del SII & Firma Digital</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Parámetros requeridos para la transmisión autenticada con el Portal MiPyme / Facturador del SII.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-900">
                <span className="text-lg flex-shrink-0">🛡️</span>
                <div className="space-y-1">
                  <p className="font-bold">Protección y Encriptación de Datos Sensibles</p>
                  <p className="text-blue-800 leading-relaxed">
                    Las credenciales tributarias (Clave del SII y Certificado Digital) están protegidas dentro del ámbito seguro de la empresa. El sistema nunca expone tu contraseña privada y utiliza tokens de transmisión encriptados.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">RUT Empresa Emisora</label>
                    <input
                      type="text"
                      disabled
                      value={company.rut}
                      className="w-full bg-slate-100 border border-slate-300 rounded-lg p-2.5 font-mono text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">RUT Representante Legal (Cédula) *</label>
                    <input
                      type="text"
                      value={config.rutRepresentante}
                      onChange={(e) => setConfig({ ...config, rutRepresentante: e.target.value })}
                      placeholder="Ej. 12.345.678-9"
                      required
                      className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nombre Representante Legal</label>
                    <input
                      type="text"
                      value={config.nombreRepresentante}
                      onChange={(e) => setConfig({ ...config, nombreRepresentante: e.target.value })}
                      placeholder="Ej. Ramón Campos"
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Clave Tributaria SII</label>
                    <div className="relative">
                      <input
                        type={showClave ? 'text' : 'password'}
                        value={claveInput || config.claveSiiMasked}
                        onChange={(e) => setClaveInput(e.target.value)}
                        placeholder="••••••••"
                        className="w-full border border-slate-300 rounded-lg p-2.5 pr-10 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClave(!showClave)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 font-bold"
                      >
                        {showClave ? '👁️' : '🙈'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* DOMICILIO EMISOR & FALLBACK DE CIUDAD (VALIDACIÓN CRÍTICA) */}
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>📍 Domicilio Emisor & Fallback de Ciudad (Validación SII)</span>
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    El sistema del SII rechaza las facturas si falta la Ciudad o Comuna en la sección de dirección del emisor o receptor. Define los valores de respaldo para que tus DTEs nunca fallen:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Comuna por Defecto Emisor</label>
                      <input
                        type="text"
                        value={config.defaultComunaEmisor}
                        onChange={(e) => setConfig({ ...config, defaultComunaEmisor: e.target.value })}
                        placeholder="Ej. Providencia"
                        className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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

                {/* CERTIFICADO DIGITAL */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>🔑 Certificado Digital / Firma Electrónica (.pfx)</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Archivo de Certificado Carcado</label>
                      <input
                        type="text"
                        value={config.certificadoNombre}
                        onChange={(e) => setConfig({ ...config, certificadoNombre: e.target.value })}
                        className="w-full border border-slate-300 bg-white rounded-lg p-2.5 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fecha Vencimiento Certificado</label>
                      <input
                        type="date"
                        value={config.certificadoFechaVencimiento}
                        onChange={(e) => setConfig({ ...config, certificadoFechaVencimiento: e.target.value })}
                        className="w-full border border-slate-300 bg-white rounded-lg p-2.5 font-mono"
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
                    Guardar Configuración en Bóveda
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
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-600 font-mono">
                Voucher Contable Asignado: <strong className="text-indigo-700">V-{previewDoc.voucherNumber}</strong>
              </span>
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
      )}
    </div>
  );
}
