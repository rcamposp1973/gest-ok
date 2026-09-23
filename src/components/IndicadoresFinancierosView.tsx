import React, { useState, useMemo } from 'react';
import {
  Company,
  Voucher,
  ChartOfAccount,
  FiscalPeriodYear,
  BankReconciliation,
  RCVDocument,
  Auxiliary,
  CostCenterMaster,
  ExpenseItemMaster
} from '../types';
import {
  BarChart3,
  Landmark,
  Droplets,
  TrendingUp,
  Scale,
  Clock,
  Printer,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  PieChart as PieChartIcon,
  Users,
  Building2,
  DollarSign,
  Target,
  Sparkles,
  Layers,
  Activity,
  Filter,
  BarChart2,
  Zap,
  TrendingDown,
  ShieldCheck,
  Percent
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ComposedChart
} from 'recharts';

interface IndicadoresFinancierosViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  bankReconciliations?: BankReconciliation[];
  rcvDocuments?: RCVDocument[];
  auxiliaries?: Auxiliary[];
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
}

const MONTH_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const CHART_COLORS = [
  '#4f46e5', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#64748b',
  '#14b8a6', '#f97316'
];

export default function IndicadoresFinancierosView({
  company,
  vouchers,
  accounts,
  fiscalYears,
  bankReconciliations = [],
  rcvDocuments = [],
  auxiliaries = [],
  costCenters = [],
  expenseItems = []
}: IndicadoresFinancierosViewProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Todos');
  const [activeTab, setActiveTab] = useState<'overview' | 'pareto' | 'expenses' | 'unitEconomics' | 'margins'>('overview');
  const [expenseGrouping, setExpenseGrouping] = useState<'byAccount' | 'byCostCenter' | 'byExpenseItem'>('byAccount');
  const [paretoType, setParetoType] = useState<'clients' | 'suppliers'>('clients');

  // Map of accounts for quick lookup
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // Auxiliaries lookup map
  const auxiliaryMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(aux => {
      map.set(aux.rut, aux);
      map.set(aux.id, aux);
    });
    return map;
  }, [auxiliaries]);

  // Base Financial Calculations & Aggregates
  const stats = useMemo(() => {
    const accSums = new Map<string, { debit: number; credit: number; account: ChartOfAccount }>();

    accounts.forEach(acc => {
      accSums.set(acc.id, { debit: 0, credit: 0, account: acc });
    });

    const validVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      const vYear = v.date ? parseInt(v.date.slice(0, 4)) : selectedYear;
      if (vYear !== selectedYear) return false;
      if (selectedPeriod !== 'Todos' && v.period !== selectedPeriod) return false;
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
          const accCodeStr = l.accountCode || 'S/C';
          const prefix = accCodeStr.trim().charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Activo';
          if (prefix === '1') inferredType = 'Activo';
          else if (prefix === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3') || accCodeStr.startsWith('2-3')) ? 'Patrimonio' : 'Pasivo';
          }
          else if (prefix === '3') inferredType = 'Ingreso';
          else if (prefix === '4' || prefix === '5') inferredType = 'Gasto';

          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: accCodeStr,
            name: l.accountName || 'Cuenta S/C',
            type: inferredType,
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

    let activoCorriente = 0;
    let inventarios = 0;
    let disponibleLibros = 0;
    let cuentasPorCobrar = 0;
    let activoNoCorriente = 0;
    let pasivoCorriente = 0;
    let pasivoNoCorriente = 0;
    let patrimonio = 0;

    let ventasTotales = 0;
    let costoVentas = 0;
    let gastosOperacionales = 0;
    let depreciacionAmortizacion = 0;
    let gastosFinancieros = 0;
    let otrosIngresos = 0;
    let otrosGastos = 0;

    accSums.forEach(({ debit, credit, account }) => {
      const code = (account.code || '').trim();
      const codePrefix = code.charAt(0);
      const name = (account.name || '').toLowerCase();
      const normType = (account.type || '').toLowerCase();

      const blceCol = (account.blce8Columnas || '').toUpperCase();
      const isPatrimonio = 
        code.startsWith('23') || 
        code.startsWith('2.3') || 
        code.startsWith('2-3') || 
        (codePrefix === '3' && !normType.includes('ingreso') && (normType.includes('patrimonio') || normType.includes('capital') || normType.includes('reserva'))) ||
        normType.includes('patrimonio') || 
        normType.includes('capital');

      const isActivo = 
        blceCol === 'ACTIVO' ||
        codePrefix === '1' || 
        (!['2', '3', '4', '5'].includes(codePrefix) && normType.includes('activo'));

      const isPasivo = 
        !isPatrimonio && 
        (blceCol === 'PASIVO' || codePrefix === '2' || (!['1', '3', '4', '5'].includes(codePrefix) && normType.includes('pasivo')));

      const isIngreso = 
        blceCol === 'GANANCIA' ||
        codePrefix === '5' || 
        (codePrefix === '3' && (normType.includes('ingreso') || normType.includes('ganancia') || code.startsWith('31') || code.startsWith('32') || code.startsWith('33'))) ||
        (!['1', '2', '4'].includes(codePrefix) && (normType.includes('ingreso') || normType.includes('ganancia') || normType.includes('venta')));

      const isGasto = 
        blceCol === 'PERDIDA' ||
        blceCol === 'PÉRDIDA' ||
        codePrefix === '4' || 
        (!['1', '2', '3', '5'].includes(codePrefix) && (normType.includes('gasto') || normType.includes('costo') || normType.includes('perdida') || normType.includes('pérdida')));

      if (isActivo) {
        const balance = debit - credit;
        const isNoCorriente = 
          code.startsWith('1.2') || code.startsWith('1-2') || code.startsWith('12') ||
          name.includes('fijo') || name.includes('propiedad') || name.includes('intangible') || name.includes('depreciaci');

        if (isNoCorriente) {
          activoNoCorriente += balance;
        } else {
          activoCorriente += balance;
          if (name.includes('mercader') || name.includes('inventario') || name.includes('existencia') || code.startsWith('1-1-03') || code.startsWith('1.1.03')) {
            inventarios += balance;
          }
          if (name.includes('banco') || name.includes('caja') || name.includes('cuenta corriente') || name.includes('tesoreria') || code.startsWith('1-1-01') || code.startsWith('1.1.01')) {
            disponibleLibros += balance;
          }
          if (name.includes('cliente') || name.includes('deudor') || name.includes('cuenta por cobrar') || code.startsWith('1-1-02') || code.startsWith('1.1.02')) {
            cuentasPorCobrar += balance;
          }
        }
      }
      else if (isPasivo) {
        const balance = credit - debit;
        const isNoCorriente = 
          code.startsWith('2.2') || code.startsWith('2-2') || code.startsWith('22') ||
          name.includes('largo plazo') || name.includes('hipotecario');

        if (isNoCorriente) {
          pasivoNoCorriente += balance;
        } else {
          pasivoCorriente += balance;
        }
      }
      else if (isPatrimonio) {
        patrimonio += (credit - debit);
      }
      else if (isIngreso) {
        const balance = credit - debit;
        if (code.startsWith('52') || code.startsWith('5.2') || code.startsWith('53') || code.startsWith('5.3') || code.startsWith('32') || code.startsWith('3.2') || code.startsWith('33') || code.startsWith('3.3') || name.includes('no operacional') || name.includes('financiero') || name.includes('fuera de explotacion') || name.includes('otro ingreso')) {
          otrosIngresos += balance;
        } else {
          ventasTotales += balance;
        }
      }
      else if (isGasto) {
        const balance = debit - credit;
        if (name.includes('costo de venta') || name.includes('costo directo') || name.includes('costo explotacion') || code.startsWith('4.1') || code.startsWith('41')) {
          costoVentas += balance;
        } else if (name.includes('depreciaci') || name.includes('amortizaci') || code.startsWith('4203') || code.startsWith('4.2.03') || code.startsWith('4.2.02') || code.startsWith('4202003')) {
          depreciacionAmortizacion += balance;
          gastosOperacionales += balance;
        } else if (code.startsWith('43') || code.startsWith('4.3') || code.startsWith('44') || code.startsWith('4.4') || name.includes('interes') || name.includes('financiero') || name.includes('gasto bancario') || name.includes('fuera de explotacion') || name.includes('otro gasto')) {
          gastosFinancieros += balance;
          otrosGastos += balance;
        } else {
          gastosOperacionales += balance;
        }
      }
    });

    const margenBruto = ventasTotales - costoVentas;
    const ebit = margenBruto - gastosOperacionales;
    const ebitda = ebit + depreciacionAmortizacion;
    const utilidadNeta = ebit + otrosIngresos - otrosGastos;

    const razonCorriente = pasivoCorriente > 0 ? (activoCorriente / pasivoCorriente) : 0;
    const pruebaAcida = pasivoCorriente > 0 ? ((activoCorriente - inventarios) / pasivoCorriente) : 0;
    const capitalTrabajo = activoCorriente - pasivoCorriente;
    const diasCalle = ventasTotales > 0 ? (cuentasPorCobrar / ventasTotales) * 365 : 0;

    const margenBrutoPct = ventasTotales > 0 ? (margenBruto / ventasTotales) * 100 : 0;
    const margenOperacionalPct = ventasTotales > 0 ? (ebit / ventasTotales) * 100 : 0;
    const margenEbitdaPct = ventasTotales > 0 ? (ebitda / ventasTotales) * 100 : 0;
    const margenNetoPct = ventasTotales > 0 ? (utilidadNeta / ventasTotales) * 100 : 0;

    const pasivoTotal = pasivoCorriente + pasivoNoCorriente;
    const activoTotal = activoCorriente + activoNoCorriente;
    const patrimonioTotal = patrimonio + utilidadNeta;
    const leverage = patrimonioTotal > 0 ? (pasivoTotal / patrimonioTotal) : 0;
    const razonEndeudamiento = activoTotal > 0 ? (pasivoTotal / activoTotal) * 100 : 0;

    const latestReconciliations = bankReconciliations.filter(r => r.period?.startsWith(String(selectedYear)));
    let saldoCartolasBancarias = 0;
    let abonosPendientesContabilizar = 0;
    let cargosPendientesContabilizar = 0;

    latestReconciliations.forEach(rec => {
      saldoCartolasBancarias += (rec.bankFinalBalance || 0);
      if (rec.lines) {
        rec.lines.forEach(l => {
          if (l.matchedStatus !== 'Conciliado') {
            if ((l.deposit || 0) > 0) abonosPendientesContabilizar += (l.deposit || 0);
            if ((l.charge || 0) > 0) cargosPendientesContabilizar += (l.charge || 0);
          }
        });
      }
    });

    const saldoDisponibleReal = saldoCartolasBancarias + abonosPendientesContabilizar - cargosPendientesContabilizar;
    const diferenciaDisponibleVsLibros = saldoDisponibleReal - disponibleLibros;

    return {
      activoCorriente,
      activoNoCorriente,
      activoTotal,
      inventarios,
      disponibleLibros,
      cuentasPorCobrar,
      pasivoCorriente,
      pasivoNoCorriente,
      pasivoTotal,
      patrimonioTotal,
      ventasTotales,
      costoVentas,
      margenBruto,
      margenBrutoPct,
      gastosOperacionales,
      ebit,
      ebitda,
      depreciacionAmortizacion,
      utilidadNeta,
      razonCorriente,
      pruebaAcida,
      capitalTrabajo,
      diasCalle,
      margenOperacionalPct,
      margenEbitdaPct,
      margenNetoPct,
      leverage,
      razonEndeudamiento,
      saldoCartolasBancarias,
      abonosPendientesContabilizar,
      cargosPendientesContabilizar,
      saldoDisponibleReal,
      diferenciaDisponibleVsLibros,
      hasReconciliationData: latestReconciliations.length > 0
    };
  }, [accounts, vouchers, accountMap, selectedYear, selectedPeriod, bankReconciliations]);

  // Monthly Sales & Expense Trend
  const monthlyData = useMemo(() => {
    const monthlyList = MONTH_SHORT.map((m, idx) => ({
      month: m,
      monthNum: idx + 1,
      ventas: 0,
      costos: 0,
      gastos: 0,
      utilidadNet: 0,
      margenBrutoPct: 0,
      margenNetoPct: 0
    }));

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
        const codeStr = (l.accountCode || '').trim();
        const prefix = codeStr.charAt(0);

        if (prefix === '5' || prefix === '3') {
          monthlyList[mIdx].ventas += (credit - debit);
        } else if (prefix === '4') {
          const accName = (l.accountName || '').toLowerCase();
          if (accName.includes('costo') || codeStr.startsWith('4.1') || codeStr.startsWith('41')) {
            monthlyList[mIdx].costos += (debit - credit);
          } else {
            monthlyList[mIdx].gastos += (debit - credit);
          }
        }
      });
    });

    monthlyList.forEach(m => {
      const mb = m.ventas - m.costos;
      m.utilidadNet = mb - m.gastos;
      m.margenBrutoPct = m.ventas > 0 ? (mb / m.ventas) * 100 : 0;
      m.margenNetoPct = m.ventas > 0 ? (m.utilidadNet / m.ventas) * 100 : 0;
    });

    return monthlyList;
  }, [vouchers, selectedYear]);

  // Pareto 80/20 Analysis (Clientes / Proveedores)
  const paretoData = useMemo(() => {
    const clientMap = new Map<string, { rut: string; name: string; total: number }>();
    const supplierMap = new Map<string, { rut: string; name: string; total: number }>();

    const validVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      const vYear = v.date ? parseInt(v.date.slice(0, 4)) : selectedYear;
      return vYear === selectedYear;
    });

    validVouchers.forEach(v => {
      if (!v.lines) return;
      v.lines.forEach(l => {
        const rut = (l.auxiliaryRut || '').trim();
        if (!rut) return;

        const name = l.auxiliaryName || auxiliaryMap.get(rut)?.name || `Aux. RUT ${rut}`;
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        const codeStr = (l.accountCode || '').trim();
        const prefix = codeStr.charAt(0);

        if (prefix === '5' || prefix === '3') {
          const val = credit - debit;
          if (val > 0) {
            const curr = clientMap.get(rut) || { rut, name, total: 0 };
            curr.total += val;
            clientMap.set(rut, curr);
          }
        } else if (prefix === '4') {
          const val = debit - credit;
          if (val > 0) {
            const curr = supplierMap.get(rut) || { rut, name, total: 0 };
            curr.total += val;
            supplierMap.set(rut, curr);
          }
        }
      });
    });

    // Also parse RCV Documents for supplementary completeness
    rcvDocuments.forEach(doc => {
      const rut = doc.tipoRegistro === 'Venta' ? doc.rutReceptor : doc.rutEmisor;
      if (!rut) return;

      const name = (doc.tipoRegistro === 'Venta' ? doc.razonSocialReceptor : doc.razonSocialEmisor) || `Aux. RUT ${rut}`;
      const amount = doc.montoNeto || doc.montoTotal || 0;

      if (doc.tipoRegistro === 'Venta') {
        const curr = clientMap.get(rut) || { rut, name, total: 0 };
        if (curr.total === 0) curr.total = amount;
        clientMap.set(rut, curr);
      } else if (doc.tipoRegistro === 'Compra') {
        const curr = supplierMap.get(rut) || { rut, name, total: 0 };
        if (curr.total === 0) curr.total = amount;
        supplierMap.set(rut, curr);
      }
    });

    const buildParetoTable = (items: { rut: string; name: string; total: number }[]) => {
      const sorted = [...items].sort((a, b) => b.total - a.total);
      const grandTotal = sorted.reduce((acc, curr) => acc + curr.total, 0);

      let runningSum = 0;
      return sorted.map((item, idx) => {
        runningSum += item.total;
        const pctIndividual = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
        const pctAcumulado = grandTotal > 0 ? (runningSum / grandTotal) * 100 : 0;
        const isCore80 = pctAcumulado <= 80 || (idx > 0 && grandTotal > 0 && ((runningSum - item.total) / grandTotal) * 100 < 80);

        return {
          rank: idx + 1,
          rut: item.rut,
          name: item.name,
          total: item.total,
          pctIndividual,
          pctAcumulado,
          isCore80
        };
      });
    };

    const clientsList = buildParetoTable(Array.from(clientMap.values()));
    const suppliersList = buildParetoTable(Array.from(supplierMap.values()));

    return { clients: clientsList, suppliers: suppliersList };
  }, [vouchers, rcvDocuments, auxiliaryMap, selectedYear]);

  // Expense Breakdown Report
  const expenseBreakdown = useMemo(() => {
    const expenseMap = new Map<string, { codeOrId: string; name: string; total: number }>();

    const validVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      const vYear = v.date ? parseInt(v.date.slice(0, 4)) : selectedYear;
      return vYear === selectedYear;
    });

    validVouchers.forEach(v => {
      if (!v.lines) return;
      v.lines.forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        const val = debit - credit;
        if (val <= 0) return;

        const codeStr = (l.accountCode || '').trim();
        const prefix = codeStr.charAt(0);

        if (prefix === '4') {
          let key = '';
          let label = '';

          if (expenseGrouping === 'byAccount') {
            key = l.accountCode || l.accountId || 'S/C';
            label = `${l.accountCode || ''} - ${l.accountName || 'Gasto'}`;
          } else if (expenseGrouping === 'byCostCenter') {
            key = l.costCenter || 'SIN_CC';
            const ccObj = costCenters.find(c => c.id === key || c.code === key || c.name === key);
            label = ccObj ? `${ccObj.code} - ${ccObj.name}` : (l.costCenter || 'Sin Centro de Costo');
          } else {
            key = l.expenseItem || 'GENERAL';
            const expObj = expenseItems.find(e => e.id === key || e.code === key || e.name === key);
            label = expObj ? `${expObj.code} - ${expObj.name}` : (l.expenseItem || 'Gastos Generales / Operativos');
          }

          const existing = expenseMap.get(key) || { codeOrId: key, name: label, total: 0 };
          existing.total += val;
          expenseMap.set(key, existing);
        }
      });
    });

    const items = Array.from(expenseMap.values()).sort((a, b) => b.total - a.total);
    const grandTotalExpenses = items.reduce((acc, curr) => acc + curr.total, 0);

    return items.map(item => ({
      ...item,
      pctOfTotal: grandTotalExpenses > 0 ? (item.total / grandTotalExpenses) * 100 : 0,
      monthlyAvg: item.total / 12
    }));
  }, [vouchers, costCenters, expenseItems, selectedYear, expenseGrouping]);

  // Financial & Unit Economics Metrics (Clean, professional names)
  const unitEconomics = useMemo(() => {
    const activeMonths = monthlyData.filter(m => m.ventas > 0);
    const numActiveMonths = Math.max(1, activeMonths.length);

    const mrr = stats.ventasTotales / numActiveMonths;
    const arr = mrr * 12;

    const currentMonthIdx = new Date().getMonth();
    const lastMonthVentas = monthlyData[currentMonthIdx]?.ventas || monthlyData[11]?.ventas || 0;
    const prevMonthVentas = monthlyData[currentMonthIdx - 1]?.ventas || monthlyData[10]?.ventas || 1;
    const momGrowthPct = prevMonthVentas > 0 ? ((lastMonthVentas - prevMonthVentas) / prevMonthVentas) * 100 : 0;

    const monthlyNetBurn = (stats.gastosOperacionales + stats.costoVentas - stats.ventasTotales) / 12;
    const isBurningCash = monthlyNetBurn > 0;

    const runwayMonths = isBurningCash && monthlyNetBurn > 0 
      ? (stats.saldoDisponibleReal / monthlyNetBurn) 
      : (stats.saldoDisponibleReal / Math.max(1, (stats.gastosOperacionales / 12)));

    const totalClientsCount = Math.max(1, paretoData.clients.length);
    const avgSalesPerClient = stats.ventasTotales / totalClientsCount;
    const churnRatePct = 2.5;
    const ltv = (avgSalesPerClient * 3);

    const marketingExpenses = expenseBreakdown
      .filter(e => e.name.toLowerCase().includes('comercial') || e.name.toLowerCase().includes('marketing') || e.name.toLowerCase().includes('publicidad') || e.name.toLowerCase().includes('comision'))
      .reduce((sum, curr) => sum + curr.total, 0);

    const cac = marketingExpenses > 0 ? (marketingExpenses / totalClientsCount) : (avgSalesPerClient * 0.15);
    const ltvCacRatio = cac > 0 ? (ltv / cac) : 3.5;

    const ruleOf40Score = momGrowthPct + stats.margenEbitdaPct;

    return {
      mrr,
      arr,
      momGrowthPct,
      monthlyNetBurn,
      isBurningCash,
      runwayMonths,
      totalClientsCount,
      avgSalesPerClient,
      churnRatePct,
      ltv,
      cac,
      ltvCacRatio,
      ruleOf40Score
    };
  }, [stats, monthlyData, paretoData, expenseBreakdown]);

  // Break-even point (Punto de Equilibrio)
  const breakEven = useMemo(() => {
    const costosFijos = stats.gastosOperacionales;
    const porcentajeMargenBrutoDecimal = stats.margenBrutoPct / 100;
    const ventasPuntoEquilibrio = porcentajeMargenBrutoDecimal > 0 
      ? (costosFijos / porcentajeMargenBrutoDecimal) 
      : 0;

    const coberturaActualPct = ventasPuntoEquilibrio > 0 
      ? (stats.ventasTotales / ventasPuntoEquilibrio) * 100 
      : 0;

    return {
      costosFijos,
      ventasPuntoEquilibrio,
      coberturaActualPct,
      superavitDeficit: stats.ventasTotales - ventasPuntoEquilibrio
    };
  }, [stats]);

  return (
    <div className="space-y-4">
      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Tablero de Indicadores Financieros, KPIs & Inteligencia de Negocios
              </h3>
              <p className="text-xs text-slate-500">
                {company.name} (RUT: {company.rut}) &bull; Análisis de Liquidez, Márgenes, Pareto 80/20, Gastos y Rendimiento
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
            <label className="font-semibold text-slate-600 text-[11px]">Ejercicio Fiscal:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-300 rounded-md font-bold px-2 py-0.5 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-mono"
            >
              {[2027, 2026, 2025, 2024].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Imprimir Informe</span>
          </button>
        </div>
      </div>

      {/* NAVEGACIÓN POR PESTAÑAS / SECCIONES */}
      <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl overflow-x-auto text-xs font-bold text-slate-600">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'overview' ? 'bg-white text-indigo-900 shadow-xs' : 'hover:bg-slate-100/60 text-slate-600'
          }`}
        >
          <Activity className="w-4 h-4 text-indigo-600" />
          <span>Resumen KPIs & Liquidez</span>
        </button>

        <button
          onClick={() => setActiveTab('pareto')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'pareto' ? 'bg-white text-indigo-900 shadow-xs' : 'hover:bg-slate-100/60 text-slate-600'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-600" />
          <span>Informe Pareto 80/20 (Clientes/Prov)</span>
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'expenses' ? 'bg-white text-indigo-900 shadow-xs' : 'hover:bg-slate-100/60 text-slate-600'
          }`}
        >
          <PieChartIcon className="w-4 h-4 text-amber-600" />
          <span>Informe de Gastos</span>
        </button>

        <button
          onClick={() => setActiveTab('unitEconomics')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'unitEconomics' ? 'bg-white text-indigo-900 shadow-xs' : 'hover:bg-slate-100/60 text-slate-600'
          }`}
        >
          <Zap className="w-4 h-4 text-purple-600" />
          <span>Métricas de Rendimiento & Crecimiento</span>
        </button>

        <button
          onClick={() => setActiveTab('margins')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'margins' ? 'bg-white text-indigo-900 shadow-xs' : 'hover:bg-slate-100/60 text-slate-600'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <span>Márgenes & Punto de Equilibrio</span>
        </button>
      </div>

      {/* CONTENIDO TAB 1: RESUMEN OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* TESORERÍA Y DISPONIBLE REAL */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-indigo-400" />
                <h4 className="font-bold text-sm uppercase tracking-wide text-slate-200">
                  Análisis de Tesorería: Disponible Real vs. Contabilidad
                </h4>
              </div>
              <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700 font-mono">
                Año {selectedYear}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                  1. Saldo en Contabilidad
                </span>
                <p className="text-lg font-bold text-white font-mono tabular-nums mt-1">
                  ${stats.disponibleLibros.toLocaleString('es-CL')}
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Mayor de Caja y Bancos
                </span>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
                <span className="text-[10px] text-indigo-300 font-semibold uppercase tracking-wider block">
                  2. Saldo Cartolas Bancarias
                </span>
                <p className="text-lg font-bold text-indigo-200 font-mono tabular-nums mt-1">
                  ${stats.saldoCartolasBancarias.toLocaleString('es-CL')}
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {stats.hasReconciliationData ? 'Según Cartolas Bancarias' : 'Pendiente cargar cartola'}
                </span>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
                <span className="text-[10px] text-amber-300 font-semibold uppercase tracking-wider block">
                  3. Partidas Pendientes
                </span>
                <div className="text-[11px] font-mono tabular-nums mt-1 space-y-0.5">
                  <div className="flex justify-between text-emerald-400">
                    <span className="font-sans text-[10px]">(+) Abonos:</span>
                    <span>+${stats.abonosPendientesContabilizar.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span className="font-sans text-[10px]">(-) Cargos:</span>
                    <span>-${stats.cargosPendientesContabilizar.toLocaleString('es-CL')}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 p-3 rounded-lg border border-indigo-500/50 shadow-xs">
                <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">
                  4. DISPONIBLE REAL CONCILIADO
                </span>
                <p className="text-xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
                  ${stats.saldoDisponibleReal.toLocaleString('es-CL')}
                </p>
                <span className="text-[10px] text-slate-300 block mt-0.5 font-medium">
                  Fondos líquidos operativos
                </span>
              </div>
            </div>
          </div>

          {/* RATIOS DE LIQUIDEZ Y CAPITAL DE TRABAJO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Razón Corriente</span>
                  <span className="text-[10px] text-slate-500">Activo Cte. / Pasivo Cte.</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  stats.razonCorriente >= 1.5 ? 'bg-emerald-100 text-emerald-800' :
                  stats.razonCorriente >= 1.0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {stats.razonCorriente >= 1.5 ? 'Excelente' : stats.razonCorriente >= 1.0 ? 'Aceptable' : 'Riesgo'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">{stats.razonCorriente.toFixed(2)}x</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Respaldado por ${stats.razonCorriente.toFixed(2)} en activos circulantes por cada $1 de deuda.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Prueba Ácida</span>
                  <span className="text-[10px] text-slate-500">(Activo Cte. - Inventario) / Pasivo Cte.</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  stats.pruebaAcida >= 1.0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {stats.pruebaAcida >= 1.0 ? 'Óptima' : 'Ajustada'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">{stats.pruebaAcida.toFixed(2)}x</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Capacidad de liquidación inmediata sin depender de ventas de inventario.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Capital de Trabajo Neto</span>
                  <span className="text-[10px] text-slate-500">Activo Cte. - Pasivo Cte.</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  stats.capitalTrabajo >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {stats.capitalTrabajo >= 0 ? 'Superávit' : 'Déficit'}
                </span>
              </div>
              <p className={`text-2xl font-bold font-mono tabular-nums mt-2 ${stats.capitalTrabajo >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                ${stats.capitalTrabajo.toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                Fondo operacional disponible para giro continuo.
              </p>
            </div>
          </div>

          {/* GRÁFICO DE EVOLUCIÓN MENSUAL DE VENTAS Y RESULTADO */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-indigo-600" />
                  Evolución Mensual de Ventas, Costos y Resultado Neto
                </h4>
                <p className="text-xs text-slate-500">Comparativa mes a mes durante el ejercicio {selectedYear}</p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} />
                  <Tooltip
                    formatter={(val: any) => [`$${Number(val).toLocaleString('es-CL')}`, '']}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend />
                  <Bar dataKey="ventas" name="Ventas ($)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="costos" name="Costos Directos ($)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gastos" name="Gastos Op. ($)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="utilidadNet" name="Utilidad Neta ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 2: PARATO 80/20 (CLIENTES Y PROVEEDORES) */}
      {activeTab === 'pareto' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3 mb-4">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Análisis de Pareto 80/20: Concentración de Negocio
                </h4>
                <p className="text-xs text-slate-500">
                  Identifica el 20% de los auxiliares que generan el 80% del volumen de ventas o gastos
                </p>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
                <button
                  onClick={() => setParetoType('clients')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    paretoType === 'clients' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  80/20 Clientes (Ventas)
                </button>
                <button
                  onClick={() => setParetoType('suppliers')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    paretoType === 'suppliers' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  80/20 Proveedores (Gastos)
                </button>
              </div>
            </div>

            {/* GRÁFICO PARATO COMPOSED */}
            <div className="h-72 w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={(paretoType === 'clients' ? paretoData.clients : paretoData.suppliers).slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(val) => `${val}%`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any, name: any) => [name.includes('%') ? `${Number(val).toFixed(1)}%` : `$${Number(val).toLocaleString('es-CL')}`, name]} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="total" name={paretoType === 'clients' ? 'Venta ($)' : 'Gasto ($)'} fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="pctAcumulado" name="% Acumulado Pareto" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* TABLA DETALLADA PARATO */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-2.5 text-center">Rank</th>
                    <th className="p-2.5">RUT</th>
                    <th className="p-2.5">Razón Social / Nombre</th>
                    <th className="p-2.5 text-right">{paretoType === 'clients' ? 'Monto Ventas ($)' : 'Monto Compras ($)'}</th>
                    <th className="p-2.5 text-right">% Participación</th>
                    <th className="p-2.5 text-right">% Acumulado</th>
                    <th className="p-2.5 text-center">Categorización 80/20</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(paretoType === 'clients' ? paretoData.clients : paretoData.suppliers).map((item) => (
                    <tr key={item.rut} className={`hover:bg-slate-50 transition-colors ${item.isCore80 ? 'bg-indigo-50/20' : ''}`}>
                      <td className="p-2.5 text-center font-bold text-slate-600">{item.rank}</td>
                      <td className="p-2.5 font-mono font-semibold text-slate-900">{item.rut}</td>
                      <td className="p-2.5 font-medium text-slate-800">{item.name}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        ${item.total.toLocaleString('es-CL')}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-600">{item.pctIndividual.toFixed(1)}%</td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{item.pctAcumulado.toFixed(1)}%</td>
                      <td className="p-2.5 text-center">
                        {item.isCore80 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            ★ Top 80% Estratégico
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            Long Tail (20%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(paretoType === 'clients' ? paretoData.clients : paretoData.suppliers).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No hay registros auxiliares contables para generar el informe 80/20 en este ejercicio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 3: INFORME DE GASTOS */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3 mb-4">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-amber-600" />
                  Informe Detallado de Gastos y Distribución de Egresos
                </h4>
                <p className="text-xs text-slate-500">Agrupación por Cuentas, Centros de Costo e Ítems de Gasto</p>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
                <button
                  onClick={() => setExpenseGrouping('byAccount')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    expenseGrouping === 'byAccount' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por Cuenta Contable
                </button>
                <button
                  onClick={() => setExpenseGrouping('byCostCenter')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    expenseGrouping === 'byCostCenter' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por Centro de Costos
                </button>
                <button
                  onClick={() => setExpenseGrouping('byExpenseItem')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    expenseGrouping === 'byExpenseItem' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por Ítem de Gasto
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center mb-6">
              {/* PIE CHART DE GASTOS */}
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseBreakdown.slice(0, 8)}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {expenseBreakdown.slice(0, 8).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => `$${Number(val).toLocaleString('es-CL')}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* BARS CHART BARS HORIZONTALES */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseBreakdown.slice(0, 7)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(val: any) => `$${Number(val).toLocaleString('es-CL')}`} />
                    <Bar dataKey="total" name="Monto Total Gasto ($)" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TABLA DE GASTOS */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-2.5">Agrupador de Gasto</th>
                    <th className="p-2.5 text-right">Gasto Acumulado Anual</th>
                    <th className="p-2.5 text-right">Promedio Mensual</th>
                    <th className="p-2.5 text-right">% Participación sobre Total Gastos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {expenseBreakdown.map((item) => (
                    <tr key={item.codeOrId} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 font-semibold text-slate-800">{item.name}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        ${item.total.toLocaleString('es-CL')}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-600">
                        ${item.monthlyAvg.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-amber-700">
                        {item.pctOfTotal.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {expenseBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400">
                        Sin gastos registrados para este ejercicio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 4: MÉTRICAS DE RENDIMIENTO & CRECIMIENTO (UNIT ECONOMICS) */}
      {activeTab === 'unitEconomics' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-600" />
                Métricas de Rendimiento Financiero & Economía Unitaria
              </h4>
              <p className="text-xs text-slate-500">
                Indicadores de escala, recurrencia, consumo de caja (Burn Rate) y eficiencia operacional
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* MRR / ARR */}
              <div className="p-4 rounded-xl border border-slate-200 bg-purple-50/40">
                <span className="text-[10px] font-bold uppercase text-purple-700 block tracking-wider">
                  Ingreso Recurrente Mensual (MRR)
                </span>
                <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                  ${unitEconomics.mrr.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                </p>
                <div className="mt-2 text-[11px] text-slate-600 flex justify-between border-t border-purple-200/60 pt-1.5">
                  <span>ARR Anualizado:</span>
                  <span className="font-bold font-mono">${unitEconomics.arr.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>

              {/* MoM Growth */}
              <div className="p-4 rounded-xl border border-slate-200 bg-indigo-50/40">
                <span className="text-[10px] font-bold uppercase text-indigo-700 block tracking-wider">
                  Tasa Crecimiento Mensual (MoM)
                </span>
                <p className={`text-xl font-bold font-mono mt-1 ${unitEconomics.momGrowthPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {unitEconomics.momGrowthPct >= 0 ? '+' : ''}{unitEconomics.momGrowthPct.toFixed(1)}%
                </p>
                <div className="mt-2 text-[11px] text-slate-600 border-t border-indigo-200/60 pt-1.5">
                  <span>Variación ventas mes vs. mes anterior</span>
                </div>
              </div>

              {/* Monthly Burn Rate */}
              <div className="p-4 rounded-xl border border-slate-200 bg-amber-50/40">
                <span className="text-[10px] font-bold uppercase text-amber-700 block tracking-wider">
                  Consumo Neto de Caja (Burn Rate)
                </span>
                <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                  ${Math.abs(unitEconomics.monthlyNetBurn).toLocaleString('es-CL', { maximumFractionDigits: 0 })} /mes
                </p>
                <div className="mt-2 text-[11px] text-slate-600 border-t border-amber-200/60 pt-1.5">
                  <span>{unitEconomics.isBurningCash ? 'Consumo de caja' : 'Generación positiva de caja'}</span>
                </div>
              </div>

              {/* Runway */}
              <div className="p-4 rounded-xl border border-slate-200 bg-emerald-50/40">
                <span className="text-[10px] font-bold uppercase text-emerald-700 block tracking-wider">
                  Autonomía Financiera (Runway)
                </span>
                <p className="text-xl font-bold font-mono text-emerald-800 mt-1">
                  {unitEconomics.runwayMonths > 99 ? '> 99' : unitEconomics.runwayMonths.toFixed(1)} meses
                </p>
                <div className="mt-2 text-[11px] text-slate-600 border-t border-emerald-200/60 pt-1.5">
                  <span>Meses soportados con caja actual</span>
                </div>
              </div>
            </div>

            {/* SEGUNDA FILA: LTV, CAC, REGLA DEL 40 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs font-bold text-slate-800 block">Relación LTV / CAC</span>
                <p className="text-2xl font-bold text-indigo-700 font-mono mt-1">{unitEconomics.ltvCacRatio.toFixed(1)}x</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Un ratio mayor a 3.0x refleja una excelente eficiencia en adquisición de clientes.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs font-bold text-slate-800 block">Costo de Adquisición (CAC)</span>
                <p className="text-2xl font-bold text-slate-900 font-mono mt-1">
                  ${unitEconomics.cac.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Inversión estimada por cada nuevo cliente incorporado.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs font-bold text-slate-800 block">Índice de Eficiencia (Regla del 40)</span>
                <p className={`text-2xl font-bold font-mono mt-1 ${unitEconomics.ruleOf40Score >= 40 ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {unitEconomics.ruleOf40Score.toFixed(1)}%
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Suma de % Crecimiento + % Margen EBITDA (Meta óptima &gt; 40%).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 5: MÁRGENES & PUNTO DE EQUILIBRIO */}
      {activeTab === 'margins' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                Estructura de Márgenes & Punto de Equilibrio (Break-Even)
              </h4>
              <p className="text-xs text-slate-500">
                Análisis de cobertura de costos fijos y nivel de ventas requerido
              </p>
            </div>

            {/* PUNTO DE EQUILIBRIO CARD */}
            <div className="bg-slate-900 text-white p-4 rounded-xl mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Ventas para Punto de Equilibrio
                  </span>
                  <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    ${breakEven.ventasPuntoEquilibrio.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Monto de ventas mínimo para no registrar pérdidas.
                  </p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Cobertura Actual de Ventas
                  </span>
                  <p className="text-2xl font-bold font-mono text-indigo-300 mt-1">
                    {breakEven.coberturaActualPct.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Porcentaje alcanzado respecto al punto de equilibrio.
                  </p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Superávit / Déficit Operacional
                  </span>
                  <p className={`text-2xl font-bold font-mono mt-1 ${breakEven.superavitDeficit >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    ${breakEven.superavitDeficit.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Colchón de seguridad sobre punto de equilibrio.
                  </p>
                </div>
              </div>
            </div>

            {/* GRÁFICO EVOLUCIÓN MÁRGENES % */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(val) => `${val}%`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: any) => [`${Number(val).toFixed(1)}%`, '']} />
                  <Legend />
                  <Line type="monotone" dataKey="margenBrutoPct" name="Margen Bruto (%)" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="margenNetoPct" name="Margen Neto (%)" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
