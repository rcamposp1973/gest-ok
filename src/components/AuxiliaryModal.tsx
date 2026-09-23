import React, { useState, useEffect, useMemo } from 'react';
import { 
  Auxiliary, 
  ChartOfAccount, 
  CostCenterMaster, 
  ExpenseItemMaster, 
  ProjectMaster, 
  ProductMaster, 
  CustomAnalysisTableItem 
} from '../types';
import { formatRut } from '../utils/rutMatcher';
import { 
  X, 
  Building2, 
  User, 
  AlertTriangle, 
  ShieldCheck, 
  Layers, 
  Tag, 
  CheckCircle2, 
  Info,
  DollarSign,
  CreditCard,
  Mail,
  Phone,
  FileText,
  Sparkles,
  Move
} from 'lucide-react';
import { useDraggableModal } from '../hooks/useDraggableModal';

interface AuxiliaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (auxData: Partial<Auxiliary>) => Promise<void>;
  editingAuxiliary: Auxiliary | null;
  accounts: ChartOfAccount[];
  costCenters: CostCenterMaster[];
  expenseItems: ExpenseItemMaster[];
  projects: ProjectMaster[];
  products: ProductMaster[];
  customAccountColumns?: string[];
  customAnalysisItems?: CustomAnalysisTableItem[];
  isReadOnly?: boolean;
}

export default function AuxiliaryModal({
  isOpen,
  onClose,
  onSave,
  editingAuxiliary,
  accounts,
  costCenters,
  expenseItems,
  projects,
  products,
  customAccountColumns = [],
  customAnalysisItems = [],
  isReadOnly = false
}: AuxiliaryModalProps) {
  const [rut, setRut] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Deudor' | 'Acreedor' | 'Ambos'>('Deudor');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [banco, setBanco] = useState('');
  const [tipoCuenta, setTipoCuenta] = useState<'Corriente' | 'Vista' | 'Ahorro' | 'RUT' | ''>('');
  const [numeroCuenta, setNumeroCuenta] = useState('');

  const [defaultDebtorAccountId, setDefaultDebtorAccountId] = useState('');
  const [defaultCreditorAccountId, setDefaultCreditorAccountId] = useState('');
  const [defaultExpenseOrIncomeAccountId, setDefaultExpenseOrIncomeAccountId] = useState('');
  const [defaultGloss, setDefaultGloss] = useState('');

  const [defaultCostCenter, setDefaultCostCenter] = useState('');
  const [defaultExpenseItem, setDefaultExpenseItem] = useState('');
  const [defaultProject, setDefaultProject] = useState('');
  const [defaultProduct, setDefaultProduct] = useState('');
  const [defaultCustomAnalyses, setDefaultCustomAnalyses] = useState<{ [key: string]: string }>({});

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Global F2 keyboard shortcut to save
  useEffect(() => {
    if (!isOpen || isReadOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        const formEl = document.querySelector('form[data-aux-modal-form="true"]') as HTMLFormElement | null;
        if (formEl) {
          formEl.requestSubmit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isReadOnly]);

  // Sincronizar formulario cuando cambia editingAuxiliary o isOpen
  useEffect(() => {
    if (isOpen) {
      if (editingAuxiliary) {
        setRut(editingAuxiliary.rut || '');
        setName(editingAuxiliary.name || '');
        setRole(editingAuxiliary.role || 'Deudor');
        setEmail(editingAuxiliary.email || '');
        setPhone(editingAuxiliary.phone || '');
        setBanco(editingAuxiliary.banco || '');
        setTipoCuenta(editingAuxiliary.tipoCuenta || '');
        setNumeroCuenta(editingAuxiliary.numeroCuenta || '');
        setDefaultDebtorAccountId(editingAuxiliary.defaultDebtorAccountId || '');
        setDefaultCreditorAccountId(editingAuxiliary.defaultCreditorAccountId || '');
        setDefaultExpenseOrIncomeAccountId(editingAuxiliary.defaultExpenseOrIncomeAccountId || '');
        setDefaultGloss(editingAuxiliary.defaultGloss || '');
        setDefaultCostCenter(editingAuxiliary.defaultCostCenter || '');
        setDefaultExpenseItem(editingAuxiliary.defaultExpenseItem || '');
        setDefaultProject(editingAuxiliary.defaultProject || '');
        setDefaultProduct(editingAuxiliary.defaultProduct || '');
        setDefaultCustomAnalyses(editingAuxiliary.defaultCustomAnalyses || {});
      } else {
        setRut('');
        setName('');
        setRole('Deudor');
        setEmail('');
        setPhone('');
        setBanco('');
        setTipoCuenta('');
        setNumeroCuenta('');
        setDefaultDebtorAccountId('');
        setDefaultCreditorAccountId('');
        setDefaultExpenseOrIncomeAccountId('');
        setDefaultGloss('');
        setDefaultCostCenter('');
        setDefaultExpenseItem('');
        setDefaultProject('');
        setDefaultProduct('');
        setDefaultCustomAnalyses({});
      }
      setErrorMessage('');
    }
  }, [isOpen, editingAuxiliary]);

  // Analizar requerimientos de la cuenta de Ingreso / Costo seleccionada
  const selectedIncomeExpenseAcc = useMemo(() => {
    if (!defaultExpenseOrIncomeAccountId) return null;
    return accounts.find(a => a.id === defaultExpenseOrIncomeAccountId || a.code === defaultExpenseOrIncomeAccountId) || null;
  }, [accounts, defaultExpenseOrIncomeAccountId]);

  // Evaluamos si alguna de las cuentas asignadas exige análisis
  const requiresCC = Boolean(selectedIncomeExpenseAcc?.requiereCentroCosto);
  const requiresItem = Boolean(selectedIncomeExpenseAcc?.requiereItemGasto);
  const requiresProj = Boolean(selectedIncomeExpenseAcc?.requiereProyecto);
  const requiresProd = Boolean(selectedIncomeExpenseAcc?.requiereProducto);

  const hasRequiredAnalysis = requiresCC || requiresItem || requiresProj || requiresProd;

  // Ordenar Centros de Costo e Ítems de Gasto alfabéticamente por código
  const sortedCostCenters = useMemo(() => {
    return [...costCenters].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  }, [costCenters]);

  const sortedExpenseItems = useMemo(() => {
    return [...expenseItems].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  }, [expenseItems]);

  // RUT Formatter
  const handleRutChange = (val: string) => {
    setRut(formatRut(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    if (!rut.trim() || !name.trim()) {
      setErrorMessage('Por favor ingrese RUT y Razón Social / Nombre.');
      return;
    }

    try {
      setSaving(true);
      setErrorMessage('');
      await onSave({
        rut: formatRut(rut),
        name: name.trim().toUpperCase(),
        role,
        email: email.trim().toLowerCase(),
        phone: phone.trim().toUpperCase(),
        banco: banco.trim().toUpperCase(),
        tipoCuenta: tipoCuenta || undefined,
        numeroCuenta: numeroCuenta.trim().toUpperCase(),
        defaultDebtorAccountId: defaultDebtorAccountId || undefined,
        defaultCreditorAccountId: defaultCreditorAccountId || undefined,
        defaultExpenseOrIncomeAccountId: defaultExpenseOrIncomeAccountId || undefined,
        defaultGloss: defaultGloss.trim() || undefined,
        defaultCostCenter: defaultCostCenter ? defaultCostCenter.toUpperCase() : undefined,
        defaultExpenseItem: defaultExpenseItem ? defaultExpenseItem.toUpperCase() : undefined,
        defaultProject: defaultProject ? defaultProject.toUpperCase() : undefined,
        defaultProduct: defaultProduct ? defaultProduct.toUpperCase() : undefined,
        defaultCustomAnalyses
      });
      onClose();
    } catch (err: any) {
      console.error('Error guardando auxiliar:', err);
      setErrorMessage(err.message || 'Error al guardar el auxiliar');
    } finally {
      setSaving(false);
    }
  };

  const { dragProps, modalStyle } = useDraggableModal({ isOpen });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 overflow-y-auto">
      <div
        style={modalStyle}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8"
      >
        
        {/* CABECERA DEL MODAL */}
        <div
          {...dragProps}
          className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800 cursor-grab active:cursor-grabbing select-none"
          title="Haz clic y arrastra para mover esta ventana"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30" title="Arrastrar ventana">
              <Move className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {editingAuxiliary ? 'Modificar Ficha de Auxiliar' : 'Registrar Nuevo Auxiliar (Cliente / Proveedor)'}
              </h2>
              <p className="text-xs text-slate-400">
                Gestión de cuentas corrientes de auxiliares y parámetros por defecto (Ventana movible)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MENSAJE DE ERROR SI EXISTE */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* FORMULARIO */}
        <form data-aux-modal-form="true" onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">

          {/* SECCIÓN 1: DATOS IDENTIFICATORIOS */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              1. Identificación del Auxiliar
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  RUT * <span className="text-slate-400 font-normal">(Ej: 76.123.456-7)</span>
                </label>
                <input
                  type="text"
                  value={rut}
                  onChange={(e) => handleRutChange(e.target.value)}
                  onBlur={(e) => setRut(formatRut(e.target.value))}
                  placeholder="Ej. 76.123.456-7"
                  required
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Razón Social / Nombre Completo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="Ej. COMERCIALIZADORA E INVERSIONES SPA"
                  required
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rol Principal *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Deudor">Deudor (Cliente)</option>
                  <option value="Acreedor">Acreedor (Proveedor)</option>
                  <option value="Ambos">Ambos (Cliente y Proveedor)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Email Contacto
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@empresa.cl"
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  Teléfono
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+56912345678"
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: CUENTAS CONTABLES Y TESORERÍA */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-600" />
              2. Cuentas Contables Asignadas & Datos Bancarios
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cuenta Contable Deudor / Cliente
                </label>
                <select
                  value={defaultDebtorAccountId}
                  onChange={(e) => setDefaultDebtorAccountId(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">(Opcional - Usar cuenta por defecto RCV)</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.code}] {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cuenta Contable Acreedor / Proveedor
                </label>
                <select
                  value={defaultCreditorAccountId}
                  onChange={(e) => setDefaultCreditorAccountId(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">(Opcional - Usar cuenta por defecto RCV)</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.code}] {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* CUENTA DE INGRESO O GASTO / COSTO */}
            <div>
              <label className="block text-xs font-bold text-indigo-900 mb-1 flex items-center justify-between">
                <span>Cuenta Contable de Ingreso o Costo/Gasto por Defecto</span>
              </label>
              <select
                value={defaultExpenseOrIncomeAccountId}
                onChange={(e) => setDefaultExpenseOrIncomeAccountId(e.target.value)}
                disabled={isReadOnly}
                className="w-full px-3 py-2 text-xs font-medium bg-indigo-50/50 border border-indigo-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">-- Seleccionar Cuenta de Ingreso, Gasto o Costo --</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    [{a.code}] {a.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Al imputar documentos RCV de este auxiliar, el sistema asignará automáticamente esta cuenta contable para la contrapartida de Gasto/Ingreso.
              </p>
            </div>

            {/* GLOSA SUGERIDA / PREDETERMINADA */}
            <div className="p-3.5 bg-gradient-to-br from-indigo-50/70 to-blue-50/50 rounded-xl border border-indigo-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Glosa Sugerida / Descripción por Defecto para Asientos</span>
                </label>
                <span className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  Autollenado inteligente
                </span>
              </div>
              
              <div className="relative">
                <input
                  type="text"
                  value={defaultGloss}
                  onChange={(e) => setDefaultGloss(e.target.value)}
                  placeholder="Ej. Servicios de Mantención Mensual, Compra de Insumos Computacionales, Arriendo de Oficina..."
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 text-xs bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 placeholder-slate-400 font-medium"
                />
                {defaultGloss && (
                  <button
                    type="button"
                    onClick={() => setDefaultGloss('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    title="Borrar glosa"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sugerencias Rápidas */}
              {!isReadOnly && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Sugerencias rápidas (haz clic para insertar):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Servicios de Mantención y Soporte',
                      'Honorarios Asesoría Profesional',
                      'Compra de Insumos y Mercaderías',
                      'Arriendo de Oficinas e Instalaciones',
                      'Servicios Básicos y Telecomunicaciones',
                      'Fletes y Servicios de Transporte',
                      'Venta de Mercaderías y Productos',
                      'Servicios de Publicidad y Marketing'
                    ].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setDefaultGloss(sug)}
                        className={`text-[10.5px] px-2 py-1 rounded-md border transition-all text-left ${
                          defaultGloss === sug
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                            : 'bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10.5px] text-slate-500 leading-relaxed">
                💡 Al ingresar comprobantes contables manuales, procesar facturas del RCV o realizar conciliaciones bancarias asociadas a este RUT, el sistema precompletará esta glosa automáticamente ahorrándote digitación.
              </p>
            </div>

            {/* DATOS BANCARIOS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Banco</label>
                <input
                  type="text"
                  value={banco}
                  onChange={(e) => setBanco(e.target.value)}
                  placeholder="Ej. Banco de Chile"
                  disabled={isReadOnly}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tipo Cuenta</label>
                <select
                  value={tipoCuenta}
                  onChange={(e) => setTipoCuenta(e.target.value as any)}
                  disabled={isReadOnly}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Seleccione...</option>
                  <option value="Corriente">Cuenta Corriente</option>
                  <option value="Vista">Cuenta Vista</option>
                  <option value="Ahorro">Cuenta Ahorro</option>
                  <option value="RUT">Cuenta RUT</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">N° Cuenta</label>
                <input
                  type="text"
                  value={numeroCuenta}
                  onChange={(e) => setNumeroCuenta(e.target.value)}
                  placeholder="12345678"
                  disabled={isReadOnly}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: CAMPOS DE ANÁLISIS AUTOMÁTICO (DINÁMICO SEGÚN PLAN DE CUENTAS) */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-600" />
                3. Campos de Análisis por Defecto
              </h3>
              {hasRequiredAnalysis && (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  La cuenta exige Análisis
                </span>
              )}
            </div>

            {/* CARTEL INFORMATIVO SI LA CUENTA REQUIERE ANÁLISIS */}
            {selectedIncomeExpenseAcc ? (
              hasRequiredAnalysis ? (
                <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950">
                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Configuración de Análisis para [{selectedIncomeExpenseAcc.code}] {selectedIncomeExpenseAcc.name}:</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Esta cuenta tiene atributos de análisis habilitados en el Plan de Cuentas. Si los configura aquí, se prellenarán automáticamente al contabilizar el RCV. 
                    <strong className="ml-1 text-amber-950">Si se dejan en blanco, el comprobante generado quedará en estado "PENDIENTE"</strong> para que complete los datos requeridos.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>La cuenta contable seleccionada <strong>[{selectedIncomeExpenseAcc.code}]</strong> no exige campos de análisis obligatorios en el Plan de Cuentas. Puede definir valores opcionales a continuación.</span>
                </div>
              )
            ) : (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                Seleccione una Cuenta Contable de Ingreso o Gasto arriba para verificar sus requerimientos de análisis.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CENTRO DE COSTO */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Centro de Costo</span>
                  {requiresCC && (
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                      * Requerido
                    </span>
                  )}
                </label>
                <select
                  value={defaultCostCenter}
                  onChange={(e) => setDefaultCostCenter(e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                    requiresCC && !defaultCostCenter ? 'border-amber-400 bg-amber-50/30 font-semibold' : 'border-slate-300'
                  }`}
                >
                  <option value="">-- Seleccionar Centro de Costo --</option>
                  {sortedCostCenters.map(cc => (
                    <option key={cc.id} value={cc.code || cc.name}>
                      [{cc.code}] {cc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* ÍTEM DE GASTO */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Ítem de Gasto</span>
                  {requiresItem && (
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                      * Requerido
                    </span>
                  )}
                </label>
                <select
                  value={defaultExpenseItem}
                  onChange={(e) => setDefaultExpenseItem(e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                    requiresItem && !defaultExpenseItem ? 'border-amber-400 bg-amber-50/30 font-semibold' : 'border-slate-300'
                  }`}
                >
                  <option value="">-- Seleccionar Ítem de Gasto --</option>
                  {sortedExpenseItems.map(item => (
                    <option key={item.id} value={item.code || item.name}>
                      [{item.code}] {item.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* PROYECTO */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Proyecto</span>
                  {requiresProj && (
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                      * Requerido
                    </span>
                  )}
                </label>
                <select
                  value={defaultProject}
                  onChange={(e) => setDefaultProject(e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                    requiresProj && !defaultProject ? 'border-amber-400 bg-amber-50/30 font-semibold' : 'border-slate-300'
                  }`}
                >
                  <option value="">-- Seleccionar Proyecto --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.code || p.name}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* PRODUCTO */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Producto / Servicio</span>
                  {requiresProd && (
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                      * Requerido
                    </span>
                  )}
                </label>
                <select
                  value={defaultProduct}
                  onChange={(e) => setDefaultProduct(e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                    requiresProd && !defaultProduct ? 'border-amber-400 bg-amber-50/30 font-semibold' : 'border-slate-300'
                  }`}
                >
                  <option value="">-- Seleccionar Producto --</option>
                  {products.map(pr => (
                    <option key={pr.id} value={pr.code || pr.name}>
                      [{pr.code}] {pr.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TABLAS ADICIONALES DE ANÁLISIS PERSONALIZADAS */}
            {customAccountColumns.length > 0 && (
              <div className="pt-2 space-y-3">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Columnas de Análisis Personalizadas
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customAccountColumns.map(colName => (
                    <div key={colName}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{colName}</label>
                      <input
                        type="text"
                        value={defaultCustomAnalyses[colName] || ''}
                        onChange={(e) => setDefaultCustomAnalyses(prev => ({ ...prev, [colName]: e.target.value }))}
                        placeholder={`Valor por defecto para ${colName}`}
                        disabled={isReadOnly}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || isReadOnly}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingAuxiliary ? 'Guardar Cambios' : 'Registrar Auxiliar'}</span>
                  <kbd className="ml-1 px-1.5 py-0.5 bg-indigo-800 text-indigo-100 rounded text-[10px] font-mono border border-indigo-400/40 shadow-xs font-bold">F2</kbd>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
