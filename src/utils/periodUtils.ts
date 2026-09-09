import { FiscalPeriodYear } from '../types';

/**
 * Verifica si un período contable (ej: "2026-01" o fecha "2026-01-15") se encuentra cerrado.
 * Un período está cerrado si en el año fiscal correspondiente su estado es explícitamente 'Cerrado'.
 */
export function checkIsPeriodClosed(
  dateOrPeriod: string,
  fiscalYears: FiscalPeriodYear[] = []
): { isClosed: boolean; periodStr: string; errorMsg: string } {
  if (!dateOrPeriod) {
    return { isClosed: false, periodStr: '', errorMsg: '' };
  }
  const clean = dateOrPeriod.trim().substring(0, 7); // e.g. "2026-01"
  const parts = clean.split('-');
  if (parts.length < 2) {
    return { isClosed: false, periodStr: clean, errorMsg: '' };
  }
  const yearStr = parts[0];
  const monthNum = parseInt(parts[1], 10);
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return { isClosed: false, periodStr: clean, errorMsg: '' };
  }

  const fy = fiscalYears.find(f => String(f.id || f.year) === yearStr);
  if (!fy || !fy.months) {
    // Si no existe registro fiscal aún, por defecto está abierto para el año operativo
    return { isClosed: false, periodStr: clean, errorMsg: '' };
  }

  const status = fy.months[monthNum];
  const isClosed = status === 'Cerrado';

  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthName = monthNames[monthNum] || `Mes ${monthNum}`;

  return {
    isClosed,
    periodStr: clean,
    errorMsg: isClosed
      ? `🔒 Período Contable Bloqueado: El período ${monthName} ${yearStr} (${clean}) se encuentra CERRADO. No está permitido ingresar comprobantes, importar cartolas ni realizar modificaciones o procesos en períodos cerrados.`
      : ''
  };
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
 * Prioriza el año operativo (por defecto 2024), buscando el mes abierto activo.
 */
export function getLatestOpenPeriod(
  fiscalYears: FiscalPeriodYear[] = [],
  preferredYear: number = 2024
): string {
  // 1. Buscar en el año preferido (ej. 2024)
  const prefFy = fiscalYears.find(f => Number(f.id || f.year) === preferredYear);
  if (prefFy && prefFy.months) {
    // Buscar los meses abiertos en orden ascendente (el primer mes abierto o el más activo)
    for (let m = 1; m <= 12; m++) {
      if (prefFy.months[m] === 'Abierto') {
        return `${preferredYear}-${String(m).padStart(2, '0')}`;
      }
    }
  }

  // 2. Si no hay meses abiertos en preferredYear, buscar en otros años disponibles
  for (const fy of fiscalYears) {
    const y = Number(fy.id || fy.year);
    if (!y || !fy.months) continue;
    for (let m = 1; m <= 12; m++) {
      if (fy.months[m] === 'Abierto') {
        return `${y}-${String(m).padStart(2, '0')}`;
      }
    }
  }

  return `${preferredYear}-09`;
}

/**
 * Devuelve el período inmediatamente siguiente (ej: "2024-09" -> "2024-10", "2024-12" -> "2025-01")
 */
export function getNextPeriodStr(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return '2024-09';
  const [y, m] = periodStr.split('-').map(Number);
  if (!y || !m) return periodStr;
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Devuelve el período inmediatamente anterior (ej: "2024-09" -> "2024-08", "2025-01" -> "2024-12")
 */
export function getPrevPeriodStr(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return '2024-08';
  const [y, m] = periodStr.split('-').map(Number);
  if (!y || !m) return periodStr;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Devuelve el nombre formateado en español para un período (ej: "2024-09" -> "Septiembre de 2024")
 */
export function getPeriodFormattedName(periodStr: string): string {
  if (!periodStr || !periodStr.includes('-')) return periodStr;
  const [y, m] = periodStr.split('-').map(Number);
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mName = monthNames[m] || `Mes ${m}`;
  return `${mName} de ${y}`;
}



