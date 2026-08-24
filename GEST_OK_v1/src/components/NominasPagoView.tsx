import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Company, ChartOfAccount, Auxiliary, RCVDocument, Voucher, PaymentBatch, PaymentItem, FiscalPeriodYear } from '../types';

interface NominasPagoViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
}

export default function NominasPagoView({
  studyId,
  company,
  accounts,
  auxiliaries,
  rcvDocuments,
  vouchers,
  fiscalYears,
  onVouchersUpdated
}: NominasPagoViewProps) {
  const [paymentBatches, setPaymentBatches] = useState<PaymentBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [selectedBatch, setSelectedBatch] = useState<PaymentBatch | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // New Batch Form State
  const [batchDate, setBatchDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [batchPeriod, setBatchPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [batchGloss, setBatchGloss] = useState<string>('Pago masivo a proveedores según nómina');
  const [selectedPendingIds, setSelectedPendingIds] = useState<{ [id: string]: number }>({}); // docId -> amount to pay
  const [customPayItems, setCustomPayItems] = useState<PaymentItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Manual Item Form
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualRut, setManualRut] = useState<string>('');
  const [manualRazon, setManualRazon] = useState<string>('');
  const [manualTipoDoc, setManualTipoDoc] = useState<string>('33');
  const [manualFolio, setManualFolio] = useState<string>('');
  const [manualMonto, setManualMonto] = useState<number>(0);
  const [manualBanco, setManualBanco] = useState<string>('Banco de Chile');
  const [manualTipoCta, setManualTipoCta] = useState<string>('Corriente');
  const [manualNumCta, setManualNumCta] = useState<string>('');
  const [manualEmail, setManualEmail] = useState<string>('');

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Bank accounts available from chart of accounts
  const bankAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const code = acc.code || '';
      const name = (acc.name || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();
      return (
        acc.estado !== 'Inactivo' &&
        (type.includes('activo') || code.startsWith('1')) &&
        (name.includes('banco') || name.includes('caja') || name.includes('cuenta corriente') || name.includes('tesoreria') || code.startsWith('1-1-01'))
      );
    });
  }, [accounts]);

  // Set default bank account if available
  useEffect(() => {
    if (bankAccounts.length > 0 && !selectedBankAccountId) {
      setSelectedBankAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankAccountId]);

  // Auxiliaries Map
  const auxMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(a => {
      if (a.rut) map.set(a.rut.toUpperCase().replace(/\./g, '').trim(), a);
    });
    return map;
  }, [auxiliaries]);

  // Fetch Payment Batches
  const fetchBatches = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(companyRef, 'paymentBatches'));
      const batches = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentBatch));
      batches.sort((a, b) => (b.batchNumber || 0) - (a.batchNumber || 0));
      setPaymentBatches(batches);
    } catch (err) {
      console.error('Error loading payment batches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [company.id]);

  // Invoices from RCV (Compras / Honorarios) pending payment
  const pendingInvoices = useMemo(() => {
    // Collect all paid RCV doc IDs from active batches
    const paidRcvDocIds = new Set<string>();
    paymentBatches.forEach(b => {
      if (b.status !== 'Anulado' && b.items) {
        b.items.forEach(it => {
          if (it.rcvDocId) paidRcvDocIds.add(it.rcvDocId);
        });
      }
    });

    return rcvDocuments
      .filter(doc => (doc.tipoRegistro === 'Compra' || doc.tipoRegistro === 'Honorarios') && !paidRcvDocIds.has(doc.id))
      .map(doc => {
        const cleanRut = (doc.rutEmisor || '').toUpperCase().replace(/\./g, '').trim();
        const aux = auxMap.get(cleanRut);
        return {
          ...doc,
          auxiliaryData: aux
        };
      });
  }, [rcvDocuments, paymentBatches, auxMap]);

  // Handle toggle selection for an invoice
  const toggleSelectInvoice = (id: string, total: number) => {
    setSelectedPendingIds(prev => {
      const next = { ...prev };
      if (next[id] !== undefined) {
        delete next[id];
      } else {
        next[id] = total;
      }
      return next;
    });
  };

  // Add Manual Custom Pay Item
  const handleAddManualItem = () => {
    if (!manualRut.trim() || !manualFolio.trim() || manualMonto <= 0) {
      alert('Por favor ingrese RUT, Folio y un Monto válido mayor a 0.');
      return;
    }

    const newItem: PaymentItem = {
      rut: manualRut.trim().toUpperCase(),
      razonSocial: manualRazon.trim() || 'PROVEEDOR MANUAL',
      tipoDoc: manualTipoDoc,
      folio: manualFolio.trim(),
      montoTotal: manualMonto,
      montoPagar: manualMonto,
      bancoDestino: manualBanco,
      tipoCuentaDestino: manualTipoCta,
      numeroCuentaDestino: manualNumCta,
      emailAviso: manualEmail
    };

    setCustomPayItems(prev => [...prev, newItem]);
    setManualRut('');
    setManualRazon('');
    setManualFolio('');
    setManualMonto(0);
    setManualNumCta('');
    setManualEmail('');
    setShowManualForm(false);
  };

  // Total amount calculated for the new batch
  const { totalBatchAmount, totalItemsCount, combinedItems } = useMemo(() => {
    const items: PaymentItem[] = [];

    // Selected from RCV
    pendingInvoices.forEach(inv => {
      if (selectedPendingIds[inv.id] !== undefined) {
        const payAmount = selectedPendingIds[inv.id];
        const aux = inv.auxiliaryData;
        items.push({
          rcvDocId: inv.id,
          rut: inv.rutEmisor,
          razonSocial: inv.razonSocialEmisor,
          tipoDoc: inv.tipoDoc,
          folio: inv.folio,
          montoTotal: inv.montoTotal,
          montoPagar: payAmount,
          bancoDestino: aux?.banco || 'Banco de Chile',
          tipoCuentaDestino: aux?.tipoCuenta || 'Corriente',
          numeroCuentaDestino: aux?.numeroCuenta || '',
          emailAviso: aux?.email || ''
        });
      }
    });

    // Custom items
    items.push(...customPayItems);

    const total = items.reduce((sum, it) => sum + it.montoPagar, 0);
    return {
      totalBatchAmount: total,
      totalItemsCount: items.length,
      combinedItems: items
    };
  }, [pendingInvoices, selectedPendingIds, customPayItems]);

  // Create Batch & Generate Accounting Voucher (Comprobante de Egreso)
  const handleCreateBatch = async () => {
    if (combinedItems.length === 0) {
      alert('Debe seleccionar al menos una factura o agregar un ítem a la nómina de pago.');
      return;
    }
    if (!selectedBankAccountId) {
      alert('Seleccione la cuenta bancaria de origen para el pago.');
      return;
    }

    const selectedBankAcc = accounts.find(a => a.id === selectedBankAccountId);
    if (!selectedBankAcc) {
      alert('Cuenta bancaria no encontrada.');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextBatchNumber = (paymentBatches.length > 0 ? Math.max(...paymentBatches.map(b => b.batchNumber || 0)) : 0) + 1;
      const nextVoucherNumber = (vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0) + 1;

      // 1. Prepare Voucher Lines for Egreso
      // Default accounts for supplier liability
      const supplierAcc = accounts.find(a => a.code.startsWith('2-1-01') || a.name.toLowerCase().includes('proveedor')) || {
        id: 'acc_prov_default',
        code: '2-1-01-01',
        name: 'Proveedores por Pagar'
      };

      const voucherLines = [
        // Línea 1: Proveedores por Pagar al DEBE (Disminuye el Pasivo)
        {
          id: 'line_1',
          accountId: supplierAcc.id,
          accountCode: supplierAcc.code,
          accountName: supplierAcc.name,
          debit: totalBatchAmount,
          credit: 0,
          documentRef: `Nómina N° ${nextBatchNumber}`,
          gloss: `Pago a ${combinedItems.length} proveedores según Nómina N° ${nextBatchNumber}`
        },
        // Línea 2: Banco de Origen al HABER (Disminuye el Activo)
        {
          id: 'line_2',
          accountId: selectedBankAcc.id,
          accountCode: selectedBankAcc.code,
          accountName: selectedBankAcc.name,
          debit: 0,
          credit: totalBatchAmount,
          documentRef: `Nómina N° ${nextBatchNumber}`,
          gloss: `Egreso Bancario Nómina N° ${nextBatchNumber}`
        }
      ];

      // 2. Create Voucher in Firestore
      const newVoucherData = {
        voucherNumber: nextVoucherNumber,
        date: batchDate,
        period: batchPeriod,
        type: 'Egreso',
        gloss: `Nómina de Pago N° ${nextBatchNumber} - ${batchGloss}`,
        lines: voucherLines,
        totalDebit: totalBatchAmount,
        totalCredit: totalBatchAmount,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      const voucherDocRef = await addDoc(collection(companyRef, 'vouchers'), newVoucherData);

      // 3. Create Payment Batch in Firestore
      const newBatchData: Omit<PaymentBatch, 'id'> = {
        batchNumber: nextBatchNumber,
        date: batchDate,
        period: batchPeriod,
        bankAccountId: selectedBankAcc.id,
        bankAccountCode: selectedBankAcc.code,
        bankAccountName: selectedBankAcc.name,
        totalAmount: totalBatchAmount,
        itemsCount: totalItemsCount,
        status: 'Procesado',
        gloss: batchGloss,
        voucherId: voucherDocRef.id,
        items: combinedItems,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(companyRef, 'paymentBatches'), newBatchData);

      alert(`✅ Nómina N° ${nextBatchNumber} procesada con éxito.\nSe generó automáticamente el Comprobante de Egreso N° ${nextVoucherNumber} por $${totalBatchAmount.toLocaleString('es-CL')}.`);

      // Reset form
      setIsCreating(false);
      setSelectedPendingIds({});
      setCustomPayItems([]);
      fetchBatches();
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error creating payment batch:', err);
      alert('Error al guardar la nómina: ' + (err.message || 'Intente nuevamente'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Void / Anular Batch
  const handleVoidBatch = async (batch: PaymentBatch) => {
    if (!confirm(`¿Está seguro de anular la Nómina de Pago N° ${batch.batchNumber}? Esto también anulará el comprobante contable asociado.`)) {
      return;
    }

    try {
      await updateDoc(doc(companyRef, 'paymentBatches', batch.id), {
        status: 'Anulado'
      });

      if (batch.voucherId) {
        await updateDoc(doc(companyRef, 'vouchers', batch.voucherId), {
          status: 'Anulado',
          anuladoAt: new Date().toISOString(),
          anuladoReason: `Anulación de Nómina de Pago N° ${batch.batchNumber}`
        });
      }

      alert('Nómina y comprobante contable anulados correctamente.');
      fetchBatches();
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error voiding batch:', err);
      alert('Error al anular nómina: ' + err.message);
    }
  };

  // Export Bank Transfer File (Standard Chilean formats)
  const handleExportBankFile = (batch: PaymentBatch, format: 'Santander' | 'BancoDeChile' | 'BCI' | 'GenericoCSV') => {
    if (!batch.items || batch.items.length === 0) {
      alert('No hay ítems en la nómina para exportar.');
      return;
    }

    let fileContent = '';
    let fileName = `Nomina_${batch.batchNumber}_${format}_${batch.date}.txt`;

    if (format === 'BancoDeChile') {
      // Formato Banco de Chile / Edwards TXT: RUT;Nombre;Banco;TipoCta;NumCta;Monto;Email;Glosa
      const rows = batch.items.map(it => [
        it.rut.replace(/[^0-9kK]/g, ''),
        it.razonSocial.substring(0, 30),
        it.bancoDestino || 'Banco de Chile',
        it.tipoCuentaDestino || 'Corriente',
        it.numeroCuentaDestino || '00000000',
        it.montoPagar.toString(),
        it.emailAviso || '',
        `PAGO FACTURA ${it.folio}`.substring(0, 20)
      ].join(';'));
      fileContent = rows.join('\r\n');
    } else if (format === 'Santander') {
      // Formato Santander TXT plano
      const rows = batch.items.map(it => [
        it.rut.padEnd(12, ' '),
        it.razonSocial.padEnd(40, ' ').substring(0, 40),
        (it.bancoDestino || 'SANTANDER').padEnd(20, ' ').substring(0, 20),
        (it.numeroCuentaDestino || '0').padEnd(20, ' '),
        it.montoPagar.toString().padStart(12, '0'),
        (it.emailAviso || '').padEnd(40, ' ')
      ].join(''));
      fileContent = rows.join('\r\n');
    } else {
      // Formato Genérico CSV
      fileName = `Nomina_Transferencias_${batch.batchNumber}_${batch.date}.csv`;
      const headers = ['RUT', 'Razon Social', 'Tipo Doc', 'Folio', 'Monto a Pagar', 'Banco Destino', 'Tipo Cuenta', 'Numero Cuenta', 'Email Aviso', 'Glosa'];
      const rows = batch.items.map(it => [
        `"${it.rut}"`,
        `"${it.razonSocial}"`,
        it.tipoDoc,
        it.folio,
        it.montoPagar.toString(),
        `"${it.bancoDestino || ''}"`,
        `"${it.tipoCuentaDestino || ''}"`,
        `"${it.numeroCuentaDestino || ''}"`,
        `"${it.emailAviso || ''}"`,
        `"Pago Folio ${it.folio}"`
      ].join(';'));
      fileContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    }

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  };

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return paymentBatches.filter(b => {
      if (periodFilter !== 'Todos' && b.period !== periodFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const numMatch = b.batchNumber.toString().includes(q);
        const bankMatch = b.bankAccountName.toLowerCase().includes(q);
        const glossMatch = (b.gloss || '').toLowerCase().includes(q);
        if (!numMatch && !bankMatch && !glossMatch) return false;
      }
      return true;
    });
  }, [paymentBatches, periodFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Nóminas de Pago a Proveedores</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión de pagos masivos, transferencias bancarias y emisión automática de Comprobantes de Egreso ({company.name})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-xs transition-colors"
            >
              <span>➕</span>
              <span>Nueva Nómina de Pago</span>
            </button>
          ) : (
            <button
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors"
            >
              <span>← Volver al Listado</span>
            </button>
          )}
        </div>
      </div>

      {/* CREATE NEW PAYMENT BATCH VIEW */}
      {isCreating ? (
        <div className="space-y-4">
          {/* Top Form Parameters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <span>📋</span> Parámetros de la Nómina y Egreso Contable
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fecha de Pago:</label>
                <input
                  type="date"
                  value={batchDate}
                  onChange={(e) => {
                    setBatchDate(e.target.value);
                    setBatchPeriod(e.target.value.slice(0, 7));
                  }}
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Período Contable:</label>
                <input
                  type="month"
                  value={batchPeriod}
                  onChange={(e) => setBatchPeriod(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cuenta Bancaria de Origen:</label>
                <select
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {bankAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Glosa del Comprobante:</label>
                <input
                  type="text"
                  value={batchGloss}
                  onChange={(e) => setBatchGloss(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Pending Invoices Selection Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Facturas y Honorarios Pendientes de Pago ({pendingInvoices.length} disponibles)
                </h4>
                <p className="text-[11px] text-slate-500">Marque las casillas para incluir los documentos en la nómina de transferencias.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next: { [id: string]: number } = {};
                    pendingInvoices.forEach(inv => { next[inv.id] = inv.montoTotal; });
                    setSelectedPendingIds(next);
                  }}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded border border-indigo-200"
                >
                  Seleccionar Todos
                </button>
                <button
                  onClick={() => setSelectedPendingIds({})}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded border border-slate-300"
                >
                  Deseleccionar
                </button>
                <button
                  onClick={() => setShowManualForm(!showManualForm)}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded border border-emerald-300"
                >
                  + Pago Manual
                </button>
              </div>
            </div>

            {/* Manual Payment Item Input Modal/Panel */}
            {showManualForm && (
              <div className="p-3 bg-emerald-50/50 border-b border-emerald-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="font-semibold text-slate-700">RUT Proveedor:</label>
                  <input
                    type="text"
                    placeholder="12.345.678-9"
                    value={manualRut}
                    onChange={(e) => setManualRut(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Razón Social:</label>
                  <input
                    type="text"
                    placeholder="Nombre Empresa"
                    value={manualRazon}
                    onChange={(e) => setManualRazon(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Folio Doc:</label>
                  <input
                    type="text"
                    placeholder="12345"
                    value={manualFolio}
                    onChange={(e) => setManualFolio(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Monto a Pagar ($):</label>
                  <input
                    type="number"
                    value={manualMonto}
                    onChange={(e) => setManualMonto(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Banco Destino:</label>
                  <input
                    type="text"
                    value={manualBanco}
                    onChange={(e) => setManualBanco(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">N° Cuenta:</label>
                  <input
                    type="text"
                    value={manualNumCta}
                    onChange={(e) => setManualNumCta(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Email Aviso:</label>
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddManualItem}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-3 rounded shadow-xs"
                  >
                    Agregar a la Nómina
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 w-10 text-center">Sel.</th>
                    <th className="py-2 px-2.5">Emisión</th>
                    <th className="py-2 px-2.5">Tipo</th>
                    <th className="py-2 px-2.5">Folio</th>
                    <th className="py-2 px-3">RUT Proveedor</th>
                    <th className="py-2 px-3">Razón Social</th>
                    <th className="py-2 px-3">Banco / Cta Destino</th>
                    <th className="py-2 px-3 text-right">Total Doc ($)</th>
                    <th className="py-2 px-3 text-right">Monto a Pagar ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {pendingInvoices.length === 0 && customPayItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                        No hay facturas o documentos pendientes de pago en el RCV.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {pendingInvoices.map(inv => {
                        const isSelected = selectedPendingIds[inv.id] !== undefined;
                        const payVal = selectedPendingIds[inv.id] || inv.montoTotal;
                        return (
                          <tr key={inv.id} className={isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectInvoice(inv.id, inv.montoTotal)}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="py-2 px-2.5 text-slate-700">{inv.fechaEmision}</td>
                            <td className="py-2 px-2.5 font-sans font-semibold text-slate-800">
                              {inv.tipoDoc === '33' ? 'Factura Electrónica' : inv.tipoDoc === '34' ? 'Factura Exenta' : inv.tipoDoc}
                            </td>
                            <td className="py-2 px-2.5 font-bold text-indigo-700">{inv.folio}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">{inv.rutEmisor}</td>
                            <td className="py-2 px-3 font-sans truncate max-w-xs text-slate-900 font-medium">
                              {inv.razonSocialEmisor}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-600 text-[10px]">
                              {inv.auxiliaryData ? (
                                <span>{inv.auxiliaryData.banco || 'Bco Chile'} - N° {inv.auxiliaryData.numeroCuenta || 'S/N'}</span>
                              ) : (
                                <span className="text-amber-600">Sin datos bancarios</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900">
                              ${inv.montoTotal.toLocaleString('es-CL')}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {isSelected ? (
                                <input
                                  type="number"
                                  value={payVal}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setSelectedPendingIds(prev => ({ ...prev, [inv.id]: val }));
                                  }}
                                  className="w-24 bg-white border border-indigo-300 rounded px-1.5 py-0.5 text-right font-bold text-indigo-900"
                                />
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Custom items */}
                      {customPayItems.map((c, idx) => (
                        <tr key={`custom_${idx}`} className="bg-emerald-50/40">
                          <td className="py-2 px-3 text-center">
                            <span className="text-emerald-700 font-bold">✓</span>
                          </td>
                          <td className="py-2 px-2.5 text-slate-700">{batchDate}</td>
                          <td className="py-2 px-2.5 font-sans font-semibold text-emerald-800">Manual ({c.tipoDoc})</td>
                          <td className="py-2 px-2.5 font-bold text-emerald-700">{c.folio}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800">{c.rut}</td>
                          <td className="py-2 px-3 font-sans text-slate-900 font-medium">{c.razonSocial}</td>
                          <td className="py-2 px-3 font-sans text-slate-600 text-[10px]">
                            {c.bancoDestino} - N° {c.numeroCuentaDestino}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            ${c.montoTotal.toLocaleString('es-CL')}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-900">
                            ${c.montoPagar.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Summary Bar & Action Button */}
            <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Documentos Seleccionados</span>
                  <span className="text-lg font-black text-emerald-400">{totalItemsCount} pagos</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total a Pagar (Egreso)</span>
                  <span className="text-2xl font-black text-amber-400 font-mono">${totalBatchAmount.toLocaleString('es-CL')}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateBatch}
                  disabled={isSubmitting || totalItemsCount === 0}
                  className={`px-5 py-2 text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition-colors ${
                    isSubmitting || totalItemsCount === 0
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black'
                  }`}
                >
                  <span>⚡</span>
                  <span>{isSubmitting ? 'Procesando Egreso...' : 'Generar Nómina y Comprobante de Egreso'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* BATCHES LIST / HISTORY VIEW */
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-1.5">
                <label className="font-semibold text-slate-700">Período:</label>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="Todos">Todos los Períodos</option>
                  {Array.from(new Set(paymentBatches.map(b => b.period))).sort().reverse().map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <span className="text-slate-400">|</span>
              <span className="text-slate-600 font-semibold">{filteredBatches.length} nóminas registradas</span>
            </div>

            <div>
              <input
                type="text"
                placeholder="Buscar por N° nómina, banco, glosa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white border border-slate-300 rounded-md px-3 py-1 text-xs w-64 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Batches Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-2.5 px-3">N° Nómina</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Período</th>
                    <th className="py-2.5 px-3">Cuenta Bancaria</th>
                    <th className="py-2.5 px-3">Glosa</th>
                    <th className="py-2.5 px-3 text-center">Proveedores</th>
                    <th className="py-2.5 px-3 text-right">Monto Total ($)</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                    <th className="py-2.5 px-3 text-center">Acciones / Exportar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                        No hay nóminas de pago registradas. Haga clic en "Nueva Nómina de Pago" para emitir una.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-indigo-700">N° {b.batchNumber}</td>
                        <td className="py-2 px-3 text-slate-700">{b.date}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{b.period}</td>
                        <td className="py-2 px-3 font-sans text-slate-900">
                          <span className="font-mono font-bold text-slate-800 mr-1">{b.bankAccountCode}</span>
                          {b.bankAccountName}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-600 truncate max-w-xs">{b.gloss}</td>
                        <td className="py-2 px-3 text-center font-bold text-slate-800">{b.itemsCount}</td>
                        <td className="py-2 px-3 text-right font-black text-slate-900">
                          ${b.totalAmount.toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            b.status === 'Procesado'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-sans">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedBatch(b)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200"
                              title="Ver Detalle"
                            >
                              👁️ Ver
                            </button>

                            {b.status !== 'Anulado' && (
                              <>
                                <button
                                  onClick={() => handleExportBankFile(b, 'BancoDeChile')}
                                  className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded border border-blue-200"
                                  title="Exportar archivo TXT Banco de Chile"
                                >
                                  📥 Bco Chile
                                </button>
                                <button
                                  onClick={() => handleExportBankFile(b, 'Santander')}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded border border-rose-200"
                                  title="Exportar archivo TXT Santander"
                                >
                                  📥 Santander
                                </button>
                                <button
                                  onClick={() => handleExportBankFile(b, 'GenericoCSV')}
                                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded border border-emerald-200"
                                  title="Exportar CSV"
                                >
                                  📥 CSV
                                </button>
                                <button
                                  onClick={() => handleVoidBatch(b)}
                                  className="px-1.5 py-1 bg-slate-100 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded border border-slate-300"
                                  title="Anular Nómina"
                                >
                                  ✕
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h4 className="text-base font-black tracking-tight uppercase">
                  Detalle de Nómina de Pago N° {selectedBatch.batchNumber}
                </h4>
                <p className="text-xs text-slate-400">
                  Fecha: {selectedBatch.date} | Cuenta: {selectedBatch.bankAccountCode} - {selectedBatch.bankAccountName} | Estado: {selectedBatch.status}
                </p>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-slate-500 font-semibold block">Glosa del Egreso:</span>
                  <span className="text-slate-900 font-bold">{selectedBatch.gloss}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 font-semibold block">Total Nómina:</span>
                  <span className="text-lg font-black text-indigo-700 font-mono">${selectedBatch.totalAmount.toLocaleString('es-CL')}</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">RUT Proveedor</th>
                      <th className="py-2 px-3">Razón Social</th>
                      <th className="py-2 px-2.5">Tipo Doc</th>
                      <th className="py-2 px-2.5">Folio</th>
                      <th className="py-2 px-3">Banco / Tipo Cta</th>
                      <th className="py-2 px-3">N° Cuenta</th>
                      <th className="py-2 px-3 text-right">Monto Pagado ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                    {selectedBatch.items && selectedBatch.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-800">{it.rut}</td>
                        <td className="py-2 px-3 font-sans text-slate-900 font-medium">{it.razonSocial}</td>
                        <td className="py-2 px-2.5">{it.tipoDoc}</td>
                        <td className="py-2 px-2.5 font-bold text-indigo-700">{it.folio}</td>
                        <td className="py-2 px-3 font-sans text-slate-600">{it.bancoDestino} ({it.tipoCuentaDestino})</td>
                        <td className="py-2 px-3 text-slate-800">{it.numeroCuentaDestino || '-'}</td>
                        <td className="py-2 px-3 text-right font-black text-slate-900">
                          ${it.montoPagar.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportBankFile(selectedBatch, 'BancoDeChile')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded"
                >
                  Descargar TXT Banco de Chile
                </button>
                <button
                  onClick={() => handleExportBankFile(selectedBatch, 'Santander')}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded"
                >
                  Descargar TXT Santander
                </button>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
