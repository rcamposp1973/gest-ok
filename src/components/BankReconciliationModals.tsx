import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  CustomAnalysisTableItem,
  FiscalPeriodYear
} from '../types';
import { getNextOpenPeriodAndDate, checkIsPeriodClosed } from '../utils/periodUtils';
import { SearchableAuxiliarySelect } from './SearchableAuxiliarySelect';
import {
  Plus,
  Trash2,
  Split,
  Sparkles,
  Building,
  AlertCircle,
  CheckCircle2,
  Calculator,
  ChevronRight,
  Layers,
  ArrowRight
} from 'lucide-react';

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

export function ImportCSVModal(props: ImportCSVModalProps) {
  if (!props.isOpen) return null;
  return <ImportCSVModalContent {...props} />;
}

function ImportCSVModalContent({
  onClose,
  pastedCSV,
  setPastedCSV,
  importInitialBalance,
  setImportInitialBalance,
  onImport,
  currentPeriod
}: ImportCSVModalProps) {
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

export function ManualMatchModal(props: ManualMatchModalProps) {
  if (!props.manualMatchLine) return null;
  return <ManualMatchModalContent {...props} manualMatchLine={props.manualMatchLine} />;
}

function ManualMatchModalContent({
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
}: ManualMatchModalProps & { manualMatchLine: BankStatementLine }) {
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

export interface MultiAccountLineItem {
  id: string;
  accountId: string;
  amount: number;
  gloss: string;
  auxiliaryRut: string;
  auxiliaryName: string;
  documentRef: string;
  dueDate: string;
  costCenter: string;
  expenseItem: string;
  project: string;
  product: string;
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
  fiscalYears?: FiscalPeriodYear[];
  onPostVoucherWithLines: (voucherData: {
    period: string;
    date?: string;
    gloss: string;
    counterAccountId: string;
    lines: VoucherLine[];
    newAuxiliaryToSave?: Auxiliary;
  }) => Promise<void>;
  onPost?: () => void;
}

export function QuickVoucherModal(props: QuickVoucherModalProps) {
  if (!props.quickVoucherLine) return null;
  return <QuickVoucherModalContent {...props} quickVoucherLine={props.quickVoucherLine} />;
}

function QuickVoucherModalContent({
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
  fiscalYears = [],
  onPostVoucherWithLines,
  onPost
}: QuickVoucherModalProps & { quickVoucherLine: BankStatementLine }) {
  const isCharge = quickVoucherLine.charge > 0;
  const bankAmount = isCharge ? quickVoucherLine.charge : quickVoucherLine.deposit;

  // Compute automatic date shift if original period is closed
  const effectiveShiftInfo = useMemo(() => {
    return getNextOpenPeriodAndDate(quickVoucherLine.date, fiscalYears);
  }, [quickVoucherLine, fiscalYears]);

  const [voucherDate, setVoucherDate] = useState<string>(
    effectiveShiftInfo?.date || quickVoucherLine?.date || ''
  );

  useEffect(() => {
    const shift = getNextOpenPeriodAndDate(quickVoucherLine.date, fiscalYears);
    setVoucherDate(shift.date);
    setQuickVoucherPeriod(shift.period);
  }, [quickVoucherLine, fiscalYears, setQuickVoucherPeriod]);

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

  // Determine specialized account nature to link with the corresponding document type
  const isHonorarios = useMemo(() => {
    if (!selectedAccount) return false;
    const name = (selectedAccount.name || '').toLowerCase();
    const code = (selectedAccount.code || '').replace(/\./g, '');
    return name.includes('honorario') || name.includes('bhe') || name.includes('bhr') || code === '2101003' || (code.startsWith('2101') && name.includes('honorario'));
  }, [selectedAccount]);

  const isProveedores = useMemo(() => {
    if (!selectedAccount) return false;
    if (isHonorarios) return false;
    const name = (selectedAccount.name || '').toLowerCase();
    const code = (selectedAccount.code || '').replace(/\./g, '');
    return (
      name.includes('proveedor') ||
      name.includes('facturas por pagar') ||
      name.includes('factura por pagar') ||
      name.includes('cuentas por pagar') ||
      name.includes('cuenta por pagar') ||
      name.includes('acreedores comerciales') ||
      code === '2101001' ||
      (code.startsWith('2101') && !name.includes('honorario') && !name.includes('retencion'))
    );
  }, [selectedAccount, isHonorarios]);

  const isClientes = useMemo(() => {
    if (!selectedAccount) return false;
    const name = (selectedAccount.name || '').toLowerCase();
    const code = (selectedAccount.code || '').replace(/\./g, '');
    return (
      name.includes('cliente') ||
      name.includes('facturas por cobrar') ||
      name.includes('factura por cobrar') ||
      name.includes('cuentas por cobrar') ||
      name.includes('cuenta por cobrar') ||
      name.includes('deudores') ||
      code.startsWith('1102') ||
      code === '1102001' ||
      code === '1102002'
    );
  }, [selectedAccount]);

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

  // Multi-Account state & helpers for Previred, payroll, and multiple accounts
  const isLikelyPrevired = useMemo(() => {
    const desc = (quickVoucherLine?.description || '').toLowerCase();
    return desc.includes('previred') || desc.includes('cotizac') || desc.includes('imposic') || desc.includes('leyes soc') || desc.includes('afp');
  }, [quickVoucherLine]);

  const [voucherMode, setVoucherMode] = useState<'SINGLE' | 'MULTI'>(
    isLikelyPrevired ? 'MULTI' : 'SINGLE'
  );
  const [multiLines, setMultiLines] = useState<MultiAccountLineItem[]>([]);

  // Calculate multi-account total and difference
  const multiTotalAmount = useMemo(() => {
    return multiLines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [multiLines]);

  const multiDifference = bankAmount - multiTotalAmount;

  // Add line to multi-account table
  const handleAddMultiLine = useCallback((customAccId?: string, customGloss?: string) => {
    setMultiLines(prev => [
      ...prev,
      {
        id: `multi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        accountId: customAccId || '',
        amount: 0,
        gloss: (customGloss || quickGloss || quickVoucherLine?.description || '').toUpperCase(),
        auxiliaryRut: '',
        auxiliaryName: '',
        documentRef: (quickVoucherLine?.documentNumber || '').toUpperCase(),
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      }
    ]);
  }, [quickGloss, quickVoucherLine]);

  // Remove line from multi-account table
  const handleRemoveMultiLine = useCallback((id: string) => {
    setMultiLines(prev => prev.filter(item => item.id !== id));
  }, []);

  // Update field of a multi-account line
  const handleUpdateMultiLine = useCallback((id: string, field: keyof MultiAccountLineItem, value: any) => {
    setMultiLines(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'accountId') {
        const acc = accounts.find(a => a.id === value);
        if (!acc?.requiereAuxiliarRUT && !item.auxiliaryRut) {
          updated.auxiliaryRut = '';
          updated.auxiliaryName = '';
        }
      }
      return updated;
    }));
  }, [accounts]);

  // Fill remaining bank balance into a specific line
  const handleFillRemaining = useCallback((index: number) => {
    setMultiLines(prev => {
      const copy = [...prev];
      const otherSum = copy.reduce((sum, item, idx) => idx === index ? sum : sum + (Number(item.amount) || 0), 0);
      const remainder = Math.max(0, bankAmount - otherSum);
      copy[index] = { ...copy[index], amount: remainder };
      return copy;
    });
  }, [bankAmount]);

  // Quick Preset: PREVIRED (AFP, Salud, AFC, Mutual, CCAF)
  const handleLoadPreviredTemplate = useCallback(() => {
    const findAcc = (keywords: string[]) => {
      const p1 = accounts.find(a => {
        const code = (a.code || '').replace(/\./g, '');
        const name = (a.name || '').toLowerCase();
        return (code.startsWith('2') || (a.type || '').toLowerCase().includes('pasivo')) &&
          keywords.some(k => name.includes(k));
      });
      if (p1) return p1;
      return accounts.find(a => {
        const name = (a.name || '').toLowerCase();
        return keywords.some(k => name.includes(k));
      }) || null;
    };

    const afpAcc = findAcc(['afp', 'previs', 'pension', 'imposic']);
    const saludAcc = findAcc(['fonasa', 'isapre', 'salud']);
    const afcAcc = findAcc(['afc', 'cesant']);
    const mutualAcc = findAcc(['mutual', 'accidente', 'seguridad']);
    const cajaAcc = findAcc(['caja', 'ccaf', 'compensac']);

    const periodStr = quickVoucherPeriod || voucherDate.slice(0, 7) || 'PERIODO';
    const defaultGloss = `PAGO PREVIRED - ${periodStr}`;
    const defaultDoc = `PREVIRED-${periodStr.replace('-', '')}`;
    const previredRut = '77.012.340-9';
    const previredName = 'PREVIRED S.A.';

    const lines: MultiAccountLineItem[] = [
      {
        id: `multi_afp_${Date.now()}`,
        accountId: afpAcc?.id || '',
        amount: 0,
        gloss: `AFP COTIZACIONES PREVISIONALES - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: previredRut,
        auxiliaryName: previredName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      },
      {
        id: `multi_salud_${Date.now() + 1}`,
        accountId: saludAcc?.id || '',
        amount: 0,
        gloss: `SALUD FONASA / ISAPRE - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: previredRut,
        auxiliaryName: previredName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      },
      {
        id: `multi_afc_${Date.now() + 2}`,
        accountId: afcAcc?.id || '',
        amount: 0,
        gloss: `SEGURO DE CESANTIA AFC - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: previredRut,
        auxiliaryName: previredName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      },
      {
        id: `multi_mutual_${Date.now() + 3}`,
        accountId: mutualAcc?.id || '',
        amount: 0,
        gloss: `MUTUAL DE SEGURIDAD ACCIDENTES DEL TRABAJO - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: previredRut,
        auxiliaryName: previredName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      }
    ];

    if (cajaAcc) {
      lines.push({
        id: `multi_caja_${Date.now() + 4}`,
        accountId: cajaAcc.id,
        amount: 0,
        gloss: `CAJA DE COMPENSACION CCAF - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: previredRut,
        auxiliaryName: previredName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      });
    }

    setMultiLines(lines);
    setVoucherMode('MULTI');
    setQuickGloss(defaultGloss);
    setValidationError(null);
  }, [accounts, quickVoucherPeriod, voucherDate, setQuickGloss]);

  // Quick Preset: IMPUESTOS TGR F29
  const handleLoadTGRTemplate = useCallback(() => {
    const findAcc = (keywords: string[]) => {
      return accounts.find(a => {
        const name = (a.name || '').toLowerCase();
        return keywords.some(k => name.includes(k));
      }) || null;
    };

    const ivaAcc = findAcc(['iva debito', 'debito fiscal', 'iva por pagar', 'f29']);
    const ppmAcc = findAcc(['ppm', 'pago provisional']);
    const retAcc = findAcc(['retencion honorario', 'retencion bhe', 'retenciones por pagar']);

    const periodStr = quickVoucherPeriod || voucherDate.slice(0, 7) || 'PERIODO';
    const defaultGloss = `PAGO IMPUESTOS F29 TGR - ${periodStr}`;
    const defaultDoc = `F29-${periodStr.replace('-', '')}`;
    const tgrRut = '60.805.000-0';
    const tgrName = 'TESORERIA GENERAL DE LA REPUBLICA';

    const lines: MultiAccountLineItem[] = [
      {
        id: `multi_iva_${Date.now()}`,
        accountId: ivaAcc?.id || '',
        amount: 0,
        gloss: `IVA F29 POR PAGAR - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: tgrRut,
        auxiliaryName: tgrName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      },
      {
        id: `multi_ppm_${Date.now() + 1}`,
        accountId: ppmAcc?.id || '',
        amount: 0,
        gloss: `PPM POR PAGAR - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: tgrRut,
        auxiliaryName: tgrName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      },
      {
        id: `multi_ret_${Date.now() + 2}`,
        accountId: retAcc?.id || '',
        amount: 0,
        gloss: `RETENCION HONORARIOS BHE - ${defaultGloss}`.toUpperCase(),
        auxiliaryRut: tgrRut,
        auxiliaryName: tgrName,
        documentRef: defaultDoc,
        dueDate: '',
        costCenter: '',
        expenseItem: '',
        project: '',
        product: ''
      }
    ];

    setMultiLines(lines);
    setVoucherMode('MULTI');
    setQuickGloss(defaultGloss);
    setValidationError(null);
  }, [accounts, quickVoucherPeriod, voucherDate, setQuickGloss]);

  // Auto-init Previred preset if bank line is Previred
  useEffect(() => {
    if (isLikelyPrevired && multiLines.length === 0) {
      handleLoadPreviredTemplate();
    }
  }, [isLikelyPrevired, handleLoadPreviredTemplate, multiLines.length]);

  // Ordenar Centros de Costo e Ítems de Gasto alfabéticamente por código
  const sortedCostCenters = useMemo(() => {
    return [...costCenters].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  }, [costCenters]);

  const sortedExpenseItems = useMemo(() => {
    return [...expenseItems].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  }, [expenseItems]);

  // Auto-detect Auxiliary from Bank line description or match against master auxiliaries
  // IMPORTANTE: SOLO se detecta y muestra si la cuenta seleccionada tiene marcado el casillero auxiliar en el Plan de Cuentas
  useEffect(() => {
    if (!quickVoucherLine) return;
    
    // Si la cuenta no está seleccionada o NO requiere auxiliar en el plan de cuentas, se limpia y no se auto-asigna
    if (!selectedAccount || !selectedAccount.requiereAuxiliarRUT) {
      setSelectedAuxiliaryRut('');
      setSelectedAuxiliaryName('');
      return;
    }

    const desc = quickVoucherLine.description || '';
    
    // Check if description has RUT string (e.g. 76.123.456-7 or 76123456-7)
    const rutMatch = desc.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]|\d{7,8}-[\dkK])\b/i);
    if (rutMatch) {
      const cleanRut = rutMatch[1].toUpperCase();
      setSelectedAuxiliaryRut(cleanRut);
      const foundAux = auxiliaries.find(a => (a.rut || '').replace(/\./g, '').toUpperCase() === cleanRut.replace(/\./g, '').toUpperCase());
      if (foundAux) {
        setSelectedAuxiliaryName((foundAux.name || '').toUpperCase());
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
        setSelectedAuxiliaryRut((match.rut || '').toUpperCase());
        setSelectedAuxiliaryName((match.name || '').toUpperCase());
      }
    }
  }, [quickVoucherLine, auxiliaries, selectedAccount]);

  // Sync selected auxiliary name when RUT changes
  const handleRutChange = (rut: string) => {
    const cleanRut = (rut || '').toUpperCase();
    setSelectedAuxiliaryRut(cleanRut);
    const aux = auxiliaries.find(a => (a.rut || '').trim().toUpperCase() === cleanRut.trim());
    if (aux) {
      setSelectedAuxiliaryName((aux.name || '').toUpperCase());
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
  // UNIFIED ENGINE: Merge RCV and Accounting Vouchers with robust Folio and RUT normalization to completely prevent duplicates
  const openItems = useMemo<OpenAccountItem[]>(() => {
    if (!selectedAccount) return [];

    const items: OpenAccountItem[] = [];
    const accCode = selectedAccount.code;
    const accId = selectedAccount.id;

    // Helper: Normalize Folio to pure numeric string or standard code (e.g. "#201501", "DTE 34 #201501", "00201501" -> "201501")
    const normalizeFolio = (val: any): string => {
      if (val === undefined || val === null) return '';
      const s = String(val).trim();
      if (!s) return '';
      if (s.includes('#')) {
        const after = s.split('#').pop()?.trim() || '';
        const d = after.replace(/\D/g, '');
        if (d) return String(parseInt(d, 10));
      }
      const tokens = s.split(/[\s\-_\/]+/);
      for (let i = tokens.length - 1; i >= 0; i--) {
        const d = tokens[i].replace(/\D/g, '');
        if (d.length > 0) return String(parseInt(d, 10));
      }
      const allD = s.replace(/\D/g, '');
      if (allD) return String(parseInt(allD, 10));
      return s.toUpperCase();
    };

    // Helper: Normalize RUT (removes dots, hyphens, spaces: "99.012.000-5" -> "990120005")
    const normalizeRut = (rut: any): string => {
      if (!rut) return '';
      return String(rut).replace(/[^0-9kK]/g, '').toUpperCase().trim();
    };

    // Helper: Normalize Document Type ("DTE 34" -> "34", "33" -> "33", "70" -> "BHE")
    const normalizeDocType = (type: any): string => {
      if (!type) return '';
      const s = String(type).trim().toUpperCase();
      const d = s.replace(/\D/g, '');
      if (d) return d;
      if (s.includes('HONORAR') || s.includes('BHE') || s.includes('BHR')) return 'BHE';
      return s;
    };

    // 1. Gather & aggregate all lines from Accounting Vouchers on this account
    const lineBalancesMap = new Map<string, {
      rawDocType: string;
      rawDocNumber: string;
      rawRut: string;
      rawName: string;
      issueDate: string;
      dueDate?: string;
      costCenter?: string;
      expenseItem?: string;
      project?: string;
      product?: string;
      debitSum: number;
      creditSum: number;
      normRut: string;
      normFolio: string;
    }>();

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      v.lines?.forEach(l => {
        if (l.accountId === accId || l.accountCode === accCode) {
          const normRut = normalizeRut(l.auxiliaryRut);
          const normFolio = normalizeFolio(l.documentRef);
          const rawDocRef = (l.documentRef || 'S/N').trim();
          
          // Primary key by normalized RUT and normalized Folio
          const key = normFolio ? `${normRut}__${normFolio}` : `${normRut}__${rawDocRef}`;
          
          const current = lineBalancesMap.get(key) || {
            rawDocType: l.documentType || (isHonorarios ? 'BHE' : 'DTE 33'),
            rawDocNumber: rawDocRef,
            rawRut: l.auxiliaryRut || '',
            rawName: l.auxiliaryName || '',
            issueDate: v.date,
            dueDate: l.dueDate,
            costCenter: l.costCenter,
            expenseItem: l.expenseItem,
            project: l.project,
            product: l.product,
            debitSum: 0,
            creditSum: 0,
            normRut,
            normFolio
          };

          current.debitSum += Number(l.debit) || 0;
          current.creditSum += Number(l.credit) || 0;
          lineBalancesMap.set(key, current);
        }
      });
    });

    const matchedVoucherKeys = new Set<string>();

    // 2. Process RCV Documents (SII register: Compras, Honorarios, Ventas)
    if (rcvDocuments.length > 0) {
      let targetDocs: RCVDocument[] = [];
      if (isHonorarios) {
        targetDocs = rcvDocuments.filter(d => d.tipoRegistro === 'Honorarios' || d.tipoDoc === 'BHE' || d.tipoDoc === '70');
      } else if (isProveedores) {
        targetDocs = rcvDocuments.filter(d => d.tipoRegistro === 'Compra');
      } else if (isClientes) {
        targetDocs = rcvDocuments.filter(d => d.tipoRegistro === 'Venta');
      }

      for (const doc of targetDocs) {
        const isClientDoc = isClientes;
        const rawRut = isClientDoc ? doc.rutReceptor : doc.rutEmisor;
        const rawName = isClientDoc ? doc.razonSocialReceptor : doc.razonSocialEmisor;
        const normRut = normalizeRut(rawRut);
        const normFolio = normalizeFolio(doc.folio);
        const rcvKey = `${normRut}__${normFolio}`;

        let docTotal = 0;
        if (isHonorarios) {
          const bruto = Number(doc.montoBruto || doc.montoTotal || doc.montoNeto) || 0;
          const retencion = Number(doc.montoRetencion !== undefined ? doc.montoRetencion : (doc.montoIva || 0)) || 0;
          const liquido = Number(doc.montoLiquido !== undefined && doc.montoLiquido > 0 ? doc.montoLiquido : (bruto - retencion)) || 0;
          docTotal = liquido > 0 ? liquido : bruto;
        } else {
          docTotal = Number(doc.montoTotal) || 0;
        }
        if (docTotal <= 0) continue;

        // CASE A: The document has ALREADY been centralized / recorded in accounting vouchers
        const vEntry = lineBalancesMap.get(rcvKey);
        if (vEntry) {
          matchedVoucherKeys.add(rcvKey);
          const netBalance = isAP ? (vEntry.creditSum - vEntry.debitSum) : (vEntry.debitSum - vEntry.creditSum);
          
          // Only show if there is an open balance remaining in the accounting ledger
          if (netBalance > 0) {
            items.push({
              id: `unified_${rcvKey}`,
              docType: doc.tipoDoc ? String(doc.tipoDoc) : (vEntry.rawDocType || (isHonorarios ? 'BHE' : '33')),
              docNumber: doc.folio ? String(doc.folio) : vEntry.rawDocNumber,
              auxiliaryRut: rawRut || vEntry.rawRut,
              auxiliaryName: rawName || vEntry.rawName,
              issueDate: doc.fechaEmision || vEntry.issueDate,
              dueDate: vEntry.dueDate,
              costCenter: vEntry.costCenter,
              expenseItem: vEntry.expenseItem,
              project: vEntry.project,
              product: vEntry.product,
              originalAmount: docTotal > 0 ? docTotal : (isAP ? vEntry.creditSum : vEntry.debitSum),
              paidAmount: isAP ? vEntry.debitSum : vEntry.creditSum,
              openBalance: netBalance,
              source: 'VOUCHER'
            });
          }
          continue;
        }

        // CASE B: The document is in RCV, but has NOT yet been centralized into a voucher
        let paid = 0;
        vouchers.forEach(v => {
          if (v.status === 'Anulado') return;
          v.lines?.forEach(l => {
            if (l.accountId === accId || l.accountCode === accCode) {
              const isPayment = isAP ? ((Number(l.debit) || 0) > 0) : ((Number(l.credit) || 0) > 0);
              if (isPayment) {
                const lineRutNorm = normalizeRut(l.auxiliaryRut);
                const lineFolioNorm = normalizeFolio(l.documentRef);
                if (lineRutNorm === normRut && (!normFolio || lineFolioNorm === normFolio)) {
                  paid += isAP ? (Number(l.debit) || 0) : (Number(l.credit) || 0);
                }
              }
            }
          });
        });

        const pending = Math.max(0, docTotal - paid);
        if (pending > 0) {
          items.push({
            id: `rcv_${doc.id || doc.folio}_${normRut}`,
            docType: doc.tipoDoc ? String(doc.tipoDoc) : (isHonorarios ? 'BHE' : '33'),
            docNumber: String(doc.folio || ''),
            auxiliaryRut: rawRut || '',
            auxiliaryName: rawName || '',
            issueDate: doc.fechaEmision,
            originalAmount: docTotal,
            paidAmount: paid,
            openBalance: pending,
            source: 'RCV'
          });
        }
      }
    }

    // 3. Gather remaining Accounting Vouchers that were not matched to any RCV document
    // (e.g. manual entries, foreign supplier invoices, prior period balances)
    lineBalancesMap.forEach((data, key) => {
      if (matchedVoucherKeys.has(key)) return; // Already unified with RCV record

      const netBalance = isAP ? (data.creditSum - data.debitSum) : (data.debitSum - data.creditSum);
      if (netBalance > 0) {
        items.push({
          id: `voucher_${key}`,
          docType: data.rawDocType,
          docNumber: data.rawDocNumber,
          auxiliaryRut: data.rawRut,
          auxiliaryName: data.rawName,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          costCenter: data.costCenter,
          expenseItem: data.expenseItem,
          project: data.project,
          product: data.product,
          originalAmount: isAP ? data.creditSum : data.debitSum,
          paidAmount: isAP ? data.debitSum : data.creditSum,
          openBalance: netBalance,
          source: 'VOUCHER'
        });
      }
    });

    return items;
  }, [selectedAccount, isAP, isHonorarios, isProveedores, isClientes, rcvDocuments, vouchers]);

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

    // MULTI-ACCOUNT SUBMISSION (Previred, payroll, multiple counterpart accounts)
    if (voucherMode === 'MULTI') {
      if (!selectedBankAccount) {
        setValidationError('⚠️ No se ha seleccionado una Cuenta Bancaria de origen.');
        return;
      }

      if (multiLines.length < 2) {
        setValidationError('⚠️ En modo multi-cuentas debe ingresar al menos 2 líneas de imputación contable (por ejemplo, para Previred o pagos desglosados).');
        return;
      }

      for (let i = 0; i < multiLines.length; i++) {
        const line = multiLines[i];
        if (!line.accountId) {
          setValidationError(`⚠️ En la fila #${i + 1} no has seleccionado la Cuenta Contable.`);
          return;
        }
        if ((Number(line.amount) || 0) <= 0) {
          setValidationError(`⚠️ En la fila #${i + 1} el monto debe ser mayor a $0.`);
          return;
        }
        const acc = accounts.find(a => a.id === line.accountId);
        if (acc) {
          if (acc.requiereAuxiliarRUT && !line.auxiliaryRut?.trim()) {
            setValidationError(`⚠️ La cuenta [${acc.code} - ${acc.name}] en la fila #${i + 1} exige Auxiliar / RUT de forma obligatoria según el Plan de Cuentas.`);
            return;
          }
          if (acc.requiereDocumento && !line.documentRef?.trim()) {
            setValidationError(`⚠️ La cuenta [${acc.code} - ${acc.name}] en la fila #${i + 1} exige N° de Documento / Folio de forma obligatoria según el Plan de Cuentas.`);
            return;
          }
          if (acc.requiereCentroCosto && !line.costCenter?.trim()) {
            setValidationError(`⚠️ La cuenta [${acc.code} - ${acc.name}] en la fila #${i + 1} exige Centro de Costos de forma obligatoria.`);
            return;
          }
          if (acc.requiereItemGasto && !line.expenseItem?.trim()) {
            setValidationError(`⚠️ La cuenta [${acc.code} - ${acc.name}] en la fila #${i + 1} exige Ítem de Gasto de forma obligatoria.`);
            return;
          }
        }
      }

      if (multiDifference !== 0) {
        setValidationError(
          `⚠️ Descuadre en Multi-Cuentas:\n\n` +
          `• Monto Total de la Cartola: $${bankAmount.toLocaleString('es-CL')}\n` +
          `• Total Asignado en Cuentas: $${multiTotalAmount.toLocaleString('es-CL')}\n` +
          `• Diferencia pendiente: $${multiDifference.toLocaleString('es-CL')}\n\n` +
          `El total distribuido en las cuentas debe coincidir exactamente con el valor del movimiento bancario.`
        );
        return;
      }

      const pCheck = checkIsPeriodClosed(quickVoucherPeriod, fiscalYears);
      if (pCheck.isClosed) {
        setValidationError(`⚠️ Acción Bloqueada:\n\n${pCheck.errorMsg}\n\nNo puedes registrar comprobantes en un período cerrado.`);
        return;
      }

      const defaultGloss = (quickGloss.trim() || quickVoucherLine.description).toUpperCase();
      const voucherLines: VoucherLine[] = [];

      // Line 1: Bank Account
      voucherLines.push({
        id: 'line_bank',
        accountId: selectedBankAccount.id,
        accountCode: selectedBankAccount.code,
        accountName: selectedBankAccount.name,
        debit: isCharge ? 0 : bankAmount,
        credit: isCharge ? bankAmount : 0,
        documentRef: (quickVoucherLine.documentNumber || 'BANCO').toUpperCase(),
        bankDocRef: (quickVoucherLine.documentNumber || 'BANCO').toUpperCase(),
        gloss: defaultGloss
      });

      // Lines 2+: Counterparts
      multiLines.forEach((ml, idx) => {
        const acc = accounts.find(a => a.id === ml.accountId)!;
        const amt = Number(ml.amount) || 0;
        voucherLines.push({
          id: `line_counter_${idx + 1}`,
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          debit: isCharge ? amt : 0,
          credit: isCharge ? 0 : amt,
          auxiliaryRut: ml.auxiliaryRut ? ml.auxiliaryRut.toUpperCase().trim() : undefined,
          auxiliaryName: ml.auxiliaryName ? ml.auxiliaryName.toUpperCase().trim() : undefined,
          documentRef: ml.documentRef ? ml.documentRef.toUpperCase().trim() : undefined,
          dueDate: ml.dueDate || undefined,
          costCenter: ml.costCenter ? ml.costCenter.toUpperCase().trim() : undefined,
          expenseItem: ml.expenseItem ? ml.expenseItem.toUpperCase().trim() : undefined,
          project: ml.project || undefined,
          product: ml.product || undefined,
          gloss: (ml.gloss?.trim() || defaultGloss).toUpperCase()
        });
      });

      if (onPostVoucherWithLines) {
        await onPostVoucherWithLines({
          period: quickVoucherPeriod,
          date: voucherDate || effectiveShiftInfo?.date || quickVoucherLine.date,
          gloss: defaultGloss,
          counterAccountId: multiLines[0].accountId,
          lines: voucherLines
        });
      } else if (onPost) {
        onPost();
      }
      return;
    }

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

    // Check if new Auxiliary needs to be saved to master list (SOLO si la cuenta requiere auxiliar)
    let newAuxToSave: Auxiliary | undefined;
    if (selectedAccount.requiereAuxiliarRUT && selectedAuxiliaryRut.trim()) {
      const cleanRut = selectedAuxiliaryRut.trim().toUpperCase();
      const existing = auxiliaries.find(a => a.rut.replace(/\./g, '').toUpperCase() === cleanRut.replace(/\./g, '').toUpperCase());
      if (!existing) {
        newAuxToSave = {
          id: `aux_${Date.now()}`,
          rut: cleanRut,
          name: (selectedAuxiliaryName.trim() || cleanRut).toUpperCase(),
          role: isAP ? 'Acreedor' : 'Deudor',
          estado: 'Activo'
        };
      }
    }

    // Construct Voucher Lines
    const lines: VoucherLine[] = [];
    const defaultGloss = (quickGloss.trim() || quickVoucherLine.description).toUpperCase();

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
        documentRef: (quickVoucherLine.documentNumber || 'BANCO').toUpperCase(),
        bankDocRef: (quickVoucherLine.documentNumber || 'BANCO').toUpperCase(),
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
        documentRef: (quickVoucherLine.documentNumber || 'BANCO').toUpperCase(),
        bankDocRef: (quickVoucherLine.documentNumber || 'BANCO').toUpperCase(),
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
        const auxRutValue = selectedAccount.requiereAuxiliarRUT ? (docItem ? docItem.auxiliaryRut : selectedAuxiliaryRut) : undefined;
        const auxNameValue = selectedAccount.requiereAuxiliarRUT ? (docItem ? docItem.auxiliaryName : selectedAuxiliaryName) : undefined;

        lines.push({
          id: `line_counter_${index + 1}`,
          accountId: selectedAccount.id,
          accountCode: selectedAccount.code,
          accountName: selectedAccount.name,
          debit: isCharge ? amt : 0,
          credit: isCharge ? 0 : amt,
          auxiliaryRut: auxRutValue ? auxRutValue.toUpperCase() : undefined,
          auxiliaryName: auxNameValue ? auxNameValue.toUpperCase() : undefined,
          documentRef: docRefValue ? docRefValue.toUpperCase() : undefined,
          dueDate: docItem?.dueDate || dueDate || undefined,
          costCenter: costCenter ? costCenter.toUpperCase() : undefined,
          expenseItem: expenseItem ? expenseItem.toUpperCase() : undefined,
          project: project ? project.toUpperCase() : undefined,
          product: product ? product.toUpperCase() : undefined,
          customAnalyses: Object.keys(customAnalyses).length > 0 ? customAnalyses : undefined,
          gloss: `Pago ${docItem?.docType || 'Doc'} N° ${docRefValue} - ${defaultGloss}`.toUpperCase()
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
        auxiliaryRut: selectedAccount.requiereAuxiliarRUT && selectedAuxiliaryRut ? selectedAuxiliaryRut.toUpperCase() : undefined,
        auxiliaryName: selectedAccount.requiereAuxiliarRUT && selectedAuxiliaryName ? selectedAuxiliaryName.toUpperCase() : undefined,
        documentRef: (documentRef || quickVoucherLine.documentNumber || 'S/N').toUpperCase(),
        dueDate: dueDate || undefined,
        costCenter: costCenter ? costCenter.toUpperCase() : undefined,
        expenseItem: expenseItem ? expenseItem.toUpperCase() : undefined,
        project: project || undefined,
        product: product || undefined,
        customAnalyses: Object.keys(customAnalyses).length > 0 ? customAnalyses : undefined,
        gloss: defaultGloss
      });
    }

    // Period closing validation
    const pCheck = checkIsPeriodClosed(quickVoucherPeriod, fiscalYears);
    if (pCheck.isClosed) {
      setValidationError(`⚠️ Acción Bloqueada:\n\n${pCheck.errorMsg}\n\nNo puedes registrar comprobantes en un período cerrado.`);
      return;
    }

    if (onPostVoucherWithLines) {
      await onPostVoucherWithLines({
        period: quickVoucherPeriod,
        date: voucherDate || effectiveShiftInfo?.date || quickVoucherLine.date,
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
          {/* Notification banner if original bank statement period is closed */}
          {effectiveShiftInfo?.wasShifted && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs shadow-2xs">
              <span className="text-base leading-none">🔒</span>
              <div className="space-y-0.5">
                <div className="font-bold text-amber-950 flex items-center gap-1.5">
                  <span>Período de Cartola ({effectiveShiftInfo.originalPeriod}) Cerrado Contablemente</span>
                  <span className="bg-amber-200 text-amber-900 font-mono text-[10px] px-1.5 py-0.2 rounded font-bold">Imputación Automática</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  El movimiento bancario original es del <strong>{effectiveShiftInfo.originalDate}</strong> ({effectiveShiftInfo.originalPeriod}), el cual se encuentra cerrado contablemente. Conforme a las normas contables, el registro contable se imputa automáticamente al <strong>día 1 del siguiente mes abierto: {effectiveShiftInfo.date} (Período {effectiveShiftInfo.period})</strong>.
                </p>
              </div>
            </div>
          )}

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
                <span className="font-bold">Fecha Movimiento Cartola:</span> {quickVoucherLine.date} |{' '}
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

          {/* Mode Selector: Cuenta Única vs Multi-Cuentas (Previred, Leyes Sociales, etc.) */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setVoucherMode('SINGLE')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                voucherMode === 'SINGLE'
                  ? 'bg-white text-indigo-950 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📄</span>
              <span>Cuenta Única / Facturas Abiertas</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setVoucherMode('MULTI');
                if (multiLines.length === 0) {
                  handleLoadPreviredTemplate();
                }
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                voucherMode === 'MULTI'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Split className="w-3.5 h-3.5" />
              <span>Pago Multi-Cuentas (Previred, Leyes Sociales, Impuestos)</span>
              {isLikelyPrevired && (
                <span className="bg-amber-400 text-amber-950 text-[10px] px-1.5 py-0.2 rounded uppercase font-black animate-pulse">
                  Previred Detectado
                </span>
              )}
            </button>
          </div>

          {/* Account & Period Selection */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block font-bold text-slate-800 mb-1">
                📅 Período Imputación:
              </label>
              <input
                type="month"
                value={quickVoucherPeriod}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuickVoucherPeriod(val);
                  if (voucherDate && !voucherDate.startsWith(val)) {
                    setVoucherDate(`${val}-01`);
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-800 mb-1">
                📆 Fecha Asiento:
              </label>
              <input
                type="date"
                value={voucherDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setVoucherDate(val);
                  if (val) {
                    setQuickVoucherPeriod(val.substring(0, 7));
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            {voucherMode === 'SINGLE' ? (
              <div className="md:col-span-2">
                <label className="block font-bold text-slate-800 mb-1">
                  📊 Cuenta Contable de Contrapartida: <span className="text-rose-600 font-bold">*</span>
                </label>
                <select
                  value={quickExpenseAccountId}
                  onChange={(e) => {
                    const newAccId = e.target.value;
                    setQuickExpenseAccountId(newAccId);
                    setValidationError(null);
                    setSelectedDocIds({});
                    const acc = accounts.find(a => a.id === newAccId);
                    if (!acc || !acc.requiereAuxiliarRUT) {
                      setSelectedAuxiliaryRut('');
                      setSelectedAuxiliaryName('');
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-medium text-xs focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Seleccionar Cuenta de Contrapartida --</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="md:col-span-2 flex flex-col justify-center bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100 text-xs">
                <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <Split className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Modo Multi-Cuentas Activado</span>
                </div>
                <p className="text-[11px] text-indigo-800 mt-0.5">
                  Agrega y distribuye el monto del banco entre las cuentas contables en la tabla inferior.
                </p>
              </div>
            )}
          </div>

          {/* Multi-Account Workspace (Previred, Leyes Sociales, Impuestos TGR) */}
          {voucherMode === 'MULTI' && (
            <div className="space-y-3.5">
              {/* Presets & Actions Toolbar */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Plantillas Rápidas:
                  </span>
                  <button
                    type="button"
                    onClick={handleLoadPreviredTemplate}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 hover:border-indigo-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
                    title="Cargar automáticamente AFP, Fonasa/Salud, AFC, Mutual de Seguridad y CCAF con RUT Previred"
                  >
                    <span>⚡ Previred (Leyes Sociales)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadTGRTemplate}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
                    title="Cargar automáticamente IVA F29, PPM y Retención de Honorarios con RUT TGR"
                  >
                    <span>🏛️ Impuestos TGR (F29)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddMultiLine()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-xs active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Cuenta</span>
                </button>
              </div>

              {/* Balance & Cuadratura Progress Bar */}
              <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                multiDifference === 0
                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50/70 border-amber-300 text-amber-950'
              }`}>
                <div className="flex items-center gap-4 flex-wrap text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">Monto Banco Cartola</span>
                    <span className="font-mono font-black text-sm text-slate-900">${bankAmount.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-300 hidden sm:block" />
                  <div>
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">Total Distribuido</span>
                    <span className="font-mono font-black text-sm text-indigo-950">${multiTotalAmount.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="h-6 w-px bg-slate-300 hidden sm:block" />
                  <div>
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">Diferencia Pendiente</span>
                    <span className={`font-mono font-black text-sm ${multiDifference === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      ${multiDifference.toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {multiDifference === 0 ? (
                    <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-black text-xs flex items-center gap-1 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Cuadrado 100%</span>
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-amber-800">
                        {multiDifference > 0 ? `Falta asignar $${multiDifference.toLocaleString('es-CL')}` : `Excedido por $${Math.abs(multiDifference).toLocaleString('es-CL')}`}
                      </span>
                      {multiLines.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleFillRemaining(multiLines.length - 1)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-black transition-all shadow-2xs flex items-center gap-1 active:scale-95"
                          title="Ajusta el monto de la última cuenta para cuadrar exactamente con el banco"
                        >
                          <Calculator className="w-3 h-3" />
                          <span>Ajustar Resto a Última</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-Account Lines Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-2.5 w-8 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[220px]">Cuenta Contable <span className="text-rose-600">*</span></th>
                        <th className="py-2.5 px-3 w-40 text-right">Monto ($) <span className="text-rose-600">*</span></th>
                        <th className="py-2.5 px-3 min-w-[180px]">Glosa Específica</th>
                        <th className="py-2.5 px-3 min-w-[240px]">Atributos Requeridos (Auxiliar / Doc / CC)</th>
                        <th className="py-2.5 px-2.5 w-12 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {multiLines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                            No has agregado cuentas contables. Haz clic en "⚡ Previred (Leyes Sociales)" o en "+ Agregar Cuenta".
                          </td>
                        </tr>
                      ) : (
                        multiLines.map((line, idx) => {
                          const acc = accounts.find(a => a.id === line.accountId);
                          const reqRut = acc?.requiereAuxiliarRUT;
                          const reqDoc = acc?.requiereDocumento;
                          const reqCC = acc?.requiereCentroCosto;

                          return (
                            <tr key={line.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-400 text-xs">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3">
                                <select
                                  value={line.accountId}
                                  onChange={(e) => handleUpdateMultiLine(line.id, 'accountId', e.target.value)}
                                  className={`w-full p-1.5 rounded-lg border text-xs font-medium ${
                                    !line.accountId ? 'border-rose-400 bg-rose-50/40 text-rose-900 font-bold' : 'border-slate-300 bg-white'
                                  }`}
                                >
                                  <option value="">-- Seleccionar Cuenta Contable --</option>
                                  {accounts.map(a => (
                                    <option key={a.id} value={a.id}>
                                      {a.code} - {a.name}
                                    </option>
                                  ))}
                                </select>
                                {acc && (
                                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                                    {reqRut && <span className="text-indigo-700 font-bold bg-indigo-50 px-1 rounded">Exige RUT</span>}
                                    {reqDoc && <span className="text-amber-700 font-bold bg-amber-50 px-1 rounded">Exige Doc</span>}
                                    {reqCC && <span className="text-cyan-700 font-bold bg-cyan-50 px-1 rounded">Exige CC</span>}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="space-y-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={line.amount || ''}
                                    onChange={(e) => handleUpdateMultiLine(line.id, 'amount', Math.max(0, Number(e.target.value) || 0))}
                                    placeholder="0"
                                    className={`w-full p-1.5 rounded-lg border text-right font-mono font-bold text-xs ${
                                      (Number(line.amount) || 0) <= 0 ? 'border-rose-400 bg-rose-50/40 text-rose-900' : 'border-slate-300 bg-white text-slate-900'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleFillRemaining(idx)}
                                    className="w-full py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded text-[10px] font-black transition-all flex items-center justify-center gap-1"
                                    title="Calcular y rellenar automáticamente con el saldo restante del banco"
                                  >
                                    <Calculator className="w-2.5 h-2.5" />
                                    <span>⚡ Resto</span>
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <input
                                  type="text"
                                  value={line.gloss}
                                  onChange={(e) => handleUpdateMultiLine(line.id, 'gloss', e.target.value)}
                                  placeholder="Glosa de la línea..."
                                  className="w-full p-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium uppercase"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="space-y-1.5">
                                  {/* Auxiliar RUT & Name */}
                                  <div className="grid grid-cols-2 gap-1">
                                    <input
                                      type="text"
                                      placeholder={reqRut ? "RUT * (Requerido)" : "RUT Auxiliar (Opcional)"}
                                      value={line.auxiliaryRut}
                                      onChange={(e) => handleUpdateMultiLine(line.id, 'auxiliaryRut', e.target.value.toUpperCase())}
                                      className={`p-1 rounded text-[11px] font-mono uppercase border ${
                                        reqRut && !line.auxiliaryRut ? 'border-rose-400 bg-rose-50/40 text-rose-900 font-bold' : 'border-slate-200 bg-white'
                                      }`}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Razón Social / Nombre"
                                      value={line.auxiliaryName}
                                      onChange={(e) => handleUpdateMultiLine(line.id, 'auxiliaryName', e.target.value.toUpperCase())}
                                      className="p-1 rounded text-[11px] uppercase border border-slate-200 bg-white"
                                    />
                                  </div>

                                  {/* Document Ref & Centro de Costo */}
                                  <div className="grid grid-cols-2 gap-1">
                                    <input
                                      type="text"
                                      placeholder={reqDoc ? "N° Doc / Folio *" : "N° Doc / Folio (Opcional)"}
                                      value={line.documentRef}
                                      onChange={(e) => handleUpdateMultiLine(line.id, 'documentRef', e.target.value.toUpperCase())}
                                      className={`p-1 rounded text-[11px] uppercase border ${
                                        reqDoc && !line.documentRef ? 'border-rose-400 bg-rose-50/40 text-rose-900 font-bold' : 'border-slate-200 bg-white'
                                      }`}
                                    />
                                    {sortedCostCenters.length > 0 ? (
                                      <select
                                        value={line.costCenter}
                                        onChange={(e) => handleUpdateMultiLine(line.id, 'costCenter', e.target.value)}
                                        className={`p-1 rounded text-[11px] uppercase border ${
                                          reqCC && !line.costCenter ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200 bg-white'
                                        }`}
                                      >
                                        <option value="">-- C. Costo --</option>
                                        {sortedCostCenters.map(cc => (
                                          <option key={cc.id} value={cc.code}>{cc.code} - {cc.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        placeholder="C. Costo (Opcional)"
                                        value={line.costCenter}
                                        onChange={(e) => handleUpdateMultiLine(line.id, 'costCenter', e.target.value.toUpperCase())}
                                        className="p-1 rounded text-[11px] uppercase border border-slate-200 bg-white"
                                      />
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMultiLine(line.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Eliminar esta línea"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Account Requirements Summary Bar */}
          {voucherMode === 'SINGLE' && selectedAccount && (
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
                    <span>📑</span> Composición de la Cuenta / {
                      isHonorarios
                        ? 'Boletas de Honorarios Pendientes por Pagar (BHE)'
                        : isProveedores
                        ? 'Facturas de Proveedores Pendientes por Pagar'
                        : isClientes
                        ? 'Facturas de Clientes Pendientes por Cobrar'
                        : `Documentos Pendientes en ${selectedAccount.name}`
                    }
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    {isHonorarios
                      ? 'Selecciona una o más boletas de honorarios para imputar el pago al líquido del profesional'
                      : isProveedores
                      ? 'Selecciona una o más facturas de proveedores para registrarlas como pagadas por este movimiento bancario'
                      : isClientes
                      ? 'Selecciona una o más facturas de clientes para registrarlas como cobradas por este movimiento bancario'
                      : 'Selecciona una o más partidas pendientes asociadas a esta cuenta para imputar el movimiento bancario'}
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
                          {isHonorarios
                            ? `No se encontraron boletas de honorarios pendientes en la cuenta [${selectedAccount.code}] ${selectedAccount.name}. Puedes ingresar el comprobante directamente completando los datos a continuación.`
                            : isProveedores
                            ? `No se encontraron facturas de compra pendientes en la cuenta [${selectedAccount.code}] ${selectedAccount.name}. Puedes ingresar el pago directamente completando los datos a continuación.`
                            : isClientes
                            ? `No se encontraron facturas de venta pendientes en la cuenta [${selectedAccount.code}] ${selectedAccount.name}. Puedes ingresar el cobro directamente completando los datos a continuación.`
                            : `No se encontraron documentos o partidas pendientes en la cuenta [${selectedAccount.code}] ${selectedAccount.name}. Puedes ingresar el movimiento directamente completando los análisis a continuación.`}
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
                              <span className="font-semibold">
                                {item.docNumber && item.docType && item.docNumber.toUpperCase().includes(item.docType.toUpperCase())
                                  ? item.docNumber
                                  : `${item.docType ? item.docType + ' ' : ''}${item.docNumber}`}
                              </span>
                              {item.source === 'RCV' ? (
                                <span className={`ml-1.5 text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded ${
                                  item.docType === 'BHE' || item.docType === '70'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {item.docType === 'BHE' || item.docType === '70' ? 'BHE SII' : 'RCV SII'}
                                </span>
                              ) : (
                                <span className="ml-1.5 text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                  Contabilizado
                                </span>
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
                {/* 1. Auxiliar RUT & Nombre - SOLO si la cuenta seleccionada tiene marcado el casillero auxiliar en el Plan de Cuentas */}
                {selectedAccount.requiereAuxiliarRUT && (
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">
                      👤 Auxiliar (RUT y Razón Social):
                      <span className="text-rose-600 font-bold ml-1">* (Obligatorio según Plan de Cuentas)</span>
                    </label>
                    <SearchableAuxiliarySelect
                      auxiliaries={auxiliaries}
                      valueRut={selectedAuxiliaryRut}
                      valueName={selectedAuxiliaryName}
                      onSelect={(aux) => {
                        setSelectedAuxiliaryRut((aux.rut || '').toUpperCase());
                        setSelectedAuxiliaryName((aux.name || '').toUpperCase());
                      }}
                      onManualRutChange={(rut) => setSelectedAuxiliaryRut(rut)}
                      onManualNameChange={(name) => setSelectedAuxiliaryName(name)}
                      required={true}
                      placeholder="Buscar por RUT o Nombre de Auxiliar..."
                    />
                  </div>
                )}

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
                    onChange={(e) => setDocumentRef(e.target.value.toUpperCase())}
                    className={`border p-2 w-full rounded-lg text-xs uppercase ${
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

                {/* 4. Centro de Costos (Ordenados Alfabéticamente por Código) */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    🏢 Centro de Costos:
                    {selectedAccount.requiereCentroCosto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  {sortedCostCenters.length > 0 ? (
                    <select
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value.toUpperCase())}
                      className={`border p-2 w-full rounded-lg text-xs uppercase ${
                        selectedAccount.requiereCentroCosto && !costCenter ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    >
                      <option value="">-- Seleccionar Centro de Costo --</option>
                      {sortedCostCenters.map(cc => (
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
                      onChange={(e) => setCostCenter(e.target.value.toUpperCase())}
                      className={`border p-2 w-full rounded-lg text-xs uppercase ${
                        selectedAccount.requiereCentroCosto && !costCenter ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    />
                  )}
                </div>

                {/* 5. Ítem de Gasto (Ordenados Alfabéticamente por Código) */}
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    🏷️ Ítem de Gasto:
                    {selectedAccount.requiereItemGasto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                  </label>
                  {sortedExpenseItems.length > 0 ? (
                    <select
                      value={expenseItem}
                      onChange={(e) => setExpenseItem(e.target.value.toUpperCase())}
                      className={`border p-2 w-full rounded-lg text-xs uppercase ${
                        selectedAccount.requiereItemGasto && !expenseItem ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'
                      }`}
                    >
                      <option value="">-- Seleccionar Ítem Gasto --</option>
                      {sortedExpenseItems.map(item => (
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
                      onChange={(e) => setExpenseItem(e.target.value.toUpperCase())}
                      className={`border p-2 w-full rounded-lg text-xs uppercase ${
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
