import { BankStatementLine, BankReconciliation, Voucher, ChartOfAccount } from '../types';

/**
 * Calculates previous period string (YYYY-MM)
 */
export function getPreviousPeriod(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return '';
  const [yearStr, monthStr] = periodStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return '';
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Calculates next period string (YYYY-MM)
 */
export function getNextPeriod(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return '';
  const [yearStr, monthStr] = periodStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return '';
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Recalculates running balance line by line starting from initial balance
 */
export function recalculateRunningBalances(lines: BankStatementLine[], initialBal: number) {
  const sorted = [...lines].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let currentBalance = initialBal;
  const updated = sorted.map(line => {
    const dep = line.deposit || 0;
    const chg = line.charge || 0;
    currentBalance += dep - chg;
    return {
      ...line,
      balance: currentBalance
    };
  });
  return { updatedLines: updated, finalBalance: currentBalance };
}

export interface DuplicateVoucherGroup {
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  count: number;
  voucherNumbers: number[];
  voucherIds: string[];
}

/**
 * Returns a map of key -> DuplicateVoucherGroup for all pending vouchers in accounting
 * where 2 or more vouchers have the exact same amount.
 */
export function getDuplicateVouchersMap(
  allBankVouchers: {
    voucher: Voucher;
    debit: number;
    credit: number;
    isMatchedInCurrent: boolean;
    isMatchedInOther: boolean;
  }[]
): Map<string, DuplicateVoucherGroup> {
  const map = new Map<string, DuplicateVoucherGroup>();

  const pendingVouchers = allBankVouchers.filter(bv => !bv.isMatchedInCurrent && !bv.isMatchedInOther);

  pendingVouchers.forEach(bv => {
    if (bv.debit > 0) {
      const key = `DEBIT_${bv.debit}`;
      if (!map.has(key)) {
        map.set(key, {
          amount: bv.debit,
          type: 'DEBIT',
          count: 0,
          voucherNumbers: [],
          voucherIds: []
        });
      }
      const entry = map.get(key)!;
      entry.count += 1;
      entry.voucherNumbers.push(bv.voucher.voucherNumber || 0);
      entry.voucherIds.push(bv.voucher.id);
    }

    if (bv.credit > 0) {
      const key = `CREDIT_${bv.credit}`;
      if (!map.has(key)) {
        map.set(key, {
          amount: bv.credit,
          type: 'CREDIT',
          count: 0,
          voucherNumbers: [],
          voucherIds: []
        });
      }
      const entry = map.get(key)!;
      entry.count += 1;
      entry.voucherNumbers.push(bv.voucher.voucherNumber || 0);
      entry.voucherIds.push(bv.voucher.id);
    }
  });

  return map;
}

/**
 * Sanitizes object for Firestore
 */
export function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (key, value) => (value === undefined ? null : value)));
}

/**
 * Computes full mathematical reconciliation summary considering cumulative historical pending items
 */
export function calculateReconciliationMath(
  allStatementLines: (BankStatementLine & { period?: string })[],
  allBankVouchers: {
    voucher: Voucher;
    line: any;
    debit: number;
    credit: number;
    date: string;
    period: string;
    gloss: string;
    isMatchedInCurrent?: boolean;
    isMatchedInOther?: boolean;
    matchedInOtherPeriod?: string;
  }[],
  bankInitialBalance: number,
  bankFinalBalance: number,
  bookFinalBalance: number,
  selectedPeriod: string
) {
  // Helper to determine cartola period of a statement line
  const getLineCartolaPeriod = (line: BankStatementLine & { period?: string }) => {
    if (line.date && line.date.length >= 7) return line.date.slice(0, 7);
    return line.period || selectedPeriod;
  };

  // Build map of voucherId -> voucher.period for quick lookup
  const voucherPeriodMap = new Map<string, string>();
  allBankVouchers.forEach(bv => {
    if (bv.voucher && bv.voucher.id) {
      voucherPeriodMap.set(bv.voucher.id, bv.period);
    }
  });

  // Filter statement lines that occurred on or before selectedPeriod (P_cartola <= selectedPeriod)
  const validStatementLines = (allStatementLines || []).filter(l => {
    const p = getLineCartolaPeriod(l);
    return p <= selectedPeriod;
  });

  // 1. Unmatched statement charges as of selectedPeriod:
  // Cartola charges on/before selectedPeriod that were NOT matched with a voucher on/before selectedPeriod
  const unmatchedCharges = validStatementLines
    .filter(l => {
      if ((l.charge || 0) <= 0) return false;
      if (l.matchedStatus === 'No_Corresponde') return false;
      if (l.matchedStatus !== 'Conciliado' || !l.matchedVoucherId) return true;
      const vPeriod = l.matchedVoucherPeriod || voucherPeriodMap.get(l.matchedVoucherId) || '';
      return vPeriod > selectedPeriod; // Matched with a future voucher -> still pending as of selectedPeriod
    })
    .reduce((sum, l) => sum + (l.charge || 0), 0);

  // 2. Unmatched statement deposits as of selectedPeriod:
  // Cartola deposits on/before selectedPeriod that were NOT matched with a voucher on/before selectedPeriod
  const unmatchedDeposits = validStatementLines
    .filter(l => {
      if ((l.deposit || 0) <= 0) return false;
      if (l.matchedStatus === 'No_Corresponde') return false;
      if (l.matchedStatus !== 'Conciliado' || !l.matchedVoucherId) return true;
      const vPeriod = l.matchedVoucherPeriod || voucherPeriodMap.get(l.matchedVoucherId) || '';
      return vPeriod > selectedPeriod; // Matched with a future voucher -> still pending as of selectedPeriod
    })
    .reduce((sum, l) => sum + (l.deposit || 0), 0);

  // Build map of voucherId -> cartola line period for all matched cartola lines
  const matchedCartolaPeriodMap = new Map<string, string>();
  (allStatementLines || []).forEach(l => {
    if (l.matchedStatus === 'Conciliado' && l.matchedVoucherId) {
      const cPeriod = getLineCartolaPeriod(l);
      matchedCartolaPeriodMap.set(l.matchedVoucherId, cPeriod);
    }
  });

  // Filter accounting vouchers on or before selectedPeriod (P_voucher <= selectedPeriod)
  const validVouchers = (allBankVouchers || []).filter(bv => bv.period <= selectedPeriod);

  // 4. Deposits in transit:
  // Accounting debits on/before selectedPeriod not matched with a cartola line on/before selectedPeriod
  const depositsInTransit = validVouchers
    .filter(bv => {
      if ((bv.debit || 0) <= 0) return false;
      const cPeriod = matchedCartolaPeriodMap.get(bv.voucher.id);
      if (!cPeriod) return true; // Unmatched -> in transit
      return cPeriod > selectedPeriod; // Matched with a future cartola line -> in transit as of selectedPeriod
    })
    .reduce((sum, bv) => sum + (bv.debit || 0), 0);

  // 5. Outstanding checks / expenses in transit:
  // Accounting credits on/before selectedPeriod not matched with a cartola line on/before selectedPeriod
  const outstandingChecks = validVouchers
    .filter(bv => {
      if ((bv.credit || 0) <= 0) return false;
      const cPeriod = matchedCartolaPeriodMap.get(bv.voucher.id);
      if (!cPeriod) return true; // Unmatched -> in transit
      return cPeriod > selectedPeriod; // Matched with a future cartola line -> in transit as of selectedPeriod
    })
    .reduce((sum, bv) => sum + (bv.credit || 0), 0);

  // Cross-period regularizations reference
  const crossPeriodLines = validStatementLines.filter(l => {
    if (l.matchedStatus !== 'Conciliado' || !l.matchedVoucherId) return false;
    const vPeriod = l.matchedVoucherPeriod || voucherPeriodMap.get(l.matchedVoucherId) || '';
    const cPeriod = getLineCartolaPeriod(l);
    return vPeriod !== cPeriod;
  });

  const futureMatchedCharges = validStatementLines
    .filter(l => {
      if ((l.charge || 0) <= 0 || l.matchedStatus !== 'Conciliado' || !l.matchedVoucherId) return false;
      const vPeriod = l.matchedVoucherPeriod || voucherPeriodMap.get(l.matchedVoucherId) || '';
      return vPeriod > selectedPeriod;
    })
    .reduce((sum, l) => sum + (l.charge || 0), 0);

  const futureMatchedDeposits = validStatementLines
    .filter(l => {
      if ((l.deposit || 0) <= 0 || l.matchedStatus !== 'Conciliado' || !l.matchedVoucherId) return false;
      const vPeriod = l.matchedVoucherPeriod || voucherPeriodMap.get(l.matchedVoucherId) || '';
      return vPeriod > selectedPeriod;
    })
    .reduce((sum, l) => sum + (l.deposit || 0), 0);

  // METHOD 1: ENFOQUE SALDO SEGÚN CARTOLA BANCO -> LLEGA A SALDO CONTABILIDAD
  // Formula: Saldo Cartola + Cargos no Contabilizados - Abonos no Contabilizados - Egresos en Tránsito + Depósitos en Tránsito
  const calculatedBookBalance =
    bankFinalBalance +
    unmatchedCharges -
    unmatchedDeposits -
    outstandingChecks +
    depositsInTransit;

  // METHOD 2: ENFOQUE SALDO SEGÚN LIBRO MAYOR -> LLEGA A SALDO CARTOLA BANCO
  // Formula: Saldo Contabilidad + Egresos en Tránsito - Depósitos en Tránsito - Cargos no Contabilizados + Abonos no Contabilizados
  const calculatedBankBalance =
    bookFinalBalance +
    outstandingChecks -
    depositsInTransit -
    unmatchedCharges +
    unmatchedDeposits;

  // Final difference to target balances
  const difference = Math.abs(calculatedBookBalance - bookFinalBalance);
  const isBalanced = Math.round(difference) === 0;

  // Month totals (for current selected period cartola lines)
  const currentMonthLines = (allStatementLines || []).filter(l => getLineCartolaPeriod(l) === selectedPeriod);
  const totalChargesMonth = currentMonthLines.reduce((s, l) => s + (l.charge || 0), 0);
  const totalDepositsMonth = currentMonthLines.reduce((s, l) => s + (l.deposit || 0), 0);

  return {
    unmatchedCharges,
    unmatchedDeposits,
    depositsInTransit,
    outstandingChecks,
    futureMatchedCharges,
    futureMatchedDeposits,
    crossPeriodLines,
    calculatedBookBalance,
    calculatedBankBalance,
    reconciledStatementBalance: calculatedBookBalance, // Backward compatibility
    adjustedBookBalance: calculatedBankBalance, // Backward compatibility
    difference,
    isBalanced,
    totalChargesMonth,
    totalDepositsMonth
  };
}
