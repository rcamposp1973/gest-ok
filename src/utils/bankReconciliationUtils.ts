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
 * Computes full mathematical reconciliation summary
 */
export function calculateReconciliationMath(
  statementLines: BankStatementLine[],
  allBankVouchers: {
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
  }[],
  bankInitialBalance: number,
  bankFinalBalance: number,
  bookFinalBalance: number,
  selectedPeriod: string
) {
  // 1. Unmatched statement charges
  const unmatchedCharges = statementLines
    .filter(l => l.matchedStatus === 'Pendiente' && l.charge > 0)
    .reduce((sum, l) => sum + l.charge, 0);

  // 2. Unmatched statement deposits
  const unmatchedDeposits = statementLines
    .filter(l => l.matchedStatus === 'Pendiente' && l.deposit > 0)
    .reduce((sum, l) => sum + l.deposit, 0);

  // 3. Matched in current statement
  const matchedInCurrentIds = new Set(
    statementLines.filter(l => l.matchedStatus === 'Conciliado' && l.matchedVoucherId).map(l => l.matchedVoucherId!)
  );

  // 4. Deposits in transit
  const depositsInTransit = allBankVouchers
    .filter(bv => bv.period <= selectedPeriod && bv.debit > 0 && !matchedInCurrentIds.has(bv.voucher.id) && !bv.isMatchedInOther)
    .reduce((sum, bv) => sum + bv.debit, 0);

  // 5. Outstanding checks
  const outstandingChecks = allBankVouchers
    .filter(bv => bv.period <= selectedPeriod && bv.credit > 0 && !matchedInCurrentIds.has(bv.voucher.id) && !bv.isMatchedInOther)
    .reduce((sum, bv) => sum + bv.credit, 0);

  // 6. Cross-Period Regularizations
  const futureMatchedCharges = statementLines
    .filter(l => l.matchedStatus === 'Conciliado' && l.charge > 0 && l.matchedVoucherPeriod && l.matchedVoucherPeriod > selectedPeriod)
    .reduce((sum, l) => sum + l.charge, 0);

  const futureMatchedDeposits = statementLines
    .filter(l => l.matchedStatus === 'Conciliado' && l.deposit > 0 && l.matchedVoucherPeriod && l.matchedVoucherPeriod > selectedPeriod)
    .reduce((sum, l) => sum + l.deposit, 0);

  // Calculated Reconciled statement balance
  const reconciledStatementBalance = bankFinalBalance + depositsInTransit - outstandingChecks;

  // Adjusted Book balance
  const adjustedBookBalance = bookFinalBalance + unmatchedDeposits - unmatchedCharges + futureMatchedDeposits - futureMatchedCharges;

  // Final difference
  const difference = Math.abs(reconciledStatementBalance - adjustedBookBalance);
  const isBalanced = difference === 0;

  const crossPeriodLines = statementLines.filter(
    l => l.matchedStatus === 'Conciliado' && l.matchedVoucherPeriod && l.matchedVoucherPeriod !== selectedPeriod
  );

  const totalChargesMonth = statementLines.reduce((s, l) => s + (l.charge || 0), 0);
  const totalDepositsMonth = statementLines.reduce((s, l) => s + (l.deposit || 0), 0);

  return {
    unmatchedCharges,
    unmatchedDeposits,
    depositsInTransit,
    outstandingChecks,
    futureMatchedCharges,
    futureMatchedDeposits,
    crossPeriodLines,
    reconciledStatementBalance,
    adjustedBookBalance,
    difference,
    isBalanced,
    totalChargesMonth,
    totalDepositsMonth
  };
}
