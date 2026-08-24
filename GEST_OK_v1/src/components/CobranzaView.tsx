import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Company, ChartOfAccount, Auxiliary, RCVDocument, Voucher, CollectionRecord, CollectionItem, FiscalPeriodYear } from '../types';

interface CobranzaViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
}

export default function CobranzaView({
  studyId,
  company,
  accounts,
  auxiliaries,
  rcvDocuments,
  vouchers,
  fiscalYears,
  onVouchersUpdated
}: CobranzaViewProps) {
  const [collectionRecords, setCollectionRecords] = useState<CollectionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'historial' | 'cuentaCorriente'>('pendientes');

  // Filters
  const [agingFilter, setAgingFilter] = useState<string>('Todos');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [selectedCustomerRut, setSelectedCustomerRut] = useState<string>('');

  // New Collection Form
  const [showCollectModal, setShowCollectModal] = useState<boolean>(false);
  const [collectDate, setCollectDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [collectPeriod, setCollectPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [paymentMethod, setPaymentMethod] = useState<'Transferencia' | 'Efectivo' | 'Cheque' | 'Transbank' | 'Otro'>('Transferencia');
  const [selectedDepositAccountId, setSelectedDepositAccountId] = useState<string>('');
  const [collectGloss, setCollectGloss] = useState<string>('Recaudación y cobro de facturas de venta');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<{ [id: string]: number }>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Bank & Cash accounts from chart of accounts
  const depositAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const code = acc.code || '';
      const name = (acc.name || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();
      return (
        acc.estado !== 'Inactivo' &&
        (type.includes('activo') || code.startsWith('1')) &&
        (name.includes('banco') || name.includes('caja') || name.includes('cuenta corriente') || name.includes('transbank') || code.startsWith('1-1-01'))
      );
    });
  }, [accounts]);

  useEffect(() => {
    if (depositAccounts.length > 0 && !selectedDepositAccountId) {
      setSelectedDepositAccountId(depositAccounts[0].id);
    }
  }, [depositAccounts, selectedDepositAccountId]);

  // Fetch Collections
  const fetchCollections = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(companyRef, 'collections'));
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as CollectionRecord));
      recs.sort((a, b) => (b.recordNumber || 0) - (a.recordNumber || 0));
      setCollectionRecords(recs);
    } catch (err) {
      console.error('Error loading collection records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [company.id]);

  // Invoices from RCV (Ventas) pending collection
  const invoicesWithAging = useMemo(() => {
    const collectedDocIds = new Set<string>();
    collectionRecords.forEach(rec => {
      if (rec.status !== 'Anulado' && rec.items) {
        rec.items.forEach(it => {
          if (it.rcvDocId) collectedDocIds.add(it.rcvDocId);
        });
      }
    });

    const today = new Date();

    return rcvDocuments
      .filter(doc => doc.tipoRegistro === 'Venta' && !collectedDocIds.has(doc.id))
      .map(doc => {
        const issueDate = new Date(doc.fechaEmision);
        const diffTime = Math.abs(today.getTime() - issueDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let agingCategory = '0-30';
        let agingLabel = '0-30 días (Vigente)';
        let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';

        if (diffDays > 90) {
          agingCategory = '+90';
          agingLabel = '+90 días (Vencido)';
          badgeColor = 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
        } else if (diffDays > 60) {
          agingCategory = '61-90';
          agingLabel = '61-90 días (Crítico)';
          badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
        } else if (diffDays > 30) {
          agingCategory = '31-60';
          agingLabel = '31-60 días';
          badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
        }

        return {
          ...doc,
          diffDays,
          agingCategory,
          agingLabel,
          badgeColor
        };
      });
  }, [rcvDocuments, collectionRecords]);

  // Aging Summary Metrics
  const agingStats = useMemo(() => {
    let totalPending = 0;
    let count0_30 = 0;
    let sum0_30 = 0;
    let count31_60 = 0;
    let sum31_60 = 0;
    let count61_90 = 0;
    let sum61_90 = 0;
    let countOver90 = 0;
    let sumOver90 = 0;

    invoicesWithAging.forEach(inv => {
      totalPending += inv.montoTotal;
      if (inv.agingCategory === '0-30') {
        count0_30++;
        sum0_30 += inv.montoTotal;
      } else if (inv.agingCategory === '31-60') {
        count31_60++;
        sum31_60 += inv.montoTotal;
      } else if (inv.agingCategory === '61-90') {
        count61_90++;
        sum61_90 += inv.montoTotal;
      } else {
        countOver90++;
        sumOver90 += inv.montoTotal;
      }
    });

    return {
      totalPending,
      totalCount: invoicesWithAging.length,
      sum0_30, count0_30,
      sum31_60, count31_60,
      sum61_90, count61_90,
      sumOver90, countOver90
    };
  }, [invoicesWithAging]);

  // Filtered Pending Invoices
  const filteredPending = useMemo(() => {
    return invoicesWithAging.filter(inv => {
      if (agingFilter !== 'Todos' && inv.agingCategory !== agingFilter) return false;
      if (customerSearch.trim()) {
        const q = customerSearch.toLowerCase();
        const rutMatch = inv.rutEmisor.toLowerCase().includes(q);
        const nameMatch = inv.razonSocialEmisor.toLowerCase().includes(q);
        const folioMatch = inv.folio.toLowerCase().includes(q);
        if (!rutMatch && !nameMatch && !folioMatch) return false;
      }
      return true;
    });
  }, [invoicesWithAging, agingFilter, customerSearch]);

  // Toggle selection for collection
  const toggleSelectInvoice = (id: string, total: number) => {
    setSelectedInvoiceIds(prev => {
      const next = { ...prev };
      if (next[id] !== undefined) {
        delete next[id];
      } else {
        next[id] = total;
      }
      return next;
    });
  };

  // Selected invoices for collection
  const selectedItemsToCollect = useMemo(() => {
    const items: CollectionItem[] = [];
    invoicesWithAging.forEach(inv => {
      if (selectedInvoiceIds[inv.id] !== undefined) {
        items.push({
          rcvDocId: inv.id,
          rut: inv.rutEmisor,
          razonSocial: inv.razonSocialEmisor,
          tipoDoc: inv.tipoDoc,
          folio: inv.folio,
          montoTotal: inv.montoTotal,
          montoCobrado: selectedInvoiceIds[inv.id]
        });
      }
    });
    const total = items.reduce((s, it) => s + it.montoCobrado, 0);
    return { items, total };
  }, [invoicesWithAging, selectedInvoiceIds]);

  // Handle Process Collection & Generate Ingreso Voucher
  const handleProcessCollection = async () => {
    if (selectedItemsToCollect.items.length === 0) {
      alert('Seleccione al menos una factura a cobrar.');
      return;
    }
    if (!selectedDepositAccountId) {
      alert('Seleccione la cuenta bancaria o caja de destino.');
      return;
    }

    const depositAcc = accounts.find(a => a.id === selectedDepositAccountId);
    if (!depositAcc) {
      alert('Cuenta contable no encontrada.');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextRecordNumber = (collectionRecords.length > 0 ? Math.max(...collectionRecords.map(r => r.recordNumber || 0)) : 0) + 1;
      const nextVoucherNumber = (vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0) + 1;

      const customerReceivableAcc = accounts.find(a => a.code.startsWith('1-1-02') || a.name.toLowerCase().includes('cliente')) || {
        id: 'acc_cli_default',
        code: '1-1-02-01',
        name: 'Clientes por Cobrar'
      };

      const totalAmount = selectedItemsToCollect.total;

      // 1. Voucher Lines for Ingreso
      const voucherLines = [
        // Línea 1: Banco o Caja al DEBE (Aumenta el Activo disponible)
        {
          id: 'line_1',
          accountId: depositAcc.id,
          accountCode: depositAcc.code,
          accountName: depositAcc.name,
          debit: totalAmount,
          credit: 0,
          documentRef: `Recaudación N° ${nextRecordNumber}`,
          gloss: `Cobro ${selectedItemsToCollect.items.length} facturas (${paymentMethod})`
        },
        // Línea 2: Clientes por Cobrar al HABER (Disminuye la cuenta por cobrar)
        {
          id: 'line_2',
          accountId: customerReceivableAcc.id,
          accountCode: customerReceivableAcc.code,
          accountName: customerReceivableAcc.name,
          debit: 0,
          credit: totalAmount,
          documentRef: `Recaudación N° ${nextRecordNumber}`,
          gloss: `Saldado de Clientes según Recaudación N° ${nextRecordNumber}`
        }
      ];

      // 2. Create Voucher in Firestore
      const newVoucherData = {
        voucherNumber: nextVoucherNumber,
        date: collectDate,
        period: collectPeriod,
        type: 'Ingreso',
        gloss: `Recaudación N° ${nextRecordNumber} (${paymentMethod}) - ${collectGloss}`,
        lines: voucherLines,
        totalDebit: totalAmount,
        totalCredit: totalAmount,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      const vRef = await addDoc(collection(companyRef, 'vouchers'), newVoucherData);

      // 3. Create Collection Record in Firestore
      const newRecordData: Omit<CollectionRecord, 'id'> = {
        recordNumber: nextRecordNumber,
        date: collectDate,
        period: collectPeriod,
        paymentMethod,
        depositAccountId: depositAcc.id,
        depositAccountCode: depositAcc.code,
        depositAccountName: depositAcc.name,
        totalAmount,
        gloss: collectGloss,
        status: 'Valido',
        voucherId: vRef.id,
        items: selectedItemsToCollect.items,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(companyRef, 'collections'), newRecordData);

      alert(`✅ Recaudación N° ${nextRecordNumber} registrada con éxito.\nSe generó automáticamente el Comprobante de Ingreso N° ${nextVoucherNumber} por $${totalAmount.toLocaleString('es-CL')}.`);

      setShowCollectModal(false);
      setSelectedInvoiceIds({});
      fetchCollections();
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error processing collection:', err);
      alert('Error al registrar cobranza: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Void Collection Record
  const handleVoidCollection = async (rec: CollectionRecord) => {
    if (!confirm(`¿Está seguro de anular la Recaudación N° ${rec.recordNumber}? Esto anulará el comprobante de ingreso asociado y reabrirá las facturas.`)) {
      return;
    }

    try {
      await updateDoc(doc(companyRef, 'collections', rec.id), {
        status: 'Anulado'
      });

      if (rec.voucherId) {
        await updateDoc(doc(companyRef, 'vouchers', rec.voucherId), {
          status: 'Anulado',
          anuladoAt: new Date().toISOString(),
          anuladoReason: `Anulación de Recaudación N° ${rec.recordNumber}`
        });
      }

      alert('Recaudación y comprobante anulados exitosamente.');
      fetchCollections();
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error voiding collection:', err);
      alert('Error al anular: ' + err.message);
    }
  };

  // Unique customers for Current Account statement
  const customersList = useMemo(() => {
    const map = new Map<string, { rut: string; razonSocial: string; totalPending: number }>();
    invoicesWithAging.forEach(inv => {
      const cleanRut = inv.rutEmisor.trim().toUpperCase();
      const current = map.get(cleanRut) || { rut: cleanRut, razonSocial: inv.razonSocialEmisor, totalPending: 0 };
      current.totalPending += inv.montoTotal;
      map.set(cleanRut, current);
    });
    return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending);
  }, [invoicesWithAging]);

  // Export aging report to CSV
  const handleExportAgingCSV = () => {
    const headers = ['RUT Cliente', 'Razon Social', 'Tipo Doc', 'Folio', 'Fecha Emision', 'Dias Transcurridos', 'Tramo Antiguedad', 'Monto Pendiente'];
    const rows = invoicesWithAging.map(inv => [
      `"${inv.rutEmisor}"`,
      `"${inv.razonSocialEmisor}"`,
      inv.tipoDoc,
      inv.folio,
      inv.fechaEmision,
      inv.diffDays.toString(),
      `"${inv.agingLabel}"`,
      inv.montoTotal.toString()
    ].join(';'));

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Antiguedad_Saldos_${company.name}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📑</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Cobranza y Cuentas por Cobrar</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Control de facturas de venta pendientes, antigüedad de saldos (Aging) y registro de recaudaciones con emisión automática de Ingresos ({company.name})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {Object.keys(selectedInvoiceIds).length > 0 && (
            <button
              onClick={() => setShowCollectModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg flex items-center gap-2 shadow-xs transition-colors"
            >
              <span>⚡</span>
              <span>Registrar Cobro ({Object.keys(selectedInvoiceIds).length} facturas)</span>
            </button>
          )}

          <button
            onClick={handleExportAgingCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Exportar Aging CSV</span>
          </button>
        </div>
      </div>

      {/* AGING CARDS / KPIS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Cartera Total</span>
          <span className="text-xl font-black font-mono text-emerald-400 block mt-1">
            ${agingStats.totalPending.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-slate-400">{agingStats.totalCount} facturas pendientes</span>
        </div>

        <div
          onClick={() => setAgingFilter('0-30')}
          className={`p-3 rounded-xl border cursor-pointer transition-all ${
            agingFilter === '0-30' ? 'bg-emerald-100 border-emerald-500 ring-2 ring-emerald-400' : 'bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100/60'
          }`}
        >
          <span className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider block">0 - 30 Días (Vigente)</span>
          <span className="text-lg font-black font-mono text-emerald-900 block mt-1">
            ${agingStats.sum0_30.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold">{agingStats.count0_30} documentos</span>
        </div>

        <div
          onClick={() => setAgingFilter('31-60')}
          className={`p-3 rounded-xl border cursor-pointer transition-all ${
            agingFilter === '31-60' ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-400' : 'bg-blue-50/70 border-blue-200 hover:bg-blue-100/60'
          }`}
        >
          <span className="text-[10px] text-blue-900 font-bold uppercase tracking-wider block">31 - 60 Días</span>
          <span className="text-lg font-black font-mono text-blue-900 block mt-1">
            ${agingStats.sum31_60.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-blue-700 font-semibold">{agingStats.count31_60} documentos</span>
        </div>

        <div
          onClick={() => setAgingFilter('61-90')}
          className={`p-3 rounded-xl border cursor-pointer transition-all ${
            agingFilter === '61-90' ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-400' : 'bg-amber-50/70 border-amber-200 hover:bg-amber-100/60'
          }`}
        >
          <span className="text-[10px] text-amber-900 font-bold uppercase tracking-wider block">61 - 90 Días</span>
          <span className="text-lg font-black font-mono text-amber-900 block mt-1">
            ${agingStats.sum61_90.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-amber-700 font-semibold">{agingStats.count61_90} documentos</span>
        </div>

        <div
          onClick={() => setAgingFilter('+90')}
          className={`p-3 rounded-xl border cursor-pointer transition-all ${
            agingFilter === '+90' ? 'bg-rose-100 border-rose-500 ring-2 ring-rose-400' : 'bg-rose-50/70 border-rose-200 hover:bg-rose-100/60'
          }`}
        >
          <span className="text-[10px] text-rose-900 font-bold uppercase tracking-wider block">+90 Días (Vencido)</span>
          <span className="text-lg font-black font-mono text-rose-900 block mt-1">
            ${agingStats.sumOver90.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-rose-700 font-semibold">{agingStats.countOver90} documentos</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 gap-2">
        <button
          onClick={() => setActiveTab('pendientes')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'pendientes'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⏳ Facturas Pendientes</span>
          <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full text-[10px]">{invoicesWithAging.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('historial')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'historial'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📑 Historial de Recaudaciones</span>
          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">{collectionRecords.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('cuentaCorriente')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'cuentaCorriente'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>👤 Cuenta Corriente por Cliente</span>
        </button>
      </div>

      {/* TAB 1: PENDING INVOICES & AGING */}
      {activeTab === 'pendientes' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs overflow-hidden space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-semibold text-slate-700">Filtrar Tramo:</label>
              <select
                value={agingFilter}
                onChange={(e) => setAgingFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Todos">Todos los Tramos</option>
                <option value="0-30">0 a 30 días</option>
                <option value="31-60">31 a 60 días</option>
                <option value="61-90">61 a 90 días</option>
                <option value="+90">+90 días (Vencido)</option>
              </select>

              <button
                onClick={() => {
                  const next: { [id: string]: number } = {};
                  filteredPending.forEach(inv => { next[inv.id] = inv.montoTotal; });
                  setSelectedInvoiceIds(next);
                }}
                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded border border-indigo-200"
              >
                Seleccionar Visibles
              </button>
              <button
                onClick={() => setSelectedInvoiceIds({})}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded border border-slate-300"
              >
                Limpiar
              </button>
            </div>

            <div>
              <input
                type="text"
                placeholder="Buscar cliente, RUT, folio..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="bg-white border border-slate-300 rounded px-3 py-1 text-xs w-64 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">Sel.</th>
                  <th className="py-2.5 px-2.5">Emisión</th>
                  <th className="py-2.5 px-2.5">Tipo</th>
                  <th className="py-2.5 px-2.5">Folio</th>
                  <th className="py-2.5 px-3">RUT Cliente</th>
                  <th className="py-2.5 px-3">Razón Social</th>
                  <th className="py-2.5 px-2.5 text-center">Días</th>
                  <th className="py-2.5 px-3">Antigüedad</th>
                  <th className="py-2.5 px-3 text-right">Monto Total ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {filteredPending.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay facturas de venta pendientes de cobro con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredPending.map(inv => {
                    const isSelected = selectedInvoiceIds[inv.id] !== undefined;
                    return (
                      <tr key={inv.id} className={isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}>
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
                        <td className="py-2 px-3 font-sans truncate max-w-xs text-slate-900 font-medium">{inv.razonSocialEmisor}</td>
                        <td className="py-2 px-2.5 text-center font-bold text-slate-700">{inv.diffDays} d</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] border ${inv.badgeColor}`}>
                            {inv.agingLabel}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-black text-slate-900">
                          ${inv.montoTotal.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORIAL DE RECAUDACIONES */}
      {activeTab === 'historial' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-2.5 px-3">N° Recibo</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Medio de Pago</th>
                  <th className="py-2.5 px-3">Cuenta Destino</th>
                  <th className="py-2.5 px-3">Glosa</th>
                  <th className="py-2.5 px-3 text-center">Facturas</th>
                  <th className="py-2.5 px-3 text-right">Monto Recaudado ($)</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {collectionRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay registros de recaudaciones o cobranzas procesadas.
                    </td>
                  </tr>
                ) : (
                  collectionRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-emerald-700">REC-N° {rec.recordNumber}</td>
                      <td className="py-2 px-3 text-slate-700">{rec.date}</td>
                      <td className="py-2 px-3 font-sans font-bold text-slate-800">{rec.paymentMethod}</td>
                      <td className="py-2 px-3 font-sans text-slate-900">
                        <span className="font-mono font-bold mr-1">{rec.depositAccountCode}</span>
                        {rec.depositAccountName}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-600 truncate max-w-xs">{rec.gloss}</td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800">{rec.items?.length || 1}</td>
                      <td className="py-2 px-3 text-right font-black text-emerald-700">
                        ${rec.totalAmount.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          rec.status === 'Valido'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center font-sans">
                        {rec.status === 'Valido' && (
                          <button
                            onClick={() => handleVoidCollection(rec)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded border border-rose-200"
                            title="Anular Recaudación"
                          >
                            Anular
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CUENTA CORRIENTE POR CLIENTE */}
      {activeTab === 'cuentaCorriente' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex-1 min-w-[280px]">
              <label className="block text-xs font-bold text-slate-700 mb-1">Seleccionar Cliente para Auditoría:</label>
              <select
                value={selectedCustomerRut}
                onChange={(e) => setSelectedCustomerRut(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Seleccione un Cliente ({customersList.length} con saldo) --</option>
                {customersList.map(c => (
                  <option key={c.rut} value={c.rut}>
                    {c.rut} - {c.razonSocial} (Saldo: ${c.totalPending.toLocaleString('es-CL')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedCustomerRut ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-900 text-white flex justify-between items-center">
                <span className="font-bold text-xs">
                  Detalle de Documentos Pendientes del Cliente {selectedCustomerRut}
                </span>
                <span className="text-amber-400 font-mono font-black text-sm">
                  Deuda Total: $
                  {invoicesWithAging
                    .filter(i => i.rutEmisor.trim().toUpperCase() === selectedCustomerRut)
                    .reduce((s, i) => s + i.montoTotal, 0)
                    .toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Fecha Emisión</th>
                    <th className="py-2 px-3">Tipo Doc</th>
                    <th className="py-2 px-3">Folio</th>
                    <th className="py-2 px-3">Días Vencidos</th>
                    <th className="py-2 px-3">Tramo</th>
                    <th className="py-2 px-3 text-right">Monto Documento ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {invoicesWithAging
                    .filter(i => i.rutEmisor.trim().toUpperCase() === selectedCustomerRut)
                    .map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3">{inv.fechaEmision}</td>
                        <td className="py-2 px-3 font-sans font-semibold">{inv.tipoDoc}</td>
                        <td className="py-2 px-3 font-bold text-indigo-700">{inv.folio}</td>
                        <td className="py-2 px-3 font-bold text-slate-700">{inv.diffDays} días</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${inv.badgeColor}`}>
                            {inv.agingLabel}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-black text-slate-900">
                          ${inv.montoTotal.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 italic">
              Seleccione un cliente arriba para ver el detalle de su cuenta corriente y facturas pendientes.
            </div>
          )}
        </div>
      )}

      {/* COLLECT MODAL */}
      {showCollectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden">
            <div className="p-4 bg-emerald-700 text-white flex justify-between items-center">
              <div>
                <h4 className="text-base font-black tracking-tight uppercase">
                  Registrar Cobro y Emisión de Ingreso
                </h4>
                <p className="text-xs text-emerald-100">
                  {selectedItemsToCollect.items.length} facturas seleccionadas por un total de ${selectedItemsToCollect.total.toLocaleString('es-CL')}
                </p>
              </div>
              <button
                onClick={() => setShowCollectModal(false)}
                className="text-emerald-100 hover:text-white text-lg font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fecha de Recaudación:</label>
                  <input
                    type="date"
                    value={collectDate}
                    onChange={(e) => {
                      setCollectDate(e.target.value);
                      setCollectPeriod(e.target.value.slice(0, 7));
                    }}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Medio de Pago:</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-medium"
                  >
                    <option value="Transferencia">Transferencia Bancaria</option>
                    <option value="Efectivo">Efectivo / Caja</option>
                    <option value="Cheque">Cheque al Día / Fecha</option>
                    <option value="Transbank">Transbank / WebPay</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cuenta de Destino (Depósito):</label>
                  <select
                    value={selectedDepositAccountId}
                    onChange={(e) => setSelectedDepositAccountId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-medium"
                  >
                    {depositAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Glosa del Comprobante:</label>
                  <input
                    type="text"
                    value={collectGloss}
                    onChange={(e) => setCollectGloss(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-medium"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[11px] font-bold text-slate-700 uppercase block mb-1">Efecto Contable Automático:</span>
                <div className="font-mono text-[11px] text-slate-800 space-y-1">
                  <div className="text-emerald-700 font-bold">
                    [DEBE] Cuenta Bancaria / Caja Seleccionada: +${selectedItemsToCollect.total.toLocaleString('es-CL')}
                  </div>
                  <div className="text-indigo-700 font-bold">
                    [HABER] 1-1-02-01 Clientes por Cobrar: -${selectedItemsToCollect.total.toLocaleString('es-CL')}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowCollectModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessCollection}
                disabled={isSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded shadow-xs"
              >
                {isSubmitting ? 'Procesando...' : 'Confirmar Cobro e Ingreso Contable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
