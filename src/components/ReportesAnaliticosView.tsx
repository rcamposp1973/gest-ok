import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  Company,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  CostCenterMaster,
  ExpenseItemMaster,
  ProjectMaster,
  ProductService,
  Auxiliary,
  RCVDocument,
  FiscalPeriodYear,
  CompanyBudget
} from '../types';
import { logAuditEvent } from '../utils/auditLogger';
import {
  BarChart3,
  TrendingUp,
  Sliders,
  Filter,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  Calendar,
  Layers,
  Sparkles,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Target,
  Users,
  Building2,
  FileSpreadsheet,
  HelpCircle,
  RefreshCw,
  Eye,
  X,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  Table as TableIcon
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
  Legend
} from 'recharts';

interface ReportesAnaliticosViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  costCenters: CostCenterMaster[];
  expenseItems: ExpenseItemMaster[];
  projects: ProjectMaster[];
  products: ProductService[];
  auxiliaries: Auxiliary[];
  rcvDocuments: RCVDocument[];
  customAnalysisItems?: any[];
  customAccountColumns?: string[];
  fiscalYears?: FiscalPeriodYear[];
  defaultYear?: number;
  isReadOnly?: boolean;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export default function ReportesAnaliticosView({
  studyId,
  company,
  accounts,
  vouchers,
  costCenters,
  expenseItems,
  projects,
  products,
  auxiliaries,
  rcvDocuments,
  customAnalysisItems = [],
  customAccountColumns = [],
  fiscalYears = [],
  defaultYear,
  isReadOnly = false
}: ReportesAnaliticosViewProps) {
  // --- SUB-PESTAÑA PRINCIPAL ---
  const [activeSubTab, setActiveSubTab] = useState<'MATRIZ' | 'VENTAS'>('MATRIZ');

  // --- FILTRO DE AÑO GLOBAL ---
  const currentYearNum = new Date().getFullYear();
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(currentYearNum);
    yearsSet.add(currentYearNum - 1);
    if (defaultYear) yearsSet.add(defaultYear);
    vouchers.forEach(v => {
      if (v.date) {
        const y = parseInt(v.date.slice(0, 4), 10);
        if (!isNaN(y)) yearsSet.add(y);
      } else if (v.period) {
        const y = parseInt(v.period.slice(0, 4), 10);
        if (!isNaN(y)) yearsSet.add(y);
      }
    });
    rcvDocuments.forEach(d => {
      const p = d.period || d.fechaEmision;
      if (p) {
        const y = parseInt(p.slice(0, 4), 10);
        if (!isNaN(y)) yearsSet.add(y);
      }
    });
    fiscalYears.forEach(fy => {
      if (fy.year) yearsSet.add(fy.year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [vouchers, rcvDocuments, fiscalYears, currentYearNum, defaultYear]);

  const [selectedYear, setSelectedYear] = useState<number>(defaultYear || availableYears[0] || currentYearNum);

  useEffect(() => {
    if (defaultYear && defaultYear !== selectedYear) {
      setSelectedYear(defaultYear);
    }
  }, [defaultYear]);

  // =========================================================================
  // ESTADOS - MODO 1: MATRIZ DINÁMICA DE ANÁLISIS (PIVOT TABLE)
  // =========================================================================
  type RowDimension = 'costCenter' | 'expenseItem' | 'account' | 'auxiliary' | 'project' | 'product';
  type SubRowDimension = 'none' | 'costCenter' | 'expenseItem' | 'account' | 'auxiliary' | 'project';
  type ColumnDimension = 'months' | 'costCenters' | 'accountingSummary';
  type MetricType = 'netExpense' | 'debit' | 'credit' | 'netBalance';
  type AccountFilter = 'GASTOS' | 'INGRESOS' | 'BALANCE' | 'ALL';

  const [rowDimension, setRowDimension] = useState<RowDimension>('costCenter');
  const [subRowDimension, setSubRowDimension] = useState<SubRowDimension>('expenseItem');
  const [columnDimension, setColumnDimension] = useState<ColumnDimension>('months');
  const [metricType, setMetricType] = useState<MetricType>('netExpense');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('GASTOS');
  
  // Filtros finos
  const [selectedCostCenterFilter, setSelectedCostCenterFilter] = useState<string>('ALL');
  const [selectedExpenseItemFilter, setSelectedExpenseItemFilter] = useState<string>('ALL');
  const [matrixSearchTerm, setMatrixSearchTerm] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // =========================================================================
  // ESTADOS - MODO 2: ANÁLISIS DINÁMICO DE VENTAS
  // =========================================================================
  type SalesCompareMode = 'PRIOR_YEAR' | 'BUDGET';
  type SalesDataSource = 'RCV_SII' | 'CONTABILIDAD' | 'CONSOLIDADO';

  const [salesCompareMode, setSalesCompareMode] = useState<SalesCompareMode>('PRIOR_YEAR');
  const [salesDataSource, setSalesDataSource] = useState<SalesDataSource>('RCV_SII');
  const [salesBreakdownTab, setSalesBreakdownTab] = useState<'CLIENTES' | 'CENTROS_COSTO' | 'DTE_TIPO'>('CLIENTES');
  const [salesSearchTerm, setSalesSearchTerm] = useState<string>('');

  // Presupuestos de Ventas (Budget)
  const [salesBudget, setSalesBudget] = useState<CompanyBudget | null>(null);
  const [loadingBudget, setLoadingBudget] = useState<boolean>(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState<boolean>(false);
  const [budgetFormMonths, setBudgetFormMonths] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0
  });
  const [budgetAnnualTargetInput, setBudgetAnnualTargetInput] = useState<string>('');
  const [savingBudget, setSavingBudget] = useState<boolean>(false);

  // Drill-down Modal
  const [drillDownData, setDrillDownData] = useState<{
    title: string;
    subtitle: string;
    lines: {
      voucherId: string;
      voucherNumber: number;
      voucherDate: string;
      voucherType: string;
      accountCode: string;
      accountName: string;
      auxiliaryName?: string;
      costCenter?: string;
      expenseItem?: string;
      gloss: string;
      debit: number;
      credit: number;
      netAmount: number;
    }[];
    totalNet: number;
  } | null>(null);

  // =========================================================================
  // EFECTO: CARGAR PRESUPUESTO DE VENTAS DE FIRESTORE
  // =========================================================================
  const fetchBudget = useCallback(async () => {
    if (!studyId || !company.id) return;
    setLoadingBudget(true);
    try {
      const budgetDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'budgets', `budget_ventas_${selectedYear}`);
      const snap = await getDoc(budgetDocRef);
      if (snap.exists()) {
        const data = snap.data() as CompanyBudget;
        setSalesBudget(data);
        if (data.monthlyBudget) {
          setBudgetFormMonths(data.monthlyBudget);
        }
      } else {
        setSalesBudget(null);
        // Inicializar por defecto vacío o proporcional
        const emptyMonths: Record<number, number> = {};
        for (let m = 1; m <= 12; m++) emptyMonths[m] = 0;
        setBudgetFormMonths(emptyMonths);
      }
    } catch (err) {
      console.error("Error al cargar presupuesto:", err);
    } finally {
      setLoadingBudget(false);
    }
  }, [studyId, company.id, selectedYear]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  // =========================================================================
  // DICCIONARIOS DE RESOLUCIÓN DE IDENTIDADES ANALÍTICAS
  // =========================================================================
  const accountsMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      map.set(a.id, a);
      map.set(a.code, a);
    });
    return map;
  }, [accounts]);

  const costCentersMap = useMemo(() => {
    const map = new Map<string, CostCenterMaster>();
    costCenters.forEach(cc => {
      map.set(cc.id, cc);
      map.set(cc.code, cc);
      map.set(cc.name.toLowerCase().trim(), cc);
    });
    return map;
  }, [costCenters]);

  const expenseItemsMap = useMemo(() => {
    const map = new Map<string, ExpenseItemMaster>();
    expenseItems.forEach(ei => {
      map.set(ei.id, ei);
      map.set(ei.code, ei);
      map.set(ei.name.toLowerCase().trim(), ei);
    });
    return map;
  }, [expenseItems]);

  const projectsMap = useMemo(() => {
    const map = new Map<string, ProjectMaster>();
    projects.forEach(p => {
      map.set(p.id, p);
      map.set(p.code, p);
    });
    return map;
  }, [projects]);

  const productsMap = useMemo(() => {
    const map = new Map<string, ProductService>();
    products.forEach(p => {
      map.set(p.id, p);
      map.set(p.code, p);
    });
    return map;
  }, [products]);

  // Helpers de resolución
  const resolveCostCenterLabel = useCallback((val?: string): { code: string; name: string; full: string } => {
    if (!val || val === 'NONE' || val.trim() === '') return { code: 'S/CC', name: 'Sin Centro de Costo', full: '(Sin Centro de Costo)' };
    const raw = val.trim();
    const rawLower = raw.toLowerCase();
    let cc = costCentersMap.get(raw) || costCentersMap.get(rawLower);
    if (!cc) {
      cc = costCenters.find(c =>
        c.id === raw ||
        c.code.toLowerCase() === rawLower ||
        c.name.toLowerCase() === rawLower ||
        rawLower.startsWith(c.code.toLowerCase()) ||
        rawLower.includes(c.code.toLowerCase()) ||
        c.name.toLowerCase().includes(rawLower) ||
        rawLower.includes(c.name.toLowerCase())
      );
    }
    if (cc) return { code: cc.code, name: cc.name, full: `${cc.code} - ${cc.name}` };
    return { code: raw, name: raw, full: raw };
  }, [costCentersMap, costCenters]);

  const resolveExpenseItemLabel = useCallback((val?: string): { code: string; name: string; full: string } => {
    if (!val || val === 'NONE' || val.trim() === '') return { code: 'S/IT', name: 'Sin Ítem de Gasto', full: '(Sin Ítem de Gasto)' };
    const raw = val.trim();
    const rawLower = raw.toLowerCase();
    let ei = expenseItemsMap.get(raw) || expenseItemsMap.get(rawLower);
    if (!ei) {
      ei = expenseItems.find(e =>
        e.id === raw ||
        e.code.toLowerCase() === rawLower ||
        e.name.toLowerCase() === rawLower ||
        rawLower.startsWith(e.code.toLowerCase()) ||
        rawLower.includes(e.code.toLowerCase()) ||
        e.name.toLowerCase().includes(rawLower) ||
        rawLower.includes(e.name.toLowerCase())
      );
    }
    if (ei) return { code: ei.code, name: ei.name, full: `${ei.code} - ${ei.name}` };
    return { code: raw, name: raw, full: raw };
  }, [expenseItemsMap, expenseItems]);

  const resolveAccountLabel = useCallback((accIdOrCode: string, lineAccName?: string): { code: string; name: string; full: string; type: string } => {
    const acc = accountsMap.get(accIdOrCode);
    if (acc) return { code: acc.code, name: acc.name, full: `${acc.code} - ${acc.name}`, type: acc.type };
    return { code: accIdOrCode, name: lineAccName || 'Cuenta Desconocida', full: `${accIdOrCode} - ${lineAccName || ''}`, type: 'Gasto' };
  }, [accountsMap]);

  // =========================================================================
  // NORMALIZACIÓN DE LÍNEAS CONTABLES (VOUCHERS) DEL AÑO
  // =========================================================================
  interface NormalizedVoucherLine {
    voucherId: string;
    voucherNumber: number;
    voucherDate: string;
    voucherType: string;
    month: number; // 1 - 12
    year: number;
    accountCode: string;
    accountName: string;
    accountClass: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO' | 'COSTO';
    debit: number;
    credit: number;
    netExpense: number; // Para gastos/costos: Debe - Haber
    netBalance: number;
    costCenterId: string;
    costCenterLabel: string;
    expenseItemId: string;
    expenseItemLabel: string;
    auxiliaryRut: string;
    auxiliaryName: string;
    auxiliaryLabel: string;
    projectId: string;
    projectLabel: string;
    productId: string;
    productLabel: string;
    gloss: string;
  }

  const normalizedLines = useMemo<NormalizedVoucherLine[]>(() => {
    const list: NormalizedVoucherLine[] = [];

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      if (!v.date && !v.period) return;

      // Safe date parsing without timezone shift bugs
      let y = selectedYear;
      let month = 1;
      if (v.date) {
        const parts = v.date.split('-');
        y = parseInt(parts[0], 10);
        month = parts.length > 1 ? parseInt(parts[1], 10) : 1;
      } else if (v.period) {
        y = parseInt(v.period.slice(0, 4), 10);
        month = parseInt(v.period.slice(5, 7), 10) || 1;
      }

      if (isNaN(y) || y !== selectedYear) return;
      if (isNaN(month) || month < 1 || month > 12) month = 1;

      (v.lines || []).forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        const accInfo = resolveAccountLabel(l.accountId || l.accountCode, l.accountName);

        // Robust Account Classification
        const normType = (accInfo.type || '').toLowerCase();
        const normName = (accInfo.name || '').toLowerCase();
        const codeStr = (accInfo.code || '').trim();
        const firstDigit = codeStr.charAt(0);

        let accClass: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO' | 'COSTO' = 'GASTO';

        if (normType.includes('activo') || firstDigit === '1') {
          accClass = 'ACTIVO';
        } else if (normType.includes('pasivo') || (firstDigit === '2' && !codeStr.startsWith('23') && !codeStr.startsWith('2.3') && !codeStr.startsWith('2-3'))) {
          accClass = 'PASIVO';
        } else if (normType.includes('patrimonio') || normType.includes('capital') || codeStr.startsWith('23') || codeStr.startsWith('2.3') || codeStr.startsWith('2-3') || (firstDigit === '3' && !normType.includes('ingreso') && !normName.includes('venta'))) {
          accClass = 'PATRIMONIO';
        } else if (normType.includes('costo') || normName.includes('costo') || firstDigit === '6') {
          accClass = 'COSTO';
        } else if (normType.includes('ingreso') || normType.includes('ganancia') || normName.includes('venta') || firstDigit === '5' || (firstDigit === '3' && (normType.includes('ingreso') || normName.includes('venta') || normName.includes('ganancia')))) {
          accClass = 'INGRESO';
        } else if (normType.includes('gasto') || normType.includes('perdida') || normType.includes('pérdida') || firstDigit === '4') {
          accClass = 'GASTO';
        } else {
          // Fallback
          if (firstDigit === '4' || firstDigit === '5') {
            if (normName.includes('ingreso') || normName.includes('venta') || normName.includes('ganancia')) {
              accClass = 'INGRESO';
            } else {
              accClass = 'GASTO';
            }
          } else if (firstDigit === '3') {
            accClass = 'INGRESO';
          }
        }

        const ccInfo = resolveCostCenterLabel(l.costCenter);
        const eiInfo = resolveExpenseItemLabel(l.expenseItem);
        const pInfo = l.project ? (projectsMap.get(l.project)?.name ? `${projectsMap.get(l.project)!.code} - ${projectsMap.get(l.project)!.name}` : l.project) : '(Sin Proyecto)';
        const prodInfo = l.product ? (productsMap.get(l.product)?.name ? `${productsMap.get(l.product)!.code} - ${productsMap.get(l.product)!.name}` : l.product) : '(Sin Producto)';
        const auxLabel = l.auxiliaryRut ? `${l.auxiliaryRut} ${l.auxiliaryName ? '- ' + l.auxiliaryName : ''}` : '(Sin Auxiliar)';

        list.push({
          voucherId: v.id,
          voucherNumber: v.voucherNumber,
          voucherDate: v.date || `${selectedYear}-01-01`,
          voucherType: v.type,
          month,
          year: y,
          accountCode: accInfo.code,
          accountName: accInfo.name,
          accountClass: accClass,
          debit,
          credit,
          netExpense: debit - credit,
          netBalance: ['ACTIVO', 'GASTO', 'COSTO'].includes(accClass) ? debit - credit : credit - debit,
          costCenterId: ccInfo.code,
          costCenterLabel: ccInfo.full,
          expenseItemId: eiInfo.code,
          expenseItemLabel: eiInfo.full,
          auxiliaryRut: l.auxiliaryRut || '',
          auxiliaryName: l.auxiliaryName || '',
          auxiliaryLabel: auxLabel,
          projectId: l.project || '',
          projectLabel: pInfo,
          productId: l.product || '',
          productLabel: prodInfo,
          gloss: l.gloss || v.gloss || ''
        });
      });
    });

    return list;
  }, [vouchers, selectedYear, resolveAccountLabel, resolveCostCenterLabel, resolveExpenseItemLabel, projectsMap, productsMap]);

  // =========================================================================
  // MOTOR DE CÁLCULO DE LA MATRIZ DINÁMICA (PIVOT TABLE)
  // =========================================================================
  const filteredLines = useMemo(() => {
    return normalizedLines.filter(line => {
      // Filtro de tipo de cuenta
      if (accountFilter === 'GASTOS') {
        const isExpense = ['GASTO', 'COSTO'].includes(line.accountClass) || line.accountCode.startsWith('4') || line.accountCode.startsWith('5') || line.accountCode.startsWith('6');
        if (!isExpense) return false;
      } else if (accountFilter === 'INGRESOS') {
        const isIncome = line.accountClass === 'INGRESO' || line.accountCode.startsWith('3') || line.accountCode.startsWith('5');
        if (!isIncome) return false;
      } else if (accountFilter === 'BALANCE') {
        if (!['ACTIVO', 'PASIVO', 'PATRIMONIO'].includes(line.accountClass)) return false;
      }

      // Filtro de Centro de Costo específico
      if (selectedCostCenterFilter !== 'ALL') {
        const targetCC = selectedCostCenterFilter.toLowerCase().trim();
        const matches =
          line.costCenterId.toLowerCase().trim() === targetCC ||
          line.costCenterLabel.toLowerCase().trim() === targetCC ||
          line.costCenterLabel.toLowerCase().includes(targetCC) ||
          line.costCenterId.toLowerCase().includes(targetCC);
        if (!matches) return false;
      }

      // Filtro de Ítem de Gasto específico
      if (selectedExpenseItemFilter !== 'ALL') {
        const targetEI = selectedExpenseItemFilter.toLowerCase().trim();
        const matches =
          line.expenseItemId.toLowerCase().trim() === targetEI ||
          line.expenseItemLabel.toLowerCase().trim() === targetEI ||
          line.expenseItemLabel.toLowerCase().includes(targetEI) ||
          line.expenseItemId.toLowerCase().includes(targetEI);
        if (!matches) return false;
      }

      return true;
    });
  }, [normalizedLines, accountFilter, selectedCostCenterFilter, selectedExpenseItemFilter]);

  // Helper para obtener la clave de dimensión
  const getDimensionValue = useCallback((line: NormalizedVoucherLine, dim: RowDimension): { key: string; label: string } => {
    switch (dim) {
      case 'costCenter':
        return { key: line.costCenterId || 'NONE', label: line.costCenterLabel };
      case 'expenseItem':
        return { key: line.expenseItemId || 'NONE', label: line.expenseItemLabel };
      case 'account':
        return { key: line.accountCode, label: `${line.accountCode} - ${line.accountName}` };
      case 'auxiliary':
        return { key: line.auxiliaryRut || 'NONE', label: line.auxiliaryLabel };
      case 'project':
        return { key: line.projectId || 'NONE', label: line.projectLabel };
      case 'product':
        return { key: line.productId || 'NONE', label: line.productLabel };
      default:
        return { key: 'ALL', label: 'Todos' };
    }
  }, []);

  const getMetricValue = useCallback((line: NormalizedVoucherLine): number => {
    switch (metricType) {
      case 'netExpense': return line.netExpense;
      case 'debit': return line.debit;
      case 'credit': return line.credit;
      case 'netBalance': return line.netBalance;
      default: return line.netExpense;
    }
  }, [metricType]);

  // Estructura de filas de la matriz
  interface MatrixRowSubItem {
    subKey: string;
    subLabel: string;
    monthValues: Record<number, number>; // 1-12
    costCenterValues: Record<string, number>;
    totalDebe: number;
    totalHaber: number;
    totalRow: number;
    lines: NormalizedVoucherLine[];
  }

  interface MatrixRowItem {
    rowKey: string;
    rowLabel: string;
    monthValues: Record<number, number>; // 1-12
    costCenterValues: Record<string, number>;
    totalDebe: number;
    totalHaber: number;
    totalRow: number;
    percentage: number;
    subItems: MatrixRowSubItem[];
    lines: NormalizedVoucherLine[];
  }

  // Lista de Centros de Costo activos para columnas
  const activeCostCenterColumns = useMemo(() => {
    if (costCenters.length > 0) {
      return costCenters.map(cc => ({ id: cc.code || cc.id, label: `${cc.code} ${cc.name}` }));
    }
    return [{ id: 'S/CC', label: 'Sin Centro de Costo' }];
  }, [costCenters]);

  const matrixData = useMemo(() => {
    const rowMap = new Map<string, MatrixRowItem>();
    let grandTotal = 0;

    filteredLines.forEach(line => {
      const mainDim = getDimensionValue(line, rowDimension);
      const val = getMetricValue(line);

      if (!rowMap.has(mainDim.key)) {
        const initMonths: Record<number, number> = {};
        for (let m = 1; m <= 12; m++) initMonths[m] = 0;
        const initCCs: Record<string, number> = {};
        activeCostCenterColumns.forEach(cc => { initCCs[cc.id] = 0; });

        rowMap.set(mainDim.key, {
          rowKey: mainDim.key,
          rowLabel: mainDim.label,
          monthValues: initMonths,
          costCenterValues: initCCs,
          totalDebe: 0,
          totalHaber: 0,
          totalRow: 0,
          percentage: 0,
          subItems: [],
          lines: []
        });
      }

      const row = rowMap.get(mainDim.key)!;
      row.lines.push(line);
      row.monthValues[line.month] = (row.monthValues[line.month] || 0) + val;
      row.costCenterValues[line.costCenterId] = (row.costCenterValues[line.costCenterId] || 0) + val;
      row.totalDebe += line.debit;
      row.totalHaber += line.credit;
      row.totalRow += val;
      grandTotal += val;

      // Sub-agrupación si está habilitada
      if (subRowDimension !== 'none' && subRowDimension !== (rowDimension as unknown as SubRowDimension)) {
        const subDim = getDimensionValue(line, subRowDimension as RowDimension);
        let subItem = row.subItems.find(s => s.subKey === subDim.key);
        if (!subItem) {
          const initSubMonths: Record<number, number> = {};
          for (let m = 1; m <= 12; m++) initSubMonths[m] = 0;
          const initSubCCs: Record<string, number> = {};
          activeCostCenterColumns.forEach(cc => { initSubCCs[cc.id] = 0; });

          subItem = {
            subKey: subDim.key,
            subLabel: subDim.label,
            monthValues: initSubMonths,
            costCenterValues: initSubCCs,
            totalDebe: 0,
            totalHaber: 0,
            totalRow: 0,
            lines: []
          };
          row.subItems.push(subItem);
        }

        subItem.lines.push(line);
        subItem.monthValues[line.month] = (subItem.monthValues[line.month] || 0) + val;
        subItem.costCenterValues[line.costCenterId] = (subItem.costCenterValues[line.costCenterId] || 0) + val;
        subItem.totalDebe += line.debit;
        subItem.totalHaber += line.credit;
        subItem.totalRow += val;
      }
    });

    const rows = Array.from(rowMap.values());

    // Calcular porcentajes y ordenar descendente por totalRow
    rows.forEach(r => {
      r.percentage = grandTotal !== 0 ? (r.totalRow / grandTotal) * 100 : 0;
      r.subItems.sort((a, b) => Math.abs(b.totalRow) - Math.abs(a.totalRow));
    });

    // Filtro por búsqueda de texto
    const filteredRows = matrixSearchTerm.trim() === ''
      ? rows
      : rows.filter(r => 
          r.rowLabel.toLowerCase().includes(matrixSearchTerm.toLowerCase()) ||
          r.subItems.some(s => s.subLabel.toLowerCase().includes(matrixSearchTerm.toLowerCase()))
        );

    filteredRows.sort((a, b) => Math.abs(b.totalRow) - Math.abs(a.totalRow));

    // Totales de pie de tabla
    const colTotals: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) colTotals[m] = 0;
    const ccTotals: Record<string, number> = {};
    activeCostCenterColumns.forEach(cc => { ccTotals[cc.id] = 0; });
    let totalDebeGlobal = 0;
    let totalHaberGlobal = 0;

    filteredRows.forEach(r => {
      for (let m = 1; m <= 12; m++) {
        colTotals[m] += r.monthValues[m] || 0;
      }
      activeCostCenterColumns.forEach(cc => {
        ccTotals[cc.id] += r.costCenterValues[cc.id] || 0;
      });
      totalDebeGlobal += r.totalDebe;
      totalHaberGlobal += r.totalHaber;
    });

    return {
      rows: filteredRows,
      grandTotal,
      colTotals,
      ccTotals,
      totalDebeGlobal,
      totalHaberGlobal
    };
  }, [
    filteredLines,
    rowDimension,
    subRowDimension,
    getDimensionValue,
    getMetricValue,
    activeCostCenterColumns,
    matrixSearchTerm
  ]);

  // Expandir / Colapsar todos
  const toggleExpandAll = () => {
    if (Object.keys(expandedRows).length > 0) {
      setExpandedRows({});
    } else {
      const all: Record<string, boolean> = {};
      matrixData.rows.forEach(r => { all[r.rowKey] = true; });
      setExpandedRows(all);
    }
  };

  const toggleExpandRow = (key: string) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Presets rápidos de 1-clic
  const applyPreset = (presetName: string) => {
    if (presetName === 'CC_VS_MES') {
      setRowDimension('costCenter');
      setSubRowDimension('none');
      setColumnDimension('months');
      setMetricType('netExpense');
      setAccountFilter('GASTOS');
    } else if (presetName === 'CC_VS_ITEM') {
      setRowDimension('costCenter');
      setSubRowDimension('expenseItem');
      setColumnDimension('months');
      setMetricType('netExpense');
      setAccountFilter('GASTOS');
    } else if (presetName === 'ITEM_VS_MES') {
      setRowDimension('expenseItem');
      setSubRowDimension('none');
      setColumnDimension('months');
      setMetricType('netExpense');
      setAccountFilter('GASTOS');
    } else if (presetName === 'CUENTAS_VS_AUXILIAR') {
      setRowDimension('account');
      setSubRowDimension('auxiliary');
      setColumnDimension('months');
      setMetricType('netExpense');
      setAccountFilter('GASTOS');
    } else if (presetName === 'PROYECTOS_VS_MES') {
      setRowDimension('project');
      setSubRowDimension('none');
      setColumnDimension('months');
      setMetricType('netExpense');
      setAccountFilter('GASTOS');
    }
  };

  // Drill-down al hacer clic en una celda
  const handleOpenDrillDown = (title: string, subtitle: string, lines: NormalizedVoucherLine[]) => {
    const list = lines.map(l => ({
      voucherId: l.voucherId,
      voucherNumber: l.voucherNumber,
      voucherDate: l.voucherDate,
      voucherType: l.voucherType,
      accountCode: l.accountCode,
      accountName: l.accountName,
      auxiliaryName: l.auxiliaryName,
      costCenter: l.costCenterLabel,
      expenseItem: l.expenseItemLabel,
      gloss: l.gloss,
      debit: l.debit,
      credit: l.credit,
      netAmount: getMetricValue(l)
    }));

    const total = list.reduce((acc, x) => acc + x.netAmount, 0);
    setDrillDownData({
      title,
      subtitle,
      lines: list,
      totalNet: total
    });
  };

  // =========================================================================
  // MOTOR DE CÁLCULO DE VENTAS (INTELIGENCIA COMERCIAL & COMPARATIVAS)
  // =========================================================================
  const salesAnalysisData = useMemo(() => {
    // 1. Extraer ventas del año actual y año anterior
    const actualMonthlySales: Record<number, number> = {};
    const priorMonthlySales: Record<number, number> = {};
    const actualMonthlyCount: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      actualMonthlySales[m] = 0;
      priorMonthlySales[m] = 0;
      actualMonthlyCount[m] = 0;
    }

    // Clientes breakdown
    const clientMap = new Map<string, {
      rut: string;
      name: string;
      netAmount: number;
      ivaAmount: number;
      totalAmount: number;
      docCount: number;
      lastDate: string;
    }>();

    // DTE Type breakdown
    const dteTypeMap = new Map<string, {
      code: string;
      name: string;
      netAmount: number;
      docCount: number;
    }>();

    // Centro de Costo breakdown en Ventas
    const salesCCMap = new Map<string, {
      code: string;
      name: string;
      netAmount: number;
    }>();

    // Procesar documentos RCV Ventas si la fuente incluye RCV_SII
    if (salesDataSource === 'RCV_SII' || salesDataSource === 'CONSOLIDADO') {
      rcvDocuments.forEach(doc => {
        if (doc.tipoRegistro !== 'Venta') return;
        const dateStr = doc.fechaEmision || doc.date || (doc.period ? `${doc.period}-01` : '');
        if (!dateStr) return;
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;

        // Factores de signo: Nota de Crédito (61) resta
        const isNC = doc.tipoDoc === '61' || (doc.tipoDocumento && doc.tipoDocumento.includes('61'));
        const factor = isNC ? -1 : 1;
        const netVal = (Number(doc.montoNeto) || 0) * factor;
        const ivaVal = (Number(doc.montoIva) || 0) * factor;
        const totVal = (Number(doc.montoTotal) || 0) * factor;

        if (y === selectedYear) {
          actualMonthlySales[m] += netVal;
          actualMonthlyCount[m] += factor; // si es NC resta 1

          // Cliente
          const clientRut = doc.rutReceptor || doc.rutEmisor || 'S/RUT';
          const clientName = doc.razonSocialReceptor || doc.razonSocialEmisor || 'Cliente General';
          if (!clientMap.has(clientRut)) {
            clientMap.set(clientRut, {
              rut: clientRut,
              name: clientName,
              netAmount: 0,
              ivaAmount: 0,
              totalAmount: 0,
              docCount: 0,
              lastDate: dateStr
            });
          }
          const c = clientMap.get(clientRut)!;
          c.netAmount += netVal;
          c.ivaAmount += ivaVal;
          c.totalAmount += totVal;
          c.docCount += 1;
          if (dateStr > c.lastDate) c.lastDate = dateStr;

          // Tipo DTE
          const dteCode = doc.tipoDoc || '33';
          let dteName = 'Factura Electrónica (33)';
          if (dteCode === '34') dteName = 'Factura Exenta (34)';
          else if (dteCode === '39') dteName = 'Boleta Electrónica (39)';
          else if (dteCode === '41') dteName = 'Boleta Exenta (41)';
          else if (dteCode === '56') dteName = 'Nota de Débito (56)';
          else if (dteCode === '61') dteName = 'Nota de Crédito (61)';
          else if (dteCode === '110') dteName = 'Factura Exportación (110)';

          if (!dteTypeMap.has(dteCode)) {
            dteTypeMap.set(dteCode, { code: dteCode, name: dteName, netAmount: 0, docCount: 0 });
          }
          const dt = dteTypeMap.get(dteCode)!;
          dt.netAmount += netVal;
          dt.docCount += 1;
        } else if (y === selectedYear - 1) {
          priorMonthlySales[m] += netVal;
        }
      });
    }

    // Procesar Contabilidad (Cuentas de Ingresos / Asientos) si corresponde
    if (salesDataSource === 'CONTABILIDAD') {
      vouchers.forEach(v => {
        if (v.status === 'Anulado') return;
        if (!v.date) return;
        const d = new Date(v.date);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;

        (v.lines || []).forEach(l => {
          const accInfo = resolveAccountLabel(l.accountId || l.accountCode);
          if (accInfo.code.startsWith('4')) { // Cuenta de Ingreso
            const netIncome = (Number(l.credit) || 0) - (Number(l.debit) || 0); // Ingresos aumentan al Haber
            if (y === selectedYear) {
              actualMonthlySales[m] += netIncome;
              actualMonthlyCount[m] += 1;

              // Centros de costo en ventas
              const ccInfo = resolveCostCenterLabel(l.costCenter);
              if (!salesCCMap.has(ccInfo.code)) {
                salesCCMap.set(ccInfo.code, { code: ccInfo.code, name: ccInfo.name, netAmount: 0 });
              }
              salesCCMap.get(ccInfo.code)!.netAmount += netIncome;
            } else if (y === selectedYear - 1) {
              priorMonthlySales[m] += netIncome;
            }
          }
        });
      });
    }

    // 2. Construir matriz mensual comparativa
    let cumActual = 0;
    let cumPrior = 0;
    let cumBudget = 0;

    const monthlyTable = [];
    const chartData = [];

    const budgetMap = salesBudget?.monthlyBudget || {};

    let totalActualYear = 0;
    let totalPriorYear = 0;
    let totalBudgetYear = 0;
    let totalDocsYear = 0;

    for (let m = 1; m <= 12; m++) {
      const act = actualMonthlySales[m] || 0;
      const prior = priorMonthlySales[m] || 0;
      const bud = budgetMap[m] || 0;
      const docsCount = actualMonthlyCount[m] || 0;

      cumActual += act;
      cumPrior += prior;
      cumBudget += bud;

      totalActualYear += act;
      totalPriorYear += prior;
      totalBudgetYear += bud;
      totalDocsYear += docsCount;

      // Comparativa seleccionada
      const compValue = salesCompareMode === 'PRIOR_YEAR' ? prior : bud;
      const compCumValue = salesCompareMode === 'PRIOR_YEAR' ? cumPrior : cumBudget;

      const diffDollar = act - compValue;
      const diffPercent = compValue !== 0 ? ((act - compValue) / Math.abs(compValue)) * 100 : 0;
      const cumDiffPercent = compCumValue !== 0 ? ((cumActual - compCumValue) / Math.abs(compCumValue)) * 100 : 0;
      const budgetFulfillment = bud !== 0 ? (act / bud) * 100 : 0;

      monthlyTable.push({
        monthNumber: m,
        monthName: MONTH_NAMES[m - 1],
        monthShort: MONTH_SHORT[m - 1],
        actualSales: act,
        priorSales: prior,
        budgetSales: bud,
        compValue,
        diffDollar,
        diffPercent,
        cumActual,
        cumPrior,
        cumBudget,
        cumDiffPercent,
        budgetFulfillment,
        docsCount
      });

      chartData.push({
        name: MONTH_SHORT[m - 1],
        'Año Actual': act,
        [salesCompareMode === 'PRIOR_YEAR' ? 'Año Anterior' : 'Presupuesto']: compValue,
        'Venta Acumulada': cumActual
      });
    }

    // Totales anuales y KPIs
    const annualDiffDollar = totalActualYear - (salesCompareMode === 'PRIOR_YEAR' ? totalPriorYear : totalBudgetYear);
    const annualDiffPercent = (salesCompareMode === 'PRIOR_YEAR' ? totalPriorYear : totalBudgetYear) !== 0
      ? (annualDiffDollar / Math.abs(salesCompareMode === 'PRIOR_YEAR' ? totalPriorYear : totalBudgetYear)) * 100
      : 0;

    const annualBudgetFulfillment = totalBudgetYear !== 0 ? (totalActualYear / totalBudgetYear) * 100 : 0;
    const avgMonthlySales = totalActualYear / 12;
    const avgTicket = totalDocsYear > 0 ? totalActualYear / totalDocsYear : 0;

    // Clientes ordenados por monto neto
    const clientsList = Array.from(clientMap.values())
      .sort((a, b) => b.netAmount - a.netAmount)
      .map(c => ({
        ...c,
        percentage: totalActualYear > 0 ? (c.netAmount / totalActualYear) * 100 : 0
      }));

    // DTE Types ordenados
    const dteTypesList = Array.from(dteTypeMap.values())
      .sort((a, b) => b.netAmount - a.netAmount);

    // CC en Ventas
    const salesCCList = Array.from(salesCCMap.values())
      .sort((a, b) => b.netAmount - a.netAmount);

    return {
      monthlyTable,
      chartData,
      totalActualYear,
      totalPriorYear,
      totalBudgetYear,
      totalDocsYear,
      annualDiffDollar,
      annualDiffPercent,
      annualBudgetFulfillment,
      avgMonthlySales,
      avgTicket,
      clientsList,
      dteTypesList,
      salesCCList
    };
  }, [
    rcvDocuments,
    vouchers,
    selectedYear,
    salesDataSource,
    salesCompareMode,
    salesBudget,
    resolveAccountLabel,
    resolveCostCenterLabel
  ]);

  // =========================================================================
  // GUARDAR PRESUPUESTO EN FIRESTORE
  // =========================================================================
  const handleSaveBudget = async () => {
    if (!studyId || !company.id) return;
    setSavingBudget(true);
    try {
      let annual = 0;
      for (let m = 1; m <= 12; m++) {
        annual += Number(budgetFormMonths[m]) || 0;
      }

      const budgetDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'budgets', `budget_ventas_${selectedYear}`);
      const payload: CompanyBudget = {
        id: `budget_ventas_${selectedYear}`,
        companyId: company.id,
        year: selectedYear,
        type: 'VENTAS',
        monthlyBudget: budgetFormMonths,
        annualBudget: annual,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || 'user'
      };

      await setDoc(budgetDocRef, payload, { merge: true });
      setSalesBudget(payload);
      setIsBudgetModalOpen(false);

      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'CREAR',
        module: 'PRESUPUESTOS',
        details: `Configurado Presupuesto Anual de Ventas para el año ${selectedYear} por un total de $${annual.toLocaleString('es-CL')}`
      });
    } catch (err) {
      console.error("Error al guardar presupuesto:", err);
    } finally {
      setSavingBudget(false);
    }
  };

  // Helper: Distribuir meta anual pareja
  const handleDistributeAnnualTarget = () => {
    const total = parseFloat(budgetAnnualTargetInput.replace(/[^0-9]/g, ''));
    if (isNaN(total) || total <= 0) return;
    const perMonth = Math.round(total / 12);
    const newMonths: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) newMonths[m] = perMonth;
    setBudgetFormMonths(newMonths);
  };

  // Helper: Generar presupuesto con base en año anterior + %
  const handleApplyGrowthOnPriorYear = (growthPercent: number) => {
    const newMonths: Record<number, number> = {};
    salesAnalysisData.monthlyTable.forEach(row => {
      const prior = row.priorSales;
      const target = Math.round(prior * (1 + growthPercent / 100));
      newMonths[row.monthNumber] = Math.max(0, target);
    });
    setBudgetFormMonths(newMonths);
  };

  // =========================================================================
  // EXPORTACIONES A CSV / EXCEL
  // =========================================================================
  const exportMatrixToCSV = () => {
    let headers: string[] = [];
    if (columnDimension === 'months') {
      headers = ['Agrupación Principal', 'Sub-Desglose', ...MONTH_SHORT, 'Total Acumulado', '% Part.'];
    } else if (columnDimension === 'costCenters') {
      headers = ['Agrupación Principal', 'Sub-Desglose', ...activeCostCenterColumns.map(c => c.label), 'Total Acumulado', '% Part.'];
    } else {
      headers = ['Agrupación Principal', 'Sub-Desglose', 'Total Debe', 'Total Haber', 'Saldo Neto', '% Part.'];
    }

    const rows: string[][] = [];

    matrixData.rows.forEach(r => {
      if (r.subItems.length > 0) {
        r.subItems.forEach(sub => {
          let cols: (string | number)[] = [r.rowLabel, sub.subLabel];
          if (columnDimension === 'months') {
            for (let m = 1; m <= 12; m++) cols.push(Math.round(sub.monthValues[m] || 0));
            cols.push(Math.round(sub.totalRow));
            cols.push(`${((sub.totalRow / (matrixData.grandTotal || 1)) * 100).toFixed(1)}%`);
          } else if (columnDimension === 'costCenters') {
            activeCostCenterColumns.forEach(cc => cols.push(Math.round(sub.costCenterValues[cc.id] || 0)));
            cols.push(Math.round(sub.totalRow));
            cols.push(`${((sub.totalRow / (matrixData.grandTotal || 1)) * 100).toFixed(1)}%`);
          } else {
            cols.push(Math.round(sub.totalDebe));
            cols.push(Math.round(sub.totalHaber));
            cols.push(Math.round(sub.totalRow));
            cols.push(`${((sub.totalRow / (matrixData.grandTotal || 1)) * 100).toFixed(1)}%`);
          }
          rows.push(cols.map(c => `"${c}"`));
        });
      } else {
        let cols: (string | number)[] = [r.rowLabel, '-'];
        if (columnDimension === 'months') {
          for (let m = 1; m <= 12; m++) cols.push(Math.round(r.monthValues[m] || 0));
          cols.push(Math.round(r.totalRow));
          cols.push(`${r.percentage.toFixed(1)}%`);
        } else if (columnDimension === 'costCenters') {
          activeCostCenterColumns.forEach(cc => cols.push(Math.round(r.costCenterValues[cc.id] || 0)));
          cols.push(Math.round(r.totalRow));
          cols.push(`${r.percentage.toFixed(1)}%`);
        } else {
          cols.push(Math.round(r.totalDebe));
          cols.push(Math.round(r.totalHaber));
          cols.push(Math.round(r.totalRow));
          cols.push(`${r.percentage.toFixed(1)}%`);
        }
        rows.push(cols.map(c => `"${c}"`));
      }
    });

    const csvContent = '\uFEFF' + [
      `"REPORTE MATRIZ DINAMICA DE ANALISIS - ${company.name} (RUT: ${company.rut})"`,
      `"AÑO FISCAL: ${selectedYear} | GENERADO: ${new Date().toLocaleDateString('es-CL')}"`,
      '',
      headers.map(h => `"${h}"`).join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Matriz_Analisis_${company.rut}_${selectedYear}.csv`;
    link.click();
  };

  const exportSalesToCSV = () => {
    const headers = [
      'Mes', 'Venta Real', salesCompareMode === 'PRIOR_YEAR' ? 'Año Anterior' : 'Presupuesto',
      'Diferencia $', 'Variación %', 'Real Acumulado', 'Comparativa Acumulada', 'Cant. Docs'
    ];

    const rows = salesAnalysisData.monthlyTable.map(row => [
      `"${row.monthName}"`,
      Math.round(row.actualSales),
      Math.round(row.compValue),
      Math.round(row.diffDollar),
      `"${row.diffPercent.toFixed(1)}%"`,
      Math.round(row.cumActual),
      Math.round(salesCompareMode === 'PRIOR_YEAR' ? row.cumPrior : row.cumBudget),
      row.docsCount
    ].join(';'));

    const csvContent = '\uFEFF' + [
      `"REPORTE ANALISIS DINAMICO DE VENTAS - ${company.name} (RUT: ${company.rut})"`,
      `"AÑO FISCAL: ${selectedYear} | COMPARATIVA: ${salesCompareMode === 'PRIOR_YEAR' ? 'AÑO ANTERIOR' : 'PRESUPUESTO'}"`,
      '',
      headers.map(h => `"${h}"`).join(';'),
      ...rows
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisis_Ventas_${company.rut}_${selectedYear}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          ENCABEZADO PRINCIPAL DE LA VISTA
          ========================================================================= */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Reportes por Análisis & Inteligencia de Ventas
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                ERP BI Suite
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {company.name} ({company.rut}) • Matriz Multidimensional de Centros de Costos, Ítems de Gasto y Presupuestos
            </p>
          </div>
        </div>

        {/* SELECTOR DE AÑO Y BOTONES GLOBALES */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-3 py-1.5 border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">Año Fiscal:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-900 border-none outline-hidden cursor-pointer"
            >
              {availableYears.map(yr => (
                <option key={yr} value={yr}>Año {yr}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Imprimir reporte"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SELECTOR DE PESTAÑA: MATRIZ DINÁMICA VS ANÁLISIS DE VENTAS
          ========================================================================= */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('MATRIZ')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'MATRIZ'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <TableIcon className="w-4 h-4" />
          <span>Matriz Dinámica de Análisis (Pivot Contable)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-normal">
            Centros de Costo & Gastos
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('VENTAS')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'VENTAS'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Análisis Dinámico de Ventas</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
            Vs Año Anterior / Budget
          </span>
        </button>
      </div>

      {/* =========================================================================
          CONTENIDO: SUB-PESTAÑA 1 - MATRIZ DINÁMICA DE ANÁLISIS
          ========================================================================= */}
      {activeSubTab === 'MATRIZ' && (
        <div className="space-y-4">
          {/* BARRA DE CONFIGURACIÓN DINÁMICA (DIMENSIONES Y FILTROS) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Configuración de la Matriz Dinámica
                </span>
              </div>

              {/* PLANTILLAS RÁPIDAS (PRESETS) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-400 mr-1">Vistas Rápidas:</span>
                <button
                  onClick={() => applyPreset('CC_VS_MES')}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  🏢 Centros de Costo x Mes
                </button>
                <button
                  onClick={() => applyPreset('CC_VS_ITEM')}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  📑 CC vs Ítem de Gasto
                </button>
                <button
                  onClick={() => applyPreset('ITEM_VS_MES')}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  🏷️ Ítems de Gasto x Mes
                </button>
                <button
                  onClick={() => applyPreset('CUENTAS_VS_AUXILIAR')}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  👥 Cuentas x Auxiliar
                </button>
                <button
                  onClick={() => applyPreset('PROYECTOS_VS_MES')}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  🏗️ Proyectos
                </button>
              </div>
            </div>

            {/* SELECTORES DE MATRIZ: FILAS, SUB-FILAS, COLUMNAS, MÉTRICAS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs">
              {/* 1. Agrupación Principal (Filas) */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <span>1. Agrupar Filas por:</span>
                </label>
                <select
                  value={rowDimension}
                  onChange={(e) => setRowDimension(e.target.value as RowDimension)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 outline-hidden"
                >
                  <option value="costCenter">Centro de Costo</option>
                  <option value="expenseItem">Ítem de Gasto</option>
                  <option value="account">Cuenta Contable</option>
                  <option value="auxiliary">Auxiliar (RUT / Proveedor)</option>
                  <option value="project">Proyecto / Obra</option>
                  <option value="product">Producto / SKU</option>
                </select>
              </div>

              {/* 2. Sub-Desglose en Filas */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <span>2. Sub-Desglose (Nivel 2):</span>
                </label>
                <select
                  value={subRowDimension}
                  onChange={(e) => setSubRowDimension(e.target.value as SubRowDimension)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 outline-hidden"
                >
                  <option value="none">Sin Sub-desglose</option>
                  <option value="expenseItem">Ítem de Gasto</option>
                  <option value="costCenter">Centro de Costo</option>
                  <option value="account">Cuenta Contable</option>
                  <option value="auxiliary">Auxiliar / Proveedor</option>
                  <option value="project">Proyecto</option>
                </select>
              </div>

              {/* 3. Distribución de Columnas */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <span>3. Columnas:</span>
                </label>
                <select
                  value={columnDimension}
                  onChange={(e) => setColumnDimension(e.target.value as ColumnDimension)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 outline-hidden"
                >
                  <option value="months">Mensual (Ene - Dic + Acumulado)</option>
                  <option value="costCenters">Por Centro de Costo</option>
                  <option value="accountingSummary">Resumen (Debe, Haber, Saldo)</option>
                </select>
              </div>

              {/* 4. Métrica / Valor */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <span>4. Métrica:</span>
                </label>
                <select
                  value={metricType}
                  onChange={(e) => setMetricType(e.target.value as MetricType)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 outline-hidden"
                >
                  <option value="netExpense">Gasto / Costo Neto (Debe - Haber)</option>
                  <option value="debit">Solo Débitos (Debe)</option>
                  <option value="credit">Solo Créditos (Haber)</option>
                  <option value="netBalance">Saldo Contable</option>
                </select>
              </div>

              {/* 5. Filtro de Cuentas */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <span>5. Filtro Cuentas:</span>
                </label>
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value as AccountFilter)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 outline-hidden"
                >
                  <option value="GASTOS">Solo Gastos y Costos (Clases 4, 5 y 6)</option>
                  <option value="INGRESOS">Solo Ingresos (Clases 3, 4 y 5)</option>
                  <option value="BALANCE">Cuentas de Balance (1, 2, 3)</option>
                  <option value="ALL">Todas las Cuentas</option>
                </select>
              </div>
            </div>

            {/* FILTROS ADICIONALES Y BÚSQUEDA */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {/* Búsqueda rápida */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar en la matriz..."
                    value={matrixSearchTerm}
                    onChange={(e) => setMatrixSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-hidden w-56"
                  />
                  {matrixSearchTerm && (
                    <button
                      onClick={() => setMatrixSearchTerm('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filtro específico por Centro de Costo */}
                <select
                  value={selectedCostCenterFilter}
                  onChange={(e) => setSelectedCostCenterFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 outline-hidden font-medium"
                >
                  <option value="ALL">Todos los Centros de Costo</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.code}>{cc.code} - {cc.name}</option>
                  ))}
                </select>

                {/* Filtro específico por Ítem de Gasto */}
                <select
                  value={selectedExpenseItemFilter}
                  onChange={(e) => setSelectedExpenseItemFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 outline-hidden font-medium"
                >
                  <option value="ALL">Todos los Ítems de Gasto</option>
                  {expenseItems.map(ei => (
                    <option key={ei.id} value={ei.code}>{ei.code} - {ei.name}</option>
                  ))}
                </select>

                {/* Botón para restablecer todos los filtros */}
                {(selectedCostCenterFilter !== 'ALL' || selectedExpenseItemFilter !== 'ALL' || matrixSearchTerm !== '' || accountFilter !== 'GASTOS') && (
                  <button
                    onClick={() => {
                      setSelectedCostCenterFilter('ALL');
                      setSelectedExpenseItemFilter('ALL');
                      setMatrixSearchTerm('');
                      setAccountFilter('GASTOS');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
                    title="Restablecer filtros a valores predeterminados"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Restablecer Filtros</span>
                  </button>
                )}
              </div>

              {/* ACCIONES: EXPANDIR TODO Y EXPORTAR */}
              <div className="flex items-center gap-2">
                {subRowDimension !== 'none' && (
                  <button
                    onClick={toggleExpandAll}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    {Object.keys(expandedRows).length > 0 ? 'Colapsar Todo' : 'Expandir Todo'}
                  </button>
                )}

                <button
                  onClick={exportMatrixToCSV}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Exportar Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* TABLA PRINCIPAL DE LA MATRIZ DINÁMICA */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                {/* ENCABEZADOS DE COLUMNA */}
                <thead className="bg-slate-900 text-white sticky top-0 z-20">
                  <tr>
                    <th className="py-3 px-3.5 font-bold tracking-wider uppercase text-[11px] min-w-[240px] sticky left-0 bg-slate-900 z-30 border-r border-slate-800">
                      {rowDimension === 'costCenter' && 'Centro de Costo'}
                      {rowDimension === 'expenseItem' && 'Ítem de Gasto'}
                      {rowDimension === 'account' && 'Cuenta Contable'}
                      {rowDimension === 'auxiliary' && 'Auxiliar / Proveedor'}
                      {rowDimension === 'project' && 'Proyecto'}
                      {rowDimension === 'product' && 'Producto / SKU'}
                    </th>

                    {/* COLUMNAS MENSUALES */}
                    {columnDimension === 'months' && MONTH_SHORT.map((mShort, idx) => (
                      <th key={mShort} className="py-3 px-2.5 font-bold tracking-wider uppercase text-[11px] text-right min-w-[90px]">
                        {mShort}
                      </th>
                    ))}

                    {/* COLUMNAS POR CENTRO DE COSTO */}
                    {columnDimension === 'costCenters' && activeCostCenterColumns.map(cc => (
                      <th key={cc.id} className="py-3 px-2.5 font-bold tracking-wider uppercase text-[11px] text-right min-w-[120px]">
                        {cc.label}
                      </th>
                    ))}

                    {/* COLUMNAS DE RESUMEN CONTABLE */}
                    {columnDimension === 'accountingSummary' && (
                      <>
                        <th className="py-3 px-2.5 font-bold tracking-wider uppercase text-[11px] text-right min-w-[110px]">
                          Total Debe
                        </th>
                        <th className="py-3 px-2.5 font-bold tracking-wider uppercase text-[11px] text-right min-w-[110px]">
                          Total Haber
                        </th>
                      </>
                    )}

                    <th className="py-3 px-3 font-bold tracking-wider uppercase text-[11px] text-right min-w-[110px] bg-slate-800">
                      Total
                    </th>
                    <th className="py-3 px-2.5 font-bold tracking-wider uppercase text-[11px] text-right min-w-[70px] bg-slate-800">
                      % Part.
                    </th>
                  </tr>
                </thead>

                {/* CUERPO DE LA MATRIZ */}
                <tbody className="divide-y divide-slate-100">
                  {matrixData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="py-12 text-center text-slate-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold">No se encontraron movimientos para los filtros seleccionados en el año {selectedYear}.</p>
                        <p className="text-[11px] mt-1">Verifique la clase de cuenta o seleccione otro año o centro de costo.</p>
                      </td>
                    </tr>
                  ) : (
                    matrixData.rows.map((row) => {
                      const isExpanded = !!expandedRows[row.rowKey];
                      const hasSubItems = row.subItems.length > 0;

                      return (
                        <React.Fragment key={row.rowKey}>
                          {/* FILA PRINCIPAL (NIVEL 1) */}
                          <tr className={`hover:bg-slate-50/90 transition-colors ${hasSubItems ? 'bg-slate-50/40' : ''}`}>
                            {/* Celda del nombre de la fila principal */}
                            <td className="py-2 px-3.5 font-semibold text-slate-900 sticky left-0 bg-white border-r border-slate-200 z-10">
                              <div className="flex items-center gap-1.5">
                                {hasSubItems && (
                                  <button
                                    onClick={() => toggleExpandRow(row.rowKey)}
                                    className="p-1 hover:bg-slate-200 rounded-md text-slate-500 cursor-pointer"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                    )}
                                  </button>
                                )}
                                <span className="truncate max-w-[260px]" title={row.rowLabel}>
                                  {row.rowLabel}
                                </span>
                              </div>
                            </td>

                            {/* VALORES POR MES */}
                            {columnDimension === 'months' && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                              const val = row.monthValues[m] || 0;
                              return (
                                <td
                                  key={m}
                                  onClick={() => val !== 0 && handleOpenDrillDown(row.rowLabel, `Mes de ${MONTH_NAMES[m - 1]} ${selectedYear}`, row.lines.filter(l => l.month === m))}
                                  className={`py-2 px-2.5 text-right font-mono tabular-nums ${
                                    val !== 0 ? 'text-slate-800 cursor-pointer hover:bg-indigo-50 hover:text-indigo-700' : 'text-slate-300'
                                  }`}
                                  title={val !== 0 ? 'Haga clic para ver el detalle de comprobantes' : ''}
                                >
                                  {val !== 0 ? `$${Math.round(val).toLocaleString('es-CL')}` : '-'}
                                </td>
                              );
                            })}

                            {/* VALORES POR CENTRO DE COSTO */}
                            {columnDimension === 'costCenters' && activeCostCenterColumns.map(cc => {
                              const val = row.costCenterValues[cc.id] || 0;
                              return (
                                <td
                                  key={cc.id}
                                  onClick={() => val !== 0 && handleOpenDrillDown(row.rowLabel, `Centro de Costo: ${cc.label}`, row.lines.filter(l => l.costCenterId === cc.id))}
                                  className={`py-2 px-2.5 text-right font-mono tabular-nums ${
                                    val !== 0 ? 'text-slate-800 cursor-pointer hover:bg-indigo-50 hover:text-indigo-700' : 'text-slate-300'
                                  }`}
                                >
                                  {val !== 0 ? `$${Math.round(val).toLocaleString('es-CL')}` : '-'}
                                </td>
                              );
                            })}

                            {/* RESUMEN CONTABLE */}
                            {columnDimension === 'accountingSummary' && (
                              <>
                                <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700">
                                  ${Math.round(row.totalDebe).toLocaleString('es-CL')}
                                </td>
                                <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700">
                                  ${Math.round(row.totalHaber).toLocaleString('es-CL')}
                                </td>
                              </>
                            )}

                            {/* TOTAL FILA */}
                            <td
                              onClick={() => row.totalRow !== 0 && handleOpenDrillDown(row.rowLabel, `Total Año ${selectedYear}`, row.lines)}
                              className="py-2 px-3 text-right font-bold font-mono tabular-nums text-indigo-900 bg-indigo-50/30 cursor-pointer hover:bg-indigo-100"
                              title="Haga clic para ver todos los comprobantes del año"
                            >
                              ${Math.round(row.totalRow).toLocaleString('es-CL')}
                            </td>

                            {/* % PARTICIPACIÓN */}
                            <td className="py-2 px-2.5 text-right font-semibold text-slate-500 bg-slate-50/50">
                              {row.percentage.toFixed(1)}%
                            </td>
                          </tr>

                          {/* FILAS SUB-ITEMS (NIVEL 2) */}
                          {isExpanded && row.subItems.map((sub) => (
                            <tr key={`${row.rowKey}_${sub.subKey}`} className="bg-slate-50/70 hover:bg-slate-100/70 transition-colors text-[11px]">
                              <td className="py-1.5 px-3.5 pl-8 text-slate-600 sticky left-0 bg-slate-50/90 border-r border-slate-200 z-10 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                <span className="truncate max-w-[240px]" title={sub.subLabel}>{sub.subLabel}</span>
                              </td>

                              {/* MESES SUB-ITEM */}
                              {columnDimension === 'months' && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                                const val = sub.monthValues[m] || 0;
                                return (
                                  <td
                                    key={m}
                                    onClick={() => val !== 0 && handleOpenDrillDown(`${row.rowLabel} > ${sub.subLabel}`, `Mes de ${MONTH_NAMES[m - 1]} ${selectedYear}`, sub.lines.filter(l => l.month === m))}
                                    className={`py-1.5 px-2.5 text-right font-mono tabular-nums ${
                                      val !== 0 ? 'text-slate-700 cursor-pointer hover:bg-indigo-100/60' : 'text-slate-300'
                                    }`}
                                  >
                                    {val !== 0 ? `$${Math.round(val).toLocaleString('es-CL')}` : '-'}
                                  </td>
                                );
                              })}

                              {/* CENTROS DE COSTO SUB-ITEM */}
                              {columnDimension === 'costCenters' && activeCostCenterColumns.map(cc => {
                                const val = sub.costCenterValues[cc.id] || 0;
                                return (
                                  <td
                                    key={cc.id}
                                    onClick={() => val !== 0 && handleOpenDrillDown(`${row.rowLabel} > ${sub.subLabel}`, `Centro de Costo: ${cc.label}`, sub.lines.filter(l => l.costCenterId === cc.id))}
                                    className={`py-1.5 px-2.5 text-right font-mono tabular-nums ${
                                      val !== 0 ? 'text-slate-700 cursor-pointer hover:bg-indigo-100/60' : 'text-slate-300'
                                    }`}
                                  >
                                    {val !== 0 ? `$${Math.round(val).toLocaleString('es-CL')}` : '-'}
                                  </td>
                                );
                              })}

                              {/* RESUMEN CONTABLE SUB-ITEM */}
                              {columnDimension === 'accountingSummary' && (
                                <>
                                  <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-600">
                                    ${Math.round(sub.totalDebe).toLocaleString('es-CL')}
                                  </td>
                                  <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-600">
                                    ${Math.round(sub.totalHaber).toLocaleString('es-CL')}
                                  </td>
                                </>
                              )}

                              {/* TOTAL SUB-ITEM */}
                              <td
                                onClick={() => sub.totalRow !== 0 && handleOpenDrillDown(`${row.rowLabel} > ${sub.subLabel}`, `Total Año ${selectedYear}`, sub.lines)}
                                className="py-1.5 px-3 text-right font-semibold font-mono tabular-nums text-slate-800 bg-slate-100/60 cursor-pointer hover:bg-indigo-100"
                              >
                                ${Math.round(sub.totalRow).toLocaleString('es-CL')}
                              </td>

                              <td className="py-1.5 px-2.5 text-right font-medium text-slate-400">
                                {matrixData.grandTotal !== 0 ? ((sub.totalRow / matrixData.grandTotal) * 100).toFixed(1) : 0}%
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>

                {/* PIE DE TABLA: TOTALES GENERALES */}
                {matrixData.rows.length > 0 && (
                  <tfoot className="bg-slate-100 text-slate-900 font-bold border-t-2 border-slate-300 sticky bottom-0 z-20">
                    <tr>
                      <td className="py-3 px-3.5 uppercase tracking-wider text-[11px] sticky left-0 bg-slate-100 border-r border-slate-200 z-30">
                        TOTAL GENERAL ({selectedYear})
                      </td>

                      {/* TOTALES POR MES */}
                      {columnDimension === 'months' && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                        <td key={m} className="py-3 px-2.5 text-right font-mono tabular-nums text-indigo-950">
                          ${Math.round(matrixData.colTotals[m] || 0).toLocaleString('es-CL')}
                        </td>
                      ))}

                      {/* TOTALES POR CENTRO DE COSTO */}
                      {columnDimension === 'costCenters' && activeCostCenterColumns.map(cc => (
                        <td key={cc.id} className="py-3 px-2.5 text-right font-mono tabular-nums text-indigo-950">
                          ${Math.round(matrixData.ccTotals[cc.id] || 0).toLocaleString('es-CL')}
                        </td>
                      ))}

                      {/* RESUMEN CONTABLE */}
                      {columnDimension === 'accountingSummary' && (
                        <>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-900">
                            ${Math.round(matrixData.totalDebeGlobal).toLocaleString('es-CL')}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-900">
                            ${Math.round(matrixData.totalHaberGlobal).toLocaleString('es-CL')}
                          </td>
                        </>
                      )}

                      {/* GRAN TOTAL */}
                      <td className="py-3 px-3 text-right font-black font-mono tabular-nums text-indigo-900 bg-indigo-100/50">
                        ${Math.round(matrixData.grandTotal).toLocaleString('es-CL')}
                      </td>

                      <td className="py-3 px-2.5 text-right font-bold text-slate-900 bg-slate-200/50">
                        100%
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONTENIDO: SUB-PESTAÑA 2 - ANÁLISIS DINÁMICO DE VENTAS
          ========================================================================= */}
      {activeSubTab === 'VENTAS' && (
        <div className="space-y-6">
          {/* BARRA SUPERIOR DE PARÁMETROS DE VENTAS */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {/* COMPARATIVA */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setSalesCompareMode('PRIOR_YEAR')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    salesCompareMode === 'PRIOR_YEAR'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Comparar con Año Anterior ({selectedYear - 1})
                </button>
                <button
                  onClick={() => setSalesCompareMode('BUDGET')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    salesCompareMode === 'BUDGET'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Comparar con Presupuesto (Budget)
                </button>
              </div>

              {/* FUENTE DE DATOS */}
              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                <span className="font-semibold text-slate-500">Fuente:</span>
                <select
                  value={salesDataSource}
                  onChange={(e) => setSalesDataSource(e.target.value as SalesDataSource)}
                  className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 outline-hidden cursor-pointer"
                >
                  <option value="RCV_SII">Registro de Ventas SII (RCV Facturación)</option>
                  <option value="CONTABILIDAD">Contabilidad (Cuentas de Ingresos 4xxx)</option>
                  <option value="CONSOLIDADO">Consolidado Total</option>
                </select>
              </div>
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (salesBudget?.monthlyBudget) {
                    setBudgetFormMonths(salesBudget.monthlyBudget);
                  }
                  setIsBudgetModalOpen(true);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Target className="w-3.5 h-3.5 text-indigo-600" />
                <span>Configurar Presupuesto de Ventas</span>
              </button>

              <button
                onClick={exportSalesToCSV}
                className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Exportar Reporte</span>
              </button>
            </div>
          </div>

          {/* KPIS EJECUTIVOS DE VENTAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Venta Total Neta */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ventas Netas del Año</span>
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <DollarSign className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                ${Math.round(salesAnalysisData.totalActualYear).toLocaleString('es-CL')}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {salesAnalysisData.annualDiffPercent >= 0 ? (
                  <span className="flex items-center text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md">
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                    +{salesAnalysisData.annualDiffPercent.toFixed(1)}%
                  </span>
                ) : (
                  <span className="flex items-center text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded-md">
                    <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                    {salesAnalysisData.annualDiffPercent.toFixed(1)}%
                  </span>
                )}
                <span className="text-slate-400">vs {salesCompareMode === 'PRIOR_YEAR' ? `Año ${selectedYear - 1}` : 'Presupuesto'}</span>
              </div>
            </div>

            {/* KPI 2: Cumplimiento o Crecimiento */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {salesCompareMode === 'PRIOR_YEAR' ? 'Variación Absoluta' : 'Cumplimiento Presupuesto'}
                </span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Target className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                {salesCompareMode === 'PRIOR_YEAR' ? (
                  <span className={salesAnalysisData.annualDiffDollar >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {salesAnalysisData.annualDiffDollar >= 0 ? '+' : ''}${Math.round(salesAnalysisData.annualDiffDollar).toLocaleString('es-CL')}
                  </span>
                ) : (
                  <span className={salesAnalysisData.annualBudgetFulfillment >= 100 ? 'text-emerald-600' : 'text-amber-600'}>
                    {salesAnalysisData.annualBudgetFulfillment.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {salesCompareMode === 'PRIOR_YEAR'
                  ? `Venta año ${selectedYear - 1}: $${Math.round(salesAnalysisData.totalPriorYear).toLocaleString('es-CL')}`
                  : `Meta anual: $${Math.round(salesAnalysisData.totalBudgetYear).toLocaleString('es-CL')}`}
              </div>
            </div>

            {/* KPI 3: Promedio Mensual */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Promedio Mensual</span>
                <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <Calendar className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                ${Math.round(salesAnalysisData.avgMonthlySales).toLocaleString('es-CL')}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Facturación media por mes en {selectedYear}
              </div>
            </div>

            {/* KPI 4: Ticket Promedio por Factura */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ticket Promedio</span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Users className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                ${Math.round(salesAnalysisData.avgTicket).toLocaleString('es-CL')}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Total de {salesAnalysisData.totalDocsYear} documentos emitidos
              </div>
            </div>
          </div>

          {/* GRÁFICO INTERACTIVO DE VENTAS */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Evolución Mensual de Ventas ({selectedYear} vs {salesCompareMode === 'PRIOR_YEAR' ? selectedYear - 1 : 'Presupuesto'})
                </h3>
                <p className="text-xs text-slate-500">Montos netos mensuales expresados en Pesos Chilenos (CLP)</p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesAnalysisData.chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip
                    formatter={(value: any) => [`$${Number(value).toLocaleString('es-CL')}`, '']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend />
                  <Bar dataKey="Año Actual" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey={salesCompareMode === 'PRIOR_YEAR' ? 'Año Anterior' : 'Presupuesto'}
                    fill={salesCompareMode === 'PRIOR_YEAR' ? '#10b981' : '#f59e0b'}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TABLA MENSUAL COMPARATIVA DETALLADA */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Matriz Mensual de Ventas Comparativas (Año {selectedYear})
              </h3>
              <span className="text-xs text-slate-500">Cifras Netas en CLP</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider text-[11px]">Mes</th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-right">Venta Real {selectedYear}</th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-right">
                      {salesCompareMode === 'PRIOR_YEAR' ? `Año Anterior (${selectedYear - 1})` : 'Presupuesto Meta'}
                    </th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-right">Diferencia $</th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-right">Var %</th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-right bg-slate-800">Real Acumulado</th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-right bg-slate-800">
                      {salesCompareMode === 'PRIOR_YEAR' ? 'Acum. Año Ant.' : 'Presupuesto Acum.'}
                    </th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-right bg-slate-800">Cumpl. Acum.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesAnalysisData.monthlyTable.map(row => (
                    <tr key={row.monthNumber} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3.5 font-bold text-slate-900">{row.monthName}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-950">
                        ${Math.round(row.actualSales).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                        ${Math.round(row.compValue).toLocaleString('es-CL')}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-semibold ${row.diffDollar >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {row.diffDollar >= 0 ? '+' : ''}${Math.round(row.diffDollar).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          row.diffPercent >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {row.diffPercent >= 0 ? '+' : ''}{row.diffPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800 bg-slate-50/50">
                        ${Math.round(row.cumActual).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600 bg-slate-50/50">
                        ${Math.round(salesCompareMode === 'PRIOR_YEAR' ? row.cumPrior : row.cumBudget).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-800 bg-slate-50/50">
                        {((row.cumActual / (salesCompareMode === 'PRIOR_YEAR' ? (row.cumPrior || 1) : (row.cumBudget || 1))) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                  <tr>
                    <td className="py-3 px-3.5 uppercase tracking-wider text-[11px]">TOTAL ANUAL</td>
                    <td className="py-3 px-3 text-right font-mono text-indigo-900 font-black">
                      ${Math.round(salesAnalysisData.totalActualYear).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      ${Math.round(salesCompareMode === 'PRIOR_YEAR' ? salesAnalysisData.totalPriorYear : salesAnalysisData.totalBudgetYear).toLocaleString('es-CL')}
                    </td>
                    <td className={`py-3 px-3 text-right font-mono font-black ${salesAnalysisData.annualDiffDollar >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {salesAnalysisData.annualDiffDollar >= 0 ? '+' : ''}${Math.round(salesAnalysisData.annualDiffDollar).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        salesAnalysisData.annualDiffPercent >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {salesAnalysisData.annualDiffPercent >= 0 ? '+' : ''}{salesAnalysisData.annualDiffPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono bg-slate-200/50">
                      ${Math.round(salesAnalysisData.totalActualYear).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono bg-slate-200/50">
                      ${Math.round(salesCompareMode === 'PRIOR_YEAR' ? salesAnalysisData.totalPriorYear : salesAnalysisData.totalBudgetYear).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3 px-3 text-right font-black bg-slate-200/50">
                      {salesAnalysisData.annualBudgetFulfillment.toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* DESGLOSE MULTIDIMENSIONAL DE VENTAS: TOP CLIENTES, CENTROS DE COSTO Y DTE */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Desglose Analítico de Ventas</h3>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setSalesBreakdownTab('CLIENTES')}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    salesBreakdownTab === 'CLIENTES' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Ranking Clientes (Pareto)
                </button>
                <button
                  onClick={() => setSalesBreakdownTab('CENTROS_COSTO')}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    salesBreakdownTab === 'CENTROS_COSTO' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Por Centro de Costo
                </button>
                <button
                  onClick={() => setSalesBreakdownTab('DTE_TIPO')}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    salesBreakdownTab === 'DTE_TIPO' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Por Tipo de Documento SII
                </button>
              </div>
            </div>

            {/* TABLA: CLIENTES */}
            {salesBreakdownTab === 'CLIENTES' && (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">RUT Cliente</th>
                      <th className="py-2.5 px-3">Razón Social</th>
                      <th className="py-2.5 px-3 text-right">Monto Neto</th>
                      <th className="py-2.5 px-3 text-right">IVA</th>
                      <th className="py-2.5 px-3 text-right">Monto Total</th>
                      <th className="py-2.5 px-3 text-right">% Part.</th>
                      <th className="py-2.5 px-3 text-right">Cant. Docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salesAnalysisData.clientsList.slice(0, 30).map((c, idx) => (
                      <tr key={c.rut} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900">{c.rut}</td>
                        <td className="py-2 px-3 font-medium text-slate-800 truncate max-w-xs">{c.name}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-indigo-950">
                          ${Math.round(c.netAmount).toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">
                          ${Math.round(c.ivaAmount).toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                          ${Math.round(c.totalAmount).toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-indigo-600">
                          {c.percentage.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {c.docCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TABLA: CENTROS DE COSTO */}
            {salesBreakdownTab === 'CENTROS_COSTO' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Código CC</th>
                      <th className="py-2.5 px-3">Nombre Centro de Costo</th>
                      <th className="py-2.5 px-3 text-right">Total Ventas Netas</th>
                      <th className="py-2.5 px-3 text-right">% Participación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salesAnalysisData.salesCCList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          Para ver ventas por Centro de Costo, seleccione la fuente "Contabilidad" o asigne Centro de Costo a sus facturas.
                        </td>
                      </tr>
                    ) : (
                      salesAnalysisData.salesCCList.map(cc => (
                        <tr key={cc.code} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">{cc.code}</td>
                          <td className="py-2 px-3 text-slate-800">{cc.name}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-indigo-950">
                            ${Math.round(cc.netAmount).toLocaleString('es-CL')}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-indigo-600">
                            {salesAnalysisData.totalActualYear > 0 ? ((cc.netAmount / salesAnalysisData.totalActualYear) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TABLA: TIPO DTE */}
            {salesBreakdownTab === 'DTE_TIPO' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Tipo Documento</th>
                      <th className="py-2.5 px-3 text-right">Venta Neta Total</th>
                      <th className="py-2.5 px-3 text-right">Cantidad de Documentos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salesAnalysisData.dteTypesList.map(dt => (
                      <tr key={dt.code} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-semibold text-slate-900">{dt.name}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-indigo-950">
                          ${Math.round(dt.netAmount).toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">{dt.docCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CONFIGURAR PRESUPUESTO DE VENTAS
          ========================================================================= */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold">Configurar Presupuesto de Ventas (Budget)</h3>
                  <p className="text-xs text-slate-300">Empresa: {company.name} • Año Fiscal {selectedYear}</p>
                </div>
              </div>
              <button
                onClick={() => setIsBudgetModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* HERRAMIENTAS RÁPIDAS DE CÁLCULO */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Herramientas Rápidas de Generación
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Opción 1: Distribuir parejo una meta anual */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Fijar Meta Anual Pareja (CLP):</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        placeholder="Ej: 120000000"
                        value={budgetAnnualTargetInput}
                        onChange={(e) => setBudgetAnnualTargetInput(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-mono outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleDistributeAnnualTarget}
                        className="px-2.5 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 cursor-pointer whitespace-nowrap"
                      >
                        Distribuir / 12
                      </button>
                    </div>
                  </div>

                  {/* Opción 2: Crecer sobre el año anterior */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Crecer sobre Venta Real Año Anterior:</label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleApplyGrowthOnPriorYear(5)}
                        className="flex-1 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 rounded-xl cursor-pointer"
                      >
                        +5%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyGrowthOnPriorYear(10)}
                        className="flex-1 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 rounded-xl cursor-pointer"
                      >
                        +10%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyGrowthOnPriorYear(15)}
                        className="flex-1 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 rounded-xl cursor-pointer"
                      >
                        +15%
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* GRILLA DE LOS 12 MESES */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Presupuesto Mensual Desglosado (Neto CLP)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <div key={m} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700">{MONTH_NAMES[m - 1]}:</span>
                      <div className="relative w-32">
                        <span className="absolute left-2 top-1.5 text-slate-400 text-xs">$</span>
                        <input
                          type="number"
                          value={budgetFormMonths[m] || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setBudgetFormMonths(prev => ({ ...prev, [m]: val }));
                          }}
                          className="w-full text-right text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg pl-5 pr-2 py-1 outline-hidden focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* TOTAL ANUAL CALCULADO */}
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-indigo-900 uppercase">Presupuesto Anual Consolidado:</span>
                  <p className="text-[11px] text-indigo-700">Suma automática de las metas de los 12 meses</p>
                </div>
                <div className="text-xl font-black font-mono text-indigo-950">
                  ${Object.values(budgetFormMonths).reduce((a, b) => a + (Number(b) || 0), 0).toLocaleString('es-CL')}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsBudgetModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingBudget}
                onClick={handleSaveBudget}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
              >
                {savingBudget ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Guardar Presupuesto {selectedYear}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: DRILL-DOWN (DETALLE DE COMPROBANTES DE UNA CELDA)
          ========================================================================= */}
      {drillDownData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold">{drillDownData.title}</h3>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">{drillDownData.subtitle} • {company.name}</p>
              </div>
              <button
                onClick={() => setDrillDownData(null)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="font-semibold text-slate-600">
                  Total Comprobantes: {drillDownData.lines.length} registros
                </span>
                <span className="font-mono font-bold text-slate-900">
                  Monto Acumulado: ${Math.round(drillDownData.totalNet).toLocaleString('es-CL')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">Fecha</th>
                      <th className="py-2 px-2.5">Comprobante</th>
                      <th className="py-2 px-2.5">Cuenta Contable</th>
                      <th className="py-2 px-2.5">Auxiliar / Proveedor</th>
                      <th className="py-2 px-2.5">Glosa</th>
                      <th className="py-2 px-2.5 text-right">Debe</th>
                      <th className="py-2 px-2.5 text-right">Haber</th>
                      <th className="py-2 px-2.5 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillDownData.lines.map((item, idx) => (
                      <tr key={`${item.voucherId}_${idx}`} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-mono text-slate-600">{item.voucherDate}</td>
                        <td className="py-2 px-2.5 font-mono font-bold text-slate-900">
                          #{item.voucherNumber} ({item.voucherType})
                        </td>
                        <td className="py-2 px-2.5 font-medium text-slate-800">{item.accountCode} - {item.accountName}</td>
                        <td className="py-2 px-2.5 text-slate-600">{item.auxiliaryName || '-'}</td>
                        <td className="py-2 px-2.5 text-slate-700 truncate max-w-xs">{item.gloss}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-slate-700">
                          ${Math.round(item.debit).toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-slate-700">
                          ${Math.round(item.credit).toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-indigo-900">
                          ${Math.round(item.netAmount).toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setDrillDownData(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
