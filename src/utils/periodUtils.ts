import { FiscalPeriodYear } from '../types';

export const MIN_SYSTEM_YEAR = 2025;
export const MAX_SYSTEM_YEAR = 2027;
export const SYSTEM_AVAILABLE_YEARS = [2027, 2026, 2025];

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Verifica si un período contable (ej: "2026-01" o fecha "2026-01-15") se encuentra cerrado.
 * Por regla del sistema:
 * - Cualquier período anterior a 2025 no existe y se considera cerrado/bloqueado.
 * - Todos los períodos de una empresa nacen CERRADOS por defecto.
 * - Solo un período cuyo estado sea explícitamente 'Abierto' se considera abierto.
 */
export function checkIsPeriodClosed(
  dateOrPeriod: string,
  fiscalYears: FiscalPeriodYear[] = []
): { isClosed: boolean; periodStr: string; errorMsg: string } {
  if (!dateOrPeriod) {
    return { isClosed: true, periodStr: '', errorMsg: 'Período no especificado.' };
  }
  const clean = dateOrPeriod.trim().substring(0, 7); // e.g. "2026-01"
  const parts = clean.split('-');
  if (parts.length < 2) {
    return { isClosed: true, periodStr: clean, errorMsg: 'Formato de período inválido.' };
  }
  const yearNum = parseInt(parts[0], 10);
  const monthNum = parseInt(parts[1], 10);
  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return { isClosed: true, periodStr: clean, errorMsg: 'Mes o año contable inválido.' };
  }

  // El sistema solo existe desde 2025 en adelante
  if (yearNum < MIN_SYSTEM_YEAR) {
    return {
      isClosed: true,
      periodStr: clean,
      errorMsg: `🔒 Período No Permitido: El sistema contable opera únicamente desde el año comercial ${MIN_SYSTEM_YEAR} en adelante.`
    };
  }

  const fy = fiscalYears.find(f => Number(f.id || f.year) === yearNum);
  // Si no existe registro fiscal o el mes no está explícitamente en 'Abierto', ESTÁ CERRADO por defecto
  const status = fy?.months?.[monthNum];
  const isClosed = status !== 'Abierto';

  const monthName = MONTH_NAMES[monthNum] || `Mes ${monthNum}`;

  return {
    isClosed,
    periodStr: clean,
    errorMsg: isClosed
      ? `🔒 Período Contable Cerrado: El período ${monthName} ${yearNum} (${clean}) se encuentra CERRADO. Para registrar comprobantes, importar o realizar procesos en este mes, debe abrirlo previamente en 'Configuraciones > Períodos Contables'.`
      : ''
  };
}

/**
 * Retorna todos los períodos abiertos del sistema para la empresa (>= 2025)
 */
export function getAllOpenPeriods(fiscalYears: FiscalPeriodYear[] = []): { period: string; label: string; year: number; monthNum: number }[] {
  const openList: { period: string; label: string; year: number; monthNum: number }[] = [];

  for (const fy of fiscalYears) {
    const y = Number(fy.id || fy.year);
    if (!y || y < MIN_SYSTEM_YEAR || !fy.months) continue;

    for (let m = 1; m <= 12; m++) {
      if (fy.months[m] === 'Abierto') {
        const pStr = `${y}-${String(m).padStart(2, '0')}`;
        const mName = MONTH_NAMES[m] || `Mes ${m}`;
        openList.push({
          period: pStr,
          label: `${mName} ${y} (Abierto)`,
          year: y,
          monthNum: m
        });
      }
    }
  }

  // Ordenar de más reciente a más antiguo
  return openList.sort((a, b) => b.period.localeCompare(a.period));
}

/**
 * Regla de contabilización desde la cartola bancaria:
 * "cuando se contabiliza desde la cartola bancaria, por ejemplo para cancelar un pago de factura de proveedores,
 * o cuando se ingresa el pago de un cliente, si o si, el registro debe hacerse con fecha y periodo de la cartola,
 * salvo que el mes se encuentre 'cerrado', de ser asi, el registro debe hacerse el día 1 del siguiente mes abierto."
 */
export function getNextOpenPeriodAndDate(
  cartolaDate: string,
  fiscalYears: FiscalPeriodYear[] = []
): {
  period: string;
  date: string;
  wasShifted: boolean;
  originalPeriod: string;
  originalDate: string;
  explanation?: string;
} {
  if (!cartolaDate) {
    const curP = '2026-01';
    return {
      period: curP,
      date: `${curP}-01`,
      wasShifted: false,
      originalPeriod: curP,
      originalDate: `${curP}-01`
    };
  }

  const cleanDate = cartolaDate.trim().substring(0, 10);
  const originalPeriod = cleanDate.substring(0, 7);

  const check = checkIsPeriodClosed(originalPeriod, fiscalYears);

  // Si el mes de la cartola está ABIERTO, se respeta estrictamente fecha y período de la cartola
  if (!check.isClosed) {
    return {
      period: originalPeriod,
      date: cleanDate,
      wasShifted: false,
      originalPeriod,
      originalDate: cleanDate
    };
  }

  // Si el mes está CERRADO: Se busca el primer mes abierto cronológicamente posterior
  const [yStr, mStr] = originalPeriod.split('-');
  let curYear = parseInt(yStr, 10);
  let curMonth = parseInt(mStr, 10);

  let targetPeriod = '';
  // Avanzar mes a mes hasta encontrar el primer mes abierto
  for (let step = 0; step < 60; step++) {
    curMonth++;
    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
    const candidatePeriod = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    const candidateCheck = checkIsPeriodClosed(candidatePeriod, fiscalYears);
    if (!candidateCheck.isClosed) {
      targetPeriod = candidatePeriod;
      break;
    }
  }

  if (!targetPeriod) {
    targetPeriod = `${curYear}-${String(curMonth).padStart(2, '0')}`;
  }

  const targetDate = `${targetPeriod}-01`;
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const origMNum = parseInt(mStr, 10);
  const origMonthName = monthNames[origMNum] || originalPeriod;

  return {
    period: targetPeriod,
    date: targetDate,
    wasShifted: true,
    originalPeriod,
    originalDate: cleanDate,
    explanation: `El mes de la cartola (${origMonthName} ${yStr}) se encuentra cerrado. Por normativa contable, el registro se realiza automáticamente el día 1 del siguiente mes abierto (${targetDate}, período ${targetPeriod}).`
  };
}

/**
 * Devuelve el período de trabajo activo más conveniente.
 * Prioriza el año operativo (por defecto 2025), buscando el mes abierto activo.
 */
export function getLatestOpenPeriod(
  fiscalYears: FiscalPeriodYear[] = [],
  preferredYear: number = 2026
): string {
  const targetPrefYear = Math.max(MIN_SYSTEM_YEAR, preferredYear);
  // 1. Buscar en el año preferido (ej. 2026 o 2025)
  const prefFy = fiscalYears.find(f => Number(f.id || f.year) === targetPrefYear);
  if (prefFy && prefFy.months) {
    for (let m = 1; m <= 12; m++) {
      if (prefFy.months[m] === 'Abierto') {
        return `${targetPrefYear}-${String(m).padStart(2, '0')}`;
      }
    }
  }

  // 2. Si no hay meses abiertos en targetPrefYear, buscar en otros años disponibles (>= 2025)
  for (const fy of fiscalYears) {
    const y = Number(fy.id || fy.year);
    if (!y || y < MIN_SYSTEM_YEAR || !fy.months) continue;
    for (let m = 1; m <= 12; m++) {
      if (fy.months[m] === 'Abierto') {
        return `${y}-${String(m).padStart(2, '0')}`;
      }
    }
  }

  return `${targetPrefYear}-01`;
}

/**
 * Devuelve el período inmediatamente siguiente (ej: "2025-01" -> "2025-02", "2025-12" -> "2026-01")
 */
export function getNextPeriodStr(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return '2025-01';
  const [y, m] = periodStr.split('-').map(Number);
  if (!y || !m) return periodStr;
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Devuelve el período inmediatamente anterior (ej: "2025-02" -> "2025-01")
 */
export function getPrevPeriodStr(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return '2025-01';
  const [y, m] = periodStr.split('-').map(Number);
  if (!y || !m || (y === MIN_SYSTEM_YEAR && m === 1)) return `${MIN_SYSTEM_YEAR}-01`;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Devuelve el nombre formateado en español para un período (ej: "2025-01" -> "Enero de 2025")
 */
export function getPeriodFormattedName(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return periodStr;
  const [y, m] = periodStr.split('-').map(Number);
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mName = monthNames[m] || `Mes ${m}`;
  return `${mName} de ${y}`;
}



