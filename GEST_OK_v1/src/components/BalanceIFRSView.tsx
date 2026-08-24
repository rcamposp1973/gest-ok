import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';

interface BalanceIFRSViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
}

interface IFRSAccountLine {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number; // Saldo deudor para activos, saldo acreedor para pasivos y patrimonio
}

export default function BalanceIFRSView({
  company,
  vouchers,
  accounts,
  fiscalYears
}: BalanceIFRSViewProps) {
  const [periodFilter, setPeriodFilter] = useState<string>('Todos');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showZeroBalances, setShowZeroBalances] = useState<boolean>(false);

  // Available periods
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      if (v.period) set.add(v.period);
    });
    return Array.from(set).sort().reverse();
  }, [vouchers]);

  // Account Map
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // Compute Balances by Account
  const {
    activosCorrientes,
    activosNoCorrientes,
    totalActivosCorrientes,
    totalActivosNoCorrientes,
    totalActivos,
    pasivosCorrientes,
    pasivosNoCorrientes,
    totalPasivosCorrientes,
    totalPasivosNoCorrientes,
    totalPasivos,
    patrimonio,
    resultadoEjercicio,
    totalPatrimonioNeto,
    totalPasivoMasPatrimonio,
    diferenciaCuadratura,
    isBalanced,
    descuadradosCount
  } = useMemo(() => {
    const accSums = new Map<string, { debit: number; credit: number; account: ChartOfAccount }>();

    // Inicializar cuentas
    accounts.forEach(acc => {
      accSums.set(acc.id, { debit: 0, credit: 0, account: acc });
    });

    // Sumar comprobantes válidos y perfectamente cuadrados (Partida Doble Estricta)
    const descuadradosVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      if (periodFilter !== 'Todos' && v.period !== periodFilter) return false;
      if (dateFrom && v.date < dateFrom) return false;
      if (dateTo && v.date > dateTo) return false;
      return v.status === 'Descuadrado' || v.isDescuadrado || Math.abs((v.totalDebit || 0) - (v.totalCredit || 0)) > 0.01;
    });

    const validVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      if (v.status === 'Descuadrado' || v.isDescuadrado) return false;
      if (Math.abs((v.totalDebit || 0) - (v.totalCredit || 0)) > 0.01) return false;
      if (periodFilter !== 'Todos' && v.period !== periodFilter) return false;
      if (dateFrom && v.date < dateFrom) return false;
      if (dateTo && v.date > dateTo) return false;
      return true;
    });

    validVouchers.forEach(v => {
      if (!v.lines) return;
      v.lines.forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        if (debit === 0 && credit === 0) return;

        let targetAcc = accountMap.get(l.accountId) || accountMap.get(l.accountCode);
        if (!targetAcc) {
          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: l.accountCode || 'S/C',
            name: l.accountName || 'Cuenta no clasificada',
            type: 'Activo',
            requiereCentroCosto: false,
            requiereAuxiliarRUT: false,
            requiereConciliacionBancaria: false,
            requiereDocumento: false,
            estado: 'Activo'
          };
        }

        let entry = accSums.get(targetAcc.id);
        if (!entry) {
          entry = { debit: 0, credit: 0, account: targetAcc };
          accSums.set(targetAcc.id, entry);
        }

        entry.debit += debit;
        entry.credit += credit;
      });
    });

    // Clasificación IFRS
    const actCorr: IFRSAccountLine[] = [];
    const actNoCorr: IFRSAccountLine[] = [];
    const pasCorr: IFRSAccountLine[] = [];
    const pasNoCorr: IFRSAccountLine[] = [];
    const patri: IFRSAccountLine[] = [];

    let totalIngresos = 0;
    let totalGastos = 0;

    accSums.forEach(({ debit, credit, account }) => {
      const code = account.code || '';
      const name = (account.name || '').toLowerCase();
      const normType = (account.type || '').toLowerCase();

      // 1. ACTIVOS (Código 1 o Type Activo)
      if (normType.includes('activo') || code.startsWith('1')) {
        const balance = debit - credit;
        if (!showZeroBalances && balance === 0) return;

        // Criterio Corriente vs No Corriente
        // No corriente: activo fijo, propiedades planta equipo, intangibles, depreciacion acumulada, l/plazo
        const isNoCorriente = 
          code.startsWith('1.2') || code.startsWith('1-2') || code.startsWith('12') ||
          name.includes('fijo') || name.includes('propiedad') || name.includes('planta') || 
          name.includes('equipo') || name.includes('intangible') || name.includes('largo plazo') ||
          name.includes('depreciaci') || name.includes('terreno') || name.includes('vehiculo') || name.includes('maquinaria');

        const item: IFRSAccountLine = {
          id: account.id,
          code: account.code,
          name: account.name,
          debit,
          credit,
          balance
        };

        if (isNoCorriente) {
          actNoCorr.push(item);
        } else {
          actCorr.push(item);
        }
      }
      // 2. PASIVOS (Código 2 o Type Pasivo)
      else if (normType.includes('pasivo') || code.startsWith('2')) {
        const balance = credit - debit;
        if (!showZeroBalances && balance === 0) return;

        // Criterio Corriente vs No Corriente
        const isNoCorriente = 
          code.startsWith('2.2') || code.startsWith('2-2') || code.startsWith('22') ||
          name.includes('largo plazo') || name.includes('l/p') || name.includes('hipotecario') || name.includes('bonos por pagar');

        const item: IFRSAccountLine = {
          id: account.id,
          code: account.code,
          name: account.name,
          debit,
          credit,
          balance
        };

        if (isNoCorriente) {
          pasNoCorr.push(item);
        } else {
          pasCorr.push(item);
        }
      }
      // 3. PATRIMONIO (Código 3 o Type Patrimonio)
      else if (normType.includes('patrimonio') || code.startsWith('3')) {
        const balance = credit - debit;
        if (!showZeroBalances && balance === 0) return;

        patri.push({
          id: account.id,
          code: account.code,
          name: account.name,
          debit,
          credit,
          balance
        });
      }
      // 4. INGRESOS (Código 4 o Type Ingreso)
      else if (normType.includes('ingreso') || normType.includes('ganancia') || code.startsWith('4')) {
        totalIngresos += (credit - debit);
      }
      // 5. GASTOS / COSTOS (Código 5 o Type Gasto)
      else if (normType.includes('gasto') || normType.includes('costo') || normType.includes('perdida') || code.startsWith('5')) {
        totalGastos += (debit - credit);
      }
    });

    const totalActivosCorrientes = actCorr.reduce((s, a) => s + a.balance, 0);
    const totalActivosNoCorrientes = actNoCorr.reduce((s, a) => s + a.balance, 0);
    const totalActivos = totalActivosCorrientes + totalActivosNoCorrientes;

    const totalPasivosCorrientes = pasCorr.reduce((s, a) => s + a.balance, 0);
    const totalPasivosNoCorrientes = pasNoCorr.reduce((s, a) => s + a.balance, 0);
    const totalPasivos = totalPasivosCorrientes + totalPasivosNoCorrientes;

    const totalPatrimonioDirecto = patri.reduce((s, a) => s + a.balance, 0);
    const resultadoEjercicio = totalIngresos - totalGastos;
    const totalPatrimonioNeto = totalPatrimonioDirecto + resultadoEjercicio;

    const totalPasivoMasPatrimonio = totalPasivos + totalPatrimonioNeto;
    const diferenciaCuadratura = Math.abs(totalActivos - totalPasivoMasPatrimonio);
    const isBalanced = diferenciaCuadratura < 1;

    return {
      activosCorrientes: actCorr,
      activosNoCorrientes: actNoCorr,
      totalActivosCorrientes,
      totalActivosNoCorrientes,
      totalActivos,
      pasivosCorrientes: pasCorr,
      pasivosNoCorrientes: pasNoCorr,
      totalPasivosCorrientes,
      totalPasivosNoCorrientes,
      totalPasivos,
      patrimonio: patri,
      resultadoEjercicio,
      totalPatrimonioNeto,
      totalPasivoMasPatrimonio,
      diferenciaCuadratura,
      isBalanced,
      descuadradosCount: descuadradosVouchers.length
    };
  }, [accounts, vouchers, accountMap, periodFilter, dateFrom, dateTo, showZeroBalances]);

  // Export CSV
  const handleExportCSV = () => {
    const rows = [
      ['ESTADO DE SITUACIÓN FINANCIERA CLASIFICADO (IFRS / FECU)', `"${company.name}"`, `RUT: ${company.rut}`],
      ['Período:', periodFilter !== 'Todos' ? periodFilter : 'Todo el Ejercicio'],
      [''],
      ['CÓDIGO', 'DESCRIPCIÓN IFRS', 'SALDO ($)'],
      ['1. ACTIVOS', '', totalActivos.toString()],
      ['1.1. ACTIVOS CORRIENTES (CIRCULANTES)', '', totalActivosCorrientes.toString()],
      ...activosCorrientes.map(a => [`"${a.code}"`, `"${a.name}"`, a.balance.toString()]),
      ['1.2. ACTIVOS NO CORRIENTES (FIJOS E INTANGIBLES)', '', totalActivosNoCorrientes.toString()],
      ...activosNoCorrientes.map(a => [`"${a.code}"`, `"${a.name}"`, a.balance.toString()]),
      ['TOTAL ACTIVOS', '', totalActivos.toString()],
      [''],
      ['2. PASIVOS', '', totalPasivos.toString()],
      ['2.1. PASIVOS CORRIENTES (CORTO PLAZO)', '', totalPasivosCorrientes.toString()],
      ...pasivosCorrientes.map(a => [`"${a.code}"`, `"${a.name}"`, a.balance.toString()]),
      ['2.2. PASIVOS NO CORRIENTES (LARGO PLAZO)', '', totalPasivosNoCorrientes.toString()],
      ...pasivosNoCorrientes.map(a => [`"${a.code}"`, `"${a.name}"`, a.balance.toString()]),
      ['TOTAL PASIVOS', '', totalPasivos.toString()],
      [''],
      ['3. PATRIMONIO NETO', '', totalPatrimonioNeto.toString()],
      ...patrimonio.map(a => [`"${a.code}"`, `"${a.name}"`, a.balance.toString()]),
      ['3.9. RESULTADO DEL EJERCICIO (UTILIDAD / PÉRDIDA)', '', resultadoEjercicio.toString()],
      ['TOTAL PATRIMONIO NETO', '', totalPatrimonioNeto.toString()],
      ['TOTAL PASIVO + PATRIMONIO NETO', '', totalPasivoMasPatrimonio.toString()],
      ['DIFERENCIA CUADRATURA', '', diferenciaCuadratura.toString()]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Balance_Clasificado_IFRS_${company.rut}_${periodFilter !== 'Todos' ? periodFilter : 'General'}.csv`);
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
            <span className="text-xl">⚖️</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Balance Clasificado IFRS / FECU
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Estado de Situación Financiera clasificado en Corriente y No Corriente bajo estándar IFRS ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>📥</span>
            <span>Exportar CSV / Excel</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>🖨️</span>
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Alerta de comprobantes excluidos por descuadratura */}
      {descuadradosCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl text-amber-900 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <div>
              <span className="font-bold">Partida Doble Estricta (Normativa IFRS):</span> Se han excluido automáticamente <strong>{descuadradosCount}</strong> comprobante(s) que presentaban descuadre contable (Debe ≠ Haber) para garantizar un Estado de Situación Financiera 100% fidedigno y cuadrado.
            </div>
          </div>
        </div>
      )}

      {/* Filters & Toggles */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Período:</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="Todos">Todo el Ejercicio</option>
              {availablePeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Desde:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Hasta:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showZeroBalances}
              onChange={(e) => setShowZeroBalances(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Mostrar cuentas con saldo $0</span>
          </label>
        </div>

        {/* Cuadratura Indicator */}
        <div className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
          isBalanced ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800 animate-pulse'
        }`}>
          <span>{isBalanced ? '✅ Cuadratura IFRS Exacta' : '⚠️ Descuadre Patrimonial'}</span>
          {!isBalanced && (
            <span className="font-mono ml-1">Diff: ${diferenciaCuadratura.toLocaleString('es-CL')}</span>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Total Activos</span>
          <p className="text-xl font-black text-indigo-950 mt-0.5">${totalActivos.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Corrientes: ${totalActivosCorrientes.toLocaleString('es-CL')}</span>
            <span>No Corrientes: ${totalActivosNoCorrientes.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Total Pasivos</span>
          <p className="text-xl font-black text-rose-950 mt-0.5">${totalPasivos.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Corrientes: ${totalPasivosCorrientes.toLocaleString('es-CL')}</span>
            <span>No Corrientes: ${totalPasivosNoCorrientes.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Patrimonio Neto</span>
          <p className="text-xl font-black text-emerald-950 mt-0.5">${totalPatrimonioNeto.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Resultado Ejercicio: ${resultadoEjercicio.toLocaleString('es-CL')}</span>
            <span>Patrimonio Base: ${(totalPatrimonioNeto - resultadoEjercicio).toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column IFRS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COLUMNA 1: ACTIVOS */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="divide-y divide-slate-200 text-xs">
            <div className="bg-indigo-900 text-white p-3 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
              <span>1. ESTRUCTURA DE ACTIVOS (IFRS)</span>
              <span className="font-mono text-sm">${totalActivos.toLocaleString('es-CL')}</span>
            </div>

            {/* 1.1 Activos Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">
                <span className="text-indigo-900 uppercase font-black tracking-wide">1.1. ACTIVOS CORRIENTES (CIRCULANTES)</span>
                <span className="font-mono text-indigo-900 font-bold">${totalActivosCorrientes.toLocaleString('es-CL')}</span>
              </div>
              {activosCorrientes.length > 0 ? (
                <div className="space-y-1.5 pl-2 font-mono">
                  {activosCorrientes.map(acc => (
                    <div key={acc.id} className="flex justify-between text-slate-600 hover:bg-slate-100/80 px-1.5 py-0.5 rounded">
                      <span className="font-sans truncate max-w-[280px]">
                        <span className="font-bold text-slate-800 mr-2 font-mono">{acc.code}</span>
                        {acc.name}
                      </span>
                      <span className="font-bold text-slate-900">${acc.balance.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2">Sin activos corrientes registrados</p>
              )}
            </div>

            {/* 1.2 Activos No Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">
                <span className="text-slate-800 uppercase font-black tracking-wide">1.2. ACTIVOS NO CORRIENTES (FIJOS E INTANGIBLES)</span>
                <span className="font-mono text-slate-800 font-bold">${totalActivosNoCorrientes.toLocaleString('es-CL')}</span>
              </div>
              {activosNoCorrientes.length > 0 ? (
                <div className="space-y-1.5 pl-2 font-mono">
                  {activosNoCorrientes.map(acc => (
                    <div key={acc.id} className="flex justify-between text-slate-600 hover:bg-slate-100/80 px-1.5 py-0.5 rounded">
                      <span className="font-sans truncate max-w-[280px]">
                        <span className="font-bold text-slate-800 mr-2 font-mono">{acc.code}</span>
                        {acc.name}
                      </span>
                      <span className="font-bold text-slate-900">${acc.balance.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2">Sin activos no corrientes registrados</p>
              )}
            </div>
          </div>

          <div className="bg-indigo-950 text-white p-3 flex justify-between items-center font-bold text-sm border-t border-indigo-900">
            <span className="uppercase tracking-wide">TOTAL ACTIVOS:</span>
            <span className="font-mono text-base font-black">${totalActivos.toLocaleString('es-CL')}</span>
          </div>
        </div>

        {/* COLUMNA 2: PASIVOS Y PATRIMONIO */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="divide-y divide-slate-200 text-xs">
            <div className="bg-slate-900 text-white p-3 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
              <span>2. PASIVOS Y PATRIMONIO NETO (IFRS)</span>
              <span className="font-mono text-sm">${totalPasivoMasPatrimonio.toLocaleString('es-CL')}</span>
            </div>

            {/* 2.1 Pasivos Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">
                <span className="text-rose-900 uppercase font-black tracking-wide">2.1. PASIVOS CORRIENTES (CORTO PLAZO)</span>
                <span className="font-mono text-rose-900 font-bold">${totalPasivosCorrientes.toLocaleString('es-CL')}</span>
              </div>
              {pasivosCorrientes.length > 0 ? (
                <div className="space-y-1.5 pl-2 font-mono">
                  {pasivosCorrientes.map(acc => (
                    <div key={acc.id} className="flex justify-between text-slate-600 hover:bg-slate-100/80 px-1.5 py-0.5 rounded">
                      <span className="font-sans truncate max-w-[280px]">
                        <span className="font-bold text-slate-800 mr-2 font-mono">{acc.code}</span>
                        {acc.name}
                      </span>
                      <span className="font-bold text-slate-900">${acc.balance.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2">Sin pasivos corrientes registrados</p>
              )}
            </div>

            {/* 2.2 Pasivos No Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">
                <span className="text-slate-800 uppercase font-black tracking-wide">2.2. PASIVOS NO CORRIENTES (LARGO PLAZO)</span>
                <span className="font-mono text-slate-800 font-bold">${totalPasivosNoCorrientes.toLocaleString('es-CL')}</span>
              </div>
              {pasivosNoCorrientes.length > 0 ? (
                <div className="space-y-1.5 pl-2 font-mono">
                  {pasivosNoCorrientes.map(acc => (
                    <div key={acc.id} className="flex justify-between text-slate-600 hover:bg-slate-100/80 px-1.5 py-0.5 rounded">
                      <span className="font-sans truncate max-w-[280px]">
                        <span className="font-bold text-slate-800 mr-2 font-mono">{acc.code}</span>
                        {acc.name}
                      </span>
                      <span className="font-bold text-slate-900">${acc.balance.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2">Sin pasivos de largo plazo registrados</p>
              )}
            </div>

            {/* 3. Patrimonio Neto */}
            <div className="p-3 bg-emerald-50/40">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-emerald-200 pb-1">
                <span className="text-emerald-950 uppercase font-black tracking-wide">3. PATRIMONIO NETO</span>
                <span className="font-mono text-emerald-950 font-bold">${totalPatrimonioNeto.toLocaleString('es-CL')}</span>
              </div>
              <div className="space-y-1.5 pl-2 font-mono">
                {patrimonio.map(acc => (
                  <div key={acc.id} className="flex justify-between text-slate-600 hover:bg-slate-100/80 px-1.5 py-0.5 rounded">
                    <span className="font-sans truncate max-w-[280px]">
                      <span className="font-bold text-slate-800 mr-2 font-mono">{acc.code}</span>
                      {acc.name}
                    </span>
                    <span className="font-bold text-slate-900">${acc.balance.toLocaleString('es-CL')}</span>
                  </div>
                ))}
                <div className="flex justify-between text-emerald-900 font-bold border-t border-emerald-200 pt-1">
                  <span className="font-sans">Resultado del Ejercicio (Ganancia / Pérdida)</span>
                  <span>${resultadoEjercicio.toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 text-white p-3 flex justify-between items-center font-bold text-sm border-t border-slate-800">
            <span className="uppercase tracking-wide">TOTAL PASIVO + PATRIMONIO:</span>
            <span className="font-mono text-base font-black">${totalPasivoMasPatrimonio.toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
