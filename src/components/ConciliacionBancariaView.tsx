import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, doc, setDoc } from 'firebase/firestore';
import { Company, ChartOfAccount, Voucher, BankStatementLine, BankReconciliation, FiscalPeriodYear } from '../types';
import { checkIsPeriodClosed, getLatestOpenPeriod } from '../utils/periodUtils';
import { logAuditEvent } from '../utils/auditLogger';
import {
  getPreviousPeriod,
  getNextPeriod,
  recalculateRunningBalances,
  sanitizeForFirestore,
  calculateReconciliationMath,
  getDuplicateVouchersMap
} from '../utils/bankReconciliationUtils';
import { ImportCSVModal, ManualMatchModal, QuickVoucherModal } from './BankReconciliationModals';

interface ConciliacionBancariaViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
}

export default function ConciliacionBancariaView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears,
  onVouchersUpdated
}: ConciliacionBancariaViewProps) {
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => getLatestOpenPeriod(fiscalYears));
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
  const [filterStatement, setFilterStatement] = useState<'Todos' | 'Conciliados' | 'Pendiente'>('Todos');
  const [filterVouchers, setFilterVouchers] = useState<'Todos' | 'Conciliados' | 'Pendiente'>('Todos');
  const [statementSearchQuery, setStatementSearchQuery] = useState<string>('');
  const [voucherSearchQuery, setVoucherSearchQuery] = useState<string>('');

  // Modals
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
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
        String(bv.voucher.voucherNumber).includes(q) ||
        bv.gloss.toLowerCase().includes(q) ||
        bv.date.includes(q) ||
        bv.period.includes(q) ||
        String(bv.debit).includes(q) ||
        String(bv.credit).includes(q)
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

  // Math Reconciliation Summary
  const reconciliationSummary = useMemo(() => {
    return calculateReconciliationMath(
      statementLines,
      allBankVouchers,
      bankInitialBalanceInput,
      bankFinalBalanceInput,
      bookFinalBalance,
      selectedPeriod
    );
  }, [statementLines, allBankVouchers, bankInitialBalanceInput, bankFinalBalanceInput, bookFinalBalance, selectedPeriod]);

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

    combinedRecs.forEach(rec => {
      const lines = [...(rec.lines || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      lines.forEach(l => {
        progressiveBalance += (l.deposit || 0) - (l.charge || 0);
        allLines.push({
          ...l,
          period: rec.period,
          balance: progressiveBalance
        });
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
        const summary = calculateReconciliationMath(
          lines,
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
          const val = parseFloat(parts[2].replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.')) || 0;
          if (val < 0) charge = Math.abs(val);
          else deposit = val;
        } else if (parts.length === 4) {
          charge = Math.abs(parseFloat(parts[2].replace(/[^0-9.-]/g, '')) || 0);
          deposit = Math.abs(parseFloat(parts[3].replace(/[^0-9.-]/g, '')) || 0);
        } else if (parts.length === 5) {
          docNum = parts[2];
          charge = Math.abs(parseFloat(parts[3].replace(/[^0-9.-]/g, '')) || 0);
          deposit = Math.abs(parseFloat(parts[4].replace(/[^0-9.-]/g, '')) || 0);
        } else if (parts.length >= 6) {
          docNum = parts[2];
          charge = Math.abs(parseFloat(parts[3].replace(/[^0-9.-]/g, '')) || 0);
          deposit = Math.abs(parseFloat(parts[4].replace(/[^0-9.-]/g, '')) || 0);
          const balParsed = parseFloat(parts[5].replace(/[^0-9.-]/g, ''));
          if (!isNaN(balParsed)) directBalance = balParsed;
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
  };

  // 5. Perform manual cross-period match + Immediate Auto-Save
  const handleManualMatch = async (voucherId: string, voucherNumber: number, voucherPeriod: string) => {
    if (!manualMatchLine) return;

    const updated = statementLines.map(l => {
      if (l.id === manualMatchLine.id) {
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
  };

  // 6. Quick Post Unaccounted Bank Fee or Income + Auto-Match + Immediate Auto-Save
  const handleQuickPostVoucher = async () => {
    if (!quickVoucherLine || !selectedBankAccount || !quickExpenseAccountId) {
      alert('Seleccione la cuenta de contrapartida (Gasto Bancario / Ingreso).');
      return;
    }

    const targetPeriod = quickVoucherPeriod || selectedPeriod;
    const periodCheck = checkIsPeriodClosed(targetPeriod, fiscalYears);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes registrar comprobantes en un período cerrado.`);
      return;
    }

    const counterAcc = accounts.find(a => a.id === quickExpenseAccountId);
    if (!counterAcc) return;

    try {
      const nextVoucherNumber = (vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0) + 1;
      const isCharge = quickVoucherLine.charge > 0;
      const amount = isCharge ? quickVoucherLine.charge : quickVoucherLine.deposit;

      let voucherLines = [];
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
            gloss: quickGloss || quickVoucherLine.description
          },
          {
            id: 'l2',
            accountId: selectedBankAccount.id,
            accountCode: selectedBankAccount.code,
            accountName: selectedBankAccount.name,
            debit: 0,
            credit: amount,
            documentRef: quickVoucherLine.documentNumber || 'BANCO',
            gloss: quickGloss || quickVoucherLine.description
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
            gloss: quickGloss || quickVoucherLine.description
          },
          {
            id: 'l2',
            accountId: counterAcc.id,
            accountCode: counterAcc.code,
            accountName: counterAcc.name,
            debit: 0,
            credit: amount,
            documentRef: quickVoucherLine.documentNumber || 'BANCO',
            gloss: quickGloss || quickVoucherLine.description
          }
        ];
      }

      const newVoucherData = {
        voucherNumber: nextVoucherNumber,
        date: quickVoucherLine.date,
        period: targetPeriod,
        type: isCharge ? 'Egreso' : 'Ingreso',
        gloss: `Ajuste Conciliación Bancaria - ${quickGloss || quickVoucherLine.description}`,
        lines: voucherLines,
        totalDebit: amount,
        totalCredit: amount,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(companyRef, 'vouchers'), newVoucherData);

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

      alert(`✅ Comprobante N° ${nextVoucherNumber} generado en período ${targetPeriod}, conciliado y guardado automáticamente.`);
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

  // Filtered Cartola Lines
  const displayLines = useMemo(() => {
    const source = cartolaViewMode === 'CARTOLA_HISTORICA_UNIDA' ? unifiedHistoricalCartola : statementLines;
    return source.filter(l => {
      if (filterStatement === 'Conciliados' && l.matchedStatus !== 'Conciliado') return false;
      if (filterStatement === 'Pendiente' && l.matchedStatus !== 'Pendiente') return false;
      if (statementSearchQuery.trim()) {
        const q = statementSearchQuery.toLowerCase().trim();
        const matchesDesc = l.description.toLowerCase().includes(q);
        const matchesDoc = (l.documentNumber || '').toLowerCase().includes(q);
        const matchesDate = l.date.includes(q);
        const matchesCharge = String(l.charge).includes(q);
        const matchesDep = String(l.deposit).includes(q);
        const matchesVoucher = l.matchedVoucherNumber ? String(l.matchedVoucherNumber).includes(q) : false;
        if (!matchesDesc && !matchesDoc && !matchesDate && !matchesCharge && !matchesDep && !matchesVoucher) return false;
      }
      return true;
    });
  }, [cartolaViewMode, unifiedHistoricalCartola, statementLines, filterStatement, statementSearchQuery]);

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
        String(bv.voucher.voucherNumber).includes(q) ||
        bv.gloss.toLowerCase().includes(q) ||
        bv.date.includes(q) ||
        bv.period.includes(q) ||
        String(bv.debit).includes(q) ||
        String(bv.credit).includes(q)
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
            onClick={() => {
              setImportInitialBalance(bankInitialBalanceInput);
              setShowImportModal(true);
            }}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-lg border border-indigo-200 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <span>📥</span>
            <span>Importar Cartola CSV</span>
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
            <span>Arrastre Anterior:</span>
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

      {/* RECONCILIATION SUMMARY BOX / AUDIT REPORT */}
      <div
        className={`p-4 rounded-xl border transition-all ${
          reconciliationSummary.isBalanced
            ? 'bg-emerald-50/80 border-emerald-300'
            : 'bg-rose-50/80 border-rose-300'
        }`}
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b pb-3 mb-3 border-slate-200">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-800 flex items-center gap-2">
              <span>📋</span> Acta de Conciliación Bancaria y Cuadratura ({selectedPeriod})
            </span>
            <span className="text-xs text-slate-500 font-sans">
              Cuenta: {selectedBankAccount?.code} - {selectedBankAccount?.name} ({selectedBankAccount?.bankInstitution || 'Banco'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {reconciliationSummary.crossPeriodLines.length > 0 && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                <span>🔄</span>
                <span>{reconciliationSummary.crossPeriodLines.length} Regularizaciones Multimes</span>
              </span>
            )}
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                reconciliationSummary.isBalanced
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-rose-600 text-white shadow-xs'
              }`}
            >
              <span>{reconciliationSummary.isBalanced ? '✓' : '⚠️'}</span>
              <span>
                {reconciliationSummary.isBalanced
                  ? 'Conciliación Cuadrada (Diferencia $0)'
                  : `Descuadrado por $${reconciliationSummary.difference.toLocaleString('es-CL')}`}
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* Lado 1: Saldo Cartola Acumulado */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="font-bold text-slate-900 font-sans border-b pb-1 text-[11px] uppercase flex justify-between items-center">
              <span>1. Enfoque Saldo según Cartola Banco</span>
              <span className="text-[10px] text-slate-400 font-mono font-normal">Acumulativo</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Saldo Inicial Cartola (Mes Anterior):</span>
              <span className="font-bold text-slate-800">${bankInitialBalanceInput.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-emerald-700 text-[11px]">
              <span className="font-sans">(+) Abonos / Depósitos del Mes:</span>
              <span className="font-bold">
                +${reconciliationSummary.totalDepositsMonth.toLocaleString('es-CL')}
              </span>
            </div>
            <div className="flex justify-between text-rose-700 text-[11px]">
              <span className="font-sans">(-) Cargos / Giros del Mes:</span>
              <span className="font-bold">
                -${reconciliationSummary.totalChargesMonth.toLocaleString('es-CL')}
              </span>
            </div>
            <div className="border-t pt-1 flex justify-between font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded">
              <span className="font-sans">(=) Saldo Final según Cartola Bancaria:</span>
              <span className="font-mono text-indigo-900 font-black">${bankFinalBalanceInput.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-emerald-700 pt-1">
              <span className="font-sans">(+) Depósitos en Tránsito (en Libros):</span>
              <span className="font-bold">+${reconciliationSummary.depositsInTransit.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-rose-700">
              <span className="font-sans">(-) Cheques / Egresos en Tránsito:</span>
              <span className="font-bold">-${reconciliationSummary.outstandingChecks.toLocaleString('es-CL')}</span>
            </div>
            <div className="border-t pt-1.5 flex justify-between font-black text-slate-900 bg-indigo-50/80 px-2.5 py-1 rounded border border-indigo-100">
              <span className="font-sans text-indigo-950">(=) Saldo Banco Ajustado:</span>
              <span className="text-indigo-800 text-sm font-black">
                ${reconciliationSummary.reconciledStatementBalance.toLocaleString('es-CL')}
              </span>
            </div>
          </div>

          {/* Lado 2: Saldo Libros y Regularizaciones Multimes */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="font-bold text-slate-900 font-sans border-b pb-1 text-[11px] uppercase flex justify-between items-center">
              <span>2. Enfoque Saldo según Libro Mayor</span>
              <span className="text-[10px] text-slate-400 font-mono font-normal">Contabilidad</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Saldo según Libro Mayor ({selectedPeriod}):</span>
              <span className="font-bold text-slate-900">${bookFinalBalance.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span className="font-sans">(+) Abonos Banco no en Libros:</span>
              <span className="font-bold">+${reconciliationSummary.unmatchedDeposits.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-rose-700">
              <span className="font-sans">(-) Cargos Banco no en Libros:</span>
              <span className="font-bold">-${reconciliationSummary.unmatchedCharges.toLocaleString('es-CL')}</span>
            </div>

            {/* Cross-period breakdown if any */}
            {reconciliationSummary.futureMatchedCharges > 0 && (
              <div className="flex justify-between text-amber-700 text-[11px] bg-amber-50/60 px-1.5 py-0.5 rounded">
                <span className="font-sans">(-) Cargos regularizados en meses posteriores:</span>
                <span className="font-bold">-${reconciliationSummary.futureMatchedCharges.toLocaleString('es-CL')}</span>
              </div>
            )}
            {reconciliationSummary.futureMatchedDeposits > 0 && (
              <div className="flex justify-between text-amber-700 text-[11px] bg-amber-50/60 px-1.5 py-0.5 rounded">
                <span className="font-sans">(+) Abonos regularizados en meses posteriores:</span>
                <span className="font-bold">+${reconciliationSummary.futureMatchedDeposits.toLocaleString('es-CL')}</span>
              </div>
            )}

            <div className="border-t pt-1.5 mt-2 flex justify-between font-black text-slate-900 bg-indigo-50/80 px-2.5 py-1 rounded border border-indigo-100">
              <span className="font-sans text-indigo-950">(=) Saldo Libros Ajustado:</span>
              <span className="text-indigo-800 text-sm font-black">
                ${reconciliationSummary.adjustedBookBalance.toLocaleString('es-CL')}
              </span>
            </div>

            {reconciliationSummary.crossPeriodLines.length > 0 && (
              <div className="text-[10px] text-slate-500 font-sans pt-1 italic">
                * {reconciliationSummary.crossPeriodLines.length} partida(s) de la cartola fueron regularizadas con comprobantes de otros meses.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DUAL VIEW: CARTOLA BANCARIA VS MOVIMIENTOS EN LIBROS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Cartola Bancaria (with cumulative balance) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span>📄</span> Cartola Bancaria ({displayLines.length} líneas)
              </span>

              {/* View Mode Toggle: Single Month vs Chained Historical Cartola */}
              <div className="flex rounded bg-slate-800 p-0.5 border border-slate-700 text-[10px]">
                <button
                  onClick={() => setCartolaViewMode('MES_ACTUAL')}
                  className={`px-2 py-0.5 rounded font-bold transition-colors ${
                    cartolaViewMode === 'MES_ACTUAL' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Mes Actual ({selectedPeriod})
                </button>
                <button
                  onClick={() => setCartolaViewMode('CARTOLA_HISTORICA_UNIDA')}
                  className={`px-2 py-0.5 rounded font-bold transition-colors ${
                    cartolaViewMode === 'CARTOLA_HISTORICA_UNIDA'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Muestra todos los meses concatenados en una sola cartola continua con saldo progresivo"
                >
                  Cartola Continua (Multimes)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Buscar glosa, doc, monto..."
                value={statementSearchQuery}
                onChange={(e) => setStatementSearchQuery(e.target.value)}
                className="text-[11px] bg-slate-800 text-white placeholder-slate-400 px-2 py-0.5 rounded border border-slate-700 w-36"
              />
              <select
                value={filterStatement}
                onChange={(e) => setFilterStatement(e.target.value as any)}
                className="text-[10px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700"
              >
                <option value="Todos">Todos</option>
                <option value="Conciliados">Conciliados</option>
                <option value="Pendiente">Pendientes</option>
              </select>
            </div>
          </div>

          <div className="overflow-auto max-h-[520px]">
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
                      No hay movimientos de cartola para mostrar. Utiliza el botón "📥 Importar Cartola CSV" para cargar el extracto bancario.
                    </td>
                  </tr>
                ) : (
                  displayLines.map(l => (
                    <tr
                      key={l.id}
                      className={
                        l.matchedStatus === 'Conciliado'
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2 px-2 text-slate-600 text-[10px]">
                        <div>{l.date}</div>
                        {cartolaViewMode === 'CARTOLA_HISTORICA_UNIDA' && (l as any).period && (
                          <span className="text-[9px] text-indigo-600 font-sans font-bold">
                            {(l as any).period}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-sans truncate max-w-[120px] text-slate-900 font-medium" title={l.description}>
                        {l.description}
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
                                  setQuickVoucherLine(l);
                                  setQuickGloss(l.description);
                                  setQuickVoucherPeriod(selectedPeriod);
                                  const defaultExpense = accounts.find(
                                    a =>
                                      a.code.startsWith('4-2-01') ||
                                      a.name.toLowerCase().includes('comision') ||
                                      a.name.toLowerCase().includes('bancari')
                                  );
                                  if (defaultExpense) setQuickExpenseAccountId(defaultExpense.id);
                                }}
                                className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[10px]"
                                title="Crear asiento contable rápido"
                              >
                                + Asiento
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
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

          <div className="overflow-auto max-h-[520px]">
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

      {/* MODALS */}
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
        quickExpenseAccountId={quickExpenseAccountId}
        setQuickExpenseAccountId={setQuickExpenseAccountId}
        quickGloss={quickGloss}
        setQuickGloss={setQuickGloss}
        quickVoucherPeriod={quickVoucherPeriod}
        setQuickVoucherPeriod={setQuickVoucherPeriod}
        onPost={handleQuickPostVoucher}
      />
    </div>
  );
}
