import React, { useState, useMemo } from 'react';
import {
  Company,
  Voucher,
  ChartOfAccount,
  FiscalPeriodYear,
  RCVDocument,
  BankReconciliation,
  BankStatementLine
} from '../types';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Landmark,
  CreditCard,
  Receipt,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Calendar,
  PieChart as PieChartIcon,
  ShieldCheck
} from 'lucide-react';

interface ClientExecutiveManagementViewProps {
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rcvDocuments?: RCVDocument[];
  bankReconciliations?: BankReconciliation[];
  fiscalYears?: FiscalPeriodYear[];
  onBack?: () => void;
}

export default function ClientExecutiveManagementView({
  company,
  accounts,
  vouchers,
  rcvDocuments = [],
  bankReconciliations = [],
  fiscalYears = [],
  onBack
}: ClientExecutiveManagementViewProps) {
  // Period filter: Default to current or latest period
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [activeTab, setActiveTab] = useState<'RESUMEN' | 'VENTAS' | 'GASTOS' | 'CXC' | 'CXP' | 'BANCOS'>('RESUMEN');

  // Available periods list derived from vouchers and RCV
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      if (v.period) set.add(v.period);
    });
    rcvDocuments.forEach(d => {
      if (d.period) set.add(d.period);
    });
    bankReconciliations.forEach(r => {
      if (r.period) set.add(r.period);
    });
    if (set.size === 0) set.add(selectedPeriod);
    return Array.from(set).sort().reverse();
  }, [vouchers, rcvDocuments, bankReconciliations, selectedPeriod]);

  // Set default period if selected not in list
  React.useEffect(() => {
    if (availablePeriods.length > 0 && !availablePeriods.includes(selectedPeriod)) {
      setSelectedPeriod(availablePeriods[0]);
    }
  }, [availablePeriods]);

  // Filter valid vouchers for selected period
  const periodVouchers = useMemo(() => {
    return vouchers.filter(v => v.status !== 'Anulado' && v.period === selectedPeriod);
  }, [vouchers, selectedPeriod]);

  // Filter RCV documents for selected period
  const periodRcvDocs = useMemo(() => {
    return rcvDocuments.filter(d => d.period === selectedPeriod && d.estado !== 'Anulado');
  }, [rcvDocuments, selectedPeriod]);

  // 1. GESTION DE VENTAS DEL PERIODO
  const salesMetrics = useMemo(() => {
    const salesDocs = periodRcvDocs.filter(d => d.tipoOperacion === 'Venta');
    const totalNeto = salesDocs.reduce((sum, d) => sum + (d.montoNeto || 0), 0);
    const totalIva = salesDocs.reduce((sum, d) => sum + (d.montoIva || 0), 0);
    const totalVentas = salesDocs.reduce((sum, d) => sum + (d.montoTotal || 0), 0);
    const count = salesDocs.length;

    // Top Clientes
    const clientMap = new Map<string, { rut: string; razonSocial: string; total: number; count: number }>();
    salesDocs.forEach(d => {
      const key = d.rutReceptor || 'SIN_RUT';
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          rut: d.rutReceptor,
          razonSocial: d.razonSocialReceptor || 'Cliente Desconocido',
          total: 0,
          count: 0
        });
      }
      const entry = clientMap.get(key)!;
      entry.total += d.montoTotal || 0;
      entry.count += 1;
    });

    const topClients = Array.from(clientMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);

    return { totalNeto, totalIva, totalVentas, count, topClients, salesDocs };
  }, [periodRcvDocs]);

  // 2. GESTION DE GASTOS Y COMPRAS DEL PERIODO
  const expenseMetrics = useMemo(() => {
    const purchaseDocs = periodRcvDocs.filter(d => d.tipoOperacion === 'Compra');
    const totalNeto = purchaseDocs.reduce((sum, d) => sum + (d.montoNeto || 0), 0);
    const totalIva = purchaseDocs.reduce((sum, d) => sum + (d.montoIva || 0), 0);
    const totalCompras = purchaseDocs.reduce((sum, d) => sum + (d.montoTotal || 0), 0);
    const count = purchaseDocs.length;

    // Top Proveedores
    const provMap = new Map<string, { rut: string; razonSocial: string; total: number; count: number }>();
    purchaseDocs.forEach(d => {
      const key = d.rutEmisor || 'SIN_RUT';
      if (!provMap.has(key)) {
        provMap.set(key, {
          rut: d.rutEmisor,
          razonSocial: d.razonSocialEmisor || 'Proveedor Desconocido',
          total: 0,
          count: 0
        });
      }
      const entry = provMap.get(key)!;
      entry.total += d.montoTotal || 0;
      entry.count += 1;
    });

    const topSuppliers = Array.from(provMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);

    return { totalNeto, totalIva, totalCompras, count, topSuppliers, purchaseDocs };
  }, [periodRcvDocs]);

  // 3. CUENTAS POR COBRAR (CxC) Y CUENTAS POR PAGAR (CxP)
  const treasuryMetrics = useMemo(() => {
    const pendingCustomers = periodRcvDocs.filter(d => d.tipoOperacion === 'Venta' && d.estadoCobranza !== 'Cobrado');
    const totalCxC = pendingCustomers.reduce((sum, d) => sum + (d.saldoPendiente || d.montoTotal || 0), 0);

    const pendingSuppliers = periodRcvDocs.filter(d => d.tipoOperacion === 'Compra' && d.estadoPago !== 'Pagado');
    const totalCxP = pendingSuppliers.reduce((sum, d) => sum + (d.saldoPendiente || d.montoTotal || 0), 0);

    return {
      totalCxC,
      countCxC: pendingCustomers.length,
      pendingCustomers,
      totalCxP,
      countCxP: pendingSuppliers.length,
      pendingSuppliers
    };
  }, [periodRcvDocs]);

  // 4. RESUMEN DE CONCILIACION BANCARIA (Cuadratura y Movimientos Pendientes)
  const bankMetrics = useMemo(() => {
    const periodRecs = bankReconciliations.filter(r => r.period === selectedPeriod);
    
    let totalBankBalance = 0;
    let totalBookBalance = 0;
    let totalDifference = 0;
    let isFullyBalanced = true;
    let totalUnmatchedCharges = 0;
    let totalUnmatchedDeposits = 0;
    let totalOutstandingChecks = 0;
    let totalDepositsInTransit = 0;

    const accountSummaries = periodRecs.map(rec => {
      const isCuadrado = rec.status === 'Cuadrado' || Math.abs(rec.difference || 0) < 1;
      if (!isCuadrado) isFullyBalanced = false;

      totalBankBalance += rec.bankFinalBalance || 0;
      totalBookBalance += rec.bookFinalBalance || 0;
      totalDifference += rec.difference || 0;
      totalUnmatchedCharges += rec.unmatchedCharges || 0;
      totalUnmatchedDeposits += rec.unmatchedDeposits || 0;
      totalOutstandingChecks += rec.outstandingChecks || 0;
      totalDepositsInTransit += rec.depositsInTransit || 0;

      // Extract pending lines
      const pendingCartolaLines = (rec.lines || []).filter(l => l.matchedStatus === 'Pendiente');

      return {
        id: rec.id,
        accountName: rec.bankAccountName || 'Cuenta Bancaria',
        accountCode: rec.bankAccountCode || '',
        bankInitialBalance: rec.bankInitialBalance || 0,
        bankFinalBalance: rec.bankFinalBalance || 0,
        bookFinalBalance: rec.bookFinalBalance || 0,
        difference: rec.difference || 0,
        isCuadrado,
        unmatchedCharges: rec.unmatchedCharges || 0,
        unmatchedDeposits: rec.unmatchedDeposits || 0,
        pendingCartolaLines
      };
    });

    return {
      accountSummaries,
      totalBankBalance,
      totalBookBalance,
      totalDifference,
      isFullyBalanced,
      totalUnmatchedCharges,
      totalUnmatchedDeposits,
      totalOutstandingChecks,
      totalDepositsInTransit,
      hasReconciliations: periodRecs.length > 0
    };
  }, [bankReconciliations, selectedPeriod]);

  // Margen Operativo Bruto
  const grossProfit = salesMetrics.totalNeto - expenseMetrics.totalNeto;
  const grossMarginPct = salesMetrics.totalNeto > 0 ? (grossProfit / salesMetrics.totalNeto) * 100 : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* Top Banner: Observador de Gestión para Cliente Final */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/30 uppercase tracking-wider">
              Portal de Observador Ejecutivo
            </span>
            <span className="text-xs text-slate-400 font-mono">Solo Consulta y Gestión</span>
          </div>
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-400" />
            <span>{company.name}</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            RUT: {company.rut} | Giro: {company.giro || 'Comercio y Servicios'}
          </p>
        </div>

        {/* Period Selector and Back Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/10">
            <Calendar className="w-4 h-4 text-indigo-300 ml-1" />
            <span className="text-xs font-bold text-slate-200">Período:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {availablePeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              &larr; Volver
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-1">
        <button
          onClick={() => setActiveTab('RESUMEN')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'RESUMEN'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <PieChartIcon className="w-3.5 h-3.5" />
          <span>Panel General (KPIs)</span>
        </button>

        <button
          onClick={() => setActiveTab('VENTAS')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'VENTAS'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Ventas y Clientes (${salesMetrics.totalVentas.toLocaleString('es-CL')})</span>
        </button>

        <button
          onClick={() => setActiveTab('GASTOS')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'GASTOS'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>Gastos y Proveedores (${expenseMetrics.totalCompras.toLocaleString('es-CL')})</span>
        </button>

        <button
          onClick={() => setActiveTab('CXC')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'CXC'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Cuentas x Cobrar (${treasuryMetrics.totalCxC.toLocaleString('es-CL')})</span>
        </button>

        <button
          onClick={() => setActiveTab('CXP')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'CXP'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Cuentas x Pagar (${treasuryMetrics.totalCxP.toLocaleString('es-CL')})</span>
        </button>

        <button
          onClick={() => setActiveTab('BANCOS')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'BANCOS'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Conciliación Bancaria ({bankMetrics.isFullyBalanced ? 'Cuadrada' : 'Pendiente'})</span>
        </button>
      </div>

      {/* 1. RESUMEN EJECUTIVO (KPIs) */}
      {activeTab === 'RESUMEN' && (
        <div className="space-y-6">
          
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Ventas Netas */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas Totales</span>
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <TrendingUp className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono">
                ${salesMetrics.totalVentas.toLocaleString('es-CL')}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                <span>Neto: ${salesMetrics.totalNeto.toLocaleString('es-CL')}</span>
                <span className="font-bold text-emerald-600">{salesMetrics.count} docs</span>
              </p>
            </div>

            {/* Gastos / Compras */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-rose-300 transition-all">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gastos / Compras</span>
                <span className="p-2 bg-rose-100 text-rose-700 rounded-lg">
                  <TrendingDown className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono">
                ${expenseMetrics.totalCompras.toLocaleString('es-CL')}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                <span>Neto: ${expenseMetrics.totalNeto.toLocaleString('es-CL')}</span>
                <span className="font-bold text-rose-600">{expenseMetrics.count} docs</span>
              </p>
            </div>

            {/* Margen Bruto */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-indigo-300 transition-all">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Margen Bruto</span>
                <span className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <DollarSign className="w-4 h-4" />
                </span>
              </div>
              <p className={`text-2xl font-black font-mono ${grossProfit >= 0 ? 'text-indigo-900' : 'text-rose-600'}`}>
                ${grossProfit.toLocaleString('es-CL')}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                <span>Margen Operacional:</span>
                <span className={`font-bold ${grossMarginPct >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                  {grossMarginPct.toFixed(1)}%
                </span>
              </p>
            </div>

            {/* Saldo Bancos */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Disponible Bancos</span>
                <span className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <Landmark className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono">
                ${bankMetrics.totalBankBalance.toLocaleString('es-CL')}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                <span>Estado Cartolas:</span>
                <span className={`font-bold ${bankMetrics.isFullyBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {bankMetrics.isFullyBalanced ? '✓ Cuadradas' : '⚠ Descuadre'}
                </span>
              </p>
            </div>

          </div>

          {/* Treasury Snapshot Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Cuentas por Cobrar */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-600" />
                  <span>Cuentas por Cobrar Pendientes</span>
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded font-mono">
                  {treasuryMetrics.countCxC} facturas
                </span>
              </div>
              <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex justify-between items-center mb-3">
                <div>
                  <span className="text-xs text-amber-900 font-semibold block">Total por Recaudar:</span>
                  <span className="text-2xl font-black text-amber-950 font-mono">
                    ${treasuryMetrics.totalCxC.toLocaleString('es-CL')}
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('CXC')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1"
                >
                  <span>Ver Detalle</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Cuentas por Pagar */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-600" />
                  <span>Cuentas por Pagar a Proveedores</span>
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 bg-purple-50 text-purple-800 rounded font-mono">
                  {treasuryMetrics.countCxP} facturas
                </span>
              </div>
              <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 flex justify-between items-center mb-3">
                <div>
                  <span className="text-xs text-purple-900 font-semibold block">Total por Pagar:</span>
                  <span className="text-2xl font-black text-purple-950 font-mono">
                    ${treasuryMetrics.totalCxP.toLocaleString('es-CL')}
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('CXP')}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1"
                >
                  <span>Ver Detalle</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>

          {/* Quick Bank Reconciliation Status Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Resumen de Conciliación Bancaria ({selectedPeriod})
                </h3>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                bankMetrics.isFullyBalanced
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {bankMetrics.isFullyBalanced ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Cartola Cuadrada con Libro Mayor</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Diferencia de Cuadratura: ${Math.abs(bankMetrics.totalDifference).toLocaleString('es-CL')}</span>
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Saldo Final Cartola</span>
                <span className="text-base font-black text-slate-900 font-mono">
                  ${bankMetrics.totalBankBalance.toLocaleString('es-CL')}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Saldo Libro Mayor</span>
                <span className="text-base font-black text-slate-900 font-mono">
                  ${bankMetrics.totalBookBalance.toLocaleString('es-CL')}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Cargos No Contabilizados</span>
                <span className="text-base font-black text-rose-600 font-mono">
                  ${bankMetrics.totalUnmatchedCharges.toLocaleString('es-CL')}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Abonos No Contabilizados</span>
                <span className="text-base font-black text-emerald-600 font-mono">
                  ${bankMetrics.totalUnmatchedDeposits.toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 2. DETALLE DE VENTAS */}
      {activeTab === 'VENTAS' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Facturas y Documentos Emitidos a Clientes ({salesMetrics.count})</span>
            </h3>
            
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold">Fecha</th>
                    <th className="p-2.5 font-bold">Tipo Doc</th>
                    <th className="p-2.5 font-bold">Folio</th>
                    <th className="p-2.5 font-bold">RUT Cliente</th>
                    <th className="p-2.5 font-bold">Razón Social Cliente</th>
                    <th className="p-2.5 font-bold text-right">Neto ($)</th>
                    <th className="p-2.5 font-bold text-right">IVA ($)</th>
                    <th className="p-2.5 font-bold text-right">Total ($)</th>
                    <th className="p-2.5 font-bold text-center">Estado Cobranza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {salesMetrics.salesDocs.map((doc, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 font-sans">
                      <td className="p-2.5 text-slate-600 font-mono whitespace-nowrap">{doc.fechaEmision}</td>
                      <td className="p-2.5 text-slate-700">{doc.tipoDoc}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{doc.folio}</td>
                      <td className="p-2.5 font-mono text-slate-700">{doc.rutReceptor}</td>
                      <td className="p-2.5 font-semibold text-slate-900 truncate max-w-xs">{doc.razonSocialReceptor}</td>
                      <td className="p-2.5 text-right font-mono text-slate-700">${(doc.montoNeto || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-right font-mono text-slate-500">${(doc.montoIva || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-right font-mono font-black text-emerald-700">${(doc.montoTotal || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          doc.estadoCobranza === 'Cobrado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {doc.estadoCobranza || 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {salesMetrics.salesDocs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-xs text-slate-500 italic">
                        No hay ventas registradas en el período {selectedPeriod}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. DETALLE DE GASTOS */}
      {activeTab === 'GASTOS' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-600" />
              <span>Compras y Gastos Recibidos de Proveedores ({expenseMetrics.count})</span>
            </h3>
            
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold">Fecha</th>
                    <th className="p-2.5 font-bold">Tipo Doc</th>
                    <th className="p-2.5 font-bold">Folio</th>
                    <th className="p-2.5 font-bold">RUT Proveedor</th>
                    <th className="p-2.5 font-bold">Razón Social Proveedor</th>
                    <th className="p-2.5 font-bold text-right">Neto ($)</th>
                    <th className="p-2.5 font-bold text-right">IVA ($)</th>
                    <th className="p-2.5 font-bold text-right">Total ($)</th>
                    <th className="p-2.5 font-bold text-center">Estado Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenseMetrics.purchaseDocs.map((doc, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 text-slate-600 font-mono whitespace-nowrap">{doc.fechaEmision}</td>
                      <td className="p-2.5 text-slate-700">{doc.tipoDoc}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{doc.folio}</td>
                      <td className="p-2.5 font-mono text-slate-700">{doc.rutEmisor}</td>
                      <td className="p-2.5 font-semibold text-slate-900 truncate max-w-xs">{doc.razonSocialEmisor}</td>
                      <td className="p-2.5 text-right font-mono text-slate-700">${(doc.montoNeto || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-right font-mono text-slate-500">${(doc.montoIva || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-right font-mono font-black text-rose-700">${(doc.montoTotal || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          doc.estadoPago === 'Pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {doc.estadoPago || 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {expenseMetrics.purchaseDocs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-xs text-slate-500 italic">
                        No hay compras registradas en el período {selectedPeriod}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. CUENTAS POR COBRAR (CxC) */}
      {activeTab === 'CXC' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-600" />
                <span>Nómina de Cuentas por Cobrar Pendientes ({treasuryMetrics.countCxC})</span>
              </h3>
              <span className="text-sm font-black font-mono text-amber-900">
                Total Saldo: ${treasuryMetrics.totalCxC.toLocaleString('es-CL')}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold">Fecha</th>
                    <th className="p-2.5 font-bold">Folio</th>
                    <th className="p-2.5 font-bold">RUT Cliente</th>
                    <th className="p-2.5 font-bold">Razón Social Cliente</th>
                    <th className="p-2.5 font-bold text-right">Monto Total ($)</th>
                    <th className="p-2.5 font-bold text-right">Saldo Pendiente ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {treasuryMetrics.pendingCustomers.map((doc, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 text-slate-600 font-mono">{doc.fechaEmision}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{doc.folio}</td>
                      <td className="p-2.5 font-mono text-slate-700">{doc.rutReceptor}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{doc.razonSocialReceptor}</td>
                      <td className="p-2.5 text-right font-mono text-slate-600">${(doc.montoTotal || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-right font-mono font-black text-amber-800">${(doc.saldoPendiente || doc.montoTotal || 0).toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                  {treasuryMetrics.pendingCustomers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-slate-500 italic">
                        ¡Excelente! No hay cuentas pendientes por cobrar en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. CUENTAS POR PAGAR (CxP) */}
      {activeTab === 'CXP' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span>Nómina de Cuentas por Pagar a Proveedores ({treasuryMetrics.countCxP})</span>
              </h3>
              <span className="text-sm font-black font-mono text-purple-900">
                Total Saldo: ${treasuryMetrics.totalCxP.toLocaleString('es-CL')}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold">Fecha</th>
                    <th className="p-2.5 font-bold">Folio</th>
                    <th className="p-2.5 font-bold">RUT Proveedor</th>
                    <th className="p-2.5 font-bold">Razón Social Proveedor</th>
                    <th className="p-2.5 font-bold text-right">Monto Total ($)</th>
                    <th className="p-2.5 font-bold text-right">Saldo Pendiente ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {treasuryMetrics.pendingSuppliers.map((doc, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 text-slate-600 font-mono">{doc.fechaEmision}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{doc.folio}</td>
                      <td className="p-2.5 font-mono text-slate-700">{doc.rutEmisor}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{doc.razonSocialEmisor}</td>
                      <td className="p-2.5 text-right font-mono text-slate-600">${(doc.montoTotal || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-right font-mono font-black text-purple-800">${(doc.saldoPendiente || doc.montoTotal || 0).toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                  {treasuryMetrics.pendingSuppliers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-slate-500 italic">
                        No hay compromisos pendientes de pago en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONCILIACION BANCARIA DETALLADA */}
      {activeTab === 'BANCOS' && (
        <div className="space-y-5">
          {bankMetrics.accountSummaries.map((acc, idx) => (
            <div key={idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-blue-600" />
                    <span>{acc.accountName}</span>
                    <span className="text-xs font-mono text-slate-500">({acc.accountCode})</span>
                  </h3>
                </div>

                <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                  acc.isCuadrado ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {acc.isCuadrado ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Cuadratura Perfecta ($0 diferencia)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Diferencia: ${acc.difference.toLocaleString('es-CL')}</span>
                    </>
                  )}
                </span>
              </div>

              {/* Balances Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Saldo Anterior</span>
                  <span className="text-sm font-black text-slate-900 font-mono">${acc.bankInitialBalance.toLocaleString('es-CL')}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Saldo Final Cartola</span>
                  <span className="text-sm font-black text-blue-900 font-mono">${acc.bankFinalBalance.toLocaleString('es-CL')}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Saldo Libro Mayor</span>
                  <span className="text-sm font-black text-slate-900 font-mono">${acc.bookFinalBalance.toLocaleString('es-CL')}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Movs. Cartola Pendientes</span>
                  <span className="text-sm font-black text-amber-700 font-mono">{acc.pendingCartolaLines.length} líneas</span>
                </div>
              </div>

              {/* Pending Cartola movements list */}
              {acc.pendingCartolaLines.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Movimientos de Cartola Bancaria Pendientes de Conciliar / Contabilizar:</span>
                  </h4>
                  <div className="overflow-x-auto border border-amber-200 rounded-lg bg-amber-50/30">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-amber-100/50 text-amber-900 border-b border-amber-200">
                        <tr>
                          <th className="p-2 font-bold">Fecha</th>
                          <th className="p-2 font-bold">Descripción / Glosa Banco</th>
                          <th className="p-2 font-bold">N° Doc</th>
                          <th className="p-2 font-bold text-right text-rose-700">Cargo (-)</th>
                          <th className="p-2 font-bold text-right text-emerald-700">Abono (+)</th>
                          <th className="p-2 font-bold text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100 font-mono">
                        {acc.pendingCartolaLines.map((line, lIdx) => (
                          <tr key={lIdx} className="hover:bg-amber-50">
                            <td className="p-2 text-slate-700 whitespace-nowrap">{line.date}</td>
                            <td className="p-2 font-sans font-medium text-slate-900 truncate max-w-sm">{line.description}</td>
                            <td className="p-2 text-slate-600">{line.documentNumber || '-'}</td>
                            <td className="p-2 text-right text-rose-600 font-bold">
                              {line.charge > 0 ? `-$${line.charge.toLocaleString('es-CL')}` : '-'}
                            </td>
                            <td className="p-2 text-right text-emerald-600 font-bold">
                              {line.deposit > 0 ? `+$${line.deposit.toLocaleString('es-CL')}` : '-'}
                            </td>
                            <td className="p-2 text-center">
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-sans">
                                Pendiente
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Todos los movimientos de la cartola se encuentran 100% conciliados con los comprobantes contables.</span>
                </div>
              )}
            </div>
          ))}

          {bankMetrics.accountSummaries.length === 0 && (
            <div className="p-8 bg-white rounded-xl border border-slate-200 text-center text-xs text-slate-500 italic">
              No hay cartolas bancarias cargadas para el período {selectedPeriod}.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
