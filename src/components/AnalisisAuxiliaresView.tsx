import React, { useState, useMemo } from 'react';
import { Company, ChartOfAccount, Auxiliary, RCVDocument, Voucher, FiscalPeriodYear } from '../types';
import { generateSIIReportPDF } from '../utils/pdfGenerator';

interface AnalisisAuxiliaresViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
}

export interface DocumentMovement {
  id: string;
  date: string;
  voucherNumber: number | string;
  voucherType: string;
  gloss: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface AuxiliaryDocumentItem {
  id: string;
  docType: string;
  docNumber: string;
  accountCode: string;
  accountName: string;
  issueDate: string;
  totalDebits: number;
  totalCredits: number;
  balance: number; // Saldo calculado según naturaleza
  status: 'Saldado' | 'Pendiente' | 'Parcial';
  movements: DocumentMovement[];
}

export interface AuxiliaryGroup {
  rut: string;
  cleanRut: string;
  name: string;
  accountCodes: string[];
  totalDebits: number;
  totalCredits: number;
  balance: number;
  status: 'Saldado' | 'Pendiente';
  documents: AuxiliaryDocumentItem[];
}

const cleanRut = (rut: string): string => {
  if (!rut) return '';
  return rut.trim().toLowerCase().replace(/[^0-9k]/g, '');
};

/**
 * Normaliza texto eliminando acentos/tildes y espacios extra en minúsculas
 */
const normalizeText = (str: string): string => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Evalúa con alta precisión si un auxiliar (por RUT formateado, RUT limpio o Nombre/Razón Social)
 * coincide con el término de búsqueda ingresado por el usuario.
 */
function matchesAuxiliarySearch(
  rut: string,
  cRut: string,
  auxName: string,
  searchTerm: string
): boolean {
  if (!searchTerm || !searchTerm.trim()) return true;

  const rawTerm = searchTerm.trim();
  const normTerm = normalizeText(rawTerm);
  if (!normTerm) return true;

  const normName = normalizeText(auxName || '');
  const normRut = normalizeText(rut || '');

  // 1. Coincidencia directa por Nombre o Razón Social
  if (normName && normName.includes(normTerm)) {
    return true;
  }

  // 2. Coincidencia por múltiples palabras del Nombre (ej. "alfa metales" en "ALFA METALES SPA")
  const searchWords = normTerm.split(/\s+/).filter(w => w.length > 0);
  if (searchWords.length > 1 && normName) {
    const allWordsMatch = searchWords.every(word => normName.includes(word));
    if (allWordsMatch) return true;
  }

  // 3. Coincidencia por RUT textual o formateado (ej. "77.044.205-2" o "77.044")
  if (normRut && normRut.includes(normTerm)) {
    return true;
  }

  // 4. Coincidencia por dígitos de RUT limpios
  // CRÍTICO: Solo se evalúa si el término ingresado contiene dígitos
  // Si el usuario escribe solo texto (como "alfa metales spa"), termDigits no contiene dígitos
  // y por ende NO debe coincidir falsamente con todos los RUTs.
  const termDigits = rawTerm.replace(/[^0-9kK]/g, '').toLowerCase();
  const hasDigits = /[0-9]/.test(termDigits);
  if (hasDigits && termDigits.length >= 2 && cRut && cRut.includes(termDigits)) {
    return true;
  }

  return false;
}

/**
 * Intelligent Document Reference Parser
 * Extracts Document Type (e.g. 33, 34, 39, 56, 61, BHE, OTRO/9999) and Document Number
 */
function parseDocRef(refStr: string, defaultVoucherNum?: number | string): { docType: string; docNumber: string } {
  const clean = (refStr || '').trim();
  if (!clean) {
    return { docType: '9999', docNumber: defaultVoucherNum ? String(defaultVoucherNum) : 'S/N' };
  }

  // Explicit OTRO or 9999
  if (clean.toUpperCase().includes('OTRO') || clean.includes('9999')) {
    const digits = clean.replace(/[^0-9]/g, '');
    return { docType: '9999', docNumber: digits || clean.replace(/^(OTRO|9999)[\s#\-N°]*/i, '') || String(defaultVoucherNum || '1') };
  }

  const dteTypeMatch = clean.match(/(?:tipo\s*doc|doc|dte|nc|nd)?\s*\b(33|34|39|41|46|56|61|110)\b/i);
  let docType = '9999';
  if (dteTypeMatch) {
    docType = dteTypeMatch[1];
  } else if (/factura\s*exenta/i.test(clean) || /fe\b/i.test(clean)) {
    docType = '34';
  } else if (/factura/i.test(clean) || /fac\b/i.test(clean)) {
    docType = '33';
  } else if (/boleta\s*honorario/i.test(clean) || /\bbhe\b/i.test(clean) || /\bbhr\b/i.test(clean)) {
    docType = 'BHE';
  } else if (/boleta/i.test(clean) || /bol\b/i.test(clean)) {
    docType = '39';
  } else if (/nota\s*de?\s*cr[eé]dito/i.test(clean) || /\bnc\b/i.test(clean)) {
    docType = '61';
  } else if (/nota\s*de?\s*d[eé]bito/i.test(clean) || /\bnd\b/i.test(clean)) {
    docType = '56';
  } else if (/n[oó]mina/i.test(clean)) {
    docType = 'NOMINA';
  }

  const numMatch = clean.match(/(?:n°|#|nº|folio|num|nro\.?|doc\.?)\s*:?\s*(\d+)/i) 
    || clean.match(/\b(\d+)\b(?!.*\b\d+\b)/);

  let docNumber = defaultVoucherNum ? String(defaultVoucherNum) : '1';
  if (numMatch) {
    docNumber = numMatch[1];
  } else {
    const digits = clean.replace(/[^0-9]/g, '');
    if (digits) docNumber = digits;
  }

  return { docType, docNumber };
}

export default function AnalisisAuxiliaresView({
  studyId,
  company,
  accounts,
  auxiliaries,
  rcvDocuments,
  vouchers,
  fiscalYears
}: AnalisisAuxiliaresViewProps) {
  // Category Filter Controls
  const [accountCategory, setAccountCategory] = useState<'todas' | 'activo' | 'pasivo'>('todas');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('todos');
  const [rutSearch, setRutSearch] = useState<string>('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('todos');
  const [docNumberSearch, setDocNumberSearch] = useState<string>('');

  // Balance View Mode: 'soloPendientes' (ocultar saldo $0) vs 'todos' (incluye saldo $0)
  const [balanceFilter, setBalanceFilter] = useState<'soloPendientes' | 'todos'>('soloPendientes');

  // Date Filters
  const [dateFilterMode, setDateFilterMode] = useState<'corte' | 'rango'>('corte');
  const [cutoffDate, setCutoffDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>('2025-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Expanded Auxiliaries and Documents
  const [expandedAuxiliaries, setExpandedAuxiliaries] = useState<{ [rut: string]: boolean }>({});
  const [expandedDocs, setExpandedDocs] = useState<{ [docId: string]: boolean }>({});

  // Account map by ID and Code
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      map.set(a.id, a);
      if (a.code) {
        map.set(a.code, a);
        map.set(a.code.replace(/[^a-zA-Z0-9]/g, ''), a);
      }
    });
    return map;
  }, [accounts]);

  // Auxiliary Map by RUT
  const auxMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(a => {
      if (a.rut) map.set(cleanRut(a.rut), a);
    });
    return map;
  }, [auxiliaries]);

  /**
   * REGLA ESTRICTA 1: Solo cuentas que tienen asignado análisis de auxiliar.
   * Filtra las cuentas que tienen `requiereAuxiliarRUT === true` (o códigos contables auxiliares estándar).
   */
  const isAuxiliaryAccount = (accCode: string, accName: string, accObj?: ChartOfAccount): boolean => {
    const code = (accCode || '').trim();
    const name = (accName || '').toLowerCase();
    const type = (accObj?.type || '').toLowerCase();

    // 1. Descartar explícitamente cuentas de Resultado (Ingresos 4.x / Gastos 5.x)
    if (code.startsWith('4') || code.startsWith('5') || type.includes('ingreso') || type.includes('gasto')) {
      return false;
    }
    // 2. Descartar cuentas de IVA y F29 (1.1.07 / 2.1.03)
    if (code.startsWith('1.1.07') || code.startsWith('2.1.03') || name.includes('iva dé') || name.includes('iva de') || name.includes('iva cr') || name.includes('iva débito') || name.includes('iva crédito')) {
      return false;
    }
    // 3. Si existe el objeto de cuenta, verificar si tiene marcado `requiereAuxiliarRUT`
    if (accObj) {
      if (accObj.requiereAuxiliarRUT) return true;
      // Si explícitamente es false, descartar
      if (accObj.requiereAuxiliarRUT === false) return false;
    }
    // 4. Fallback estándar para cuentas de Clientes / Proveedores / Anticipos / Honorarios
    return (
      code.startsWith('1.1.02') || 
      code.startsWith('1.1.03') || 
      code.startsWith('2.1.01') || 
      code.startsWith('2.1.02') || 
      code.startsWith('2.1.04') ||
      name.includes('cliente') ||
      name.includes('proveedor') ||
      name.includes('honorario') ||
      name.includes('cuenta corriente')
    );
  };

  // Cuentas auxiliares disponibles para el desplegable de filtro
  const availableAuxiliaryAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (acc.estado === 'Inactivo') return false;
      if (!isAuxiliaryAccount(acc.code, acc.name, acc)) return false;

      const code = (acc.code || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();

      if (accountCategory === 'activo') {
        return type.includes('activo') || code.startsWith('1');
      } else if (accountCategory === 'pasivo') {
        return type.includes('pasivo') || code.startsWith('2');
      }
      return true;
    });
  }, [accounts, accountCategory]);

  // Cuenta seleccionada si aplica
  const selectedAccountObj = useMemo(() => {
    if (selectedAccountId === 'todos') return null;
    return accounts.find(a => a.id === selectedAccountId || a.code === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  /**
   * MOTOR PRINCIPAL DE ANÁLISIS DE AUXILIARES AGRUPADO POR RUT
   */
  const auxiliaryGroups = useMemo(() => {
    // Estructura temporal por Auxiliar (RUT)
    interface TempDocBucket {
      docType: string;
      docNumber: string;
      accountCode: string;
      accountName: string;
      movements: DocumentMovement[];
    }

    interface TempAuxBucket {
      rut: string;
      cleanRut: string;
      name: string;
      docsMap: Map<string, TempDocBucket>;
    }

    // Mapa de nombres más completos/precisos por cada RUT (catálogo + comprobantes)
    const bestAuxNameByRut = new Map<string, string>();
    auxiliaries.forEach(a => {
      if (a.rut && a.name && a.name.trim()) {
        const c = cleanRut(a.rut);
        if (c) bestAuxNameByRut.set(c, a.name.trim());
      }
    });
    vouchers.forEach(v => {
      (v.lines || []).forEach(l => {
        if (l.auxiliaryRut && l.auxiliaryName && l.auxiliaryName.trim()) {
          const c = cleanRut(l.auxiliaryRut);
          if (c && !bestAuxNameByRut.has(c)) {
            bestAuxNameByRut.set(c, l.auxiliaryName.trim());
          }
        }
      });
    });

    const auxGroupsMap = new Map<string, TempAuxBucket>();

    const getOrCreateAuxBucket = (rutStr: string, fallbackName?: string): TempAuxBucket => {
      const cRut = cleanRut(rutStr);
      if (!auxGroupsMap.has(cRut)) {
        const auxObj = auxMap.get(cRut);
        const resolvedName = bestAuxNameByRut.get(cRut) || auxObj?.name || fallbackName || rutStr;
        auxGroupsMap.set(cRut, {
          rut: auxObj?.rut || rutStr,
          cleanRut: cRut,
          name: resolvedName,
          docsMap: new Map()
        });
      }
      const bucket = auxGroupsMap.get(cRut)!;
      if (bucket.name === bucket.rut && (fallbackName || bestAuxNameByRut.get(cRut))) {
        bucket.name = bestAuxNameByRut.get(cRut) || fallbackName || bucket.name;
      }
      return bucket;
    };

    // 1. Procesar Comprobantes Contables Oficiales (Vouchers)
    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      const vDate = v.date || '';

      // Filtro de fecha sobre el comprobante
      if (dateFilterMode === 'corte') {
        if (cutoffDate && vDate > cutoffDate) return;
      } else {
        if (startDate && vDate < startDate) return;
        if (endDate && vDate > endDate) return;
      }

      (v.lines || []).forEach((line, lIdx) => {
        if (!line.auxiliaryRut) return;

        const rut = line.auxiliaryRut.trim();
        const cRut = cleanRut(rut);
        if (!cRut) return;

        // Filtro de búsqueda por RUT / Nombre Auxiliar (preciso y sin falsos positivos)
        if (rutSearch) {
          const auxObj = auxMap.get(cRut);
          const auxName = bestAuxNameByRut.get(cRut) || line.auxiliaryName || auxObj?.name || '';
          if (!matchesAuxiliarySearch(rut, cRut, auxName, rutSearch)) {
            return;
          }
        }

        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (debit === 0 && credit === 0) return;

        const lineCode = (line.accountCode || '').trim();
        const cleanLineCode = lineCode.replace(/[^a-zA-Z0-9]/g, '');
        const lineAcc = accountMap.get(line.accountId || '') || accountMap.get(lineCode) || accountMap.get(cleanLineCode);
        const lineName = line.accountName || lineAcc?.name || 'Cuenta Auxiliar';

        // REGLA ESTRICTA 1: Solo cuentas con análisis de auxiliar
        if (!isAuxiliaryAccount(lineCode, lineName, lineAcc)) {
          return;
        }

        // Filtro por cuenta contable seleccionada
        if (selectedAccountObj) {
          if (lineAcc?.id !== selectedAccountObj.id && lineCode !== selectedAccountObj.code) {
            return;
          }
        } else if (accountCategory !== 'todas') {
          const accType = (lineAcc?.type || '').toLowerCase();
          const isActivo = accType.includes('activo') || lineCode.startsWith('1');
          const isPasivo = accType.includes('pasivo') || lineCode.startsWith('2');

          if (accountCategory === 'activo' && !isActivo) return;
          if (accountCategory === 'pasivo' && !isPasivo) return;
        }

        // Parsear referencia de documento
        const parsed = parseDocRef(line.documentRef || '', v.voucherNumber);

        // Filtro de tipo de documento
        if (docTypeFilter !== 'todos') {
          if (docTypeFilter === '9999' && parsed.docType !== '9999' && parsed.docType !== 'OTRO') return;
          if (docTypeFilter !== '9999' && parsed.docType !== docTypeFilter) return;
        }

        // Filtro de número de documento / folio
        if (docNumberSearch && !parsed.docNumber.includes(docNumberSearch.trim())) {
          return;
        }

        const auxBucket = getOrCreateAuxBucket(rut, line.auxiliaryName);
        const docKey = `${parsed.docType}__${parsed.docNumber}__${lineCode}`;

        if (!auxBucket.docsMap.has(docKey)) {
          auxBucket.docsMap.set(docKey, {
            docType: parsed.docType,
            docNumber: parsed.docNumber,
            accountCode: lineCode,
            accountName: lineName,
            movements: []
          });
        }

        auxBucket.docsMap.get(docKey)!.movements.push({
          id: `v_${v.id}_${lIdx}`,
          date: vDate,
          voucherNumber: v.voucherNumber,
          voucherType: v.type,
          gloss: line.gloss || v.gloss || `Comprobante N° ${v.voucherNumber}`,
          accountCode: lineCode,
          accountName: lineName,
          debit,
          credit
        });
      });
    });

    // 2. Construir los Grupos de Auxiliares con sus Documentos y Saldos Reales
    const result: AuxiliaryGroup[] = [];

    auxGroupsMap.forEach((auxBucket) => {
      // Filtro de búsqueda por RUT o Nombre de Auxiliar a nivel de Grupo
      if (rutSearch && !matchesAuxiliarySearch(auxBucket.rut, auxBucket.cleanRut, auxBucket.name, rutSearch)) {
        return;
      }

      const documents: AuxiliaryDocumentItem[] = [];
      const accountCodesSet = new Set<string>();
      let auxTotalDebits = 0;
      let auxTotalCredits = 0;

      auxBucket.docsMap.forEach((docBucket, docKey) => {
        // Ordenar movimientos cronológicamente
        docBucket.movements.sort((a, b) => a.date.localeCompare(b.date));

        const docDebits = docBucket.movements.reduce((sum, m) => sum + m.debit, 0);
        const docCredits = docBucket.movements.reduce((sum, m) => sum + m.credit, 0);

        auxTotalDebits += docDebits;
        auxTotalCredits += docCredits;
        accountCodesSet.add(docBucket.accountCode);

        // Naturaleza de la cuenta para calcular el saldo del documento
        const isActivo = docBucket.accountCode.startsWith('1') || docBucket.accountName.toLowerCase().includes('cliente');
        const rawBalance = isActivo ? (docDebits - docCredits) : (docCredits - docDebits);

        // REGLA: Si debe == haber (o diferencia es 0), saldo es $0 (Saldado)
        const isSaldado = Math.abs(docDebits - docCredits) < 0.01;
        const balance = isSaldado ? 0 : rawBalance;

        let status: 'Saldado' | 'Pendiente' | 'Parcial' = 'Pendiente';
        if (isSaldado) {
          status = 'Saldado';
        } else if (docDebits > 0 && docCredits > 0) {
          status = 'Parcial';
        }

        // Si el filtro es "Solo con Saldo Pendiente", excluimos los documentos con saldo $0
        if (balanceFilter === 'soloPendientes' && isSaldado) {
          return;
        }

        const issueDate = docBucket.movements[0]?.date || '';

        documents.push({
          id: `${auxBucket.cleanRut}_${docKey}`,
          docType: docBucket.docType,
          docNumber: docBucket.docNumber,
          accountCode: docBucket.accountCode,
          accountName: docBucket.accountName,
          issueDate,
          totalDebits: docDebits,
          totalCredits: docCredits,
          balance,
          status,
          movements: docBucket.movements
        });
      });

      // Si no quedan documentos visibles tras los filtros, no mostramos el auxiliar
      if (documents.length === 0) {
        return;
      }

      // Ordenar documentos del auxiliar por fecha
      documents.sort((a, b) => b.issueDate.localeCompare(a.issueDate));

      const isActivoGlobal = Array.from(accountCodesSet).some(c => c.startsWith('1'));
      const auxNetBalance = isActivoGlobal ? (auxTotalDebits - auxTotalCredits) : (auxTotalCredits - auxTotalDebits);
      const isAuxSaldado = Math.abs(auxTotalDebits - auxTotalCredits) < 0.01;

      result.push({
        rut: auxBucket.rut,
        cleanRut: auxBucket.cleanRut,
        name: auxBucket.name,
        accountCodes: Array.from(accountCodesSet),
        totalDebits: auxTotalDebits,
        totalCredits: auxTotalCredits,
        balance: isAuxSaldado ? 0 : auxNetBalance,
        status: isAuxSaldado ? 'Saldado' : 'Pendiente',
        documents
      });
    });

    // Ordenar auxiliares por Razón Social alfabéticamente
    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }, [
    vouchers,
    auxiliaries,
    auxMap,
    accountMap,
    rutSearch,
    selectedAccountObj,
    accountCategory,
    docTypeFilter,
    docNumberSearch,
    balanceFilter,
    dateFilterMode,
    cutoffDate,
    startDate,
    endDate
  ]);

  // Resumen global de métricas
  const summaryMetrics = useMemo(() => {
    let totalDebits = 0;
    let totalCredits = 0;
    let totalPendingBalance = 0;
    let totalAuxiliaries = auxiliaryGroups.length;
    let totalDocsCount = 0;

    auxiliaryGroups.forEach(aux => {
      totalDebits += aux.totalDebits;
      totalCredits += aux.totalCredits;
      totalDocsCount += aux.documents.length;
      aux.documents.forEach(doc => {
        if (doc.balance > 0) {
          totalPendingBalance += doc.balance;
        }
      });
    });

    return { totalDebits, totalCredits, totalPendingBalance, totalAuxiliaries, totalDocsCount };
  }, [auxiliaryGroups]);

  // Toggle expand all / collapse all
  const handleToggleExpandAll = () => {
    const allExpanded = auxiliaryGroups.every(g => expandedAuxiliaries[g.cleanRut]);
    const newState: { [rut: string]: boolean } = {};
    auxiliaryGroups.forEach(g => {
      newState[g.cleanRut] = !allExpanded;
    });
    setExpandedAuxiliaries(newState);
  };

  // Exportar a Excel / CSV con formato agrupado limpio
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "RUT Auxiliar;Razón Social;Tipo Doc;Folio / N° Doc;Cuenta Contable;Fecha Emisión;Débitos ($);Créditos ($);Saldo Documento ($);Estado\n";

    auxiliaryGroups.forEach(aux => {
      aux.documents.forEach(doc => {
        const row = [
          aux.rut,
          `"${aux.name}"`,
          doc.docType === '9999' ? 'OTRO (9999)' : doc.docType,
          doc.docNumber,
          `"[${doc.accountCode}] ${doc.accountName}"`,
          doc.issueDate,
          doc.totalDebits,
          doc.totalCredits,
          doc.balance,
          doc.status
        ].join(';');
        csvContent += row + "\n";
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Analisis_Auxiliares_${company.rut || 'Empresa'}_${balanceFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSIIReport = () => {
    if (auxiliaryGroups.length === 0) {
      alert('No hay movimientos en el Análisis de Auxiliares para generar el informe.');
      return;
    }
    
    const title = `Analisis_Auxiliares_${company.name}_${accountCategory.toUpperCase()}`;
    const columns = ['RUT', 'Auxiliar', 'Doc', 'N°', 'Cuenta', 'Fecha', 'Débitos ($)', 'Créditos ($)', 'Saldo ($)', 'Estado'];
    const data: any[][] = [];

    auxiliaryGroups.forEach(aux => {
      aux.documents.forEach(doc => {
        data.push([
          aux.rut,
          aux.name,
          doc.docType === '9999' ? 'OTRO' : doc.docType,
          doc.docNumber,
          `[${doc.accountCode}]`,
          doc.issueDate,
          doc.totalDebits.toLocaleString('es-CL'),
          doc.totalCredits.toLocaleString('es-CL'),
          doc.balance.toLocaleString('es-CL'),
          doc.status
        ]);
      });
    });
    
    generateSIIReportPDF(title, columns, data);
  };

  return (
    <div className="space-y-5">
      {/* Header & Category Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl text-lg font-bold">📑</span>
            <div>
              <h3 className="font-black text-slate-900 text-lg leading-tight">
                Auxiliar de Cuentas Corrientes y Análisis por Auxiliar
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Control contable agrupado por RUT de cada auxiliar con detalle de sus documentos, compensaciones y saldos pendientes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadSIIReport}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <span>📄</span>
            <span>Informe PDF</span>
          </button>
          
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <span>📥</span>
            <span>Exportar Excel</span>
          </button>

          {/* Selector de Categoría */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => { setAccountCategory('todas'); setSelectedAccountId('todos'); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                accountCategory === 'todas'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => { setAccountCategory('activo'); setSelectedAccountId('todos'); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                accountCategory === 'activo'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏢 Clientes (Activo)
            </button>
            <button
              onClick={() => { setAccountCategory('pasivo'); setSelectedAccountId('todos'); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                accountCategory === 'pasivo'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏭 Proveedores (Pasivo)
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Auxiliares</span>
          <p className="text-xl font-mono font-black text-slate-900">{summaryMetrics.totalAuxiliaries}</p>
          <span className="text-[10px] text-slate-400">{summaryMetrics.totalDocsCount} documentos registrados</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Débitos (Cargos)</span>
          <p className="text-xl font-mono font-black text-slate-800">${summaryMetrics.totalDebits.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-slate-400">Total acumulado en el Debe</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Créditos (Abonos)</span>
          <p className="text-xl font-mono font-black text-slate-800">${summaryMetrics.totalCredits.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-slate-400">Total acumulado en el Haber</span>
        </div>

        <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-md space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">Saldo Pendiente Neto Total</span>
          <p className="text-xl font-mono font-black text-emerald-300">${summaryMetrics.totalPendingBalance.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-indigo-300">
            {balanceFilter === 'soloPendientes' ? 'Mostrando solo documentos con saldo > $0' : 'Vista de todos los movimientos'}
          </span>
        </div>
      </div>

      {/* Parametric Filters Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
          <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
            <span>🔍</span>
            <span>Filtros Parametrizables de Auxiliares</span>
          </h4>

          {/* Selector Clave de Saldo: Solo Pendientes vs Todos */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setBalanceFilter('soloPendientes')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                balanceFilter === 'soloPendientes'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📌</span>
              <span>Solo con Saldo Pendiente (Ocultar $0)</span>
            </button>
            <button
              onClick={() => setBalanceFilter('todos')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                balanceFilter === 'todos'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📋</span>
              <span>Todos los Movimientos (Incluye $0)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Cuenta Contable (Solo cuentas auxiliares) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Cuenta Contable con Análisis Auxiliar:
            </label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="todos">Todas las Cuentas Auxiliares ({availableAuxiliaryAccounts.length})</option>
              {availableAuxiliaryAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  [{acc.code}] {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Buscar por RUT o Razón Social */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Buscar por Auxiliar (RUT o Nombre):</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ej. 77.044.205-2 o ALFA METALES..."
                value={rutSearch}
                onChange={e => setRutSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 pr-8 text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
              />
              {rutSearch && (
                <button
                  type="button"
                  onClick={() => setRutSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Modo de Fecha */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Filtro de Fecha:</label>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setDateFilterMode('corte')}
                className={`py-1.5 px-2 rounded-md font-bold text-[11px] cursor-pointer ${
                  dateFilterMode === 'corte' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                A Fecha de Corte
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('rango')}
                className={`py-1.5 px-2 rounded-md font-bold text-[11px] cursor-pointer ${
                  dateFilterMode === 'rango' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Por Rango
              </button>
            </div>
          </div>

          {/* Input de Fecha según modo */}
          {dateFilterMode === 'corte' ? (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Fecha de Corte:</label>
              <input
                type="date"
                value={cutoffDate}
                onChange={e => setCutoffDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Desde:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Hasta:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Tipo de Documento */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tipo de Documento:</label>
            <select
              value={docTypeFilter}
              onChange={e => setDocTypeFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="todos">Todos los Tipos de Documento</option>
              <option value="33">33 (Factura Electrónica)</option>
              <option value="34">34 (Factura Exenta)</option>
              <option value="61">61 (Nota de Crédito)</option>
              <option value="56">56 (Nota de Débito)</option>
              <option value="39">39 (Boleta Electrónica)</option>
              <option value="46">46 (Factura de Compra)</option>
              <option value="BHE">BHE (Boleta de Honorarios)</option>
              <option value="9999">9999 / OTRO (Comprobante / Documento Interno)</option>
              <option value="NOMINA">NÓMINA (Remuneraciones)</option>
            </select>
          </div>

          {/* Folio / N° Documento */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Número de Folio / Documento:</label>
            <input
              type="text"
              placeholder="Ej. 13879759, 22278309..."
              value={docNumberSearch}
              onChange={e => setDocNumberSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Table: Agrupada por Auxiliar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black uppercase text-slate-800">
              Auxiliares y sus Cuentas Corrientes ({auxiliaryGroups.length} auxiliares)
            </h4>
            <span className="text-[11px] text-slate-500">
              • {balanceFilter === 'soloPendientes' ? 'Mostrando solo documentos con saldo pendiente' : 'Mostrando histórico completo'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleExpandAll}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
            >
              {auxiliaryGroups.every(g => expandedAuxiliaries[g.cleanRut]) ? '🔼 Contraer Todos' : '🔽 Desplegar Todos los Auxiliares'}
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {auxiliaryGroups.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <p className="font-semibold text-sm">No se encontraron movimientos auxiliares para los filtros seleccionados.</p>
              <p className="text-xs text-slate-400">
                {balanceFilter === 'soloPendientes' 
                  ? 'Prueba cambiando a "Todos los Movimientos" para revisar auxiliares que ya tienen saldo $0.'
                  : 'Verifica los filtros de cuenta contable, fechas o texto de búsqueda.'}
              </p>
            </div>
          ) : (
            auxiliaryGroups.map((aux) => {
              const isAuxExpanded = expandedAuxiliaries[aux.cleanRut] ?? true; // Por defecto desplegado
              const isSaldado = aux.balance === 0;

              return (
                <div key={aux.cleanRut} className="bg-white transition-colors">
                  {/* Fila Cabecera del Auxiliar (RUT) */}
                  <div
                    onClick={() => setExpandedAuxiliaries({ ...expandedAuxiliaries, [aux.cleanRut]: !isAuxExpanded })}
                    className="p-3.5 hover:bg-slate-50/80 cursor-pointer flex flex-wrap items-center justify-between gap-3 select-none"
                  >
                    <div className="flex items-center gap-3 min-w-[280px]">
                      <span className="text-indigo-600 font-bold text-sm w-4 text-center">
                        {isAuxExpanded ? '▼' : '▶'}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                            {aux.rut}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">
                            {aux.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{aux.documents.length} {aux.documents.length === 1 ? 'documento' : 'documentos'}</span>
                          <span>•</span>
                          <span>Cuentas: {aux.accountCodes.join(', ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-xs font-mono">
                      <div className="text-right">
                        <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Total Débitos</span>
                        <span className="font-bold text-slate-800">${aux.totalDebits.toLocaleString('es-CL')}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Total Créditos</span>
                        <span className="font-bold text-slate-800">${aux.totalCredits.toLocaleString('es-CL')}</span>
                      </div>
                      <div className="text-right min-w-[110px]">
                        <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Saldo Auxiliar</span>
                        <span className={`font-black text-sm ${isSaldado ? 'text-slate-400' : 'text-indigo-700'}`}>
                          ${aux.balance.toLocaleString('es-CL')}
                        </span>
                      </div>
                      <div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isSaldado 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {isSaldado ? '✓ Al Día ($0)' : 'Saldo Pendiente'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detalle de Documentos del Auxiliar */}
                  {isAuxExpanded && (
                    <div className="pl-6 pr-4 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100">
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-sans text-[11px]">
                            <tr>
                              <th className="py-2.5 px-3 w-8"></th>
                              <th className="py-2.5 px-3">Tipo Doc</th>
                              <th className="py-2.5 px-3">Folio / N° Doc</th>
                              <th className="py-2.5 px-3">Cuenta Contable</th>
                              <th className="py-2.5 px-3">Fecha Emisión</th>
                              <th className="py-2.5 px-3 text-right">Débitos ($)</th>
                              <th className="py-2.5 px-3 text-right">Créditos ($)</th>
                              <th className="py-2.5 px-3 text-right">Saldo Doc ($)</th>
                              <th className="py-2.5 px-3 text-center">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px]">
                            {aux.documents.map((doc) => {
                              const isDocExpanded = expandedDocs[doc.id] ?? false;
                              const isDocSaldado = doc.balance === 0;
                              const isOtro = doc.docType === '9999' || doc.docType === 'OTRO';
                              const isNC = doc.docType === '61';

                              return (
                                <React.Fragment key={doc.id}>
                                  <tr className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-2.5 px-3 text-center">
                                      {doc.movements.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setExpandedDocs({ ...expandedDocs, [doc.id]: !isDocExpanded })}
                                          className="text-indigo-600 hover:text-indigo-900 font-bold text-xs cursor-pointer"
                                          title="Ver detalle de comprobantes"
                                        >
                                          {isDocExpanded ? '▼' : '▶'}
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans font-medium">
                                      {isOtro ? (
                                        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          OTRO (9999)
                                        </span>
                                      ) : isNC ? (
                                        <span className="bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          61 (Nota de Crédito)
                                        </span>
                                      ) : (
                                        <span className="bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          {doc.docType}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 font-bold text-indigo-700">
                                      N° {doc.docNumber}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600 font-sans text-[11px]">
                                      <strong className="font-mono text-slate-800">[{doc.accountCode}]</strong> {doc.accountName}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600">{doc.issueDate}</td>
                                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                                      ${doc.totalDebits.toLocaleString('es-CL')}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                                      ${doc.totalCredits.toLocaleString('es-CL')}
                                    </td>
                                    <td className={`py-2.5 px-3 text-right font-black ${isDocSaldado ? 'text-slate-400' : 'text-indigo-700'}`}>
                                      ${doc.balance.toLocaleString('es-CL')}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        isDocSaldado 
                                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                          : doc.status === 'Parcial'
                                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                                      }`}>
                                        {isDocSaldado ? 'Saldado ($0)' : doc.status}
                                      </span>
                                    </td>
                                  </tr>

                                  {/* Sub-tabla de Asientos Contables / Comprobantes del Documento */}
                                  {isDocExpanded && doc.movements.length > 0 && (
                                    <tr className="bg-indigo-50/30">
                                      <td colSpan={9} className="p-3">
                                        <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs space-y-2">
                                          <div className="text-[11px] font-bold text-slate-700 flex justify-between items-center">
                                            <span>📋 Comprobantes Contables Asociados al Documento {doc.docType} N° {doc.docNumber}:</span>
                                            <span className="text-[10px] text-slate-500 font-normal">
                                              Total Débitos: ${doc.totalDebits.toLocaleString('es-CL')} | Total Créditos: ${doc.totalCredits.toLocaleString('es-CL')}
                                            </span>
                                          </div>
                                          <table className="w-full text-left text-[11px] border-collapse">
                                            <thead className="bg-slate-100 text-slate-600 font-sans border-b">
                                              <tr>
                                                <th className="p-1.5">Fecha</th>
                                                <th className="p-1.5">Comp. N°</th>
                                                <th className="p-1.5">Tipo Comp.</th>
                                                <th className="p-1.5">Glosa</th>
                                                <th className="p-1.5 text-right">Debe / Cargo ($)</th>
                                                <th className="p-1.5 text-right">Haber / Abono ($)</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {doc.movements.map((m, mIdx) => (
                                                <tr key={mIdx} className="hover:bg-slate-50">
                                                  <td className="p-1.5 font-bold text-slate-800">{m.date}</td>
                                                  <td className="p-1.5 font-bold text-indigo-700">N° {m.voucherNumber}</td>
                                                  <td className="p-1.5 text-slate-600">{m.voucherType}</td>
                                                  <td className="p-1.5 text-slate-700 font-sans">{m.gloss}</td>
                                                  <td className="p-1.5 text-right font-bold text-slate-800">
                                                    {m.debit > 0 ? `$${m.debit.toLocaleString('es-CL')}` : '-'}
                                                  </td>
                                                  <td className="p-1.5 text-right font-bold text-emerald-700">
                                                    {m.credit > 0 ? `$${m.credit.toLocaleString('es-CL')}` : '-'}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
