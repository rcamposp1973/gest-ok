/**
 * Chilean RUT Utilities & Matcher for Bank Statement Automatic Reconciliation
 * Extract RUTs from bank glosses (e.g. "0105559089", "TEF 076123456K", "0012345678-9"),
 * validate using Modulo 11, and perform matching against pending documents or auxiliaries.
 */

export interface ExtractedRutInfo {
  rutClean: string;       // e.g. "105559089"
  rutFormatted: string;   // e.g. "10.555.908-9"
  rutShort: string;       // e.g. "10555908-9"
  body: string;           // e.g. "10555908"
  dv: string;             // e.g. "9"
  isValidModulo11: boolean;
  originalMatch: string;  // e.g. "0105559089"
}

/**
 * Clean raw RUT string into alphanumeric uppercase
 */
export function cleanRutString(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Chilean Modulo 11 RUT Digit Check
 */
export function validateRutModulo11(body: string, dv: string): boolean {
  if (!body || !dv) return false;
  const numBody = body.replace(/^0+/, ''); // strip leading zeros
  if (numBody.length < 6 || numBody.length > 8) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = numBody.length - 1; i >= 0; i--) {
    sum += parseInt(numBody[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  let expectedDv = 'K';
  if (remainder === 11) expectedDv = '0';
  else if (remainder === 10) expectedDv = 'K';
  else expectedDv = remainder.toString();

  return dv.toUpperCase() === expectedDv;
}

/**
 * Format body and dv to Chilean standard format (10.555.908-9)
 */
export function formatChileanRut(body: string, dv: string): string {
  const numBody = body.replace(/^0+/, '');
  if (!numBody) return '';
  const formattedBody = numBody.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv.toUpperCase()}`;
}

/**
 * Extract potential RUTs from a bank statement gloss.
 * Handles glosses like:
 * - "TEF 0105559089 CLIENTE SP A"
 * - "TRANSF 076123456K PROVEEDOR CHILE"
 * - "0012345678-9 PAGO CUOTA 1"
 * - "010.555.908-9 ABONO DIRECTO"
 */
export function extractRutFromGloss(gloss: string): ExtractedRutInfo | null {
  if (!gloss || typeof gloss !== 'string') return null;

  // Pattern 1: Leading zeros or standard digit sequences (8-11 digits total with optional - or .)
  // E.g., 0105559089, 076123456K, 00123456789, 010.555.908-9, 10555908-9
  const tokens = gloss.match(/\b0*[0-9]{1,3}(?:\.?[0-9]{3}){2}[-]?[0-9kK]\b/gi) ||
                 gloss.match(/\b0*[0-9]{7,10}[-]?[0-9kK]\b/gi) || [];

  for (const token of tokens) {
    const clean = cleanRutString(token);
    if (clean.length >= 7 && clean.length <= 10) {
      const dv = clean.slice(-1);
      const body = clean.slice(0, -1).replace(/^0+/, '');
      
      if (body.length >= 6 && body.length <= 8) {
        const isValid = validateRutModulo11(body, dv);
        // Even if modulo11 fails on some rare legacy/special RUTs, if it looks like a valid 8-9 digit string with leading zero, we consider it candidate
        if (isValid || (body.length >= 7 && body.length <= 8)) {
          const formatted = formatChileanRut(body, dv);
          return {
            rutClean: `${body}${dv.toUpperCase()}`,
            rutFormatted: formatted,
            rutShort: `${body}-${dv.toUpperCase()}`,
            body,
            dv: dv.toUpperCase(),
            isValidModulo11: isValid,
            originalMatch: token
          };
        }
      }
    }
  }

  // Fallback regex search for explicit 00 / 01 patterns in glosses
  const fallbackMatch = gloss.match(/\b0+([0-9]{6,8})[-]?([0-9kK])\b/i);
  if (fallbackMatch) {
    const body = fallbackMatch[1].replace(/^0+/, '');
    const dv = fallbackMatch[2].toUpperCase();
    if (body.length >= 6 && body.length <= 8) {
      const isValid = validateRutModulo11(body, dv);
      return {
        rutClean: `${body}${dv}`,
        rutFormatted: formatChileanRut(body, dv),
        rutShort: `${body}-${dv}`,
        body,
        dv,
        isValidModulo11: isValid,
        originalMatch: fallbackMatch[0]
      };
    }
  }

  return null;
}

/**
 * Helper to match two RUT strings for equality regardless of formatting
 */
export function areRutsEqual(rutA?: string, rutB?: string): boolean {
  if (!rutA || !rutB) return false;
  const cleanA = cleanRutString(rutA).replace(/^0+/, '');
  const cleanB = cleanRutString(rutB).replace(/^0+/, '');
  return cleanA === cleanB && cleanA.length > 0;
}
