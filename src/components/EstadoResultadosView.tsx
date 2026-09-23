import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Download, 
  Printer, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  EyeOff, 
  Layers, 
  FolderTree, 
  Calendar,
  Sparkles,
  Percent,
  Calculator,
  ShieldCheck
} from 'lucide-react';

interface EstadoResultadosViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  onOpenAuditor?: () => void;
}

interface MonthlyAccountItem {
  account: ChartOfAccount;
  months: number[]; // 12 balances mensuales
  total: number;
}

interface IFRSParentRubro {
  id: string;
  code: string;
  name: string;
  monthlyTotals: number[];
  total: number;
  accounts: MonthlyAccountItem[];
}

export default function EstadoResultadosView({
  company,
  vouchers,
  accounts,
  fiscalYears,
  onOpenAuditor
}: EstadoResultadosViewProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showZeroBalances, setShowZeroBalances] = useState<boolean>(false);
  const [showAccountDetails, setShowAccountDetails] = useState<boolean>(true);
  const [viewFormat, setViewFormat] = useState<'ifrs_cascada' | 'mensual_matriz'>('ifrs_cascada');

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

  // Compute 12-Month Matrix grouped by IFRS Parent Rubros
  const statementData = useMemo(() => {
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
          const accCodeStr = (l.accountCode || '9999999').trim();
          const prefix = accCodeStr.charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Gasto';
          if (prefix === '1') inferredType = 'Activo';
          else if (prefix === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3')) ? 'Patrimonio' : 'Pasivo';
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

    // 1. Rubros Padre IFRS para Ingresos (Código 5 ó 3)
    const rubroIngresosOperacionales: IFRSParentRubro = { id: '5101', code: '5101000', name: '1. Ingresos de Actividades Ordinarias / Explotación (51xxxxx / 31xxxxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroOtrosIngresosOp: IFRSParentRubro = { id: '5201', code: '5201000', name: 'Otros Ingresos Fuera de la Explotación (52xxxxx / 32xxxxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroIngresosFinancieros: IFRSParentRubro = { id: '5301', code: '5301000', name: 'Ingresos Financieros y Reajustes (53xxxxx / 33xxxxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };

    // 2. Rubros Padre IFRS para Costos y Gastos (Código 4)
    const rubroCostosVentas: IFRSParentRubro = { id: '4101', code: '4101000', name: '2. Costos de Ventas / Costo de Explotación Directo (41xxxxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroGastosRemuneraciones: IFRSParentRubro = { id: '4201', code: '4201000', name: 'Gastos de Personal y Remuneraciones (4201xxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroGastosAdministracion: IFRSParentRubro = { id: '4202', code: '4202000', name: 'Gastos Generales y de Administración (4202xxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroDepreciacionAmort: IFRSParentRubro = { id: '4203', code: '4203000', name: 'Depreciación y Amortización (4203xxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroCostosFinancieros: IFRSParentRubro = { id: '4301', code: '4301000', name: 'Costos Financieros e Intereses (43xxxxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroOtrosGastosNoOp: IFRSParentRubro = { id: '4401', code: '4401000', name: 'Otros Gastos Fuera de la Explotación (44xxxxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };
    const rubroImpuestoRenta: IFRSParentRubro = { id: '4501', code: '4501000', name: 'Gasto por Impuesto a las Ganancias (45xxxxx)', monthlyTotals: new Array(12).fill(0), total: 0, accounts: [] };

    accMatrix.forEach(({ account, monthlyDebit, monthlyCredit }) => {
      const code = (account.code || '').trim();
      const codePrefix = code.charAt(0);
      const normType = (account.type || '').toLowerCase();
      const blceCol = (account.blce8Columnas || '').toUpperCase();
      const name = (account.name || '').toLowerCase();

      const isIncome = 
        blceCol === 'GANANCIA' ||
        codePrefix === '5' || 
        (codePrefix === '3' && (normType.includes('ingreso') || normType.includes('ganancia') || code.startsWith('31') || code.startsWith('32') || code.startsWith('33'))) ||
        (!['1', '2', '4'].includes(codePrefix) && (normType.includes('ingreso') || normType.includes('ganancia') || normType.includes('venta')));
      
      const isExpense = 
        blceCol === 'PERDIDA' ||
        blceCol === 'PÉRDIDA' ||
        codePrefix === '4' || 
        (!['1', '2', '3', '5'].includes(codePrefix) && (normType.includes('gasto') || normType.includes('costo') || normType.includes('perdida') || normType.includes('pérdida') || normType.includes('impuesto')));

      if (!isIncome && !isExpense) return;

      if (isIncome) {
        // Ingresos: Saldo = Crédito - Débito
        const months = monthlyCredit.map((c, i) => c - monthlyDebit[i]);
        const total = months.reduce((s, v) => s + v, 0);

        if (!showZeroBalances && total === 0) return;

        const item: MonthlyAccountItem = { account, months, total };

        if (code.startsWith('53') || code.startsWith('5.3') || code.startsWith('33') || code.startsWith('3.3') || name.includes('financiero') || name.includes('interes') || name.includes('diferencia de cambio')) {
          rubroIngresosFinancieros.accounts.push(item);
          rubroIngresosFinancieros.total += total;
          months.forEach((v, idx) => { rubroIngresosFinancieros.monthlyTotals[idx] += v; });
        } else if (code.startsWith('52') || code.startsWith('5.2') || code.startsWith('32') || code.startsWith('3.2') || name.includes('fuera de la explotacion') || name.includes('fuera de explotacion') || name.includes('no operacional') || name.includes('otro ingreso') || name.includes('otra ganancia')) {
          rubroOtrosIngresosOp.accounts.push(item);
          rubroOtrosIngresosOp.total += total;
          months.forEach((v, idx) => { rubroOtrosIngresosOp.monthlyTotals[idx] += v; });
        } else {
          // 51xxxxx o 31xxxxx -> Ingresos de la Explotación / Actividades Ordinarias
          rubroIngresosOperacionales.accounts.push(item);
          rubroIngresosOperacionales.total += total;
          months.forEach((v, idx) => { rubroIngresosOperacionales.monthlyTotals[idx] += v; });
        }
      } else if (isExpense) {
        // Gastos/Costos: Saldo = Débito - Crédito
        const months = monthlyDebit.map((d, i) => d - monthlyCredit[i]);
        const total = months.reduce((s, v) => s + v, 0);

        if (!showZeroBalances && total === 0) return;

        const item: MonthlyAccountItem = { account, months, total };

        if (code.startsWith('45') || code.startsWith('4.5') || name.includes('impuesto a la renta') || name.includes('impuesto 1da') || name.includes('impuesto primera')) {
          rubroImpuestoRenta.accounts.push(item);
          rubroImpuestoRenta.total += total;
          months.forEach((v, idx) => { rubroImpuestoRenta.monthlyTotals[idx] += v; });
        } else if (code.startsWith('43') || code.startsWith('4.3') || name.includes('gasto bancario') || name.includes('interes pagado') || (name.includes('financiero') && !name.includes('ingreso'))) {
          rubroCostosFinancieros.accounts.push(item);
          rubroCostosFinancieros.total += total;
          months.forEach((v, idx) => { rubroCostosFinancieros.monthlyTotals[idx] += v; });
        } else if (code.startsWith('44') || code.startsWith('4.4') || name.includes('fuera de explotacion') || name.includes('otro gasto') || name.includes('otra perdida') || name.includes('multa')) {
          rubroOtrosGastosNoOp.accounts.push(item);
          rubroOtrosGastosNoOp.total += total;
          months.forEach((v, idx) => { rubroOtrosGastosNoOp.monthlyTotals[idx] += v; });
        } else if (code.startsWith('41') || code.startsWith('4.1') || name.includes('costo de venta') || name.includes('costo directo') || name.includes('costo explotacion') || name.includes('mercaderia vendida')) {
          rubroCostosVentas.accounts.push(item);
          rubroCostosVentas.total += total;
          months.forEach((v, idx) => { rubroCostosVentas.monthlyTotals[idx] += v; });
        } else if (code.startsWith('4203') || code.startsWith('4.2.03') || name.includes('depreciaci') || name.includes('amortizaci')) {
          rubroDepreciacionAmort.accounts.push(item);
          rubroDepreciacionAmort.total += total;
          months.forEach((v, idx) => { rubroDepreciacionAmort.monthlyTotals[idx] += v; });
        } else if (code.startsWith('4201') || code.startsWith('4.2.01') || name.includes('sueldo') || name.includes('remuneraci') || name.includes('previred') || name.includes('imposicion')) {
          rubroGastosRemuneraciones.accounts.push(item);
          rubroGastosRemuneraciones.total += total;
          months.forEach((v, idx) => { rubroGastosRemuneraciones.monthlyTotals[idx] += v; });
        } else {
          rubroGastosAdministracion.accounts.push(item);
          rubroGastosAdministracion.total += total;
          months.forEach((v, idx) => { rubroGastosAdministracion.monthlyTotals[idx] += v; });
        }
      }
    });

    // 3. Cálculos de Margen Operacional y Cascada IFRS
    const monthlyOpRevenues = rubroIngresosOperacionales.monthlyTotals;
    const monthlyCostOfSales = rubroCostosVentas.monthlyTotals;
    
    // MARGEN OPERACIONAL (Ganancia Bruta) = Ingresos Operacionales - Costos de Ventas
    const monthlyGrossMargin = monthlyOpRevenues.map((r, i) => r - monthlyCostOfSales[i]);

    // Gastos de Administración y Ventas
    const monthlyOpExpenses = new Array(12).fill(0).map((_, i) => 
      rubroGastosRemuneraciones.monthlyTotals[i] + 
      rubroGastosAdministracion.monthlyTotals[i] + 
      rubroDepreciacionAmort.monthlyTotals[i]
    );

    // Resultado Operacional (EBIT)
    const monthlyOperatingResult = monthlyGrossMargin.map((gm, i) => gm - monthlyOpExpenses[i]);

    // Resultados Fuera de Explotación
    const monthlyFinInc = rubroIngresosFinancieros.monthlyTotals;
    const monthlyFinCosts = rubroCostosFinancieros.monthlyTotals;
    const monthlyOtherInc = rubroOtrosIngresosOp.monthlyTotals;
    const monthlyOtherExp = rubroOtrosGastosNoOp.monthlyTotals;

    // Resultado Antes de Impuesto
    const monthlyProfitBeforeTax = monthlyOperatingResult.map((o, i) => o + monthlyFinInc[i] - monthlyFinCosts[i] + monthlyOtherInc[i] - monthlyOtherExp[i]);
    const monthlyIncomeTax = rubroImpuestoRenta.monthlyTotals;

    // Resultado Neto del Ejercicio
    const monthlyNetIncome = monthlyProfitBeforeTax.map((p, i) => p - monthlyIncomeTax[i]);

    // Totales Anuales
    const totalOpRevenues = rubroIngresosOperacionales.total;
    const totalCostOfSales = rubroCostosVentas.total;
    const totalGrossMargin = totalOpRevenues - totalCostOfSales;
    const grossMarginPercent = totalOpRevenues > 0 ? ((totalGrossMargin / totalOpRevenues) * 100).toFixed(1) : '0.0';

    const totalOpExpenses = rubroGastosRemuneraciones.total + rubroGastosAdministracion.total + rubroDepreciacionAmort.total;
    const totalOperatingResult = totalGrossMargin - totalOpExpenses;
    const operatingMarginPercent = totalOpRevenues > 0 ? ((totalOperatingResult / totalOpRevenues) * 100).toFixed(1) : '0.0';

    const totalFinInc = rubroIngresosFinancieros.total;
    const totalFinCosts = rubroCostosFinancieros.total;
    const totalOtherInc = rubroOtrosIngresosOp.total;
    const totalOtherExp = rubroOtrosGastosNoOp.total;

    const totalProfitBeforeTax = totalOperatingResult + totalFinInc - totalFinCosts + totalOtherInc - totalOtherExp;
    const totalIncomeTax = rubroImpuestoRenta.total;
    const totalNetIncome = totalProfitBeforeTax - totalIncomeTax;
    const netMarginPercent = totalOpRevenues > 0 ? ((totalNetIncome / totalOpRevenues) * 100).toFixed(1) : '0.0';

    return {
      rubros: {
        ingresosOperacionales: rubroIngresosOperacionales,
        costosVentas: rubroCostosVentas,
        gastosRemuneraciones: rubroGastosRemuneraciones,
        gastosAdministracion: rubroGastosAdministracion,
        depreciacionAmort: rubroDepreciacionAmort,
        ingresosFinancieros: rubroIngresosFinancieros,
        costosFinancieros: rubroCostosFinancieros,
        otrosIngresosOp: rubroOtrosIngresosOp,
        otrosGastosNoOp: rubroOtrosGastosNoOp,
        impuestoRenta: rubroImpuestoRenta
      },
      monthly: {
        opRevenues: monthlyOpRevenues,
        costOfSales: monthlyCostOfSales,
        grossMargin: monthlyGrossMargin,
        opExpenses: monthlyOpExpenses,
        operatingResult: monthlyOperatingResult,
        finInc: monthlyFinInc,
        finCosts: monthlyFinCosts,
        otherInc: monthlyOtherInc,
        otherExp: monthlyOtherExp,
        profitBeforeTax: monthlyProfitBeforeTax,
        incomeTax: monthlyIncomeTax,
        netIncome: monthlyNetIncome
      },
      totals: {
        opRevenues: totalOpRevenues,
        costOfSales: totalCostOfSales,
        grossMargin: totalGrossMargin,
        grossMarginPercent,
        opExpenses: totalOpExpenses,
        operatingResult: totalOperatingResult,
        operatingMarginPercent,
        finInc: totalFinInc,
        finCosts: totalFinCosts,
        otherInc: totalOtherInc,
        otherExp: totalOtherExp,
        profitBeforeTax: totalProfitBeforeTax,
        incomeTax: totalIncomeTax,
        netIncome: totalNetIncome,
        netMarginPercent,
        isProfit: totalNetIncome >= 0
      }
    };
  }, [accounts, vouchers, accountMap, selectedYear, showZeroBalances]);

  // Export CSV IFRS
  const handleExportCSV = () => {
    const headers = ['CONCEPTO / CLASIFICACIÓN IFRS', 'CÓDIGO', 'CUENTA', ...monthNames, 'TOTAL AÑO'];
    const rows = [
      ['ESTADO DE RESULTADOS POR FUNCIÓN (ESTÁNDAR IFRS / NIIF)', `"${company.name}"`, `RUT: ${company.rut}`, `Año: ${selectedYear}`],
      [''],
      headers,
      ['1. INGRESOS DE ACTIVIDADES ORDINARIAS / EXPLOTACIÓN (51xxxxx)', '5101000', '', ...statementData.monthly.opRevenues.map(v => v.toString()), statementData.totals.opRevenues.toString()],
      ...statementData.rubros.ingresosOperacionales.accounts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['2. COSTO DE VENTAS / COSTO DE EXPLOTACIÓN (41xxxxx)', '4101000', '', ...statementData.monthly.costOfSales.map(v => v.toString()), statementData.totals.costOfSales.toString()],
      ...statementData.rubros.costosVentas.accounts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) MARGEN OPERACIONAL (GANANCIA BRUTA)', '', '', ...statementData.monthly.grossMargin.map(v => v.toString()), statementData.totals.grossMargin.toString()],
      ['3. GASTOS DE ADMINISTRACIÓN Y VENTAS (42xxxxx)', '4200000', '', ...statementData.monthly.opExpenses.map(v => v.toString()), statementData.totals.opExpenses.toString()],
      ...statementData.rubros.gastosRemuneraciones.accounts.map(a => ['  Remuneraciones (4201xxx)', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ...statementData.rubros.gastosAdministracion.accounts.map(a => ['  Administración (4202xxx)', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ...statementData.rubros.depreciacionAmort.accounts.map(a => ['  Depreciación (4203xxx)', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) RESULTADO OPERACIONAL (EBIT)', '', '', ...statementData.monthly.operatingResult.map(v => v.toString()), statementData.totals.operatingResult.toString()],
      ['4. OTROS INGRESOS FUERA DE LA EXPLOTACIÓN (52xxxxx)', '5201000', '', ...statementData.monthly.otherInc.map(v => v.toString()), statementData.totals.otherInc.toString()],
      ...statementData.rubros.otrosIngresosOp.accounts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['5. INGRESOS FINANCIEROS Y REAJUSTES (53xxxxx)', '5301000', '', ...statementData.monthly.finInc.map(v => v.toString()), statementData.totals.finInc.toString()],
      ...statementData.rubros.ingresosFinancieros.accounts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['6. COSTOS FINANCIEROS E INTERESES (43xxxxx)', '4301000', '', ...statementData.monthly.finCosts.map(v => v.toString()), statementData.totals.finCosts.toString()],
      ...statementData.rubros.costosFinancieros.accounts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['7. OTROS GASTOS FUERA DE LA EXPLOTACIÓN (44xxxxx)', '4401000', '', ...statementData.monthly.otherExp.map(v => v.toString()), statementData.totals.otherExp.toString()],
      ...statementData.rubros.otrosGastosNoOp.accounts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) RESULTADO ANTES DE IMPUESTO A LAS GANANCIAS', '', '', ...statementData.monthly.profitBeforeTax.map(v => v.toString()), statementData.totals.profitBeforeTax.toString()],
      ['8. GASTO POR IMPUESTO A LAS GANANCIAS (45xxxxx)', '4501000', '', ...statementData.monthly.incomeTax.map(v => v.toString()), statementData.totals.incomeTax.toString()],
      ...statementData.rubros.impuestoRenta.accounts.map(a => ['', `"${a.account.code}"`, `"${a.account.name}"`, ...a.months.map(v => v.toString()), a.total.toString()]),
      ['(=) RESULTADO NETO DEL EJERCICIO', '', '', ...statementData.monthly.netIncome.map(v => v.toString()), statementData.totals.netIncome.toString()]
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

  const renderRubroLine = (rubro: IFRSParentRubro, isExpense = false) => {
    if (!showZeroBalances && rubro.total === 0 && rubro.accounts.length === 0) return null;

    return (
      <div key={rubro.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white mb-2 shadow-2xs">
        <div className="px-3.5 py-2.5 bg-slate-50/80 flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">
              {rubro.code}
            </span>
            <span className="font-bold text-slate-900">{rubro.name}</span>
            <span className="text-[10px] text-slate-500">
              ({rubro.accounts.length} {rubro.accounts.length === 1 ? 'cuenta' : 'cuentas'})
            </span>
          </div>

          <div className={`font-mono font-black text-xs ${isExpense ? 'text-slate-800' : 'text-slate-900'}`}>
            {isExpense && rubro.total > 0 ? '-' : ''}${rubro.total.toLocaleString('es-CL')}
          </div>
        </div>

        {showAccountDetails && rubro.accounts.length > 0 && (
          <div className="divide-y divide-slate-100 bg-white text-[11px] font-mono">
            {rubro.accounts.map(acc => (
              <div key={acc.account.id} className="px-4 py-1.5 flex justify-between items-center hover:bg-slate-50 pl-8">
                <div className="flex items-center gap-2 truncate max-w-[380px]">
                  <span className="text-slate-500 font-semibold">{acc.account.code}</span>
                  <span className="font-sans text-slate-700 truncate">{acc.account.name}</span>
                </div>
                <div className="font-bold text-slate-800">
                  ${acc.total.toLocaleString('es-CL')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
                Estado de Resultados IFRS / Por Función
              </h3>
              <p className="text-xs text-slate-500">
                Estructura IFRS (NIC 1) con Margen Operacional y Cuentas Padre ({company.name} - RUT: {company.rut})
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Formato */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setViewFormat('ifrs_cascada')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                viewFormat === 'ifrs_cascada' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cascada IFRS
            </button>
            <button
              onClick={() => setViewFormat('mensual_matriz')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                viewFormat === 'mensual_matriz' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matriz 12 Meses
            </button>
          </div>

          {onOpenAuditor && (
            <button
              onClick={onOpenAuditor}
              className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-950 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs border border-indigo-700"
              title="Auditar Estado de Resultados y emitir Dictamen Oficial"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-300" />
              <span>Auditar Estados Financieros</span>
            </button>
          )}
          <button
            onClick={() => setShowAccountDetails(!showAccountDetails)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            {showAccountDetails ? <EyeOff className="w-3.5 h-3.5 text-slate-600" /> : <Eye className="w-3.5 h-3.5 text-slate-600" />}
            <span>{showAccountDetails ? 'Sólo Rubros Padre' : 'Ver Cuentas Hijas'}</span>
          </button>
          
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-700" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Año Comercial:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showZeroBalances}
              onChange={(e) => setShowZeroBalances(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Mostrar rubros sin movimiento ($0)</span>
          </label>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>Régimen: <strong className="text-slate-800">{company.regimenTributario || '14 D N° 3'}</strong></span>
          <span className="text-slate-300">|</span>
          <span>Moneda: <strong className="text-slate-800">CLP ($)</strong></span>
        </div>
      </div>

      {/* KPI Cards de Margen y Resultados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Ingresos Operacionales */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">1. Ventas / Ingresos Operacionales</span>
          <p className="text-xl font-black text-slate-900 mt-1 font-mono">${statementData.totals.opRevenues.toLocaleString('es-CL')}</p>
          <div className="text-[11px] text-slate-500 mt-1 font-sans">
            Base de actividades ordinarias
          </div>
        </div>

        {/* Margen Operacional (Ganancia Bruta) */}
        <div className="bg-gradient-to-br from-indigo-50 to-emerald-50 p-3.5 rounded-xl border border-indigo-200 shadow-2xs">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900">Margen Operacional (Bruto)</span>
            <span className="px-1.5 py-0.5 bg-indigo-200 text-indigo-900 rounded text-[10px] font-bold">{statementData.totals.grossMarginPercent}%</span>
          </div>
          <p className="text-xl font-black text-indigo-950 mt-1 font-mono">${statementData.totals.grossMargin.toLocaleString('es-CL')}</p>
          <div className="text-[11px] text-indigo-800/80 mt-1 font-sans">
            Ingresos Operacionales - Costo de Ventas
          </div>
        </div>

        {/* Resultado Operacional (EBIT) */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Resultado Operacional (EBIT)</span>
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[10px] font-bold">{statementData.totals.operatingMarginPercent}%</span>
          </div>
          <p className="text-xl font-black text-slate-900 mt-1 font-mono">${statementData.totals.operatingResult.toLocaleString('es-CL')}</p>
          <div className="text-[11px] text-slate-500 mt-1 font-sans">
            Margen Bruto - Gastos de Adm. y Ventas
          </div>
        </div>

        {/* Resultado Neto del Ejercicio */}
        <div className={`p-3.5 rounded-xl border shadow-2xs ${
          statementData.totals.isProfit ? 'bg-emerald-50/80 border-emerald-300' : 'bg-rose-50/80 border-rose-300'
        }`}>
          <div className="flex justify-between items-center">
            <span className={`text-[11px] font-black uppercase tracking-wider ${
              statementData.totals.isProfit ? 'text-emerald-900' : 'text-rose-900'
            }`}>
              Resultado Neto del Ejercicio
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              statementData.totals.isProfit ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
            }`}>
              {statementData.totals.netMarginPercent}%
            </span>
          </div>
          <p className={`text-xl font-black mt-1 font-mono ${
            statementData.totals.isProfit ? 'text-emerald-950' : 'text-rose-950'
          }`}>
            ${statementData.totals.netIncome.toLocaleString('es-CL')}
          </p>
          <div className={`text-[11px] mt-1 font-sans font-medium ${
            statementData.totals.isProfit ? 'text-emerald-800' : 'text-rose-800'
          }`}>
            {statementData.totals.isProfit ? '✅ Ganancia Neta del Ejercicio' : '⚠️ Pérdida Neta del Ejercicio'}
          </div>
        </div>
      </div>

      {/* VISTA 1: CASCADA IFRS */}
      {viewFormat === 'ifrs_cascada' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-emerald-400" />
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wide">Estado de Resultados Cascada IFRS ({selectedYear})</h4>
                <p className="text-[11px] text-slate-300">Norma Internacional NIC 1 - Clasificación por Función de Gastos</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Resultado Neto:</span>
              <div className={`font-mono font-black text-base ${statementData.totals.isProfit ? 'text-emerald-300' : 'text-rose-300'}`}>
                ${statementData.totals.netIncome.toLocaleString('es-CL')}
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* BLOQUE 1: INGRESOS OPERACIONALES */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 mb-2">
                <span>1. Ingresos de Actividades Ordinarias / Explotación (51xxxxx / 31xxxxx)</span>
                <span className="font-mono text-emerald-700">${statementData.totals.opRevenues.toLocaleString('es-CL')}</span>
              </div>
              {renderRubroLine(statementData.rubros.ingresosOperacionales)}
            </div>

            {/* BLOQUE 2: COSTO DE VENTAS */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 mb-2">
                <span>2. Costos de Ventas / Explotación (41xxxxx)</span>
                <span className="font-mono text-rose-700">-${statementData.totals.costOfSales.toLocaleString('es-CL')}</span>
              </div>
              {renderRubroLine(statementData.rubros.costosVentas, true)}
            </div>

            {/* RESALTADO: MARGEN OPERACIONAL (GANANCIA BRUTA) */}
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-3.5 rounded-xl flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <div>
                  <span className="text-xs font-black uppercase tracking-wider">(=) MARGEN OPERACIONAL (GANANCIA BRUTA)</span>
                  <p className="text-[11px] text-indigo-200">Ingresos Operacionales menos Costos de Venta ({statementData.totals.grossMarginPercent}% sobre ventas)</p>
                </div>
              </div>
              <div className="font-mono font-black text-lg text-amber-300">
                ${statementData.totals.grossMargin.toLocaleString('es-CL')}
              </div>
            </div>

            {/* BLOQUE 3: GASTOS DE ADMINISTRACIÓN Y VENTAS */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 mb-2">
                <span>3. Gastos de Administración y Ventas (42xxxxx)</span>
                <span className="font-mono text-rose-700">-${statementData.totals.opExpenses.toLocaleString('es-CL')}</span>
              </div>
              {renderRubroLine(statementData.rubros.gastosRemuneraciones, true)}
              {renderRubroLine(statementData.rubros.gastosAdministracion, true)}
              {renderRubroLine(statementData.rubros.depreciacionAmort, true)}
            </div>

            {/* RESALTADO: RESULTADO OPERACIONAL */}
            <div className="bg-slate-100 p-3 rounded-xl flex justify-between items-center border border-slate-300">
              <div>
                <span className="text-xs font-black uppercase text-slate-800">(=) RESULTADO OPERACIONAL (EBIT)</span>
                <p className="text-[11px] text-slate-500">Resultado antes de partidas no operacionales e impuestos</p>
              </div>
              <div className="font-mono font-black text-base text-slate-900">
                ${statementData.totals.operatingResult.toLocaleString('es-CL')}
              </div>
            </div>

            {/* BLOQUE 4: RESULTADOS FUERA DE EXPLOTACIÓN */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 mb-2">
                <span>4. Resultados Fuera de la Explotación (52xxxxx Otros Ingresos, 53xxxxx Financieros y Gastos No Op.)</span>
                <span className="font-mono text-slate-700">
                  ${(statementData.totals.otherInc + statementData.totals.finInc - statementData.totals.finCosts - statementData.totals.otherExp).toLocaleString('es-CL')}
                </span>
              </div>
              {/* 52 Otros Ingresos Fuera de la Explotación va primero, después de gastos de administración */}
              {renderRubroLine(statementData.rubros.otrosIngresosOp)}
              {renderRubroLine(statementData.rubros.ingresosFinancieros)}
              {renderRubroLine(statementData.rubros.costosFinancieros, true)}
              {renderRubroLine(statementData.rubros.otrosGastosNoOp, true)}
            </div>

            {/* RESALTADO: RESULTADO ANTES DE IMPUESTO */}
            <div className="bg-slate-100 p-3 rounded-xl flex justify-between items-center border border-slate-300">
              <div>
                <span className="text-xs font-black uppercase text-slate-800">(=) RESULTADO ANTES DE IMPUESTO A LAS GANANCIAS</span>
              </div>
              <div className="font-mono font-black text-base text-slate-900">
                ${statementData.totals.profitBeforeTax.toLocaleString('es-CL')}
              </div>
            </div>

            {/* BLOQUE 5: IMPUESTO A LA RENTA */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 mb-2">
                <span>5. Gasto por Impuesto a las Ganancias (45xxxxx)</span>
                <span className="font-mono text-rose-700">-${statementData.totals.incomeTax.toLocaleString('es-CL')}</span>
              </div>
              {renderRubroLine(statementData.rubros.impuestoRenta, true)}
            </div>

            {/* TOTAL FINAL: RESULTADO NETO DEL EJERCICIO */}
            <div className={`p-4 rounded-xl flex justify-between items-center border-2 ${
              statementData.totals.isProfit
                ? 'bg-emerald-950 text-white border-emerald-500'
                : 'bg-rose-950 text-white border-rose-500'
            }`}>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                  (=) RESULTADO NETO DEL EJERCICIO ({statementData.totals.isProfit ? 'UTILIDAD' : 'PÉRDIDA'})
                </span>
                <p className="text-[11px] text-slate-300">
                  Total transferido al Patrimonio Neto en el Balance Clasificado
                </p>
              </div>
              <div className="font-mono font-black text-xl text-white">
                ${statementData.totals.netIncome.toLocaleString('es-CL')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 2: MATRIZ MENSUAL (12 MESES) */}
      {viewFormat === 'mensual_matriz' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="bg-slate-900 text-white font-bold uppercase text-[11px]">
                <th className="p-3 sticky left-0 bg-slate-900 z-10 min-w-[240px]">Rubro / Concepto IFRS</th>
                {monthNames.map(m => (
                  <th key={m} className="p-2 text-right min-w-[85px] font-mono">{m}</th>
                ))}
                <th className="p-3 text-right bg-indigo-950 min-w-[120px] font-mono text-amber-300">Total {selectedYear}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
              {/* 1. Ingresos Operacionales */}
              <tr className="bg-emerald-50/70 font-bold text-emerald-950">
                <td className="p-2.5 font-sans sticky left-0 bg-emerald-50 z-10">1. Ingresos de Actividades Ordinarias</td>
                {statementData.monthly.opRevenues.map((v, i) => (
                  <td key={i} className="p-2 text-right">${v.toLocaleString('es-CL')}</td>
                ))}
                <td className="p-2.5 text-right font-black bg-emerald-100">${statementData.totals.opRevenues.toLocaleString('es-CL')}</td>
              </tr>

              {/* 2. Costos de Ventas */}
              <tr className="bg-rose-50/50 font-bold text-rose-950">
                <td className="p-2.5 font-sans sticky left-0 bg-rose-50 z-10">2. Costos de Ventas / Explotación</td>
                {statementData.monthly.costOfSales.map((v, i) => (
                  <td key={i} className="p-2 text-right">-${v.toLocaleString('es-CL')}</td>
                ))}
                <td className="p-2.5 text-right font-black bg-rose-100">-${statementData.totals.costOfSales.toLocaleString('es-CL')}</td>
              </tr>

              {/* MARGEN OPERACIONAL */}
              <tr className="bg-indigo-100 font-black text-indigo-950 text-xs">
                <td className="p-2.5 font-sans sticky left-0 bg-indigo-100 z-10 uppercase">(=) MARGEN OPERACIONAL (BRUTO)</td>
                {statementData.monthly.grossMargin.map((v, i) => (
                  <td key={i} className="p-2 text-right">${v.toLocaleString('es-CL')}</td>
                ))}
                <td className="p-2.5 text-right font-black bg-indigo-200 text-indigo-950">${statementData.totals.grossMargin.toLocaleString('es-CL')}</td>
              </tr>

              {/* 3. Gastos de Administración y Ventas */}
              <tr className="text-slate-700">
                <td className="p-2.5 font-sans sticky left-0 bg-white z-10">3. Gastos de Adm. y Ventas</td>
                {statementData.monthly.opExpenses.map((v, i) => (
                  <td key={i} className="p-2 text-right">-${v.toLocaleString('es-CL')}</td>
                ))}
                <td className="p-2.5 text-right font-bold bg-slate-100">-${statementData.totals.opExpenses.toLocaleString('es-CL')}</td>
              </tr>

              {/* RESULTADO OPERACIONAL */}
              <tr className="bg-slate-200/80 font-bold text-slate-900">
                <td className="p-2.5 font-sans sticky left-0 bg-slate-200 z-10">(=) RESULTADO OPERACIONAL (EBIT)</td>
                {statementData.monthly.operatingResult.map((v, i) => (
                  <td key={i} className="p-2 text-right">${v.toLocaleString('es-CL')}</td>
                ))}
                <td className="p-2.5 text-right font-black bg-slate-300">${statementData.totals.operatingResult.toLocaleString('es-CL')}</td>
              </tr>

              {/* Resultados Financieros y Otros */}
              <tr className="text-slate-600 text-[10px]">
                <td className="p-2 font-sans sticky left-0 bg-white z-10">4. Res. Financieros y Otros</td>
                {statementData.monthly.profitBeforeTax.map((pbt, i) => {
                  const diff = pbt - statementData.monthly.operatingResult[i];
                  return <td key={i} className="p-2 text-right">${diff.toLocaleString('es-CL')}</td>;
                })}
                <td className="p-2 text-right font-semibold bg-slate-100">
                  ${(statementData.totals.profitBeforeTax - statementData.totals.operatingResult).toLocaleString('es-CL')}
                </td>
              </tr>

              {/* Impuesto a la Renta */}
              <tr className="text-rose-800 text-[10px]">
                <td className="p-2 font-sans sticky left-0 bg-white z-10">5. Gasto Impuesto Renta</td>
                {statementData.monthly.incomeTax.map((v, i) => (
                  <td key={i} className="p-2 text-right">-${v.toLocaleString('es-CL')}</td>
                ))}
                <td className="p-2 text-right font-semibold bg-rose-50">-${statementData.totals.incomeTax.toLocaleString('es-CL')}</td>
              </tr>

              {/* RESULTADO NETO */}
              <tr className={`font-black text-xs ${statementData.totals.isProfit ? 'bg-emerald-900 text-white' : 'bg-rose-900 text-white'}`}>
                <td className="p-3 font-sans sticky left-0 bg-inherit z-10 uppercase">
                  (=) RESULTADO NETO DEL EJERCICIO
                </td>
                {statementData.monthly.netIncome.map((v, i) => (
                  <td key={i} className="p-2 text-right">${v.toLocaleString('es-CL')}</td>
                ))}
                <td className="p-3 text-right font-mono font-black text-amber-300 text-sm">
                  ${statementData.totals.netIncome.toLocaleString('es-CL')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
