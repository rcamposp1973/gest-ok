/**
 * Chilean Date Utilities
 * Ensures dates are ALWAYS displayed as DD-MM-AAAA or DD/MM/AAAA (never year first)
 * and provides robust parsers and converters between formats.
 */

/**
 * Formats any date value (YYYY-MM-DD, ISO string, timestamp object, or Date)
 * into Chilean display format: DD/MM/AAAA or DD-MM-AAAA.
 * The year will NEVER come first.
 */
export function formatDateCL(val: any, separator: '/' | '-' = '/'): string {
  if (!val) return '';

  // If it's a Firestore Timestamp or object with seconds/nanoseconds
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      val = val.toDate();
    } else if (typeof val.seconds === 'number') {
      val = new Date(val.seconds * 1000);
    }
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const day = String(val.getDate()).padStart(2, '0');
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const year = val.getFullYear();
    return `${day}${separator}${month}${separator}${year}`;
  }

  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';

  // Case 1: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss... (ISO date)
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${day}${separator}${month}${separator}${year}`;
  }

  // Case 2: DD-MM-YYYY or DD/MM/YYYY
  const clMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (clMatch) {
    const day = clMatch[1].padStart(2, '0');
    const month = clMatch[2].padStart(2, '0');
    const year = clMatch[3];
    return `${day}${separator}${month}${separator}${year}`;
  }

  // Case 3: Parse with Date() fallback
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${separator}${month}${separator}${year}`;
  }

  return trimmed;
}

/**
 * Format date specifically with hyphens: DD-MM-AAAA
 */
export function formatDateHyphen(val: any): string {
  return formatDateCL(val, '-');
}

/**
 * Format date specifically with slashes: DD/MM/AAAA
 */
export function formatDateSlash(val: any): string {
  return formatDateCL(val, '/');
}

/**
 * Converts any date representation (DD-MM-YYYY, DD/MM/YYYY, or ISO)
 * into ISO standard YYYY-MM-DD (needed for HTML5 <input type="date"> and chronological comparisons)
 */
export function toIsoDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // ISO with time
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const clMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (clMatch) {
    return `${clMatch[3]}-${clMatch[2].padStart(2, '0')}-${clMatch[1].padStart(2, '0')}`;
  }

  return str;
}

/**
 * Safely extracts year as integer from any date string
 */
export function parseDateYear(val: any): number {
  if (!val) return new Date().getFullYear();
  if (val instanceof Date && !isNaN(val.getTime())) return val.getFullYear();
  const str = String(val).trim();

  // YYYY at start
  const matchStart = str.match(/^(\d{4})/);
  if (matchStart) return parseInt(matchStart[1], 10);

  // YYYY at end (DD-MM-YYYY)
  const matchEnd = str.match(/(\d{4})$/);
  if (matchEnd) return parseInt(matchEnd[1], 10);

  return new Date().getFullYear();
}

/**
 * Safely extracts month (1-12) from any date string
 */
export function parseDateMonth(val: any): number {
  if (!val) return new Date().getMonth() + 1;
  if (val instanceof Date && !isNaN(val.getTime())) return val.getMonth() + 1;
  const str = String(val).trim();

  // YYYY-MM-DD
  const isoMatch = str.match(/^\d{4}[-/.](\d{1,2})/);
  if (isoMatch) return parseInt(isoMatch[1], 10);

  // DD-MM-YYYY
  const clMatch = str.match(/^\d{1,2}[-/.](\d{1,2})[-/.]\d{4}/);
  if (clMatch) return parseInt(clMatch[1], 10);

  return new Date().getMonth() + 1;
}

/**
 * Checks if a date matches a period code (e.g. "2026-03" or "2026-01")
 */
export function isDateInPeriod(dateVal: any, periodCode: string): boolean {
  if (!dateVal || !periodCode) return false;
  const iso = toIsoDate(dateVal);
  if (iso.startsWith(periodCode)) return true;

  // If periodCode is like "03-2026"
  const pParts = periodCode.split('-');
  if (pParts.length === 2) {
    if (pParts[0].length === 4) {
      // YYYY-MM
      return iso.startsWith(periodCode);
    } else {
      // MM-YYYY
      const expectedIso = `${pParts[1]}-${pParts[0].padStart(2, '0')}`;
      return iso.startsWith(expectedIso);
    }
  }
  return false;
}

/**
 * Compare two dates chronologically, supporting both DD-MM-YYYY and YYYY-MM-DD
 */
export function compareDates(a: any, b: any): number {
  const isoA = toIsoDate(a);
  const isoB = toIsoDate(b);
  return isoA.localeCompare(isoB);
}
