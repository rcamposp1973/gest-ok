import { FiscalPeriodYear } from '../types';

export function checkIsPeriodClosed(
  dateOrPeriod: string,
  fiscalYears: FiscalPeriodYear[] = []
): { isClosed: boolean; periodStr: string; errorMsg: string } {
  if (!dateOrPeriod) {
    return { isClosed: false, periodStr: '', errorMsg: '' };
  }
  const clean = dateOrPeriod.trim().substring(0, 7); // e.g. "2026-08"
  const parts = clean.split('-');
  if (parts.length < 2) {
    return { isClosed: false, periodStr: clean, errorMsg: '' };
  }
  const yearStr = parts[0];
  const monthNum = parseInt(parts[1], 10);
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return { isClosed: false, periodStr: clean, errorMsg: '' };
  }

  const fy = fiscalYears.find(f => f.id === yearStr);
  const monthStatus = fy?.months?.[monthNum];

  const isClosed = monthStatus === 'Cerrado';
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthName = monthNames[monthNum] || `Mes ${monthNum}`;

  return {
    isClosed,
    periodStr: clean,
    errorMsg: `🔒 Período Contable Bloqueado: El período ${monthName} ${yearStr} (${clean}) se encuentra CERRADO. No está permitido modificar, anular o eliminar registros en un período cerrado.`
  };
}

/**
 * Returns the latest open accounting/fiscal period (e.g. "2026-01").
 * Iterates descending through fiscal years and months to find the most recent open period in the system.
 * Never jumps to the current living calendar month.
 */
export function getLatestOpenPeriod(
  fiscalYears: FiscalPeriodYear[] = [],
  fallbackPeriods?: string[]
): string {
  // 1. First priority: Find the highest year and highest month explicitly marked as 'Abierto'
  if (fiscalYears && fiscalYears.length > 0) {
    const sortedYears = [...fiscalYears].sort((a, b) => {
      const yA = Number(a.id || a.year) || 0;
      const yB = Number(b.id || b.year) || 0;
      return yB - yA;
    });

    for (const fy of sortedYears) {
      const y = Number(fy.id || fy.year);
      if (!y || !fy.months) continue;

      // Find the highest month in this year that is marked 'Abierto'
      const openMonths = Object.entries(fy.months)
        .filter(([m, status]) => status === 'Abierto' && parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12)
        .map(([m]) => parseInt(m, 10))
        .sort((a, b) => b - a);

      if (openMonths.length > 0) {
        return `${y}-${String(openMonths[0]).padStart(2, '0')}`;
      }
    }
  }

  // 2. Second priority: If no month is explicitly 'Abierto' or fiscalYears is empty, check fallback periods
  if (fallbackPeriods && fallbackPeriods.length > 0) {
    const valid = fallbackPeriods
      .filter(p => p && /^\d{4}-\d{2}$/.test(p))
      .sort()
      .reverse();
    if (valid.length > 0) {
      return valid[0];
    }
  }

  // 3. Third priority: Check localStorage for last active period
  try {
    const saved = localStorage.getItem('gest_ok_last_open_period');
    if (saved && /^\d{4}-\d{2}$/.test(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage exceptions
  }

  // 4. Fallback default: Most recent completed month or 2026-01
  const now = new Date();
  const prevMonth = now.getMonth(); // 0-indexed (0 = Jan)
  if (prevMonth === 0) {
    return `${now.getFullYear() - 1}-12`;
  }
  return `${now.getFullYear()}-${String(prevMonth).padStart(2, '0')}`;
}

