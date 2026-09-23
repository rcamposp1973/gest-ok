import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  addDoc, 
  updateDoc,
  getDoc,
  query, 
  where 
} from 'firebase/firestore';
import { 
  Company, 
  ChartOfAccount, 
  Voucher, 
  VoucherLine, 
  BankStatementLine, 
  BankReconciliation, 
  FiscalPeriodYear, 
  Auxiliary,
  RCVDocument,
  JuniorGlossRule 
} from '../types';
import { getNextOpenPeriodAndDate } from './periodUtils';

// Helper to sanitize undefined values before saving to Firestore
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        clean[key] = sanitizeForFirestore(obj[key]);
      }
    }
    return clean;
  }
  return obj;
};

export function areRutsEqual(r1?: string, r2?: string): boolean {
  if (!r1 || !r2) return false;
  const c1 = r1.replace(/[^0-9kK]/g, '').toLowerCase();
  const c2 = r2.replace(/[^0-9kK]/g, '').toLowerCase();
  return c1 === c2 && c1.length >= 7;
}

export interface ParsedJuniorGlossIntent {
  isGlossTask: boolean;
  pattern: string;
  targetAccount: ChartOfAccount | null;
  targetAccountInputText?: string;
  movementType: 'ALL' | 'CARGO' | 'ABONO';
  targetAuxiliary?: Auxiliary | null;
  targetRut?: string;
  targetEntityName?: string;
  requireExactInvoiceMatch?: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'INCOMPLETE';
  rawQuery: string;
  errorMessage?: string;
}

export interface MatchedCartolaItem {
  line: BankStatementLine;
  recId: string;
  period: string;
  bankAccountId: string;
  bankAccountCode: string;
  bankAccountName: string;
  effectiveDate: string;
  effectivePeriod: string;
  isDateShifted: boolean;
  matchedDocument?: RCVDocument | null;
}

/**
 * Natural Language Parser for Junior's Cartola Automation
 * Recognizes commands like:
 * "Toma todos los movimientos de cartolas que contengan la siguiente glosa: 'COMISION' y contabiliza ese movimiento contra la cuenta 5101004"
 * "Junior, toma los movimientos pendientes de contabilización con glosa PAC BCI SEGUROS GENE, regístralos pagando las facturas pendientes del RUT 99.147.000-K del proveedor BCI SEGUROS GENERALES S.A., los montos deben coincidir exactamente con las facturas pendientes de pago, contabiliza y concilia"
 */
export function parseJuniorGlossCommand(
  rawText: string,
  accounts: ChartOfAccount[],
  auxiliaries: Auxiliary[] = [],
  rcvDocuments: RCVDocument[] = []
): ParsedJuniorGlossIntent {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // Check if it represents a cartola accounting or gloss instruction
  const hasCartolaKeywords = 
    lower.includes('cartola') || 
    lower.includes('cartolas') || 
    lower.includes('banco') || 
    lower.includes('movimiento') || 
    lower.includes('movimientos') ||
    lower.includes('glosa') ||
    lower.includes('contabiliza') ||
    lower.includes('contabilizar') ||
    lower.includes('concilia') ||
    lower.includes('conciliar');

  if (!hasCartolaKeywords) {
    return {
      isGlossTask: false,
      pattern: '',
      targetAccount: null,
      movementType: 'ALL',
      confidence: 'INCOMPLETE',
      rawQuery: rawText
    };
  }

  // 1. Extract Pattern / Glosa
  let extractedPattern = '';

  // Pattern in quotes: "XXXX" or 'XXXX' or «XXXX»
  const quoteMatch = text.match(/["'«“]([^"'»”]+)["'»”]/);
  if (quoteMatch && quoteMatch[1]?.trim()) {
    extractedPattern = quoteMatch[1].trim();
  }

  // If no quotes, search after phrases like "glosa:", "glosa ", "contengan ", "digan "
  if (!extractedPattern) {
    const glosaMatch = text.match(/(?:glosa|contengan|contenga|digan|diga|texto)\s*(?:la\s*siguiente\s*glosa\s*:?|:\s*|\s+)?([a-zA-Z0-9_\-\.\s]{3,35}?)(?:\s+y\s+contabiliza|\s+registralos|\s+regístralos|\s+pagando|\s+contra|\s+a\s+la\s+cuenta|\s+al\s+debe|\s+al\s+haber|$)/i);
    if (glosaMatch && glosaMatch[1]) {
      extractedPattern = glosaMatch[1].trim();
    }
  }

  // Clean common trigger words if accidentally captured
  extractedPattern = extractedPattern
    .replace(/^["':\s]+|["':\s]+$/g, '')
    .replace(/^(la siguiente glosa|la glosa|el texto)\s*:?/i, '')
    .trim();

  // 2. Extract Movement Type (Cargos / Abonos / All)
  let movementType: 'ALL' | 'CARGO' | 'ABONO' = 'ALL';
  if (lower.includes('cargo') || lower.includes('cargos') || lower.includes('egreso') || lower.includes('egresos') || lower.includes('gasto') || lower.includes('gastos') || lower.includes('pago') || lower.includes('pagos') || lower.includes('pagando')) {
    movementType = 'CARGO';
  } else if (lower.includes('abono') || lower.includes('abonos') || lower.includes('ingreso') || lower.includes('ingresos') || lower.includes('deposito') || lower.includes('depositos') || lower.includes('cobro') || lower.includes('cobros') || lower.includes('cobrando')) {
    movementType = 'ABONO';
  }

  // 3. Extract RUT and Auxiliary information if present
  let targetAuxiliary: Auxiliary | null = null;
  let targetRut = '';
  let targetEntityName = '';

  const rutMatch = text.match(/(\d{1,2}\.?\d{3}\.?\d{3}[-kK0-9]|\d{7,8}[-kK0-9]?)/);
  if (rutMatch) {
    targetRut = rutMatch[0].trim();
    const cRut = targetRut.replace(/[^0-9kK]/g, '').toLowerCase();
    
    // Look in existing auxiliaries
    const foundAux = auxiliaries.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toLowerCase() === cRut);
    if (foundAux) {
      targetAuxiliary = foundAux;
      targetEntityName = foundAux.name;
    } else {
      // Look in RCV documents
      const foundRcv = rcvDocuments.find(d => areRutsEqual(d.rutEmisor, targetRut) || areRutsEqual(d.rutReceptor, targetRut));
      if (foundRcv) {
        targetEntityName = foundRcv.razonSocialEmisor || foundRcv.razonSocialReceptor || '';
      }
      
      // If not in RCV, extract from text: "del proveedor BCI SEGUROS...", "del cliente..."
      if (!targetEntityName) {
        const nameMatch = text.match(/(?:proveedor|cliente|titular|empresa)\s*[:\s]*([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\.\s\,]{3,60}?)(?:,|\.|\s+los\s+montos|\s+contabiliza|\s+y\s+concilia|$)/i);
        if (nameMatch) {
          targetEntityName = nameMatch[1].trim();
        }
      }

      targetAuxiliary = {
        id: `aux-${cRut}`,
        rut: targetRut,
        name: targetEntityName || targetRut,
        role: movementType === 'ABONO' ? 'Deudor' : 'Acreedor',
        estado: 'Activo'
      };
    }
  }

  // Check if exact invoice match was requested
  const requireExactInvoiceMatch = 
    lower.includes('coincidir exactamente') || 
    lower.includes('exactamente') || 
    lower.includes('coincidir con las facturas') || 
    lower.includes('montos deben coincidir') || 
    lower.includes('solo las que coincidan');

  // 4. Extract Target Account
  let targetAccount: ChartOfAccount | null = null;
  let targetAccountInputText = '';

  // Look for account code directly (e.g. 5101004, 5.1.01.004, 2101001, 2.1.01.001, etc.)
  const codeMatches = text.match(/\b([1-5](?:\.\d{1,3}){2,4}|\b[1-5]\d{5,7}\b)\b/g);
  if (codeMatches && codeMatches.length > 0) {
    for (const rawCode of codeMatches) {
      const cleanCode = rawCode.replace(/\./g, '');
      const matched = accounts.find(a => {
        const aClean = (a.code || '').replace(/\./g, '');
        return aClean === cleanCode || (a.code || '').toLowerCase() === rawCode.toLowerCase();
      });
      if (matched) {
        targetAccount = matched;
        targetAccountInputText = rawCode;
        break;
      }
    }
  }

  // If not found by code, look for account name after "cuenta", "contra", "a la cuenta"
  if (!targetAccount) {
    const accountNameMatch = text.match(/(?:cuenta|contra\s+la\s+cuenta|a\s+la\s+cuenta|contra)\s*[:\s]*([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\.\-]{3,40})/i);
    if (accountNameMatch && accountNameMatch[1]) {
      const searchName = accountNameMatch[1].toLowerCase().trim();
      targetAccountInputText = searchName;

      const candidates = accounts.filter(a => {
        const aName = (a.name || '').toLowerCase();
        const aCode = (a.code || '').toLowerCase();
        return aName.includes(searchName) || searchName.includes(aName) || aCode.includes(searchName);
      });

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          if (a.isImputable && !b.isImputable) return -1;
          if (!a.isImputable && b.isImputable) return 1;
          return 0;
        });
        targetAccount = candidates[0];
      }
    }
  }

  // 5. Intelligent / Semantic inference of Target Account if user says "pagando facturas del proveedor", "facturas pendientes", "clientes", etc.
  if (!targetAccount) {
    const isPayingSupplierInvoices = 
      lower.includes('proveedor') || 
      lower.includes('proveedores') || 
      lower.includes('facturas de compra') || 
      (lower.includes('factura') && (lower.includes('pago') || lower.includes('pagando') || lower.includes('pagar'))) ||
      (lower.includes('facturas') && (lower.includes('pago') || lower.includes('pagando') || lower.includes('pagar')));

    const isCollectingCustomerInvoices = 
      lower.includes('cliente') || 
      lower.includes('clientes') || 
      lower.includes('facturas de venta') || 
      (lower.includes('factura') && (lower.includes('cobro') || lower.includes('cobrando') || lower.includes('abono') || lower.includes('ingreso')));

    const isPayingHonorarios = 
      lower.includes('honorario') || 
      lower.includes('honorarios') || 
      lower.includes('boleta de honorario') || 
      lower.includes('boletas de honorario') ||
      lower.includes('bhe');

    const isBankExpense = 
      lower.includes('comision') || 
      lower.includes('comisiones') || 
      lower.includes('gasto bancario') || 
      lower.includes('gastos bancarios') ||
      lower.includes('interes') ||
      lower.includes('intereses');

    if (isPayingSupplierInvoices) {
      // Find standard Proveedores account
      targetAccount = accounts.find(a => {
        const cleanCode = (a.code || '').replace(/\./g, '');
        const aName = (a.name || '').toLowerCase();
        return (cleanCode.startsWith('2101') || aName.includes('proveedor') || aName.includes('cuentas por pagar')) && a.isImputable !== false;
      }) || accounts.find(a => a.type === 'Pasivo' && a.isImputable !== false) || null;

      if (!targetAccount) {
        targetAccount = {
          id: 'acc-prov-default',
          code: '2101001',
          name: 'Proveedores Nacionales',
          type: 'Pasivo',
          requiereAuxiliarRUT: true,
          requiereConciliacionBancaria: false,
          requiereDocumento: true,
          requiereCentroCosto: false,
          isImputable: true,
          estado: 'Activo'
        };
      }
      targetAccountInputText = targetAccount.name;
    } else if (isCollectingCustomerInvoices) {
      targetAccount = accounts.find(a => {
        const cleanCode = (a.code || '').replace(/\./g, '');
        const aName = (a.name || '').toLowerCase();
        return (cleanCode.startsWith('1103') || aName.includes('cliente') || aName.includes('cuentas por cobrar')) && a.isImputable !== false;
      }) || accounts.find(a => a.type === 'Activo' && a.isImputable !== false) || null;

      if (!targetAccount) {
        targetAccount = {
          id: 'acc-cli-default',
          code: '1103001',
          name: 'Clientes Nacionales',
          type: 'Activo',
          requiereAuxiliarRUT: true,
          requiereConciliacionBancaria: false,
          requiereDocumento: true,
          requiereCentroCosto: false,
          isImputable: true,
          estado: 'Activo'
        };
      }
      targetAccountInputText = targetAccount.name;
    } else if (isPayingHonorarios) {
      targetAccount = accounts.find(a => {
        const cleanCode = (a.code || '').replace(/\./g, '');
        const aName = (a.name || '').toLowerCase();
        return (cleanCode.startsWith('2102') || aName.includes('honorario')) && a.isImputable !== false;
      }) || null;

      if (!targetAccount) {
        targetAccount = {
          id: 'acc-hon-default',
          code: '2102001',
          name: 'Honorarios por Pagar',
          type: 'Pasivo',
          requiereAuxiliarRUT: true,
          requiereConciliacionBancaria: false,
          requiereDocumento: true,
          requiereCentroCosto: false,
          isImputable: true,
          estado: 'Activo'
        };
      }
      targetAccountInputText = targetAccount.name;
    } else if (isBankExpense) {
      targetAccount = accounts.find(a => {
        const cleanCode = (a.code || '').replace(/\./g, '');
        const aName = (a.name || '').toLowerCase();
        return (cleanCode.startsWith('5101004') || aName.includes('comision') || aName.includes('gasto bancario')) && a.isImputable !== false;
      }) || null;
      if (targetAccount) targetAccountInputText = targetAccount.name;
    }
  }

  const isComplete = Boolean(extractedPattern && targetAccount);

  return {
    isGlossTask: true,
    pattern: extractedPattern,
    targetAccount,
    targetAccountInputText,
    movementType,
    targetAuxiliary,
    targetRut,
    targetEntityName,
    requireExactInvoiceMatch,
    confidence: isComplete ? 'HIGH' : extractedPattern ? 'MEDIUM' : 'INCOMPLETE',
    rawQuery: rawText
  };
}

/**
 * Scan Firestore Bank Reconciliations for matching unreconciled cartola lines
 * and automatically matches pending RCV invoices (by RUT and exact amount)
 */
export async function findMatchingCartolaLines(
  studyId: string,
  company: Company,
  pattern: string,
  movementType: 'ALL' | 'CARGO' | 'ABONO',
  accounts: ChartOfAccount[],
  fiscalYears: FiscalPeriodYear[] = [],
  specificBankAccountId?: string,
  rcvDocuments: RCVDocument[] = [],
  targetAuxiliary?: Auxiliary | null,
  requireExactInvoiceMatch?: boolean
): Promise<{
  matchedLines: MatchedCartolaItem[];
  totalCharges: number;
  totalDeposits: number;
  totalCount: number;
  matchedInvoicesCount: number;
}> {
  if (!pattern || !studyId || !company?.id) {
    return { matchedLines: [], totalCharges: 0, totalDeposits: 0, totalCount: 0, matchedInvoicesCount: 0 };
  }

  const cleanPattern = pattern.toUpperCase().trim();
  const matchedLines: MatchedCartolaItem[] = [];
  let totalCharges = 0;
  let totalDeposits = 0;
  let matchedInvoicesCount = 0;

  // Track already matched RCV document IDs in this scan to avoid matching the same invoice twice to different lines
  const matchedRcvDocIds = new Set<string>();

  try {
    const recsRef = collection(db, 'studies', studyId, 'companies', company.id, 'bankReconciliations');
    const recsSnap = await getDocs(recsRef);

    recsSnap.docs.forEach(docSnap => {
      const rec = docSnap.data() as BankReconciliation;
      if (specificBankAccountId && rec.bankAccountId !== specificBankAccountId) {
        return;
      }

      const bankAcc = accounts.find(a => a.id === rec.bankAccountId || a.code === rec.bankAccountCode) || {
        id: rec.bankAccountId,
        code: rec.bankAccountCode || '1.1.01.002',
        name: rec.bankAccountName || 'BANCO',
        type: 'Activo'
      };

      const lines = rec.lines || [];
      lines.forEach(line => {
        // Skip already reconciled lines
        if (line.matchedStatus === 'Conciliado' || line.matchedVoucherId) {
          return;
        }

        const desc = (line.description || '').toUpperCase();
        if (!desc.includes(cleanPattern)) {
          return;
        }

        const isCharge = (line.charge || 0) > 0;
        const isDeposit = (line.deposit || 0) > 0;

        if (movementType === 'CARGO' && !isCharge) return;
        if (movementType === 'ABONO' && !isDeposit) return;

        const amount = isCharge ? line.charge : line.deposit;

        // Date shift calculation if period closed
        const shiftInfo = getNextOpenPeriodAndDate(line.date, fiscalYears);

        // Match with RCV Document if RUT or auxiliary is given
        let matchedDoc: RCVDocument | null = null;
        if (rcvDocuments.length > 0) {
          const targetRut = targetAuxiliary?.rut;
          
          // Look for unpaid invoices
          const candidates = rcvDocuments.filter(d => {
            if (d.estadoPago === 'Pagada') return false;
            if (matchedRcvDocIds.has(d.id)) return false;

            const docAmount = d.tipoRegistro === 'Honorarios' ? (d.montoLiquido || d.montoTotal) : d.montoTotal;
            const docSaldo = d.saldoPendiente !== undefined ? d.saldoPendiente : docAmount;

            // Check RUT match if targetRut provided
            if (targetRut) {
              const rutMatch = areRutsEqual(d.rutEmisor, targetRut) || areRutsEqual(d.rutReceptor, targetRut);
              if (!rutMatch) return false;
            }

            // Check exact amount match
            const amountMatches = Math.abs(docAmount - amount) < 1 || Math.abs(docSaldo - amount) < 1;
            return amountMatches;
          });

          if (candidates.length > 0) {
            matchedDoc = candidates[0];
            matchedRcvDocIds.add(matchedDoc.id);
            matchedInvoicesCount++;
          }
        }

        // If exact invoice match was strictly requested and no invoice matched, skip this line
        if (requireExactInvoiceMatch && !matchedDoc) {
          return;
        }

        matchedLines.push({
          line,
          recId: docSnap.id,
          period: rec.period,
          bankAccountId: rec.bankAccountId,
          bankAccountCode: rec.bankAccountCode || bankAcc.code || '1.1.01.002',
          bankAccountName: rec.bankAccountName || bankAcc.name || 'BANCO',
          effectiveDate: shiftInfo.date,
          effectivePeriod: shiftInfo.period,
          isDateShifted: shiftInfo.wasShifted,
          matchedDocument: matchedDoc
        });

        totalCharges += (line.charge || 0);
        totalDeposits += (line.deposit || 0);
      });
    });

    // Sort by date chronologically
    matchedLines.sort((a, b) => a.line.date.localeCompare(b.line.date));

    return {
      matchedLines,
      totalCharges,
      totalDeposits,
      totalCount: matchedLines.length,
      matchedInvoicesCount
    };
  } catch (err) {
    console.error('Error scanning matching cartola lines:', err);
    return { matchedLines: [], totalCharges: 0, totalDeposits: 0, totalCount: 0, matchedInvoicesCount: 0 };
  }
}

/**
 * Execute Junior Gloss Automation:
 * 1. Bulk creates official vouchers in Firestore
 * 2. Updates matched RCV invoices to 'Pagada' ($0) in Firestore
 * 3. Updates Bank Statement lines to 'Conciliado' with matched voucher ID
 * 4. Saves / Memorizes the rule in Junior's Knowledge Base
 */
export async function executeJuniorGlossAutomation(
  studyId: string,
  company: Company,
  itemsToProcess: MatchedCartolaItem[],
  targetAccount: ChartOfAccount,
  rulePattern: string,
  options: {
    movementType: 'ALL' | 'CARGO' | 'ABONO';
    targetAuxiliary?: Auxiliary | null;
    customGloss?: string;
    saveAsPermanentRule?: boolean;
    costCenter?: string;
    expenseItem?: string;
    project?: string;
    product?: string;
    existingVouchers: Voucher[];
    accounts: ChartOfAccount[];
  }
): Promise<{
  success: boolean;
  createdVouchersCount: number;
  reconciledCount: number;
  totalAmount: number;
  vouchersCreated: Voucher[];
  error?: string;
}> {
  if (!studyId || !company?.id || itemsToProcess.length === 0 || !targetAccount) {
    return {
      success: false,
      createdVouchersCount: 0,
      reconciledCount: 0,
      totalAmount: 0,
      vouchersCreated: [],
      error: 'Parámetros incompletos o no hay movimientos para procesar.'
    };
  }

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);
  const vouchersCol = collection(companyRef, 'vouchers');

  // Determine starting correlative voucher number
  let currentMaxVoucherNumber = options.existingVouchers.length > 0 
    ? Math.max(...options.existingVouchers.map(v => v.voucherNumber || 0)) 
    : 0;

  const vouchersCreated: Voucher[] = [];
  let totalProcessedAmount = 0;

  // Group items by recId so we can batch update the reconciliations in Firestore
  const recsUpdatesMap = new Map<string, Map<string, { voucherId: string; voucherNumber: number; period: string }>>();

  try {
    for (const item of itemsToProcess) {
      currentMaxVoucherNumber += 1;
      const isCharge = (item.line.charge || 0) > 0;
      const amount = isCharge ? item.line.charge : item.line.deposit;
      totalProcessedAmount += amount;

      const voucherType = isCharge ? 'Egreso' : 'Ingreso';
      const defaultGloss = (options.customGloss?.trim() || item.line.description || '').trim();

      // Auxiliary info from matched document or options
      const auxRut = item.matchedDocument?.rutEmisor || 
                     item.matchedDocument?.rutReceptor || 
                     options.targetAuxiliary?.rut || '';

      const auxName = item.matchedDocument?.razonSocialEmisor || 
                      item.matchedDocument?.razonSocialReceptor || 
                      options.targetAuxiliary?.name || '';

      const docFolio = item.matchedDocument?.folio 
        ? String(item.matchedDocument.folio) 
        : (item.line.documentNumber || 'BANCO');

      const docType = item.matchedDocument?.tipoDoc || (isCharge ? '33' : '39');

      const effectiveCostCenter = options.costCenter || options.targetAuxiliary?.defaultCostCenter || '';
      const effectiveExpenseItem = options.expenseItem || options.targetAuxiliary?.defaultExpenseItem || '';
      const effectiveProject = options.project || options.targetAuxiliary?.defaultProject || '';

      // Build balanced double entry (Partida Doble Oficial)
      let voucherLines: VoucherLine[] = [];

      if (isCharge) {
        // Cargo en banco -> Egreso: Cuenta de Pasivo/Proveedor al Debe, Banco al Haber
        voucherLines = [
          {
            id: 'l1',
            accountId: targetAccount.id,
            accountCode: targetAccount.code,
            accountName: targetAccount.name,
            debit: amount,
            credit: 0,
            auxiliaryRut: targetAccount.requiereAuxiliarRUT ? auxRut : undefined,
            auxiliaryName: targetAccount.requiereAuxiliarRUT ? auxName : undefined,
            documentType: docType,
            documentRef: docFolio,
            gloss: defaultGloss,
            costCenter: effectiveCostCenter,
            expenseItem: effectiveExpenseItem,
            project: effectiveProject
          },
          {
            id: 'l2',
            accountId: item.bankAccountId,
            accountCode: item.bankAccountCode,
            accountName: item.bankAccountName,
            debit: 0,
            credit: amount,
            documentType: docType,
            documentRef: docFolio,
            gloss: defaultGloss
          }
        ];
      } else {
        // Abono en banco -> Ingreso: Banco al Debe, Cuenta de Cliente/Activo al Haber
        voucherLines = [
          {
            id: 'l1',
            accountId: item.bankAccountId,
            accountCode: item.bankAccountCode,
            accountName: item.bankAccountName,
            debit: amount,
            credit: 0,
            documentType: docType,
            documentRef: docFolio,
            gloss: defaultGloss
          },
          {
            id: 'l2',
            accountId: targetAccount.id,
            accountCode: targetAccount.code,
            accountName: targetAccount.name,
            debit: 0,
            credit: amount,
            auxiliaryRut: targetAccount.requiereAuxiliarRUT ? auxRut : undefined,
            auxiliaryName: targetAccount.requiereAuxiliarRUT ? auxName : undefined,
            documentType: docType,
            documentRef: docFolio,
            gloss: defaultGloss,
            costCenter: effectiveCostCenter,
            expenseItem: effectiveExpenseItem,
            project: effectiveProject
          }
        ];
      }

      const totalDebit = voucherLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const totalCredit = voucherLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

      const newVoucher: Partial<Voucher> = {
        voucherNumber: currentMaxVoucherNumber,
        date: item.effectiveDate,
        period: item.effectivePeriod,
        type: voucherType,
        gloss: defaultGloss,
        lines: voucherLines,
        totalDebit,
        totalCredit,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      // Add to Firestore
      const docRef = await addDoc(vouchersCol, sanitizeForFirestore(newVoucher));
      const createdVoucherWithId = { id: docRef.id, ...newVoucher } as Voucher;
      vouchersCreated.push(createdVoucherWithId);

      // Mark matched RCV Invoice as Pagada ($0) in Firestore
      if (item.matchedDocument?.id) {
        try {
          const rcvDocRef = doc(companyRef, 'rcvDocuments', item.matchedDocument.id);
          await updateDoc(rcvDocRef, {
            estadoPago: 'Pagada',
            estadoCobranza: 'Pagada',
            saldoPendiente: 0,
            voucherId: docRef.id,
            updatedAt: new Date().toISOString()
          });
        } catch (rcvErr) {
          console.warn(`Warning updating RCV Document ${item.matchedDocument.id}:`, rcvErr);
        }
      }

      // Track reconciliation update
      if (!recsUpdatesMap.has(item.recId)) {
        recsUpdatesMap.set(item.recId, new Map());
      }
      recsUpdatesMap.get(item.recId)!.set(item.line.id, {
        voucherId: docRef.id,
        voucherNumber: currentMaxVoucherNumber,
        period: item.effectivePeriod
      });
    }

    // 2. Update Bank Reconciliations in Firestore
    for (const [recId, lineUpdates] of recsUpdatesMap.entries()) {
      try {
        const recDocRef = doc(companyRef, 'bankReconciliations', recId);
        const recSnap = await getDoc(recDocRef);
        
        if (recSnap.exists()) {
          const recData = recSnap.data() as BankReconciliation;
          const updatedLines = (recData.lines || []).map(l => {
            if (lineUpdates.has(l.id)) {
              const u = lineUpdates.get(l.id)!;
              return {
                ...l,
                matchedStatus: 'Conciliado' as const,
                matchedVoucherId: u.voucherId,
                matchedVoucherNumber: u.voucherNumber,
                matchedVoucherPeriod: u.period
              };
            }
            return l;
          });

          await updateDoc(recDocRef, {
            lines: sanitizeForFirestore(updatedLines),
            updatedAt: new Date().toISOString()
          });
        }
      } catch (recErr) {
        console.warn(`Warning updating reconciliation ${recId}:`, recErr);
      }
    }

    // 3. Save as Permanent Rule in Junior's Knowledge Base if requested
    if (options.saveAsPermanentRule !== false) {
      try {
        const ruleData: JuniorGlossRule = {
          studyId,
          companyId: company.id,
          title: `Contabilizar '${rulePattern}' contra [${targetAccount.code}] ${targetAccount.name}`,
          pattern: rulePattern.trim().toUpperCase(),
          matchType: 'CONTAINS',
          movementType: options.movementType,
          accountId: targetAccount.id,
          accountCode: targetAccount.code,
          accountName: targetAccount.name,
          auxiliaryRut: options.targetAuxiliary?.rut,
          auxiliaryName: options.targetAuxiliary?.name,
          targetGloss: options.customGloss,
          costCenter: options.costCenter,
          expenseItem: options.expenseItem,
          project: options.project,
          product: options.product,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          timesUsed: itemsToProcess.length
        };

        // Save to company juniorGlossRules collection
        await addDoc(collection(companyRef, 'juniorGlossRules'), sanitizeForFirestore(ruleData));

        // Also add training directive into company copilot knowledge
        await addDoc(collection(companyRef, 'copilotCompanyKnowledge'), sanitizeForFirestore({
          scope: 'COMPANY',
          companyId: company.id,
          category: 'CONTABILIDAD_GENERAL',
          title: `Regla de Cartola: Glosa '${rulePattern}' ➔ [${targetAccount.code}] ${targetAccount.name}`,
          keywords: ['cartola', 'glosa', rulePattern.toLowerCase(), targetAccount.code.toLowerCase(), targetAccount.name.toLowerCase()],
          directiveContent: `Junior contabiliza automáticamente los movimientos de cartola bancaria que contengan la glosa '${rulePattern}' contra la cuenta [${targetAccount.code}] ${targetAccount.name}.`,
          recommendedEntries: `[${targetAccount.code}] ${targetAccount.name} vs [1.1.01.002] Banco`,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
      } catch (ruleErr) {
        console.warn('Warning saving Junior rule:', ruleErr);
      }
    }

    return {
      success: true,
      createdVouchersCount: vouchersCreated.length,
      reconciledCount: itemsToProcess.length,
      totalAmount: totalProcessedAmount,
      vouchersCreated
    };
  } catch (err: any) {
    console.error('Error executing Junior gloss automation:', err);
    return {
      success: false,
      createdVouchersCount: vouchersCreated.length,
      reconciledCount: 0,
      totalAmount: 0,
      vouchersCreated,
      error: err?.message || 'Error durante la ejecución del proceso contable.'
    };
  }
}

/**
 * Load all saved Junior Gloss Rules for the company
 */
export async function loadJuniorGlossRules(studyId: string, companyId: string): Promise<JuniorGlossRule[]> {
  if (!studyId || !companyId) return [];
  try {
    const rulesSnap = await getDocs(collection(db, 'studies', studyId, 'companies', companyId, 'juniorGlossRules'));
    return rulesSnap.docs.map(d => ({ id: d.id, ...d.data() } as JuniorGlossRule));
  } catch (err) {
    console.error('Error loading Junior gloss rules:', err);
    return [];
  }
}
