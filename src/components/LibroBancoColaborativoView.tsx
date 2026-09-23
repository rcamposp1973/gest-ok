import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc } from 'firebase/firestore';
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
  BankStatementLineClientInput
} from '../types';
import { getLatestOpenPeriod, checkIsPeriodClosed } from '../utils/periodUtils';
import { logAuditEvent } from '../utils/auditLogger';
import { sanitizeVoucherLines } from '../utils/voucherValidation';
import { notify } from '../context/ToastContext';
import {
  Landmark,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Sparkles,
  ArrowRight,
  Filter,
  Search,
  Check,
  X,
  FileText,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Download,
  Building2,
  User,
  ShoppingBag,
  CreditCard,
  Briefcase,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  HelpCircle,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface LibroBancoColaborativoViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears?: FiscalPeriodYear[];
  auxiliaries?: Auxiliary[];
  rcvDocuments?: RCVDocument[];
  bankReconciliations?: BankReconciliation[];
  currentUserRole?: string;
  currentUserEmail?: string;
  mode?: 'CLIENTE' | 'CONTADOR';
  onVouchersUpdated?: () => void;
  onNavigateToConciliacion?: () => void;
  onClose?: () => void;
}

const CATEGORY_PRESETS: {
  key: NonNullable<BankStatementLineClientInput['suggestedCategory']>;
  label: string;
  icon: any;
  defaultDebitAccountType: string;
  badgeColor: string;
}[] = [
  { key: 'PROVEEDOR', label: 'Pago a Proveedor / Factura', icon: Building2, defaultDebitAccountType: 'Pasivo', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { key: 'GASTO_GENERAL', label: 'Gasto Menor / Combustible / Insumos', icon: ShoppingBag, defaultDebitAccountType: 'Gasto', badgeColor: 'bg-rose-50 text-rose-700 border-rose-200' },
  { key: 'RETIRO_SOCIO', label: 'Retiro de Socio / Dueño', icon: User, defaultDebitAccountType: 'Patrimonio', badgeColor: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'REMUNERACION', label: 'Sueldos / Anticipo Trabajador', icon: Briefcase, defaultDebitAccountType: 'Pasivo', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'CLIENTE', label: 'Cobro de Cliente / Anticipo Venta', icon: DollarSign, defaultDebitAccountType: 'Activo', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'IMPUESTO', label: 'Impuestos / Patentes / Notaría', icon: FileText, defaultDebitAccountType: 'Pasivo', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'TRANSFERENCIA_INTERNA', label: 'Traspaso entre Cuentas Propias', icon: Layers, defaultDebitAccountType: 'Activo', badgeColor: 'bg-slate-50 text-slate-700 border-slate-200' },
  { key: 'OTRO', label: 'Otro / Por Clasificar', icon: HelpCircle, defaultDebitAccountType: 'Gasto', badgeColor: 'bg-slate-50 text-slate-600 border-slate-200' }
];

export default function LibroBancoColaborativoView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears = [],
  auxiliaries = [],
  rcvDocuments = [],
  bankReconciliations: propBankRecs,
  currentUserRole,
  currentUserEmail,
  mode = 'CONTADOR',
  onVouchersUpdated,
  onNavigateToConciliacion,
  onClose
}: LibroBancoColaborativoViewProps) {
  const isClientMode = mode === 'CLIENTE' || currentUserRole === 'OBSERVER';

  // Bank Accounts Filter
  const bankAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (acc.estado === 'Inactivo') return false;
      const code = (acc.code || '').replace(/-/g, '.');
      const name = (acc.name || '').toLowerCase();
      return (
        acc.requiereConciliacionBancaria ||
        (code.startsWith('1.1.01') && (name.includes('banco') || name.includes('cuenta corriente') || name.includes('caja') || name.includes('tesoreria') || name.includes('transbank')))
      );
    });
  }, [accounts]);

  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(() => {
    return bankAccounts[0]?.id || '';
  });

  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccounts.some(b => b.id === selectedBankAccountId)) {
      setSelectedBankAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankAccountId]);

  const selectedBankAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedBankAccountId);
  }, [accounts, selectedBankAccountId]);

  // Selected Period or "ALL" for the year
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Reconciliations State
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>(propBankRecs || []);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Filters for lines
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'IDENTIFIED' | 'RECONCILED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal / Drawer for Client Identification
  const [identifyingLine, setIdentifyingLine] = useState<{
    recId: string;
    line: BankStatementLine;
  } | null>(null);

  const [identExplanation, setIdentExplanation] = useState('');
  const [identCategory, setIdentCategory] = useState<BankStatementLineClientInput['suggestedCategory']>('PROVEEDOR');
  const [identRut, setIdentRut] = useState('');
  const [identRazonSocial, setIdentRazonSocial] = useState('');
  const [identDocRef, setIdentDocRef] = useState('');
  const [identNotes, setIdentNotes] = useState('');

  // Modal for Accountant Fast Voucher Creation
  const [fastVoucherLine, setFastVoucherLine] = useState<{
    recId: string;
    line: BankStatementLine;
  } | null>(null);
  const [fastContraAccountId, setFastContraAccountId] = useState('');
  const [fastVoucherGloss, setFastVoucherGloss] = useState('');
  const [fastVoucherPeriod, setFastVoucherPeriod] = useState('');
  const [fastVoucherAuxRut, setFastVoucherAuxRut] = useState('');
  const [fastVoucherAuxName, setFastVoucherAuxName] = useState('');

  // Fetch reconciliations from Firestore
  const companyDocRef = useMemo(() => {
    return doc(db, 'studies', studyId || company.studyId || 'default-study', 'companies', company.id);
  }, [studyId, company]);

  const loadReconciliations = useCallback(async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(companyDocRef, 'bankReconciliations'));
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as BankReconciliation));
      setReconciliations(recs);
    } catch (err) {
      console.error('Error cargando conciliaciones bancarias:', err);
    } finally {
      setLoading(false);
    }
  }, [companyDocRef]);

  useEffect(() => {
    loadReconciliations();
  }, [loadReconciliations]);

  // Derived active reconciliation for the selected account & period
  const activeRec = useMemo(() => {
    return reconciliations.find(r => 
      r.period === selectedPeriod && 
      (r.bankAccountId === selectedBankAccountId || r.bankAccountCode === selectedBankAccount?.code)
    );
  }, [reconciliations, selectedPeriod, selectedBankAccountId, selectedBankAccount]);

  // All lines for this account across the period or active rec
  const allAccountLines = useMemo(() => {
    if (!activeRec) return [];
    return activeRec.lines || [];
  }, [activeRec]);

  // Computed metrics
  const metrics = useMemo(() => {
    const lines = allAccountLines;
    const total = lines.length;
    const reconciled = lines.filter(l => l.matchedStatus === 'Conciliado').length;
    const identified = lines.filter(l => l.matchedStatus !== 'Conciliado' && l.clientInput?.explanation).length;
    const pending = total - reconciled - identified;

    const percent = total > 0 ? Math.round((reconciled / total) * 100) : 100;

    const bankFinalBalance = activeRec?.bankFinalBalance ?? 0;
    const bookFinalBalance = activeRec?.bookFinalBalance ?? 0;
    const diff = bankFinalBalance - bookFinalBalance;

    return {
      total,
      reconciled,
      identified,
      pending,
      percent,
      bankFinalBalance,
      bookFinalBalance,
      diff,
      isCuadrado: Math.abs(diff) === 0
    };
  }, [allAccountLines, activeRec]);

  // Filtered lines list
  const filteredLines = useMemo(() => {
    return allAccountLines.filter(line => {
      const isReconciled = line.matchedStatus === 'Conciliado';
      const isIdentified = !isReconciled && Boolean(line.clientInput?.explanation);
      const isPending = !isReconciled && !isIdentified;

      if (statusFilter === 'PENDING' && !isPending) return false;
      if (statusFilter === 'IDENTIFIED' && !isIdentified) return false;
      if (statusFilter === 'RECONCILED' && !isReconciled) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const descMatch = line.description?.toLowerCase().includes(q);
        const docMatch = line.documentNumber?.toLowerCase().includes(q);
        const explMatch = line.clientInput?.explanation?.toLowerCase().includes(q);
        const rutMatch = line.clientInput?.suggestedRut?.toLowerCase().includes(q);
        const nameMatch = line.clientInput?.suggestedRazonSocial?.toLowerCase().includes(q);
        const amountMatch = (line.charge || 0).toString().includes(q) || (line.deposit || 0).toString().includes(q);
        if (!descMatch && !docMatch && !explMatch && !rutMatch && !nameMatch && !amountMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allAccountLines, statusFilter, searchTerm]);

  // Handle open identification modal
  const handleOpenIdentify = (line: BankStatementLine) => {
    if (!activeRec) return;
    setIdentifyingLine({ recId: activeRec.id, line });

    // Auto-prefill if already identified or try smart suggestions
    if (line.clientInput) {
      setIdentExplanation(line.clientInput.explanation || '');
      setIdentCategory(line.clientInput.suggestedCategory || 'PROVEEDOR');
      setIdentRut(line.clientInput.suggestedRut || '');
      setIdentRazonSocial(line.clientInput.suggestedRazonSocial || '');
      setIdentDocRef(line.clientInput.suggestedDocRef || '');
      setIdentNotes(line.clientInput.notes || '');
    } else {
      // Smart Auto Detection by keywords in description
      const descUpper = (line.description || '').toUpperCase();
      let detectedCat: BankStatementLineClientInput['suggestedCategory'] = 'GASTO_GENERAL';
      let detectedRut = '';
      let detectedName = '';

      if (descUpper.includes('ENEL') || descUpper.includes('CHILQUINTA')) {
        detectedCat = 'GASTO_GENERAL';
        detectedName = 'Enel Distribución Chile S.A.';
      } else if (descUpper.includes('SODIMAC') || descUpper.includes('EASY') || descUpper.includes('FERRETERIA')) {
        detectedCat = 'PROVEEDOR';
      } else if (descUpper.includes('SUELDO') || descUpper.includes('REMUNERACION') || descUpper.includes('ANTICIPO')) {
        detectedCat = 'REMUNERACION';
      } else if (descUpper.includes('RETIRO') || descUpper.includes('SOCIO')) {
        detectedCat = 'RETIRO_SOCIO';
      } else if (descUpper.includes('TESORERIA') || descUpper.includes('TGR') || descUpper.includes('F29')) {
        detectedCat = 'IMPUESTO';
      } else if (line.deposit > 0) {
        detectedCat = 'CLIENTE';
      }

      // Try matching auxiliary by name
      const matchedAux = auxiliaries.find(a => 
        descUpper.includes((a.name || '').toUpperCase().slice(0, 8)) ||
        descUpper.includes((a.rut || '').replace(/[^0-9kK]/g, ''))
      );

      if (matchedAux) {
        detectedRut = matchedAux.rut;
        detectedName = matchedAux.name;
      }

      setIdentExplanation(line.description || '');
      setIdentCategory(detectedCat);
      setIdentRut(detectedRut);
      setIdentRazonSocial(detectedName);
      setIdentDocRef(line.documentNumber || '');
      setIdentNotes('');
    }
  };

  // Save Identification (Client action)
  const handleSaveIdentification = async () => {
    if (!identifyingLine || !activeRec) return;
    if (!identExplanation.trim()) {
      alert('Por favor indica una breve explicación de a qué corresponde este movimiento.');
      return;
    }

    try {
      setSaveLoading(true);

      const clientInput: BankStatementLineClientInput = {
        identifiedAt: new Date().toISOString(),
        identifiedByEmail: currentUserEmail || auth.currentUser?.email || 'dueño@empresa.cl',
        identifiedByName: isClientMode ? 'Dueño / Encargado Empresa' : 'Contador / Analista',
        explanation: identExplanation.trim(),
        suggestedCategory: identCategory,
        suggestedRut: identRut.trim() || undefined,
        suggestedRazonSocial: identRazonSocial.trim() || undefined,
        suggestedDocRef: identDocRef.trim() || undefined,
        notes: identNotes.trim() || undefined,
        status: 'PENDIENTE_REVISION'
      };

      const updatedLines = activeRec.lines.map(l => {
        if (l.id === identifyingLine.line.id) {
          return {
            ...l,
            clientInput
          };
        }
        return l;
      });

      const updatedRec: BankReconciliation = {
        ...activeRec,
        lines: updatedLines,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(companyDocRef, 'bankReconciliations', activeRec.id), updatedRec);

      // Log Audit
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anonymous',
        userEmail: currentUserEmail || 'usuario@empresa.cl',
        userRole: currentUserRole || 'USUARIO',
        action: 'UPDATE',
        module: 'CONCILIACION',
        details: `Identificación de movimiento en Cartola/Libro Banco: ${identExplanation} ($${identifyingLine.line.charge || identifyingLine.line.deposit})`,
        metadata: { companyId: company.id, lineId: identifyingLine.line.id }
      });

      setReconciliations(prev => prev.map(r => r.id === activeRec.id ? updatedRec : r));
      setIdentifyingLine(null);
      notify.success('Identificación guardada exitosamente. El contador ya puede revisarla para contabilizar.', 'Identificación Guardada');
    } catch (err: any) {
      console.error('Error guardando identificación:', err);
      notify.error('Error al guardar: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  // Open Fast Voucher Creation Modal (Accountant action)
  const handleOpenFastVoucher = (line: BankStatementLine) => {
    if (!activeRec || !selectedBankAccount) return;

    setFastVoucherLine({ recId: activeRec.id, line });
    setFastVoucherPeriod(activeRec.period || selectedPeriod);
    setFastVoucherGloss(line.clientInput?.explanation || line.description || 'Movimiento bancario');
    setFastVoucherAuxRut(line.clientInput?.suggestedRut || '');
    setFastVoucherAuxName(line.clientInput?.suggestedRazonSocial || '');

    // Suggest contra account based on category or RUT
    let suggestedAccId = '';
    const cat = line.clientInput?.suggestedCategory;

    if (cat === 'PROVEEDOR') {
      const provAcc = accounts.find(a => a.code.startsWith('2.1.02') || a.name.toLowerCase().includes('proveedor'));
      suggestedAccId = provAcc?.id || '';
    } else if (cat === 'CLIENTE') {
      const cliAcc = accounts.find(a => a.code.startsWith('1.1.02') || a.name.toLowerCase().includes('cliente'));
      suggestedAccId = cliAcc?.id || '';
    } else if (cat === 'RETIRO_SOCIO') {
      const retAcc = accounts.find(a => a.name.toLowerCase().includes('retiro') || a.code.startsWith('3.'));
      suggestedAccId = retAcc?.id || '';
    } else if (cat === 'REMUNERACION') {
      const remAcc = accounts.find(a => a.name.toLowerCase().includes('sueldo') || a.name.toLowerCase().includes('remuneraci'));
      suggestedAccId = remAcc?.id || '';
    } else if (cat === 'IMPUESTO') {
      const impAcc = accounts.find(a => a.name.toLowerCase().includes('impuesto') || a.name.toLowerCase().includes('f29') || a.name.toLowerCase().includes('iva'));
      suggestedAccId = impAcc?.id || '';
    } else {
      const gastoAcc = accounts.find(a => a.type === 'Gasto' && !a.name.toLowerCase().includes('depre') && a.isImputable !== false);
      suggestedAccId = gastoAcc?.id || '';
    }

    setFastContraAccountId(suggestedAccId);
  };

  // Submit Fast Voucher Creation
  const handleCreateFastVoucher = async () => {
    if (!fastVoucherLine || !activeRec || !selectedBankAccount) return;
    if (!fastContraAccountId) {
      notify.warning('Por favor selecciona la contracuenta contable para el asiento.', 'Falta Contracuenta');
      return;
    }

    const { line } = fastVoucherLine;
    const isCargo = line.charge > 0;
    const amount = isCargo ? line.charge : line.deposit;
    const voucherType = isCargo ? 'Egreso' : 'Ingreso';

    const contraAccount = accounts.find(a => a.id === fastContraAccountId);
    if (!contraAccount) {
      notify.error('Cuenta contable no encontrada');
      return;
    }

    try {
      setSaveLoading(true);

      // Next Voucher Number
      const existingNumbers = vouchers.map(v => v.voucherNumber || 0);
      const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

      // Build Voucher Lines
      let lines: VoucherLine[] = [];
      if (isCargo) {
        // Egreso: Cargo a Gasto/Pasivo (Debe) / Abono a Banco (Haber)
        lines = [
          {
            accountId: contraAccount.id,
            accountCode: contraAccount.code,
            accountName: contraAccount.name,
            debit: amount,
            credit: 0,
            auxiliaryRut: fastVoucherAuxRut || undefined,
            auxiliaryName: fastVoucherAuxName || undefined,
            documentRef: line.documentNumber || undefined,
            gloss: fastVoucherGloss
          },
          {
            accountId: selectedBankAccount.id,
            accountCode: selectedBankAccount.code,
            accountName: selectedBankAccount.name,
            debit: 0,
            credit: amount,
            documentRef: line.documentNumber || undefined,
            gloss: fastVoucherGloss
          }
        ];
      } else {
        // Ingreso: Cargo a Banco (Debe) / Abono a Cliente/Ingreso (Haber)
        lines = [
          {
            accountId: selectedBankAccount.id,
            accountCode: selectedBankAccount.code,
            accountName: selectedBankAccount.name,
            debit: amount,
            credit: 0,
            documentRef: line.documentNumber || undefined,
            gloss: fastVoucherGloss
          },
          {
            accountId: contraAccount.id,
            accountCode: contraAccount.code,
            accountName: contraAccount.name,
            debit: 0,
            credit: amount,
            auxiliaryRut: fastVoucherAuxRut || undefined,
            auxiliaryName: fastVoucherAuxName || undefined,
            documentRef: line.documentNumber || undefined,
            gloss: fastVoucherGloss
          }
        ];
      }

      const sanitized = sanitizeVoucherLines(lines, accounts);

      // Save Voucher in Firestore
      const voucherPayload: Omit<Voucher, 'id'> = {
        voucherNumber: nextNumber,
        companyId: company.id,
        date: line.date,
        period: fastVoucherPeriod || activeRec.period,
        type: voucherType,
        gloss: fastVoucherGloss,
        lines: sanitized,
        totalDebit: amount,
        totalCredit: amount,
        status: 'Valido',
        creationMode: 'AUTOMATICO',
        createdBy: auth.currentUser?.uid || 'system',
        createdByUserEmail: currentUserEmail || 'contador@estudio.cl',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const voucherDocRef = await addDoc(collection(companyDocRef, 'vouchers'), voucherPayload);
      const newVoucherId = voucherDocRef.id;

      // Update Bank Reconciliation Statement Line to CONCILIADO
      const updatedLines = activeRec.lines.map(l => {
        if (l.id === line.id) {
          return {
            ...l,
            matchedVoucherId: newVoucherId,
            matchedVoucherNumber: nextNumber,
            matchedVoucherPeriod: fastVoucherPeriod || activeRec.period,
            matchedStatus: 'Conciliado' as const,
            clientInput: l.clientInput ? {
              ...l.clientInput,
              status: 'CONTABILIZADO' as const
            } : undefined
          };
        }
        return l;
      });

      // Recalculate balances
      const unmatchedCharges = updatedLines
        .filter(l => l.matchedStatus === 'Pendiente' && l.charge > 0)
        .reduce((sum, l) => sum + (l.charge || 0), 0);

      const unmatchedDeposits = updatedLines
        .filter(l => l.matchedStatus === 'Pendiente' && l.deposit > 0)
        .reduce((sum, l) => sum + (l.deposit || 0), 0);

      const updatedRec: BankReconciliation = {
        ...activeRec,
        lines: updatedLines,
        unmatchedCharges,
        unmatchedDeposits,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(companyDocRef, 'bankReconciliations', activeRec.id), updatedRec);

      logAuditEvent({
        userId: auth.currentUser?.uid || 'anonymous',
        userEmail: currentUserEmail || 'contador@estudio.cl',
        userRole: currentUserRole || 'CONTADOR',
        action: 'CONTABILIZAR',
        module: 'CONCILIACION',
        details: `Generado Comprobante N° ${nextNumber} (${voucherType}) desde Cartola/Libro Banco para línea $${amount}`,
        metadata: { companyId: company.id, voucherId: newVoucherId }
      });

      setReconciliations(prev => prev.map(r => r.id === activeRec.id ? updatedRec : r));
      setFastVoucherLine(null);
      onVouchersUpdated?.();
      notify.success(`Comprobante de ${voucherType} N° ${nextNumber} generado exitosamente y línea de cartola 100% conciliada.`, 'Comprobante Contabilizado');
    } catch (err: any) {
      console.error('Error generando comprobante rápido:', err);
      notify.error('Error al generar comprobante: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  // Global F2 keyboard shortcut to save identification or fast voucher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        if (identifyingLine && !saveLoading) {
          e.preventDefault();
          e.stopPropagation();
          handleSaveIdentification();
        } else if (fastVoucherLine && !saveLoading) {
          e.preventDefault();
          e.stopPropagation();
          handleCreateFastVoucher();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [identifyingLine, fastVoucherLine, saveLoading, handleSaveIdentification, handleCreateFastVoucher]);

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredLines.length === 0) {
      alert('No hay movimientos para exportar.');
      return;
    }

    const data = filteredLines.map(l => ({
      'Fecha': l.date,
      'Descripción / Glosa Banco': l.description,
      'N° Documento': l.documentNumber || '',
      'Cargo (-)': l.charge || 0,
      'Abono (+)': l.deposit || 0,
      'Saldo Cartola': l.balance || 0,
      'Estado Conciliación': l.matchedStatus,
      'N° Comprobante Contable': l.matchedVoucherNumber || '',
      'Explicación del Dueño / Cliente': l.clientInput?.explanation || '',
      'Categoría Sugerida': l.clientInput?.suggestedCategory || '',
      'RUT Identificado': l.clientInput?.suggestedRut || '',
      'Razón Social / Tercero': l.clientInput?.suggestedRazonSocial || '',
      'Identificado Por': l.clientInput?.identifiedByEmail || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Libro_Banco');
    XLSX.writeFile(wb, `Libro_Banco_${company.rut}_${selectedPeriod}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* 1. Header & Navigation Ribbon */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-[#533AFD] flex items-center justify-center font-bold shadow-2xs border border-indigo-100">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#0D253D] flex items-center gap-2">
                <span>Libro Banco & Cartola Colaborativa</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  isClientMode ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800'
                }`}>
                  {isClientMode ? 'Panel de Empresa / Dueño' : 'Panel de Contador'}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {isClientMode
                  ? 'Revisa los movimientos de tu cuenta bancaria y explica aquellos pendientes para que tu contador los contabilice al instante.'
                  : 'Monitorea la cartola bancaria, revisa las explicaciones del cliente y genera los comprobantes contables con 1 clic.'}
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Account and Period */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Bank Account Selector */}
          <select
            value={selectedBankAccountId}
            onChange={(e) => setSelectedBankAccountId(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
          >
            {bankAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                🏦 {acc.name} ({acc.code})
              </option>
            ))}
          </select>

          {/* Period Selector */}
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
          />

          {/* Export Button */}
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Exportar a Excel"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          {!isClientMode && onNavigateToConciliacion && (
            <button
              onClick={onNavigateToConciliacion}
              className="px-3.5 py-2 bg-[#533AFD] hover:bg-[#4326EB] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 cursor-pointer"
            >
              <span>Conciliación Oficial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Health & Status Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Conciliation Progress */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estado al Día</span>
            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
              metrics.percent === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {metrics.percent}% Conciliado
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{metrics.reconciled}</span>
            <span className="text-xs text-slate-500">de {metrics.total} movimientos</span>
          </div>
          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                metrics.percent === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-indigo-500'
              }`}
              style={{ width: `${metrics.percent}%` }}
            />
          </div>
        </div>

        {/* Card 2: Movimientos Pendientes de Identificar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Por Aclarar / Justificar</span>
            <span className="p-1 rounded-lg bg-rose-50 text-rose-600">
              <AlertCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600">{metrics.pending}</span>
            <span className="text-xs text-slate-500">movimientos sin detalle</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {metrics.pending > 0 ? 'Requieren explicación del dueño de empresa' : '¡Excelente! No hay movimientos huérfanos'}
          </p>
        </div>

        {/* Card 3: Aclarados esperando al Contador */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Aclarados por el Cliente</span>
            <span className="p-1 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">{metrics.identified}</span>
            <span className="text-xs text-slate-500">listos para contabilizar</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {metrics.identified > 0 ? 'El contador puede crear el comprobante en 1 clic' : 'Sin cola de contabilización pendiente'}
          </p>
        </div>

        {/* Card 4: Saldo Cartola vs Saldo Libro Mayor */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Saldo Real Cartola</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
              metrics.isCuadrado ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {metrics.isCuadrado ? 'Cuadrado' : 'Diferencia'}
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 font-mono">
            ${metrics.bankFinalBalance.toLocaleString('es-CL')}
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            Libro Mayor: ${metrics.bookFinalBalance.toLocaleString('es-CL')}
          </p>
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos ({metrics.total})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'PENDING'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Por Aclarar ({metrics.pending})</span>
          </button>
          <button
            onClick={() => setStatusFilter('IDENTIFIED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'IDENTIFIED'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Aclarados por Cliente ({metrics.identified})</span>
          </button>
          <button
            onClick={() => setStatusFilter('RECONCILED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'RECONCILED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Contabilizados ({metrics.reconciled})</span>
          </button>
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por glosa, RUT, monto..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 4. Table of Bank Movements */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200/80 font-bold">
              <tr>
                <th className="p-3.5">Fecha</th>
                <th className="p-3.5">Glosa Original de Cartola</th>
                <th className="p-3.5">N° Doc</th>
                <th className="p-3.5 text-right text-rose-700">Cargo (-)</th>
                <th className="p-3.5 text-right text-emerald-700">Abono (+)</th>
                <th className="p-3.5">Explicación / Identificación de la Empresa</th>
                <th className="p-3.5 text-center">Estado</th>
                <th className="p-3.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLines.map((line) => {
                const isReconciled = line.matchedStatus === 'Conciliado';
                const isIdentified = !isReconciled && Boolean(line.clientInput?.explanation);
                const isPending = !isReconciled && !isIdentified;

                return (
                  <tr key={line.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">{line.date}</td>
                    <td className="p-3.5 font-medium text-slate-900 max-w-xs truncate" title={line.description}>
                      {line.description}
                    </td>
                    <td className="p-3.5 font-mono text-slate-500">{line.documentNumber || '-'}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-rose-600">
                      {line.charge > 0 ? `-$${line.charge.toLocaleString('es-CL')}` : '-'}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-600">
                      {line.deposit > 0 ? `+$${line.deposit.toLocaleString('es-CL')}` : '-'}
                    </td>
                    <td className="p-3.5 max-w-sm">
                      {line.clientInput ? (
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900 leading-snug">
                            {line.clientInput.explanation}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {line.clientInput.suggestedCategory && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold">
                                {line.clientInput.suggestedCategory}
                              </span>
                            )}
                            {line.clientInput.suggestedRazonSocial && (
                              <span className="text-slate-600 font-medium truncate max-w-[150px]">
                                {line.clientInput.suggestedRazonSocial}
                              </span>
                            )}
                            {line.clientInput.suggestedRut && (
                              <span className="font-mono text-slate-500">
                                ({line.clientInput.suggestedRut})
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">
                          Sin explicación aún
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      {isReconciled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Contabilizado (V#{line.matchedVoucherNumber})</span>
                        </span>
                      ) : isIdentified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Aclarado por Cliente</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          <span>Por Aclarar</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Identificar Button (for both or Client) */}
                        {!isReconciled && (
                          <button
                            onClick={() => handleOpenIdentify(line)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="Indicar a qué corresponde este movimiento"
                          >
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            <span>{line.clientInput ? 'Editar Motivo' : 'Explicar Motivo'}</span>
                          </button>
                        )}

                        {/* Fast Contabilizar Button (For Accountant) */}
                        {!isClientMode && !isReconciled && (
                          <button
                            onClick={() => handleOpenFastVoucher(line)}
                            className="px-2.5 py-1 bg-[#533AFD] hover:bg-[#4326EB] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="Crear comprobante contable y conciliar en 1 clic"
                          >
                            <span>⚡ Contabilizar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredLines.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-slate-500 italic">
                    {loading ? 'Cargando movimientos de cartola...' : 'No se encontraron movimientos para el período y filtros seleccionados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Modal: Explicar / Identificar Movimiento (Cliente & Contador) */}
      {identifyingLine && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5 animate-scaleIn">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-extrabold text-[#0D253D] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>¿A qué corresponde este movimiento?</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Completa los datos en lenguaje sencillo para que el contador pueda contabilizarlo.
                </p>
              </div>
              <button
                onClick={() => setIdentifyingLine(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Info Box of the Bank Movement */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono text-slate-500">{identifyingLine.line.date}</span>
                <span className="font-mono font-black text-sm">
                  {identifyingLine.line.charge > 0 ? (
                    <span className="text-rose-600">-${identifyingLine.line.charge.toLocaleString('es-CL')} (Salida de dinero)</span>
                  ) : (
                    <span className="text-emerald-600">+${identifyingLine.line.deposit.toLocaleString('es-CL')} (Ingreso de dinero)</span>
                  )}
                </span>
              </div>
              <p className="text-slate-800 font-semibold">{identifyingLine.line.description}</p>
            </div>

            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Categoría Sugerida</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORY_PRESETS.map(cat => {
                  const Icon = cat.icon;
                  const isSelected = identCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setIdentCategory(cat.key)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer text-xs font-semibold ${
                        isSelected
                          ? 'border-[#533AFD] bg-indigo-50/60 text-[#533AFD] shadow-2xs font-bold'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Explanation Field */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                Motivo / Explicación simple *
              </label>
              <input
                type="text"
                value={identExplanation}
                onChange={(e) => setIdentExplanation(e.target.value)}
                placeholder="Ej. Combustible camioneta, Pago de arriendo local, Anticipo de cliente..."
                required
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Auxiliary / Third Party Data (Optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">RUT Proveedor / Cliente</label>
                <input
                  type="text"
                  value={identRut}
                  onChange={(e) => setIdentRut(e.target.value)}
                  placeholder="Ej. 76.543.210-K"
                  className="w-full border border-slate-300 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre / Razón Social</label>
                <input
                  type="text"
                  value={identRazonSocial}
                  onChange={(e) => setIdentRazonSocial(e.target.value)}
                  placeholder="Ej. Sodimac S.A."
                  className="w-full border border-slate-300 rounded-xl p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIdentifyingLine(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveIdentification}
                disabled={saveLoading}
                className="flex-1 px-4 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{saveLoading ? 'Guardando...' : 'Guardar y Enviar al Contador'}</span>
                <kbd className="ml-1 px-1.5 py-0.5 bg-indigo-900 text-indigo-100 rounded text-[10px] font-mono border border-indigo-400/40">F2</kbd>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal: Fast Voucher Creation (Contador) */}
      {fastVoucherLine && selectedBankAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5 animate-scaleIn">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-extrabold text-[#0D253D] flex items-center gap-2">
                  <span>⚡ Contabilizar y Conciliar en 1 Clic</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Genera el comprobante contable de forma instantánea y concilia la línea de cartola.
                </p>
              </div>
              <button
                onClick={() => setFastVoucherLine(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Movement Summary */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Tipo de Asiento:</span>
                <span className={`font-bold px-2 py-0.5 rounded ${
                  fastVoucherLine.line.charge > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  Comprobante de {fastVoucherLine.line.charge > 0 ? 'Egreso' : 'Ingreso'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Monto:</span>
                <span className="font-mono font-black text-sm text-slate-900">
                  ${(fastVoucherLine.line.charge || fastVoucherLine.line.deposit).toLocaleString('es-CL')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Cuenta de Banco:</span>
                <span className="font-semibold text-indigo-700">{selectedBankAccount.name} ({selectedBankAccount.code})</span>
              </div>
            </div>

            {/* Contra Account Selector */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                Contracuenta Contable *
              </label>
              <select
                value={fastContraAccountId}
                onChange={(e) => setFastContraAccountId(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
              >
                <option value="">-- Selecciona Cuenta Contable --</option>
                {accounts.filter(a => a.isImputable !== false && a.id !== selectedBankAccount.id).map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Gloss */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Glosa del Comprobante</label>
              <input
                type="text"
                value={fastVoucherGloss}
                onChange={(e) => setFastVoucherGloss(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
              />
            </div>

            {/* Auxiliary Rut / Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">RUT Auxiliar (Opcional)</label>
                <input
                  type="text"
                  value={fastVoucherAuxRut}
                  onChange={(e) => setFastVoucherAuxRut(e.target.value)}
                  placeholder="12.345.678-9"
                  className="w-full border border-slate-300 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Auxiliar</label>
                <input
                  type="text"
                  value={fastVoucherAuxName}
                  onChange={(e) => setFastVoucherAuxName(e.target.value)}
                  placeholder="Nombre / Razón Social"
                  className="w-full border border-slate-300 rounded-xl p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFastVoucherLine(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateFastVoucher}
                disabled={saveLoading}
                className="flex-1 px-4 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saveLoading ? 'Generando Comprobante...' : 'Crear Comprobante y Conciliar'}</span>
                <kbd className="ml-1 px-1.5 py-0.5 bg-indigo-900 text-indigo-100 rounded text-[10px] font-mono border border-indigo-400/40">F2</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
