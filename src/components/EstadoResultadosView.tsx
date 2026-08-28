import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';

interface EstadoResultadosViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
}

interface MonthlyAccountItem {
  account: ChartOfAccount;
  months: number[]; // 12 monthly net balances
  total: number;
}

export default function EstadoResultadosView({
  company,
  vouchers,
  accounts,
  fiscalYears
}: EstadoResultadosViewProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showZeroBalances, setShowZeroBalances] = useState<boolean>(false);
  const [viewFormat, setViewFormat] = useState<'ifrs' | 'mensual'>('ifrs');

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Account map
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // Compute 12-Month Matrix for Income Statement categorized by IFRS / NIIF por función
  const statementData = useMemo(() => {
    // Map accountId -> { account, monthlyDebit: number[12], monthlyCredit: number[12] }
    const accMatrix = new Map<string, { account: ChartOfAccount; monthlyDebit: number[]; monthlyCredit: number[] }>();

    accounts.forEach(acc => {
      accMatrix.set(acc.id, {
        account: acc,
        monthlyDebit: new Array(12).fill(0),
        monthlyCredit: new Array(12).fill(0)
      });
    });

    const validVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      const vYear = v.date ? parseInt(v.date.slice(0, 4)) : selectedYear;
      return vYear === selectedYear;
    });

    validVouchers.forEach(v => {
      if (!v.lines || !v.date) return;
      const mIdx = parseInt(v.date.slice(5, 7)) - 1;
      if (mIdx < 0 || mIdx > 11) return;

      v.lines.forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        if (debit === 0 && credit === 0) return;

        let targetAcc = accountMap.get(l.accountId) || accountMap.get(l.accountCode);
        if (!targetAcc) {
          const accCodeStr = l.accountCode || 'S/C';
          const prefix = accCodeStr.trim().charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Gasto';
          if (prefix === '1') inferredType = 'Activo';
          else if (prefix === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3') || accCodeStr.startsWith('2-3')) ? 'Patrimonio' : 'Pasivo';
          }
          else if (prefix === '3') inferredType = 'Ingreso';
          else if (prefix === '4' || prefix === '5') inferredType = 'Gasto';

          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: accCodeStr,
            name: l.accountName || 'Cuenta no clasificada',
            type: inferredType,
            requiereCentroCosto: false,
            requiereAuxiliarRUT: false,
            requiereConciliacionBancaria: false,
            requiereDocumento: false,
            estado: 'Activo'
          };
        }

        let entry = accMatrix.get(targetAcc.id);
        if (!entry) {
          entry = {
            account: targetAcc,
            monthlyDebit: new Array(12).fill(0),
            monthlyCredit: new Array(12).fill(0)
          };
          accMatrix.set(targetAcc.id, entry);
        }

        entry.monthlyDebit[mIdx] += debit;
        entry.monthlyCredit[mIdx] += credit;
      });
    });

    // Categorías IFRS / NIIF Por Función (NIC 1):
    const operatingRevenues: MonthlyAccountItem[] = [];
    const costOfSales: MonthlyAccountItem[] = [];
    const operatingExpenses: MonthlyAccountItem[] = [];
    const depreciationExpenses: MonthlyAccountItem[] = [];
    const otherOperatingIncome: MonthlyAccountItem[] = [];
    const otherOperatingExpenses: MonthlyAccountItem[] = [];
    const financialIncome: MonthlyAccountItem[] = [];
    const financialCosts: MonthlyAccountItem[] = [];
    const incomeTax: MonthlyAccountItem[] = [];
    const otherComprehensiveIncome: MonthlyAccountItem[] = [];

    accMatrix.forEach(({ account, monthlyDebit, monthlyCredit }) => {
      const code = (account.code || '').trim();
      const codePrefix = code.charAt(0);
      const normType = (account.type || '').toLowerCase();
      const name = (account.name || '').toLowerCase();

      // 3 = Ingresos, 4 / 5 = Gastos y Costos (según estándar chileno definido)
      const isIncome = 
        codePrefix === '3' || 
        (!['1', '2', '4', '5'].includes(codePrefix) && (normType.includes('ingreso') || normType.includes('ganancia') || normType.includes('venta')));
      
      const isExpense = 
        codePrefix === '4' || 
        codePrefix === '5' || 
        (!['1', '2', '3'].includes(codePrefix) && (normType.includes('gasto') || normType.includes('costo') || normType.includes('perdida') || normType.includes('impuesto')));

      if (!isIncome && !isExpense) return;

      if (isIncome) {
        // Ingresos: Saldo = Crédito - Débito
        const months = monthlyCredit.map((c, i) => c - monthlyDebit[i]);
        const total = months.reduce((s, v) => s + v, 0);

        if (!showZeroBalances && total === 0) return;

        const isORI = name.includes('ori') || name.includes('revalorizacion') || name.includes('conversion de moneda') || name.includes('otro resultado integral');
        const isFin = name.includes('financiero') || name.includes('interes') || name.includes('diferencia de cambio') || name.includes('reajuste') || code.startsWith('3.3') || code.startsWith('33') || code.startsWith('4.3') || code.startsWith('43');
        const isOtherOp = name.includes('otro ingreso') || name.includes('otra ganancia') || name.includes('subvencion') || name.includes('venta activo fijo') || name.includes('no operacional') || code.startsWith('3.2') || code.startsWith('32');

        if (isORI) {
          otherComprehensiveIncome.push({ account, months, total });
        } else if (isFin) {
          financialIncome.push({ account, months, total });
        } else if (isOtherOp) {
          otherOperatingIncome.push({ account, months, total });
        } else {
          operatingRevenues.push({ account, months, total });
        }
      } else if (isExpense) {
        // Gastos/Costos: Saldo = Débito - Crédito
        const months = monthlyDebit.map((d, i) => d - monthlyCredit[i]);
        const total = months.reduce((s, v) => s + v, 0);

        if (!showZeroBalances && total === 0) return;

        const isORI = name.includes('ori') || name.includes('revalorizacion') || name.includes('otro resultado integral');
        const isDeprec = name.includes('depreciaci') || name.includes('amortizaci') || code.startsWith('4.2.02') || code.startsWith('4202') || code.startsWith('5.2.02') || code.startsWith('5202');
        const isTax = name.includes('impuesto a la renta') || name.includes('impuesto 1da') || name.includes('impuesto primera') || name.includes('impuesto diferido') || code.startsWith('4.4') || code.startsWith('44') || code.startsWith('5.4') || code.startsWith('54');
        const isFin = name.includes('financiero') || name.includes('interes') || name.includes('comision bancaria') || name.includes('gasto bancario') || name.includes('diferencia de cambio') || code.startsWith('4.3') || code.startsWith('43') || code.startsWith('5.3') || code.startsWith('53');
        const isCost = name.includes('costo de venta') || name.includes('costo directo') || name.includes('costo explotacion') || name.includes('costo mercaderia') || name.includes('costo servicio') || name.includes('materia prima') || name.includes('insumos') || code.startsWith('4.1') || code.startsWith('41') || code.startsWith('5.1') || code.startsWith('51');
        const isOtherOp = name.includes('otro gasto') || name.includes('otra perdida') || name.includes('multa') || name.includes('no operacional');

        if (isORI) {
          otherComprehensiveIncome.push({ account, months: months.map(v => -v), total: -total });
        } else if (isTax) {
          incomeTax.push({ account, months, total });
        } else if (isFin) {
          financialCosts.push({ account, months, total });
        } else if (isCost) {
          costOfSales.push({ account, months, total });
        } else if (isDeprec) {
          depreciationExpenses.push({ account, months, total });
        } else if (isOtherOp) {
          otherOperatingExpenses.push({ account, months, total });
        } else {
          operatingExpenses.push({ account, months, total });
        }
      }
    });

    // Helper sum months
    const sumMonths = (list: MonthlyAccountItem[]) => {
      const res = new Array(12).fill(0);
      list.forEach(item => {
        item.months.forEach((v, i) => { res[i] += v; });
      });
      return res;
    };

    const monthlyOpRevenues = sumMonths(operatingRevenues);
    const monthlyCostOfSales = sumMonths(costOfSales);
    const monthlyGrossMargin = monthlyOpRevenues.map((r, i) => r - monthlyCostOfSales[i]);
    
    const monthlyOpExpenses = sumMonths(operatingExpenses);
    const monthlyDepreciation = sumMonths(depreciationExpenses);
    const monthlyOtherOpInc = sumMonths(otherOperatingIncome);
    const monthlyOtherOpExp = sumMonths(otherOperatingExpenses);
    const monthlyOperatingResult = monthlyGrossMargin.map((g, i) => g - monthlyOpExpenses[i] - monthlyDepreciation[i] + monthlyOtherOpInc[i] - monthlyOtherOpExp[i]);

    const monthlyFinInc = sumMonths(financialIncome);
    const monthlyFinCosts = sumMonths(financialCosts);
    const monthlyProfitBeforeTax = monthlyOperatingResult.map((o, i) => o + monthlyFinInc[i] - monthlyFinCosts[i]);
    const monthlyIncomeTax = sumMonths(incomeTax);

    const monthlyNetIncome = monthlyProfitBeforeTax.map((p, i) => p - monthlyIncomeTax[i]);
    const monthlyORI = sumMonths(otherComprehensiveIncome);
    const monthlyComprehensiveIncome = monthlyNetIncome.map((n, i) => n + monthlyORI[i]);

    // Totales Anuales
    const totalOpRevenues = monthlyOpRevenues.reduce((s, v) => s + v, 0);
    const totalCostOfSales = monthlyCostOfSales.reduce((s, v) => s + v, 0);
    const totalGrossMargin = totalOpRevenues - totalCostOfSales;
    const grossMarginPercent = totalOpRevenues > 0 ? (totalGrossMargin / totalOpRevenues) * 100 : 0;

    const totalOpExpenses = monthlyOpExpenses.reduce((s, v) => s + v, 0);
    const totalDepreciation = monthlyDepreciation.reduce((s, v) => s + v, 0);
    const totalOtherOpInc = monthlyOtherOpInc.reduce((s, v) => s + v, 0);
    const totalOtherOpExp = monthlyOtherOpExp.reduce((s, v) => s + v, 0);
    const totalOperatingResult = totalGrossMargin - totalOpExpenses - totalDepreciation + totalOtherOpInc - totalOtherOpExp;
    const operatingMarginPercent = totalOpRevenues > 0 ? (totalOperatingResult / totalOpRevenues) * 100 : 0;

    const totalFinInc = monthlyFinInc.reduce((s, v) => s + v, 0);
    const totalFinCosts = monthlyFinCosts.reduce((s, v) => s + v, 0);
    const totalFinancialResult = totalFinInc - totalFinCosts;

    const totalProfitBeforeTax = totalOperatingResult + totalFinancialResult;
    const totalIncomeTax = monthlyIncomeTax.reduce((s, v) => s + v, 0);

    const totalNetIncome = totalProfitBeforeTax - totalIncomeTax;
    const netMarginPercent = totalOpRevenues > 0 ? (totalNetIncome / totalOpRevenues) * 100 : 0;

    const totalORI = monthlyORI.reduce((s, v) => s + v, 0);
    const totalComprehensiveIncome = totalNetIncome + totalORI;

    return {
      operatingRevenues,
      costOfSales,
      operatingExpenses,
      depreciationExpenses,
      otherOperatingIncome,
      otherOperatingExpenses,
      financialIncome,
      financialCosts,
      incomeTax,
      otherComprehensiveIncome,

      monthlyOpRevenues,
      monthlyCostOfSales,
      monthlyGrossMargin,
      monthlyOpExpenses,
      monthlyDepreciation,
      monthlyOtherOpInc,
      monthlyOtherOpExp,
      monthlyOperatingResult,
      monthlyFinInc,
      monthlyFinCosts,
      monthlyProfitBeforeTax,
      monthlyIncomeTax,
      monthlyNetIncome,
      monthlyORI,
      monthlyComprehensiveIncome,

      totalOpRevenues,
      totalCostOfSales,
      totalGrossMargin,
      grossMarginPercent,
      totalOpExpenses,
      totalDepreciation,
      totalOtherOpInc,
      totalOtherOpExp,
      totalOperatingResult,
      operatingMarginPercent,
      totalFinInc,
      totalFinCosts,
      totalFinancialResult,
      totalProfitBeforeTax,
      totalIncomeTax,
      totalNetIncome,
      netMarginPercent,
      totalORI,
      totalComprehensiveIncome,
      isProfit: totalComprehensiveIncome >= 0
    };
  }, [accounts, vouchers, accountMap, selectedYear, showZeroBalances]);

  // Export CSV IFRS
  const handleExportCSV = () => {
    const headers = ['CONCEPTO / CLASIFICACIÓN IFRS', 'CÓDIGO', 'CUENTA', ...monthNames, 'TOTAL AÑO'];
    const rows = [
      ['ESTADO DE RESULTADOS POR FUNCIÓN (ESTÁNDAR IFRS / NIIF)', `"${company.name}"`, `RUT: ${company.rut}`, `Año: ${selectedYear}`],
      [''],
      headers,
      ['1. INGRESOS OPERACIONALES', '', '', ...statementData.monthlyOpRevenues.map(v => v.toString()), statementData.totalOpRevenues.toString()],
      ...statementData.operatingRevenues.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['2. COSTOS DE VENTAS', '', '', ...statementData.monthlyCostOfSales.map(v => v.toString()), statementData.totalCostOfSales.toString()],
      ...statementData.costOfSales.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) MARGEN BRUTO', '', '', ...statementData.monthlyGrossMargin.map(v => v.toString()), statementData.totalGrossMargin.toString()],
      ['3. GASTOS DE ADMINISTRACIÓN Y VENTAS', '', '', ...statementData.monthlyOpExpenses.map(v => v.toString()), statementData.totalOpExpenses.toString()],
      ...statementData.operatingExpenses.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['4. OTROS INGRESOS OPERACIONALES', '', '', ...statementData.monthlyOtherOpInc.map(v => v.toString()), statementData.totalOtherOpInc.toString()],
      ...statementData.otherOperatingIncome.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['5. OTROS GASTOS OPERACIONALES', '', '', ...statementData.monthlyOtherOpExp.map(v => v.toString()), statementData.totalOtherOpExp.toString()],
      ...statementData.otherOperatingExpenses.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) RESULTADO OPERACIONAL (EBIT)', '', '', ...statementData.monthlyOperatingResult.map(v => v.toString()), statementData.totalOperatingResult.toString()],
      ['6. INGRESOS FINANCIEROS', '', '', ...statementData.monthlyFinInc.map(v => v.toString()), statementData.totalFinInc.toString()],
      ...statementData.financialIncome.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['7. COSTOS FINANCIEROS', '', '', ...statementData.monthlyFinCosts.map(v => v.toString()), statementData.totalFinCosts.toString()],
      ...statementData.financialCosts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['8. IMPUESTO A LA RENTA', '', '', ...statementData.monthlyIncomeTax.map(v => v.toString()), statementData.totalIncomeTax.toString()],
      ...statementData.incomeTax.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) GANANCIA (PÉRDIDA) NETA DEL EJERCICIO', '', '', ...statementData.monthlyNetIncome.map(v => v.toString()), statementData.totalNetIncome.toString()]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Estado_Resultados_IFRS_${company.rut}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Estado de Resultados por Función (Estándar IFRS / NIIF)
            </h3>
            <span className="bg-indigo-100 text-indigo-800 text-[11px] font-bold px-2 py-0.5 rounded-md">
              NIIF / NIC 1
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Clasificación formal de cuentas por función operacional con subtotales intermedios (Margen Bruto, EBIT y Resultado Neto) ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setViewFormat('ifrs')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                viewFormat === 'ifrs'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
              }`}
            >
              Estructura IFRS
            </button>
            <button
              onClick={() => setViewFormat('mensual')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                viewFormat === 'mensual'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
              }`}
            >
              Matriz 12 Meses
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
            <label className="font-semibold text-slate-600">Año Fiscal:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-300 rounded font-bold px-2 py-0.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
            >
              {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={showZeroBalances}
              onChange={(e) => setShowZeroBalances(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <span className="font-medium">Mostrar $0</span>
          </label>

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>📥</span>
            <span>Exportar CSV</span>
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

      {/* KPI Cards for Key Subtotals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">1. Ingresos Operacionales</span>
          <p className="text-xl font-black text-slate-900 font-mono mt-0.5">${statementData.totalOpRevenues.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">100% Base de Ventas</span>
        </div>

        <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">Margen Bruto (Subtotal 1)</span>
          <p className="text-xl font-black text-emerald-950 font-mono mt-0.5">${statementData.totalGrossMargin.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-emerald-700 font-bold">{statementData.grossMarginPercent.toFixed(1)}% sobre ingresos</span>
        </div>

        <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 block">Resultado Operacional (EBIT)</span>
          <p className="text-xl font-black text-indigo-950 font-mono mt-0.5">${statementData.totalOperatingResult.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-indigo-700 font-bold">{statementData.operatingMarginPercent.toFixed(1)}% margen EBIT</span>
        </div>

        <div className={`p-3.5 rounded-xl border shadow-2xs ${statementData.isProfit ? 'bg-slate-900 border-slate-950 text-white' : 'bg-rose-900 border-rose-950 text-white'}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider opacity-80 block">
            {statementData.isProfit ? 'Ganancia Neta del Ejercicio' : 'Pérdida Neta del Ejercicio'}
          </span>
          <p className="text-xl font-black font-mono mt-0.5">${statementData.totalNetIncome.toLocaleString('es-CL')}</p>
          <span className="text-[10px] font-semibold opacity-90">{statementData.netMarginPercent.toFixed(1)}% margen neto IFRS</span>
        </div>
      </div>

      {/* VIEW MODE 1: ESTRUCTURA IFRS POR FUNCIÓN */}
      {viewFormat === 'ifrs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-slate-900 px-4 py-3 text-white flex justify-between items-center">
            <h4 className="font-bold text-xs uppercase tracking-wider">
              Estado de Resultados por Función — Año Gravable {selectedYear}
            </h4>
            <span className="text-xs font-mono text-slate-300">Moneda: CLP ($)</span>
          </div>

          <div className="divide-y divide-slate-200 text-xs">
            {/* 1. INGRESOS DE ACTIVIDADES ORDINARIAS */}
            <div className="p-4 bg-slate-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-black text-slate-900 uppercase tracking-wide text-xs">
                  1. (+) Ingresos de Actividades Ordinarias (Ventas)
                </span>
                <span className="font-mono font-black text-sm text-slate-900">
                  ${statementData.totalOpRevenues.toLocaleString('es-CL')}
                </span>
              </div>
              {statementData.operatingRevenues.length > 0 ? (
                <div className="pl-4 space-y-1">
                  {statementData.operatingRevenues.map(item => (
                    <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                      <span className="font-sans">
                        <strong className="font-mono text-indigo-700 mr-2">{item.account.code}</strong>
                        {item.account.name}
                      </span>
                      <span className="font-mono font-bold text-slate-800">${item.total.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 pl-4 text-[11px]">No se registraron ingresos ordinarios en este período.</p>
              )}
            </div>

            {/* 2. COSTO DE VENTAS */}
            <div className="p-4 bg-slate-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-black text-rose-900 uppercase tracking-wide text-xs">
                  2. (-) Costo de Ventas
                </span>
                <span className="font-mono font-black text-sm text-rose-800">
                  -${statementData.totalCostOfSales.toLocaleString('es-CL')}
                </span>
              </div>
              {statementData.costOfSales.length > 0 ? (
                <div className="pl-4 space-y-1">
                  {statementData.costOfSales.map(item => (
                    <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                      <span className="font-sans">
                        <strong className="font-mono text-rose-700 mr-2">{item.account.code}</strong>
                        {item.account.name}
                      </span>
                      <span className="font-mono font-bold text-rose-900">${item.total.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 pl-4 text-[11px]">No se registraron costos de ventas en este período.</p>
              )}
            </div>

            {/* SUBTOTAL 1: GANANCIA BRUTA */}
            <div className="bg-emerald-100/80 px-4 py-3.5 border-y-2 border-emerald-300 flex justify-between items-center">
              <div>
                <span className="font-black text-emerald-950 uppercase tracking-wider text-xs block">
                  (=) GANANCIA BRUTA
                </span>
                <span className="text-[11px] text-emerald-800 font-medium">
                  Ingresos Ordinarios (-) Costo de Ventas
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono font-black text-base text-emerald-950 block">
                  ${statementData.totalGrossMargin.toLocaleString('es-CL')}
                </span>
                <span className="text-[11px] font-bold text-emerald-800">
                  Margen Bruto: {statementData.grossMarginPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* 3. GASTOS DE ADMINISTRACIÓN Y VENTAS */}
            <div className="p-4 bg-slate-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-black text-slate-800 uppercase tracking-wide text-xs">
                  3. (-) Gastos de Administración y Ventas
                </span>
                <span className="font-mono font-black text-sm text-slate-800">
                  -${statementData.totalOpExpenses.toLocaleString('es-CL')}
                </span>
              </div>
              {statementData.operatingExpenses.length > 0 ? (
                <div className="pl-4 space-y-1">
                  {statementData.operatingExpenses.map(item => (
                    <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                      <span className="font-sans">
                        <strong className="font-mono text-amber-700 mr-2">{item.account.code}</strong>
                        {item.account.name}
                      </span>
                      <span className="font-mono font-bold text-slate-800">${item.total.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 pl-4 text-[11px]">No se registraron gastos de administración ni ventas.</p>
              )}
            </div>

            {/* 4. GASTOS POR DEPRECIACIÓN Y AMORTIZACIÓN */}
            <div className="p-4 bg-slate-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-black text-slate-800 uppercase tracking-wide text-xs">
                  4. (-) Gastos por Depreciación y Amortización
                </span>
                <span className="font-mono font-black text-sm text-slate-800">
                  -${statementData.totalDepreciation.toLocaleString('es-CL')}
                </span>
              </div>
              {statementData.depreciationExpenses.length > 0 ? (
                <div className="pl-4 space-y-1">
                  {statementData.depreciationExpenses.map(item => (
                    <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                      <span className="font-sans">
                        <strong className="font-mono text-amber-800 mr-2">{item.account.code}</strong>
                        {item.account.name}
                      </span>
                      <span className="font-mono font-bold text-slate-800">${item.total.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 pl-4 text-[11px]">No se registraron gastos por depreciación ni amortización.</p>
              )}
            </div>

            {/* 5. OTROS INGRESOS O GASTOS OPERATIVOS */}
            {(statementData.totalOtherOpInc > 0 || statementData.totalOtherOpExp > 0 || showZeroBalances) && (
              <div className="p-4 bg-slate-50/30 space-y-3">
                <span className="font-bold text-slate-700 uppercase tracking-wide text-[11px] block">
                  5. (+/-) Otros Ingresos o Gastos Operativos
                </span>

                {statementData.otherOperatingIncome.length > 0 && (
                  <div className="pl-4 space-y-1 border-l-2 border-emerald-300">
                    <span className="text-[11px] font-bold text-emerald-800">(+) Otros Ingresos Operativos:</span>
                    {statementData.otherOperatingIncome.map(item => (
                      <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                        <span><strong className="font-mono text-emerald-700 mr-2">{item.account.code}</strong>{item.account.name}</span>
                        <span className="font-mono font-bold text-emerald-800">${item.total.toLocaleString('es-CL')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {statementData.otherOperatingExpenses.length > 0 && (
                  <div className="pl-4 space-y-1 border-l-2 border-rose-300">
                    <span className="text-[11px] font-bold text-rose-800">(-) Otros Gastos Operativos:</span>
                    {statementData.otherOperatingExpenses.map(item => (
                      <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                        <span><strong className="font-mono text-rose-700 mr-2">{item.account.code}</strong>{item.account.name}</span>
                        <span className="font-mono font-bold text-rose-800">-${item.total.toLocaleString('es-CL')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUBTOTAL 2: RESULTADO OPERACIONAL */}
            <div className="bg-indigo-100/80 px-4 py-3.5 border-y-2 border-indigo-300 flex justify-between items-center">
              <div>
                <span className="font-black text-indigo-950 uppercase tracking-wider text-xs block">
                  (=) RESULTADO OPERACIONAL
                </span>
                <span className="text-[11px] text-indigo-800 font-medium">
                  Ganancia Bruta (-) Gastos Adm./Ventas (-) Depreciación (+/-) Otros Operativos
                </span>
              </div>
              <div className="text-right">
                <span className={`font-mono font-black text-base block ${statementData.totalOperatingResult >= 0 ? 'text-indigo-950' : 'text-rose-900'}`}>
                  ${statementData.totalOperatingResult.toLocaleString('es-CL')}
                </span>
                <span className="text-[11px] font-bold text-indigo-800">
                  Margen Operacional: {statementData.operatingMarginPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* 6. GASTOS Y RESULTADO FINANCIERO */}
            <div className="p-4 bg-slate-50/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-black text-slate-800 uppercase tracking-wide text-xs">
                  6. (-) Gastos y Resultado Financiero
                </span>
                <span className={`font-mono font-bold text-xs ${statementData.totalFinancialResult >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  Neto Financiero: ${statementData.totalFinancialResult.toLocaleString('es-CL')}
                </span>
              </div>

              {statementData.financialIncome.length > 0 && (
                <div className="pl-4 space-y-1 border-l-2 border-emerald-400">
                  <span className="text-[11px] font-bold text-emerald-800">(+) Ingresos Financieros y Diferencias de Cambio:</span>
                  {statementData.financialIncome.map(item => (
                    <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                      <span><strong className="font-mono text-emerald-700 mr-2">{item.account.code}</strong>{item.account.name}</span>
                      <span className="font-mono font-bold text-emerald-800">${item.total.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              )}

              {statementData.financialCosts.length > 0 && (
                <div className="pl-4 space-y-1 border-l-2 border-rose-400">
                  <span className="text-[11px] font-bold text-rose-800">(-) Gastos Financieros:</span>
                  {statementData.financialCosts.map(item => (
                    <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                      <span><strong className="font-mono text-rose-700 mr-2">{item.account.code}</strong>{item.account.name}</span>
                      <span className="font-mono font-bold text-rose-800">-${item.total.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SUBTOTAL 3: GANANCIA ANTES DE IMPUESTOS */}
            <div className="bg-sky-100/80 px-4 py-3.5 border-y-2 border-sky-300 flex justify-between items-center">
              <div>
                <span className="font-black text-sky-950 uppercase tracking-wider text-xs block">
                  (=) GANANCIA ANTES DE IMPUESTOS
                </span>
                <span className="text-[11px] text-sky-800 font-medium">
                  Resultado Operacional (+/-) Resultado Financiero
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono font-black text-base text-sky-950 block">
                  ${statementData.totalProfitBeforeTax.toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            {/* 7. GASTO POR IMPUESTO A LAS GANANCIAS */}
            <div className="p-4 bg-slate-50/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-black text-slate-800 uppercase tracking-wide text-xs">
                  7. (-) Gasto por Impuesto a las Ganancias
                </span>
                <span className="font-mono font-black text-sm text-slate-800">
                  -${statementData.totalIncomeTax.toLocaleString('es-CL')}
                </span>
              </div>
              {statementData.incomeTax.length > 0 ? (
                <div className="pl-4 space-y-1">
                  {statementData.incomeTax.map(item => (
                    <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                      <span><strong className="font-mono text-purple-700 mr-2">{item.account.code}</strong>{item.account.name}</span>
                      <span className="font-mono font-bold text-purple-900">${item.total.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 pl-4 text-[11px]">No se registraron provisiones de impuesto a las ganancias en este ejercicio.</p>
              )}
            </div>

            {/* SUBTOTAL 4: GANANCIA NETA DEL PERIODO */}
            <div className="bg-indigo-900 text-white p-4 flex justify-between items-center font-black">
              <div>
                <span className="uppercase tracking-widest text-xs block">
                  (=) GANANCIA NETA DEL PERIODO
                </span>
                <span className="text-[11px] font-normal opacity-80">
                  Ganancia Antes de Impuestos (-) Gasto por Impuesto a las Ganancias
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono text-lg block">
                  ${statementData.totalNetIncome.toLocaleString('es-CL')}
                </span>
                <span className="text-[11px] font-bold opacity-90">
                  Margen Neto: {statementData.netMarginPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* 8. OTRO RESULTADO INTEGRAL (ORI) */}
            {(statementData.totalORI !== 0 || showZeroBalances) && (
              <div className="p-4 bg-purple-50/40 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-black text-purple-950 uppercase tracking-wide text-xs">
                    8. (+) Otro Resultado Integral (ORI) (Revalorizaciones, Conversión de Moneda)
                  </span>
                  <span className="font-mono font-black text-sm text-purple-900">
                    ${statementData.totalORI.toLocaleString('es-CL')}
                  </span>
                </div>
                {statementData.otherComprehensiveIncome.length > 0 && (
                  <div className="pl-4 space-y-1">
                    {statementData.otherComprehensiveIncome.map(item => (
                      <div key={item.account.id} className="flex justify-between items-center py-1 hover:bg-slate-100/70 px-2 rounded text-slate-700">
                        <span><strong className="font-mono text-purple-700 mr-2">{item.account.code}</strong>{item.account.name}</span>
                        <span className="font-mono font-bold text-purple-900">${item.total.toLocaleString('es-CL')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* RESULTADO INTEGRAL TOTAL */}
            <div className={`p-4 flex justify-between items-center text-white font-black ${statementData.isProfit ? 'bg-slate-950' : 'bg-rose-950'}`}>
              <div>
                <span className="uppercase tracking-widest text-xs block">
                  (=) {statementData.isProfit ? 'RESULTADO INTEGRAL TOTAL' : 'PÉRDIDA INTEGRAL TOTAL'}
                </span>
                <span className="text-[11px] font-normal opacity-80">
                  Estándar Internacional NIC 1 — Estado de Resultado Integral
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono text-xl block">
                  ${statementData.totalComprehensiveIncome.toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: MATRIZ 12 MESES IFRS */}
      {viewFormat === 'mensual' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-bold uppercase text-[11px] tracking-wider">
                <th className="p-2.5 min-w-[260px] border-r border-slate-700">Clasificación / Cuenta</th>
                {monthNames.map(m => (
                  <th key={m} className="p-2 text-right border-r border-slate-700 font-mono min-w-[85px]">{m}</th>
                ))}
                <th className="p-2.5 text-right font-mono min-w-[110px] bg-slate-950">Total {selectedYear}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {/* 1. INGRESOS OPERACIONALES */}
              <tr className="bg-emerald-50/70 text-emerald-950 font-black">
                <td className="p-2.5 font-sans uppercase border-r border-slate-200">
                  1. (+) INGRESOS OPERACIONALES
                </td>
                {statementData.monthlyOpRevenues.map((v, i) => (
                  <td key={i} className="p-2 text-right border-r border-slate-200">
                    {v !== 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black bg-emerald-100 text-emerald-900">
                  ${statementData.totalOpRevenues.toLocaleString('es-CL')}
                </td>
              </tr>
              {statementData.operatingRevenues.map(a => (
                <tr key={a.account.id} className="hover:bg-slate-50 text-slate-600">
                  <td className="p-2 pl-6 font-sans border-r border-slate-200 truncate max-w-[260px]">
                    <span className="font-mono font-bold text-indigo-700 mr-2">{a.account.code}</span>
                    {a.account.name}
                  </td>
                  {a.months.map((v, i) => (
                    <td key={i} className="p-2 text-right border-r border-slate-200 text-slate-500">
                      {v !== 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                    </td>
                  ))}
                  <td className="p-2 text-right font-bold text-slate-900 bg-slate-50">
                    ${a.total.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}

              {/* 2. COSTOS DE VENTAS */}
              <tr className="bg-rose-50/70 text-rose-950 font-black">
                <td className="p-2.5 font-sans uppercase border-r border-slate-200">
                  2. (-) COSTOS DE VENTAS
                </td>
                {statementData.monthlyCostOfSales.map((v, i) => (
                  <td key={i} className="p-2 text-right border-r border-slate-200">
                    {v !== 0 ? `-$${v.toLocaleString('es-CL')}` : '-'}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black bg-rose-100 text-rose-900">
                  -${statementData.totalCostOfSales.toLocaleString('es-CL')}
                </td>
              </tr>
              {statementData.costOfSales.map(a => (
                <tr key={a.account.id} className="hover:bg-slate-50 text-slate-600">
                  <td className="p-2 pl-6 font-sans border-r border-slate-200 truncate max-w-[260px]">
                    <span className="font-mono font-bold text-rose-700 mr-2">{a.account.code}</span>
                    {a.account.name}
                  </td>
                  {a.months.map((v, i) => (
                    <td key={i} className="p-2 text-right border-r border-slate-200 text-slate-500">
                      {v !== 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                    </td>
                  ))}
                  <td className="p-2 text-right font-bold text-slate-900 bg-slate-50">
                    ${a.total.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}

              {/* (=) MARGEN BRUTO */}
              <tr className="bg-emerald-100 text-emerald-950 font-black border-y-2 border-emerald-300">
                <td className="p-2.5 font-sans uppercase border-r border-emerald-200">
                  (=) MARGEN BRUTO
                </td>
                {statementData.monthlyGrossMargin.map((v, i) => (
                  <td key={i} className="p-2 text-right border-r border-emerald-200">
                    ${v.toLocaleString('es-CL')}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black bg-emerald-200 text-emerald-950">
                  ${statementData.totalGrossMargin.toLocaleString('es-CL')}
                </td>
              </tr>

              {/* 3. GASTOS DE ADMINISTRACIÓN Y VENTAS */}
              <tr className="bg-amber-50/70 text-amber-950 font-black">
                <td className="p-2.5 font-sans uppercase border-r border-slate-200">
                  3. (-) GASTOS DE ADM. Y VENTAS
                </td>
                {statementData.monthlyOpExpenses.map((v, i) => (
                  <td key={i} className="p-2 text-right border-r border-slate-200">
                    {v !== 0 ? `-$${v.toLocaleString('es-CL')}` : '-'}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black bg-amber-100 text-amber-900">
                  -${statementData.totalOpExpenses.toLocaleString('es-CL')}
                </td>
              </tr>
              {statementData.operatingExpenses.map(a => (
                <tr key={a.account.id} className="hover:bg-slate-50 text-slate-600">
                  <td className="p-2 pl-6 font-sans border-r border-slate-200 truncate max-w-[260px]">
                    <span className="font-mono font-bold text-amber-700 mr-2">{a.account.code}</span>
                    {a.account.name}
                  </td>
                  {a.months.map((v, i) => (
                    <td key={i} className="p-2 text-right border-r border-slate-200 text-slate-500">
                      {v !== 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                    </td>
                  ))}
                  <td className="p-2 text-right font-bold text-slate-900 bg-slate-50">
                    ${a.total.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}

              {/* (=) RESULTADO OPERACIONAL (EBIT) */}
              <tr className="bg-indigo-100 text-indigo-950 font-black border-y-2 border-indigo-300">
                <td className="p-2.5 font-sans uppercase border-r border-indigo-300">
                  (=) RESULTADO OPERACIONAL (EBIT)
                </td>
                {statementData.monthlyOperatingResult.map((v, i) => (
                  <td key={i} className={`p-2 text-right border-r border-indigo-300 ${v >= 0 ? 'text-indigo-950' : 'text-rose-800'}`}>
                    ${v.toLocaleString('es-CL')}
                  </td>
                ))}
                <td className={`p-2.5 text-right font-black bg-indigo-200 ${statementData.totalOperatingResult >= 0 ? 'text-indigo-950' : 'text-rose-950'}`}>
                  ${statementData.totalOperatingResult.toLocaleString('es-CL')}
                </td>
              </tr>

              {/* COSTOS FINANCIEROS E IMPUESTOS */}
              <tr className="bg-slate-50 text-slate-700 font-bold">
                <td className="p-2 font-sans border-r border-slate-200 pl-4">
                  (+) Resultado Financiero Neto
                </td>
                {statementData.monthlyFinInc.map((v, i) => {
                  const netFin = v - statementData.monthlyFinCosts[i];
                  return (
                    <td key={i} className="p-2 text-right border-r border-slate-200 font-mono">
                      ${netFin.toLocaleString('es-CL')}
                    </td>
                  );
                })}
                <td className="p-2 text-right font-bold text-slate-900">
                  ${statementData.totalFinancialResult.toLocaleString('es-CL')}
                </td>
              </tr>

              <tr className="bg-slate-50 text-slate-700 font-bold">
                <td className="p-2 font-sans border-r border-slate-200 pl-4">
                  (-) Impuesto a la Renta
                </td>
                {statementData.monthlyIncomeTax.map((v, i) => (
                  <td key={i} className="p-2 text-right border-r border-slate-200 font-mono text-purple-800">
                    {v > 0 ? `-$${v.toLocaleString('es-CL')}` : '-'}
                  </td>
                ))}
                <td className="p-2 text-right font-bold text-purple-900">
                  -${statementData.totalIncomeTax.toLocaleString('es-CL')}
                </td>
              </tr>

              {/* (=) RESULTADO NETO FINAL */}
              <tr className={`font-black text-sm text-white ${statementData.isProfit ? 'bg-slate-900' : 'bg-rose-950'}`}>
                <td className="p-3 font-sans uppercase border-r border-slate-700 tracking-wider">
                  (=) {statementData.isProfit ? 'GANANCIA NETA DEL EJERCICIO' : 'PÉRDIDA NETA DEL EJERCICIO'}
                </td>
                {statementData.monthlyNetIncome.map((v, i) => (
                  <td key={i} className="p-2 text-right border-r border-slate-700 font-mono">
                    ${v.toLocaleString('es-CL')}
                  </td>
                ))}
                <td className="p-3 text-right font-mono text-base font-black bg-black/40">
                  ${statementData.totalNetIncome.toLocaleString('es-CL')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
