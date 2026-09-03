import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { BankStatementLine } from '../types';

export interface BankCartolaParsedResult {
  detectedBank: string;
  detectedPeriod: string;
  previousBalance: number;
  finalBalance: number;
  calculatedFinalBalance: number;
  isBalanceConsistent: boolean;
  totalCharges: number;
  totalDeposits: number;
  chargesCount: number;
  depositsCount: number;
  newLines: BankStatementLine[];
  duplicateCount: number;
  existingLinesCount: number;
}

export interface BankTemplateDef {
  id: string;
  name: string;
  codeKeywords: string[];
}

export const KNOWN_CHILEAN_BANKS: BankTemplateDef[] = [
  { id: 'AUTO', name: 'Auto-Detección Inteligente (Cualquier Banco)', codeKeywords: [] },
  { id: 'BANCO_ESTADO', name: 'BancoEstado (Cuenta Corriente / Chequera Electrónica / RUT)', codeKeywords: ['bancoestado', 'banco estado', 'cuenta rut'] },
  { id: 'BANCO_CHILE', name: 'Banco de Chile / Banco Edwards', codeKeywords: ['banco de chile', 'banco edwards', 'bancochile'] },
  { id: 'SANTANDER', name: 'Banco Santander Chile', codeKeywords: ['santander', 'santander banefe'] },
  { id: 'BCI', name: 'Banco BCI (Banco de Crédito e Inversiones)', codeKeywords: ['bci', 'banco de credito e inversiones'] },
  { id: 'SCOTIABANK', name: 'Scotiabank Chile', codeKeywords: ['scotiabank', 'scotia'] },
  { id: 'ITAU', name: 'Itaú Corpbanca', codeKeywords: ['itau', 'corpbanca'] },
  { id: 'BANCO_BICE', name: 'Banco BICE', codeKeywords: ['bice'] },
  { id: 'BANCO_SECURITY', name: 'Banco Security', codeKeywords: ['security'] },
  { id: 'TRANSBANK', name: 'Transbank / Redcompra / Webpay', codeKeywords: ['transbank', 'webpay', 'redcompra'] }
];

/**
 * Normalizes number from string with Chilean / International format (CLP rounded integers)
 */
export function parseChileanNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  if (!val) return 0;
  let str = String(val).trim().replace(/\$/g, '').replace(/CLP/gi, '').trim();
  if (!str) return 0;
  
  // Format: 1.234.567 or -1.234.567 or (1.234.567) or 1234567 or 1.234.567,89
  const isNegative = (str.includes('(') && str.includes(')')) || str.startsWith('-') || str.endsWith('-');
  str = str.replace(/[()\-+]/g, '').trim();
  
  if (str.includes('.') && str.includes(',')) {
    // 1.234.567,89 -> remove dots, replace comma with dot
    str = str.replace(/\./g, '').replace(/,/g, '.');
  } else if (str.includes(',')) {
    // Check if comma is thousands or decimals
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      str = parts[0].replace(/\./g, '') + '.' + parts[1];
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // 1.234.567 or 1.250 -> thousands separator
      str = str.replace(/\./g, '');
    }
  }
  
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  const rounded = Math.round(num);
  return isNegative ? -Math.abs(rounded) : rounded;
}

/**
 * Normalizes Excel date or string date to YYYY-MM-DD
 */
export function normalizeDate(val: any, fallbackPeriod: string): string {
  if (!val) return `${fallbackPeriod}-01`;
  
  // Excel Serial date number
  if (typeof val === 'number') {
    const utc_days = Math.floor(val - 25569);
    const date_info = new Date(utc_days * 86400 * 1000);
    const y = date_info.getUTCFullYear();
    const m = String(date_info.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date_info.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  
  // DD/MM/YYYY or DD-MM-YYYY
  const slashParts = str.split(/[\/\-]/);
  if (slashParts.length === 3) {
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[2].length === 2) {
      return `20${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
  }
  
  return `${fallbackPeriod}-01`;
}

/**
 * Creates unique deterministic fingerprint for a bank statement line to detect duplicates
 */
export function createLineFingerprint(line: { date: string; description: string; charge: number; deposit: number; documentNumber?: string }): string {
  const normDesc = (line.description || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const doc = (line.documentNumber || '').trim().toUpperCase();
  const chg = Math.round(line.charge || 0);
  const dep = Math.round(line.deposit || 0);
  return `${line.date}|${chg}|${dep}|${normDesc}|${doc}`;
}

/**
 * Universal Intelligent Bank Statement Parser (Excel / CSV / Paste)
 */
export function parseBankCartola(
  rawMatrix: any[][],
  selectedPeriod: string,
  selectedBankId: string,
  existingLines: BankStatementLine[] = [],
  manualInitialBalance?: number
): BankCartolaParsedResult {
  let detectedBank = 'Banco Nacional / Cartola Estándar';
  if (selectedBankId && selectedBankId !== 'AUTO') {
    const found = KNOWN_CHILEAN_BANKS.find(b => b.id === selectedBankId);
    if (found) detectedBank = found.name;
  }
  
  // Search headers or metadata in the top rows
  let headerRowIdx = -1;
  let dateColIdx = -1;
  let descColIdx = -1;
  let docColIdx = -1;
  let chargeColIdx = -1;
  let depositColIdx = -1;
  let balanceColIdx = -1;
  let amountSingleColIdx = -1;

  let headerInitialBal: number | null = null;
  let headerFinalBal: number | null = null;

  // Scan top 30 rows for metadata (Bank Name, Initial Balance, Final Balance, Period)
  for (let r = 0; r < Math.min(rawMatrix.length, 30); r++) {
    const row = rawMatrix[r] || [];
    const rowText = row.map(c => String(c || '').trim()).join(' ').toLowerCase();

    // Bank detection
    if (selectedBankId === 'AUTO') {
      for (const b of KNOWN_CHILEAN_BANKS) {
        if (b.codeKeywords.some(kw => rowText.includes(kw))) {
          detectedBank = b.name;
          break;
        }
      }
    }

    // Balance detection in header
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || '').toLowerCase().trim();
      if (cellText.includes('saldo anterior') || cellText.includes('saldo inicial') || cellText.includes('saldo apertura')) {
        const nextVal = row[c + 1] !== undefined ? row[c + 1] : row[c + 2];
        const parsed = parseChileanNumber(nextVal);
        if (parsed !== 0 || String(nextVal).includes('0')) headerInitialBal = parsed;
      }
      if (cellText.includes('saldo final') || cellText.includes('saldo actual') || cellText.includes('saldo cierre')) {
        const nextVal = row[c + 1] !== undefined ? row[c + 1] : row[c + 2];
        const parsed = parseChileanNumber(nextVal);
        if (parsed !== 0 || String(nextVal).includes('0')) headerFinalBal = parsed;
      }
    }

    // Column detection
    const colMatches = row.map((cell, cIdx) => {
      const txt = String(cell || '').toLowerCase().trim();
      return { txt, cIdx };
    });

    const hasDate = colMatches.some(m => m.txt === 'fecha' || m.txt === 'fec' || m.txt.includes('fecha mov') || m.txt.includes('f. operacion') || m.txt.includes('f. proceso'));
    const hasDesc = colMatches.some(m => m.txt === 'descripcion' || m.txt === 'detalle' || m.txt === 'glosa' || m.txt === 'concepto' || m.txt === 'movimiento');
    const hasAmount = colMatches.some(m => m.txt === 'cargo' || m.txt === 'abono' || m.txt === 'monto' || m.txt === 'cargos' || m.txt === 'abonos' || m.txt === 'debe' || m.txt === 'haber' || m.txt === 'saldo');

    if (hasDate && (hasDesc || hasAmount)) {
      headerRowIdx = r;
      colMatches.forEach(m => {
        if (m.txt === 'fecha' || m.txt === 'fec' || m.txt.includes('fecha mov') || m.txt.includes('f. operacion') || m.txt.includes('f. proceso')) dateColIdx = m.cIdx;
        else if (m.txt === 'descripcion' || m.txt === 'detalle' || m.txt === 'glosa' || m.txt === 'concepto' || m.txt === 'movimiento' || m.txt === 'transaccion') descColIdx = m.cIdx;
        else if (m.txt.includes('doc') || m.txt.includes('cheque') || m.txt.includes('comprobante') || m.txt === 'n°' || m.txt === 'n° doc') docColIdx = m.cIdx;
        else if (m.txt === 'cargo' || m.txt === 'cargos' || m.txt === 'debe' || m.txt === 'egreso' || m.txt === 'retiro' || m.txt === 'debitos') chargeColIdx = m.cIdx;
        else if (m.txt === 'abono' || m.txt === 'abonos' || m.txt === 'haber' || m.txt === 'ingreso' || m.txt === 'deposito' || m.txt === 'creditos') depositColIdx = m.cIdx;
        else if (m.txt === 'saldo' || m.txt === 'saldo final' || m.txt === 'saldo linea' || m.txt === 'balance') balanceColIdx = m.cIdx;
        else if (m.txt === 'monto' || m.txt === 'importe' || m.txt === 'valor') amountSingleColIdx = m.cIdx;
      });
      break;
    }
  }

  // Fallback heuristic if no explicit header row was detected
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  if (dateColIdx === -1) dateColIdx = 0;
  if (descColIdx === -1) descColIdx = 1;
  if (chargeColIdx === -1 && depositColIdx === -1 && amountSingleColIdx === -1) {
    // If 4 columns: Fecha, Desc, Cargo, Abono
    // If 5 columns: Fecha, Desc, NDoc, Cargo, Abono
    // If 6 columns: Fecha, Desc, NDoc, Cargo, Abono, Saldo
    if (rawMatrix[startRow]?.length === 3) {
      amountSingleColIdx = 2;
    } else if (rawMatrix[startRow]?.length === 4) {
      chargeColIdx = 2;
      depositColIdx = 3;
    } else if (rawMatrix[startRow]?.length >= 5) {
      docColIdx = 2;
      chargeColIdx = 3;
      depositColIdx = 4;
      if (rawMatrix[startRow]?.length >= 6) balanceColIdx = 5;
    }
  }

  // Existing lines fingerprints for exact duplicate detection
  const existingFingerprints = new Set<string>();
  existingLines.forEach(l => {
    existingFingerprints.add(createLineFingerprint(l));
  });

  const parsedRawLines: {
    date: string;
    description: string;
    documentNumber: string;
    charge: number;
    deposit: number;
    balance: number | null;
  }[] = [];

  let duplicateCount = 0;

  for (let r = startRow; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!row || row.length === 0) continue;

    const rawDate = row[dateColIdx];
    const rawDesc = descColIdx >= 0 ? row[descColIdx] : '';
    
    // Ignore summary or footer rows
    const rowStr = row.join(' ').toLowerCase();
    if (
      rowStr.includes('totales') ||
      rowStr.includes('total cargos') ||
      rowStr.includes('total abonos') ||
      rowStr.includes('saldo final') && rawDate === undefined
    ) {
      continue;
    }

    if (!rawDate && !rawDesc) continue;

    const date = normalizeDate(rawDate, selectedPeriod);
    const description = String(rawDesc || 'MOVIMIENTO BANCARIO').trim().replace(/\s+/g, ' ');
    const documentNumber = docColIdx >= 0 && row[docColIdx] !== undefined ? String(row[docColIdx]).trim() : '';

    let charge = 0;
    let deposit = 0;
    let explicitBalance: number | null = null;

    if (chargeColIdx >= 0 && depositColIdx >= 0 && chargeColIdx !== depositColIdx) {
      // Distinct separate columns for Cargos and Abonos
      const rawChg = row[chargeColIdx];
      const rawDep = row[depositColIdx];
      charge = Math.abs(parseChileanNumber(rawChg));
      deposit = Math.abs(parseChileanNumber(rawDep));
    } else {
      // Single amount column (or signed column)
      const targetColIdx = chargeColIdx >= 0 ? chargeColIdx : (depositColIdx >= 0 ? depositColIdx : amountSingleColIdx);
      if (targetColIdx >= 0) {
        const val = parseChileanNumber(row[targetColIdx]);
        if (val < 0) {
          charge = Math.abs(val); // Negativo es Cargo bancario
          deposit = 0;
        } else if (val > 0) {
          deposit = val; // Positivo es Abono bancario
          charge = 0;
        }
      }
    }

    if (balanceColIdx >= 0 && row[balanceColIdx] !== undefined) {
      explicitBalance = parseChileanNumber(row[balanceColIdx]);
    }

    if (charge === 0 && deposit === 0 && explicitBalance === null) continue;

    // Check duplicate against existing
    const fp = createLineFingerprint({ date, description, charge, deposit, documentNumber });
    if (existingFingerprints.has(fp)) {
      duplicateCount++;
      continue; // Skip duplicate line, inject only pending
    }

    parsedRawLines.push({
      date,
      description,
      documentNumber,
      charge,
      deposit,
      balance: explicitBalance
    });
  }

  // Sort lines chronologically
  parsedRawLines.sort((a, b) => a.date.localeCompare(b.date));

  // Determine Previous Balance (Saldo Anterior)
  let previousBalance = 0;
  if (manualInitialBalance !== undefined && !isNaN(manualInitialBalance)) {
    previousBalance = manualInitialBalance;
  } else if (headerInitialBal !== null) {
    previousBalance = headerInitialBal;
  } else if (parsedRawLines.length > 0 && parsedRawLines[0].balance !== null) {
    // Deduce previous balance from first line's balance: Balance_0 = Prev + Dep - Chg => Prev = Balance_0 - Dep + Chg
    const first = parsedRawLines[0];
    previousBalance = (first.balance || 0) - first.deposit + first.charge;
  }

  // Calculate progressive balances
  let runningBal = previousBalance;
  let totalCharges = 0;
  let totalDeposits = 0;
  let chargesCount = 0;
  let depositsCount = 0;

  const newLines: BankStatementLine[] = parsedRawLines.map((p, idx) => {
    totalCharges += p.charge;
    totalDeposits += p.deposit;
    if (p.charge > 0) chargesCount++;
    if (p.deposit > 0) depositsCount++;

    runningBal += p.deposit - p.charge;

    return {
      id: `cartola_${Date.now()}_${idx}`,
      date: p.date,
      description: p.description,
      documentNumber: p.documentNumber,
      charge: p.charge,
      deposit: p.deposit,
      balance: p.balance !== null ? p.balance : runningBal,
      matchedStatus: 'Pendiente'
    };
  });

  const calculatedFinalBalance = runningBal;
  const finalBalance = headerFinalBal !== null ? headerFinalBal : calculatedFinalBalance;
  const isBalanceConsistent = Math.abs(calculatedFinalBalance - finalBalance) < 1;

  return {
    detectedBank,
    detectedPeriod: selectedPeriod,
    previousBalance,
    finalBalance,
    calculatedFinalBalance,
    isBalanceConsistent,
    totalCharges,
    totalDeposits,
    chargesCount,
    depositsCount,
    newLines,
    duplicateCount,
    existingLinesCount: existingLines.length
  };
}
