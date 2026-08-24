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
  const [viewFormat, setViewFormat] = useState<'mensual' | 'resumen'>('mensual');

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

  // Compute 12-Month Matrix for Income Statement
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
          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: l.accountCode || 'S/C',
            name: l.accountName || 'Cuenta no clasificada',
            type: 'Gasto',
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

    const salesIncomes: MonthlyAccountItem[] = [];
    const directCosts: MonthlyAccountItem[] = [];
    const operatingExpenses: MonthlyAccountItem[] = [];
    const nonOperatingIncomes: MonthlyAccountItem[] = [];
    const nonOperatingExpenses: MonthlyAccountItem[] = [];

    accMatrix.forEach(({ account, monthlyDebit, monthlyCredit }) => {
      const normType = (account.type || '').toLowerCase();
      const code = account.code || '';
      const name = (account.name || '').toLowerCase();

      // Income accounts (Net balance = Credit - Debit)
      if (normType.includes('ingreso') || normType.includes('ganancia') || code.startsWith('4')) {
        const months = monthlyCredit.map((c, i) => c - monthlyDebit[i]);
        const total = months.reduce((s, v) => s + v, 0);

        if (!showZeroBalances && total === 0) return;

        const isNonOp = name.includes('no operacional') || name.includes('fuera de explotacion') || name.includes('financiero');
        if (isNonOp) {
          nonOperatingIncomes.push({ account, months, total });
        } else {
          salesIncomes.push({ account, months, total });
        }
      }
      // Expense / Cost accounts (Net balance = Debit - Credit)
      else if (normType.includes('gasto') || normType.includes('costo') || normType.includes('perdida') || code.startsWith('5')) {
        const months = monthlyDebit.map((d, i) => d - monthlyCredit[i]);
        const total = months.reduce((s, v) => s + v, 0);

        if (!showZeroBalances && total === 0) return;

        // Robusta clasificación de Costo de Ventas
        const isCost = 
          name.includes('costo de venta') || name.includes('costo directo') || name.includes('costo explotacion') ||
          code.startsWith('5.1') || code.startsWith('5-1') || code.startsWith('51') || code.startsWith('4-2');

        const isNonOp = name.includes('no operacional') || name.includes('fuera de explotacion') || name.includes('financiero') || name.includes('interes');

        if (isCost) {
          directCosts.push({ account, months, total });
        } else if (isNonOp) {
          nonOperatingExpenses.push({ account, months, total });
        } else {
          operatingExpenses.push({ account, months, total });
        }
      }
    });

    // Compute monthly sum vectors
    const sumMonths = (list: MonthlyAccountItem[]) => {
      const res = new Array(12).fill(0);
      list.forEach(item => {
        item.months.forEach((v, i) => { res[i] += v; });
      });
      return res;
    };

    const monthlySales = sumMonths(salesIncomes);
    const monthlyCosts = sumMonths(directCosts);
    const monthlyGrossMargin = monthlySales.map((s, i) => s - monthlyCosts[i]);
    const monthlyOperatingExpenses = sumMonths(operatingExpenses);
    const monthlyOperatingResult = monthlyGrossMargin.map((g, i) => g - monthlyOperatingExpenses[i]);
    const monthlyNonOpIncome = sumMonths(nonOperatingIncomes);
    const monthlyNonOpExpense = sumMonths(nonOperatingExpenses);
    const monthlyNetIncome = monthlyOperatingResult.map((o, i) => o + monthlyNonOpIncome[i] - monthlyNonOpExpense[i]);

    const totalSales = monthlySales.reduce((s, v) => s + v, 0);
    const totalCosts = monthlyCosts.reduce((s, v) => s + v, 0);
    const totalGrossMargin = totalSales - totalCosts;
    const grossMarginPercent = totalSales > 0 ? (totalGrossMargin / totalSales) * 100 : 0;

    const totalOperatingExpenses = monthlyOperatingExpenses.reduce((s, v) => s + v, 0);
    const totalOperatingResult = totalGrossMargin - totalOperatingExpenses;
    const operatingMarginPercent = totalSales > 0 ? (totalOperatingResult / totalSales) * 100 : 0;

    const totalNonOpIncome = monthlyNonOpIncome.reduce((s, v) => s + v, 0);
    const totalNonOpExpense = monthlyNonOpExpense.reduce((s, v) => s + v, 0);
    const totalNetIncome = totalOperatingResult + totalNonOpIncome - totalNonOpExpense;
    const netMarginPercent = totalSales > 0 ? (totalNetIncome / totalSales) * 100 : 0;

    return {
      salesIncomes,
      directCosts,
      operatingExpenses,
      nonOperatingIncomes,
      nonOperatingExpenses,
      monthlySales,
      monthlyCosts,
      monthlyGrossMargin,
      monthlyOperatingExpenses,
      monthlyOperatingResult,
      monthlyNonOpIncome,
      monthlyNonOpExpense,
      monthlyNetIncome,
      totalSales,
      totalCosts,
      totalGrossMargin,
      grossMarginPercent,
      totalOperatingExpenses,
      totalOperatingResult,
      operatingMarginPercent,
      totalNonOpIncome,
      totalNonOpExpense,
      totalNetIncome,
      netMarginPercent,
      isProfit: totalNetIncome >= 0
    };
  }, [accounts, vouchers, accountMap, selectedYear, showZeroBalances]);

  // Export CSV 12-Month Matrix
  const handleExportCSV = () => {
    const headers = ['CONCEPTO', 'CÓDIGO', 'CUENTA', ...monthNames, 'TOTAL AÑO'];
    const rows = [
      ['ESTADO DE RESULTADOS MENSUALIZADO (12 MESES)', `"${company.name}"`, `RUT: ${company.rut}`, `Año: ${selectedYear}`],
      [''],
      headers,
      ['1. INGRESOS DE EXPLOTACIÓN (VENTAS)', '', '', ...statementData.monthlySales.map(v => v.toString()), statementData.totalSales.toString()],
      ...statementData.salesIncomes.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['2. COSTOS DE EXPLOTACIÓN', '', '', ...statementData.monthlyCosts.map(v => v.toString()), statementData.totalCosts.toString()],
      ...statementData.directCosts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) MARGEN BRUTO', '', '', ...statementData.monthlyGrossMargin.map(v => v.toString()), statementData.totalGrossMargin.toString()],
      ['3. GASTOS DE ADMINISTRACIÓN Y VENTAS', '', '', ...statementData.monthlyOperatingExpenses.map(v => v.toString()), statementData.totalOperatingExpenses.toString()],
      ...statementData.operatingExpenses.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) RESULTADO OPERACIONAL (EBIT)', '', '', ...statementData.monthlyOperatingResult.map(v => v.toString()), statementData.totalOperatingResult.toString()],
      ['4. INGRESOS NO OPERACIONALES', '', '', ...statementData.monthlyNonOpIncome.map(v => v.toString()), statementData.totalNonOpIncome.toString()],
      ...statementData.nonOperatingIncomes.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['5. EGRESOS NO OPERACIONALES', '', '', ...statementData.monthlyNonOpExpense.map(v => v.toString()), statementData.totalNonOpExpense.toString()],
      ...statementData.nonOperatingExpenses.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) RESULTADO NETO DEL EJERCICIO', '', '', ...statementData.monthlyNetIncome.map(v => v.toString()), statementData.totalNetIncome.toString()]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Estado_Resultados_12Meses_${company.rut}_${selectedYear}.csv`);
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
            <span className="text-xl">📈</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Estado de Resultados (12 Meses & Acumulado)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Estructura cronológica mensual (Ene - Dic) con cálculo preciso de Costo de Ventas y Márgenes Reales ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>📥</span>
            <span>Exportar CSV 12 Meses</span>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Ingresos Totales (Ventas)</span>
          <p className="text-lg font-black text-slate-900 font-mono mt-0.5">${statementData.totalSales.toLocaleString('es-CL')}</p>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Margen Bruto Real</span>
          <p className="text-lg font-black text-indigo-900 font-mono mt-0.5">${statementData.totalGrossMargin.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-slate-500 font-semibold">{statementData.grossMarginPercent.toFixed(1)}% margen bruto</span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Gastos Operacionales</span>
          <p className="text-lg font-black text-slate-900 font-mono mt-0.5">${statementData.totalOperatingExpenses.toLocaleString('es-CL')}</p>
        </div>

        <div className={`p-3 rounded-lg border shadow-2xs ${statementData.isProfit ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {statementData.isProfit ? 'UTILIDAD NETA ANUAL' : 'PÉRDIDA NETA ANUAL'}
          </span>
          <p className="text-lg font-black font-mono mt-0.5">${Math.abs(statementData.totalNetIncome).toLocaleString('es-CL')}</p>
          <span className="text-[10px] font-semibold opacity-90">{statementData.netMarginPercent.toFixed(1)}% margen neto</span>
        </div>
      </div>

      {/* 12-Month Detailed Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white font-bold uppercase text-[11px] tracking-wider">
              <th className="p-2.5 min-w-[240px] border-r border-slate-700">Concepto / Cuentas</th>
              {monthNames.map(m => (
                <th key={m} className="p-2 text-right border-r border-slate-700 font-mono min-w-[85px]">{m}</th>
              ))}
              <th className="p-2.5 text-right font-mono min-w-[110px] bg-slate-950">Total {selectedYear}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono">
            {/* 1. INGRESOS DE EXPLOTACIÓN */}
            <tr className="bg-emerald-50/70 text-emerald-950 font-black">
              <td className="p-2.5 font-sans uppercase border-r border-slate-200">
                1. (+) INGRESOS DE EXPLOTACIÓN (VENTAS)
              </td>
              {statementData.monthlySales.map((v, i) => (
                <td key={i} className="p-2 text-right border-r border-slate-200">
                  {v !== 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                </td>
              ))}
              <td className="p-2.5 text-right font-black bg-emerald-100 text-emerald-900">
                ${statementData.totalSales.toLocaleString('es-CL')}
              </td>
            </tr>
            {statementData.salesIncomes.map(a => (
              <tr key={a.account.id} className="hover:bg-slate-50 text-slate-600">
                <td className="p-2 pl-6 font-sans border-r border-slate-200 truncate max-w-[260px]">
                  <span className="font-mono font-bold text-slate-800 mr-2">{a.account.code}</span>
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

            {/* 2. COSTOS DE EXPLOTACIÓN */}
            <tr className="bg-rose-50/70 text-rose-950 font-black">
              <td className="p-2.5 font-sans uppercase border-r border-slate-200">
                2. (-) COSTOS DE EXPLOTACIÓN / VENTAS
              </td>
              {statementData.monthlyCosts.map((v, i) => (
                <td key={i} className="p-2 text-right border-r border-slate-200">
                  {v !== 0 ? `-$${v.toLocaleString('es-CL')}` : '-'}
                </td>
              ))}
              <td className="p-2.5 text-right font-black bg-rose-100 text-rose-900">
                -${statementData.totalCosts.toLocaleString('es-CL')}
              </td>
            </tr>
            {statementData.directCosts.map(a => (
              <tr key={a.account.id} className="hover:bg-slate-50 text-slate-600">
                <td className="p-2 pl-6 font-sans border-r border-slate-200 truncate max-w-[260px]">
                  <span className="font-mono font-bold text-slate-800 mr-2">{a.account.code}</span>
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
            <tr className="bg-indigo-50 text-indigo-950 font-black border-y-2 border-indigo-200">
              <td className="p-2.5 font-sans uppercase border-r border-indigo-200">
                (=) MARGEN BRUTO DE EXPLOTACIÓN
              </td>
              {statementData.monthlyGrossMargin.map((v, i) => (
                <td key={i} className="p-2 text-right border-r border-indigo-200">
                  ${v.toLocaleString('es-CL')}
                </td>
              ))}
              <td className="p-2.5 text-right font-black bg-indigo-100 text-indigo-950">
                ${statementData.totalGrossMargin.toLocaleString('es-CL')}
              </td>
            </tr>

            {/* 3. GASTOS DE ADMINISTRACIÓN Y VENTAS */}
            <tr className="bg-amber-50/70 text-amber-950 font-black">
              <td className="p-2.5 font-sans uppercase border-r border-slate-200">
                3. (-) GASTOS DE ADMINISTRACIÓN Y VENTAS
              </td>
              {statementData.monthlyOperatingExpenses.map((v, i) => (
                <td key={i} className="p-2 text-right border-r border-slate-200">
                  {v !== 0 ? `-$${v.toLocaleString('es-CL')}` : '-'}
                </td>
              ))}
              <td className="p-2.5 text-right font-black bg-amber-100 text-amber-900">
                -${statementData.totalOperatingExpenses.toLocaleString('es-CL')}
              </td>
            </tr>
            {statementData.operatingExpenses.map(a => (
              <tr key={a.account.id} className="hover:bg-slate-50 text-slate-600">
                <td className="p-2 pl-6 font-sans border-r border-slate-200 truncate max-w-[260px]">
                  <span className="font-mono font-bold text-slate-800 mr-2">{a.account.code}</span>
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

            {/* (=) RESULTADO OPERACIONAL */}
            <tr className="bg-slate-100 text-slate-900 font-black border-y border-slate-300">
              <td className="p-2.5 font-sans uppercase border-r border-slate-300">
                (=) RESULTADO OPERACIONAL (EBIT)
              </td>
              {statementData.monthlyOperatingResult.map((v, i) => (
                <td key={i} className={`p-2 text-right border-r border-slate-300 ${v >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ${v.toLocaleString('es-CL')}
                </td>
              ))}
              <td className={`p-2.5 text-right font-black bg-slate-200 ${statementData.totalOperatingResult >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                ${statementData.totalOperatingResult.toLocaleString('es-CL')}
              </td>
            </tr>

            {/* 4. INGRESOS Y EGRESOS NO OPERACIONALES */}
            {(statementData.totalNonOpIncome > 0 || statementData.totalNonOpExpense > 0) && (
              <>
                <tr className="bg-slate-50 text-slate-700 font-semibold">
                  <td className="p-2 font-sans border-r border-slate-200 pl-4">
                    4. (+) Ingresos No Operacionales
                  </td>
                  {statementData.monthlyNonOpIncome.map((v, i) => (
                    <td key={i} className="p-2 text-right border-r border-slate-200 text-emerald-700 font-mono">
                      {v > 0 ? `$${v.toLocaleString('es-CL')}` : '-'}
                    </td>
                  ))}
                  <td className="p-2 text-right font-bold text-emerald-800">
                    ${statementData.totalNonOpIncome.toLocaleString('es-CL')}
                  </td>
                </tr>
                <tr className="bg-slate-50 text-slate-700 font-semibold">
                  <td className="p-2 font-sans border-r border-slate-200 pl-4">
                    5. (-) Egresos No Operacionales
                  </td>
                  {statementData.monthlyNonOpExpense.map((v, i) => (
                    <td key={i} className="p-2 text-right border-r border-slate-200 text-rose-700 font-mono">
                      {v > 0 ? `-$${v.toLocaleString('es-CL')}` : '-'}
                    </td>
                  ))}
                  <td className="p-2 text-right font-bold text-rose-800">
                    -${statementData.totalNonOpExpense.toLocaleString('es-CL')}
                  </td>
                </tr>
              </>
            )}

            {/* (=) RESULTADO NETO FINAL */}
            <tr className={`font-black text-sm text-white ${statementData.isProfit ? 'bg-emerald-900' : 'bg-rose-900'}`}>
              <td className="p-3 font-sans uppercase border-r border-slate-700 tracking-wider">
                (=) {statementData.isProfit ? 'UTILIDAD NETA DEL EJERCICIO' : 'PÉRDIDA NETA DEL EJERCICIO'}
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
    </div>
  );
}
