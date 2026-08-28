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

export interface MovementDetail {
  id: string;
  date: string;
  voucherNumber: number | string;
  voucherType: string;
  gloss: string;
  debit: number;
  credit: number;
}

export interface AuxiliaryLedgerItem {
  id: string;
  auxiliaryRut: string;
  auxiliaryName: string;
  accountCode: string;
  accountName: string;
  docType: string;
  docNumber: string;
  issueDate: string;
  initialAmount: number;
  payments: MovementDetail[];
  totalDebits: number;
  totalCredits: number;
  totalPaid: number;
  balance: number;
  status: 'Pendiente' | 'Saldado' | 'Parcial';
}

const cleanRut = (rut: string): string => {
  if (!rut) return '';
  return rut.trim().toLowerCase().replace(/[^0-9k]/g, '');
};

/**
 * Intelligent Document Reference Parser
 * Extracts Document Type (e.g. 33, 34, BHE, OTRO/9999) and Document Number
 */
function parseDocRef(refStr: string, fallbackType: string = '9999'): { docType: string; docNumber: string } {
  const clean = (refStr || '').trim();
  if (!clean) return { docType: fallbackType, docNumber: 'S/N' };

  // Explicit OTRO or 9999
  if (clean.toUpperCase().includes('OTRO') || clean.includes('9999')) {
    const digits = clean.replace(/[^0-9]/g, '');
    return { docType: '9999', docNumber: digits || clean.replace(/^(OTRO|9999)[\s#\-N°]*/i, '') || '1' };
  }

  const dteTypeMatch = clean.match(/(?:tipo\s*doc|doc|dte|nc|nd)?\s*\b(33|34|39|41|46|56|61|110)\b/i);
  let docType = fallbackType;
  if (dteTypeMatch) {
    docType = dteTypeMatch[1];
  } else if (/factura/i.test(clean)) {
    docType = '33';
  } else if (/boleta/i.test(clean)) {
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

  let docNumber = '1';
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

  // Date and Cutoff Mode
  const [reportMode, setReportMode] = useState<'todos' | 'pendienteCorte'>('pendienteCorte');
  const [cutoffDate, setCutoffDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Expanded row state for movement details
  const [expandedItems, setExpandedItems] = useState<{ [key: string]: boolean }>({});

  // Account map by ID and Code
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      map.set(a.id, a);
      if (a.code) map.set(a.code, a);
    });
    return map;
  }, [accounts]);

  // Filter accounts list for selection dropdown
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (acc.estado === 'Inactivo') return false;
      if (!acc.requiereAuxiliarRUT) return false;

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

  // Selected Account Object if any
  const selectedAccountObj = useMemo(() => {
    if (selectedAccountId === 'todos') return null;
    return accounts.find(a => a.id === selectedAccountId || a.code === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  // Auxiliary Map by RUT
  const auxMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(a => {
      if (a.rut) map.set(cleanRut(a.rut), a);
    });
    return map;
  }, [auxiliaries]);

  // Main Analysis Ledger Aggregating & Netting Engine
  const ledgerItems = useMemo(() => {
    // Helper function to check if an account is strictly an auxiliary analysis account (e.g. Clientes, Proveedores, Honorarios)
    const isAuxiliaryAccount = (accCode: string, accName: string, accObj?: ChartOfAccount): boolean => {
      const code = (accCode || '').trim();
      const name = (accName || '').toLowerCase();
      const type = (accObj?.type || '').toLowerCase();

      // Rule 1: Must NOT be Income (Ingreso 4.x) or Expense (Gasto 5.x)
      if (code.startsWith('4') || code.startsWith('5') || type.includes('ingreso') || type.includes('gasto')) {
        return false;
      }
      // Rule 2: Must NOT be Tax/IVA account (1.1.07 / 2.1.03)
      if (code.startsWith('1.1.07') || code.startsWith('2.1.03') || name.includes('iva dé') || name.includes('iva de') || name.includes('iva cr') || name.includes('iva débito') || name.includes('iva crédito')) {
        return false;
      }
      // Rule 3: Must explicitly have requiereAuxiliarRUT === true if account object exists
      if (accObj) {
        return Boolean(accObj.requiereAuxiliarRUT);
      }
      // Default fallback for recognized auxiliary AP/AR codes
      return code.startsWith('1.1.02') || code.startsWith('2.1.01') || code.startsWith('2.1.04');
    };

    // Bucket key: `${normRut}__${docType}__${docNumber}__${accountCode}`
    interface Bucket {
      auxiliaryRut: string;
      auxiliaryName: string;
      accountCode: string;
      accountName: string;
      docType: string;
      docNumber: string;
      movements: MovementDetail[];
    }

    const bucketMap = new Map<string, Bucket>();

    const getOrCreateBucket = (rut: string, auxName: string, accCode: string, accName: string, docType: string, docNumber: string) => {
      const normRut = cleanRut(rut);
      const normType = docType.trim().toUpperCase() === 'OTRO' ? '9999' : docType.trim().toUpperCase();
      const normNum = docNumber.trim() || '1';
      const normAccCode = accCode.trim().replace(/-/g, '.');
      const key = `${normRut}__${normType}__${normNum}__${normAccCode}`;

      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          auxiliaryRut: rut.trim(),
          auxiliaryName: auxName,
          accountCode: accCode.trim(),
          accountName: accName,
          docType: normType,
          docNumber: normNum,
          movements: []
        });
      }
      return bucketMap.get(key)!;
    };

    // 1. Process RCV Documents (Skip if already contabilizados as Vouchers)
    rcvDocuments.forEach(doc => {
      if (doc.estadoContabilizado) return;

      const isClientDoc = doc.tipoRegistro === 'Venta';
      const isSupplierDoc = doc.tipoRegistro === 'Compra' || doc.tipoRegistro === 'Honorarios';

      if (accountCategory === 'activo' && !isClientDoc) return;
      if (accountCategory === 'pasivo' && !isSupplierDoc) return;

      const rut = isClientDoc 
        ? (doc.rutReceptor || doc.rutEmisor || 'S/RUT').trim() 
        : (doc.rutEmisor || 'S/RUT').trim();
      
      const name = isClientDoc 
        ? (doc.razonSocialReceptor || doc.razonSocialEmisor || 'Cliente Sin Nombre') 
        : (doc.razonSocialEmisor || 'Proveedor Sin Nombre');

      const normRut = cleanRut(rut);
      if (rutSearch && !normRut.includes(cleanRut(rutSearch)) && !name.toLowerCase().includes(rutSearch.toLowerCase())) {
        return;
      }

      let accCode = isClientDoc ? '1.1.02.001' : '2.1.01.001';
      let accName = isClientDoc ? 'Clientes Nacionales' : 'Proveedores Nacionales';

      const auxObj = auxMap.get(normRut);
      if (isClientDoc && auxObj?.defaultDebtorAccountId) {
        const found = accountMap.get(auxObj.defaultDebtorAccountId);
        if (found) { accCode = found.code; accName = found.name; }
      } else if (!isClientDoc && auxObj?.defaultCreditorAccountId) {
        const found = accountMap.get(auxObj.defaultCreditorAccountId);
        if (found) { accCode = found.code; accName = found.name; }
      }

      const accObj = accountMap.get(accCode);
      if (!isAuxiliaryAccount(accCode, accName, accObj)) {
        return;
      }

      if (selectedAccountObj && accCode !== selectedAccountObj.code) {
        return;
      }

      const bucket = getOrCreateBucket(rut, name, accCode, accName, doc.tipoDoc || '33', String(doc.folio));
      
      const isCreditDoc = doc.tipoDoc === '61' || String(doc.tipoDoc).includes('61');
      const amount = Number(doc.montoTotal) || 0;

      bucket.movements.push({
        id: `rcv_${doc.id}`,
        date: doc.fechaEmision || '2026-01-01',
        voucherNumber: doc.folio,
        voucherType: `RCV ${doc.tipoRegistro}`,
        gloss: `Registro RCV ${doc.tipoRegistro} ${doc.tipoDoc} N° ${doc.folio} - ${name}`,
        debit: isClientDoc ? (isCreditDoc ? 0 : amount) : (isCreditDoc ? amount : 0),
        credit: isClientDoc ? (isCreditDoc ? amount : 0) : (isCreditDoc ? 0 : amount)
      });
    });

    // 2. Process Vouchers & Manual Entries
    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      const vDate = v.date;

      v.lines.forEach((line, lIdx) => {
        if (!line.auxiliaryRut) return;
        const rut = line.auxiliaryRut.trim();
        const normRut = cleanRut(rut);
        const auxObj = auxMap.get(normRut);
        const auxName = line.auxiliaryName || auxObj?.name || rut;

        if (rutSearch && !normRut.includes(cleanRut(rutSearch)) && !auxName.toLowerCase().includes(rutSearch.toLowerCase())) {
          return;
        }

        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (debit === 0 && credit === 0) return;

        const lineCode = (line.accountCode || '').trim();
        const lineAcc = accountMap.get(line.accountId || '') || accountMap.get(lineCode);
        const lineName = line.accountName || lineAcc?.name || 'Cuenta Auxiliar';

        // STRICT ENFORCEMENT: Ignore non-auxiliary accounts (IVA, Ingresos, Gastos, etc.)
        if (!isAuxiliaryAccount(lineCode, lineName, lineAcc)) {
          return;
        }

        // Account Match Filter
        if (selectedAccountObj) {
          if (lineAcc?.id !== selectedAccountObj.id && lineCode !== selectedAccountObj.code) {
            return;
          }
        } else {
          if (accountCategory !== 'todas') {
            const accType = (lineAcc?.type || '').toLowerCase();
            const isActivo = accType.includes('activo') || lineCode.startsWith('1');
            const isPasivo = accType.includes('pasivo') || lineCode.startsWith('2');

            if (accountCategory === 'activo' && !isActivo) return;
            if (accountCategory === 'pasivo' && !isPasivo) return;
          }
        }

        // Parse Document Reference (e.g. OTRO 101, 9999 N° 50, Fac 123)
        const refStr = line.documentRef || `OTRO ${v.voucherNumber}`;
        const parsed = parseDocRef(refStr, '9999');

        const bucket = getOrCreateBucket(rut, auxName, lineCode || '1.1.02.001', lineName, parsed.docType, parsed.docNumber);

        bucket.movements.push({
          id: `v_${v.id}_${lIdx}`,
          date: vDate,
          voucherNumber: v.voucherNumber,
          voucherType: v.type,
          gloss: line.gloss || v.gloss || `Comprobante N° ${v.voucherNumber}`,
          debit,
          credit
        });
      });
    });

    // 2.5 Cross-Document Netting Engine per RUT & Account (NCs & Unlinked Payments)
    // Group buckets by (normRut + normAccCode)
    const rutAccBucketsMap = new Map<string, Bucket[]>();
    bucketMap.forEach(bucket => {
      const normRut = cleanRut(bucket.auxiliaryRut);
      const normAccCode = bucket.accountCode.trim().replace(/-/g, '.');
      const groupKey = `${normRut}__${normAccCode}`;

      if (!rutAccBucketsMap.has(groupKey)) {
        rutAccBucketsMap.set(groupKey, []);
      }
      rutAccBucketsMap.get(groupKey)!.push(bucket);
    });

    // For each (RUT + Account) group, net NCs / Payments against open Invoice buckets
    rutAccBucketsMap.forEach(buckets => {
      if (buckets.length <= 1) return;

      // Identify invoice buckets vs NC/Payment buckets
      const invoiceBuckets: { bucket: Bucket; netBalance: number }[] = [];
      const adjustmentBuckets: { bucket: Bucket; availAmount: number }[] = [];

      buckets.forEach(b => {
        const isDebitNature = b.accountCode.startsWith('1') || b.accountCode.startsWith('5') || b.accountName.toLowerCase().includes('cliente');
        const totDeb = b.movements.reduce((sum, m) => sum + m.debit, 0);
        const totCred = b.movements.reduce((sum, m) => sum + m.credit, 0);

        if (isDebitNature) {
          // Activo (Clientes): Invoices have Debit > Credit; Payments/NCs have Credit > Debit
          const net = totDeb - totCred;
          if (net > 0 && b.docType !== '61') {
            invoiceBuckets.push({ bucket: b, netBalance: net });
          } else if (net < 0 || b.docType === '61') {
            adjustmentBuckets.push({ bucket: b, availAmount: Math.abs(totCred - totDeb) });
          }
        } else {
          // Pasivo (Proveedores): Invoices have Credit > Debit; Payments/NCs have Debit > Credit
          const net = totCred - totDeb;
          if (net > 0 && b.docType !== '61') {
            invoiceBuckets.push({ bucket: b, netBalance: net });
          } else if (net < 0 || b.docType === '61') {
            adjustmentBuckets.push({ bucket: b, availAmount: Math.abs(totDeb - totCred) });
          }
        }
      });

      // Match adjustments against invoices
      adjustmentBuckets.forEach(adj => {
        let remainingAdj = adj.availAmount;
        if (remainingAdj <= 0) return;

        for (const inv of invoiceBuckets) {
          if (inv.netBalance <= 0) continue;

          const applyAmt = Math.min(remainingAdj, inv.netBalance);
          inv.netBalance -= applyAmt;
          remainingAdj -= applyAmt;

          // Merge adjustment movements into the invoice bucket so they appear together
          adj.bucket.movements.forEach(m => {
            if (!inv.bucket.movements.some(existing => existing.id === m.id)) {
              inv.bucket.movements.push(m);
            }
          });

          if (remainingAdj <= 0) break;
        }
      });
    });

    // 3. Aggregate, Net & Determine Status for Each Bucket
    const result: AuxiliaryLedgerItem[] = [];

    bucketMap.forEach((bucket, key) => {
      // Sort movements chronologically
      bucket.movements.sort((a, b) => a.date.localeCompare(b.date));

      // Filter movements by Date Range or Cutoff Date
      let validMovements = bucket.movements;
      if (reportMode === 'pendienteCorte') {
        validMovements = bucket.movements.filter(m => m.date <= cutoffDate);
      } else {
        validMovements = bucket.movements.filter(m => m.date >= startDate && m.date <= endDate);
      }

      if (validMovements.length === 0) return;

      const totalDebits = validMovements.reduce((sum, m) => sum + m.debit, 0);
      const totalCredits = validMovements.reduce((sum, m) => sum + m.credit, 0);

      // Determine account nature (Activo/Gasto = Debit nature vs Pasivo/Ingreso = Credit nature)
      const isDebitNature = bucket.accountCode.startsWith('1') || bucket.accountCode.startsWith('5') || bucket.accountName.toLowerCase().includes('cliente') || bucket.accountName.toLowerCase().includes('anticipo');

      const initialAmount = isDebitNature ? totalDebits : totalCredits;
      const totalPaid = isDebitNature ? totalCredits : totalDebits;
      const rawBalance = Math.abs(totalDebits - totalCredits);

      // Netting check: if Total Debits === Total Credits (or difference < $1), it's completely netted/saldado!
      const isNetted = rawBalance < 1;
      const balance = isNetted ? 0 : rawBalance;

      let status: 'Pendiente' | 'Saldado' | 'Parcial' = 'Pendiente';
      if (isNetted) {
        status = 'Saldado';
      } else if (totalPaid > 0) {
        status = 'Parcial';
      }

      // In Cutoff Mode: filter out netted/saldado documents (balance === 0)
      if (reportMode === 'pendienteCorte' && isNetted) {
        return;
      }

      // Earliest issue date
      const issueDate = validMovements[0]?.date || '2026-01-01';

      result.push({
        id: key,
        auxiliaryRut: bucket.auxiliaryRut,
        auxiliaryName: bucket.auxiliaryName,
        accountCode: bucket.accountCode,
        accountName: bucket.accountName,
        docType: bucket.docType,
        docNumber: bucket.docNumber,
        issueDate,
        initialAmount,
        payments: validMovements,
        totalDebits,
        totalCredits,
        totalPaid,
        balance,
        status
      });
    });

    // Apply document type & number filters
    return result.filter(item => {
      if (docTypeFilter !== 'todos') {
        if (docTypeFilter === '9999' && (item.docType !== '9999' && item.docType !== 'OTRO')) return false;
        if (docTypeFilter !== '9999' && item.docType !== docTypeFilter) return false;
      }
      if (docNumberSearch && !item.docNumber.includes(docNumberSearch)) return false;
      return true;
    });

  }, [rcvDocuments, vouchers, auxiliaries, accountCategory, selectedAccountObj, rutSearch, reportMode, cutoffDate, startDate, endDate, docTypeFilter, docNumberSearch, accountMap, auxMap]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalPortfolio = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let countPending = 0;

    ledgerItems.forEach(item => {
      totalPortfolio += item.initialAmount;
      totalPaid += item.totalPaid;
      if (item.balance > 0) {
        totalPending += item.balance;
        countPending++;
      }
    });

    return { totalPortfolio, totalPaid, totalPending, countPending };
  }, [ledgerItems]);

  // Export to Excel / CSV
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "RUT Auxiliar;Razón Social;Cuenta;Tipo Doc;N° Doc;Fecha Emisión;Monto Débitos;Monto Créditos;Abonos;Saldo Pendiente;Estado\n";

    ledgerItems.forEach(item => {
      const row = [
        item.auxiliaryRut,
        `"${item.auxiliaryName}"`,
        `"[${item.accountCode}] ${item.accountName}"`,
        item.docType === '9999' ? 'OTRO (9999)' : item.docType,
        item.docNumber,
        item.issueDate,
        item.totalDebits,
        item.totalCredits,
        item.totalPaid,
        item.balance,
        item.status
      ].join(';');
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Analisis_Auxiliares_${accountCategory}_${reportMode === 'pendienteCorte' ? cutoffDate : 'Todos'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSIIReport = () => {
    if (ledgerItems.length === 0) {
      alert('No hay movimientos en el Análisis de Auxiliares para generar el informe.');
      return;
    }
    
    const title = `Analisis_Auxiliares_${company.name}_${accountCategory}`;
    const columns = ['RUT', 'Auxiliar', 'Cuenta', 'Doc', 'N°', 'Fecha', 'Débitos ($)', 'Créditos ($)', 'Saldo ($)'];
    const data = ledgerItems.map(item => [
      item.auxiliaryRut,
      item.auxiliaryName,
      `[${item.accountCode}] ${item.accountName}`,
      item.docType,
      item.docNumber,
      item.issueDate,
      item.totalDebits.toLocaleString('es-CL'),
      item.totalCredits.toLocaleString('es-CL'),
      item.balance.toLocaleString('es-CL')
    ]);
    
    generateSIIReportPDF(title, columns, data);
  };

  return (
    <div className="space-y-6">
      {/* Header & Category Switcher */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
            <span>📑</span>
            <span>Análisis de Auxiliares y Control por Documento</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Análisis de cuentas con control auxiliar (RUT, Personal y Documentos OTRO/9999) con neteo automático de movimientos saldados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadSIIReport}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>📄</span>
            <span>Informe SII (PDF)</span>
          </button>
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setAccountCategory('todas')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                accountCategory === 'todas'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📋 Todas
            </button>
            <button
              onClick={() => setAccountCategory('activo')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                accountCategory === 'activo'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏢 Clientes (Activo)
            </button>
            <button
              onClick={() => setAccountCategory('pasivo')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                accountCategory === 'pasivo'
                  ? 'bg-indigo-600 text-white shadow-sm'
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
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Monto Base Documentos</span>
          <p className="text-xl font-mono font-black text-slate-900">${summaryMetrics.totalPortfolio.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-slate-400">Total cargos / provisiones</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Abonos / Neteos</span>
          <p className="text-xl font-mono font-black text-emerald-700">${summaryMetrics.totalPaid.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-emerald-500">Pagos y descuentos aplicados</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Saldo Pendiente Neto</span>
          <p className="text-xl font-mono font-black text-indigo-700">${summaryMetrics.totalPending.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-indigo-500">{summaryMetrics.countPending} registros con saldo pendiente</span>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Exportar Análisis</span>
            <span className="text-lg">📊</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleExportCSV}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-xs"
            >
              <span>📥</span> Excel / CSV
            </button>
            <button
              onClick={() => window.print()}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1"
            >
              <span>🖨️</span> Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Parametric Filters */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
          <span>🔍</span>
          <span>Filtros Parametrizables de Cuentas y Documentos</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Cuenta Contable Base:</label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="todos">Todas las Cuentas ({accountCategory.toUpperCase()})</option>
              {filteredAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  [{acc.code}] {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">RUT o Razón Social Auxiliar:</label>
            <input
              type="text"
              placeholder="Ej. 12.345.678-9 o Juan Pérez..."
              value={rutSearch}
              onChange={e => setRutSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Modo de Análisis:</label>
            <select
              value={reportMode}
              onChange={e => setReportMode(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="pendienteCorte">📅 Solo Pendientes a Fecha Corte (Netos)</option>
              <option value="todos">📋 Todos los Movimientos (Incluye Saldados)</option>
            </select>
          </div>

          {reportMode === 'pendienteCorte' ? (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Fecha Corte de Saldo:</label>
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

          <div>
            <label className="block font-bold text-slate-700 mb-1">Tipo de Documento:</label>
            <select
              value={docTypeFilter}
              onChange={e => setDocTypeFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="todos">Todos los Tipos de Documento</option>
              <option value="9999">9999 / OTRO (Documento Interno / Personal)</option>
              <option value="33">33 (Factura Electrónica)</option>
              <option value="34">34 (Factura Exenta)</option>
              <option value="39">39 (Boleta Electrónica)</option>
              <option value="56">56 (Nota de Débito)</option>
              <option value="61">61 (Nota de Crédito)</option>
              <option value="46">46 (Factura de Compra)</option>
              <option value="BHE">BHE (Boleta de Honorarios)</option>
              <option value="NOMINA">NÓMINA (Remuneraciones)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Número de Documento / Folio:</label>
            <input
              type="text"
              placeholder="Ej. 101, 10425..."
              value={docNumberSearch}
              onChange={e => setDocNumberSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h4 className="text-xs font-black uppercase text-slate-800">
            Detalle de Cuentas Corrientes y Movimientos Neteados ({ledgerItems.length} registros)
          </h4>
          <span className="text-[11px] text-slate-500">
            {reportMode === 'pendienteCorte' ? `Corte de Saldos: ${cutoffDate}` : `Período: ${startDate} al ${endDate}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-sans text-[11px]">
              <tr>
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-3">RUT Auxiliar</th>
                <th className="py-3 px-3">Nombre / Auxiliar</th>
                <th className="py-3 px-3">Cuenta Contable</th>
                <th className="py-3 px-3">Doc / Folio</th>
                <th className="py-3 px-3">Emisión</th>
                <th className="py-3 px-3 text-right">Débitos ($)</th>
                <th className="py-3 px-3 text-right">Créditos ($)</th>
                <th className="py-3 px-3 text-right">Saldo Pendiente ($)</th>
                <th className="py-3 px-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {ledgerItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 font-sans">
                    No se encontraron movimientos auxiliares o documentos para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                ledgerItems.map(item => {
                  const isExpanded = expandedItems[item.id];
                  const isOtro = item.docType === '9999' || item.docType === 'OTRO';
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-center">
                          {item.payments.length > 0 && (
                            <button
                              onClick={() => setExpandedItems({ ...expandedItems, [item.id]: !isExpanded })}
                              className="text-indigo-600 hover:text-indigo-900 font-bold text-sm"
                              title="Ver detalle de movimientos neteados"
                            >
                              {isExpanded ? '▼' : '▶'}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-800">{item.auxiliaryRut}</td>
                        <td className="py-3 px-3 font-sans font-medium text-slate-900">{item.auxiliaryName}</td>
                        <td className="py-3 px-3 text-slate-600 font-sans text-[10px]">
                          <strong className="font-mono text-slate-800">{item.accountCode}</strong> - {item.accountName}
                        </td>
                        <td className="py-3 px-3 font-bold text-indigo-700">
                          {isOtro ? (
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold mr-1">
                              OTRO (9999)
                            </span>
                          ) : (
                            <span className="text-slate-500 font-normal mr-1">{item.docType}</span>
                          )}
                          N° {item.docNumber}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{item.issueDate}</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-800">${item.totalDebits.toLocaleString('es-CL')}</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-800">${item.totalCredits.toLocaleString('es-CL')}</td>
                        <td className={`py-3 px-3 text-right font-black ${item.balance > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
                          ${item.balance.toLocaleString('es-CL')}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'Pendiente' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            item.status === 'Parcial' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Sub-Row for Movement Breakdown */}
                      {isExpanded && item.payments.length > 0 && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={10} className="p-4">
                            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs space-y-2">
                              <h5 className="text-[11px] font-black uppercase text-slate-700 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <span>💵</span>
                                  <span>Desglose de Movimientos para {item.auxiliaryName} ({item.auxiliaryRut}) - Doc {item.docType === '9999' ? 'OTRO' : item.docType} N° {item.docNumber}</span>
                                </span>
                                <span className="text-[10px] font-normal text-slate-500">
                                  Total Débitos: ${item.totalDebits.toLocaleString('es-CL')} | Total Créditos: ${item.totalCredits.toLocaleString('es-CL')}
                                </span>
                              </h5>
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead className="bg-slate-100 text-slate-600 font-sans border-b">
                                  <tr>
                                    <th className="p-1.5">Fecha</th>
                                    <th className="p-1.5">Comp. N°</th>
                                    <th className="p-1.5">Tipo Comp.</th>
                                    <th className="p-1.5">Glosa / Detalle</th>
                                    <th className="p-1.5 text-right">Debe / Cargo ($)</th>
                                    <th className="p-1.5 text-right">Haber / Abono ($)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {item.payments.map((m, mIdx) => (
                                    <tr key={mIdx} className="hover:bg-slate-50">
                                      <td className="p-1.5 font-bold text-slate-800">{m.date}</td>
                                      <td className="p-1.5 font-bold text-indigo-700">N° {m.voucherNumber}</td>
                                      <td className="p-1.5 text-slate-600">{m.voucherType}</td>
                                      <td className="p-1.5 text-slate-700 font-sans">{m.gloss}</td>
                                      <td className="p-1.5 text-right font-bold text-slate-800">{m.debit > 0 ? `$${m.debit.toLocaleString('es-CL')}` : '-'}</td>
                                      <td className="p-1.5 text-right font-bold text-emerald-700">{m.credit > 0 ? `$${m.credit.toLocaleString('es-CL')}` : '-'}</td>
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
