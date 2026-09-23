/**
 * Utility functions for sorting accounting records, account codes, RUTs, and folios
 */

/**
 * Compare two Chilean RUT strings numerically
 * e.g., "7.654.321-K" vs "12.345.678-9" -> 7654321 < 12345678
 */
export function compareRuts(rutA?: string, rutB?: string): number {
  if (!rutA && !rutB) return 0;
  if (!rutA) return 1;
  if (!rutB) return -1;

  const numA = parseInt(rutA.replace(/[^0-9]/g, ''), 10) || 0;
  const numB = parseInt(rutB.replace(/[^0-9]/g, ''), 10) || 0;

  if (numA !== numB) {
    return numA - numB;
  }
  return rutA.localeCompare(rutB, undefined, { numeric: true });
}

/**
 * Compare two account codes numerically/naturally
 * e.g., "1.1.01.001" vs "1.1.01.002" or "1101001" vs "2101001"
 */
export function compareAccountCodes(codeA?: string, codeB?: string): number {
  if (!codeA && !codeB) return 0;
  if (!codeA) return 1;
  if (!codeB) return -1;

  // Split by dots or hyphens
  const partsA = codeA.split(/[\.-]/).map(p => parseInt(p, 10) || 0);
  const partsB = codeB.split(/[\.-]/).map(p => parseInt(p, 10) || 0);

  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const valA = partsA[i] ?? -1;
    const valB = partsB[i] ?? -1;
    if (valA !== valB) {
      return valA - valB;
    }
  }

  return codeA.localeCompare(codeB, undefined, { numeric: true });
}

/**
 * Sort list of ChartOfAccounts numerically by code
 */
export function sortAccountsNumerically<T extends { code: string }>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => compareAccountCodes(a.code, b.code));
}

/**
 * Sort list of Auxiliaries numerically by RUT
 */
export function sortAuxiliariesByRut<T extends { rut: string }>(auxiliaries: T[]): T[] {
  return [...auxiliaries].sort((a, b) => compareRuts(a.rut, b.rut));
}

/**
 * Filter auxiliaries for a specific account:
 * Returns auxiliaries that are associated with the given account ID or code.
 * If none are explicitly linked, returns all auxiliaries sorted by RUT.
 */
export function filterAuxiliariesForAccount<T extends {
  id?: string;
  rut: string;
  defaultDebtorAccountId?: string;
  defaultCreditorAccountId?: string;
  defaultExpenseOrIncomeAccountId?: string;
  defaultDebtorAccountIds?: string[];
  defaultCreditorAccountIds?: string[];
}>(
  auxiliaries: T[],
  accountId?: string,
  accountCode?: string
): { filtered: T[]; isFilteredByAccount: boolean; allSorted: T[] } {
  const sorted = sortAuxiliariesByRut(auxiliaries);
  if (!accountId && !accountCode) {
    return { filtered: sorted, isFilteredByAccount: false, allSorted: sorted };
  }

  const matches = sorted.filter(aux => {
    if (accountId) {
      if (
        aux.defaultDebtorAccountId === accountId ||
        aux.defaultCreditorAccountId === accountId ||
        aux.defaultExpenseOrIncomeAccountId === accountId ||
        aux.defaultDebtorAccountIds?.includes(accountId) ||
        aux.defaultCreditorAccountIds?.includes(accountId)
      ) {
        return true;
      }
    }
    return false;
  });

  if (matches.length > 0) {
    return { filtered: matches, isFilteredByAccount: true, allSorted: sorted };
  }

  // Fallback if no specific auxiliary is linked yet
  return { filtered: sorted, isFilteredByAccount: false, allSorted: sorted };
}
