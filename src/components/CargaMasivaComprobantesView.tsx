import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { Company, ChartOfAccount, Voucher, VoucherLine, FiscalPeriodYear } from '../types';
import { useProcess } from '../context/ProcessContext';
import { logAuditEvent } from '../utils/auditLogger';
import { validateVoucherLine, sanitizeVoucherLines } from '../utils/voucherValidation';
import * as XLSX from 'xlsx';

interface CargaMasivaComprobantesViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
  onNavigateTab?: (tab: string) => void;
}

interface ParsedVoucherDraft {
  tempId: string;
  voucherNumber: number;
  originalFileNumber: number;
  date: string;
  period: string;
  type: 'Ingreso' | 'Egreso' | 'Traspaso';
  gloss: string;
  lines: (VoucherLine & { isAccountMissing?: boolean; requiredErrors?: string[] })[];
  totalDebit: number;
  totalCredit: number;
  isValid: boolean;
  errors: string[];
}

// Helper: Normalize account code (remove dots, dashes, spaces)
const normalizeCode = (code: string) => code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();

// Helper: Parse Chilean and international number formats ($5.000.000, 5000000, 5.000.000,00, 5,000,000)
function parseChileanNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim();
  if (!str) return 0;

  // Remove currency signs and spaces
  str = str.replace(/[$$\s]/g, '');

  // Handle formats like 5.000.000,00 (dot = thousand, comma = decimal)
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes('.') && !str.includes(',')) {
    const dotParts = str.split('.');
    if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[1].length === 3)) {
      str = str.replace(/\./g, '');
    }
  } else if (str.includes(',') && !str.includes('.')) {
    const commaParts = str.split(',');
    if (commaParts.length > 2 || (commaParts.length === 2 && commaParts[1].length === 3)) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper: Parse any date format into YYYY-MM-DD
function parseDateToYYYYMMDD(rawDate: any): string {
  if (rawDate === null || rawDate === undefined || rawDate === '') return '';

  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    const y = rawDate.getFullYear();
    const m = String(rawDate.getMonth() + 1).padStart(2, '0');
    const d = String(rawDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Handle Excel Serial Number (e.g., 45448)
  if (typeof rawDate === 'number' || (!isNaN(Number(rawDate)) && !String(rawDate).includes('-') && !String(rawDate).includes('/'))) {
    const serial = Number(rawDate);
    if (serial > 20000 && serial < 60000) {
      const parsedDate = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!isNaN(parsedDate.getTime())) {
        const y = parsedDate.getUTCFullYear();
        const m = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(parsedDate.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }

  const str = String(rawDate).trim();
  if (!str) return '';
  if (str.includes('T')) {
    return str.split('T')[0];
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Handle YYYY/MM/DD or YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return str;
}

// Helper: Safely get string from a cell preserving 0, 0000, and non-string types
function getSafeCellString(row: any[], idx: number): string {
  if (idx < 0 || !row || idx >= row.length) return '';
  const val = row[idx];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

export default function CargaMasivaComprobantesView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears,
  onVouchersUpdated,
  onNavigateTab
}: CargaMasivaComprobantesViewProps) {
  const { withProcess } = useProcess();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileMetadata, setFileMetadata] = useState<{ name: string; size: string; rowCount: number } | null>(null);
  const [rawFileRows, setRawFileRows] = useState<any[][]>([]);
  const [parsedVouchers, setParsedVouchers] = useState<ParsedVoucherDraft[]>([]);
  const [missingAccountCodes, setMissingAccountCodes] = useState<string[]>([]);
  const [renumberMode, setRenumberMode] = useState<'auto' | 'keep'>('auto');
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadSuccessCount, setUploadSuccessCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Anti-double click protection state
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Maximum existing voucher number in the system
  const maxExistingNum = vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0;
  const existingVoucherNumbers = new Set(vouchers.map(v => v.voucherNumber).filter(Boolean));

  // Validate matrix data against current accounts list and renumber mode
  const validateMatrixData = useCallback((rows: any[][], currentRenumberMode: 'auto' | 'keep') => {
    if (!rows || rows.length === 0) {
      setParsedVouchers([]);
      setMissingAccountCodes([]);
      return;
    }

    // Build Account Lookup Map
    const accountMap = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      if (a.code) {
        accountMap.set(a.code.trim(), a);
        const norm = normalizeCode(a.code);
        if (norm) accountMap.set(norm, a);
      }
    });

    let startIdx = 0;
    const colIdxMap: { [key: string]: number } = {
      vNum: 0,
      vDate: 1,
      vType: 2,
      vGloss: 3,
      accCode: 4,
      debit: 6,
      credit: 7,
      lineGloss: 8,
      auxRut: 9,
      auxName: 10,
      docType: 11,
      docNum: 12,
      refDte: -1,
      costCenter: 13,
      bankDocRef: 14,
      dueDate: 15,
      expenseItem: 16,
      project: 17,
      product: 18
    };

    const customColsMap: { [colName: string]: number } = {};
    const companyCustomCols = company.customAccountColumns || [];

    // Detect header row dynamically
    const firstRowStr = (rows[0] || []).map(cell => String(cell).toLowerCase()).join(' ');
    if (
      firstRowStr.includes('comprobante') ||
      firstRowStr.includes('cuenta') ||
      firstRowStr.includes('debe') ||
      firstRowStr.includes('fecha')
    ) {
      startIdx = 1;
      const headerRow = (rows[0] || []).map(cell => String(cell).toLowerCase().trim());
      
      headerRow.forEach((head, idx) => {
        // 1. Account Code
        if (
          head === 'codigocuenta' ||
          head === 'codigo cuenta' ||
          head === 'código cuenta' ||
          head === 'cod_cuenta' ||
          head === 'codcuenta' ||
          (head.includes('codigo') && head.includes('cuenta')) ||
          head === 'codigo'
        ) {
          colIdxMap.accCode = idx;
        }
        // 2. Voucher Number
        else if (
          head === 'numerocomprobante' ||
          head === 'numcomprobante' ||
          head === 'nrocomprobante' ||
          head === 'num_comprobante' ||
          head === 'num comprobante' ||
          head === 'nro comprobante' ||
          head === 'n° comprobante' ||
          head === 'nro' ||
          head === 'n°' ||
          head.includes('folio') ||
          head.includes('asiento')
        ) {
          colIdxMap.vNum = idx;
        }
        else if (head === 'comprobante' && colIdxMap.vNum === 0) {
          colIdxMap.vNum = idx;
        }
        // 3. Due Date / Fecha Vencimiento (CRITICAL: MUST CHECK BEFORE GENERAL FECHA!)
        else if (
          head.includes('vencimiento') ||
          head.includes('duedate') ||
          head.includes('fechavto') ||
          head.includes('f.venc') ||
          head === 'vto'
        ) {
          colIdxMap.dueDate = idx;
        }
        // 4. Voucher Date (Fecha Comprobante)
        else if (head.includes('fecha') || head.includes('date')) {
          colIdxMap.vDate = idx;
        }
        // 5. Document Type (TipoDoc) (CRITICAL: MUST CHECK BEFORE TIPO COMPROBANTE!)
        else if (
          head === 'tipodoc' ||
          head === 'tipo_doc' ||
          head === 'tipodocumento' ||
          head === 'tipo documento' ||
          head === 'tipo dte'
        ) {
          colIdxMap.docType = idx;
        }
        // 6. Voucher Type (Ingreso / Egreso / Traspaso)
        else if (
          head.includes('tipocomprobante') ||
          head.includes('tipo_comprobante') ||
          head.includes('tipo comprobante') ||
          head.includes('tipo asiento') ||
          (head.includes('tipo') && !head.includes('doc'))
        ) {
          colIdxMap.vType = idx;
        }
        // 7. Voucher Gloss
        else if (
          head === 'glosacomprobante' ||
          head === 'glosa comprobante' ||
          head === 'glosa asiento' ||
          head === 'glosageneral' ||
          head === 'glosa general' ||
          head === 'concepto'
        ) {
          colIdxMap.vGloss = idx;
        }
        // 8. Line Gloss
        else if (
          head === 'glosalinea' ||
          head === 'glosa linea' ||
          head.includes('detalle')
        ) {
          colIdxMap.lineGloss = idx;
        }
        else if (head === 'glosa') {
          if (colIdxMap.vGloss === 3) colIdxMap.vGloss = idx;
          else colIdxMap.lineGloss = idx;
        }
        // 9. Debit
        else if (head.includes('debe') || head.includes('debit') || head === 'cargo') {
          colIdxMap.debit = idx;
        }
        // 10. Credit
        else if (head.includes('haber') || head.includes('credit') || head === 'abono') {
          colIdxMap.credit = idx;
        }
        // 11. RUT Auxiliar
        else if (head.includes('rut') || head === 'auxiliarrut' || head === 'rutauxiliar') {
          colIdxMap.auxRut = idx;
        }
        // 12. Aux Name / Razón Social
        else if (
          head.includes('razon') ||
          head.includes('razón') ||
          head.includes('nombreaux') ||
          head.includes('nombre_aux') ||
          head.includes('cli_prov') ||
          head.includes('cliprov') ||
          (head.includes('auxiliar') && !head.includes('rut'))
        ) {
          colIdxMap.auxName = idx;
        }
        // 13. Document Number
        else if (
          head === 'numerodoc' ||
          head === 'nrodoc' ||
          head === 'numdoc' ||
          head === 'numero_doc' ||
          head === 'numero doc' ||
          head === 'nro doc' ||
          head === 'foliodocumento' ||
          head === 'factura' ||
          head.includes('nrodocumento')
        ) {
          colIdxMap.docNum = idx;
        }
        // 14. Ref DTE / Ref Document
        else if (
          head.includes('refdte') ||
          head.includes('ref_dte') ||
          head.includes('ref dte') ||
          head.includes('refdoc') ||
          head.includes('refdocumento')
        ) {
          colIdxMap.refDte = idx;
        }
        // 15. Cost Center
        else if (
          head.includes('centrocosto') ||
          head.includes('centro_costo') ||
          head.includes('centro costo') ||
          head === 'cc' ||
          head.includes('c.costo')
        ) {
          colIdxMap.costCenter = idx;
        }
        // 16. Bank Ref
        else if (
          head.includes('refbanco') ||
          head.includes('refbancaria') ||
          head.includes('banco') ||
          head.includes('conciliacion') ||
          head.includes('cheque')
        ) {
          colIdxMap.bankDocRef = idx;
        }
        // 17. Expense Item
        else if (
          head.includes('itemgasto') ||
          head.includes('item_gasto') ||
          head.includes('ítem gasto') ||
          head.includes('item gasto') ||
          head.includes('clasificadorgasto')
        ) {
          colIdxMap.expenseItem = idx;
        }
        // 18. Project
        else if (head.includes('proyecto') || head.includes('proy') || head.includes('obra')) {
          colIdxMap.project = idx;
        }
        // 19. Product
        else if (head.includes('producto') || head.includes('articulo') || head.includes('servicio')) {
          colIdxMap.product = idx;
        }

        // Match custom columns
        companyCustomCols.forEach(customCol => {
          if (head === customCol.toLowerCase().trim() || head.includes(customCol.toLowerCase().trim())) {
            customColsMap[customCol] = idx;
          }
        });
      });
    }

    const groupedByNumber = new Map<string, {
      fileNum: number;
      date: string;
      period: string;
      type: 'Ingreso' | 'Egreso' | 'Traspaso';
      gloss: string;
      lines: (VoucherLine & { isAccountMissing?: boolean; requiredErrors?: string[] })[];
    }>();

    const missingSet = new Set<string>();
    let currentVoucherIndex = 1;
    let lastWasEmptyLine = false;
    let previousRawNum = '';

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) {
        lastWasEmptyLine = true;
        continue;
      }

      const accCode = getSafeCellString(row, colIdxMap.accCode);
      const debit = parseChileanNumber(colIdxMap.debit >= 0 ? row[colIdxMap.debit] : 0);
      const credit = parseChileanNumber(colIdxMap.credit >= 0 ? row[colIdxMap.credit] : 0);
      const rawNumStr = getSafeCellString(row, colIdxMap.vNum);

      // Rule: Empty line acts as separator between distinct vouchers
      const isBlankRow = !accCode && debit === 0 && credit === 0 && !getSafeCellString(row, colIdxMap.vGloss);
      if (isBlankRow) {
        lastWasEmptyLine = true;
        continue;
      }

      if (lastWasEmptyLine) {
        currentVoucherIndex++;
        lastWasEmptyLine = false;
      } else if (rawNumStr && previousRawNum && rawNumStr !== previousRawNum) {
        currentVoucherIndex++;
      }
      previousRawNum = rawNumStr;

      const parsedNum = parseInt(rawNumStr, 10);
      const vNumKey = !isNaN(parsedNum) ? `num_${parsedNum}_grp_${currentVoucherIndex}` : `auto_grp_${currentVoucherIndex}`;
      const fileNumVal = !isNaN(parsedNum) ? parsedNum : currentVoucherIndex;

      const rawDateCell = colIdxMap.vDate >= 0 ? row[colIdxMap.vDate] : null;
      const vDate = parseDateToYYYYMMDD(rawDateCell) || new Date().toISOString().split('T')[0];
      const vPeriod = vDate.slice(0, 7);

      const rawType = getSafeCellString(row, colIdxMap.vType);
      const vType = (['Ingreso', 'Egreso', 'Traspaso'].includes(rawType) ? rawType : 'Traspaso') as 'Ingreso' | 'Egreso' | 'Traspaso';
      
      const vGloss = getSafeCellString(row, colIdxMap.vGloss) || 'Comprobante Importado';

      const auxRut = getSafeCellString(row, colIdxMap.auxRut);
      const auxName = getSafeCellString(row, colIdxMap.auxName);
      const lineGloss = getSafeCellString(row, colIdxMap.lineGloss) || vGloss;
      
      // Combine document type and number if split across columns
      const docTypeVal = getSafeCellString(row, colIdxMap.docType);
      const docNumVal = getSafeCellString(row, colIdxMap.docNum);
      const refDteVal = getSafeCellString(row, colIdxMap.refDte);
      const bankDocRefVal = getSafeCellString(row, colIdxMap.bankDocRef);

      let refDte = refDteVal;
      if (!refDte) {
        if (docTypeVal && docNumVal) {
          refDte = `${docTypeVal} ${docNumVal}`;
        } else if (docNumVal) {
          refDte = docNumVal;
        } else if (docTypeVal) {
          refDte = docTypeVal;
        } else if (bankDocRefVal) {
          refDte = bankDocRefVal;
        }
      } else if (docTypeVal && !refDte.toLowerCase().includes(docTypeVal.toLowerCase())) {
        refDte = `${docTypeVal} ${refDte}`;
      }

      const costCenter = getSafeCellString(row, colIdxMap.costCenter);
      let bankDocRef = bankDocRefVal;
      if (!bankDocRef && (docNumVal || refDte)) {
        bankDocRef = docNumVal || refDte;
      }
      
      const rawDueDateCell = colIdxMap.dueDate >= 0 ? row[colIdxMap.dueDate] : null;
      const dueDate = rawDueDateCell ? parseDateToYYYYMMDD(rawDueDateCell) : '';

      const expenseItem = getSafeCellString(row, colIdxMap.expenseItem);
      const project = getSafeCellString(row, colIdxMap.project);
      const product = getSafeCellString(row, colIdxMap.product);

      // Custom attributes extracted from row
      const customAnalyses: { [key: string]: string } = {};
      Object.entries(customColsMap).forEach(([colName, colIdx]) => {
        if (colIdx >= 0 && row[colIdx] !== undefined) {
          const val = getSafeCellString(row, colIdx);
          if (val) customAnalyses[colName] = val;
        }
      });

      // Account lookup
      const matchedAccount = accountMap.get(accCode) || accountMap.get(normalizeCode(accCode));
      const isMissing = !matchedAccount && Boolean(accCode);

      if (isMissing) {
        missingSet.add(accCode);
      }

      const voucherLine: VoucherLine & { isAccountMissing?: boolean; requiredErrors?: string[] } = {
        id: `line_${i}`,
        accountId: matchedAccount ? matchedAccount.id : `acc_${accCode}`,
        accountCode: accCode || 'SIN_CUENTA',
        accountName: matchedAccount ? matchedAccount.name : '❌ CUENTA NO CONFIGURADA EN PLAN DE CUENTAS',
        debit,
        credit,
        auxiliaryRut: auxRut,
        auxiliaryName: auxName,
        documentRef: refDte,
        costCenter,
        bankDocRef,
        dueDate,
        expenseItem,
        project,
        product,
        customAnalyses,
        gloss: lineGloss,
        isAccountMissing: isMissing,
        requiredErrors: []
      };

      // Perform deep analysis validation according to Chart of Accounts requirements
      const lineValResult = validateVoucherLine(voucherLine, matchedAccount, companyCustomCols);
      if (!lineValResult.isValid) {
        voucherLine.requiredErrors = lineValResult.errors;
      }

      if (!groupedByNumber.has(vNumKey)) {
        groupedByNumber.set(vNumKey, {
          fileNum: fileNumVal,
          date: vDate,
          period: vPeriod,
          type: vType,
          gloss: vGloss,
          lines: []
        });
      }

      groupedByNumber.get(vNumKey)!.lines.push(voucherLine);
    }

    setMissingAccountCodes(Array.from(missingSet));

    // Calculate numbering sequence
    let autoSequence = maxExistingNum;
    const drafts: ParsedVoucherDraft[] = [];

    groupedByNumber.forEach((val, key) => {
      autoSequence++;
      
      let assignedVoucherNumber = autoSequence;
      if (currentRenumberMode === 'keep') {
        assignedVoucherNumber = val.fileNum > 0 ? val.fileNum : autoSequence;
      }

      const totalDebit = val.lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = val.lines.reduce((s, l) => s + (l.credit || 0), 0);
      
      const errors: string[] = [];

      // Check collision with existing voucher numbers if user chooses 'keep'
      if (currentRenumberMode === 'keep' && val.fileNum > 0 && existingVoucherNumbers.has(val.fileNum)) {
        errors.push(`El N° de comprobante ${val.fileNum} ya existe en el sistema para esta empresa. Use "Auto-numerar" para asignar folios nuevos sin conflicto.`);
      }

      // Check balance (Debe = Haber)
      const diff = Math.abs(totalDebit - totalCredit);
      const isBalanced = diff < 0.01 && totalDebit > 0;

      if (!isBalanced) {
        if (totalDebit === 0 && totalCredit === 0) {
          errors.push('El asiento no tiene montos en Debe ni Haber');
        } else {
          errors.push(`Descuadre: Debe ($${totalDebit.toLocaleString('es-CL')}) != Haber ($${totalCredit.toLocaleString('es-CL')}) [Diferencia: $${diff.toLocaleString('es-CL')}]`);
        }
      }

      // Check missing accounts
      const missingInVoucher = val.lines.filter(l => l.isAccountMissing);
      if (missingInVoucher.length > 0) {
        const missingCodesStr = missingInVoucher.map(l => l.accountCode).join(', ');
        errors.push(`Cuentas no existen en Plan de Cuentas: [${missingCodesStr}]`);
      }

      // Check required attributes on lines
      val.lines.forEach(l => {
        if (l.requiredErrors && l.requiredErrors.length > 0) {
          errors.push(...l.requiredErrors);
        }
      });

      // Check empty lines
      if (val.lines.length === 0) {
        errors.push('El comprobante no tiene líneas de asiento');
      }

      const isValid = errors.length === 0;

      drafts.push({
        tempId: `draft_${key}_${Date.now()}`,
        voucherNumber: assignedVoucherNumber,
        originalFileNumber: val.fileNum,
        date: val.date,
        period: val.period,
        type: val.type,
        gloss: val.gloss,
        lines: val.lines,
        totalDebit,
        totalCredit,
        isValid,
        errors
      });
    });

    setParsedVouchers(drafts);
  }, [accounts, vouchers, maxExistingNum]);

  // Auto re-validate whenever accounts prop, raw rows or renumberMode change
  useEffect(() => {
    if (rawFileRows.length > 0) {
      validateMatrixData(rawFileRows, renumberMode);
    }
  }, [accounts, rawFileRows, renumberMode, validateMatrixData]);

  // Read Uploaded File
  const processUploadedFile = (file: File) => {
    setSelectedFile(file);
    setUploadSuccessCount(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        setRawFileRows(rawRows);
        setFileMetadata({
          name: file.name,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          rowCount: rawRows.length
        });

        validateMatrixData(rawRows, renumberMode);
      } catch (err: any) {
        console.error('Error procesando archivo:', err);
        alert('❌ Error al procesar el archivo: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // Download Sample Templates
  const handleDownloadExcelTemplate = () => {
    const customCols = company.customAccountColumns || [];
    
    const sampleData = [
      {
        NumComprobante: 1,
        Fecha: '2026-08-01',
        Tipo: 'Ingreso',
        GlosaComprobante: 'Aporte Inicial de Capital',
        CodigoCuenta: accounts[0]?.code || '1-1-01-01',
        Debe: 5000000,
        Haber: 0,
        RutAuxiliar: '',
        NombreAuxiliar: '',
        GlosaLinea: 'Deposito Bancario Capital',
        RefDTE: '',
        CentroCosto: '',
        RefBancaria: 'Cartola 0826',
        FechaVencimiento: '',
        ItemGasto: '',
        Proyecto: '',
        Producto: '',
        ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
      },
      {
        NumComprobante: 1,
        Fecha: '2026-08-01',
        Tipo: 'Ingreso',
        GlosaComprobante: 'Aporte Inicial de Capital',
        CodigoCuenta: accounts[1]?.code || '3-1-01-01',
        Debe: 0,
        Haber: 5000000,
        RutAuxiliar: '',
        NombreAuxiliar: '',
        GlosaLinea: 'Capital Pagado',
        RefDTE: '',
        CentroCosto: '',
        RefBancaria: '',
        FechaVencimiento: '',
        ItemGasto: '',
        Proyecto: '',
        Producto: '',
        ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
      },
      {
        NumComprobante: 2,
        Fecha: '2026-08-05',
        Tipo: 'Egreso',
        GlosaComprobante: 'Pago de Arriendo Oficina y Servicios',
        CodigoCuenta: accounts[2]?.code || '4-2-01-01',
        Debe: 650000,
        Haber: 0,
        RutAuxiliar: '76.123.456-7',
        NombreAuxiliar: 'INMOBILIARIA CENTRAL SPA',
        GlosaLinea: 'Gasto Arriendo Casa Matriz',
        RefDTE: 'FAC 102',
        CentroCosto: 'ADMINISTRACION',
        RefBancaria: 'TRF 98231',
        FechaVencimiento: '2026-08-10',
        ItemGasto: 'ARRIENDOS',
        Proyecto: 'SEDE CENTRAL',
        Producto: '',
        ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
      },
      {
        NumComprobante: 2,
        Fecha: '2026-08-05',
        Tipo: 'Egreso',
        GlosaComprobante: 'Pago de Arriendo Oficina y Servicios',
        CodigoCuenta: accounts[0]?.code || '1-1-01-01',
        Debe: 0,
        Haber: 650000,
        RutAuxiliar: '76.123.456-7',
        NombreAuxiliar: 'INMOBILIARIA CENTRAL SPA',
        GlosaLinea: 'Transferencia Bancaria Cuenta Corriente',
        RefDTE: 'FAC 102',
        CentroCosto: 'ADMINISTRACION',
        RefBancaria: 'TRF 98231',
        FechaVencimiento: '2026-08-10',
        ItemGasto: '',
        Proyecto: '',
        Producto: '',
        ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comprobantes');
    XLSX.writeFile(workbook, `Plantilla_Carga_Masiva_Comprobantes_${company.name}.xlsx`);
  };

  const handleDownloadCsvTemplate = () => {
    const customCols = company.customAccountColumns || [];
    const customHeaderStr = customCols.length > 0 ? ';' + customCols.join(';') : '';
    const customEmptyStr = customCols.length > 0 ? ';' + customCols.map(() => '').join(';') : '';

    const headers = `NumComprobante;Fecha;Tipo;GlosaComprobante;CodigoCuenta;Debe;Haber;RutAuxiliar;NombreAuxiliar;GlosaLinea;RefDTE;CentroCosto;RefBancaria;FechaVencimiento;ItemGasto;Proyecto;Producto${customHeaderStr}`;
    const sampleRows = [
      `1;2026-08-01;Ingreso;Aporte Inicial de Capital;${accounts[0]?.code || '1-1-01-01'};5000000;0;;;Deposito Bancario Capital;;;Cartola 0826;;;;${customEmptyStr}`,
      `1;2026-08-01;Ingreso;Aporte Inicial de Capital;${accounts[1]?.code || '3-1-01-01'};0;5000000;;;Capital Pagado;;;;;;;${customEmptyStr}`,
      `2;2026-08-05;Egreso;Pago de Arriendo Oficina;${accounts[2]?.code || '4-2-01-01'};650000;0;76.123.456-7;INMOBILIARIA CENTRAL SPA;Gasto Arriendo Casa Matriz;FAC 102;ADMINISTRACION;TRF 98231;2026-08-10;ARRIENDOS;SEDE CENTRAL;${customEmptyStr}`,
      `2;2026-08-05;Egreso;Pago de Arriendo Oficina;${accounts[0]?.code || '1-1-01-01'};0;650000;76.123.456-7;INMOBILIARIA CENTRAL SPA;Transferencia Bancaria Cuenta Corriente;FAC 102;ADMINISTRACION;TRF 98231;2026-08-10;;;${customEmptyStr}`
    ];

    const content = '\uFEFF' + [headers, ...sampleRows].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Plantilla_Carga_Masiva_Comprobantes_${company.name}.csv`;
    link.click();
  };

  // Upload Valid Drafts to Firestore using WriteBatches
  const handleBatchSave = async () => {
    if (isCommitting || loading) return;

    const validDrafts = parsedVouchers.filter(d => d.isValid);
    if (validDrafts.length === 0) {
      alert('⚠️ No hay comprobantes válidos y totalmente cuadrados para importar.');
      return;
    }

    // Validación estricta: Verificar si alguno de los comprobantes a importar pertenece a un período CERRADO
    const closedDrafts: string[] = [];
    for (const draft of validDrafts) {
      const periodStr = (draft.period || draft.date?.substring(0, 7) || '').trim();
      const parts = periodStr.split('-');
      if (parts.length >= 2) {
        const yearStr = parts[0];
        const monthNum = parseInt(parts[1], 10);
        const fy = fiscalYears.find(f => f.id === yearStr);
        if (fy && fy.months?.[monthNum] === 'Cerrado') {
          closedDrafts.push(`Comprobante N° ${draft.voucherNumber} (Período ${periodStr})`);
        }
      }
    }

    if (closedDrafts.length > 0) {
      alert(
        `🔒 ACCIÓN BLOQUEADA POR PERÍODO CERRADO:\n\n` +
        `Se detectaron comprobantes con fecha en períodos contables CERRADOS:\n` +
        closedDrafts.slice(0, 5).join('\n') +
        (closedDrafts.length > 5 ? `\n...y ${closedDrafts.length - 5} más.` : '') +
        `\n\nNo se permite importar o grabar asientos en meses cerrados. Abre los períodos correspondientes en la configuración de la empresa o ajusta las fechas del archivo.`
      );
      return;
    }

    setIsCommitting(true);
    setLoading(true);
    try {
      await withProcess(
        `Guardando ${validDrafts.length} comprobantes en la empresa...`,
        async (updateProgress) => {
          const chunkSize = 400; // Batch chunks below 500 limit
          for (let i = 0; i < validDrafts.length; i += chunkSize) {
            const chunk = validDrafts.slice(i, i + chunkSize);
            const batch = writeBatch(db);

            chunk.forEach((draft, idx) => {
              const currentNum = i + idx + 1;
              updateProgress({
                current: currentNum,
                total: validDrafts.length,
                message: `Procesando comprobante N° ${draft.voucherNumber} (${currentNum}/${validDrafts.length})`,
                stage: `${draft.type}: ${draft.gloss}`
              });

              // Sanitize lines so no `undefined` field values break Firestore setDoc
              const sanitizedLines: VoucherLine[] = draft.lines.map((l, lIndex) => ({
                id: `line_${lIndex + 1}_${Date.now()}`,
                accountId: String(l.accountId || '').trim(),
                accountCode: String(l.accountCode || '').trim(),
                accountName: String(l.accountName || '').trim(),
                debit: typeof l.debit === 'number' && !isNaN(l.debit) ? l.debit : 0,
                credit: typeof l.credit === 'number' && !isNaN(l.credit) ? l.credit : 0,
                auxiliaryRut: String(l.auxiliaryRut || '').trim(),
                auxiliaryName: String(l.auxiliaryName || '').trim(),
                documentRef: String(l.documentRef || '').trim(),
                costCenter: String(l.costCenter || '').trim(),
                bankDocRef: String(l.bankDocRef || '').trim(),
                dueDate: String(l.dueDate || '').trim(),
                expenseItem: String(l.expenseItem || '').trim(),
                project: String(l.project || '').trim(),
                product: String(l.product || '').trim(),
                customAnalyses: l.customAnalyses || {},
                gloss: String(l.gloss || draft.gloss || '').trim()
              }));

              const cleanedLines = sanitizeVoucherLines(sanitizedLines, accounts);

              const voucherDocRef = doc(collection(companyRef, 'vouchers'));
              const nowIso = new Date().toISOString();
              const userUid = auth.currentUser?.uid || 'carga-masiva';
              const userEmail = auth.currentUser?.email || '';

              const voucherData = {
                voucherNumber: Number(draft.voucherNumber),
                date: String(draft.date || '').trim() || new Date().toISOString().split('T')[0],
                period: String(draft.period || '').trim() || new Date().toISOString().slice(0, 7),
                type: (['Ingreso', 'Egreso', 'Traspaso'].includes(draft.type) ? draft.type : 'Traspaso'),
                gloss: String(draft.gloss || 'Comprobante Importado').trim(),
                lines: cleanedLines,
                totalDebit: Number(draft.totalDebit) || 0,
                totalCredit: Number(draft.totalCredit) || 0,
                status: 'Valido',
                createdBy: userUid,
                createdByUserEmail: userEmail,
                creationMode: 'IMPORTACION_RCV',
                createdAt: nowIso,
                lastModifiedBy: userUid,
                lastModifiedAt: nowIso
              };

              batch.set(voucherDocRef, voucherData);
            });

            await batch.commit();
          }
        }
      );

      // Audit Log registration
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'IMPORTACION_MASIVA',
        module: 'COMPROBANTES',
        details: `Carga masiva de ${validDrafts.length} comprobantes contables en ${company.name}`,
        metadata: {
          fileName: selectedFile?.name,
          totalVouchers: validDrafts.length
        }
      });

      setUploadSuccessCount(validDrafts.length);
      setSelectedFile(null);
      setRawFileRows([]);
      setParsedVouchers([]);
      setFileMetadata(null);

      alert(`✅ ¡Éxito! Se contabilizaron correctamente ${validDrafts.length} comprobantes en la empresa.`);
      if (onVouchersUpdated) {
        onVouchersUpdated();
      }
    } catch (err: any) {
      console.error('Error en carga masiva:', err);
      alert('❌ Error durante el guardado de comprobantes: ' + err.message);
    } finally {
      setLoading(false);
      setIsCommitting(false);
    }
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    setFileMetadata(null);
    setRawFileRows([]);
    setParsedVouchers([]);
    setMissingAccountCodes([]);
    setUploadSuccessCount(null);
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Carga Masiva de Vouchers por Archivo
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Importación oficial por archivo Excel (.xlsx, .xls) o CSV con verificación de partida doble y validación contra el Plan de Cuentas ({company.name})
          </p>
        </div>

        {/* Template Downloads */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadExcelTemplate}
            className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5"
          >
            <span>📊</span>
            <span>Plantilla Excel (.xlsx)</span>
          </button>
          <button
            onClick={handleDownloadCsvTemplate}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Plantilla CSV</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {uploadSuccessCount !== null && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <h4 className="font-bold text-sm">¡Comprobantes Importados Exitosamente!</h4>
              <p className="text-xs text-emerald-700">
                Se guardaron {uploadSuccessCount} comprobantes contables en los libros de la empresa.
              </p>
            </div>
          </div>
          <button
            onClick={() => setUploadSuccessCount(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold underline"
          >
            Cerrar aviso
          </button>
        </div>
      )}

      {/* FILE UPLOAD ZONE (When no file loaded yet) */}
      {!selectedFile ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-700">
                Importación de Archivo de Comprobantes
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Seleccione o arrastre un archivo (.xlsx, .xls, .csv, .txt) para iniciar la importación masiva.
              </p>
            </div>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              id="voucher-file-input"
              accept=".csv, .xlsx, .xls, .txt"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <label htmlFor="voucher-file-input" className="cursor-pointer block space-y-3">
              <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-2xl shadow-xs">
                📁
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Haga clic para seleccionar o arrastre su archivo aquí
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Formatos soportados: <span className="font-semibold text-slate-700">Excel (.xlsx, .xls), CSV (.csv) o Texto (.txt)</span>
                </p>
              </div>
              <div className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors">
                Examinar Archivo
              </div>
            </label>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5 text-slate-600">
            <p className="font-bold text-slate-800 flex items-center gap-1">
              <span>💡</span> Estructura Recomendada de Columnas en el Archivo:
            </p>
            <p className="font-mono text-[11px] bg-white p-2 rounded border border-slate-200 overflow-x-auto text-slate-700">
              NumComprobante | Fecha (YYYY-MM-DD) | Tipo (Ingreso/Egreso/Traspaso) | GlosaComprobante | CodigoCuenta | Debe | Haber | RutAuxiliar | NombreAuxiliar | GlosaLinea | RefDTE
            </p>
            <p className="text-[11px] text-indigo-800 font-medium">
              🛡️ <strong>Evite duplicados de Folio:</strong> El sistema re-numerará automáticamente los folios comenzando desde el correlativo siguiente (N° {maxExistingNum + 1}) o le permitirá mantener los del archivo.
            </p>
          </div>
        </div>
      ) : (
        /* FILE ACTIVE CARD & STATUS */
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold text-lg">
                📊
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-900">{fileMetadata?.name}</h4>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-mono text-[10px] font-bold">
                    {fileMetadata?.size}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {fileMetadata?.rowCount} filas procesadas ({parsedVouchers.length} asientos contables identificados)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => validateMatrixData(rawFileRows, renumberMode)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                title="Re-validar asientos contra el Plan de Cuentas actual"
              >
                <span>🔄</span>
                <span>Re-Validar</span>
              </button>
              <button
                onClick={handleResetFile}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors"
              >
                Cargar Otro Archivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENUMBERING MODE SELECTOR & CONFIG */}
      {selectedFile && parsedVouchers.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm">🔢</span>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                Asignación de Folios de Comprobantes
              </h4>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Último folio registrado en la empresa: <strong className="text-indigo-700 font-bold">N° {maxExistingNum}</strong>
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-300 shadow-xs">
            <button
              onClick={() => setRenumberMode('auto')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                renumberMode === 'auto'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>⚡</span>
              <span>Auto-numerar (Correlativo N° {maxExistingNum + 1})</span>
            </button>
            <button
              onClick={() => setRenumberMode('keep')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                renumberMode === 'keep'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📄</span>
              <span>Mantener N° de Archivo</span>
            </button>
          </div>
        </div>
      )}

      {/* MISSING CONFIGURATION / ACCOUNTS WARNING BANNER */}
      {missingAccountCodes.length > 0 && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-2xl">⚠️</span>
              <div>
                <h4 className="font-black text-amber-900 text-xs uppercase tracking-wide">
                  Falta Configuración: Cuentas Inexistentes en Plan de Cuentas ({missingAccountCodes.length})
                </h4>
                <p className="text-xs text-amber-800 mt-1">
                  El archivo contiene códigos de cuenta que aún no están creados en el Plan de Cuentas de la empresa.
                  Puede ingresar al Plan de Cuentas, crear o configurar las cuentas faltantes y luego volver a esta pestaña y presionar <strong>"Re-Validar"</strong> para procesar nuevamente los comprobantes.
                </p>
              </div>
            </div>

            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('accounts')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
              >
                <span>⚙️</span>
                <span>Ir al Plan de Cuentas</span>
              </button>
            )}
          </div>

          <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
            <span className="text-[11px] font-bold text-amber-900 block mb-1">
              Códigos de cuentas faltantes por configurar:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {missingAccountCodes.map(code => (
                <span
                  key={code}
                  className="px-2 py-0.5 bg-amber-200/80 text-amber-900 font-mono text-xs font-bold rounded border border-amber-300"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PARSED VOUCHERS PREVIEW & VALIDATION TABLE */}
      {parsedVouchers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4">
          <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                  Vista Previa y Validación de Comprobantes ({parsedVouchers.length} asientos)
                </h4>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ {parsedVouchers.filter(v => v.isValid).length} Válidos y Cuadrados
                </span>
                {parsedVouchers.filter(v => !v.isValid).length > 0 && (
                  <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    ⚠️ {parsedVouchers.filter(v => !v.isValid).length} Con Errores
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchSave}
                disabled={loading || isCommitting || parsedVouchers.filter(v => v.isValid).length === 0}
                className={`px-5 py-2 text-xs font-black rounded-lg shadow-sm transition-all flex items-center gap-2 ${
                  loading || isCommitting || parsedVouchers.filter(v => v.isValid).length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                }`}
              >
                <span>💾</span>
                <span>
                  {loading || isCommitting
                    ? 'Guardando...'
                    : `Guardar ${parsedVouchers.filter(v => v.isValid).length} Comprobantes Válidos`}
                </span>
              </button>
            </div>
          </div>

          {/* List of Draft Vouchers */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {parsedVouchers.map(v => (
              <div
                key={v.tempId}
                className={`p-3 rounded-xl border text-xs font-mono transition-all ${
                  v.isValid
                    ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                    : 'bg-rose-50/50 border-rose-300 hover:border-rose-400'
                }`}
              >
                {/* Voucher Header */}
                <div className="flex justify-between items-center border-b pb-2 mb-2 font-sans flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Asiento N° {v.voucherNumber}
                    </span>
                    {renumberMode === 'auto' && v.originalFileNumber > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        (Original archivo: #{v.originalFileNumber})
                      </span>
                    )}
                    <span className="text-slate-600 font-mono text-xs">{v.date}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      v.type === 'Ingreso' ? 'bg-emerald-100 text-emerald-800' :
                      v.type === 'Egreso' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {v.type}
                    </span>
                    <span className="text-slate-900 font-semibold max-w-md truncate">{v.gloss}</span>
                  </div>

                  <div>
                    {v.isValid ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg font-bold text-[11px] border border-emerald-300 flex items-center gap-1">
                        <span>✓</span> Cuadrado (${v.totalDebit.toLocaleString('es-CL')})
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        {v.errors.map((err, errIdx) => (
                          <span
                            key={errIdx}
                            className="px-2.5 py-0.5 bg-rose-100 text-rose-900 rounded font-bold text-[10px] border border-rose-300"
                          >
                            ⚠️ {err}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lines Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-200">
                        <th className="py-1.5 px-2 w-28">Código Cuenta</th>
                        <th className="py-1.5 px-2 w-56">Nombre Cuenta Contable</th>
                        <th className="py-1.5 px-2">Análisis Contables / Atributos</th>
                        <th className="py-1.5 px-2">Detalle Línea</th>
                        <th className="py-1.5 px-2 text-right w-28">Debe ($)</th>
                        <th className="py-1.5 px-2 text-right w-28">Haber ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {v.lines.map((l, lIdx) => {
                        const hasErrors = l.requiredErrors && l.requiredErrors.length > 0;
                        return (
                          <tr
                            key={lIdx}
                            className={
                              l.isAccountMissing
                                ? 'bg-amber-100/60 font-medium'
                                : hasErrors
                                ? 'bg-rose-50/70 font-medium'
                                : ''
                            }
                          >
                            <td className="py-1 px-2 font-bold text-slate-800">
                              {l.accountCode}
                            </td>
                            <td className="py-1 px-2 font-sans">
                              {l.isAccountMissing ? (
                                <span className="text-amber-900 font-bold flex items-center gap-1">
                                  <span>❌</span> {l.accountName}
                                </span>
                              ) : (
                                <div>
                                  <span className="text-slate-800 font-semibold">{l.accountName}</span>
                                  {hasErrors && (
                                    <div className="text-[10px] text-rose-700 font-bold mt-0.5 space-y-0.5">
                                      {l.requiredErrors!.map((err, ei) => (
                                        <div key={ei} className="flex items-center gap-1">
                                          <span>⚠️</span> {err}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-1 px-2 text-slate-600 font-sans">
                              <div className="flex flex-wrap items-center gap-1">
                                {l.auxiliaryRut ? (
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[10px] font-mono border border-slate-200">
                                    👤 {l.auxiliaryRut} {l.auxiliaryName ? `(${l.auxiliaryName})` : ''}
                                  </span>
                                ) : null}
                                {l.documentRef ? (
                                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded text-[10px] font-mono border border-blue-200">
                                    📄 {l.documentRef}
                                  </span>
                                ) : null}
                                {l.costCenter ? (
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded text-[10px] font-mono border border-amber-200">
                                    🏢 CC: {l.costCenter}
                                  </span>
                                ) : null}
                                {l.bankDocRef ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-mono border border-emerald-200">
                                    🏦 {l.bankDocRef}
                                  </span>
                                ) : null}
                                {l.dueDate ? (
                                  <span className="px-1.5 py-0.5 bg-purple-50 text-purple-800 rounded text-[10px] font-mono border border-purple-200">
                                    📅 Vto: {l.dueDate}
                                  </span>
                                ) : null}
                                {l.expenseItem ? (
                                  <span className="px-1.5 py-0.5 bg-orange-50 text-orange-800 rounded text-[10px] font-mono border border-orange-200">
                                    🏷️ Gasto: {l.expenseItem}
                                  </span>
                                ) : null}
                                {l.project ? (
                                  <span className="px-1.5 py-0.5 bg-teal-50 text-teal-800 rounded text-[10px] font-mono border border-teal-200">
                                    🏗️ Proy: {l.project}
                                  </span>
                                ) : null}
                                {l.product ? (
                                  <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-800 rounded text-[10px] font-mono border border-indigo-200">
                                    📦 Prod: {l.product}
                                  </span>
                                ) : null}
                                {l.customAnalyses && Object.entries(l.customAnalyses).map(([k, vVal]) => (
                                  <span key={k} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-mono border border-slate-200">
                                    ⚙️ {k}: {vVal}
                                  </span>
                                ))}
                                {!l.auxiliaryRut && !l.documentRef && !l.costCenter && !l.bankDocRef && !l.dueDate && !l.expenseItem && !l.project && !l.product && (!l.customAnalyses || Object.keys(l.customAnalyses).length === 0) && (
                                  <span className="text-slate-400 text-[10px]">-</span>
                                )}
                              </div>
                            </td>
                            <td className="py-1 px-2 text-slate-500 font-sans">{l.gloss}</td>
                            <td className="py-1 px-2 text-right text-emerald-700 font-bold">
                              {l.debit > 0 ? `$${l.debit.toLocaleString('es-CL')}` : '-'}
                            </td>
                            <td className="py-1 px-2 text-right text-rose-700 font-bold">
                              {l.credit > 0 ? `$${l.credit.toLocaleString('es-CL')}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-300 font-bold bg-slate-100/60 text-slate-900">
                        <td colSpan={4} className="py-1 px-2 text-right font-sans">Totales:</td>
                        <td className="py-1 px-2 text-right text-emerald-800">${v.totalDebit.toLocaleString('es-CL')}</td>
                        <td className="py-1 px-2 text-right text-rose-800">${v.totalCredit.toLocaleString('es-CL')}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
