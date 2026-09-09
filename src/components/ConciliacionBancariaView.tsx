import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, doc, setDoc, query, where } from 'firebase/firestore';
import {
  Company,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  BankStatementLine,
  BankReconciliation,
  FiscalPeriodYear,
  Auxiliary,
  RCVDocument,
  CostCenterMaster,
  ExpenseItemMaster,
  ProjectMaster,
  ProductMaster,
  CustomAnalysisTableItem
} from '../types';
import { checkIsPeriodClosed, getLatestOpenPeriod, getNextOpenPeriodAndDate } from '../utils/periodUtils';
import { logAuditEvent } from '../utils/auditLogger';
import { sanitizeVoucherLines } from '../utils/voucherValidation';
import {
  getPreviousPeriod,
  getNextPeriod,
  recalculateRunningBalances,
  sanitizeForFirestore,
  calculateReconciliationMath,
  getDuplicateVouchersMap
} from '../utils/bankReconciliationUtils';
import {
  Filter,
  Calendar,
  Search,
  X,
  AlertTriangle,
  Trash2,
  CheckSquare,
  Square,
  ChevronDown,
  RefreshCw,
  SlidersHorizontal,
  Check,
  ArrowRight,
  Columns,
  Rows,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ImportCSVModal, ManualMatchModal, QuickVoucherModal } from './BankReconciliationModals';
import AutoRutMatchModal from './AutoRutMatchModal';
import BankCartolaSmartImportModal from './BankCartolaSmartImportModal';
import PendingItemsReportModal from './PendingItemsReportModal';
import { parseChileanNumber } from '../utils/bankCartolaParser';

const MONTH_NAMES: { [key: string]: string } = {
  '01': 'Enero',
  '02': 'Febrero',
  '03': 'Marzo',
  '04': 'Abril',
  '05': 'Mayo',
  '06': 'Junio',
  '07': 'Julio',
  '08': 'Agosto',
  '09': 'Septiembre',
  '10': 'Octubre',
  '11': 'Noviembre',
  '12': 'Diciembre'
};

const ALL_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

interface ConciliacionBancariaViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  auxiliaries?: Auxiliary[];
  rcvDocuments?: RCVDocument[];
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
  projects?: ProjectMaster[];
  products?: ProductMaster[];
  customAnalysisItems?: CustomAnalysisTableItem[];
  onVouchersUpdated?: () => void;
}

export default function ConciliacionBancariaView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears,
  auxiliaries = [],
  rcvDocuments = [],
  costCenters = [],
  expenseItems = [],
  projects = [],
  products = [],
  customAnalysisItems = [],
  onVouchersUpdated
}: ConciliacionBancariaViewProps) {
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => getLatestOpenPeriod(fiscalYears));

  // Default selectedPeriod to latest open accounting period whenever fiscalYears loads or updates
  useEffect(() => {
    if (fiscalYears && fiscalYears.length > 0) {
      const latestOpen = getLatestOpenPeriod(fiscalYears);
      if (latestOpen && (!selectedPeriod || selectedPeriod === new Date().toISOString().slice(0, 7))) {
        setSelectedPeriod(latestOpen);
      }
    }
  }, [fiscalYears]);
  const [statementLines, setStatementLines] = useState<BankStatementLine[]>([]);
  const [bankInitialBalanceInput, setBankInitialBalanceInput] = useState<number>(0);
  const [bankFinalBalanceInput, setBankFinalBalanceInput] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [savedReconciliations, setSavedReconciliations] = useState<BankReconciliation[]>([]);
  const [cartolaViewMode, setCartolaViewMode] = useState<'MES_ACTUAL' | 'CARTOLA_HISTORICA_UNIDA'>('MES_ACTUAL');

  // Auto-Save Status Tracking
  const [autoSaveStatus, setAutoSaveStatus] = useState<'SAVED' | 'SAVING' | 'ERROR' | 'IDLE'>('SAVED');
  const [lastSavedTime, setLastSavedTime] = useState<string>(() => new Date().toLocaleTimeString('es-CL'));
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Scopes and filters
  const [voucherPeriodScope, setVoucherPeriodScope] = useState<'PENDIENTES_TODOS' | 'PERIODO_ACTUAL' | 'HASTA_ACTUAL' | 'ANIO_ACTUAL' | 'TODOS'>('PENDIENTES_TODOS');
  const [filterStatement, setFilterStatement] = useState<'Todos' | 'Conciliados' | 'Pendiente' | 'Duplicados'>('Todos');
  const [filterVouchers, setFilterVouchers] = useState<'Todos' | 'Conciliados' | 'Pendiente'>('Todos');
  const [statementSearchQuery, setStatementSearchQuery] = useState<string>('');
  const [voucherSearchQuery, setVoucherSearchQuery] = useState<string>('');

  // Excel-like Filters for Cartola Bancaria
  const [cartolaYearFilter, setCartolaYearFilter] = useState<string>('TODOS');
  const [cartolaSelectedMonths, setCartolaSelectedMonths] = useState<string[]>([]); // Empty means all months
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState<boolean>(false);

  // Modals
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showSmartImportModal, setShowSmartImportModal] = useState<boolean>(false);
  const [showAutoRutModal, setShowAutoRutModal] = useState<boolean>(false);
  const [showPendingReportModal, setShowPendingReportModal] = useState<boolean>(false);
  const [pastedCSV, setPastedCSV] = useState<string>('');
  const [importInitialBalance, setImportInitialBalance] = useState<number>(0);

  const [manualMatchLine, setManualMatchLine] = useState<BankStatementLine | null>(null);
  const [modalScope, setModalScope] = useState<'TODOS_PENDIENTES' | 'ESTE_MES' | 'MESES_POSTERIORES' | 'MESES_ANTERIORES'>('TODOS_PENDIENTES');
  const [modalExactOnly, setModalExactOnly] = useState<boolean>(true);
  const [modalSearch, setModalSearch] = useState<string>('');

  const [quickVoucherLine, setQuickVoucherLine] = useState<BankStatementLine | null>(null);
  const [quickExpenseAccountId, setQuickExpenseAccountId] = useState<string>('');
  const [quickGloss, setQuickGloss] = useState<string>('');
  const [quickVoucherPeriod, setQuickVoucherPeriod] = useState<string>('');

  // Right Vertical Summary Sidebar State: 'collapsed' | 'normal' | 'expanded'
  const [summaryPanelState, setSummaryPanelState] = useState<'collapsed' | 'normal' | 'expanded'>('normal');

  // Dual Panels Layout: 'side-by-side' (Lado a Lado) | 'stacked' (Arriba / Abajo)
  const [panelsLayout, setPanelsLayout] = useState<'side-by-side' | 'stacked'>('side-by-side');

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Bank Accounts from chart of accounts
  const bankAccounts = useMemo(() => {
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

  // Set default bank account
  useEffect(() => {
    if (bankAccounts.length > 0 && !selectedBankAccountId) {
      setSelectedBankAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankAccountId]);

  const selectedBankAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedBankAccountId);
  }, [accounts, selectedBankAccountId]);

  const previousPeriod = useMemo(() => getPreviousPeriod(selectedPeriod), [selectedPeriod]);

  // Fetch Existing Reconciliations from Firestore and calculate chained balances
  const fetchReconciliations = async (targetPeriod?: string) => {
    try {
      const snap = await getDocs(collection(companyRef, 'bankReconciliations'));
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as BankReconciliation));
      setSavedReconciliations(recs);

      const activePeriod = targetPeriod || selectedPeriod;
      const prevPeriodStr = getPreviousPeriod(activePeriod);

      // Sort all previous reconciliations for this account chronologically
      const prevRec = recs.find(r => r.bankAccountId === selectedBankAccountId && r.period === prevPeriodStr);
      const autoInitialBalance = prevRec ? prevRec.bankFinalBalance : 0;

      // Load matching reconciliation if exists for current account and period
      const existing = recs.find(r => r.bankAccountId === selectedBankAccountId && r.period === activePeriod);
      if (existing) {
        setStatementLines(existing.lines || []);
        const initBal = existing.bankInitialBalance !== undefined ? existing.bankInitialBalance : autoInitialBalance;
        setBankInitialBalanceInput(initBal);
        setBankFinalBalanceInput(existing.bankFinalBalance || 0);
        setNotes(existing.notes || '');
      } else {
        setStatementLines([]);
        setBankInitialBalanceInput(autoInitialBalance);
        setBankFinalBalanceInput(autoInitialBalance);
        setNotes('');
      }
    } catch (err) {
      console.error('Error loading bank reconciliations:', err);
    }
  };

  useEffect(() => {
    if (selectedBankAccountId) {
      fetchReconciliations();
    }
  }, [selectedBankAccountId, selectedPeriod]);

  // Set of voucher IDs currently matched in the active in-memory cartola
  const currentMatchedVoucherIds = useMemo(() => {
    return new Set(
      statementLines.filter(l => l.matchedStatus === 'Conciliado' && l.matchedVoucherId).map(l => l.matchedVoucherId!)
    );
  }, [statementLines]);

  const currentRecId = `${selectedBankAccount?.code}_${selectedPeriod}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Map of voucher IDs matched in OTHER saved periods: voucherId -> { period, voucherNumber }
  const otherPeriodsMatchedVouchers = useMemo(() => {
    const map = new Map<string, { period: string; voucherNumber?: number }>();
    savedReconciliations.forEach(r => {
      if (r.bankAccountId === selectedBankAccountId && r.id !== currentRecId && r.lines) {
        r.lines.forEach(l => {
          if (l.matchedStatus === 'Conciliado' && l.matchedVoucherId) {
            map.set(l.matchedVoucherId, { period: r.period, voucherNumber: l.matchedVoucherNumber });
          }
        });
      }
    });
    return map;
  }, [savedReconciliations, selectedBankAccountId, currentRecId]);

  // All Bank Vouchers in accounting (any period)
  const allBankVouchers = useMemo(() => {
    const list: {
      voucher: Voucher;
      line: any;
      debit: number;
      credit: number;
      date: string;
      period: string;
      gloss: string;
      isMatchedInCurrent: boolean;
      isMatchedInOther: boolean;
      matchedInOtherPeriod?: string;
    }[] = [];

    if (!selectedBankAccount) return list;

    vouchers.forEach(v => {
      if (v.status !== 'Anulado') {
        const vDate = v.date || '';
        const vPeriod = v.period || vDate.slice(0, 7) || 'S/P';
        v.lines.forEach(l => {
          if (l.accountId === selectedBankAccount.id || l.accountCode === selectedBankAccount.code) {
            const isMatchedInCurrent = currentMatchedVoucherIds.has(v.id);
            const otherMatch = otherPeriodsMatchedVouchers.get(v.id);
            list.push({
              voucher: v,
              line: l,
              debit: l.debit || 0,
              credit: l.credit || 0,
              date: v.date,
              period: vPeriod,
              gloss: l.gloss || v.gloss,
              isMatchedInCurrent,
              isMatchedInOther: !isMatchedInCurrent && !!otherMatch,
              matchedInOtherPeriod: otherMatch?.period
            });
          }
        });
      }
    });

    list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }, [vouchers, selectedBankAccount, currentMatchedVoucherIds, otherPeriodsMatchedVouchers]);

  // Filtered Vouchers for Right Column view
  const filteredBankVouchers = useMemo(() => {
    let list = allBankVouchers;

    if (voucherPeriodScope === 'PERIODO_ACTUAL') {
      list = list.filter(bv => bv.period === selectedPeriod);
    } else if (voucherPeriodScope === 'HASTA_ACTUAL') {
      list = list.filter(bv => bv.period <= selectedPeriod);
    } else if (voucherPeriodScope === 'ANIO_ACTUAL') {
      const year = selectedPeriod.slice(0, 4);
      list = list.filter(bv => bv.period.startsWith(year));
    } else if (voucherPeriodScope === 'PENDIENTES_TODOS') {
      list = list.filter(bv => !bv.isMatchedInOther);
    }

    if (filterVouchers === 'Conciliados') {
      list = list.filter(bv => bv.isMatchedInCurrent || bv.isMatchedInOther);
    } else if (filterVouchers === 'Pendiente') {
      list = list.filter(bv => !bv.isMatchedInCurrent && !bv.isMatchedInOther);
    }

    if (voucherSearchQuery.trim()) {
      const q = voucherSearchQuery.toLowerCase().trim();
      list = list.filter(bv =>
        String(bv.voucher.voucherNumber || '').includes(q) ||
        (bv.gloss || '').toLowerCase().includes(q) ||
        (bv.date || '').includes(q) ||
        (bv.period || '').includes(q) ||
        String(bv.debit || 0).includes(q) ||
        String(bv.credit || 0).includes(q)
      );
    }

    return list;
  }, [allBankVouchers, voucherPeriodScope, filterVouchers, voucherSearchQuery, selectedPeriod]);

  // Calculate Book Balance (Saldo según Libro Mayor) for the bank account up to selected period
  const bookFinalBalance = useMemo(() => {
    if (!selectedBankAccount) return 0;
    let totalDebit = 0;
    let totalCredit = 0;

    vouchers.forEach(v => {
      if (v.status !== 'Anulado') {
        const vPeriod = v.period || v.date.slice(0, 7);
        if (vPeriod <= selectedPeriod) {
          v.lines.forEach(l => {
            if (l.accountId === selectedBankAccount.id || l.accountCode === selectedBankAccount.code) {
              totalDebit += l.debit || 0;
              totalCredit += l.credit || 0;
            }
          });
        }
      }
    });

    return totalDebit - totalCredit;
  }, [vouchers, selectedBankAccount, selectedPeriod]);

  // All Statement Lines across all saved periods plus active period (Deduplicated canonical registry)
  const allStatementLines = useMemo(() => {
    if (!selectedBankAccount) return [];

    const map = new Map<string, BankStatementLine & { period: string }>();

    const getFp = (l: BankStatementLine) =>
      `${(l.date || '').trim()}_${(l.description || '').trim().toLowerCase()}_${l.charge || 0}_${l.deposit || 0}_${(l.documentNumber || '').trim()}`;

    // 1. Process saved reconciliations sorted chronologically
    const sortedRecs = [...savedReconciliations]
      .filter(r => r.bankAccountId === selectedBankAccountId)
      .sort((a, b) => a.period.localeCompare(b.period));

    sortedRecs.forEach(r => {
      (r.lines || []).forEach(l => {
        const key = l.id || getFp(l);
        map.set(key, {
          ...l,
          period: l.date ? l.date.slice(0, 7) : r.period
        });
      });
    });

    // 2. Active statementLines for selectedPeriod take precedence
    if (statementLines) {
      statementLines.forEach(l => {
        const key = l.id || getFp(l);
        map.set(key, {
          ...l,
          period: l.date ? l.date.slice(0, 7) : selectedPeriod
        });
      });
    }

    return Array.from(map.values());
  }, [savedReconciliations, selectedBankAccountId, selectedPeriod, statementLines, selectedBankAccount]);

  // Math Reconciliation Summary
  const reconciliationSummary = useMemo(() => {
    return calculateReconciliationMath(
      allStatementLines,
      allBankVouchers,
      bankInitialBalanceInput,
      bankFinalBalanceInput,
      bookFinalBalance,
      selectedPeriod
    );
  }, [allStatementLines, allBankVouchers, bankInitialBalanceInput, bankFinalBalanceInput, bookFinalBalance, selectedPeriod]);

  // Unified Multi-Period Cartola (All months chained consecutively)
  const unifiedHistoricalCartola = useMemo(() => {
    if (!selectedBankAccount) return [];

    const accountRecs = savedReconciliations
      .filter(r => r.bankAccountId === selectedBankAccountId)
      .sort((a, b) => a.period.localeCompare(b.period));

    const currentPeriodExists = accountRecs.some(r => r.period === selectedPeriod);
    const combinedRecs = [...accountRecs];

    // Merge current in-memory period lines
    if (!currentPeriodExists) {
      combinedRecs.push({
        id: currentRecId,
        period: selectedPeriod,
        bankAccountId: selectedBankAccount.id,
        bankAccountCode: selectedBankAccount.code,
        bankAccountName: selectedBankAccount.name,
        statementDate: `${selectedPeriod}-28`,
        bankInitialBalance: bankInitialBalanceInput,
        bankFinalBalance: bankFinalBalanceInput,
        bookFinalBalance,
        unmatchedCharges: reconciliationSummary.unmatchedCharges,
        unmatchedDeposits: reconciliationSummary.unmatchedDeposits,
        outstandingChecks: reconciliationSummary.outstandingChecks,
        depositsInTransit: reconciliationSummary.depositsInTransit,
        reconciledBalance: reconciliationSummary.reconciledStatementBalance,
        calculatedBookBalance: reconciliationSummary.calculatedBookBalance,
        calculatedBankBalance: reconciliationSummary.calculatedBankBalance,
        difference: reconciliationSummary.difference,
        status: reconciliationSummary.isBalanced ? 'Cuadrado' : 'Descuadrado',
        lines: statementLines,
        updatedAt: new Date().toISOString()
      });
    } else {
      const idx = combinedRecs.findIndex(r => r.period === selectedPeriod);
      if (idx >= 0) {
        combinedRecs[idx] = {
          ...combinedRecs[idx],
          lines: statementLines,
          bankInitialBalance: bankInitialBalanceInput,
          bankFinalBalance: bankFinalBalanceInput
        };
      }
    }

    combinedRecs.sort((a, b) => a.period.localeCompare(b.period));

    // Chain all lines across all months with progressive unbroken running balance
    let progressiveBalance = combinedRecs.length > 0 ? (combinedRecs[0].bankInitialBalance || 0) : 0;
    const allLines: (BankStatementLine & { period: string })[] = [];
    const seenUnifiedKeys = new Set<string>();

    combinedRecs.forEach(rec => {
      const lines = [...(rec.lines || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      lines.forEach(l => {
        const fp = `${(l.date || '').trim()}_${(l.description || '').trim().toLowerCase()}_${l.charge || 0}_${l.deposit || 0}_${(l.documentNumber || '').trim()}`;
        const key = l.id || fp;
        if (!seenUnifiedKeys.has(key)) {
          seenUnifiedKeys.add(key);
          progressiveBalance += (l.deposit || 0) - (l.charge || 0);
          allLines.push({
            ...l,
            period: rec.period,
            balance: progressiveBalance
          });
        }
      });
    });

    return allLines;
  }, [
    savedReconciliations,
    selectedBankAccountId,
    selectedPeriod,
    selectedBankAccount,
    currentRecId,
    statementLines,
    bankInitialBalanceInput,
    bankFinalBalanceInput,
    bookFinalBalance,
    reconciliationSummary
  ]);

  // AUTO-SAVE ENGINE: Persists state immediately to Firestore
  const persistReconciliation = useCallback(
    async (
      period: string,
      lines: BankStatementLine[],
      initialBal: number,
      finalBal: number,
      customNotes?: string,
      skipAudit?: boolean
    ) => {
      if (!selectedBankAccount) return;

      setAutoSaveStatus('SAVING');
      try {
        const recId = `${selectedBankAccount.code}_${period}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        // Build combined statement lines across all historical periods for math calculation
        const combinedAllLines: (BankStatementLine & { period: string })[] = [];
        savedReconciliations.forEach(r => {
          if (r.bankAccountId === selectedBankAccount.id && r.period !== period && r.lines) {
            r.lines.forEach(l => {
              combinedAllLines.push({
                ...l,
                period: l.date ? l.date.slice(0, 7) : r.period
              });
            });
          }
        });
        lines.forEach(l => {
          combinedAllLines.push({
            ...l,
            period: l.date ? l.date.slice(0, 7) : period
          });
        });

        const summary = calculateReconciliationMath(
          combinedAllLines,
          allBankVouchers,
          initialBal,
          finalBal,
          bookFinalBalance,
          period
        );

        const recData: BankReconciliation = {
          id: recId,
          period,
          bankAccountId: selectedBankAccount.id,
          bankAccountCode: selectedBankAccount.code,
          bankAccountName: selectedBankAccount.name,
          statementDate: `${period}-28`,
          bankInitialBalance: initialBal,
          bankFinalBalance: finalBal,
          bookFinalBalance,
          unmatchedCharges: summary.unmatchedCharges,
          unmatchedDeposits: summary.unmatchedDeposits,
          outstandingChecks: summary.outstandingChecks,
          depositsInTransit: summary.depositsInTransit,
          reconciledBalance: summary.reconciledStatementBalance,
          calculatedBookBalance: summary.calculatedBookBalance,
          calculatedBankBalance: summary.calculatedBankBalance,
          difference: summary.difference,
          status: summary.isBalanced ? 'Cuadrado' : 'Descuadrado',
          notes: customNotes !== undefined ? customNotes : notes,
          lines,
          updatedAt: new Date().toISOString()
        };

        await setDoc(doc(companyRef, 'bankReconciliations', recId), sanitizeForFirestore(recData));

        // Update local savedReconciliations
        setSavedReconciliations(prev => {
          const idx = prev.findIndex(r => r.id === recId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = recData;
            return next;
          }
          return [...prev, recData];
        });

        // Cascade/update initial balance of the subsequent month if it exists
        const nextPeriodStr = getNextPeriod(period);
        const nextRec = savedReconciliations.find(
          r => r.bankAccountId === selectedBankAccount.id && r.period === nextPeriodStr
        );
        if (nextRec && nextRec.bankInitialBalance !== finalBal) {
          const { updatedLines: nextLines, finalBalance: nextFinalBal } = recalculateRunningBalances(
            nextRec.lines || [],
            finalBal
          );
          const nextRecData: BankReconciliation = {
            ...nextRec,
            bankInitialBalance: finalBal,
            bankFinalBalance: nextFinalBal,
            lines: nextLines,
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(companyRef, 'bankReconciliations', nextRec.id), sanitizeForFirestore(nextRecData));
        }

        const nowStr = new Date().toLocaleTimeString('es-CL');
        setLastSavedTime(nowStr);
        setAutoSaveStatus('SAVED');
        setSaveMessage('Grabado automáticamente');

        if (!skipAudit) {
          logAuditEvent({
            userId: auth.currentUser?.uid || 'anonymous',
            userEmail: auth.currentUser?.email || 'sistema',
            action: 'MODIFICAR',
            module: 'CONCILIACION',
            studyId,
            companyId: company.id,
            companyName: company.name,
            details: `Auto-guardado de Conciliación Bancaria ${selectedBankAccount.name} (${period}) - Saldo Final Cartola: $${finalBal.toLocaleString('es-CL')}.`,
            metadata: {
              action: 'AUTO_SAVE_RECONCILIATION',
              period,
              difference: summary.difference,
              status: recData.status
            }
          });
        }
      } catch (err: any) {
        console.error('Error auto-saving reconciliation:', err);
        setAutoSaveStatus('ERROR');
        setSaveMessage('Error al guardar: ' + err.message);
      }
    },
    [selectedBankAccount, allBankVouchers, bookFinalBalance, notes, companyRef, savedReconciliations, studyId, company]
  );

  // Clear / Anular Cartola for Selected Period with strict Conciliation Validation
  const handleClearCartolaPeriod = async () => {
    if (!selectedBankAccount) return;

    if (statementLines.length === 0) {
      alert(`La cartola del período ${selectedPeriod} para ${selectedBankAccount.name} ya se encuentra vacía.`);
      return;
    }

    // Security Check: Verify if any line is conciliated
    const conciliatedLines = statementLines.filter(l => l.matchedStatus === 'Conciliado');

    if (conciliatedLines.length > 0) {
      alert(
        `⚠️ NO SE PUEDE ANULAR LA CARTOLA DEL PERÍODO ${selectedPeriod}\n\n` +
        `Esta cartola contiene ${conciliatedLines.length} movimiento(s) en estado "Conciliado".\n\n` +
        `Para poder anular, borrar o volver a cargar la cartola de este mes, debes primero desconciliar o desvincular los movimientos marcados como Conciliados.`
      );
      return;
    }

    const confirmDelete = window.confirm(
      `🗑️ ¿ESTÁS SEGURO DE ANULAR / LIMPIAR LA CARTOLA DEL PERÍODO ${selectedPeriod}?\n\n` +
      `Se eliminarán los ${statementLines.length} movimientos NO conciliados de ${selectedBankAccount.name} en el período ${selectedPeriod}.\n\n` +
      `Esta acción permitirá volver a importar la cartola corregida desde cero.`
    );

    if (!confirmDelete) return;

    try {
      setStatementLines([]);
      setBankFinalBalanceInput(bankInitialBalanceInput);
      await persistReconciliation(selectedPeriod, [], bankInitialBalanceInput, bankInitialBalanceInput);

      alert(`✅ Cartola del período ${selectedPeriod} anulada correctamente. Ahora puedes volver a cargar la cartola limpia.`);
    } catch (err: any) {
      console.error("Error al anular cartola:", err);
      alert("Error al anular la cartola: " + (err.message || 'Error desconocido'));
    }
  };

  // Delete individual unreconciled statement line (e.g. for cleaning duplicated imports)
  const handleDeleteStatementLine = async (lineId: string) => {
    // 1. Check in current active statementLines
    const lineInCurrent = statementLines.find(l => l.id === lineId);
    if (lineInCurrent) {
      if (lineInCurrent.matchedStatus === 'Conciliado') {
        alert('⚠️ No se puede eliminar un movimiento que ya está conciliado. Desvincula el comprobante contable primero.');
        return;
      }
      const amt = (lineInCurrent.charge || 0) + (lineInCurrent.deposit || 0);
      if (!window.confirm(`¿Estás seguro de eliminar este movimiento de la cartola?\n\nFecha: ${lineInCurrent.date}\nGlosa: ${lineInCurrent.description}\nMonto: $${amt.toLocaleString('es-CL')}\n\nEsta acción recalculará los saldos de la cartola.`)) {
        return;
      }

      const filtered = statementLines.filter(l => l.id !== lineId);
      const { updatedLines, finalBalance } = recalculateRunningBalances(filtered, bankInitialBalanceInput);
      setStatementLines(updatedLines);
      setBankFinalBalanceInput(finalBalance);
      await persistReconciliation(selectedPeriod, updatedLines, bankInitialBalanceInput, finalBalance);
      await fetchReconciliations();
      return;
    }

    // 2. Check across saved reconciliations in other periods
    for (const rec of savedReconciliations) {
      if (rec.bankAccountId === selectedBankAccountId && rec.lines) {
        const lineInRec = rec.lines.find(l => l.id === lineId);
        if (lineInRec) {
          if (lineInRec.matchedStatus === 'Conciliado') {
            alert('⚠️ No se puede eliminar un movimiento que ya está conciliado. Desvincula el comprobante contable primero.');
            return;
          }
          const amt = (lineInRec.charge || 0) + (lineInRec.deposit || 0);
          if (!window.confirm(`¿Estás seguro de eliminar este movimiento del período ${rec.period}?\n\nFecha: ${lineInRec.date}\nGlosa: ${lineInRec.description}\nMonto: $${amt.toLocaleString('es-CL')}\n\nEsta acción recalculará los saldos de ese período.`)) {
            return;
          }

          const filtered = rec.lines.filter(l => l.id !== lineId);
          const { updatedLines, finalBalance } = recalculateRunningBalances(filtered, rec.bankInitialBalance || 0);
          await persistReconciliation(rec.period, updatedLines, rec.bankInitialBalance || 0, finalBalance);
          await fetchReconciliations();
          return;
        }
      }
    }
  };

  // 1. Manual change to Initial Balance -> Recalculate + Cascade + Auto-Save
  const handleUpdateInitialBalance = async (newInitial: number) => {
    setBankInitialBalanceInput(newInitial);
    if (statementLines.length > 0) {
      const { updatedLines, finalBalance } = recalculateRunningBalances(statementLines, newInitial);
      setStatementLines(updatedLines);
      setBankFinalBalanceInput(finalBalance);
      await persistReconciliation(selectedPeriod, updatedLines, newInitial, finalBalance);
    } else {
      setBankFinalBalanceInput(newInitial);
      await persistReconciliation(selectedPeriod, [], newInitial, newInitial);
    }
  };

  // 2. Import Pasted CSV Cartola with Automatic Multi-Period Partitioning, Progressive Balance Chaining & Immediate Auto-Save
  const handleImportPastedCSV = async () => {
    if (!pastedCSV.trim()) {
      alert('Pegue el contenido de la cartola bancaria.');
      return;
    }

    const rawLines = pastedCSV.trim().split('\n');
    const parsedLines: { line: BankStatementLine; period: string }[] = [];

    rawLines.forEach((rawLine, idx) => {
      const parts = rawLine.split(/[;\t,]/).map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        let date = parts[0] || `${selectedPeriod}-01`;
        // Normalize date YYYY-MM-DD
        if (date.includes('/')) {
          const dParts = date.split('/');
          if (dParts.length === 3) {
            if (dParts[0].length === 4) date = `${dParts[0]}-${dParts[1].padStart(2, '0')}-${dParts[2].padStart(2, '0')}`;
            else date = `${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
          }
        }
        const periodOfLine = date.slice(0, 7) || selectedPeriod;
        const desc = parts[1] || 'MOVIMIENTO BANCARIO';
        let docNum = '';
        let charge = 0;
        let deposit = 0;
        let directBalance: number | null = null;

        if (parts.length === 3) {
          const val = parseChileanNumber(parts[2]);
          if (val < 0) charge = Math.abs(val); // Negativo es Cargo
          else deposit = val; // Positivo es Abono
        } else if (parts.length === 4) {
          // Column 3: Cargo, Column 4: Abono
          charge = Math.abs(parseChileanNumber(parts[2]));
          deposit = Math.abs(parseChileanNumber(parts[3]));
        } else if (parts.length === 5) {
          // Column 3: N° Doc, Column 4: Cargo, Column 5: Abono
          docNum = parts[2];
          charge = Math.abs(parseChileanNumber(parts[3]));
          deposit = Math.abs(parseChileanNumber(parts[4]));
        } else if (parts.length >= 6) {
          // Column 3: N° Doc, Column 4: Cargo, Column 5: Abono, Column 6: Saldo
          docNum = parts[2];
          charge = Math.abs(parseChileanNumber(parts[3]));
          deposit = Math.abs(parseChileanNumber(parts[4]));
          const balParsed = parseChileanNumber(parts[5]);
          if (balParsed !== 0 || parts[5].includes('0')) directBalance = balParsed;
        }

        parsedLines.push({
          period: periodOfLine,
          line: {
            id: `csv_${Date.now()}_${idx}`,
            date,
            description: desc,
            documentNumber: docNum,
            charge,
            deposit,
            balance: directBalance !== null ? directBalance : 0,
            matchedStatus: 'Pendiente'
          }
        });
      }
    });

    if (parsedLines.length === 0) {
      alert('No se pudieron procesar las líneas. Formato esperado: Fecha; Descripción; N° Doc; Cargo; Abono [; Saldo]');
      return;
    }

    // Group lines by period
    const periodMap = new Map<string, BankStatementLine[]>();
    parsedLines.forEach(item => {
      if (!periodMap.has(item.period)) {
        periodMap.set(item.period, []);
      }
      periodMap.get(item.period)!.push(item.line);
    });

    const sortedPeriods = Array.from(periodMap.keys()).sort();
    let progressiveBalance = importInitialBalance;
    let totalSavedCount = 0;

    for (const p of sortedPeriods) {
      const pLines = periodMap.get(p)!;
      const initialForThisPeriod = progressiveBalance;
      const { updatedLines, finalBalance } = recalculateRunningBalances(pLines, initialForThisPeriod);
      progressiveBalance = finalBalance;

      // Auto-save this period to Firestore
      await persistReconciliation(p, updatedLines, initialForThisPeriod, finalBalance);
      totalSavedCount += updatedLines.length;

      // If this period matches the selected period, update active view state
      if (p === selectedPeriod) {
        setStatementLines(updatedLines);
        setBankInitialBalanceInput(initialForThisPeriod);
        setBankFinalBalanceInput(finalBalance);
      }
    }

    // If imported period was single and different from selectedPeriod, switch to that period
    if (sortedPeriods.length === 1 && sortedPeriods[0] !== selectedPeriod) {
      setSelectedPeriod(sortedPeriods[0]);
    }

    setShowImportModal(false);
    setPastedCSV('');
    await fetchReconciliations();

    alert(
      `✅ Cartola importada y grabada automáticamente:\n• ${totalSavedCount} movimientos distribuidos en ${sortedPeriods.length} período(s) (${sortedPeriods.join(', ')}).\n• Saldo Inicial: $${importInitialBalance.toLocaleString('es-CL')}\n• Saldo Final Acumulado: $${progressiveBalance.toLocaleString('es-CL')}.`
    );
  };

  // 3. Auto-Match Algorithm (Current Period + Cross-Period Regularizations) with Duplicate Voucher Prevention + Immediate Auto-Save
  const handleAutoMatch = async () => {
    const matchedVoucherIds = new Set<string>();

    allBankVouchers.forEach(bv => {
      if (bv.isMatchedInOther) {
        matchedVoucherIds.add(bv.voucher.id);
      }
    });

    statementLines.forEach(l => {
      if (l.matchedStatus === 'Conciliado' && l.matchedVoucherId) {
        matchedVoucherIds.add(l.matchedVoucherId);
      }
    });

    let matchedInPeriodCount = 0;
    let matchedCrossPeriodCount = 0;
    const duplicateSkippedReasons: {
      lineDescription: string;
      amount: number;
      type: 'Cargo' | 'Abono';
      duplicateCount: number;
      voucherNumbers: number[];
      scope: string;
    }[] = [];

    // Stage 1: Exact matches within CURRENT period
    const stage1Lines = statementLines.map(line => {
      if (line.matchedStatus === 'Conciliado') return line;

      const isCharge = line.charge > 0;
      const targetAmount = isCharge ? line.charge : line.deposit;

      // Find all matching candidate vouchers in CURRENT period
      const candidateVouchers = allBankVouchers.filter(bv => {
        if (matchedVoucherIds.has(bv.voucher.id)) return false;
        if (bv.period !== selectedPeriod) return false;
        if (isCharge && bv.credit === targetAmount) return true;
        if (!isCharge && bv.debit === targetAmount) return true;
        return false;
      });

      // RULE: If there are 2 or more identical matching vouchers in accounting, DO NOT AUTO-MATCH
      if (candidateVouchers.length >= 2) {
        duplicateSkippedReasons.push({
          lineDescription: line.description,
          amount: targetAmount,
          type: isCharge ? 'Cargo' : 'Abono',
          duplicateCount: candidateVouchers.length,
          voucherNumbers: candidateVouchers.map(c => c.voucher.voucherNumber || 0),
          scope: `Mes Actual (${selectedPeriod})`
        });
        return line; // Leave as Pendiente for manual verification
      }

      if (candidateVouchers.length === 1) {
        // Also verify if there are multiple pending bank lines with this exact same amount in this period
        const matchingPendingLines = statementLines.filter(l => {
          if (l.matchedStatus === 'Conciliado') return false;
          if (isCharge && l.charge === targetAmount) return true;
          if (!isCharge && l.deposit === targetAmount) return true;
          return false;
        });

        if (matchingPendingLines.length === 1) {
          const match = candidateVouchers[0];
          matchedVoucherIds.add(match.voucher.id);
          matchedInPeriodCount++;
          return {
            ...line,
            matchedVoucherId: match.voucher.id,
            matchedVoucherNumber: match.voucher.voucherNumber,
            matchedVoucherPeriod: match.period,
            matchedStatus: 'Conciliado' as const
          };
        }
      }

      return line;
    });

    // Stage 2: Exact cross-period matches for remaining pending lines
    const finalLines = stage1Lines.map(line => {
      if (line.matchedStatus === 'Conciliado') return line;

      const isCharge = line.charge > 0;
      const targetAmount = isCharge ? line.charge : line.deposit;

      // Find all matching candidate vouchers across ANY period
      const candidateVouchers = allBankVouchers.filter(bv => {
        if (matchedVoucherIds.has(bv.voucher.id)) return false;
        if (isCharge && bv.credit === targetAmount) return true;
        if (!isCharge && bv.debit === targetAmount) return true;
        return false;
      });

      // RULE: If 2 or more candidate vouchers exist in accounting, DO NOT AUTO-MATCH
      if (candidateVouchers.length >= 2) {
        const alreadyLogged = duplicateSkippedReasons.some(
          r => r.amount === targetAmount && r.type === (isCharge ? 'Cargo' : 'Abono') && r.lineDescription === line.description
        );
        if (!alreadyLogged) {
          duplicateSkippedReasons.push({
            lineDescription: line.description,
            amount: targetAmount,
            type: isCharge ? 'Cargo' : 'Abono',
            duplicateCount: candidateVouchers.length,
            voucherNumbers: candidateVouchers.map(c => c.voucher.voucherNumber || 0),
            scope: 'Multimes (Histórico)'
          });
        }
        return line; // Leave as Pendiente
      }

      if (candidateVouchers.length === 1) {
        const matchingPendingLines = stage1Lines.filter(l => {
          if (l.matchedStatus === 'Conciliado') return false;
          if (isCharge && l.charge === targetAmount) return true;
          if (!isCharge && l.deposit === targetAmount) return true;
          return false;
        });

        if (matchingPendingLines.length === 1) {
          const match = candidateVouchers[0];
          matchedVoucherIds.add(match.voucher.id);
          matchedCrossPeriodCount++;
          return {
            ...line,
            matchedVoucherId: match.voucher.id,
            matchedVoucherNumber: match.voucher.voucherNumber,
            matchedVoucherPeriod: match.period,
            matchedStatus: 'Conciliado' as const
          };
        }
      }

      return line;
    });

    setStatementLines(finalLines);
    await persistReconciliation(selectedPeriod, finalLines, bankInitialBalanceInput, bankFinalBalanceInput);

    let summaryMessage = `⚡ Match Automático completado y grabado:\n• ${matchedInPeriodCount} partidas conciliadas en el mes actual (${selectedPeriod})\n• ${matchedCrossPeriodCount} partidas regularizadas cruzando otros períodos.`;

    if (duplicateSkippedReasons.length > 0) {
      summaryMessage += `\n\n⚠️ PARTIDAS OMITIDAS POR DUPLICIDAD EN CONTABILIDAD (${duplicateSkippedReasons.length}):\n`;
      summaryMessage += `Se detectaron movimientos con 2 o más comprobantes contables con el mismo monto (posibles comprobantes duplicados por el contador). Por seguridad y auditoría, NO fueron conciliados automáticamente:\n`;
      duplicateSkippedReasons.slice(0, 5).forEach((d, idx) => {
        summaryMessage += `\n${idx + 1}. [${d.type}] ${d.lineDescription} ($${d.amount.toLocaleString('es-CL')}): Coincide con ${d.duplicateCount} comprobantes (Asientos ${d.voucherNumbers.map(n => `N° ${n}`).join(', ')} en ${d.scope}).`;
      });
      if (duplicateSkippedReasons.length > 5) {
        summaryMessage += `\n... y ${duplicateSkippedReasons.length - 5} partidas más.`;
      }
      summaryMessage += `\n\n👉 Revise y elimine el comprobante duplicado en el libro contable o realice el match manual si corresponde.`;
    }

    alert(summaryMessage);
  };

  // 4. Toggle manual match / unmatch + Immediate Auto-Save
  const handleToggleManualMatch = async (lineId: string) => {
    const inCurrent = statementLines.some(l => l.id === lineId);
    if (inCurrent) {
      const updated = statementLines.map(l => {
        if (l.id === lineId) {
          return {
            ...l,
            matchedStatus: 'Pendiente' as const,
            matchedVoucherId: undefined,
            matchedVoucherNumber: undefined,
            matchedVoucherPeriod: undefined
          };
        }
        return l;
      });
      setStatementLines(updated);
      await persistReconciliation(selectedPeriod, updated, bankInitialBalanceInput, bankFinalBalanceInput);
      return;
    }

    // Check prior periods in savedReconciliations
    for (const rec of savedReconciliations) {
      if (rec.bankAccountId === selectedBankAccountId && rec.lines) {
        const lineIdx = rec.lines.findIndex(l => l.id === lineId);
        if (lineIdx >= 0) {
          const updatedLines = rec.lines.map(l => {
            if (l.id === lineId) {
              return {
                ...l,
                matchedStatus: 'Pendiente' as const,
                matchedVoucherId: undefined,
                matchedVoucherNumber: undefined,
                matchedVoucherPeriod: undefined
              };
            }
            return l;
          });
          await persistReconciliation(rec.period, updatedLines, rec.bankInitialBalance, rec.bankFinalBalance);
          await persistReconciliation(selectedPeriod, statementLines, bankInitialBalanceInput, bankFinalBalanceInput);
          break;
        }
      }
    }
  };

  // 5. Perform manual cross-period match + Immediate Auto-Save
  const handleManualMatch = async (voucherId: string, voucherNumber: number, voucherPeriod: string) => {
    if (!manualMatchLine) return;

    const targetLineId = manualMatchLine.id;
    const inCurrent = statementLines.some(l => l.id === targetLineId);

    if (inCurrent) {
      const updated = statementLines.map(l => {
        if (l.id === targetLineId) {
          return {
            ...l,
            matchedStatus: 'Conciliado' as const,
            matchedVoucherId: voucherId,
            matchedVoucherNumber: voucherNumber,
            matchedVoucherPeriod: voucherPeriod
          };
        }
        return l;
      });
      setStatementLines(updated);
      setManualMatchLine(null);
      await persistReconciliation(selectedPeriod, updated, bankInitialBalanceInput, bankFinalBalanceInput);
      return;
    }

    // Prior period line
    for (const rec of savedReconciliations) {
      if (rec.bankAccountId === selectedBankAccountId && rec.lines) {
        const lineIdx = rec.lines.findIndex(l => l.id === targetLineId);
        if (lineIdx >= 0) {
          const updatedLines = rec.lines.map(l => {
            if (l.id === targetLineId) {
              return {
                ...l,
                matchedStatus: 'Conciliado' as const,
                matchedVoucherId: voucherId,
                matchedVoucherNumber: voucherNumber,
                matchedVoucherPeriod: voucherPeriod
              };
            }
            return l;
          });
          setManualMatchLine(null);
          await persistReconciliation(rec.period, updatedLines, rec.bankInitialBalance, rec.bankFinalBalance);
          await persistReconciliation(selectedPeriod, statementLines, bankInitialBalanceInput, bankFinalBalanceInput);
          break;
        }
      }
    }
  };

  // 6. Quick Post Unaccounted Bank Fee or Income + Auto-Match + Immediate Auto-Save
  const handleQuickPostVoucher = async (customData?: {
    period: string;
    date?: string;
    gloss: string;
    counterAccountId: string;
    lines: VoucherLine[];
    newAuxiliaryToSave?: Auxiliary;
  }) => {
    if (!quickVoucherLine || !selectedBankAccount) {
      alert('Información del movimiento bancario no disponible.');
      return;
    }

    const counterAccId = customData?.counterAccountId || quickExpenseAccountId;
    const counterAcc = accounts.find(a => a.id === counterAccId);
    if (!counterAcc && (!customData?.lines || customData.lines.length === 0)) {
      alert('Seleccione la cuenta de contrapartida (Gasto Bancario / Ingreso).');
      return;
    }

    const effective = getNextOpenPeriodAndDate(quickVoucherLine.date, fiscalYears);
    const targetPeriod = customData?.period || (effective.wasShifted ? effective.period : quickVoucherPeriod) || selectedPeriod;
    const targetDate = customData?.date || (effective.wasShifted ? effective.date : quickVoucherLine.date);

    const periodCheck = checkIsPeriodClosed(targetPeriod, fiscalYears);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes registrar comprobantes en un período cerrado.`);
      return;
    }

    // Save new auxiliary on-the-fly if provided
    if (customData?.newAuxiliaryToSave) {
      try {
        const auxSnap = await getDocs(query(collection(companyRef, 'auxiliaries'), where('rut', '==', customData.newAuxiliaryToSave.rut)));
        if (auxSnap.empty) {
          await addDoc(collection(companyRef, 'auxiliaries'), sanitizeForFirestore(customData.newAuxiliaryToSave));
        }
      } catch (e) {
        console.warn('No se pudo guardar automáticamente el nuevo auxiliar:', e);
      }
    }

    try {
      const nextVoucherNumber = (vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0) + 1;
      const isCharge = quickVoucherLine.charge > 0;
      const amount = isCharge ? quickVoucherLine.charge : quickVoucherLine.deposit;

      let voucherLines: VoucherLine[] = [];
      if (customData?.lines && customData.lines.length > 0) {
        voucherLines = customData.lines;
      } else if (counterAcc) {
        if (isCharge) {
          voucherLines = [
            {
              id: 'l1',
              accountId: counterAcc.id,
              accountCode: counterAcc.code,
              accountName: counterAcc.name,
              debit: amount,
              credit: 0,
              documentRef: quickVoucherLine.documentNumber || 'BANCO',
              gloss: customData?.gloss || quickGloss || quickVoucherLine.description
            },
            {
              id: 'l2',
              accountId: selectedBankAccount.id,
              accountCode: selectedBankAccount.code,
              accountName: selectedBankAccount.name,
              debit: 0,
              credit: amount,
              documentRef: quickVoucherLine.documentNumber || 'BANCO',
              gloss: customData?.gloss || quickGloss || quickVoucherLine.description
            }
          ];
        } else {
          voucherLines = [
            {
              id: 'l1',
              accountId: selectedBankAccount.id,
              accountCode: selectedBankAccount.code,
              accountName: selectedBankAccount.name,
              debit: amount,
              credit: 0,
              documentRef: quickVoucherLine.documentNumber || 'BANCO',
              gloss: customData?.gloss || quickGloss || quickVoucherLine.description
            },
            {
              id: 'l2',
              accountId: counterAcc.id,
              accountCode: counterAcc.code,
              accountName: counterAcc.name,
              debit: 0,
              credit: amount,
              documentRef: quickVoucherLine.documentNumber || 'BANCO',
              gloss: customData?.gloss || quickGloss || quickVoucherLine.description
            }
          ];
        }
      }

      const cleanedVoucherLines = sanitizeVoucherLines(voucherLines, accounts);
      const totalDebit = cleanedVoucherLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const totalCredit = cleanedVoucherLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

      const newVoucherData = {
        voucherNumber: nextVoucherNumber,
        date: targetDate,
        period: targetPeriod,
        type: isCharge ? 'Egreso' : 'Ingreso',
        gloss: `Ajuste Conciliación Bancaria - ${customData?.gloss || quickGloss || quickVoucherLine.description}`,
        lines: cleanedVoucherLines,
        totalDebit,
        totalCredit,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      const sanitizedVoucher = sanitizeForFirestore(newVoucherData);
      const docRef = await addDoc(collection(companyRef, 'vouchers'), sanitizedVoucher);

      const inCurrent = statementLines.some(l => l.id === quickVoucherLine.id);
      if (inCurrent) {
        const updated = statementLines.map(l => {
          if (l.id === quickVoucherLine.id) {
            return {
              ...l,
              matchedStatus: 'Conciliado' as const,
              matchedVoucherId: docRef.id,
              matchedVoucherNumber: nextVoucherNumber,
              matchedVoucherPeriod: targetPeriod
            };
          }
          return l;
        });

        setStatementLines(updated);
        setQuickVoucherLine(null);
        await persistReconciliation(selectedPeriod, updated, bankInitialBalanceInput, bankFinalBalanceInput);
      } else {
        // Line originated from a prior period
        for (const rec of savedReconciliations) {
          if (rec.bankAccountId === selectedBankAccountId && rec.lines) {
            const lineIdx = rec.lines.findIndex(l => l.id === quickVoucherLine.id);
            if (lineIdx >= 0) {
              const updatedLines = rec.lines.map(l => {
                if (l.id === quickVoucherLine.id) {
                  return {
                    ...l,
                    matchedStatus: 'Conciliado' as const,
                    matchedVoucherId: docRef.id,
                    matchedVoucherNumber: nextVoucherNumber,
                    matchedVoucherPeriod: targetPeriod
                  };
                }
                return l;
              });
              setQuickVoucherLine(null);
              await persistReconciliation(rec.period, updatedLines, rec.bankInitialBalance, rec.bankFinalBalance);
              await persistReconciliation(selectedPeriod, statementLines, bankInitialBalanceInput, bankFinalBalanceInput);
              break;
            }
          }
        }
      }

      alert(
        effective.wasShifted
          ? `✅ Comprobante N° ${nextVoucherNumber} generado el ${targetDate} (Período ${targetPeriod}, por estar cerrado el mes original ${effective.originalPeriod}), conciliado y guardado automáticamente.`
          : `✅ Comprobante N° ${nextVoucherNumber} generado en período ${targetPeriod} (${targetDate}), conciliado y guardado automáticamente.`
      );
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error posting quick voucher:', err);
      alert('Error: ' + err.message);
    }
  };

  // Duplicate Vouchers Map (Identifies if 2 or more pending vouchers have the same amount in accounting)
  const duplicateVouchersMap = useMemo(() => {
    return getDuplicateVouchersMap(allBankVouchers);
  }, [allBankVouchers]);

  // Available Years extracted dynamically from fiscalYears, savedReconciliations, and all cartola lines
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    (fiscalYears || []).forEach(fy => {
      if (fy.year) yearsSet.add(String(fy.year));
    });
    savedReconciliations.forEach(r => {
      if (r.period) yearsSet.add(r.period.slice(0, 4));
    });
    allStatementLines.forEach(l => {
      if (l.date) yearsSet.add(l.date.slice(0, 4));
    });
    yearsSet.add(new Date().getFullYear().toString());
    return Array.from(yearsSet).sort().reverse();
  }, [fiscalYears, savedReconciliations, allStatementLines]);

  // Movement counts by month for the currently selected year (or all years)
  const monthMovementCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_MONTHS.forEach(m => { counts[m] = 0; });

    const source = unifiedHistoricalCartola.length > 0 ? unifiedHistoricalCartola : allStatementLines;
    source.forEach(l => {
      const d = (l.date || '').trim();
      const yr = d.slice(0, 4) || (l.period ? l.period.slice(0, 4) : '');
      const mo = d.slice(5, 7) || (l.period ? l.period.slice(5, 7) : '');
      if (cartolaYearFilter === 'TODOS' || yr === cartolaYearFilter) {
        if (counts[mo] !== undefined) {
          counts[mo] = (counts[mo] || 0) + 1;
        }
      }
    });
    return counts;
  }, [unifiedHistoricalCartola, allStatementLines, cartolaYearFilter]);

  // Duplicate Statement Lines Detection Map (Identifies movements with identical date, charge/deposit, and gloss)
  const statementDuplicatesMap = useMemo(() => {
    const map = new Map<string, { count: number; lineIds: Set<string> }>();
    const source = unifiedHistoricalCartola.length > 0 ? unifiedHistoricalCartola : allStatementLines;

    source.forEach(l => {
      const d = (l.date || '').trim();
      const chg = Math.round(l.charge || 0);
      const dep = Math.round(l.deposit || 0);
      const desc = (l.description || '').toLowerCase().trim().replace(/\s+/g, ' ');
      const amt = chg > 0 ? `C_${chg}` : `D_${dep}`;
      const fp = `${d}__${amt}__${desc}`;

      if (!map.has(fp)) {
        map.set(fp, { count: 0, lineIds: new Set() });
      }
      const item = map.get(fp)!;
      item.count += 1;
      item.lineIds.add(l.id);
    });

    return map;
  }, [unifiedHistoricalCartola, allStatementLines]);

  const duplicateLinesCount = useMemo(() => {
    let count = 0;
    statementDuplicatesMap.forEach(v => {
      if (v.count >= 2) count += v.count;
    });
    return count;
  }, [statementDuplicatesMap]);

  // Filtered Cartola Lines with Excel-style multi-dimensional filtering (Year, Months, Status, Search)
  const displayLines = useMemo(() => {
    let source: (BankStatementLine & { period?: string; isPriorPending?: boolean })[] = [];

    // Use unified historical cartola as the single canonical source so any month (e.g. Mayo 2026, Abril 2026, or multi-month) is fully visible
    if (unifiedHistoricalCartola && unifiedHistoricalCartola.length > 0) {
      source = unifiedHistoricalCartola;
    } else {
      source = (statementLines || []).map(l => ({
        ...l,
        period: selectedPeriod,
        isPriorPending: false
      }));
    }

    return source.filter(l => {
      const lineDate = (l.date || '').trim();
      const lineYear = lineDate.slice(0, 4) || (l.period ? l.period.slice(0, 4) : '');
      const lineMonth = lineDate.slice(5, 7) || (l.period ? l.period.slice(5, 7) : '');

      // 1. Year Filter
      if (cartolaYearFilter !== 'TODOS' && lineYear && lineYear !== cartolaYearFilter) {
        return false;
      }

      // 2. Month Filter (Excel multi-select)
      if (cartolaSelectedMonths.length > 0 && lineMonth) {
        if (!cartolaSelectedMonths.includes(lineMonth)) {
          return false;
        }
      }

      // 3. Status Filter (Todos, Conciliados, Pendientes, Duplicados)
      if (filterStatement === 'Conciliados' && l.matchedStatus !== 'Conciliado') return false;
      if (filterStatement === 'Pendiente' && l.matchedStatus !== 'Pendiente') return false;
      if (filterStatement === 'Duplicados') {
        const d = (l.date || '').trim();
        const chg = Math.round(l.charge || 0);
        const dep = Math.round(l.deposit || 0);
        const desc = (l.description || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const amt = chg > 0 ? `C_${chg}` : `D_${dep}`;
        const fp = `${d}__${amt}__${desc}`;
        const dup = statementDuplicatesMap.get(fp);
        if (!dup || dup.count < 2) return false;
      }

      // 4. Search Query (matches gloss, document number, date, charge, deposit, balance, or matched voucher)
      if (statementSearchQuery.trim()) {
        const q = statementSearchQuery.toLowerCase().trim();
        const matchesDesc = (l.description || '').toLowerCase().includes(q);
        const matchesDoc = (l.documentNumber || '').toLowerCase().includes(q);
        const matchesDate = (l.date || '').includes(q);
        const matchesCharge = String(l.charge || 0).includes(q);
        const matchesDep = String(l.deposit || 0).includes(q);
        const matchesBalance = String(l.balance || 0).includes(q);
        const matchesVoucher = l.matchedVoucherNumber ? String(l.matchedVoucherNumber).includes(q) : false;
        if (!matchesDesc && !matchesDoc && !matchesDate && !matchesCharge && !matchesDep && !matchesBalance && !matchesVoucher) {
          return false;
        }
      }

      return true;
    });
  }, [
    unifiedHistoricalCartola,
    statementLines,
    selectedPeriod,
    cartolaYearFilter,
    cartolaSelectedMonths,
    filterStatement,
    statementDuplicatesMap,
    statementSearchQuery
  ]);

  // Vouchers available in the Manual Match Modal
  const modalAvailableVouchers = useMemo(() => {
    if (!manualMatchLine) return [];

    const targetAmount = manualMatchLine.charge > 0 ? manualMatchLine.charge : manualMatchLine.deposit;
    const isTargetCharge = manualMatchLine.charge > 0;

    let list = allBankVouchers.filter(bv => !bv.isMatchedInOther && !bv.isMatchedInCurrent);

    if (modalScope === 'ESTE_MES') {
      list = list.filter(bv => bv.period === selectedPeriod);
    } else if (modalScope === 'MESES_POSTERIORES') {
      list = list.filter(bv => bv.period > selectedPeriod);
    } else if (modalScope === 'MESES_ANTERIORES') {
      list = list.filter(bv => bv.period < selectedPeriod);
    }

    if (modalExactOnly) {
      list = list.filter(bv => {
        const amt = isTargetCharge ? bv.credit : bv.debit;
        return amt === targetAmount;
      });
    }

    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase().trim();
      list = list.filter(bv =>
        String(bv.voucher.voucherNumber || '').includes(q) ||
        (bv.gloss || '').toLowerCase().includes(q) ||
        (bv.date || '').includes(q) ||
        (bv.period || '').includes(q) ||
        String(bv.debit || 0).includes(q) ||
        String(bv.credit || 0).includes(q)
      );
    }

    return list;
  }, [manualMatchLine, allBankVouchers, modalScope, modalExactOnly, modalSearch, selectedPeriod]);

  return (
    <div className="space-y-4">
      {/* Top Header with Auto-Save Badge */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🏦</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Conciliación Bancaria Multiatributo y Multimes
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs text-slate-500">
              Saldos encadenados y acumulativos mes a mes ({company.name})
            </p>
            {/* Auto-save real-time indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {autoSaveStatus === 'SAVING' && (
                <>
                  <span className="animate-spin text-indigo-600">⏳</span>
                  <span className="text-indigo-700">Guardando en la base de datos...</span>
                </>
              )}
              {autoSaveStatus === 'SAVED' && (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-emerald-800">Grabado automático ({lastSavedTime})</span>
                </>
              )}
              {autoSaveStatus === 'ERROR' && (
                <>
                  <span className="text-rose-600">⚠️</span>
                  <span className="text-rose-700">{saveMessage || 'Error al guardar'}</span>
                </>
              )}
            </div>

            {/* Persistence & state retention badge */}
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200" title="Su progreso de conciliación, filtros y cartola activa se mantienen intactos al cambiar de pestaña dentro del sistema.">
              <span>⚡</span>
              <span>Estado Retenido en Navegación</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              const csvContent =
                'data:text/csv;charset=utf-8,\uFEFFFecha;Descripcion;N_Doc;Cargo;Abono;Saldo\n2026-08-01;PAGO PROVEEDOR FACTURA 1024;1024;50000;0;450000\n2026-08-02;ABONO CLIENTE TRANSFERENCIA;TR-12;0;120000;570000\n2026-08-05;COMISION MANTENCION CTA;COM;5500;0;564500';
              const encodedUri = encodeURI(csvContent);
              const link = document.createElement('a');
              link.setAttribute('href', encodedUri);
              link.setAttribute('download', `Plantilla_Cartola_Bancaria.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
            title="Descargar plantilla CSV para subir cartolas"
          >
            <span>📊</span>
            <span>Plantilla CSV</span>
          </button>

          <button
            onClick={() => setShowSmartImportModal(true)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black rounded-lg shadow-sm transition-all flex items-center gap-1.5 border border-indigo-400/30"
            title="Lectura inteligente de cartolas Excel / CSV de cualquier banco chileno con deduplicación y cuadratura"
          >
            <span>🏦</span>
            <span>Lectura Inteligente Cartola</span>
            <span className="bg-white/20 text-[9px] px-1 py-0.2 rounded uppercase font-bold">Smart</span>
          </button>

          <button
            onClick={() => {
              setImportInitialBalance(bankInitialBalanceInput);
              setShowImportModal(true);
            }}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-lg border border-indigo-200 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <span>📥</span>
            <span>Importar CSV / Pegar</span>
          </button>

          {/* ANULAR / LIMPIAR CARTOLA DEL MES BUTTON */}
          <button
            onClick={handleClearCartolaPeriod}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Anular o borrar la cartola cargada de este mes si no tiene movimientos conciliados"
          >
            <span>🗑️</span>
            <span>Anular Cartola</span>
          </button>

          {/* NUEZ MARIPOSA / AUTO RUT MATCH BUTTON */}
          <button
            onClick={() => setShowAutoRutModal(true)}
            className="relative group px-3.5 py-1.5 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-1.5 border-2 border-amber-300 overflow-hidden"
            title="Nuez Mariposa: Match y Contabilización Automática por RUT en Cartola"
          >
            {/* Glowing aura */}
            <span className="absolute -inset-1 bg-amber-400/50 rounded-xl blur-xs opacity-75 group-hover:opacity-100 transition animate-pulse"></span>
            <span className="relative flex items-center gap-1.5">
              <svg className="w-4 h-4 text-slate-950 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8 2 5 4.5 5 8c0 2 1 3.5 2.5 4.5C6 13.5 5 15 5 17c0 3 3 5 7 5s7-2 7-5c0-2-1-3.5-2.5-4.5C18 11.5 19 10 19 8c0-3.5-3-6-7-6z" fill="currentColor" opacity="0.25" />
                <path d="M12 2v20" strokeDasharray="2 2" />
                <path d="M7.5 8c1-.5 2.5 0 3 1s0 2.5-1 3" />
                <path d="M16.5 8c-1-.5-2.5 0-3 1s0 2.5 1 3" />
              </svg>
              <span className="uppercase tracking-tight font-extrabold">🧠 Nuez Mariposa (RUT Match)</span>
              <span className="bg-amber-950 text-amber-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-black">PRO</span>
            </span>
          </button>

          <button
            onClick={handleAutoMatch}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
            title="Cruce automático de montos idénticos en el mes y entre otros meses"
          >
            <span>⚡</span>
            <span>Match Automático Multimes</span>
          </button>

          <button
            onClick={() => setShowPendingReportModal(true)}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 border border-slate-700"
            title="Ver reporte oficial de partidas pendientes de conciliación bancaria"
          >
            <span>📑</span>
            <span>Partidas Pendientes</span>
          </button>

          <button
            onClick={async () => {
              await persistReconciliation(selectedPeriod, statementLines, bankInitialBalanceInput, bankFinalBalanceInput);
              alert('💾 Conciliación bancaria verificada y sincronizada en Firestore.');
            }}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>💾</span>
            <span>Guardar Ahora</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Account, Period, Cumulative Balance Control */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5 text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Cuenta Bancaria:</label>
          <select
            value={selectedBankAccountId}
            onChange={(e) => setSelectedBankAccountId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 text-xs"
          >
            {bankAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.code} - {acc.name}
              </option>
            ))}
          </select>
          {selectedBankAccount && (
            <div className="mt-1 text-[10px] text-slate-600 flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                {selectedBankAccount.bankInstitution || 'Banco'}
              </span>
              {selectedBankAccount.bankAccountNumber && (
                <span className="font-mono bg-slate-200 px-1 py-0.5 rounded text-slate-800">
                  N° {selectedBankAccount.bankAccountNumber}
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Período Conciliación:</label>
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-semibold text-xs"
          />
          <div className="mt-1 text-[10px] text-slate-500 font-sans">
            Mes Anterior: <span className="font-bold text-slate-700">{previousPeriod || 'N/A'}</span>
          </div>
        </div>

        {/* Cumulative Initial Balance (Mes Anterior) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700">Saldo Inicial Cartola ($):</label>
            <span className="text-[9px] text-indigo-600 font-bold uppercase">Mes Anterior</span>
          </div>
          <input
            type="number"
            value={bankInitialBalanceInput}
            onChange={(e) => handleUpdateInitialBalance(Number(e.target.value))}
            className="w-full bg-white border border-indigo-300 rounded-md px-2.5 py-1.5 font-mono font-bold text-indigo-950 text-xs"
            title="Saldo del mes anterior para calcular el saldo acumulado del mes"
          />
          <div className="mt-1 text-[10px] text-slate-500 flex justify-between">
            <span>Saldo Anterior:</span>
            <span className="font-bold font-mono text-indigo-800">${bankInitialBalanceInput.toLocaleString('es-CL')}</span>
          </div>
        </div>

        {/* Final Statement Balance (Saldo Acumulado al cierre del mes) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700">Saldo Final Cartola ($):</label>
            <span className="text-[9px] text-emerald-700 font-bold uppercase">Acumulado</span>
          </div>
          <input
            type="number"
            value={bankFinalBalanceInput}
            onChange={async (e) => {
              const val = Number(e.target.value);
              setBankFinalBalanceInput(val);
              await persistReconciliation(selectedPeriod, statementLines, bankInitialBalanceInput, val);
            }}
            className="w-full bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-mono font-black text-slate-900 text-xs"
          />
          <div className="mt-1 text-[10px] text-slate-500 flex justify-between font-mono">
            <span>Ini + Mov:</span>
            <span className="font-bold text-slate-800">
              ${(bankInitialBalanceInput + statementLines.reduce((s, l) => s + (l.deposit || 0) - (l.charge || 0), 0)).toLocaleString('es-CL')}
            </span>
          </div>
        </div>

        {/* Book Balance */}
        <div>
          <label className="block font-bold text-slate-700 mb-1">Saldo Libro Mayor ({selectedPeriod}):</label>
          <div className="w-full bg-slate-200 border border-slate-300 rounded-md px-2.5 py-1.5 font-mono font-black text-slate-900 text-xs">
            ${bookFinalBalance.toLocaleString('es-CL')}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            Suma movimientos en Mayor al período
          </div>
        </div>
      </div>

      {/* WORKSPACE CONTROLS BAR & QUICK STATUS */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-100/90 border border-slate-200 px-3.5 py-2 rounded-xl text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wide">
            Vista de Ventanas:
          </span>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setPanelsLayout('side-by-side')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                panelsLayout === 'side-by-side'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Disposición en 2 columnas paralelas proporcionales"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Columnas (Lado a Lado)</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelsLayout('stacked')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                panelsLayout === 'stacked'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Disposición en dos ventanas horizontales apiladas"
            >
              <Rows className="w-3.5 h-3.5" />
              <span>Ventanas Horizontales</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />

          {/* Quick status badge */}
          <div
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${
              reconciliationSummary.isBalanced
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-rose-100 text-rose-800 border border-rose-300'
            }`}
          >
            <span>{reconciliationSummary.isBalanced ? '✓' : '⚠️'}</span>
            <span>
              {reconciliationSummary.isBalanced
                ? 'Conciliación Cuadrada'
                : `Descuadre: $${reconciliationSummary.difference.toLocaleString('es-CL')}`}
            </span>
          </div>

          {reconciliationSummary.crossPeriodLines.length > 0 && (
            <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 items-center gap-1">
              <span>🔄</span>
              <span>{reconciliationSummary.crossPeriodLines.length} Multimes</span>
            </span>
          )}
        </div>

        {/* Right Toggle for Summary Sidebar */}
        <div className="flex items-center gap-2">
          {summaryPanelState === 'collapsed' ? (
            <button
              type="button"
              onClick={() => setSummaryPanelState('normal')}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-2xs transition-all"
              title="Abrir el panel vertical con el Resumen y Acta de Conciliación"
            >
              <PanelRightOpen className="w-4 h-4" />
              <span>Abrir Resumen Conciliación ➔</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
              <span className="text-[10px] text-slate-500 font-bold px-1.5 uppercase">Panel Resumen:</span>
              <button
                type="button"
                onClick={() => setSummaryPanelState(summaryPanelState === 'expanded' ? 'normal' : 'expanded')}
                className={`p-1 rounded text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors ${
                  summaryPanelState === 'expanded' ? 'bg-indigo-100 text-indigo-700 font-bold' : ''
                }`}
                title={summaryPanelState === 'expanded' ? 'Reducir a ancho moderado' : 'Ampliar vista lateral'}
              >
                {summaryPanelState === 'expanded' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setSummaryPanelState('collapsed')}
                className="p-1 rounded text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Minimizar panel a la derecha"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* WORKSPACE: CARTOLA & LIBROS (PROPORTIONAL WINDOWS) + VERTICAL RECONCILIATION SUMMARY */}
      <div className="flex flex-col lg:flex-row gap-4 items-start relative w-full">
        {/* Main Work Area: Dual Windows (Cartola Bancaria vs Movimientos Contables) */}
        <div className="flex-1 min-w-0 w-full">
          <div className={panelsLayout === 'side-by-side' ? 'grid grid-cols-1 xl:grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
            {/* Left Column: Cartola Bancaria (with cumulative balance) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Top Header */}
          <div className="p-3 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span>📄</span> Cartola Bancaria ({displayLines.length} de {unifiedHistoricalCartola.length > 0 ? unifiedHistoricalCartola.length : statementLines.length})
              </span>

              {/* Quick sync button if a single month is filtered and differs from selectedPeriod */}
              {cartolaSelectedMonths.length === 1 && cartolaSelectedMonths[0] !== selectedPeriod.slice(5, 7) && (
                <button
                  type="button"
                  onClick={() => {
                    const targetYr = cartolaYearFilter !== 'TODOS' ? cartolaYearFilter : selectedPeriod.slice(0, 4);
                    setSelectedPeriod(`${targetYr}-${cartolaSelectedMonths[0]}`);
                  }}
                  className="bg-amber-400 hover:bg-amber-300 text-amber-950 px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1 shadow-2xs transition-colors animate-pulse"
                  title="Sincronizar el Acta de Conciliación y los saldos del Libro Mayor con este mes"
                >
                  <ArrowRight className="w-3 h-3" />
                  <span>Sincronizar Acta con {MONTH_NAMES[cartolaSelectedMonths[0]]} {cartolaYearFilter !== 'TODOS' ? cartolaYearFilter : selectedPeriod.slice(0, 4)}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearCartolaPeriod}
                className="p-1 bg-rose-900/80 hover:bg-rose-800 text-rose-200 rounded border border-rose-700/60 transition-colors text-[10px] font-bold flex items-center gap-1 px-2"
                title="Anular / Limpiar la cartola cargada de este período (si no hay movimientos conciliados)"
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden sm:inline">Anular Cartola Mes</span>
              </button>
            </div>
          </div>

          {/* Excel-style Toolbar */}
          <div className="p-2.5 bg-slate-800 text-white border-b border-slate-700 flex flex-wrap items-center gap-2 text-xs">
            {/* Year Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-300 font-bold uppercase">Año:</span>
              <select
                value={cartolaYearFilter}
                onChange={(e) => setCartolaYearFilter(e.target.value)}
                className="text-[11px] bg-slate-900 text-white font-bold px-2 py-1 rounded border border-slate-700 hover:border-slate-500 focus:ring-1 focus:ring-indigo-400"
              >
                <option value="TODOS">Todos los Años</option>
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            {/* Month Multi-Select Filter (Excel-style Popover) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
                className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border font-bold transition-all ${
                  cartolaSelectedMonths.length > 0 && cartolaSelectedMonths[0] !== '99'
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs'
                    : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-750'
                }`}
                title="Filtrar uno o varios meses específicos estilo Excel"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-300" />
                <span>
                  {cartolaSelectedMonths.length === 0
                    ? 'Meses: Todos'
                    : cartolaSelectedMonths.length === 1 && cartolaSelectedMonths[0] !== '99'
                    ? `Mes: ${MONTH_NAMES[cartolaSelectedMonths[0]]}`
                    : cartolaSelectedMonths[0] === '99'
                    ? 'Meses: Ninguno'
                    : `Meses: (${cartolaSelectedMonths.length}) ${cartolaSelectedMonths.map(m => MONTH_NAMES[m]?.slice(0, 3)).join(', ')}`}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {/* Excel Multi-Month Popover Dropdown */}
              {isMonthDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsMonthDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1.5 z-40 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 w-80 p-3 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-1.5">
                        <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                        <span className="font-bold text-xs text-slate-900">Filtro de Meses (Estilo Excel)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMonthDropdownOpen(false)}
                        className="text-slate-400 hover:text-slate-700 font-bold text-sm px-1.5 py-0.5 rounded hover:bg-slate-100"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Presets */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Accesos Rápidos:</span>
                      <div className="grid grid-cols-2 gap-1 text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => setCartolaSelectedMonths([])}
                          className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 font-bold rounded text-left"
                        >
                          ✓ Todos los Meses
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const yr = selectedPeriod.slice(0, 4);
                            const mo = selectedPeriod.slice(5, 7);
                            setCartolaYearFilter(yr);
                            setCartolaSelectedMonths([mo]);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 font-bold rounded text-left"
                        >
                          📌 Mes Acta ({selectedPeriod})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCartolaYearFilter('2026');
                            setCartolaSelectedMonths(['05']);
                          }}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded text-left"
                        >
                          ⭐ Solo Mayo 2026
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCartolaYearFilter('2026');
                            setCartolaSelectedMonths(['04', '05']);
                          }}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded text-left"
                        >
                          ⭐ Abril + Mayo 2026
                        </button>
                      </div>
                    </div>

                    {/* Quick check/uncheck */}
                    <div className="flex items-center justify-between border-t border-b border-slate-100 py-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setCartolaSelectedMonths([])}
                        className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setCartolaSelectedMonths(['99'])}
                        className="text-slate-500 hover:text-slate-800 font-bold hover:underline"
                      >
                        Desmarcar Todos
                      </button>
                    </div>

                    {/* Month Checkboxes with count badges */}
                    <div className="max-h-52 overflow-y-auto space-y-0.5 divide-y divide-slate-100">
                      {ALL_MONTHS.map(mNum => {
                        const mName = MONTH_NAMES[mNum];
                        const count = monthMovementCounts[mNum] || 0;
                        const isChecked = cartolaSelectedMonths.length === 0 || cartolaSelectedMonths.includes(mNum);
                        return (
                          <label
                            key={mNum}
                            className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                              isChecked ? 'bg-indigo-50/50 font-semibold text-slate-900' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (cartolaSelectedMonths.length === 0) {
                                    setCartolaSelectedMonths(ALL_MONTHS.filter(m => m !== mNum));
                                  } else if (cartolaSelectedMonths.includes(mNum)) {
                                    const next = cartolaSelectedMonths.filter(m => m !== mNum);
                                    setCartolaSelectedMonths(next.length === 0 ? ['99'] : next);
                                  } else {
                                    const next = [...cartolaSelectedMonths.filter(m => m !== '99'), mNum];
                                    if (next.length === 12) setCartolaSelectedMonths([]);
                                    else setCartolaSelectedMonths(next);
                                  }
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                              />
                              <span className="text-xs">{mNum} - {mName}</span>
                            </div>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                count > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {count} movs
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {/* Popover Footer */}
                    <div className="pt-2 border-t border-slate-200 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIsMonthDropdownOpen(false)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs"
                      >
                        Cerrar y Aplicar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-300 font-bold uppercase">Estado:</span>
              <select
                value={filterStatement}
                onChange={(e) => setFilterStatement(e.target.value as any)}
                className={`text-[11px] font-bold px-2 py-1 rounded border ${
                  filterStatement === 'Duplicados'
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-white border-slate-700 hover:border-slate-500'
                }`}
              >
                <option value="Todos">Todos los Estados</option>
                <option value="Pendiente">⏳ Solo Pendientes</option>
                <option value="Conciliados">✓ Solo Conciliados</option>
                <option value="Duplicados">
                  ⚠️ Posibles Duplicados ({duplicateLinesCount})
                </option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[150px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
              <input
                type="text"
                placeholder="Buscar glosa, doc, monto..."
                value={statementSearchQuery}
                onChange={(e) => setStatementSearchQuery(e.target.value)}
                className="text-[11px] bg-slate-900 text-white placeholder-slate-400 pl-7 pr-6 py-1 rounded border border-slate-700 w-full focus:ring-1 focus:ring-indigo-400"
              />
              {statementSearchQuery && (
                <button
                  type="button"
                  onClick={() => setStatementSearchQuery('')}
                  className="absolute right-1.5 top-1.5 text-slate-400 hover:text-white text-xs font-bold"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Clear all filters button */}
            {(cartolaYearFilter !== 'TODOS' || cartolaSelectedMonths.length > 0 || filterStatement !== 'Todos' || statementSearchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setCartolaYearFilter('TODOS');
                  setCartolaSelectedMonths([]);
                  setFilterStatement('Todos');
                  setStatementSearchQuery('');
                }}
                className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded font-bold flex items-center gap-1 transition-colors"
                title="Restablecer todos los filtros de la cartola"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Restablecer</span>
              </button>
            )}
          </div>

          {/* Excel Totals Bar */}
          <div className="bg-slate-100 border-b border-slate-200 px-3 py-1 text-[11px] font-mono flex items-center justify-between text-slate-700 flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <span>Filas: <strong className="text-slate-950">{displayLines.length}</strong></span>
              <span>Total Cargos: <strong className="text-rose-700">${displayLines.reduce((acc, l) => acc + (l.charge || 0), 0).toLocaleString('es-CL')}</strong></span>
              <span>Total Abonos: <strong className="text-emerald-700">${displayLines.reduce((acc, l) => acc + (l.deposit || 0), 0).toLocaleString('es-CL')}</strong></span>
            </div>
            <div className="text-[10.5px] text-slate-500 font-sans font-medium">
              {cartolaSelectedMonths.length > 0 && cartolaSelectedMonths[0] !== '99'
                ? `Meses activos: ${cartolaSelectedMonths.map(m => MONTH_NAMES[m]).join(', ')}`
                : cartolaYearFilter !== 'TODOS'
                ? `Año: ${cartolaYearFilter}`
                : 'Vista sin restricciones de período'}
            </div>
          </div>

          <div className="overflow-auto max-h-[calc(100vh-270px)] min-h-[480px] flex-1">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200 text-[11px] shadow-2xs">
                <tr>
                  <th className="py-2 px-2">Fecha</th>
                  <th className="py-2 px-2">Glosa Banco</th>
                  <th className="py-2 px-1.5 text-right text-rose-700">Cargo ($)</th>
                  <th className="py-2 px-1.5 text-right text-emerald-700">Abono ($)</th>
                  <th className="py-2 px-1.5 text-right text-indigo-900">Saldo ($)</th>
                  <th className="py-2 px-2 text-center">Estado / Asiento</th>
                  <th className="py-2 px-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {displayLines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay movimientos de cartola para mostrar con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  displayLines.map(l => {
                    // Check duplicate status
                    const d = (l.date || '').trim();
                    const chg = Math.round(l.charge || 0);
                    const dep = Math.round(l.deposit || 0);
                    const desc = (l.description || '').toLowerCase().trim().replace(/\s+/g, ' ');
                    const amt = chg > 0 ? `C_${chg}` : `D_${dep}`;
                    const fp = `${d}__${amt}__${desc}`;
                    const dupInfo = statementDuplicatesMap.get(fp);
                    const isPotentialDuplicate = dupInfo && dupInfo.count >= 2;

                    return (
                      <tr
                        key={l.id}
                        className={
                          l.matchedStatus === 'Conciliado'
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                            : isPotentialDuplicate
                            ? 'bg-amber-50/60 hover:bg-amber-100/50'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td className="py-2 px-2 text-slate-700 font-mono text-[11px] whitespace-nowrap">
                          <div>{l.date}</div>
                          {l.date && l.date.slice(5, 7) !== selectedPeriod.slice(5, 7) && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-bold">
                              {MONTH_NAMES[l.date.slice(5, 7)]?.slice(0, 3)} '{l.date.slice(2, 4)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 font-sans max-w-[140px] text-slate-900 font-medium" title={l.description}>
                          <div className="truncate">{l.description}</div>
                          {isPotentialDuplicate && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-black bg-amber-200 text-amber-950 border border-amber-400 mt-0.5"
                              title={`Existen ${dupInfo.count} movimientos con idéntica fecha, monto y glosa en la cartola.`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-800" />
                              <span>Duplicado ({dupInfo.count}x)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1.5 text-right text-rose-700 font-bold">
                          {l.charge > 0 ? `$${l.charge.toLocaleString('es-CL')}` : '-'}
                        </td>
                        <td className="py-2 px-1.5 text-right text-emerald-700 font-bold">
                          {l.deposit > 0 ? `$${l.deposit.toLocaleString('es-CL')}` : '-'}
                        </td>
                        <td className="py-2 px-1.5 text-right font-black text-slate-900 bg-slate-50/50">
                          ${(l.balance || 0).toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-2 text-center font-sans">
                          {l.matchedStatus === 'Conciliado' ? (
                            <div className="flex flex-col items-center">
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ N° {l.matchedVoucherNumber || 'Asiento'}
                              </span>
                              {l.matchedVoucherPeriod && l.matchedVoucherPeriod !== selectedPeriod && (
                                <span className="text-[9px] text-indigo-700 font-bold bg-indigo-50 px-1 rounded mt-0.5 border border-indigo-200">
                                  🔄 Mes: {l.matchedVoucherPeriod}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                ⏳ Pendiente
                              </span>
                              {(() => {
                                const isChg = l.charge > 0;
                                const amt = isChg ? l.charge : l.deposit;
                                const key = isChg ? `CREDIT_${amt}` : `DEBIT_${amt}`;
                                const dupGroup = duplicateVouchersMap.get(key);
                                if (dupGroup && dupGroup.count >= 2) {
                                  return (
                                    <span
                                      className="text-[8.5px] font-bold text-amber-900 bg-amber-100/90 px-1 py-0.5 rounded border border-amber-300 mt-0.5 text-center leading-tight"
                                      title={`Existen ${dupGroup.count} comprobantes en libros con este monto (${dupGroup.voucherNumbers.map(n => `N° ${n}`).join(', ')}). No se concilia automáticamente por seguridad.`}
                                    >
                                      ⚠️ {dupGroup.count} asientos en libros
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            {l.matchedStatus === 'Conciliado' ? (
                              <button
                                onClick={() => handleToggleManualMatch(l.id)}
                                className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10px] font-bold"
                                title="Desvincular comprobante"
                              >
                                Desvincular
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setManualMatchLine(l);
                                    setModalExactOnly(true);
                                    setModalSearch('');
                                    setModalScope('TODOS_PENDIENTES');
                                  }}
                                  className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded text-[10px]"
                                  title="Vincular con asiento de este o cualquier mes"
                                >
                                  Match
                                </button>
                                <button
                                  onClick={() => {
                                    const shift = getNextOpenPeriodAndDate(l.date, fiscalYears);
                                    setQuickVoucherLine(l);
                                    setQuickGloss(l.description);
                                    setQuickVoucherPeriod(shift.period);
                                    const defaultExpense = accounts.find(
                                      a =>
                                        (a.code || '').startsWith('4-2-01') ||
                                        (a.name || '').toLowerCase().includes('comision') ||
                                        (a.name || '').toLowerCase().includes('bancari')
                                    );
                                    if (defaultExpense) setQuickExpenseAccountId(defaultExpense.id);
                                  }}
                                  className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px]"
                                  title="Crear asiento contable rápido"
                                >
                                  + Asiento
                                </button>
                                <button
                                  onClick={() => handleDeleteStatementLine(l.id)}
                                  className="px-1 py-0.5 bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-700 rounded text-[10px] transition-colors"
                                  title="Eliminar este movimiento individual de la cartola (útil para limpiar duplicados)"
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Movimientos en Libro Mayor (Cross-period view) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <span className="font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span>📚</span> Asientos en Libros ({filteredBankVouchers.length})
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                value={voucherPeriodScope}
                onChange={(e) => setVoucherPeriodScope(e.target.value as any)}
                className="text-[10px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700 font-bold"
                title="Filtrar alcance de comprobantes"
              >
                <option value="PENDIENTES_TODOS">Todos los Pendientes (Multimes)</option>
                <option value="PERIODO_ACTUAL">Solo Mes Actual ({selectedPeriod})</option>
                <option value="HASTA_ACTUAL">Hasta Mes Actual (≤ {selectedPeriod})</option>
                <option value="ANIO_ACTUAL">Todo el Año ({selectedPeriod.slice(0, 4)})</option>
                <option value="TODOS">Todos Históricos</option>
              </select>

              <select
                value={filterVouchers}
                onChange={(e) => setFilterVouchers(e.target.value as any)}
                className="text-[10px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700"
              >
                <option value="Todos">Todos</option>
                <option value="Conciliados">Conciliados</option>
                <option value="Pendiente">Pendientes</option>
              </select>
            </div>
          </div>

          <div className="overflow-auto max-h-[calc(100vh-270px)] min-h-[480px] flex-1">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200 text-[11px] shadow-2xs">
                <tr>
                  <th className="py-2 px-2">Fecha / Mes</th>
                  <th className="py-2 px-2">N° Asiento</th>
                  <th className="py-2 px-2">Glosa / Concepto</th>
                  <th className="py-2 px-1.5 text-right text-emerald-700">Debe ($)</th>
                  <th className="py-2 px-1.5 text-right text-rose-700">Haber ($)</th>
                  <th className="py-2 px-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {filteredBankVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay comprobantes contables registrados para esta cuenta en el alcance seleccionado.
                    </td>
                  </tr>
                ) : (
                  filteredBankVouchers.map((bv, idx) => (
                    <tr
                      key={idx}
                      className={
                        bv.isMatchedInCurrent
                          ? 'bg-emerald-50/50'
                          : bv.isMatchedInOther
                          ? 'bg-slate-100/70 text-slate-400'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2 px-2 text-slate-600 text-[10px]">
                        <div>{bv.date}</div>
                        {bv.period !== selectedPeriod && (
                          <span className="text-[9px] font-sans font-bold bg-purple-100 text-purple-800 px-1 rounded border border-purple-200">
                            Mes {bv.period}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-bold text-indigo-700 font-mono">N° {bv.voucher.voucherNumber}</td>
                      <td className="py-2 px-2 font-sans truncate max-w-[130px] text-slate-900 font-medium" title={bv.gloss}>
                        {bv.gloss}
                      </td>
                      <td className="py-2 px-1.5 text-right font-bold text-emerald-700">
                        {bv.debit > 0 ? `$${bv.debit.toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="py-2 px-1.5 text-right font-bold text-rose-700">
                        {bv.credit > 0 ? `$${bv.credit.toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-center font-sans">
                        {bv.isMatchedInCurrent ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ Este Mes
                          </span>
                        ) : bv.isMatchedInOther ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-600">
                            Conciliado ({bv.matchedInOtherPeriod})
                          </span>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                              ⏳ Pendiente
                            </span>
                            {(() => {
                              const isDebitDup = bv.debit > 0 && (duplicateVouchersMap.get(`DEBIT_${bv.debit}`)?.count || 0) >= 2;
                              const isCreditDup = bv.credit > 0 && (duplicateVouchersMap.get(`CREDIT_${bv.credit}`)?.count || 0) >= 2;
                              if (isDebitDup || isCreditDup) {
                                const dupCount = isDebitDup
                                  ? duplicateVouchersMap.get(`DEBIT_${bv.debit}`)?.count
                                  : duplicateVouchersMap.get(`CREDIT_${bv.credit}`)?.count;
                                return (
                                  <span
                                    className="text-[8.5px] font-bold text-amber-900 bg-amber-100/90 px-1 py-0.5 rounded border border-amber-300 mt-0.5 text-center leading-tight"
                                    title={`Existen ${dupCount} comprobantes con el mismo monto en contabilidad. Posible duplicado registrado por el contador.`}
                                  >
                                    ⚠️ {dupCount} asientos iguales
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    {/* Vertical Reconciliation Summary Panel on the Right */}
    {summaryPanelState === 'collapsed' ? (
      <div
        onClick={() => setSummaryPanelState('normal')}
        className="hidden lg:flex flex-col items-center justify-between bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-2 shadow-xs shrink-0 self-stretch w-12 py-4 cursor-pointer group transition-all"
        title="Hacer clic para desplegar el Resumen de Conciliación"
      >
        <button
          type="button"
          className="p-1.5 bg-indigo-50 group-hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
          title="Abrir resumen lateral"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="[writing-mode:vertical-lr] rotate-180 font-black text-[11px] tracking-wider flex items-center gap-2 py-4">
          <span className={reconciliationSummary.isBalanced ? 'text-emerald-700' : 'text-rose-700'}>
            {reconciliationSummary.isBalanced ? '✓ ACTA CUADRADA' : `⚠️ DESCUADRE $${reconciliationSummary.difference.toLocaleString('es-CL')}`}
          </span>
        </div>
        <PanelRightOpen className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
      </div>
    ) : (
      <div
        className={`w-full ${
          summaryPanelState === 'expanded' ? 'lg:w-[480px]' : 'lg:w-[360px]'
        } shrink-0 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col self-stretch transition-all duration-200 sticky top-4`}
      >
        {/* Panel Top Header */}
        <div className="p-3 bg-slate-900 text-white flex items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-xs uppercase tracking-wide truncate">
              📋 Resumen Conciliación
            </span>
            <span className="text-[10px] text-slate-400 font-mono">({selectedPeriod})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSummaryPanelState(summaryPanelState === 'expanded' ? 'normal' : 'expanded')}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title={summaryPanelState === 'expanded' ? 'Reducir a tamaño moderado' : 'Ampliar vista hacia el costado'}
            >
              {summaryPanelState === 'expanded' ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setSummaryPanelState('collapsed')}
              className="p-1 rounded text-slate-300 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Minimizar panel a la derecha"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Panel Body Scrollable Content */}
        <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] text-xs font-mono">
          {/* Cuadratura Badge */}
          <div
            className={`p-2.5 rounded-lg border text-center transition-all ${
              reconciliationSummary.isBalanced
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5">
              <span>{reconciliationSummary.isBalanced ? '✓' : '⚠️'}</span>
              <span>
                {reconciliationSummary.isBalanced
                  ? 'Conciliación Cuadrada'
                  : `Descuadre: $${reconciliationSummary.difference.toLocaleString('es-CL')}`}
              </span>
            </div>
            {reconciliationSummary.crossPeriodLines.length > 0 && (
              <div className="mt-1 text-[10px] text-indigo-800 font-sans font-medium">
                🔄 {reconciliationSummary.crossPeriodLines.length} partidas regularizadas multimes
              </div>
            )}
          </div>

          {/* Enfoque 1: Banco -> Contabilidad */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 font-sans border-b pb-1 text-[10.5px] uppercase flex justify-between items-center">
              <span className="text-indigo-950 font-black">Banco → Contabilidad</span>
              <span className="text-[9px] text-indigo-700 bg-indigo-100/80 font-bold px-1.5 py-0.2 rounded">
                Cartola Base
              </span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                <span className="font-sans">Saldo Cartola:</span>
                <span className="font-mono text-slate-950">${bankFinalBalanceInput.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-indigo-800 px-1">
                <span className="font-sans">(+) Cargos No Cont.:</span>
                <span className="font-bold">+${reconciliationSummary.unmatchedCharges.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-rose-700 px-1">
                <span className="font-sans">(-) Abonos No Cont.:</span>
                <span className="font-bold">-${reconciliationSummary.unmatchedDeposits.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-rose-700 px-1">
                <span className="font-sans">(-) Cheques en Tránsito:</span>
                <span className="font-bold">-${reconciliationSummary.outstandingChecks.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-indigo-800 px-1">
                <span className="font-sans">(+) Depósitos en Tránsito:</span>
                <span className="font-bold">+${reconciliationSummary.depositsInTransit.toLocaleString('es-CL')}</span>
              </div>
              {reconciliationSummary.futureMatchedCharges > 0 && (
                <div className="flex justify-between text-amber-800 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  <span className="font-sans">(-) Cargos reg. posterior:</span>
                  <span className="font-bold">-${reconciliationSummary.futureMatchedCharges.toLocaleString('es-CL')}</span>
                </div>
              )}
              {reconciliationSummary.futureMatchedDeposits > 0 && (
                <div className="flex justify-between text-amber-800 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  <span className="font-sans">(+) Abonos reg. posterior:</span>
                  <span className="font-bold">+${reconciliationSummary.futureMatchedDeposits.toLocaleString('es-CL')}</span>
                </div>
              )}
            </div>
            <div className="pt-1.5 border-t mt-1">
              <div className="flex justify-between font-black text-slate-900 bg-amber-100 px-2 py-1 rounded border border-amber-300 shadow-2xs text-[10.5px]">
                <span className="font-sans text-slate-950 uppercase">CALCULADO:</span>
                <span className="text-slate-950 font-black">
                  ${reconciliationSummary.calculatedBookBalance.toLocaleString('es-CL')}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-600 px-1 pt-0.5">
                <span className="font-sans">Mayor Real:</span>
                <span className="font-bold font-mono text-slate-900">${bookFinalBalance.toLocaleString('es-CL')}</span>
              </div>
            </div>
          </div>

          {/* Enfoque 2: Contabilidad -> Banco */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 font-sans border-b pb-1 text-[10.5px] uppercase flex justify-between items-center">
              <span className="text-indigo-950 font-black">Contabilidad → Banco</span>
              <span className="text-[9px] text-emerald-700 bg-emerald-100/80 font-bold px-1.5 py-0.2 rounded">
                Mayor Base
              </span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                <span className="font-sans">Saldo Contabilidad:</span>
                <span className="font-mono text-slate-950">${bookFinalBalance.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-indigo-800 px-1">
                <span className="font-sans">(+) Cheques en Tránsito:</span>
                <span className="font-bold">+${reconciliationSummary.outstandingChecks.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-rose-700 px-1">
                <span className="font-sans">(-) Depósitos en Tránsito:</span>
                <span className="font-bold">-${reconciliationSummary.depositsInTransit.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-rose-700 px-1">
                <span className="font-sans">(-) Cargos No Cont.:</span>
                <span className="font-bold">-${reconciliationSummary.unmatchedCharges.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-indigo-800 px-1">
                <span className="font-sans">(+) Abonos No Cont.:</span>
                <span className="font-bold">+${reconciliationSummary.unmatchedDeposits.toLocaleString('es-CL')}</span>
              </div>
              {reconciliationSummary.futureMatchedCharges > 0 && (
                <div className="flex justify-between text-amber-800 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  <span className="font-sans">(+) Cargos reg. posterior:</span>
                  <span className="font-bold">+${reconciliationSummary.futureMatchedCharges.toLocaleString('es-CL')}</span>
                </div>
              )}
              {reconciliationSummary.futureMatchedDeposits > 0 && (
                <div className="flex justify-between text-amber-800 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  <span className="font-sans">(-) Abonos reg. posterior:</span>
                  <span className="font-bold">-${reconciliationSummary.futureMatchedDeposits.toLocaleString('es-CL')}</span>
                </div>
              )}
            </div>
            <div className="pt-1.5 border-t mt-1">
              <div className="flex justify-between font-black text-slate-900 bg-amber-100 px-2 py-1 rounded border border-amber-300 shadow-2xs text-[10.5px]">
                <span className="font-sans text-slate-950 uppercase">CALCULADO:</span>
                <span className="text-slate-950 font-black">
                  ${reconciliationSummary.calculatedBankBalance.toLocaleString('es-CL')}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-600 px-1 pt-0.5">
                <span className="font-sans">Cartola Real:</span>
                <span className="font-bold font-mono text-slate-900">${bankFinalBalanceInput.toLocaleString('es-CL')}</span>
              </div>
            </div>
          </div>

          {/* Informes y Auditoría Buttons */}
          <div className="pt-1 space-y-1.5 font-sans">
            <button
              type="button"
              onClick={() => setShowPendingReportModal(true)}
              className="w-full py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>📊</span>
              <span>Ver Informe de Partidas Pendientes</span>
            </button>
            <div className="text-[9.5px] text-slate-400 text-center">
              Cuenta: {selectedBankAccount?.code} ({selectedBankAccount?.bankInstitution || 'Banco'})
            </div>
          </div>
        </div>
      </div>
    )}
  </div>

      {/* MODALS */}
      <BankCartolaSmartImportModal
        isOpen={showSmartImportModal}
        onClose={() => setShowSmartImportModal(false)}
        selectedBankAccount={selectedBankAccount}
        selectedPeriod={selectedPeriod}
        existingLines={statementLines}
        currentInitialBalance={bankInitialBalanceInput}
        onImportComplete={async ({ newLines, initialBalance, finalBalance, bankName }) => {
          // Check if lines span multiple periods based on line.date (YYYY-MM)
          const periodBuckets = new Map<string, BankStatementLine[]>();

          // Merge non-duplicate new lines with existing lines and sort chronologically
          const combined = [...statementLines, ...newLines].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

          combined.forEach(line => {
            const p = line.date && line.date.length >= 7 ? line.date.slice(0, 7) : selectedPeriod;
            if (!periodBuckets.has(p)) periodBuckets.set(p, []);
            periodBuckets.get(p)!.push(line);
          });

          const sortedPeriods = Array.from(periodBuckets.keys()).sort();
          let runningInitial = initialBalance;
          let summaryPeriodsText = '';

          for (const p of sortedPeriods) {
            const pLines = periodBuckets.get(p)!;
            const { updatedLines, finalBalance: pFinal } = recalculateRunningBalances(pLines, runningInitial);
            await persistReconciliation(p, updatedLines, runningInitial, pFinal);
            summaryPeriodsText += `\n• Período ${p}: ${pLines.length} movimientos (Saldo Final: $${pFinal.toLocaleString('es-CL')})`;

            if (p === selectedPeriod) {
              setBankInitialBalanceInput(runningInitial);
              setBankFinalBalanceInput(pFinal);
              setStatementLines(updatedLines);
            }
            runningInitial = pFinal;
          }

          await fetchReconciliations();

          alert(
            `✅ Cartola de ${bankName} inyectada con éxito:\n• ${newLines.length} nuevos movimientos procesados.${summaryPeriodsText}\n• Guardado automáticamente en Firestore.`
          );
        }}
      />

      <ImportCSVModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        pastedCSV={pastedCSV}
        setPastedCSV={setPastedCSV}
        importInitialBalance={importInitialBalance}
        setImportInitialBalance={setImportInitialBalance}
        onImport={handleImportPastedCSV}
        currentPeriod={selectedPeriod}
      />

      <ManualMatchModal
        manualMatchLine={manualMatchLine}
        onClose={() => setManualMatchLine(null)}
        modalScope={modalScope}
        setModalScope={setModalScope}
        modalExactOnly={modalExactOnly}
        setModalExactOnly={setModalExactOnly}
        modalSearch={modalSearch}
        setModalSearch={setModalSearch}
        availableVouchers={modalAvailableVouchers}
        onMatch={handleManualMatch}
        selectedPeriod={selectedPeriod}
      />

      <QuickVoucherModal
        quickVoucherLine={quickVoucherLine}
        onClose={() => setQuickVoucherLine(null)}
        accounts={accounts}
        auxiliaries={auxiliaries}
        vouchers={vouchers}
        rcvDocuments={rcvDocuments}
        costCenters={costCenters}
        expenseItems={expenseItems}
        projects={projects}
        products={products}
        customAnalysisItems={customAnalysisItems}
        customColumns={company.customAccountColumns || []}
        selectedBankAccount={selectedBankAccount}
        quickExpenseAccountId={quickExpenseAccountId}
        setQuickExpenseAccountId={setQuickExpenseAccountId}
        quickGloss={quickGloss}
        setQuickGloss={setQuickGloss}
        quickVoucherPeriod={quickVoucherPeriod}
        setQuickVoucherPeriod={setQuickVoucherPeriod}
        fiscalYears={fiscalYears}
        onPostVoucherWithLines={handleQuickPostVoucher}
        onPost={handleQuickPostVoucher}
      />

      <AutoRutMatchModal
        isOpen={showAutoRutModal}
        onClose={() => setShowAutoRutModal(false)}
        studyId={studyId}
        company={company}
        statementLines={statementLines}
        accounts={accounts}
        vouchers={vouchers}
        auxiliaries={auxiliaries}
        rcvDocuments={rcvDocuments}
        selectedBankAccountId={selectedBankAccountId}
        selectedPeriod={selectedPeriod}
        fiscalYears={fiscalYears}
        onApplyMatches={async (updatedLines, count) => {
          setStatementLines(updatedLines);
          await persistReconciliation(selectedPeriod, updatedLines, bankInitialBalanceInput, bankFinalBalanceInput);
        }}
        onVouchersUpdated={onVouchersUpdated}
      />

      <PendingItemsReportModal
        isOpen={showPendingReportModal}
        onClose={() => setShowPendingReportModal(false)}
        company={company}
        bankAccount={selectedBankAccount}
        period={selectedPeriod}
        bankFinalBalance={bankFinalBalanceInput}
        bookFinalBalance={bookFinalBalance}
        unmatchedCharges={statementLines.filter(l => l.matchedStatus !== 'Conciliado' && (l.charge || 0) > 0)}
        unmatchedDeposits={statementLines.filter(l => l.matchedStatus !== 'Conciliado' && (l.deposit || 0) > 0)}
        outstandingChecks={allBankVouchers.filter(bv => !bv.isMatchedInCurrent && !bv.isMatchedInOther && (bv.credit || 0) > 0)}
        depositsInTransit={allBankVouchers.filter(bv => !bv.isMatchedInCurrent && !bv.isMatchedInOther && (bv.debit || 0) > 0)}
      />
    </div>
  );
}
