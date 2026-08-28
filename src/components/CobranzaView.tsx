import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Company, ChartOfAccount, Auxiliary, RCVDocument, Voucher, CollectionRecord, CollectionItem, FiscalPeriodYear } from '../types';
import { checkIsPeriodClosed } from '../utils/periodUtils';
import { logAuditEvent } from '../utils/auditLogger';

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


const isNotaCredito = (tipoDoc: string | number) => {
  const str = String(tipoDoc).toLowerCase();
  return str === '61' || str.includes('61') || str.includes('crédito') || str.includes('credito');
};

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

  // Column Specific Filters
  const [colFilterDate, setColFilterDate] = useState<string>('');
  const [colFilterType, setColFilterType] = useState<string>('Todos');
  const [colFilterFolio, setColFilterFolio] = useState<string>('');
  const [colFilterRut, setColFilterRut] = useState<string>('');
  const [colFilterRazon, setColFilterRazon] = useState<string>('');
  const [colFilterDays, setColFilterDays] = useState<string>('');
  const [colFilterAging, setColFilterAging] = useState<string>('Todos');
  const [colFilterAmount, setColFilterAmount] = useState<string>('');

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

  // Bank & Cash accounts from chart of accounts (prioritizing accounts with requiereConciliacionBancaria = true)
  const depositAccounts = useMemo(() => {
    const list = accounts.filter(acc => {
      if (acc.estado === 'Inactivo') return false;
      const code = (acc.code || '').replace(/-/g, '.');
      const name = (acc.name || '').toLowerCase();
      return (
        acc.requiereConciliacionBancaria ||
        (code.startsWith('1.1.01') && (name.includes('banco') || name.includes('cuenta corriente') || name.includes('caja') || name.includes('tesoreria') || name.includes('transbank')))
      );
    });

    if (list.length === 0) {
      return accounts.filter(acc => {
        if (acc.estado === 'Inactivo') return false;
        const code = (acc.code || '').replace(/-/g, '.');
        const name = (acc.name || '').toLowerCase();
        return code.startsWith('1.1.01') || name.includes('banco') || name.includes('caja');
      });
    }

    return list;
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

    // Build set of RUTs and Folios collected or canceled via NCs or Vouchers
    const canceledOrCollectedDocKeys = new Set<string>();

    // A) Check RCV Credit Notes (tipoDoc 61) for Sales
    rcvDocuments.forEach(d => {
      if (d.tipoRegistro === 'Venta' && (String(d.tipoDoc) === '61' || String(d.tipoDoc).includes('61'))) {
        const rut = (d.rutReceptor || d.rutEmisor || '').toUpperCase().replace(/\./g, '').trim();
        const folio = String(d.folio || '').trim();
        const refFolio = String(d.refFolioOrig || '').trim();
        if (folio) canceledOrCollectedDocKeys.add(`${rut}__${folio}`);
        if (refFolio) canceledOrCollectedDocKeys.add(`${rut}__${refFolio}`);
      }
    });

    // B) Check Vouchers for collections/credits on Clientes (1.1.02 / Clientes)
    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      v.lines.forEach(line => {
        if (!line.auxiliaryRut) return;
        const lineCode = (line.accountCode || '').trim();
        const lineName = (line.accountName || '').toLowerCase();
        const isClientAcc = lineCode.startsWith('1.1.02') || lineName.includes('cliente');
        const credit = Number(line.credit) || 0;

        if (isClientAcc && credit > 0) {
          const rut = line.auxiliaryRut.toUpperCase().replace(/\./g, '').trim();
          const refStr = (line.documentRef || line.gloss || '').trim();
          const numMatch = refStr.match(/\b(\d+)\b/);
          if (numMatch) {
            canceledOrCollectedDocKeys.add(`${rut}__${numMatch[1]}`);
          }
        }
      });
    });

    const today = new Date();

    return rcvDocuments
      .filter(doc => {
        if (doc.tipoRegistro !== 'Venta') return false;
        if (collectedDocIds.has(doc.id)) return false;
        if (String(doc.tipoDoc) === '61') return false;

        const rut = (doc.rutReceptor || doc.rutEmisor || '').toUpperCase().replace(/\./g, '').trim();
        const folio = String(doc.folio || '').trim();
        if (canceledOrCollectedDocKeys.has(`${rut}__${folio}`)) return false;

        return true;
      })
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
  }, [rcvDocuments, collectionRecords, vouchers]);

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
      // Column search filters
      if (colFilterDate.trim() && !inv.fechaEmision.toLowerCase().includes(colFilterDate.toLowerCase().trim())) {
        return false;
      }
      if (colFilterType !== 'Todos') {
        if (colFilterType === '61' && !isNotaCredito(inv.tipoDoc)) return false;
        if (colFilterType !== '61' && String(inv.tipoDoc) !== colFilterType) return false;
      }
      if (colFilterFolio.trim() && !String(inv.folio).toLowerCase().includes(colFilterFolio.toLowerCase().trim())) {
        return false;
      }
      if (colFilterRut.trim() && !inv.rutEmisor.toLowerCase().includes(colFilterRut.toLowerCase().trim())) {
        return false;
      }
      if (colFilterRazon.trim() && !inv.razonSocialEmisor.toLowerCase().includes(colFilterRazon.toLowerCase().trim())) {
        return false;
      }
      if (colFilterDays.trim() && !String(inv.diffDays).includes(colFilterDays.trim())) {
        return false;
      }
      if (colFilterAging !== 'Todos' && inv.agingCategory !== colFilterAging) {
        return false;
      }
      if (colFilterAmount.trim() && !String(inv.montoTotal).includes(colFilterAmount.trim())) {
        return false;
      }
      return true;
    });
  }, [invoicesWithAging, agingFilter, customerSearch, colFilterDate, colFilterType, colFilterFolio, colFilterRut, colFilterRazon, colFilterDays, colFilterAging, colFilterAmount]);

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
    const total = items.reduce((s, it) => {
      const isNC = isNotaCredito(it.tipoDoc);
      return s + (isNC ? -Math.abs(it.montoCobrado) : Math.abs(it.montoCobrado));
    }, 0);
    return { items, total };
  }, [invoicesWithAging, selectedInvoiceIds]);

  // Handle Process Collection & Generate Ingreso Voucher
  const handleProcessCollection = async () => {
    if (selectedItemsToCollect.items.length === 0) {
      alert('Seleccione al menos una factura a cobrar.');
      return;
    }

    const periodCheck = checkIsPeriodClosed(collectPeriod, fiscalYears);
    if (periodCheck.isClosed) {
      alert(periodCheck.errorMsg);
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

      // 1. Voucher Lines for Ingreso (Individual lines per document with RUT, Name and DocumentRef)
      const customerLines = selectedItemsToCollect.items.map((it, idx) => {
        const isNC = isNotaCredito(it.tipoDoc);
        const amount = Math.abs(it.montoCobrado);
        const docRefStr = `${it.tipoDoc} N° ${it.folio}`;

        return {
          id: `line_cust_${idx + 1}`,
          accountId: customerReceivableAcc.id,
          accountCode: customerReceivableAcc.code,
          accountName: customerReceivableAcc.name,
          auxiliaryRut: it.rut,
          auxiliaryName: it.razonSocial,
          debit: isNC ? amount : 0,
          credit: isNC ? 0 : amount,
          documentRef: docRefStr,
          gloss: `Cobro ${isNC ? 'NC' : 'Factura'} ${docRefStr} (${it.razonSocial})`
        };
      });

      const bankLine = {
        id: `line_bank_${customerLines.length + 1}`,
        accountId: depositAcc.id,
        accountCode: depositAcc.code,
        accountName: depositAcc.name,
        debit: totalAmount,
        credit: 0,
        documentRef: `Recaudación N° ${nextRecordNumber}`,
        gloss: `Ingreso Bancario Recaudación N° ${nextRecordNumber} (${paymentMethod})`
      };

      const voucherLines = [bankLine, ...customerLines];
      const totalDebitVal = voucherLines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCreditVal = voucherLines.reduce((s, l) => s + (l.credit || 0), 0);

      // 2. Create Voucher in Firestore
      const newVoucherData = {
        voucherNumber: nextVoucherNumber,
        date: collectDate,
        period: collectPeriod,
        type: 'Ingreso',
        gloss: `Recaudación N° ${nextRecordNumber} (${paymentMethod}) - ${collectGloss}`,
        lines: voucherLines,
        totalDebit: totalDebitVal,
        totalCredit: totalCreditVal,
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
    const periodCheck = checkIsPeriodClosed(rec.period || rec.date, fiscalYears);
    if (periodCheck.isClosed) {
      alert(periodCheck.errorMsg);
      return;
    }

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

      // Audit Log
      await logAuditEvent({
        userId: auth.currentUser?.uid || 'anonymous',
        userEmail: auth.currentUser?.email || 'sistema',
        action: 'ANULAR',
        module: 'PAGOS_COBRANZAS',
        studyId: studyId,
        companyId: company.id,
        companyName: company.name,
        details: `Anulación de Recaudación N° ${rec.recordNumber} por $${rec.totalAmount.toLocaleString('es-CL')}. Anulado comprobante ${rec.voucherId || 'N/A'}. Facturas liberadas.`,
        metadata: {
          action: 'CANCEL',
          documentType: 'RECAUDACION',
          documentId: rec.id,
          recordNumber: rec.recordNumber,
          voucherId: rec.voucherId,
          motivo: `Anulación de Recaudación N° ${rec.recordNumber}`,
          totalAmount: rec.totalAmount,
          date: rec.date,
          period: rec.period
        }
      });

      alert('✅ Recaudación y comprobante anulados exitosamente.');
      fetchCollections();
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error voiding collection:', err);
      alert('Error al anular: ' + err.message);
    }
  };

  // Delete Collection Record
  const handleDeleteCollection = async (rec: CollectionRecord) => {
    alert('La eliminación permanente está desactivada por normativas de auditoría. Por favor, utilice la opción de "Anular" para revertir esta operación.');
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

          <div className="overflow-auto max-h-[500px] border border-slate-200 rounded-lg relative shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase sticky top-0 z-20 shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center bg-slate-100">Sel.</th>
                  <th className="py-2.5 px-2.5 bg-slate-100">Emisión</th>
                  <th className="py-2.5 px-2.5 bg-slate-100">Tipo</th>
                  <th className="py-2.5 px-2.5 bg-slate-100">Folio</th>
                  <th className="py-2.5 px-3 bg-slate-100">RUT Cliente</th>
                  <th className="py-2.5 px-3 bg-slate-100">Razón Social</th>
                  <th className="py-2.5 px-2.5 text-center bg-slate-100">Días</th>
                  <th className="py-2.5 px-3 bg-slate-100">Antigüedad</th>
                  <th className="py-2.5 px-3 text-right bg-slate-100">Monto Total ($)</th>
                </tr>
                {/* Column Filter Row */}
                <tr className="bg-slate-50 border-b border-slate-200 text-xs normal-case sticky top-[38px] z-10 shadow-2xs font-normal">
                  <th className="p-1 text-center">
                    {(colFilterDate || colFilterType !== 'Todos' || colFilterFolio || colFilterRut || colFilterRazon || colFilterDays || colFilterAging !== 'Todos' || colFilterAmount) && (
                      <button
                        onClick={() => {
                          setColFilterDate('');
                          setColFilterType('Todos');
                          setColFilterFolio('');
                          setColFilterRut('');
                          setColFilterRazon('');
                          setColFilterDays('');
                          setColFilterAging('Todos');
                          setColFilterAmount('');
                        }}
                        className="text-[10px] text-rose-600 hover:text-rose-800 font-bold"
                        title="Limpiar filtros de columna"
                      >
                        ✕
                      </button>
                    )}
                  </th>
                  <th className="p-1">
                    <input
                      type="text"
                      placeholder="Fecha..."
                      value={colFilterDate}
                      onChange={e => setColFilterDate(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white font-mono text-[11px]"
                    />
                  </th>
                  <th className="p-1">
                    <select
                      value={colFilterType}
                      onChange={e => setColFilterType(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    >
                      <option value="Todos">Todos</option>
                      <option value="33">33 - Factura</option>
                      <option value="34">34 - Exenta</option>
                      <option value="61">61 - NC</option>
                    </select>
                  </th>
                  <th className="p-1">
                    <input
                      type="text"
                      placeholder="Folio..."
                      value={colFilterFolio}
                      onChange={e => setColFilterFolio(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white font-mono text-[11px]"
                    />
                  </th>
                  <th className="p-1">
                    <input
                      type="text"
                      placeholder="RUT..."
                      value={colFilterRut}
                      onChange={e => setColFilterRut(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    />
                  </th>
                  <th className="p-1">
                    <input
                      type="text"
                      placeholder="Razón Social..."
                      value={colFilterRazon}
                      onChange={e => setColFilterRazon(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    />
                  </th>
                  <th className="p-1 text-center">
                    <input
                      type="text"
                      placeholder="Días"
                      value={colFilterDays}
                      onChange={e => setColFilterDays(e.target.value)}
                      className="w-12 border border-slate-300 rounded p-1 bg-white text-[11px] text-center font-mono"
                    />
                  </th>
                  <th className="p-1">
                    <select
                      value={colFilterAging}
                      onChange={e => setColFilterAging(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    >
                      <option value="Todos">Todos</option>
                      <option value="0-30">0-30 d</option>
                      <option value="31-60">31-60 d</option>
                      <option value="61-90">61-90 d</option>
                      <option value="+90">+90 d</option>
                    </select>
                  </th>
                  <th className="p-1">
                    <input
                      type="text"
                      placeholder="Monto..."
                      value={colFilterAmount}
                      onChange={e => setColFilterAmount(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px] font-mono text-right"
                    />
                  </th>
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
                    const isNC = isNotaCredito(inv.tipoDoc);
                    return (
                      <tr key={inv.id} className={isSelected ? (isNC ? 'bg-amber-50/70' : 'bg-indigo-50/60') : 'hover:bg-slate-50'}>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectInvoice(inv.id, inv.montoTotal)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-slate-700">{inv.fechaEmision}</td>
                        <td className="py-2 px-2.5 font-sans font-semibold">
                          {isNC ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-300 text-[10px]">
                              <span>📜</span> NC {inv.tipoDoc}
                            </span>
                          ) : (
                            <span className="text-slate-800">
                              {inv.tipoDoc === '33' ? 'Factura Electrónica' : inv.tipoDoc === '34' ? 'Factura Exenta' : inv.tipoDoc}
                            </span>
                          )}
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
                        <td className={`py-2 px-3 text-right font-black ${isNC ? 'text-amber-700' : 'text-slate-900'}`}>
                          {isNC ? '-' : ''}${inv.montoTotal.toLocaleString('es-CL')}
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
                        <div className="flex items-center justify-center gap-1">
                          {rec.status === 'Valido' && (
                            <button
                              onClick={() => handleVoidCollection(rec)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded border border-amber-200"
                              title="Anular Recaudación"
                            >
                              Anular
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteCollection(rec)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded border border-rose-200"
                            title="Eliminar Recaudación permanentemente"
                          >
                            🗑️
                          </button>
                        </div>
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
