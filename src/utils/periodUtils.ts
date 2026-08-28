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
 * Returns the latest open accounting/fiscal period (e.g. "2026-08").
 * Iterates descending through fiscal years and months to find the most recent open period.
 * Fallback to current year-month.
 */
export function getLatestOpenPeriod(fiscalYears: FiscalPeriodYear[] = []): string {
  const today = new Date();
  const currentIso = today.toISOString().slice(0, 7); // "2026-08"
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  if (!fiscalYears || fiscalYears.length === 0) {
    return currentIso;
  }

  // Sort fiscal years descending
  const sortedYears = [...fiscalYears].sort((a, b) => {
    const yA = Number(a.id || a.year) || 0;
    const yB = Number(b.id || b.year) || 0;
    return yB - yA;
  });

  for (const fy of sortedYears) {
    const y = Number(fy.id || fy.year) || currentYear;
    // Check months from 12 down to 1
    // If checking current year, start from currentMonth or 12
    const startM = y === currentYear ? Math.min(12, Math.max(1, currentMonth)) : 12;
    for (let m = startM; m >= 1; m--) {
      const status = fy.months?.[m];
      if (status !== 'Cerrado') {
        return `${y}-${String(m).padStart(2, '0')}`;
      }
    }
    // Also check if any month above currentMonth in that year is open
    for (let m = 12; m > startM; m--) {
      const status = fy.months?.[m];
      if (status !== 'Cerrado') {
        return `${y}-${String(m).padStart(2, '0')}`;
      }
    }
  }

  return currentIso;
}

