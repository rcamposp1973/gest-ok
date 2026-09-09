import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear, Auxiliary, BankReconciliation } from '../types';
import { 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  CheckCircle2, 
  Info, 
  FileText, 
  Download, 
  Printer, 
  Calendar, 
  RefreshCw, 
  Scale, 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  AlertOctagon, 
  Award, 
  Layers, 
  ExternalLink,
  ChevronRight,
  Filter,
  Check,
  Search,
  Sliders,
  DollarSign
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AuditorEstadosFinancierosViewProps {
  studyId?: string;
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  auxiliaries?: Auxiliary[];
  bankReconciliations?: BankReconciliation[];
  onNavigateTab?: (tabName: string) => void;
}

export type AuditSeverity = 'CRITICO' | 'ALTO' | 'MEDIO' | 'INFORMATIVO';
export type AuditOpinionType = 'LIMPIA' | 'SALVEDADES' | 'ADVERSA' | 'ABSTENCION';

export interface AuditFinding {
  id: string;
  module: 'BALANCE_8_COL' | 'BALANCE_IFRS' | 'ESTADO_RESULTADOS' | 'AUXILIARES_ANALISIS' | 'BANCOS_CONCILIACION' | 'ESTRUCTURA_PLAN';
  severity: AuditSeverity;
  title: string;
  description: string;
  impactAmount?: number;
  accountCode?: string;
  accountName?: string;
  recommendation: string;
  suggestedActionTab?: string;
}

export interface StatementCheck {
  name: string;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  valueA: number;
  valueB: number;
  difference: number;
  labelA: string;
  labelB: string;
  explanation: string;
}

export default function AuditorEstadosFinancierosView({
  studyId,
  company,
  vouchers = [],
  accounts = [],
  fiscalYears = [],
  auxiliaries = [],
  bankReconciliations = [],
  onNavigateTab
}: AuditorEstadosFinancierosViewProps) {
  // Period filter
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<string>('TODOS');
  const [severityFilter, setSeverityFilter] = useState<string>('TODOS');
  const [moduleFilter, setModuleFilter] = useState<string>('TODOS');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeViewTab, setActiveViewTab] = useState<'dictamen' | 'cuadraturas' | 'hallazgos' | 'ratios' | 'informe_oficial'>('dictamen');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Available fiscal years
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    fiscalYears.forEach(fy => set.add(fy.year));
    vouchers.forEach(v => {
      const yr = parseInt(v.period?.split('-')[0] || v.date?.split('-')[0] || '0', 10);
      if (yr > 2000 && yr < 2100) set.add(yr);
    });
    if (set.size === 0) set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [fiscalYears, vouchers]);

  // Filter vouchers by selected year & period
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const vDate = v.date || '';
      const vPeriod = v.period || vDate.substring(0, 7);
      const vYear = parseInt(vPeriod.split('-')[0] || vDate.split('-')[0] || '0', 10);

      if (selectedYear && vYear !== selectedYear) return false;
      if (selectedPeriod !== 'TODOS' && vPeriod !== selectedPeriod) return false;
      return true;
    });
  }, [vouchers, selectedYear, selectedPeriod]);

  // Available periods for the selected year
  const availablePeriodsForYear = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      const p = v.period || (v.date ? v.date.substring(0, 7) : '');
      if (p && p.startsWith(`${selectedYear}-`)) {
        set.add(p);
      }
    });
    return Array.from(set).sort();
  }, [vouchers, selectedYear]);

  // Account Map for fast lookup
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // -------------------------------------------------------------
  // 1. ENGINE DE CÁLCULO DE ESTADOS FINANCIEROS AUDITADOS
  // -------------------------------------------------------------
  const auditData = useMemo(() => {
    // A. Acumuladores de cuentas
    const accountTotals = new Map<string, {
      acc: ChartOfAccount;
      debit: number;
      credit: number;
      linesCount: number;
      vouchersWithAccount: Set<string>;
    }>();

    accounts.forEach(acc => {
      accountTotals.set(acc.id, {
        acc,
        debit: 0,
        credit: 0,
        linesCount: 0,
        vouchersWithAccount: new Set()
      });
    });

    let totalGlobalDebit = 0;
    let totalGlobalCredit = 0;
    let unbalancedVouchersCount = 0;
    const unbalancedVouchersList: { voucherNumber: number; type: string; diff: number }[] = [];

    // Process all lines of filtered vouchers
    filteredVouchers.forEach(v => {
      let vDebit = 0;
      let vCredit = 0;

      (v.lines || []).forEach(line => {
        const lineDebit = Number(line.debit) || 0;
        const lineCredit = Number(line.credit) || 0;
        vDebit += lineDebit;
        vCredit += lineCredit;

        totalGlobalDebit += lineDebit;
        totalGlobalCredit += lineCredit;

        const targetAcc = accounts.find(a => a.id === line.accountId || a.code === line.accountCode) || accountMap.get(line.accountId);
        if (targetAcc) {
          const entry = accountTotals.get(targetAcc.id) || {
            acc: targetAcc,
            debit: 0,
            credit: 0,
            linesCount: 0,
            vouchersWithAccount: new Set()
          };
          entry.debit += lineDebit;
          entry.credit += lineCredit;
          entry.linesCount += 1;
          entry.vouchersWithAccount.add(v.id);
          accountTotals.set(targetAcc.id, entry);
        }
      });

      const diff = Math.abs(vDebit - vCredit);
      if (diff > 0.01) {
        unbalancedVouchersCount++;
        unbalancedVouchersList.push({
          voucherNumber: v.voucherNumber,
          type: v.type,
          diff
        });
      }
    });

    // B. Balance de 8 Columnas Consolidado
    let sumTotalDebits = 0;
    let sumTotalCredits = 0;
    let sumDebtorBalance = 0;
    let sumCreditorBalance = 0;
    let sumAssetInventory = 0;
    let sumLiabilityInventory = 0;
    let sumLossResult = 0;
    let sumGainResult = 0;

    const auditedRows: {
      account: ChartOfAccount;
      debit: number;
      credit: number;
      debtorBal: number;
      creditorBal: number;
      asset: number;
      liability: number;
      loss: number;
      gain: number;
      isAnomalous: boolean;
      anomalyReason?: string;
    }[] = [];

    accountTotals.forEach(({ acc, debit, credit }) => {
      if (debit === 0 && credit === 0) return;

      sumTotalDebits += debit;
      sumTotalCredits += credit;

      const diff = debit - credit;
      const debtorBal = diff > 0 ? diff : 0;
      const creditorBal = diff < 0 ? Math.abs(diff) : 0;

      sumDebtorBalance += debtorBal;
      sumCreditorBalance += creditorBal;

      let asset = 0;
      let liability = 0;
      let loss = 0;
      let gain = 0;
      let isAnomalous = false;
      let anomalyReason = '';

      const typeLower = (acc.type || '').toLowerCase();
      const codeFirst = (acc.code || '').charAt(0);
      const blceCol = (acc.blce8Columnas || '').toUpperCase();

      // Clasificación Tributaria 8 Columnas
      if (blceCol === 'ACTIVO' || typeLower === 'activo' || codeFirst === '1') {
        asset = debtorBal - creditorBal; // Saldo deudor va a activo
        if (asset < 0) {
          asset = 0;
          liability = Math.abs(debtorBal - creditorBal);
          isAnomalous = true;
          anomalyReason = `Cuenta de Activo con saldo acreedor anómalo ($${creditorBal.toLocaleString('es-CL')}). Posible sobregiro, error en imputación de abonos o cuenta complementaria no clasificada.`;
        }
      } else if (blceCol === 'PASIVO' || typeLower === 'pasivo' || typeLower === 'patrimonio' || codeFirst === '2' || (codeFirst === '3' && !typeLower.includes('ingreso') && !typeLower.includes('ganancia'))) {
        liability = creditorBal - debtorBal; // Saldo acreedor va a pasivo
        if (liability < 0) {
          liability = 0;
          asset = Math.abs(creditorBal - debtorBal);
          isAnomalous = true;
          anomalyReason = `Cuenta de Pasivo/Patrimonio con saldo deudor anómalo ($${debtorBal.toLocaleString('es-CL')}). Posible pago duplicado, exceso de anticipo o error en cargo.`;
        }
      } else if (blceCol === 'PERDIDA' || blceCol === 'PÉRDIDA' || typeLower === 'gasto' || typeLower === 'costo' || typeLower === 'perdida' || typeLower === 'pérdida' || codeFirst === '4') {
        loss = debtorBal - creditorBal;
        if (loss < 0) {
          loss = 0;
          gain = Math.abs(debtorBal - creditorBal);
          isAnomalous = true;
          anomalyReason = `Cuenta de Pérdida/Gasto con saldo acreedor ($${creditorBal.toLocaleString('es-CL')}). Gastos habitualmente no deben cerrar con saldo acreedor a menos que sea una reversión total.`;
        }
      } else if (blceCol === 'GANANCIA' || typeLower === 'ingreso' || typeLower === 'ganancia' || codeFirst === '5' || (codeFirst === '3' && (typeLower.includes('ingreso') || typeLower.includes('ganancia')))) {
        gain = creditorBal - debtorBal;
        if (gain < 0) {
          gain = 0;
          loss = Math.abs(creditorBal - debtorBal);
          isAnomalous = true;
          anomalyReason = `Cuenta de Ganancia/Ingreso con saldo deudor ($${debtorBal.toLocaleString('es-CL')}). Ingresos habitualmente deben cerrar con saldo acreedor.`;
        }
      } else {
        // Default fallback
        if (debtorBal > 0) asset = debtorBal;
        if (creditorBal > 0) liability = creditorBal;
      }

      sumAssetInventory += asset;
      sumLiabilityInventory += liability;
      sumLossResult += loss;
      sumGainResult += gain;

      auditedRows.push({
        account: acc,
        debit,
        credit,
        debtorBal,
        creditorBal,
        asset,
        liability,
        loss,
        gain,
        isAnomalous,
        anomalyReason
      });
    });

    // Cuentas de agrupación con movimientos (Error de imputación)
    const groupingAccountsWithMovements: { acc: ChartOfAccount; linesCount: number }[] = [];
    accountTotals.forEach(({ acc, linesCount }) => {
      if (linesCount > 0) {
        const isGroup = (acc as any).isGrouping === true || (acc as any).imputable === false;
        if (isGroup) {
          groupingAccountsWithMovements.push({ acc, linesCount });
        }
      }
    });

    // Cuadratura final de 8 columnas
    const diffInventory = sumAssetInventory - sumLiabilityInventory;
    const diffResult = sumGainResult - sumLossResult;
    const balance8SquareDiff = Math.abs(diffInventory - diffResult);

    // C. Estado de Situación Financiera Clasificado IFRS
    let ifrsCurrentAssets = 0;
    let ifrsNonCurrentAssets = 0;
    let ifrsCurrentLiabilities = 0;
    let ifrsNonCurrentLiabilities = 0;
    let ifrsEquity = 0;

    auditedRows.forEach(row => {
      const code = row.account.code || '';
      const rubro = (row.account.parentCode || '').toLowerCase();
      const name = (row.account.name || '').toLowerCase();
      const netBalance = row.debtorBal - row.creditorBal; // Positivo = Deudor, Negativo = Acreedor

      if (row.account.type === 'Activo' || code.startsWith('1')) {
        // Corriente vs No Corriente
        if (code.startsWith('1.1') || rubro.includes('circulante') || rubro.includes('corriente') || name.includes('disponible') || name.includes('banco') || name.includes('caja') || name.includes('cliente') || name.includes('deudor')) {
          ifrsCurrentAssets += netBalance;
        } else {
          ifrsNonCurrentAssets += netBalance;
        }
      } else if (row.account.type === 'Pasivo' || code.startsWith('2')) {
        if (code.startsWith('2.1') || rubro.includes('circulante') || rubro.includes('corriente') || name.includes('proveedor') || name.includes('acreedor') || name.includes('remuneraciones por pagar') || name.includes('impuestos por pagar') || name.includes('iva')) {
          ifrsCurrentLiabilities += Math.abs(netBalance);
        } else {
          ifrsNonCurrentLiabilities += Math.abs(netBalance);
        }
      } else if (row.account.type === 'Patrimonio' || code.startsWith('3')) {
        ifrsEquity += Math.abs(netBalance);
      }
    });

    const ifrsTotalAssets = ifrsCurrentAssets + ifrsNonCurrentAssets;
    // En IFRS, el Patrimonio Neto incluye el Resultado del Ejercicio
    const ifrsCalculatedResult = diffResult; // Ganancia - Pérdida
    const ifrsTotalLiabilitiesAndEquity = ifrsCurrentLiabilities + ifrsNonCurrentLiabilities + ifrsEquity + ifrsCalculatedResult;
    const ifrsEquationDiff = Math.abs(ifrsTotalAssets - ifrsTotalLiabilitiesAndEquity);

    // D. Estado de Resultados (EERR)
    const revenueAccounts = auditedRows.filter(r => r.account.type === 'Ingreso' || r.account.code.startsWith('4'));
    const costAccounts = auditedRows.filter(r => r.account.type === 'Gasto' && (r.account.name.toLowerCase().includes('costo') || r.account.code.startsWith('5.1')));
    const expenseAccounts = auditedRows.filter(r => r.account.type === 'Gasto' && !costAccounts.some(c => c.account.id === r.account.id));

    const totalRevenue = revenueAccounts.reduce((sum, r) => sum + r.gain, 0);
    const totalCostOfSales = costAccounts.reduce((sum, r) => sum + r.loss, 0);
    const grossMargin = totalRevenue - totalCostOfSales;
    const totalOperatingExpenses = expenseAccounts.reduce((sum, r) => sum + r.loss, 0);
    const operatingResult = grossMargin - totalOperatingExpenses;
    const netIncome = sumGainResult - sumLossResult;

    // E. Auditoría de Auxiliares obligatorios sin RUT
    let missingAuxiliaryLinesCount = 0;
    const missingAuxiliaryLines: { voucherNumber: number; accountCode: string; accountName: string; amount: number }[] = [];

    filteredVouchers.forEach(v => {
      (v.lines || []).forEach(line => {
        const acc = accounts.find(a => a.id === line.accountId || a.code === line.accountCode) || accountMap.get(line.accountId);
        if (acc && acc.requiereAuxiliarRUT) {
          if (!line.auxiliaryRut || line.auxiliaryRut.trim() === '') {
            missingAuxiliaryLinesCount++;
            if (missingAuxiliaryLines.length < 20) {
              missingAuxiliaryLines.push({
                voucherNumber: v.voucherNumber,
                accountCode: acc.code,
                accountName: acc.name,
                amount: (Number(line.debit) || 0) + (Number(line.credit) || 0)
              });
            }
          }
        }
      });
    });

    // F. Auditoría de Conciliación Bancaria
    const bankAccounts = accounts.filter(a => a.requiereConciliacionBancaria || a.name.toLowerCase().includes('banco') || a.name.toLowerCase().includes('cta cte') || a.code.startsWith('1.1.01.002'));
    const bankAuditIssues: { account: ChartOfAccount; balance: number; issue: string }[] = [];

    bankAccounts.forEach(bAcc => {
      const totals = accountTotals.get(bAcc.id);
      if (totals && (totals.debit > 0 || totals.credit > 0)) {
        const netBal = totals.debit - totals.credit;
        if (netBal < 0) {
          bankAuditIssues.push({
            account: bAcc,
            balance: netBal,
            issue: `Cuenta bancaria [${bAcc.code}] ${bAcc.name} presenta saldo acreedor (sobregiro no clasificado) por $${Math.abs(netBal).toLocaleString('es-CL')}.`
          });
        }
      }
    });

    // G. Ratios de Auditoría y Racionalidad Financiera
    const currentRatio = ifrsCurrentLiabilities > 0 ? (ifrsCurrentAssets / ifrsCurrentLiabilities) : (ifrsCurrentAssets > 0 ? 99.9 : 0);
    const acidRatio = ifrsCurrentLiabilities > 0 ? ((ifrsCurrentAssets * 0.85) / ifrsCurrentLiabilities) : (ifrsCurrentAssets > 0 ? 99.9 : 0);
    const netWorkingCapital = ifrsCurrentAssets - ifrsCurrentLiabilities;
    const debtToEquityRatio = (ifrsEquity + ifrsCalculatedResult) > 0 ? ((ifrsCurrentLiabilities + ifrsNonCurrentLiabilities) / (ifrsEquity + ifrsCalculatedResult)) : 0;
    const grossMarginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
    const netMarginPercent = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;
    const roePercent = (ifrsEquity + ifrsCalculatedResult) > 0 ? (netIncome / (ifrsEquity + ifrsCalculatedResult)) * 100 : 0;
    const roaPercent = ifrsTotalAssets > 0 ? (netIncome / ifrsTotalAssets) * 100 : 0;

    return {
      totalGlobalDebit,
      totalGlobalCredit,
      unbalancedVouchersCount,
      unbalancedVouchersList,
      sumTotalDebits,
      sumTotalCredits,
      sumDebtorBalance,
      sumCreditorBalance,
      sumAssetInventory,
      sumLiabilityInventory,
      sumLossResult,
      sumGainResult,
      diffInventory,
      diffResult,
      balance8SquareDiff,
      auditedRows,
      anomalousRows: auditedRows.filter(r => r.isAnomalous),
      groupingAccountsWithMovements,
      // IFRS
      ifrsCurrentAssets,
      ifrsNonCurrentAssets,
      ifrsTotalAssets,
      ifrsCurrentLiabilities,
      ifrsNonCurrentLiabilities,
      ifrsEquity,
      ifrsCalculatedResult,
      ifrsTotalLiabilitiesAndEquity,
      ifrsEquationDiff,
      // EERR
      totalRevenue,
      totalCostOfSales,
      grossMargin,
      totalOperatingExpenses,
      operatingResult,
      netIncome,
      // Operational
      missingAuxiliaryLinesCount,
      missingAuxiliaryLines,
      bankAuditIssues,
      // Ratios
      currentRatio,
      acidRatio,
      netWorkingCapital,
      debtToEquityRatio,
      grossMarginPercent,
      netMarginPercent,
      roePercent,
      roaPercent,
      voucherCount: filteredVouchers.length,
      accountsUsedCount: auditedRows.length
    };
  }, [accounts, filteredVouchers, accountMap]);

  // -------------------------------------------------------------
  // 2. GENERACIÓN DE MATRIZ DE CHEQUEOS Y HALLAZGOS
  // -------------------------------------------------------------
  const { statementChecks, findings, qualityScore, auditOpinion, riskLevel } = useMemo(() => {
    const checks: StatementCheck[] = [];
    const findingList: AuditFinding[] = [];

    // Check 1: Partida Doble Global (Débitos vs Créditos)
    const debitCreditDiff = Math.abs(auditData.sumTotalDebits - auditData.sumTotalCredits);
    const passedDebitCredit = debitCreditDiff < 0.01;
    checks.push({
      name: 'Cuadratura Partida Doble Global (Suma Débitos vs Suma Créditos)',
      status: passedDebitCredit ? 'PASSED' : 'FAILED',
      valueA: auditData.sumTotalDebits,
      valueB: auditData.sumTotalCredits,
      difference: debitCreditDiff,
      labelA: 'Total Débitos',
      labelB: 'Total Créditos',
      explanation: passedDebitCredit 
        ? 'Cumplimiento estricto del Principio de Partida Doble en el libro contable.' 
        : `Existe un descuadre global de $${debitCreditDiff.toLocaleString('es-CL')} entre cargos y abonos.`
    });

    if (!passedDebitCredit) {
      findingList.push({
        id: 'FIND-001',
        module: 'BALANCE_8_COL',
        severity: 'CRITICO',
        title: 'Descuadre en Sumas del Balance General (Débito ≠ Crédito)',
        description: `El total de débitos acumulados ($${auditData.sumTotalDebits.toLocaleString('es-CL')}) no coincide con el total de créditos ($${auditData.sumTotalCredits.toLocaleString('es-CL')}). Diferencia neta: $${debitCreditDiff.toLocaleString('es-CL')}.`,
        impactAmount: debitCreditDiff,
        recommendation: 'Revisar los comprobantes contables con error de balance o importaciones corruptas en el Libro Diario.',
        suggestedActionTab: 'vouchers'
      });
    }

    // Check 2: Cuadratura Saldos Deudores vs Acreedores
    const debtorCreditorDiff = Math.abs(auditData.sumDebtorBalance - auditData.sumCreditorBalance);
    const passedDebtorCreditor = debtorCreditorDiff < 0.01;
    checks.push({
      name: 'Cuadratura de Saldos (Saldo Deudor vs Saldo Acreedor)',
      status: passedDebtorCreditor ? 'PASSED' : 'FAILED',
      valueA: auditData.sumDebtorBalance,
      valueB: auditData.sumCreditorBalance,
      difference: debtorCreditorDiff,
      labelA: 'Total Saldos Deudores',
      labelB: 'Total Saldos Acreedores',
      explanation: passedDebtorCreditor 
        ? 'Los saldos deudores igualan exactamente a los saldos acreedores.' 
        : `Diferencia de $${debtorCreditorDiff.toLocaleString('es-CL')} en la suma de saldos de las cuentas.`
    });

    if (!passedDebtorCreditor) {
      findingList.push({
        id: 'FIND-002',
        module: 'BALANCE_8_COL',
        severity: 'CRITICO',
        title: 'Descuadre de Saldos Deudores y Acreedores',
        description: `La suma de saldos deudores ($${auditData.sumDebtorBalance.toLocaleString('es-CL')}) difiere de los acreedores ($${auditData.sumCreditorBalance.toLocaleString('es-CL')}).`,
        impactAmount: debtorCreditorDiff,
        recommendation: 'Verificar la coherencia de los saldos acumulados de cuentas contables.',
        suggestedActionTab: 'balance8'
      });
    }

    // Check 3: Cuadratura Cierre 8 Columnas (Activo - Pasivo = Ganancia - Pérdida)
    const passedBalance8Close = auditData.balance8SquareDiff < 0.01;
    checks.push({
      name: 'Cuadratura Cierre 8 Columnas (Inventario vs Resultados)',
      status: passedBalance8Close ? 'PASSED' : 'FAILED',
      valueA: auditData.diffInventory,
      valueB: auditData.diffResult,
      difference: auditData.balance8SquareDiff,
      labelA: 'Dif. Inventario (Activo - Pasivo)',
      labelB: 'Dif. Resultado (Ganancia - Pérdida)',
      explanation: passedBalance8Close 
        ? `Resultado del ejercicio perfectamente cuadrado: $${auditData.diffResult.toLocaleString('es-CL')}.` 
        : `Descalce de $${auditData.balance8SquareDiff.toLocaleString('es-CL')} entre la columna de Inventario y Resultado.`
    });

    if (!passedBalance8Close) {
      findingList.push({
        id: 'FIND-003',
        module: 'BALANCE_8_COL',
        severity: 'CRITICO',
        title: 'Descuadre en el Resultado Tributario del Balance de 8 Columnas',
        description: `El resultado patrimonial (Activo - Pasivo = $${auditData.diffInventory.toLocaleString('es-CL')}) no coincide con el resultado económico (Ganancia - Pérdida = $${auditData.diffResult.toLocaleString('es-CL')}).`,
        impactAmount: auditData.balance8SquareDiff,
        recommendation: 'Revisar cuentas con clasificación errónea de tipo (Activo/Pasivo/Ingreso/Gasto) o códigos huérfanos.',
        suggestedActionTab: 'accounts'
      });
    }

    // Check 4: Ecuación Patrimonial IFRS (Total Activo = Pasivo + Patrimonio)
    const passedIFRSEquation = auditData.ifrsEquationDiff < 0.01;
    checks.push({
      name: 'Ecuación Fundamental IFRS (Total Activos = Pasivos + Patrimonio Neto)',
      status: passedIFRSEquation ? 'PASSED' : 'FAILED',
      valueA: auditData.ifrsTotalAssets,
      valueB: auditData.ifrsTotalLiabilitiesAndEquity,
      difference: auditData.ifrsEquationDiff,
      labelA: 'Total Activos Clasificados',
      labelB: 'Total Pasivos + Patrimonio',
      explanation: passedIFRSEquation 
        ? 'El Estado de Situación Financiera cumple la ecuación fundamental de la contabilidad internacional.' 
        : `Diferencia de $${auditData.ifrsEquationDiff.toLocaleString('es-CL')} en el balance clasificado IFRS.`
    });

    if (!passedIFRSEquation) {
      findingList.push({
        id: 'FIND-004',
        module: 'BALANCE_IFRS',
        severity: 'ALTO',
        title: 'Descuadre en Estado de Situación Financiera IFRS',
        description: `El total de activos ($${auditData.ifrsTotalAssets.toLocaleString('es-CL')}) no cuadra con el pasivo y patrimonio neto ($${auditData.ifrsTotalLiabilitiesAndEquity.toLocaleString('es-CL')}).`,
        impactAmount: auditData.ifrsEquationDiff,
        recommendation: 'Verificar la asignación de cuentas al árbol IFRS (Corriente vs No Corriente, Patrimonio).',
        suggestedActionTab: 'balanceIFRS'
      });
    }

    // Check 5: Consistencia EERR vs Balance (Utilidad Neta P&L vs Resultado 8 Col)
    const eerrVsBalanceDiff = Math.abs(auditData.netIncome - auditData.diffResult);
    const passedEERRConsist = eerrVsBalanceDiff < 0.01;
    checks.push({
      name: 'Consistencia Estado de Resultados vs Balance General',
      status: passedEERRConsist ? 'PASSED' : 'FAILED',
      valueA: auditData.netIncome,
      valueB: auditData.diffResult,
      difference: eerrVsBalanceDiff,
      labelA: 'Utilidad Neta Estado Resultados',
      labelB: 'Resultado Ejercicio Balance 8 Col',
      explanation: passedEERRConsist 
        ? 'El resultado del ejercicio es 100% consistente entre el P&L y el Balance.' 
        : `Diferencia de $${eerrVsBalanceDiff.toLocaleString('es-CL')} entre el Estado de Resultados y el Balance General.`
    });

    if (!passedEERRConsist) {
      findingList.push({
        id: 'FIND-005',
        module: 'ESTADO_RESULTADOS',
        severity: 'ALTO',
        title: 'Inconsistencia de Utilidad entre EERR y Balance Tributario',
        description: `La utilidad calculada en el Estado de Resultados ($${auditData.netIncome.toLocaleString('es-CL')}) difiere del Balance General ($${auditData.diffResult.toLocaleString('es-CL')}).`,
        impactAmount: eerrVsBalanceDiff,
        recommendation: 'Verificar si existen cuentas de resultado mal configuradas como cuentas de balance.',
        suggestedActionTab: 'estadoResultados'
      });
    }

    // Check 6: Asientos contables individuales descuadrados
    if (auditData.unbalancedVouchersCount > 0) {
      findingList.push({
        id: 'FIND-006',
        module: 'BALANCE_8_COL',
        severity: 'CRITICO',
        title: `${auditData.unbalancedVouchersCount} Comprobante(s) con Descuadre en Asiento`,
        description: `Se detectaron ${auditData.unbalancedVouchersCount} comprobantes donde la suma de débitos y créditos no es igual. Asientos afectados: ${auditData.unbalancedVouchersList.map(u => `N° ${u.voucherNumber} (${u.type})`).slice(0, 5).join(', ')}${auditData.unbalancedVouchersList.length > 5 ? '...' : ''}.`,
        recommendation: 'Corregir de inmediato las líneas de los comprobantes descuadrados en el módulo de Comprobantes Contables.',
        suggestedActionTab: 'vouchers'
      });
    }

    // Check 7: Cuentas con Saldos Anómalos o Invertidos
    auditData.anomalousRows.forEach((row, idx) => {
      findingList.push({
        id: `FIND-ANOM-${idx + 1}`,
        module: 'BALANCE_8_COL',
        severity: 'MEDIO',
        title: `Saldo Anómalo/Invertido en Cuenta [${row.account.code}] ${row.account.name}`,
        description: row.anomalyReason || `Cuenta de tipo ${row.account.type} presenta saldo contrario a su naturaleza natural.`,
        accountCode: row.account.code,
        accountName: row.account.name,
        impactAmount: Math.max(row.debtorBal, row.creditorBal),
        recommendation: 'Efectuar análisis de mayor y reclasificar partidas o corregir registros invertidos.',
        suggestedActionTab: 'libroMayor'
      });
    });

    // Check 8: Cuentas No Imputables (Agrupación) con Movimientos
    if (auditData.groupingAccountsWithMovements.length > 0) {
      auditData.groupingAccountsWithMovements.forEach((item, idx) => {
        findingList.push({
          id: `FIND-GRP-${idx + 1}`,
          module: 'ESTRUCTURA_PLAN',
          severity: 'ALTO',
          title: `Imputación Errónea en Cuenta de Título/Agrupación [${item.acc.code}] ${item.acc.name}`,
          description: `La cuenta está configurada como NO IMPUTABLE (cuenta de agrupación) y registra ${item.linesCount} movimientos contables directos.`,
          accountCode: item.acc.code,
          accountName: item.acc.name,
          recommendation: 'Reasignar los asientos contables a las subcuentas analíticas correspondientes en el Plan de Cuentas.',
          suggestedActionTab: 'accounts'
        });
      });
    }

    // Check 9: Cuentas con Exigencia de Auxiliar sin RUT
    if (auditData.missingAuxiliaryLinesCount > 0) {
      findingList.push({
        id: 'FIND-AUX-001',
        module: 'AUXILIARES_ANALISIS',
        severity: 'MEDIO',
        title: `${auditData.missingAuxiliaryLinesCount} Asientos sin RUT en Cuentas que Exigen Auxiliar`,
        description: `Existen ${auditData.missingAuxiliaryLinesCount} líneas en cuentas contables configuradas con "Requiere Auxiliar Obligatorio" que no poseen RUT asociado, impidiendo el calce de cuentas corrientes de clientes o proveedores.`,
        recommendation: 'Completar el RUT de los auxiliares en los comprobantes correspondientes.',
        suggestedActionTab: 'analisisAuxiliares'
      });
    }

    // Check 10: Cuentas Bancarias con Inconsistencias
    if (auditData.bankAuditIssues.length > 0) {
      auditData.bankAuditIssues.forEach((issue, idx) => {
        findingList.push({
          id: `FIND-BNK-${idx + 1}`,
          module: 'BANCOS_CONCILIACION',
          severity: 'MEDIO',
          title: `Sobregiro Bancario no Formalizado en [${issue.account.code}]`,
          description: issue.issue,
          accountCode: issue.account.code,
          accountName: issue.account.name,
          impactAmount: Math.abs(issue.balance),
          recommendation: 'Reclasificar a Sobregiro Bancario en el Pasivo Corriente o revisar conciliación bancaria.',
          suggestedActionTab: 'conciliacionBancaria'
        });
      });
    }

    // Cálculo del Score de Calidad Contable (0 a 100)
    let score = 100;
    const criticalCount = findingList.filter(f => f.severity === 'CRITICO').length;
    const highCount = findingList.filter(f => f.severity === 'ALTO').length;
    const mediumCount = findingList.filter(f => f.severity === 'MEDIO').length;
    const infoCount = findingList.filter(f => f.severity === 'INFORMATIVO').length;

    score -= (criticalCount * 25);
    score -= (highCount * 10);
    score -= (mediumCount * 3);
    score -= (infoCount * 1);

    if (auditData.voucherCount === 0) {
      score = 50;
    }

    score = Math.max(0, Math.min(100, score));

    // Determinación de la Opinión de Auditoría
    let opinion: AuditOpinionType = 'LIMPIA';
    let risk: 'BAJO' | 'MODERADO' | 'ALTO' | 'CRITICO' = 'BAJO';

    if (auditData.voucherCount === 0) {
      opinion = 'ABSTENCION';
      risk = 'ALTO';
    } else if (criticalCount > 0 || score < 50) {
      opinion = 'ADVERSA';
      risk = 'CRITICO';
    } else if (highCount > 0 || score < 85) {
      opinion = 'SALVEDADES';
      risk = score < 70 ? 'ALTO' : 'MODERADO';
    } else {
      opinion = 'LIMPIA';
      risk = 'BAJO';
    }

    return {
      statementChecks: checks,
      findings: findingList,
      qualityScore: score,
      auditOpinion: opinion,
      riskLevel: risk
    };
  }, [auditData]);

  // Filtered findings based on UI controls
  const filteredFindings = useMemo(() => {
    return findings.filter(f => {
      if (severityFilter !== 'TODOS' && f.severity !== severityFilter) return false;
      if (moduleFilter !== 'TODOS' && f.module !== moduleFilter) return false;
      if (searchFilter.trim() !== '') {
        const q = searchFilter.toLowerCase();
        const matchTitle = f.title.toLowerCase().includes(q);
        const matchDesc = f.description.toLowerCase().includes(q);
        const matchAcc = (f.accountName || '').toLowerCase().includes(q) || (f.accountCode || '').includes(q);
        if (!matchTitle && !matchDesc && !matchAcc) return false;
      }
      return true;
    });
  }, [findings, severityFilter, moduleFilter, searchFilter]);

  // -------------------------------------------------------------
  // 3. EXPORTACIÓN A EXCEL (.XLSX) PROFESIONAL
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen y Dictamen
    const dictamenRows = [
      ['INFORME Y DICTAMEN DE AUDITORÍA DE ESTADOS FINANCIEROS'],
      ['Empresa / Razón Social:', company.name],
      ['RUT Empresa:', company.rut],
      ['Giro Comercial:', company.giro || 'No especificado'],
      ['Ejercicio Auditado:', selectedYear.toString()],
      ['Período Específico:', selectedPeriod],
      ['Fecha de Emisión del Informe:', new Date().toLocaleDateString('es-CL')],
      [''],
      ['RESULTADO DE LA AUDITORÍA'],
      ['Opinión de Auditoría:', auditOpinion === 'LIMPIA' ? 'OPINIÓN FAVORABLE / LIMPIA (SIN SALVEDADES)' : auditOpinion === 'SALVEDADES' ? 'OPINIÓN CON SALVEDADES' : auditOpinion === 'ADVERSA' ? 'OPINIÓN ADVERSA / DESFAVORABLE' : 'ABSTENCIÓN DE OPINIÓN'],
      ['Índice de Confiabilidad Contable:', `${qualityScore}%`],
      ['Nivel de Riesgo Global:', riskLevel],
      ['Comprobantes Contables Auditados:', auditData.voucherCount],
      ['Cuentas con Movimientos:', auditData.accountsUsedCount],
      ['Total Hallazgos Detectados:', findings.length],
      [''],
      ['SÍNTESIS DE CUADRATURAS PRINCIPALES'],
      ['Concepto', 'Columna A', 'Columna B', 'Diferencia', 'Estado'],
      ...statementChecks.map(c => [
        c.name,
        c.valueA,
        c.valueB,
        c.difference,
        c.status === 'PASSED' ? 'CUADRADO / CONFORME' : 'DESCUADRADO'
      ])
    ];
    const wsDictamen = XLSX.utils.aoa_to_sheet(dictamenRows);
    XLSX.utils.book_append_sheet(wb, wsDictamen, 'Dictamen_Auditoria');

    // Hoja 2: Matriz de Hallazgos y Riesgos
    const findingsRows = [
      ['ID', 'Módulo', 'Severidad', 'Título del Hallazgo', 'Descripción', 'Cuenta Código', 'Cuenta Nombre', 'Monto Impacto ($)', 'Recomendación Técnica'],
      ...findings.map(f => [
        f.id,
        f.module,
        f.severity,
        f.title,
        f.description,
        f.accountCode || '',
        f.accountName || '',
        f.impactAmount || 0,
        f.recommendation
      ])
    ];
    const wsFindings = XLSX.utils.aoa_to_sheet(findingsRows);
    XLSX.utils.book_append_sheet(wb, wsFindings, 'Matriz_Hallazgos');

    // Hoja 3: Cuentas Auditadas y Saldos
    const accountsRows = [
      ['Código', 'Nombre Cuenta', 'Tipo', 'Total Débitos', 'Total Créditos', 'Saldo Deudor', 'Saldo Acreedor', 'Activo', 'Pasivo', 'Pérdida', 'Ganancia', '¿Anomalía?', 'Detalle Anomalía'],
      ...auditData.auditedRows.map(r => [
        r.account.code,
        r.account.name,
        r.account.type,
        r.debit,
        r.credit,
        r.debtorBal,
        r.creditorBal,
        r.asset,
        r.liability,
        r.loss,
        r.gain,
        r.isAnomalous ? 'SÍ' : 'NO',
        r.anomalyReason || ''
      ])
    ];
    const wsAccounts = XLSX.utils.aoa_to_sheet(accountsRows);
    XLSX.utils.book_append_sheet(wb, wsAccounts, 'Cuentas_Auditadas');

    // Hoja 4: Ratios Financieros
    const ratiosRows = [
      ['Indicador Financiero', 'Valor Calculado', 'Unidad / Formato', 'Interpretación Técnica'],
      ['Razón Corriente (Liquidez)', auditData.currentRatio.toFixed(2), 'Veces', 'Capacidad de cubrir pasivos de corto plazo con activos corrientes'],
      ['Prueba Ácida', auditData.acidRatio.toFixed(2), 'Veces', 'Liquidez inmediata deduciendo inventarios'],
      ['Capital de Trabajo Neto', auditData.netWorkingCapital, 'Pesos Chilenos ($)', 'Fondos disponibles para la operación continua'],
      ['Razón de Endeudamiento / Apalancamiento', auditData.debtToEquityRatio.toFixed(2), 'Veces', 'Nivel de financiamiento externo respecto al patrimonio'],
      ['Margen Bruto sobre Ventas', `${auditData.grossMarginPercent.toFixed(1)}%`, 'Porcentaje', 'Rentabilidad directa de ventas sobre costos'],
      ['Margen Neto', `${auditData.netMarginPercent.toFixed(1)}%`, 'Porcentaje', 'Utilidad final sobre el volumen total de ventas'],
      ['Rentabilidad sobre Patrimonio (ROE)', `${auditData.roePercent.toFixed(1)}%`, 'Porcentaje', 'Rendimiento generado para los accionistas/dueños'],
      ['Rentabilidad sobre Activos (ROA)', `${auditData.roaPercent.toFixed(1)}%`, 'Porcentaje', 'Eficiencia en el uso del total de activos']
    ];
    const wsRatios = XLSX.utils.aoa_to_sheet(ratiosRows);
    XLSX.utils.book_append_sheet(wb, wsRatios, 'Ratios_Financieros');

    const cleanRut = (company.rut || 'empresa').replace(/[^0-9kK]/g, '');
    XLSX.writeFile(wb, `Informe_Auditoria_Estados_Financieros_${cleanRut}_${selectedYear}.xlsx`);
  };

  // -------------------------------------------------------------
  // 4. EXPORTACIÓN A PDF OFICIAL MEMBRETADO (jsPDF + autoTable)
  // -------------------------------------------------------------
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Encabezado Membretado Oficial
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORME DE AUDITORÍA INDEPENDIENTE DE ESTADOS FINANCIEROS', 14, 12);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`EMPRESA: ${company.name.toUpperCase()}  |  RUT: ${company.rut}  |  EJERCICIO: ${selectedYear}`, 14, 18);
    doc.text(`FECHA DE DICTAMEN: ${new Date().toLocaleDateString('es-CL')}  |  SISTEMA DE GESTIÓN CONTABLE Y AUDITORÍA GEST_OK`, 14, 23);

    // Caja de Opinión y Score
    let startY = 34;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('1. DICTAMEN Y OPINIÓN DEL AUDITOR', 14, startY);

    const opinionText = auditOpinion === 'LIMPIA'
      ? 'OPINIÓN FAVORABLE / LIMPIA (SIN SALVEDADES)'
      : auditOpinion === 'SALVEDADES'
      ? 'OPINIÓN CON SALVEDADES'
      : auditOpinion === 'ADVERSA'
      ? 'OPINIÓN DESFAVORABLE / ADVERSA'
      : 'ABSTENCIÓN DE OPINIÓN';

    autoTable(doc, {
      startY: startY + 3,
      head: [['Parámetro de Evaluación', 'Resultado / Dictamen de Auditoría']],
      body: [
        ['Tipo de Opinión', opinionText],
        ['Índice de Confiabilidad Contable', `${qualityScore}% / 100%`],
        ['Nivel de Riesgo Global', `${riskLevel} (Hallazgos Críticos: ${findings.filter(f => f.severity === 'CRITICO').length})`],
        ['Universo de Comprobantes Auditados', `${auditData.voucherCount} comprobantes analizados`],
        ['Cuentas Contables con Movimientos', `${auditData.accountsUsedCount} cuentas imputadas`],
        ['Resultado del Ejercicio Auditado', `$${auditData.netIncome.toLocaleString('es-CL')}`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
      margin: { left: 14, right: 14 }
    });

    // Párrafo de Fundamento de la Opinión
    const nextY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('2. FUNDAMENTO DE LA OPINIÓN Y RESUMEN EJECUTIVO', 14, nextY);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    const opinionParagraph = auditOpinion === 'LIMPIA'
      ? `En nuestra opinión profesional, los estados financieros adjuntos presentan razonablemente, en todos los aspectos significativos, la situación financiera y patrimonial de ${company.name} al 31 de diciembre de ${selectedYear}, así como el resultado de sus operaciones, de conformidad con las Normas Internacionales de Información Financiera (NIIF/IFRS) y la normativa tributaria chilena vigente.`
      : auditOpinion === 'SALVEDADES'
      ? `En nuestra opinión, excepto por los efectos de los asuntos descritos en la Matriz de Hallazgos adjunta (tales como cuentas con saldos anómalos o asientos pendientes de regularización), los estados financieros presentan razonablemente la situación patrimonial de ${company.name} para el ejercicio ${selectedYear}.`
      : `En nuestra opinión, debido a la importancia y materialidad de los descuadres en la partida doble o diferencias sustanciales entre los libros contables, los estados financieros NO presentan razonablemente la situación financiera de ${company.name} para el ejercicio ${selectedYear}.`;

    const splitText = doc.splitTextToSize(opinionParagraph, 182);
    doc.text(splitText, 14, nextY + 5);

    // Tabla de Cuadraturas
    const checksY = nextY + 5 + (splitText.length * 4) + 4;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('3. MATRIZ DE CUADRATURAS Y COMPROBACIONES TÉCNICAS', 14, checksY);

    autoTable(doc, {
      startY: checksY + 3,
      head: [['Comprobación Técnica', 'Columna A ($)', 'Columna B ($)', 'Diferencia ($)', 'Estado']],
      body: statementChecks.map(c => [
        c.name,
        c.valueA.toLocaleString('es-CL'),
        c.valueB.toLocaleString('es-CL'),
        c.difference.toLocaleString('es-CL'),
        c.status === 'PASSED' ? 'CONFORME' : 'DESCUADRADO'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 14, right: 14 }
    });

    // Matriz de Hallazgos
    const findingsY = (doc as any).lastAutoTable.finalY + 6;
    if (findingsY < 230) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('4. PRINCIPALES HALLAZGOS Y RECOMENDACIONES DE AUDITORÍA', 14, findingsY);

      autoTable(doc, {
        startY: findingsY + 3,
        head: [['Sev.', 'Módulo', 'Hallazgo', 'Impacto ($)', 'Recomendación Técnica']],
        body: findings.slice(0, 8).map(f => [
          f.severity,
          f.module,
          f.title,
          f.impactAmount ? `$${f.impactAmount.toLocaleString('es-CL')}` : '-',
          f.recommendation
        ]),
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 }
      });
    } else {
      doc.addPage();
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('4. PRINCIPALES HALLAZGOS Y RECOMENDACIONES DE AUDITORÍA', 14, 15);

      autoTable(doc, {
        startY: 18,
        head: [['Sev.', 'Módulo', 'Hallazgo', 'Impacto ($)', 'Recomendación Técnica']],
        body: findings.map(f => [
          f.severity,
          f.module,
          f.title,
          f.impactAmount ? `$${f.impactAmount.toLocaleString('es-CL')}` : '-',
          f.recommendation
        ]),
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 }
      });
    }

    // Pie de página / Firma
    const finalPageY = (doc as any).lastAutoTable.finalY + 15;
    if (finalPageY < 260) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('____________________________________', 120, finalPageY);
      doc.text('Auditor / Contador General Responsable', 120, finalPageY + 4);
      doc.text(`Gest_OK - Auditoría Contable y Tributaria`, 120, finalPageY + 8);
    }

    const cleanRut = (company.rut || 'empresa').replace(/[^0-9kK]/g, '');
    doc.save(`Dictamen_Auditoria_${cleanRut}_${selectedYear}.pdf`);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  return (
    <div className="space-y-4 pb-12">
      {/* 1. HERO HEADER DE AUDITORÍA */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-sm border border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg border border-indigo-400/30">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Auditor de Estados Financieros & Dictamen Profesional
              </h1>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl">
              Auditoría técnica automatizada de <strong className="text-white">Balance de 8 Columnas (Tributario)</strong>, <strong className="text-white">Balance IFRS</strong> y <strong className="text-white">Estado de Resultados</strong> para <strong className="text-indigo-200">{company.name}</strong> ({company.rut}). Evaluación de partida doble, cuadratura patrimonial, saldos anómalos y emisión de informe oficial.
            </p>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-600 flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Recalcular auditoría"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Recalcular</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Descargar Dictamen PDF</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="mt-4 pt-4 border-t border-slate-700/80 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-slate-300 font-medium">Ejercicio / Año:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 font-bold focus:ring-1 focus:ring-indigo-400 focus:outline-hidden"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>Año Fiscal {yr}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-slate-300 font-medium">Período Mensual:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 font-medium focus:ring-1 focus:ring-indigo-400 focus:outline-hidden"
              >
                <option value="TODOS">Todo el Ejercicio {selectedYear}</option>
                {availablePeriodsForYear.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-300">
              Comprobantes: <strong className="text-white">{auditData.voucherCount}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">
              Cuentas con Saldo: <strong className="text-white">{auditData.accountsUsedCount}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">
              Resultado Neto: <strong className={auditData.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                ${auditData.netIncome.toLocaleString('es-CL')}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 2. TABLERO RESUMEN DE DICTAMEN Y CONFIABILIDAD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        {/* Card 1: Opinión de Auditoría */}
        <div className={`p-4 rounded-2xl border transition-all ${
          auditOpinion === 'LIMPIA' 
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : auditOpinion === 'SALVEDADES'
            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
            : auditOpinion === 'ADVERSA'
            ? 'bg-rose-50/70 border-rose-200 text-rose-950'
            : 'bg-slate-100 border-slate-300 text-slate-900'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Dictamen del Auditor
            </span>
            {auditOpinion === 'LIMPIA' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : auditOpinion === 'SALVEDADES' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600" />
            )}
          </div>
          <div className="text-base font-black">
            {auditOpinion === 'LIMPIA' && 'Opinión Favorable (Limpia)'}
            {auditOpinion === 'SALVEDADES' && 'Opinión con Salvedades'}
            {auditOpinion === 'ADVERSA' && 'Opinión Desfavorable (Adversa)'}
            {auditOpinion === 'ABSTENCION' && 'Abstención de Opinión'}
          </div>
          <p className="text-[11px] text-slate-600 mt-1 leading-snug">
            {auditOpinion === 'LIMPIA' && 'Estados financieros presentan razonablemente la situación patrimonial.'}
            {auditOpinion === 'SALVEDADES' && `${findings.filter(f => f.severity === 'ALTO' || f.severity === 'MEDIO').length} excepciones detectadas que requieren atención.`}
            {auditOpinion === 'ADVERSA' && 'Descuadres materiales o inconsistencias graves en partida doble.'}
            {auditOpinion === 'ABSTENCION' && 'Sin registros contables suficientes en el período.'}
          </p>
        </div>

        {/* Card 2: Confiabilidad Contable */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Score de Confiabilidad
            </span>
            <Award className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{qualityScore}%</span>
            <span className="text-xs text-slate-500 font-medium">/ 100%</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                qualityScore >= 90 ? 'bg-emerald-500' : qualityScore >= 75 ? 'bg-indigo-500' : qualityScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${qualityScore}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 mt-1.5 flex justify-between">
            <span>Riesgo: <strong className={riskLevel === 'BAJO' ? 'text-emerald-700' : riskLevel === 'MODERADO' ? 'text-amber-700' : 'text-rose-700'}>{riskLevel}</strong></span>
            <span>{statementChecks.filter(c => c.status === 'PASSED').length}/{statementChecks.length} Cuadraturas OK</span>
          </div>
        </div>

        {/* Card 3: Hallazgos & Alertas */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Hallazgos Detectados
            </span>
            <AlertOctagon className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{findings.length}</div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px]">
            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 font-bold rounded">
              {findings.filter(f => f.severity === 'CRITICO').length} Críticos
            </span>
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded">
              {findings.filter(f => f.severity === 'ALTO').length} Altos
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 font-bold rounded">
              {findings.filter(f => f.severity === 'MEDIO').length} Medios
            </span>
          </div>
        </div>

        {/* Card 4: Cuadratura Patrimonial */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Partida Doble & Balance
            </span>
            <Scale className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-xs font-semibold text-slate-800">
            {auditData.balance8SquareDiff < 0.01 ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <Check className="w-4 h-4" /> 100% Cuadrado
              </span>
            ) : (
              <span className="text-rose-600 font-bold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Descuadre: ${auditData.balance8SquareDiff.toLocaleString('es-CL')}
              </span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Total Débitos:</span>
              <span className="font-mono font-bold text-slate-700">${auditData.sumTotalDebits.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Créditos:</span>
              <span className="font-mono font-bold text-slate-700">${auditData.sumTotalCredits.toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. NAVEGACIÓN DE VISTAS INTERNAS DEL AUDITOR */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveViewTab('dictamen')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors ${
            activeViewTab === 'dictamen'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Dictamen & Resumen Ejecutivo</span>
        </button>
        <button
          onClick={() => setActiveViewTab('cuadraturas')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors ${
            activeViewTab === 'cuadraturas'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Matriz de Cuadraturas ({statementChecks.length})</span>
        </button>
        <button
          onClick={() => setActiveViewTab('hallazgos')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors ${
            activeViewTab === 'hallazgos'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <AlertOctagon className="w-3.5 h-3.5" />
          <span>Matriz de Hallazgos y Riesgos ({findings.length})</span>
        </button>
        <button
          onClick={() => setActiveViewTab('ratios')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors ${
            activeViewTab === 'ratios'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Ratios de Salud Financiera</span>
        </button>
        <button
          onClick={() => setActiveViewTab('informe_oficial')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors ${
            activeViewTab === 'informe_oficial'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Vista Previa de Informe Formal</span>
        </button>
      </div>

      {/* 4. CONTENIDOS DE LAS PESTAÑAS */}

      {/* A. VISTA: DICTAMEN & RESUMEN EJECUTIVO */}
      {activeViewTab === 'dictamen' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Informe de Auditoría Independiente sobre los Estados Financieros
                </h2>
                <p className="text-xs text-slate-500">
                  Dirigido al Directorio, Accionistas y Gerencia General de {company.name}
                </p>
              </div>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-bold">
                Ejercicio Fiscal {selectedYear}
              </span>
            </div>

            {/* Párrafo de Opinión Formal */}
            <div className={`p-4 rounded-xl border ${
              auditOpinion === 'LIMPIA'
                ? 'bg-emerald-50/50 border-emerald-200'
                : auditOpinion === 'SALVEDADES'
                ? 'bg-amber-50/50 border-amber-200'
                : 'bg-rose-50/50 border-rose-200'
            }`}>
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-900 mb-1 flex items-center gap-1.5">
                <span>Opinión del Auditor:</span>
                <span className={auditOpinion === 'LIMPIA' ? 'text-emerald-700' : auditOpinion === 'SALVEDADES' ? 'text-amber-700' : 'text-rose-700'}>
                  {auditOpinion === 'LIMPIA' && 'Favorable / Sin Salvedades'}
                  {auditOpinion === 'SALVEDADES' && 'Con Salvedades'}
                  {auditOpinion === 'ADVERSA' && 'Desfavorable / Adversa'}
                  {auditOpinion === 'ABSTENCION' && 'Abstención'}
                </span>
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed">
                Hemos auditado los estados financieros de <strong>{company.name}</strong> (RUT: {company.rut}), que comprenden el <strong>Balance General de 8 Columnas (Tributario)</strong>, el <strong>Estado de Situación Financiera Clasificado (IFRS)</strong> y el <strong>Estado de Resultados</strong> por el período terminado al 31 de diciembre de {selectedYear}.
              </p>
              <p className="text-xs text-slate-700 leading-relaxed mt-2">
                {auditOpinion === 'LIMPIA' && (
                  <span>En nuestra opinión, los estados financieros antes mencionados presentan razonablemente, en todos los aspectos significativos, la situación patrimonial y financiera de la entidad al 31 de diciembre de {selectedYear}, así como el resultado de sus operaciones, de conformidad con los principios y normativas contables vigentes en Chile.</span>
                )}
                {auditOpinion === 'SALVEDADES' && (
                  <span>En nuestra opinión, <strong>excepto por los efectos de los asuntos descritos en la sección de Hallazgos</strong> (relativos a saldos anómalos o análisis pendientes de regularización), los estados financieros presentan razonablemente la situación financiera de {company.name}.</span>
                )}
                {auditOpinion === 'ADVERSA' && (
                  <span>En nuestra opinión, debido a la significatividad de los descuadres detectados en la partida doble o en la conciliación del balance, los estados financieros <strong>no presentan razonablemente</strong> la situación financiera de la entidad.</span>
                )}
                {auditOpinion === 'ABSTENCION' && (
                  <span>No ha sido posible emitir una opinión debido a la inexistencia de suficientes comprobantes y registros contables para el ejercicio auditado.</span>
                )}
              </p>
            </div>

            {/* Asuntos Clave de Auditoría (KAM) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-indigo-600" />
                  <span>Resumen de Cuadraturas del Balance</span>
                </h4>
                <div className="text-xs space-y-1.5 text-slate-600">
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span>Partida Doble (Débitos vs Créditos):</span>
                    <strong className="font-mono text-slate-800">
                      ${auditData.sumTotalDebits.toLocaleString('es-CL')} / ${auditData.sumTotalCredits.toLocaleString('es-CL')}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span>Resultado Inventario (Activo - Pasivo):</span>
                    <strong className="font-mono text-slate-800">${auditData.diffInventory.toLocaleString('es-CL')}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span>Resultado Económico (Ganancia - Pérdida):</span>
                    <strong className="font-mono text-slate-800">${auditData.diffResult.toLocaleString('es-CL')}</strong>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span>Diferencia de Cuadratura:</span>
                    <strong className={`font-mono ${auditData.balance8SquareDiff < 0.01 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}`}>
                      ${auditData.balance8SquareDiff.toLocaleString('es-CL')}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>Resumen del Estado de Resultados (P&L)</span>
                </h4>
                <div className="text-xs space-y-1.5 text-slate-600">
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span>Ingresos Operacionales (Ventas):</span>
                    <strong className="font-mono text-slate-800">${auditData.totalRevenue.toLocaleString('es-CL')}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span>Costos de Explotación:</span>
                    <strong className="font-mono text-slate-800">${auditData.totalCostOfSales.toLocaleString('es-CL')}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span>Margen Bruto:</span>
                    <strong className="font-mono text-slate-800">${auditData.grossMargin.toLocaleString('es-CL')}</strong>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span>Utilidad / Pérdida Neta del Ejercicio:</span>
                    <strong className={`font-mono font-bold ${auditData.netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      ${auditData.netIncome.toLocaleString('es-CL')}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* B. VISTA: MATRIZ DE CUADRATURAS */}
      {activeViewTab === 'cuadraturas' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-900">
                  Pruebas Sustantivas de Cuadratura y Ecuaciones Contables
                </h3>
                <p className="text-[11px] text-slate-500">
                  Verificación matemática automática de partida doble, inventarios, estado de situación IFRS y P&L.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                {statementChecks.filter(c => c.status === 'PASSED').length} de {statementChecks.length} Conformes
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {statementChecks.map((check, idx) => (
                <div key={idx} className="p-4 hover:bg-slate-50/80 transition-colors space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {check.status === 'PASSED' ? (
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                          <XCircle className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{check.name}</h4>
                        <p className="text-[11px] text-slate-500">{check.explanation}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                        check.status === 'PASSED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {check.status === 'PASSED' ? 'CUADRADO' : 'DESCUADRADO'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs font-mono">
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 block font-sans">{check.labelA}:</span>
                      <span className="font-bold text-slate-800">${check.valueA.toLocaleString('es-CL')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 block font-sans">{check.labelB}:</span>
                      <span className="font-bold text-slate-800">${check.valueB.toLocaleString('es-CL')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 block font-sans">Diferencia Neta:</span>
                      <span className={`font-bold ${check.difference < 0.01 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        ${check.difference.toLocaleString('es-CL')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* C. VISTA: MATRIZ DE HALLAZGOS Y RIESGOS */}
      {activeViewTab === 'hallazgos' && (
        <div className="space-y-3">
          {/* Controls & Search */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 ml-1" />
              <input
                type="text"
                placeholder="Filtrar hallazgo por título, descripción o código de cuenta..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Severidad:</span>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-1 font-semibold"
                >
                  <option value="TODOS">Todas las Severidades</option>
                  <option value="CRITICO">Crítico</option>
                  <option value="ALTO">Alto</option>
                  <option value="MEDIO">Medio</option>
                  <option value="INFORMATIVO">Informativo</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Módulo:</span>
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-1 font-semibold"
                >
                  <option value="TODOS">Todos los Módulos</option>
                  <option value="BALANCE_8_COL">Balance 8 Columnas</option>
                  <option value="BALANCE_IFRS">Balance IFRS</option>
                  <option value="ESTADO_RESULTADOS">Estado de Resultados</option>
                  <option value="ESTRUCTURA_PLAN">Plan de Cuentas</option>
                  <option value="AUXILIARES_ANALISIS">Auxiliares & RUT</option>
                  <option value="BANCOS_CONCILIACION">Bancos & Conciliación</option>
                </select>
              </div>
            </div>
          </div>

          {/* List of findings */}
          <div className="space-y-2.5">
            {filteredFindings.length > 0 ? (
              filteredFindings.map(finding => (
                <div
                  key={finding.id}
                  className={`p-4 rounded-2xl border transition-all bg-white shadow-2xs ${
                    finding.severity === 'CRITICO'
                      ? 'border-rose-300 hover:border-rose-400'
                      : finding.severity === 'ALTO'
                      ? 'border-amber-300 hover:border-amber-400'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          finding.severity === 'CRITICO'
                            ? 'bg-rose-100 text-rose-800'
                            : finding.severity === 'ALTO'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {finding.severity}
                        </span>

                        <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {finding.module}
                        </span>

                        {finding.accountCode && (
                          <span className="text-[11px] font-mono font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded">
                            [{finding.accountCode}] {finding.accountName}
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-slate-900">{finding.title}</h4>
                      <p className="text-xs text-slate-600">{finding.description}</p>

                      <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-900">Recomendación Técnica del Auditor:</strong>{' '}
                          {finding.recommendation}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-2">
                      {finding.impactAmount !== undefined && (
                        <div className="text-xs font-mono font-bold text-slate-800">
                          <span className="text-[10px] text-slate-400 block font-sans font-normal">Impacto:</span>
                          ${finding.impactAmount.toLocaleString('es-CL')}
                        </div>
                      )}

                      {finding.suggestedActionTab && onNavigateTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateTab(finding.suggestedActionTab!)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <span>Ir a Resolver</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">No se encontraron hallazgos con los filtros seleccionados</h4>
                <p className="text-xs text-slate-500">
                  La estructura y los registros contables evaluados cumplen con las normas técnicas de auditoría.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* D. VISTA: RATIOS DE SALUD FINANCIERA */}
      {activeViewTab === 'ratios' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Liquidez Corriente */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Liquidez Corriente (Razón Corriente)
              </span>
              <div className="text-2xl font-black text-slate-900">
                {auditData.currentRatio.toFixed(2)}x
              </div>
              <p className="text-[11px] text-slate-500">
                Activo Corriente (${auditData.ifrsCurrentAssets.toLocaleString('es-CL')}) / Pasivo Corriente (${auditData.ifrsCurrentLiabilities.toLocaleString('es-CL')}).
              </p>
              <div className="pt-2 text-[11px]">
                {auditData.currentRatio >= 1.5 ? (
                  <span className="text-emerald-700 font-bold">🟢 Nivel Saludable de Liquidez</span>
                ) : auditData.currentRatio >= 1.0 ? (
                  <span className="text-amber-700 font-bold">🟡 Liquidez Ajustada</span>
                ) : (
                  <span className="text-rose-700 font-bold">🔴 Déficit de Capital de Trabajo</span>
                )}
              </div>
            </div>

            {/* Prueba Ácida */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Prueba Ácida (Quick Ratio)
              </span>
              <div className="text-2xl font-black text-slate-900">
                {auditData.acidRatio.toFixed(2)}x
              </div>
              <p className="text-[11px] text-slate-500">
                Capacidad de pago inmediata sin depender de la realización de inventarios.
              </p>
              <div className="pt-2 text-[11px]">
                {auditData.acidRatio >= 1.0 ? (
                  <span className="text-emerald-700 font-bold">🟢 Cobertura Inmediata Óptima</span>
                ) : (
                  <span className="text-amber-700 font-bold">🟡 Dependencia de Cobranza/Rotación</span>
                )}
              </div>
            </div>

            {/* Capital de Trabajo */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Capital de Trabajo Neto
              </span>
              <div className={`text-2xl font-black ${auditData.netWorkingCapital >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                ${auditData.netWorkingCapital.toLocaleString('es-CL')}
              </div>
              <p className="text-[11px] text-slate-500">
                Fondo operacional disponible para sostener el ciclo de caja del negocio.
              </p>
            </div>
          </div>

          {/* Ratios de Rentabilidad */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Márgenes de Rentabilidad y Retorno</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Margen Bruto</span>
                <span className="text-lg font-black text-slate-900">{auditData.grossMarginPercent.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Margen sobre Ventas</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Margen Neto</span>
                <span className={`text-lg font-black ${auditData.netMarginPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {auditData.netMarginPercent.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Utilidad Neta / Ventas</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">ROE (Retorno Patrimonio)</span>
                <span className={`text-lg font-black ${auditData.roePercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {auditData.roePercent.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Rendimiento para Socios</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Apalancamiento (D/E)</span>
                <span className="text-lg font-black text-slate-900">{auditData.debtToEquityRatio.toFixed(2)}x</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Pasivo Total / Patrimonio</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* E. VISTA: VISTA PREVIA DE INFORME FORMAL */}
      {activeViewTab === 'informe_oficial' && (
        <div className="bg-white p-8 rounded-2xl border border-slate-300 shadow-md max-w-4xl mx-auto space-y-6 text-slate-800 font-sans">
          {/* Header Membretado */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                INFORME DE LOS AUDITORES INDEPENDIENTES
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Al Directorio y Accionistas de <strong>{company.name}</strong>
              </p>
              <p className="text-xs text-slate-500">
                RUT: {company.rut} | Giro: {company.giro || 'Servicios Generales'}
              </p>
            </div>
            <div className="text-right text-xs">
              <span className="font-bold text-slate-900 block">DICTAMEN OFICIAL</span>
              <span className="text-slate-500">{new Date().toLocaleDateString('es-CL')}</span>
            </div>
          </div>

          {/* Cuerpo del Dictamen */}
          <div className="space-y-4 text-xs leading-relaxed text-slate-700">
            <div>
              <h3 className="font-bold uppercase text-slate-900 mb-1">Opinión</h3>
              <p>
                Hemos efectuado una auditoría a los estados financieros de <strong>{company.name}</strong>, que comprenden el Balance General de 8 Columnas, el Estado de Situación Financiera Clasificado IFRS y el correspondiente Estado de Resultados por el ejercicio terminado el 31 de diciembre de {selectedYear}.
              </p>
              <p className="mt-2 font-semibold">
                En nuestra opinión profesional, {auditOpinion === 'LIMPIA' 
                  ? 'los estados financieros antes mencionados presentan razonablemente, en todos los aspectos materiales y significativos, la situación patrimonial y financiera de la sociedad, así como los resultados de sus operaciones para el período finalizado, de acuerdo con los principios de contabilidad generalmente aceptados y las normas IFRS/NIIF.' 
                  : auditOpinion === 'SALVEDADES' 
                  ? 'excepto por los asuntos descritos en el párrafo de Fundamento de la Opinión con Salvedades, los estados financieros presentan razonablemente la situación financiera de la entidad.' 
                  : 'debido a los descalces materiales identificados en los registros, los estados financieros NO reflejan fielmente la situación financiera de la empresa.'}
              </p>
            </div>

            <div>
              <h3 className="font-bold uppercase text-slate-900 mb-1">Resumen de Cuadraturas del Ejercicio</h3>
              <table className="w-full border border-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="p-2 text-left border">Prueba de Cuadratura</th>
                    <th className="p-2 text-right border">Débitos / Activo ($)</th>
                    <th className="p-2 text-right border">Créditos / Pasivo ($)</th>
                    <th className="p-2 text-right border">Diferencia ($)</th>
                    <th className="p-2 text-center border">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {statementChecks.map((c, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 border">{c.name}</td>
                      <td className="p-2 text-right font-mono border">${c.valueA.toLocaleString('es-CL')}</td>
                      <td className="p-2 text-right font-mono border">${c.valueB.toLocaleString('es-CL')}</td>
                      <td className="p-2 text-right font-mono border font-bold">${c.difference.toLocaleString('es-CL')}</td>
                      <td className="p-2 text-center border font-bold">
                        <span className={c.status === 'PASSED' ? 'text-emerald-700' : 'text-rose-700'}>
                          {c.status === 'PASSED' ? 'CONFORME' : 'DESCUADRE'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-bold uppercase text-slate-900 mb-1">Matriz de Hallazgos y Observaciones Relevantes</h3>
              {findings.length > 0 ? (
                <div className="space-y-2">
                  {findings.map(f => (
                    <div key={f.id} className="p-2.5 bg-slate-50 border rounded-lg text-xs space-y-0.5">
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>[{f.severity}] {f.title}</span>
                        {f.impactAmount && <span className="font-mono">${f.impactAmount.toLocaleString('es-CL')}</span>}
                      </div>
                      <p className="text-slate-600">{f.description}</p>
                      <p className="text-indigo-800 font-medium pt-0.5">Recomendación: {f.recommendation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 italic">No se determinaron excepciones materiales durante el proceso de auditoría.</p>
              )}
            </div>

            {/* Firma */}
            <div className="pt-10 flex justify-between items-end border-t border-slate-200 mt-8">
              <div className="text-[11px] text-slate-500">
                Informe emitido automáticamente mediante el módulo de Auditoría Gest_OK.
              </div>
              <div className="text-center space-y-1">
                <div className="w-48 border-b border-slate-800 mx-auto" />
                <div className="font-bold text-slate-900 text-xs">Auditor / Contador General</div>
                <div className="text-[10px] text-slate-500">Gest_OK Contabilidad y Gestión</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
