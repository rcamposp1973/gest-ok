import React, { useState, useEffect, useMemo } from 'react';
import {
  BankStatementLine,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  Auxiliary,
  RCVDocument,
  CostCenterMaster,
  ExpenseItemMaster,
  ProjectMaster,
  ProductMaster,
  CustomAnalysisTableItem
} from '../types';

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  pastedCSV: string;
  setPastedCSV: (val: string) => void;
  importInitialBalance: number;
  setImportInitialBalance: (val: number) => void;
  onImport: () => void;
  currentPeriod: string;
}

export function ImportCSVModal({
  isOpen,
  onClose,
  pastedCSV,
  setPastedCSV,
  importInitialBalance,
  setImportInitialBalance,
  onImport,
  currentPeriod
}: ImportCSVModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b pb-2">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase flex items-center gap-1.5">
              <span>📥</span> Importar Cartola Bancaria (Saldos Acumulativos Multimes)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Al importar, los movimientos se grabarán automáticamente y encadenarán los saldos de mes a mes.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold text-lg">
            ✕
          </button>
        </div>

        {/* Initial Balance in Import Modal */}
        <div className="bg-indigo-50/80 p-3.5 rounded-lg border border-indigo-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <label className="block text-xs font-bold text-indigo-950">
              Saldo Inicial Apertura / Mes Anterior ($):
            </label>
            <span className="text-[11px] text-slate-600">
              Punto de partida acumulativo para calcular el saldo progresivo de los movimientos:
            </span>
          </div>
          <div className="w-full sm:w-48">
            <input
              type="number"
              value={importInitialBalance}
              onChange={(e) => setImportInitialBalance(Number(e.target.value))}
              className="w-full bg-white border border-indigo-300 rounded px-3 py-1.5 font-mono font-bold text-indigo-950 text-xs"
            />
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-800">
            Formato de columnas admitido (separado por punto y coma, coma o tabulación):
          </p>
          <code className="bg-white px-2 py-1 rounded text-indigo-800 font-mono text-[11px] block border border-slate-200">
            Fecha; Descripción / Glosa; N° Documento; Cargo; Abono [; Saldo]
          </code>
          <p className="text-[11px] text-slate-500 italic">
            * Si el archivo contiene fechas de diferentes meses (ej: 2026-01 y 2026-02), el sistema distribuirá y encadenará automáticamente cada mes en su período correspondiente.
          </p>
        </div>

        <textarea
          rows={8}
          value={pastedCSV}
          onChange={(e) => setPastedCSV(e.target.value)}
          placeholder={`2026-08-01;PAGO PROVEEDOR TRANSFERENCIA;10293;450000;0\n2026-08-03;DEPOSITO CLIENTE FACTURA 55;44812;0;1200000\n2026-08-05;COMISION MANTENCION CUENTA;0;15000;0`}
          className="w-full font-mono text-xs border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />

        <div className="flex justify-between items-center pt-2">
          <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
            <span>💾</span> Grabado automático inmediato al importar
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={onImport}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-xs"
            >
              Procesar y Guardar Cartola
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ManualMatchModalProps {
  manualMatchLine: BankStatementLine | null;
  onClose: () => void;
  modalScope: 'TODOS_PENDIENTES' | 'ESTE_MES' | 'MESES_POSTERIORES' | 'MESES_ANTERIORES';
  setModalScope: (scope: 'TODOS_PENDIENTES' | 'ESTE_MES' | 'MESES_POSTERIORES' | 'MESES_ANTERIORES') => void;
  modalExactOnly: boolean;
  setModalExactOnly: (val: boolean) => void;
  modalSearch: string;
  setModalSearch: (val: string) => void;
  availableVouchers: {
    voucher: Voucher;
    line: any;
    debit: number;
    credit: number;
    date: string;
    period: string;
    gloss: string;
  }[];
  onMatch: (voucherId: string, voucherNumber: number, voucherPeriod: string) => void;
  selectedPeriod: string;
}

export function ManualMatchModal({
  manualMatchLine,
  onClose,
  modalScope,
  setModalScope,
  modalExactOnly,
  setModalExactOnly,
  modalSearch,
  setModalSearch,
  availableVouchers,
  onMatch,
  selectedPeriod
}: ManualMatchModalProps) {
  if (!manualMatchLine) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center border-b pb-2">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase flex items-center gap-1.5">
              <span>🔗</span> Conciliar Partida con Asiento (Mismo Mes o Distinto Mes)
            </h4>
            <div className="text-xs text-slate-600 mt-0.5">
              Línea Cartola: <strong className="text-slate-900">{manualMatchLine.description}</strong> ({manualMatchLine.date}) — Monto:{' '}
              <strong className={manualMatchLine.charge > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                ${((manualMatchLine.charge || 0) + (manualMatchLine.deposit || 0)).toLocaleString('es-CL')} (
                {manualMatchLine.charge > 0 ? 'Cargo / Egreso' : 'Abono / Ingreso'})
              </strong>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold text-lg">
            ✕
          </button>
        </div>

        {/* Scope and Filter Controls in Modal */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Alcance Temporal:</label>
            <select
              value={modalScope}
              onChange={(e) => setModalScope(e.target.value as any)}
              className="w-full bg-white border border-slate-300 rounded p-1.5 font-semibold text-xs"
            >
              <option value="TODOS_PENDIENTES">Todos los Meses (Pendientes)</option>
              <option value="ESTE_MES">Solo este Mes ({selectedPeriod})</option>
              <option value="MESES_POSTERIORES">Meses Posteriores (Regularizaciones Futuras)</option>
              <option value="MESES_ANTERIORES">Meses Anteriores</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Buscar Comprobante:</label>
            <input
              type="text"
              placeholder="N° Asiento, glosa, fecha..."
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs"
            />
          </div>

          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs">
              <input
                type="checkbox"
                checked={modalExactOnly}
                onChange={(e) => setModalExactOnly(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <span>Solo monto idéntico (${((manualMatchLine.charge || 0) + (manualMatchLine.deposit || 0)).toLocaleString('es-CL')})</span>
            </label>
          </div>
        </div>

        {/* Duplicate Vouchers Warning in Modal */}
        {(() => {
          const exactMatchingVouchers = availableVouchers.filter(bv => {
            return (
              (manualMatchLine.charge > 0 && bv.credit === manualMatchLine.charge) ||
              (manualMatchLine.deposit > 0 && bv.debit === manualMatchLine.deposit)
            );
          });

          if (exactMatchingVouchers.length >= 2) {
            return (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <div>
                  <strong className="font-bold">Advertencia de Asientos Múltiples / Duplicados en Libros:</strong>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    Se detectaron <strong>{exactMatchingVouchers.length} comprobantes contables</strong> con el mismo monto exacto (Asientos:{' '}
                    {exactMatchingVouchers.map(v => `N° ${v.voucher.voucherNumber}`).join(', ')}). El sistema omitió la conciliación automática
                    por seguridad. Seleccione manualmente el comprobante correcto o elimine el duplicado en el libro contable.
                  </p>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Table of Available Vouchers */}
        <div className="overflow-y-auto flex-1 border rounded-lg max-h-72">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 sticky top-0 border-b border-slate-200">
              <tr>
                <th className="p-2">Período / Fecha</th>
                <th className="p-2">N° Asiento</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Glosa</th>
                <th className="p-2 text-right">Monto</th>
                <th className="p-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {availableVouchers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-sans italic">
                    No se encontraron comprobantes pendientes con los filtros seleccionados. Desmarca "Solo monto idéntico" o amplía el alcance temporal.
                  </td>
                </tr>
              ) : (
                availableVouchers.map((bv, idx) => {
                  const isExact =
                    (manualMatchLine.charge > 0 && bv.credit === manualMatchLine.charge) ||
                    (manualMatchLine.deposit > 0 && bv.debit === manualMatchLine.deposit);
                  const isCrossPeriod = bv.period !== selectedPeriod;

                  return (
                    <tr key={idx} className={`hover:bg-slate-50 ${isExact ? 'bg-emerald-50/30' : ''}`}>
                      <td className="p-2">
                        <div>{bv.date}</div>
                        {isCrossPeriod ? (
                          <span className="text-[9px] font-sans font-bold bg-indigo-100 text-indigo-800 px-1 rounded border border-indigo-200">
                            🔄 Período {bv.period}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-sans">Mismo período</span>
                        )}
                      </td>
                      <td className="p-2 font-bold text-indigo-700">N° {bv.voucher.voucherNumber}</td>
                      <td className="p-2 font-sans font-semibold text-slate-700">{bv.voucher.type}</td>
                      <td className="p-2 font-sans truncate max-w-[180px] text-slate-900" title={bv.gloss}>
                        {bv.gloss}
                      </td>
                      <td className="p-2 text-right font-bold text-slate-900">
                        ${(bv.debit > 0 ? bv.debit : bv.credit).toLocaleString('es-CL')}
                        {isExact && (
                          <span className="block text-[9px] text-emerald-700 font-sans font-bold">⭐ Coincide</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => onMatch(bv.voucher.id, bv.voucher.voucherNumber || 0, bv.period)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-black text-xs transition-colors shadow-2xs"
                        >
                          Vincular y Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-slate-500 flex justify-between items-center border-t pt-2">
          <span>* Al presionar "Vincular", el estado se graba automáticamente en tiempo real.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export interface OpenAccountItem {
  id: string;
  docType: string;
  docNumber: string;
  auxiliaryRut: string;
  auxiliaryName: string;
  issueDate: string;
  dueDate?: string;
  costCenter?: string;
  expenseItem?: string;
  project?: string;
  product?: string;
  originalAmount: number;
  paidAmount: number;
  openBalance: number;
  source: 'RCV' | 'VOUCHER';
}

export interface QuickVoucherModalProps {
  quickVoucherLine: BankStatementLine | null;
  onClose: () => void;
  accounts: ChartOfAccount[];
  auxiliaries?: Auxiliary[];
  vouchers?: Voucher[];
  rcvDocuments?: RCVDocument[];
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
  projects?: ProjectMaster[];
  products?: ProductMaster[];
  customAnalysisItems?: CustomAnalysisTableItem[];
  customColumns?: string[];
  selectedBankAccount: ChartOfAccount | null;
  quickExpenseAccountId: string;
  setQuickExpenseAccountId: (val: string) => void;
  quickGloss: string;
  setQuickGloss: (val: string) => void;
  quickVoucherPeriod: string;
  setQuickVoucherPeriod: (val: string) => void;
  onPostVoucherWithLines: (voucherData: {
    period: string;
    gloss: string;
    counterAccountId: string;
    lines: VoucherLine[];
    newAuxiliaryToSave?: Auxiliary;
  }) => Promise<void>;
  onPost?: () => void;
}

export function QuickVoucherModal({
  quickVoucherLine,
  onClose,
  accounts,
  auxiliaries = [],
  vouchers = [],
  rcvDocuments = [],
  costCenters = [],
  expenseItems = [],
  projects = [],
  products = [],
  customAnalysisItems = [],
  customColumns = [],
  selectedBankAccount,
  quickExpenseAccountId,
  setQuickExpenseAccountId,
  quickGloss,
  setQuickGloss,
  quickVoucherPeriod,
  setQuickVoucherPeriod,
  onPostVoucherWithLines,
  onPost
}: QuickVoucherModalProps) {
  if (!quickVoucherLine) return null;

  const isCharge = quickVoucherLine.charge > 0;
  const bankAmount = isCharge ? quickVoucherLine.charge : quickVoucherLine.deposit;

  // Selected account detail
  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === quickExpenseAccountId);
  }, [accounts, quickExpenseAccountId]);

  // Account type direction: Is AP (Pasivo / Proveedores) or AR (Activo / Clientes / Préstamos)
  const isAP = useMemo(() => {
    if (!selectedAccount) return isCharge;
    const code = selectedAccount.code || '';
    const type = (selectedAccount.type || '').toLowerCase();
    const name = (selectedAccount.name || '').toLowerCase();
    if (code.startsWith('2') || type.includes('pasivo') || name.includes('proveedor') || name.includes('acreedor') || name.includes('pagar') || name.includes('honorario')) {
      return true;
    }
    if (code.startsWith('1') || type.includes('activo') || name.includes('cliente') || name.includes('cobrar') || name.includes('préstamo') || name.includes('prestamo')) {
      return false;
    }
    return isCharge;
  }, [selectedAccount, isCharge]);

  // Dynamic Analysis states
  const [selectedAuxiliaryRut, setSelectedAuxiliaryRut] = useState<string>('');
  const [selectedAuxiliaryName, setSelectedAuxiliaryName] = useState<string>('');
  const [documentRef, setDocumentRef] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [costCenter, setCostCenter] = useState<string>('');
  const [expenseItem, setExpenseItem] = useState<string>('');
  const [project, setProject] = useState<string>('');
  const [product, setProduct] = useState<string>('');
  const [customAnalyses, setCustomAnalyses] = useState<{ [key: string]: string }>({});
  
  // Selection of open documents table
  const [selectedDocIds, setSelectedDocIds] = useState<{ [docId: string]: number }>({});
  const [docSearch, setDocSearch] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Auto-detect Auxiliary from Bank line description or match against master auxiliaries
  useEffect(() => {
    if (!quickVoucherLine) return;
    const desc = quickVoucherLine.description || '';
    
    // Check if description has RUT string (e.g. 76.123.456-7 or 76123456-7)
    const rutMatch = desc.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]|\d{7,8}-[\dkK])\b/i);
    if (rutMatch) {
      const cleanRut = rutMatch[1].toUpperCase();
      setSelectedAuxiliaryRut(cleanRut);
      const foundAux = auxiliaries.find(a => (a.rut || '').replace(/\./g, '').toUpperCase() === cleanRut.replace(/\./g, '').toUpperCase());
      if (foundAux) {
        setSelectedAuxiliaryName(foundAux.name || '');
      }
      return;
    }

    // Match words against auxiliary names
    if (auxiliaries.length > 0) {
      const match = auxiliaries.find(a => {
        const nameUpper = (a.name || '').toUpperCase();
        return nameUpper.length > 3 && desc.toUpperCase().includes(nameUpper);
      });
      if (match) {
        setSelectedAuxiliaryRut(match.rut || '');
        setSelectedAuxiliaryName(match.name || '');
      }
    }
  }, [quickVoucherLine, auxiliaries]);

  // Sync selected auxiliary name when RUT changes
  const handleRutChange = (rut: string) => {
    setSelectedAuxiliaryRut(rut);
    const aux = auxiliaries.find(a => (a.rut || '').trim().toUpperCase() === (rut || '').trim().toUpperCase());
    if (aux) {
      setSelectedAuxiliaryName(aux.name || '');
    }
  };

  // Helper to check custom analysis required
  const isCustomAttrRequired = (colName: string): boolean => {
    if (!selectedAccount) return false;
    if (selectedAccount.customAttributes && selectedAccount.customAttributes[colName] !== undefined) {
      return Boolean(selectedAccount.customAttributes[colName]);
    }
    return false;
  };

  // Calculate open documents composing the selected account ("Lo que compone la cuenta")
  const openItems = useMemo<OpenAccountItem[]>(() => {
    if (!selectedAccount) return [];

    const items: OpenAccountItem[] = [];
    const accCode = selectedAccount.code;
    const accId = selectedAccount.id;

    // 1. Gather from RCV Documents
    if (rcvDocuments.length > 0) {
      if (isAP) {
        // Purchase invoices & Fees
        const purchases = rcvDocuments.filter(d => d.tipoRegistro === 'Compra' || d.tipoRegistro === 'Honorarios');
        for (const doc of purchases) {
          const total = Number(doc.montoTotal) || 0;
          if (total <= 0) continue;

          // Find paid amount in vouchers
          let paid = 0;
          vouchers.forEach(v => {
            if (v.status === 'Anulado') return;
            v.lines?.forEach(l => {
              if (l.accountId === accId || l.accountCode === accCode) {
                if ((Number(l.debit) || 0) > 0) {
                  if (l.auxiliaryRut === doc.rutEmisor || String(l.documentRef) === String(doc.folio)) {
                    paid += Number(l.debit) || 0;
                  }
                }
              }
            });
          });

          const pending = Math.max(0, total - paid);
          if (pending > 0) {
            items.push({
              id: `rcv_${doc.id || doc.folio}_${doc.rutEmisor}`,
              docType: doc.tipoDoc || '33',
              docNumber: String(doc.folio),
              auxiliaryRut: doc.rutEmisor,
              auxiliaryName: doc.razonSocialEmisor,
              issueDate: doc.fechaEmision,
              originalAmount: total,
              paidAmount: paid,
              openBalance: pending,
              source: 'RCV'
            });
          }
        }
      } else {
        // Sales invoices
        const sales = rcvDocuments.filter(d => d.tipoRegistro === 'Venta');
        for (const doc of sales) {
          const total = Number(doc.montoTotal) || 0;
          if (total <= 0) continue;

          let paid = 0;
          vouchers.forEach(v => {
            if (v.status === 'Anulado') return;
            v.lines?.forEach(l => {
              if (l.accountId === accId || l.accountCode === accCode) {
                if ((Number(l.credit) || 0) > 0) {
                  if (l.auxiliaryRut === doc.rutReceptor || String(l.documentRef) === String(doc.folio)) {
                    paid += Number(l.credit) || 0;
                  }
                }
              }
            });
          });

          const pending = Math.max(0, total - paid);
          if (pending > 0) {
            items.push({
              id: `rcv_${doc.id || doc.folio}_${doc.rutReceptor}`,
              docType: doc.tipoDoc || '33',
              docNumber: String(doc.folio),
              auxiliaryRut: doc.rutReceptor,
              auxiliaryName: doc.razonSocialReceptor,
              issueDate: doc.fechaEmision,
              originalAmount: total,
              paidAmount: paid,
              openBalance: pending,
              source: 'RCV'
            });
          }
        }
      }
    }

    // 2. Gather from Accounting Vouchers (Lines with open balances)
    const lineBalancesMap = new Map<string, {
      docType: string;
      docNumber: string;
      auxiliaryRut: string;
      auxiliaryName: string;
      issueDate: string;
      debitSum: number;
      creditSum: number;
    }>();

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      v.lines?.forEach(l => {
        if (l.accountId === accId || l.accountCode === accCode) {
          const rut = l.auxiliaryRut || '';
          const docRefStr = l.documentRef || 'S/N';
          const key = `${rut}__${docRefStr}`;
          
          const current = lineBalancesMap.get(key) || {
            docType: 'DTE',
            docNumber: docRefStr,
            auxiliaryRut: rut,
            auxiliaryName: l.auxiliaryName || '',
            issueDate: v.date,
            debitSum: 0,
            creditSum: 0
          };

          current.debitSum += Number(l.debit) || 0;
          current.creditSum += Number(l.credit) || 0;
          lineBalancesMap.set(key, current);
        }
      });
    });

    lineBalancesMap.forEach((data, key) => {
      const netBalance = isAP ? (data.creditSum - data.debitSum) : (data.debitSum - data.creditSum);
      if (netBalance > 0) {
        // Avoid duplicate if already in RCV list
        const existsInRcv = items.some(i => i.docNumber === data.docNumber && i.auxiliaryRut === data.auxiliaryRut);
        if (!existsInRcv) {
          items.push({
            id: `voucher_${key}`,
            docType: data.docType,
            docNumber: data.docNumber,
            auxiliaryRut: data.auxiliaryRut,
            auxiliaryName: data.auxiliaryName,
            issueDate: data.issueDate,
            originalAmount: isAP ? data.creditSum : data.debitSum,
            paidAmount: isAP ? data.debitSum : data.creditSum,
            openBalance: netBalance,
            source: 'VOUCHER'
          });
        }
      }
    });

    return items;
  }, [selectedAccount, isAP, rcvDocuments, vouchers]);

  // Filtered open items based on docSearch or selected auxiliary
  const filteredOpenItems = useMemo(() => {
    let result = openItems;
    if (selectedAuxiliaryRut) {
      const cleanSel = (selectedAuxiliaryRut || '').replace(/\./g, '').toUpperCase();
      result = result.filter(i => (i.auxiliaryRut || '').replace(/\./g, '').toUpperCase().includes(cleanSel));
    }
    if (docSearch.trim()) {
      const q = docSearch.trim().toLowerCase();
      result = result.filter(i =>
        (i.docNumber || '').toLowerCase().includes(q) ||
        (i.auxiliaryName || '').toLowerCase().includes(q) ||
        (i.auxiliaryRut || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [openItems, selectedAuxiliaryRut, docSearch]);

  // Total allocated amount from checked open documents
  const totalAllocatedAmount = useMemo(() => {
    return Object.values(selectedDocIds).reduce((s, val) => s + (val || 0), 0);
  }, [selectedDocIds]);

  // Toggle open document selection
  const handleToggleDocSelect = (item: OpenAccountItem) => {
    setSelectedDocIds(prev => {
      const copy = { ...prev };
      if (copy[item.id] !== undefined) {
        delete copy[item.id];
      } else {
        // Calculate recommended amount to allocate
        const alreadyAllocated = Object.values(copy).reduce((s, v) => s + v, 0);
        const remainingBank = Math.max(0, bankAmount - alreadyAllocated);
        const alloc = remainingBank > 0 ? Math.min(item.openBalance, remainingBank) : item.openBalance;
        copy[item.id] = alloc;

        // Auto-complete all analysis fields to eliminate manual typing
        if (item.auxiliaryRut) {
          setSelectedAuxiliaryRut(item.auxiliaryRut);
          setSelectedAuxiliaryName(item.auxiliaryName || '');
        }
        if (item.docNumber) {
          setDocumentRef(item.docNumber);
        }
        if (item.dueDate) {
          setDueDate(item.dueDate);
        } else if (item.issueDate) {
          setDueDate(item.issueDate);
        }
        if (item.costCenter) setCostCenter(item.costCenter);
        if (item.expenseItem) setExpenseItem(item.expenseItem);
        if (item.project) setProject(item.project);
        if (item.product) setProduct(item.product);
      }
      return copy;
    });
  };

  // Auto-allocate full bank line across open documents
  const handleAutoAllocateBankAmount = () => {
    let remaining = bankAmount;
    const newSelected: { [docId: string]: number } = {};

    const itemsToProcess = filteredOpenItems.length > 0 ? filteredOpenItems : openItems;
    for (const item of itemsToProcess) {
      if (remaining <= 0) break;
      const alloc = Math.min(item.openBalance, remaining);
      newSelected[item.id] = alloc;
      remaining -= alloc;
    }

    setSelectedDocIds(newSelected);
    setValidationError(null);

    // Populate Auxiliar from first allocated document
    const firstSelectedId = Object.keys(newSelected)[0];
    if (firstSelectedId) {
      const firstItem = openItems.find(i => i.id === firstSelectedId);
      if (firstItem && firstItem.auxiliaryRut) {
        setSelectedAuxiliaryRut(firstItem.auxiliaryRut);
        setSelectedAuxiliaryName(firstItem.auxiliaryName);
        setDocumentRef(firstItem.docNumber);
      }
    }
  };

  // Submit and validate form
  const handleSubmit = async () => {
    setValidationError(null);

    if (!selectedAccount) {
      setValidationError('⚠️ Debe seleccionar una Cuenta Contable de Contrapartida.');
      return;
    }

    if (!selectedBankAccount) {
      setValidationError('⚠️ No se ha seleccionado una Cuenta Bancaria de origen.');
      return;
    }

    // MANDATORY ANALYSIS VALIDATIONS ACCORDING TO PLAN DE CUENTAS
    const missingRequirements: string[] = [];

    if (selectedAccount.requiereAuxiliarRUT && !selectedAuxiliaryRut.trim()) {
      missingRequirements.push('RUT / Nombre Auxiliar (Cliente, Proveedor, Trabajador)');
    }

    const selectedDocsList = Object.keys(selectedDocIds);
    if (selectedAccount.requiereDocumento && selectedDocsList.length === 0 && !documentRef.trim()) {
      missingRequirements.push('N° Documento / Folio Referencia');
    }

    if (selectedAccount.requiereVencimiento && !dueDate.trim()) {
      missingRequirements.push('Fecha de Vencimiento');
    }

    if (selectedAccount.requiereCentroCosto && !costCenter.trim()) {
      missingRequirements.push('Centro de Costos');
    }

    if (selectedAccount.requiereItemGasto && !expenseItem.trim()) {
      missingRequirements.push('Ítem de Gasto');
    }

    if (selectedAccount.requiereProyecto && !project.trim()) {
      missingRequirements.push('Proyecto / Obra');
    }

    if (selectedAccount.requiereProducto && !product.trim()) {
      missingRequirements.push('Producto / Servicio');
    }

    // Custom required columns validation
    customColumns.forEach(col => {
      if (isCustomAttrRequired(col) && !customAnalyses[col]?.trim()) {
        missingRequirements.push(`Atributo Personalizado: ${col}`);
      }
    });

    if (missingRequirements.length > 0) {
      setValidationError(
        `⚠️ CAMPOS OBLIGATORIOS REQUERIDOS:\n\n` +
        `La cuenta contable [${selectedAccount.code} - ${selectedAccount.name}] exige los siguientes análisis de forma OBLIGATORIA según el Plan de Cuentas:\n\n` +
        missingRequirements.map(m => `• ${m}`).join('\n')
      );
      return;
    }

    // Check if new Auxiliary needs to be saved to master list
    let newAuxToSave: Auxiliary | undefined;
    if (selectedAuxiliaryRut.trim()) {
      const cleanRut = selectedAuxiliaryRut.trim().toUpperCase();
      const existing = auxiliaries.find(a => a.rut.replace(/\./g, '').toUpperCase() === cleanRut.replace(/\./g, '').toUpperCase());
      if (!existing) {
        newAuxToSave = {
          id: `aux_${Date.now()}`,
          rut: selectedAuxiliaryRut.trim(),
          name: selectedAuxiliaryName.trim() || selectedAuxiliaryRut.trim(),
          role: isAP ? 'Acreedor' : 'Deudor',
          estado: 'Activo'
        };
      }
    }

    // Construct Voucher Lines
    const lines: VoucherLine[] = [];
    const defaultGloss = quickGloss.trim() || quickVoucherLine.description;

    // Line 1: Bank Account Line
    if (isCharge) {
      // Cargo = Egreso -> Credit Bank Account
      lines.push({
        id: 'line_bank',
        accountId: selectedBankAccount.id,
        accountCode: selectedBankAccount.code,
        accountName: selectedBankAccount.name,
        debit: 0,
        credit: bankAmount,
        documentRef: quickVoucherLine.documentNumber || 'BANCO',
        bankDocRef: quickVoucherLine.documentNumber || 'BANCO',
        gloss: defaultGloss
      });
    } else {
      // Abono = Ingreso -> Debit Bank Account
      lines.push({
        id: 'line_bank',
        accountId: selectedBankAccount.id,
        accountCode: selectedBankAccount.code,
        accountName: selectedBankAccount.name,
        debit: bankAmount,
        credit: 0,
        documentRef: quickVoucherLine.documentNumber || 'BANCO',
        bankDocRef: quickVoucherLine.documentNumber || 'BANCO',
        gloss: defaultGloss
      });
    }

    // Line(s) 2+: Counterpart Account Lines
    if (selectedDocsList.length > 0) {
      // Generate individual line for each selected document
      selectedDocsList.forEach((docId, index) => {
        const docItem = openItems.find(i => i.id === docId);
        const amt = selectedDocIds[docId] || 0;
        if (amt <= 0) return;

        const docRefValue = docItem ? docItem.docNumber : documentRef;
        const auxRutValue = docItem ? docItem.auxiliaryRut : selectedAuxiliaryRut;
        const auxNameValue = docItem ? docItem.auxiliaryName : selectedAuxiliaryName;

        lines.push({
          id: `line_counter_${index + 1}`,
          accountId: selectedAccount.id,
          accountCode: selectedAccount.code,
          accountName: selectedAccount.name,
          debit: isCharge ? amt : 0,
          credit: isCharge ? 0 : amt,
          auxiliaryRut: auxRutValue,
          auxiliaryName: auxNameValue,
          documentRef: docRefValue,
          dueDate: docItem?.dueDate || dueDate || undefined,
          costCenter: costCenter || undefined,
          expenseItem: expenseItem || undefined,
          project: project || undefined,
          product: product || undefined,
          customAnalyses: Object.keys(customAnalyses).length > 0 ? customAnalyses : undefined,
          gloss: `Pago ${docItem?.docType || 'Doc'} N° ${docRefValue} - ${defaultGloss}`
        });
      });
    } else {
      // Single line for Counterpart Account
      lines.push({
        id: 'line_counter_1',
        accountId: selectedAccount.id,
        accountCode: selectedAccount.code,
        accountName: selectedAccount.name,
        debit: isCharge ? bankAmount : 0,
        credit: isCharge ? 0 : bankAmount,
        auxiliaryRut: selectedAuxiliaryRut || undefined,
        auxiliaryName: selectedAuxiliaryName || undefined,
        documentRef: documentRef || quickVoucherLine.documentNumber || 'S/N',
        dueDate: dueDate || undefined,
        costCenter: costCenter || undefined,
        expenseItem: expenseItem || undefined,
        project: project || undefined,
        product: product || undefined,
        customAnalyses: Object.keys(customAnalyses).length > 0 ? customAnalyses : undefined,
        gloss: defaultGloss
      });
    }

    if (onPostVoucherWithLines) {
      await onPostVoucherWithLines({
        period: quickVoucherPeriod,
        gloss: defaultGloss,
        counterAccountId: selectedAccount.id,
        lines,
        newAuxiliaryToSave: newAuxToSave
      });
    } else if (onPost) {
      onPost();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-auto overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center shadow-sm">
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
              <span>⚡</span> Contabilizar Partida Bancaria Automática
            </h4>
            <p className="text-xs text-indigo-200 mt-0.5">
              Imputación directa con validación estricta de análisis según Plan de Cuentas
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white text-lg font-bold px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Bank Movement Card */}
          <div className="bg-gradient-to-r from-slate-50 to-indigo-50/40 p-3.5 rounded-xl border border-indigo-100 flex flex-wrap justify-between items-center gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <span>🏦 Banco:</span>
                <span className="bg-white px-2 py-0.5 rounded border font-mono text-indigo-950">
                  {selectedBankAccount ? `${selectedBankAccount.code} - ${selectedBankAccount.name}` : 'No seleccionado'}
                </span>
              </div>
              <div className="text-slate-600">
                <span className="font-bold">Glosa Banco:</span> {quickVoucherLine.description}
              </div>
              <div className="text-slate-500 text-[11px]">
                <span className="font-bold">Fecha Movimiento:</span> {quickVoucherLine.date} |{' '}
                <span className="font-bold">N° Transf / Folio:</span> {quickVoucherLine.documentNumber || 'S/N'}
              </div>
            </div>
            <div className="text-right bg-white px-4 py-2 rounded-xl border border-indigo-200 shadow-2xs">
              <div className="text-[11px] uppercase font-bold text-slate-500">Monto Movimiento</div>
              <div className={`text-base font-black font-mono ${isCharge ? 'text-rose-600' : 'text-emerald-600'}`}>
                ${bankAmount.toLocaleString('es-CL')}
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                {isCharge ? '🔴 Cargo / Egreso Bancario' : '🟢 Abono / Ingreso Bancario'}
              </div>
            </div>
          </div>

          {/* Account & Period Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block font-bold text-slate-800 mb-1">
                📅 Período Contable Imputación:
              </label>
              <input
                type="month"
                value={quickVoucherPeriod}
                onChange={(e) => setQuickVoucherPeriod(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-slate-800 mb-1">
                📊 Cuenta Contable de Contrapartida: <span className="text-rose-600 font-bold">*</span>
              </label>
              <select
                value={quickExpenseAccountId}
                onChange={(e) => {
                  setQuickExpenseAccountId(e.target.value);
                  setValidationError(null);
                  setSelectedDocIds({});
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-medium text-xs focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Seleccionar Cuenta de Contrapartida --</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Account Requirements Summary Bar */}
          {selectedAccount && (
            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5">
              <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                <span>📋 Exigencias de Análisis según Plan de Cuentas:</span>
                <span className="font-mono bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded text-[11px]">
                  {selectedAccount.code}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedAccount.requiereAuxiliarRUT ? (
                  <span className="px-2 py-0.5 bg-indigo-600 text-white rounded font-bold text-[10px] shadow-2xs">
                    ⚠️ Exige Auxiliar / RUT
                  </span>
                ) : null}
                {selectedAccount.requiereDocumento ? (
                  <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-bold text-[10px] shadow-2xs">
                    ⚠️ Exige N° Documento
                  </span>
                ) : null}
                {selectedAccount.requiereCentroCosto ? (
                  <span className="px-2 py-0.5 bg-amber-600 text-white rounded font-bold text-[10px] shadow-2xs">
                    ⚠️ Exige Centro de Costos
                  </span>
                ) : null}
                {selectedAccount.requiereVencimiento ? (
                  <span className="px-2 py-0.5 bg-purple-600 text-white rounded font-bold text-[10px] shadow-2xs">
                    ⚠️ Exige Vencimiento
                  </span>
                ) : null}
                {selectedAccount.requiereItemGasto ? (
                  <span className="px-2 py-0.5 bg-orange-600 text-white rounded font-bold text-[10px] shadow-2xs">
                    ⚠️ Exige Ítem Gasto
                  </span>
                ) : null}
                {selectedAccount.requiereProyecto ? (
                  <span className="px-2 py-0.5 bg-teal-600 text-white rounded font-bold text-[10px] shadow-2xs">
                    ⚠️ Exige Proyecto
                  </span>
                ) : null}
                {selectedAccount.requiereProducto ? (
                  <span className="px-2 py-0.5 bg-indigo-800 text-white rounded font-bold text-[10px] shadow-2xs">
                    ⚠️ Exige Producto
                  </span>
                ) : null}
                {customColumns.map(col => {
                  if (isCustomAttrRequired(col)) {
                    return (
                      <span key={col} className="px-2 py-0.5 bg-slate-700 text-white rounded font-bold text-[10px] shadow-2xs">
                        ⚠️ Exige {col}
                      </span>
                    );
                  }
                  return null;
                })}
                {!selectedAccount.requiereAuxiliarRUT &&
                  !selectedAccount.requiereDocumento &&
                  !selectedAccount.requiereCentroCosto &&
                  !selectedAccount.requiereVencimiento &&
                  !selectedAccount.requiereItemGasto &&
                  !selectedAccount.requiereProyecto &&
                  !selectedAccount.requiereProducto && (
                    <span className="text-slate-500 italic text-[11px]">
                      Esta cuenta no tiene análisis configurados como obligatorios. Puedes ingresarlos de forma opcional.
                    </span>
                  )}
              </div>
            </div>
          )}

          {/* Section: "Lo que compone la cuenta" - Open Documents Table */}
          {selectedAccount && (
            <div className="space-y-3 border border-slate-200 p-4 rounded-xl bg-white shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                <div>
                  <h5 className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
                    <span>📑</span> Composición de la Cuenta / Documentos Pendientes por {isAP ? 'Pagar (Proveedores)' : 'Cobrar (Clientes / Préstamos)'}
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    Selecciona una o más facturas/documentos para registrarlos como pagados por este movimiento bancario
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAutoAllocateBankAmount}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center gap-1 self-start sm:self-auto"
                >
                  <span>⚡</span> Pagar/Cobrar Saldo Banco (${bankAmount.toLocaleString('es-CL')})
                </button>
              </div>

              {/* Table Search & Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Filtrar por N° Folio, RUT o Nombre..."
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5"
                />
                <div className="flex justify-end items-center text-[11px] text-slate-600 font-medium">
                  {openItems.length} documento(s) pendiente(s) en total
                </div>
              </div>

              {/* Document List Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-56">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b">
                    <tr>
                      <th className="p-2 text-center w-8">Select</th>
                      <th className="p-2">N° Documento</th>
                      <th className="p-2">Auxiliar (RUT y Nombre)</th>
                      <th className="p-2">Fecha</th>
                      <th className="p-2 text-right">Saldo Pendiente</th>
                      <th className="p-2 text-right">Monto a Aplicar ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono">
                    {filteredOpenItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 font-sans italic">
                          No se encontraron facturas o comprobantes pendientes en esta cuenta. Puedes ingresar el pago o préstamo directamente completando los análisis a continuación.
                        </td>
                      </tr>
                    ) : (
                      filteredOpenItems.map(item => {
                        const isSelected = selectedDocIds[item.id] !== undefined;
                        const currentAmt = selectedDocIds[item.id] || 0;

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-indigo-50/40 transition-colors ${isSelected ? 'bg-indigo-50/80 font-bold' : ''}`}
                          >
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleDocSelect(item)}
                                className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-2 font-bold text-indigo-900">
                              {item.docType} {item.docNumber}
                              {item.source === 'RCV' && (
                                <span className="ml-1 text-[9px] font-sans font-semibold bg-blue-100 text-blue-800 px-1 rounded">RCV</span>
                              )}
                            </td>
                            <td className="p-2 font-sans truncate max-w-[200px]" title={`${item.auxiliaryRut} - ${item.auxiliaryName}`}>
                              <span className="font-bold">{item.auxiliaryRut}</span> {item.auxiliaryName}
                            </td>
                            <td className="p-2 text-slate-600">{item.issueDate}</td>
                            <td className="p-2 text-right font-bold text-slate-900">
                              ${item.openBalance.toLocaleString('es-CL')}
                            </td>
                            <td className="p-2 text-right">
                              {isSelected ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={item.openBalance}
                                  value={currentAmt || ''}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setSelectedDocIds(prev => ({ ...prev, [item.id]: val }));
                                  }}
                                  className="w-28 text-right bg-white border border-indigo-400 rounded p-1 font-bold text-indigo-950 focus:ring-1 focus:ring-indigo-500"
                                />
                              ) : (
                                <span className="text-slate-400 font-sans italic">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Selection Math Summary */}
              {Object.keys(selectedDocIds).length > 0 && (
                <div className="p-3 bg-slate-900 text-white rounded-xl flex flex-wrap justify-between items-center text-xs gap-2">
                  <div>
                    <span className="text-slate-300 font-medium">Documentos Seleccionados:</span>{' '}
                    <strong className="text-indigo-300">{Object.keys(selectedDocIds).length}</strong>
                  </div>
                  <div className="flex gap-4 font-mono font-bold">
                    <div>
                      <span className="text-slate-400">Total Aplicado:</span>{' '}
                      <span className="text-emerald-400">${totalAllocatedAmount.toLocaleString('es-CL')}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Monto Banco:</span>{' '}
                      <span className="text-indigo-200">${bankAmount.toLocaleString('es-CL')}</span>
                    </div>
                    <div>
                      {totalAllocatedAmount === bankAmount ? (
                        <span className="text-emerald-300 font-sans font-black">✓ Calce Perfecto</span>
                      ) : (
                        <span className="text-amber-300 font-sans">
                          Diferencia: ${Math.abs(bankAmount - totalAllocatedAmount).toLocaleString('es-CL')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section: Detailed Analysis Inputs (RUT, DocRef, CC, ExpenseItem, etc.) */}
          {selectedAccount && (
            <div className="space-y-3 border border-slate-200 p-4 rounded-xl bg-slate-50/70 shadow-2xs">
              <h5 className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5 border-b pb-2">
                <span>📝</span> Atributos y Datos de Análisis Requeridos
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Auxiliar RUT & Nombre */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    👤 Auxiliar (RUT y Razón Social):
                    {selectedAccount.requiereAuxiliarRUT && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  {auxiliaries.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        value={selectedAuxiliaryRut}
                        onChange={(e) => handleRutChange(e.target.value)}
                        className={`border p-2 w-full rounded-lg text-xs ${
                          selectedAccount.requiereAuxiliarRUT && !selectedAuxiliaryRut ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                        }`}
                      >
                        <option value="">-- Seleccionar Auxiliar Existente --</option>
                        {auxiliaries.map(aux => (
                          <option key={aux.id || aux.rut} value={aux.rut}>
                            {aux.rut} - {aux.name} ({aux.role})
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          placeholder="RUT Ej. 76.123.456-7"
                          value={selectedAuxiliaryRut}
                          onChange={(e) => setSelectedAuxiliaryRut(e.target.value)}
                          className="border border-slate-300 p-1.5 rounded text-xs bg-white font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Razón Social / Nombre"
                          value={selectedAuxiliaryName}
                          onChange={(e) => setSelectedAuxiliaryName(e.target.value)}
                          className="border border-slate-300 p-1.5 rounded text-xs bg-white"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        placeholder="RUT Ej. 76.123.456-7"
                        value={selectedAuxiliaryRut}
                        onChange={(e) => setSelectedAuxiliaryRut(e.target.value)}
                        className={`border p-2 w-full rounded-lg font-mono ${
                          selectedAccount.requiereAuxiliarRUT && !selectedAuxiliaryRut ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Razón Social / Nombre"
                        value={selectedAuxiliaryName}
                        onChange={(e) => setSelectedAuxiliaryName(e.target.value)}
                        className="border border-slate-300 p-2 w-full rounded-lg bg-white"
                      />
                    </div>
                  )}
                </div>

                {/* 2. N° Documento de Referencia */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    📄 N° Documento / Folio / Referencia:
                    {selectedAccount.requiereDocumento && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Factura N° 1024, Folio 55, Préstamo 101"
                    value={documentRef}
                    onChange={(e) => setDocumentRef(e.target.value)}
                    className={`border p-2 w-full rounded-lg text-xs ${
                      selectedAccount.requiereDocumento && Object.keys(selectedDocIds).length === 0 && !documentRef ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                    }`}
                  />
                </div>

                {/* 3. Fecha Vencimiento */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    📅 Fecha de Vencimiento:
                    {selectedAccount.requiereVencimiento && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={`border p-2 w-full rounded-lg text-xs ${
                      selectedAccount.requiereVencimiento && !dueDate ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                    }`}
                  />
                </div>

                {/* 4. Centro de Costos */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    🏢 Centro de Costos:
                    {selectedAccount.requiereCentroCosto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  {costCenters.length > 0 ? (
                    <select
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereCentroCosto && !costCenter ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    >
                      <option value="">-- Seleccionar Centro de Costo --</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.code}>
                          {cc.code} - {cc.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ej. ADMINISTRACION, VENTAS"
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereCentroCosto && !costCenter ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    />
                  )}
                </div>

                {/* 5. Ítem de Gasto */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    🏷️ Ítem de Gasto:
                    {selectedAccount.requiereItemGasto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  {expenseItems.length > 0 ? (
                    <select
                      value={expenseItem}
                      onChange={(e) => setExpenseItem(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereItemGasto && !expenseItem ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    >
                      <option value="">-- Seleccionar Ítem Gasto --</option>
                      {expenseItems.map(item => (
                        <option key={item.id} value={item.code}>
                          {item.code} - {item.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ej. COMBUSTIBLES, ARRIENDOS"
                      value={expenseItem}
                      onChange={(e) => setExpenseItem(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereItemGasto && !expenseItem ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    />
                  )}
                </div>

                {/* 6. Proyecto */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    🏗️ Proyecto / Obra:
                    {selectedAccount.requiereProyecto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  {projects.length > 0 ? (
                    <select
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereProyecto && !project ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    >
                      <option value="">-- Seleccionar Proyecto --</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.code}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ej. OBRA COSTANERA"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereProyecto && !project ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    />
                  )}
                </div>

                {/* 7. Producto */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    📦 Producto / Servicio:
                    {selectedAccount.requiereProducto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  {products.length > 0 ? (
                    <select
                      value={product}
                      onChange={(e) => setProduct(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereProducto && !product ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    >
                      <option value="">-- Seleccionar Producto --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.code}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ej. MERCADERIA"
                      value={product}
                      onChange={(e) => setProduct(e.target.value)}
                      className={`border p-2 w-full rounded-lg text-xs ${
                        selectedAccount.requiereProducto && !product ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    />
                  )}
                </div>

                {/* Dynamic Custom Analyses */}
                {customColumns.map(col => {
                  const isReq = isCustomAttrRequired(col);
                  const val = customAnalyses[col] || '';
                  const colItems = customAnalysisItems.filter(item => (item.analysisColumnName === col || (item as any).analysisName === col) && item.estado !== 'Inactivo');

                  return (
                    <div key={col}>
                      <label className="font-bold text-slate-800 block mb-1">
                        ⚙️ {col}:
                        {isReq && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                      </label>
                      {colItems.length > 0 ? (
                        <select
                          value={val}
                          onChange={(e) => setCustomAnalyses(prev => ({ ...prev, [col]: e.target.value }))}
                          className={`border p-2 w-full rounded-lg text-xs ${isReq && !val ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                        >
                          <option value="">-- Seleccionar {col} --</option>
                          {colItems.map(item => (
                            <option key={item.id} value={item.code}>
                              {item.code} - {item.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder={`Valor para ${col}...`}
                          value={val}
                          onChange={(e) => setCustomAnalyses(prev => ({ ...prev, [col]: e.target.value }))}
                          className={`border p-2 w-full rounded-lg text-xs ${isReq && !val ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Glosa del Asiento */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="block font-bold text-slate-800 mb-1">
              ✏️ Glosa General del Comprobante:
            </label>
            <input
              type="text"
              value={quickGloss}
              onChange={(e) => setQuickGloss(e.target.value)}
              placeholder="Descripción del asiento contable..."
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          {/* Validation Error Alert Banner */}
          {validationError && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 text-xs font-medium space-y-1 shadow-xs animate-shake">
              <div className="font-bold text-rose-950 text-xs flex items-center gap-1.5">
                <span className="text-base">🚨</span> ERROR DE VALIDACIÓN DE ANÁLISIS
              </div>
              <pre className="font-sans whitespace-pre-wrap leading-relaxed">{validationError}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
          >
            <span>✓</span> Crear Asiento, Conciliar y Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
