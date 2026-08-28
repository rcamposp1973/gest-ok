import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear, RCVDocument, ManualCashProjection } from '../types';

interface FlujoDeCajaViewProps {
  studyId: string;
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  rcvDocuments?: RCVDocument[];
}

export default function FlujoDeCajaView({
  studyId,
  company,
  vouchers,
  accounts,
  fiscalYears,
  rcvDocuments = []
}: FlujoDeCajaViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [cutoffDate, setCutoffDate] = useState<string>(todayStr);
  const [activeSubView, setActiveSubView] = useState<'matriz' | 'proyecciones' | 'comparativo'>('matriz');

  // Manual Projections state
  const [projections, setProjections] = useState<ManualCashProjection[]>([]);
  const [showProjModal, setShowProjModal] = useState<boolean>(false);
  const [editingProj, setEditingProj] = useState<ManualCashProjection | null>(null);
  const [showAuditModal, setShowAuditModal] = useState<ManualCashProjection | null>(null);

  // Form state
  const [formType, setFormType] = useState<'Ingreso' | 'Egreso'>('Ingreso');
  const [formConcept, setFormConcept] = useState<string>('');
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formDate, setFormDate] = useState<string>(`${selectedYear}-01-01`);
  const [formRecurrence, setFormRecurrence] = useState<'Unica' | 'Mensual' | 'Anual'>('Unica');

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Fetch manual projections from Firestore
  const fetchProjections = async () => {
    try {
      const snap = await getDocs(collection(companyRef, 'manualCashProjections'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ManualCashProjection));
      setProjections(list);
    } catch (err) {
      console.error('Error fetching manual projections:', err);
    }
  };

  useEffect(() => {
    fetchProjections();
  }, [studyId, company.id]);

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Bank / Cash account IDs identification
  const cashAndBankAccIds = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach(acc => {
      const code = acc.code || '';
      const name = (acc.name || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();
      if (
        (type.includes('activo') || code.startsWith('1')) &&
        (name.includes('banco') || name.includes('caja') || name.includes('cuenta corriente') || name.includes('tesoreria') || code.startsWith('1-1-01') || code.startsWith('1.1.01') || code.startsWith('1.1.02'))
      ) {
        set.add(acc.id);
        set.add(acc.code);
      }
    });
    return set;
  }, [accounts]);

  // Hybrid Calculation Engine: Real (T <= cutoffDate) vs Projected (T > cutoffDate) + Manual Projections Multi-Exercise
  const hybridCashFlow = useMemo(() => {
    const monthlyRealInflows = new Array(12).fill(0);
    const monthlyRealOutflows = new Array(12).fill(0);
    const monthlyProjInflows = new Array(12).fill(0);
    const monthlyProjOutflows = new Array(12).fill(0);

    let realAccumulatedBalance = 0;

    // 1. Process Vouchers (Real movements executed up to cutoffDate)
    vouchers.forEach(v => {
      if (v.status === 'Anulado' || !v.date) return;
      const vYear = parseInt(v.date.slice(0, 4));
      if (vYear !== selectedYear) return;

      const vMonth = parseInt(v.date.slice(5, 7)) - 1;
      if (vMonth < 0 || vMonth > 11) return;

      if (!v.lines) return;

      let voucherCashDebit = 0;
      let voucherCashCredit = 0;

      v.lines.forEach(l => {
        if (cashAndBankAccIds.has(l.accountId) || cashAndBankAccIds.has(l.accountCode)) {
          voucherCashDebit += (Number(l.debit) || 0);
          voucherCashCredit += (Number(l.credit) || 0);
        }
      });

      if (v.date <= cutoffDate) {
        monthlyRealInflows[vMonth] += voucherCashDebit;
        monthlyRealOutflows[vMonth] += voucherCashCredit;
        realAccumulatedBalance += (voucherCashDebit - voucherCashCredit);
      } else {
        monthlyProjInflows[vMonth] += voucherCashDebit;
        monthlyProjOutflows[vMonth] += voucherCashCredit;
      }
    });

    // 2. Process RCV Documents
    rcvDocuments.forEach(doc => {
      const fecha = doc.fechaEmision;
      if (!fecha) return;
      const docYear = parseInt(fecha.slice(0, 4));
      if (docYear !== selectedYear) return;

      const docMonth = parseInt(fecha.slice(5, 7)) - 1;
      if (docMonth < 0 || docMonth > 11) return;

      const amount = Number(doc.montoTotal) || 0;
      const isCentralized = doc.estadoContabilizado || Boolean(doc.voucherId);

      if (fecha <= cutoffDate) {
        if (!isCentralized) {
          if (doc.tipoRegistro === 'Venta') {
            monthlyRealInflows[docMonth] += amount;
            realAccumulatedBalance += amount;
          } else if (doc.tipoRegistro === 'Compra') {
            monthlyRealOutflows[docMonth] += amount;
            realAccumulatedBalance -= amount;
          }
        }
      } else {
        if (!isCentralized) {
          if (doc.tipoRegistro === 'Venta') {
            monthlyProjInflows[docMonth] += amount;
          } else if (doc.tipoRegistro === 'Compra') {
            monthlyProjOutflows[docMonth] += amount;
          }
        }
      }
    });

    // 3. Process Manual Projections (Multi-exercise support)
    projections.forEach(proj => {
      if (proj.status === 'Inactivo') return;
      const pDate = proj.date || `${selectedYear}-01-01`;
      const pYear = parseInt(pDate.slice(0, 4)) || selectedYear;
      const pMonth = parseInt(pDate.slice(5, 7)) - 1;

      if (proj.recurrence === 'Unica') {
        if (pYear === selectedYear && pMonth >= 0 && pMonth <= 11) {
          if (proj.type === 'Ingreso') monthlyProjInflows[pMonth] += proj.amount;
          else monthlyProjOutflows[pMonth] += proj.amount;
        }
      } else if (proj.recurrence === 'Mensual') {
        // Occurs every month of the selected year if year >= pYear
        if (selectedYear >= pYear) {
          for (let m = 0; m < 12; m++) {
            if (proj.type === 'Ingreso') monthlyProjInflows[m] += proj.amount;
            else monthlyProjOutflows[m] += proj.amount;
          }
        }
      } else if (proj.recurrence === 'Anual') {
        if (selectedYear >= pYear) {
          if (pMonth >= 0 && pMonth <= 11) {
            if (proj.type === 'Ingreso') monthlyProjInflows[pMonth] += proj.amount;
            else monthlyProjOutflows[pMonth] += proj.amount;
          }
        }
      }
    });

    const netRealFlow = monthlyRealInflows.map((inf, i) => inf - monthlyRealOutflows[i]);
    const netProjFlow = monthlyProjInflows.map((inf, i) => inf - monthlyProjOutflows[i]);

    const accumulatedTrajectory = new Array(12).fill(0);
    let running = 0;
    for (let m = 0; m < 12; m++) {
      running += (netRealFlow[m] + netProjFlow[m]);
      accumulatedTrajectory[m] = running;
    }

    const totalRealInflow = monthlyRealInflows.reduce((a, b) => a + b, 0);
    const totalRealOutflow = monthlyRealOutflows.reduce((a, b) => a + b, 0);
    const totalProjInflow = monthlyProjInflows.reduce((a, b) => a + b, 0);
    const totalProjOutflow = monthlyProjOutflows.reduce((a, b) => a + b, 0);

    const saldoRealCorte = realAccumulatedBalance;
    const saldoEstimadoFinMes = saldoRealCorte + totalProjInflow - totalProjOutflow;

    return {
      monthlyRealInflows,
      monthlyRealOutflows,
      monthlyProjInflows,
      monthlyProjOutflows,
      netRealFlow,
      netProjFlow,
      accumulatedTrajectory,
      totalRealInflow,
      totalRealOutflow,
      totalProjInflow,
      totalProjOutflow,
      saldoRealCorte,
      saldoEstimadoFinMes
    };
  }, [vouchers, rcvDocuments, projections, cashAndBankAccIds, selectedYear, cutoffDate]);

  // Comparative Analysis (Real vs. Projected by Month)
  const comparativeAnalysis = useMemo(() => {
    return monthNames.map((m, idx) => {
      const realIn = hybridCashFlow.monthlyRealInflows[idx];
      const realOut = hybridCashFlow.monthlyRealOutflows[idx];
      const realNet = realIn - realOut;

      const projIn = hybridCashFlow.monthlyProjInflows[idx];
      const projOut = hybridCashFlow.monthlyProjOutflows[idx];
      const projNet = projIn - projOut;

      const totalExpected = realNet + projNet;
      const compliancePercent = realNet !== 0 ? Math.round((realNet / (projNet || 1)) * 100) : 0;

      return {
        month: m,
        realIn,
        realOut,
        realNet,
        projIn,
        projOut,
        projNet,
        totalExpected,
        compliancePercent
      };
    });
  }, [hybridCashFlow, monthNames]);

  // Handle Save / Update Manual Projection with Audit Trail
  const handleSaveProjection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formConcept.trim() || formAmount <= 0) {
      alert('Ingrese un concepto válido y un monto mayor a 0.');
      return;
    }

    const yearVal = parseInt(formDate.slice(0, 4)) || selectedYear;
    const nowISO = new Date().toISOString();

    const auditEntry = {
      date: nowISO,
      action: editingProj ? ('Modificado' as const) : ('Creado' as const),
      details: editingProj
        ? `Modificación de proyección: ${formConcept} ($${formAmount}) [Recurrencia: ${formRecurrence}]`
        : `Creación de proyección presupuestaria: ${formConcept} ($${formAmount}) [Recurrencia: ${formRecurrence}]`,
      user: 'rcampos@pulsocontable.cl'
    };

    try {
      if (editingProj) {
        const updatedTrail = [...(editingProj.auditTrail || []), auditEntry];
        const payload = {
          type: formType,
          concept: formConcept.trim(),
          amount: formAmount,
          date: formDate,
          recurrence: formRecurrence,
          year: yearVal,
          status: 'Activo' as const,
          updatedAt: nowISO,
          auditTrail: updatedTrail
        };
        await updateDoc(doc(companyRef, 'manualCashProjections', editingProj.id), payload);
        alert('Proyección actualizada exitosamente y registrada para auditoría.');
      } else {
        const payload = {
          type: formType,
          concept: formConcept.trim(),
          amount: formAmount,
          date: formDate,
          recurrence: formRecurrence,
          year: yearVal,
          status: 'Activo' as const,
          createdAt: nowISO,
          auditTrail: [auditEntry]
        };
        await addDoc(collection(companyRef, 'manualCashProjections'), payload);
        alert('Proyección presupuestaria registrada exitosamente.');
      }

      setShowProjModal(false);
      setEditingProj(null);
      setFormConcept('');
      setFormAmount(0);
      fetchProjections();
    } catch (err: any) {
      console.error('Error saving projection:', err);
      alert('Error al guardar proyección: ' + err.message);
    }
  };

  const handleEditProj = (p: ManualCashProjection) => {
    setEditingProj(p);
    setFormType(p.type);
    setFormConcept(p.concept);
    setFormAmount(p.amount);
    setFormDate(p.date);
    setFormRecurrence(p.recurrence);
    setShowProjModal(true);
  };

  const handleDeleteProj = async (id: string) => {
    if (confirm('¿Está seguro de eliminar esta proyección presupuestaria?')) {
      try {
        await deleteDoc(doc(companyRef, 'manualCashProjections', id));
        fetchProjections();
      } catch (err) {
        console.error('Error deleting projection:', err);
      }
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['CONCEPTO', ...monthNames, 'TOTAL AÑO'];
    const rows = [
      ['FLUJO DE CAJA HÍBRIDO (REAL + PROYECTADO)', `"${company.name}"`, `Año: ${selectedYear}`, `Fecha Corte: ${cutoffDate}`],
      [''],
      headers,
      ['(+) 1. INGRESOS REALES (COBRADOS)', ...hybridCashFlow.monthlyRealInflows.map(v => v.toString()), hybridCashFlow.totalRealInflow.toString()],
      ['(-) 2. EGRESOS REALES (PAGADOS)', ...hybridCashFlow.monthlyRealOutflows.map(v => v.toString()), hybridCashFlow.totalRealOutflow.toString()],
      ['(=) FLUJO NETO REAL', ...hybridCashFlow.netRealFlow.map(v => v.toString()), hybridCashFlow.netRealFlow.reduce((a,b)=>a+b,0).toString()],
      [''],
      ['(📌) 3. PROYECCIÓN DE INGRESOS', ...hybridCashFlow.monthlyProjInflows.map(v => v.toString()), hybridCashFlow.totalProjInflow.toString()],
      ['(📌) 4. PROYECCIÓN DE EGRESOS', ...hybridCashFlow.monthlyProjOutflows.map(v => v.toString()), hybridCashFlow.totalProjOutflow.toString()],
      ['(=) FLUJO NETO PROYECTADO', ...hybridCashFlow.netProjFlow.map(v => v.toString()), hybridCashFlow.netProjFlow.reduce((a,b)=>a+b,0).toString()],
      [''],
      ['(=) SALDO ACUMULADO TRAYECTORIA', ...hybridCashFlow.accumulatedTrajectory.map(v => v.toString()), hybridCashFlow.accumulatedTrajectory[11].toString()]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Flujo_Caja_Hibrido_${company.rut}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🌊</span>
            <h3 className="text-lg font-black text-slate-950 tracking-tight uppercase">
              Tesorería & Flujo de Caja Híbrido (Multi-Ejercicio)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Consolidado automático (RCV, BHE, F29) + Proyecciones Presupuestarias Manuales con Auditoría ({company.name})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <label className="font-semibold text-slate-600">Fecha de Corte (Tcorte):</label>
            <input
              type="date"
              value={cutoffDate}
              onChange={e => setCutoffDate(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 font-bold focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <label className="font-semibold text-slate-600">Ejercicio Fiscal:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-300 rounded font-bold px-2 py-0.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500"
            >
              {[2028, 2027, 2026, 2025, 2024, 2023].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>📥</span>
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubView('matriz')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeSubView === 'matriz' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <span>📊</span>
          <span>Matriz de Caja (Real + Proy)</span>
        </button>

        <button
          onClick={() => setActiveSubView('proyecciones')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeSubView === 'proyecciones' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <span>📝</span>
          <span>Proyecciones Manuales & Auditoría ({projections.length})</span>
        </button>

        <button
          onClick={() => setActiveSubView('comparativo')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeSubView === 'comparativo' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <span>📈</span>
          <span>Comparativo Real v/s Proyección</span>
        </button>
      </div>

      {/* SUBVIEW 1: MATRIZ DE CAJA HÍBRIDA */}
      {activeSubView === 'matriz' && (
        <div className="space-y-4">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <span>🟢</span> Saldo Real en Caja (T &le; Tcorte)
              </span>
              <p className="text-xl font-black text-emerald-950 mt-1 font-mono">
                ${hybridCashFlow.saldoRealCorte.toLocaleString('es-CL')}
              </p>
              <span className="text-[10px] text-emerald-700">Acumulado real ejecutado hasta {cutoffDate}</span>
            </div>

            <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1">
                <span>📈</span> Total Proyección Ingresos
              </span>
              <p className="text-xl font-black text-blue-950 mt-1 font-mono">
                ${hybridCashFlow.totalProjInflow.toLocaleString('es-CL')}
              </p>
              <span className="text-[10px] text-blue-700">RCV ventas pendientes + Proyecciones manuales</span>
            </div>

            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                <span>📉</span> Total Proyección Egresos
              </span>
              <p className="text-xl font-black text-amber-950 mt-1 font-mono">
                ${hybridCashFlow.totalProjOutflow.toLocaleString('es-CL')}
              </p>
              <span className="text-[10px] text-amber-700">RCV compras pendientes + Proyecciones manuales</span>
            </div>

            <div className="bg-indigo-900 text-white p-3.5 rounded-xl border border-indigo-950 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200 flex items-center gap-1">
                <span>🏁</span> Saldo Final Estimado ({selectedYear})
              </span>
              <p className="text-xl font-black text-white mt-1 font-mono">
                ${hybridCashFlow.saldoEstimadoFinMes.toLocaleString('es-CL')}
              </p>
              <span className="text-[10px] text-indigo-300">Posición estimada al cierre de {selectedYear}</span>
            </div>
          </div>

          {/* Hybrid Matrix Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <span>📊</span>
                <span>Matriz Consolidada de Tesorería Híbrida (Ejercicio {selectedYear})</span>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-600 rounded-sm inline-block"></span> Tramo Real (T &le; Tcorte)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-500 rounded-sm inline-block border border-dashed border-blue-700"></span> Tramo Proyectado (T &gt; Tcorte)</span>
              </div>
            </div>

            <div className="overflow-auto max-h-[550px] relative shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10 shadow-2xs">
                  <tr className="bg-slate-900 text-white font-bold uppercase text-[11px] tracking-wider">
                    <th className="p-2.5 min-w-[220px] border-r border-slate-700 bg-slate-900 sticky left-0 z-20">Concepto Financiero / Tesorería</th>
                    {monthNames.map(m => (
                      <th key={m} className="p-2 text-right border-r border-slate-700 font-mono min-w-[90px]">{m}</th>
                    ))}
                    <th className="p-2.5 text-right font-mono min-w-[120px] bg-slate-950">Total {selectedYear}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  <tr className="bg-emerald-50/50 hover:bg-emerald-50 text-emerald-950 font-bold">
                    <td className="p-2.5 font-sans border-r border-slate-200 uppercase flex items-center gap-1.5 bg-emerald-50 sticky left-0 z-10">
                      <span className="text-emerald-700">🟢</span> (+) Ingresos Reales de Caja (Cobrados)
                    </td>
                    {hybridCashFlow.monthlyRealInflows.map((v, i) => (
                      <td key={i} className="p-2 text-right border-r border-slate-200">
                        {v > 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                      </td>
                    ))}
                    <td className="p-2.5 text-right font-black bg-emerald-100 text-emerald-900">
                      ${hybridCashFlow.totalRealInflow.toLocaleString('es-CL')}
                    </td>
                  </tr>

                  <tr className="bg-rose-50/50 hover:bg-rose-50 text-rose-950 font-bold">
                    <td className="p-2.5 font-sans border-r border-slate-200 uppercase flex items-center gap-1.5 bg-rose-50 sticky left-0 z-10">
                      <span className="text-rose-700">🔴</span> (-) Egresos Reales de Caja (Pagados)
                    </td>
                    {hybridCashFlow.monthlyRealOutflows.map((v, i) => (
                      <td key={i} className="p-2 text-right border-r border-slate-200">
                        {v > 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                      </td>
                    ))}
                    <td className="p-2.5 text-right font-black bg-rose-100 text-rose-900">
                      ${hybridCashFlow.totalRealOutflow.toLocaleString('es-CL')}
                    </td>
                  </tr>

                  <tr className="bg-blue-50/40 hover:bg-blue-50 text-blue-950 italic">
                    <td className="p-2.5 font-sans border-r border-slate-200 uppercase flex items-center gap-1.5 font-semibold bg-blue-50 sticky left-0 z-10">
                      <span className="text-blue-600">📈</span> (📌) Proyección de Ingresos (RCV + Manuales)
                    </td>
                    {hybridCashFlow.monthlyProjInflows.map((v, i) => (
                      <td key={i} className="p-2 text-right border-r border-slate-200 text-blue-800">
                        {v > 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                      </td>
                    ))}
                    <td className="p-2.5 text-right font-bold bg-blue-100 text-blue-900">
                      ${hybridCashFlow.totalProjInflow.toLocaleString('es-CL')}
                    </td>
                  </tr>

                  <tr className="bg-amber-50/40 hover:bg-amber-50 text-amber-950 italic">
                    <td className="p-2.5 font-sans border-r border-slate-200 uppercase flex items-center gap-1.5 font-semibold bg-amber-50 sticky left-0 z-10">
                      <span className="text-amber-600">📉</span> (📌) Proyección de Egresos (RCV + Manuales)
                    </td>
                    {hybridCashFlow.monthlyProjOutflows.map((v, i) => (
                      <td key={i} className="p-2 text-right border-r border-slate-200 text-amber-800">
                        {v > 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                      </td>
                    ))}
                    <td className="p-2.5 text-right font-bold bg-amber-100 text-amber-900">
                      ${hybridCashFlow.totalProjOutflow.toLocaleString('es-CL')}
                    </td>
                  </tr>

                  <tr className="bg-indigo-900 text-white font-black">
                    <td className="p-2.5 font-sans border-r border-indigo-800 uppercase text-[11px] flex items-center gap-1.5 bg-indigo-900 sticky left-0 z-10">
                      <span>🏁</span> (=) Posición Acumulada Híbrida (Real + Proy)
                    </td>
                    {hybridCashFlow.accumulatedTrajectory.map((v, i) => (
                      <td key={i} className="p-2 text-right border-r border-indigo-800 text-indigo-100 font-mono">
                        ${v.toLocaleString('es-CL')}
                      </td>
                    ))}
                    <td className="p-2.5 text-right bg-indigo-950 text-emerald-300 font-black">
                      ${hybridCashFlow.accumulatedTrajectory[11].toLocaleString('es-CL')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 2: PROYECCIONES MANUALES & AUDITORÍA */}
      {activeSubView === 'proyecciones' && (
        <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm uppercase">Proyecciones Presupuestarias Manuales (Multi-Ejercicio)</h4>
              <p className="text-xs text-slate-500">Ingrese ingresos o egresos futuros para el modelo de caja, con trazabilidad de auditoría.</p>
            </div>
            <button
              onClick={() => {
                setEditingProj(null);
                setFormType('Ingreso');
                setFormConcept('');
                setFormAmount(0);
                setFormDate(`${selectedYear}-01-01`);
                setFormRecurrence('Unica');
                setShowProjModal(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span>➕</span>
              <span>Nueva Proyección Presupuestaria</span>
            </button>
          </div>

          {projections.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <p className="text-slate-500 text-xs italic">No hay proyecciones presupuestarias manuales registradas.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[500px] border border-slate-200 rounded-lg relative shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200 shadow-2xs">
                  <tr>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5">Concepto</th>
                    <th className="p-2.5 text-right font-mono">Monto ($)</th>
                    <th className="p-2.5">Fecha / Ejercicio</th>
                    <th className="p-2.5">Recurrencia</th>
                    <th className="p-2.5 text-center">Auditoría / Modificaciones</th>
                    <th className="p-2.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {projections.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-sans font-bold">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          p.type === 'Ingreso' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {p.type}
                        </span>
                      </td>
                      <td className="p-2.5 font-sans font-semibold text-slate-900">{p.concept}</td>
                      <td className="p-2.5 text-right font-black">${Number(p.amount).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-slate-700">{p.date} (Año {p.year})</td>
                      <td className="p-2.5 font-sans font-medium text-slate-600">
                        {p.recurrence === 'Unica' ? 'Única vez' : p.recurrence === 'Mensual' ? 'Mensual' : 'Anual'}
                      </td>
                      <td className="p-2.5 text-center font-sans">
                        <button
                          onClick={() => setShowAuditModal(p)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold border border-slate-300"
                        >
                          📜 Ver Historial ({p.auditTrail?.length || 1})
                        </button>
                      </td>
                      <td className="p-2.5 text-center font-sans space-x-2">
                        <button
                          onClick={() => handleEditProj(p)}
                          className="text-indigo-600 hover:text-indigo-800 font-bold underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteProj(p.id)}
                          className="text-rose-600 hover:text-rose-800 font-bold underline"
                        >
                          Eliminar
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

      {/* SUBVIEW 3: COMPARATIVO REAL v/s PROYECCIÓN */}
      {activeSubView === 'comparativo' && (
        <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div>
            <h4 className="font-bold text-slate-900 text-sm uppercase">Reporte Comparativo: Real v/s Proyección ({selectedYear})</h4>
            <p className="text-xs text-slate-500">Evaluación del desempeño financiero real frente a las estimaciones presupuestarias mensuales.</p>
          </div>

          <div className="overflow-auto max-h-[500px] border border-slate-200 rounded-lg relative shadow-2xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white font-bold uppercase text-[11px] tracking-wider shadow-2xs">
                <tr>
                  <th className="p-2.5 border-r border-slate-700">Mes</th>
                  <th className="p-2.5 text-right border-r border-slate-700 font-mono">Neto Real (Cobrado - Pagado)</th>
                  <th className="p-2.5 text-right border-r border-slate-700 font-mono">Neto Proyectado</th>
                  <th className="p-2.5 text-right border-r border-slate-700 font-mono">Variación / Desviación (Delta)</th>
                  <th className="p-2.5 text-center font-mono bg-slate-950">% Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {comparativeAnalysis.map((row, idx) => {
                  const delta = row.realNet - row.projNet;
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 font-sans font-bold uppercase bg-slate-50 border-r border-slate-200">{row.month}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-800 border-r border-slate-200">
                        ${row.realNet.toLocaleString('es-CL')}
                      </td>
                      <td className="p-2.5 text-right font-bold text-blue-800 border-r border-slate-200">
                        ${row.projNet.toLocaleString('es-CL')}
                      </td>
                      <td className={`p-2.5 text-right font-bold border-r border-slate-200 ${
                        delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {delta >= 0 ? '+' : ''}${delta.toLocaleString('es-CL')}
                      </td>
                      <td className="p-2.5 text-center font-black bg-slate-50">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          row.compliancePercent >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {row.compliancePercent}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NUEVA / EDITAR PROYECCIÓN */}
      {showProjModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h4 className="text-sm font-bold uppercase text-slate-900">
                {editingProj ? 'Modificar Proyección Presupuestaria' : 'Nueva Proyección Presupuestaria'}
              </h4>
              <button onClick={() => setShowProjModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveProjection} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Flujo *</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                >
                  <option value="Ingreso">Ingreso (Entrada de Caja)</option>
                  <option value="Egreso">Egreso (Salida de Caja)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Concepto o Descripción *</label>
                <input
                  type="text"
                  placeholder="Ej. Proyección Cobranza Contrato Anual 2027"
                  value={formConcept}
                  onChange={e => setFormConcept(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Monto ($) *</label>
                  <input
                    type="number"
                    min="1"
                    value={formAmount}
                    onChange={e => setFormAmount(Number(e.target.value))}
                    required
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fecha Estimada *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    required
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Recurrencia Multi-Ejercicio *</label>
                <select
                  value={formRecurrence}
                  onChange={e => setFormRecurrence(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-semibold"
                >
                  <option value="Unica">Única Vez</option>
                  <option value="Mensual">Mensual (Se repite todos los meses)</option>
                  <option value="Anual">Anual (Se repite cada año en este mes)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowProjModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                >
                  {editingProj ? 'Guardar Cambios y Auditar' : 'Registrar Proyección'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AUDIT TRAIL */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h4 className="text-sm font-bold uppercase text-slate-900">Historial de Auditoría</h4>
                <p className="text-xs text-slate-500 font-mono">{showAuditModal.concept}</p>
              </div>
              <button onClick={() => setShowAuditModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto text-xs font-mono">
              {showAuditModal.auditTrail?.map((audit, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span className="font-bold text-indigo-700 uppercase">{audit.action}</span>
                    <span>{new Date(audit.date).toLocaleString('es-CL')}</span>
                  </div>
                  <p className="text-slate-800 font-sans font-semibold">{audit.details}</p>
                  <p className="text-[10px] text-slate-500">Usuario: {audit.user || 'Sistema'}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                onClick={() => setShowAuditModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs"
              >
                Cerrar Auditoría
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
