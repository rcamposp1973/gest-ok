import { ChartOfAccount, VoucherLine } from '../types';

/**
 * Sanitiza una línea de comprobante para conservar únicamente los análisis y atributos que
 * la cuenta contable de esa línea EXIGE o PERMITE según la configuración del Plan de Cuentas.
 * Si una cuenta (ej: IVA Crédito Fiscal o Facturas por Pagar) no exige Centro de Costos, Ítem de Gasto,
 * Proyecto, etc., elimina dichos atributos de la línea para evitar imputaciones erróneas.
 */
export function sanitizeVoucherLine<T extends VoucherLine>(
  line: T,
  account?: ChartOfAccount | undefined
): T {
  if (!account) return line;

  const code = account.code || '';
  const isClientOrSupplierCode =
    code.startsWith('1.1.02') ||
    code.startsWith('2.1.01') ||
    code.startsWith('2.1.04');

  const reqRut = Boolean(account.requiereAuxiliarRUT || isClientOrSupplierCode);
  const reqDoc = Boolean(account.requiereDocumento || isClientOrSupplierCode);
  const reqCC = Boolean(account.requiereCentroCosto);
  const reqItem = Boolean(account.requiereItemGasto);
  const reqProj = Boolean(account.requiereProyecto);
  const reqProd = Boolean(account.requiereProducto);
  const reqBank = Boolean(account.requiereConciliacionBancaria);
  const reqDue = Boolean(account.requiereVencimiento);

  const clean = { ...line };

  if (!reqRut) {
    delete clean.auxiliaryRut;
    delete clean.auxiliaryName;
  }
  if (!reqDoc) {
    delete clean.documentRef;
  }
  if (!reqCC) {
    delete clean.costCenter;
  }
  if (!reqItem) {
    delete clean.expenseItem;
  }
  if (!reqProj) {
    delete clean.project;
  }
  if (!reqProd) {
    delete clean.product;
  }
  if (!reqBank) {
    delete clean.bankDocRef;
  }
  if (!reqDue) {
    delete clean.dueDate;
  }

  if (clean.customAnalyses) {
    const sanitizedCustom: { [key: string]: string } = {};
    let hasKeys = false;
    Object.entries(clean.customAnalyses).forEach(([key, val]) => {
      if (val && isCustomAnalysisRequired(account, key)) {
        sanitizedCustom[key] = val;
        hasKeys = true;
      }
    });
    if (hasKeys) {
      clean.customAnalyses = sanitizedCustom;
    } else {
      delete clean.customAnalyses;
    }
  }

  return clean;
}

export function sanitizeVoucherLines<T extends VoucherLine>(
  lines: T[],
  accounts: ChartOfAccount[]
): T[] {
  const accountMap = new Map<string, ChartOfAccount>();
  accounts.forEach(acc => {
    if (acc.id) accountMap.set(acc.id, acc);
    if (acc.code) accountMap.set(acc.code, acc);
  });

  return lines.map(line => {
    const acc = accountMap.get(line.accountId) || accountMap.get(line.accountCode);
    return sanitizeVoucherLine(line, acc);
  });
}

export interface LineValidationResult {
  isValid: boolean;
  errors: string[];
  missingFields: {
    field: string;
    label: string;
  }[];
}

/**
 * Valida si una línea de comprobante cumple con todas las exigencias de análisis
 * configuradas en el Plan de Cuentas (atributos estándar + atributos dinámicos).
 */
export function validateVoucherLine(
  line: VoucherLine,
  account: ChartOfAccount | undefined,
  companyCustomColumns: string[] = []
): LineValidationResult {
  const errors: string[] = [];
  const missingFields: { field: string; label: string }[] = [];

  if (!account) {
    if (line.accountCode && line.accountCode !== 'SIN_CUENTA') {
      errors.push(`Cuenta [${line.accountCode}] no existe en el Plan de Cuentas.`);
    } else {
      errors.push('No se ha seleccionado una cuenta contable válida.');
    }
    return { isValid: false, errors, missingFields };
  }

  // Validación de Imputabilidad
  if (account.isImputable === false) {
    errors.push(`La cuenta [${account.code}] ${account.name} está marcada como NO IMPUTABLE (cuenta de agrupación/título).`);
  }

  // 1. Auxiliar / RUT
  if (account.requiereAuxiliarRUT) {
    const val = (line.auxiliaryRut || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige RUT / Auxiliar obligatorio.`);
      missingFields.push({ field: 'auxiliaryRut', label: 'RUT / Auxiliar' });
    }
  }

  // 2. Documento de Referencia
  if (account.requiereDocumento) {
    const val = (line.documentRef || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige N° Documento de Referencia obligatorio.`);
      missingFields.push({ field: 'documentRef', label: 'N° Documento Ref' });
    }
  }

  // 3. Centro de Costo
  if (account.requiereCentroCosto) {
    const val = (line.costCenter || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige Centro de Costos obligatorio.`);
      missingFields.push({ field: 'costCenter', label: 'Centro de Costos' });
    }
  }

  // 4. Conciliación Bancaria / Ref Cartola o Cheque
  if (account.requiereConciliacionBancaria) {
    const val = (line.bankDocRef || line.documentRef || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige Referencia Bancaria / N° Cheque / Conciliación.`);
      missingFields.push({ field: 'bankDocRef', label: 'Ref Bancaria / Cheque' });
    }
  }

  // 5. Fecha de Vencimiento
  if (account.requiereVencimiento) {
    const val = (line.dueDate || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige Fecha de Vencimiento obligatoria.`);
      missingFields.push({ field: 'dueDate', label: 'Fecha Vencimiento' });
    }
  }

  // 6. Ítem de Gasto
  if (account.requiereItemGasto) {
    const val = (line.expenseItem || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige Ítem de Gasto obligatorio.`);
      missingFields.push({ field: 'expenseItem', label: 'Ítem de Gasto' });
    }
  }

  // 7. Proyecto
  if (account.requiereProyecto) {
    const val = (line.project || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige Proyecto obligatorio.`);
      missingFields.push({ field: 'project', label: 'Proyecto' });
    }
  }

  // 8. Producto
  if (account.requiereProducto) {
    const val = (line.product || '').trim();
    if (!val) {
      errors.push(`Cuenta [${account.code}] exige Código o Detalle de Producto.`);
      missingFields.push({ field: 'product', label: 'Producto' });
    }
  }

  // 9. Análisis Dinámicos / Columnas Adicionales de la Empresa
  const checkedCustomCols = new Set<string>();

  // Revisar columnas registradas en la empresa
  companyCustomColumns.forEach((colName) => {
    const isRequired = isCustomAnalysisRequired(account, colName);
    if (isRequired) {
      checkedCustomCols.add(colName);
      const val = (line.customAnalyses?.[colName] || '').trim();
      if (!val) {
        errors.push(`Cuenta [${account.code}] exige análisis obligatorio "${colName}".`);
        missingFields.push({ field: `custom_${colName}`, label: colName });
      }
    }
  });

  // Revisar cualquier otro customAttribute definido en la cuenta
  if (account.customAttributes) {
    Object.keys(account.customAttributes).forEach((colName) => {
      if (!checkedCustomCols.has(colName)) {
        const isRequired = isCustomAnalysisRequired(account, colName);
        if (isRequired) {
          const val = (line.customAnalyses?.[colName] || '').trim();
          if (!val) {
            errors.push(`Cuenta [${account.code}] exige análisis obligatorio "${colName}".`);
            missingFields.push({ field: `custom_${colName}`, label: colName });
          }
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingFields
  };
}

export const STANDARD_CHILEAN_DTE_TYPES: { [code: string]: string } = {
  '33': 'Factura Electrónica',
  '34': 'Factura Exenta Electrónica',
  '39': 'Boleta Electrónica',
  '41': 'Boleta Exenta Electrónica',
  '43': 'Liquidación Factura',
  '46': 'Factura de Compra Electrónica',
  '52': 'Guía de Despacho Electrónica',
  '56': 'Nota de Débito Electrónica',
  '61': 'Nota de Crédito Electrónica',
  '110': 'Factura de Exportación',
  '111': 'Nota de Débito de Exportación',
  '112': 'Nota de Crédito de Exportación',
  '70': 'Boleta de Honorarios Electrónica',
  '71': 'Boleta de Honorarios Terceros',
  'BHE': 'Boleta de Honorarios Electrónica',
  'BH3': 'Boleta de Honorarios Terceros'
};

/**
 * Valida si un tipo de documento ingresado coincide con las tablas maestras (DTE oficial o Catálogo No-SII).
 */
export function validateDocumentType(
  rawDocType: string,
  customDocTypes: { code: string; name?: string }[] = []
): { isValid: boolean; normalizedCode: string; label: string } {
  if (!rawDocType) return { isValid: true, normalizedCode: '', label: '' };
  const clean = rawDocType.trim().toUpperCase();

  if (STANDARD_CHILEAN_DTE_TYPES[clean]) {
    return { isValid: true, normalizedCode: clean, label: STANDARD_CHILEAN_DTE_TYPES[clean] };
  }

  const numericOnly = clean.replace(/\D/g, '');
  if (numericOnly && STANDARD_CHILEAN_DTE_TYPES[numericOnly]) {
    return { isValid: true, normalizedCode: numericOnly, label: STANDARD_CHILEAN_DTE_TYPES[numericOnly] };
  }

  const custom = customDocTypes.find(d => (d.code || '').trim().toUpperCase() === clean);
  if (custom) {
    return { isValid: true, normalizedCode: custom.code.toUpperCase(), label: custom.name || custom.code };
  }

  return { isValid: false, normalizedCode: clean, label: `Tipo de Documento "${clean}" no registrado en Tabla Maestra` };
}

/**
 * Determina si un análisis custom específico está exigido para una cuenta.
 */
export function isCustomAnalysisRequired(account: ChartOfAccount, colName: string): boolean {
  if (!account.customAttributes) return false;
  const val = account.customAttributes[colName];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    return normalized === 'si' || normalized === 'sí' || normalized === 'true' || normalized === '1' || normalized === 'x';
  }
  return Boolean(val);
}
