import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  BrainCircuit, 
  Play, 
  Plus, 
  Trash2, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  FileText, 
  Layers, 
  Settings2,
  RefreshCw,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  Move
} from 'lucide-react';
import { useDraggableModal } from '../hooks/useDraggableModal';
import { 
  Company, 
  ChartOfAccount, 
  Voucher, 
  Auxiliary, 
  FiscalPeriodYear, 
  BankStatementLine, 
  JuniorGlossRule,
  CostCenterMaster,
  ExpenseItemMaster,
  ProjectMaster,
  ProductMaster,
  CustomAnalysisTableItem
} from '../types';
import { 
  loadJuniorGlossRules, 
  findMatchingCartolaLines, 
  executeJuniorGlossAutomation, 
  MatchedCartolaItem 
} from '../utils/juniorGlossEngine';
import { db } from '../lib/firebase';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';

interface JuniorGlossAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  auxiliaries: Auxiliary[];
  fiscalYears: FiscalPeriodYear[];
  selectedBankAccountId?: string;
  onSuccess?: () => void;
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
  projects?: ProjectMaster[];
  products?: ProductMaster[];
  customAnalysisItems?: CustomAnalysisTableItem[];
}

export default function JuniorGlossAutomationModal({
  isOpen,
  onClose,
  studyId,
  company,
  accounts,
  vouchers,
  auxiliaries,
  fiscalYears,
  selectedBankAccountId,
  onSuccess,
  costCenters = [],
  expenseItems = [],
  projects = [],
  products = [],
  customAnalysisItems = []
}: JuniorGlossAutomationModalProps) {
  const [rules, setRules] = useState<JuniorGlossRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [activeTab, setActiveTab] = useState<'RULES' | 'NEW_RULE' | 'AUTO_PATTERNS'>('RULES');

  // New Rule Form State
  const [formPattern, setFormPattern] = useState('');
  const [formMovementType, setFormMovementType] = useState<'ALL' | 'CARGO' | 'ABONO'>('CARGO');
  const [formAccountId, setFormAccountId] = useState('');
  const [formAuxiliaryRut, setFormAuxiliaryRut] = useState('');
  const [formCostCenter, setFormCostCenter] = useState('');
  const [formExpenseItem, setFormExpenseItem] = useState('');
  const [formProject, setFormProject] = useState('');
  const [formProduct, setFormProduct] = useState('');
  const [formCustomGloss, setFormCustomGloss] = useState('');
  const [formSearchAccount, setFormSearchAccount] = useState('');

  // Scan & Execution State
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<MatchedCartolaItem[]>([]);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    createdCount: number;
    totalAmount: number;
    message: string;
  } | null>(null);

  // Load Rules on Open
  const fetchRules = async () => {
    if (!studyId || !company?.id) return;
    setLoadingRules(true);
    try {
      const list = await loadJuniorGlossRules(studyId, company.id);
      setRules(list);
    } catch (e) {
      console.error('Error fetching Junior rules:', e);
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRules();
      setExecutionResult(null);
      setScannedItems([]);
    }
  }, [isOpen, studyId, company?.id]);

  // Accounts filter for selector
  const imputableAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (a.isImputable === false) return false;
      const code = (a.code || '').toLowerCase();
      const name = (a.name || '').toLowerCase();
      // Filter out pure bank accounts as counter-account
      if (code.startsWith('1.1.01') && (name.includes('banco') || name.includes('cuenta corriente'))) {
        return false;
      }
      if (formSearchAccount) {
        const q = formSearchAccount.toLowerCase();
        return code.includes(q) || name.includes(q);
      }
      return true;
    });
  }, [accounts, formSearchAccount]);

  // Selected account for form
  const selectedFormAccount = useMemo(() => {
    return accounts.find(a => a.id === formAccountId);
  }, [accounts, formAccountId]);

  // Scan current cartola lines for pattern preview
  const handleScanPattern = async (patternToScan: string, movType: 'ALL' | 'CARGO' | 'ABONO') => {
    if (!patternToScan.trim()) return;
    setScanning(true);
    setExecutionResult(null);
    try {
      const res = await findMatchingCartolaLines(
        studyId,
        company,
        patternToScan,
        movType,
        accounts,
        fiscalYears,
        selectedBankAccountId
      );
      setScannedItems(res.matchedLines);
    } catch (err) {
      console.error('Error scanning:', err);
    } finally {
      setScanning(false);
    }
  };

  // Execute Rule
  const handleExecuteRule = async (
    pattern: string,
    targetAcc: ChartOfAccount,
    movType: 'ALL' | 'CARGO' | 'ABONO',
    auxRut?: string,
    customGloss?: string,
    costCenter?: string,
    expenseItem?: string,
    project?: string,
    product?: string,
    saveAsRule: boolean = true
  ) => {
    if (!targetAcc || !pattern) {
      alert('Debes indicar la glosa y la cuenta contable de destino.');
      return;
    }

    // Validation for required attributes on selected account
    if (targetAcc.requiereCentroCosto && !costCenter) {
      alert(`La cuenta [${targetAcc.code}] ${targetAcc.name} requiere Centro de Costos. Por favor selecciona un Centro de Costos.`);
      return;
    }
    if (targetAcc.requiereItemGasto && !expenseItem) {
      alert(`La cuenta [${targetAcc.code}] ${targetAcc.name} requiere Ítem de Gasto. Por favor selecciona un Ítem de Gasto.`);
      return;
    }
    if (targetAcc.requiereAuxiliarRUT && !auxRut) {
      alert(`La cuenta [${targetAcc.code}] ${targetAcc.name} requiere Auxiliar (RUT). Por favor selecciona un Auxiliar.`);
      return;
    }
    if (targetAcc.requiereProyecto && !project) {
      alert(`La cuenta [${targetAcc.code}] ${targetAcc.name} requiere Proyecto. Por favor selecciona un Proyecto.`);
      return;
    }

    setExecuting(true);
    setExecutionResult(null);

    try {
      // 1. Scan lines if not already scanned
      let items = scannedItems;
      if (items.length === 0) {
        const scanRes = await findMatchingCartolaLines(
          studyId,
          company,
          pattern,
          movType,
          accounts,
          fiscalYears,
          selectedBankAccountId
        );
        items = scanRes.matchedLines;
      }

      if (items.length === 0) {
        alert(`No se encontraron movimientos pendientes en la cartola bancaria con la glosa "${pattern}".`);
        setExecuting(false);
        return;
      }

      const auxObj = auxiliaries.find(a => a.rut === auxRut) || null;

      const result = await executeJuniorGlossAutomation(
        studyId,
        company,
        items,
        targetAcc,
        pattern,
        {
          movementType: movType,
          targetAuxiliary: auxObj,
          customGloss: customGloss || undefined,
          costCenter: costCenter || undefined,
          expenseItem: expenseItem || undefined,
          project: project || undefined,
          product: product || undefined,
          saveAsPermanentRule: saveAsRule,
          existingVouchers: vouchers,
          accounts
        }
      );

      if (result.success) {
        setExecutionResult({
          success: true,
          createdCount: result.createdVouchersCount,
          totalAmount: result.totalAmount,
          message: `¡Junior ha contabilizado con éxito ${result.createdVouchersCount} movimientos por un total de $${result.totalAmount.toLocaleString('es-CL')}!`
        });
        setScannedItems([]);
        fetchRules();
        if (onSuccess) onSuccess();
      } else {
        setExecutionResult({
          success: false,
          createdCount: 0,
          totalAmount: 0,
          message: result.error || 'Error al ejecutar la contabilización automática.'
        });
      }
    } catch (e: any) {
      setExecutionResult({
        success: false,
        createdCount: 0,
        totalAmount: 0,
        message: e?.message || 'Error inesperado durante la ejecución.'
      });
    } finally {
      setExecuting(false);
    }
  };

  // Delete Rule
  const handleDeleteRule = async (ruleId?: string) => {
    if (!ruleId || !confirm('¿Deseas eliminar esta regla de automatización de Junior?')) return;
    try {
      await deleteDoc(doc(db, 'studies', studyId, 'companies', company.id, 'juniorGlossRules', ruleId));
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch (e) {
      console.error('Error deleting rule:', e);
    }
  };

  // Toggle Rule active status
  const handleToggleRuleStatus = async (rule: JuniorGlossRule) => {
    if (!rule.id) return;
    try {
      const newStatus = !rule.isActive;
      await updateDoc(doc(db, 'studies', studyId, 'companies', company.id, 'juniorGlossRules', rule.id), {
        isActive: newStatus,
        updatedAt: new Date().toISOString()
      });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: newStatus } : r));
    } catch (e) {
      console.error('Error updating rule:', e);
    }
  };

  const { dragProps, modalStyle } = useDraggableModal({ isOpen });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4 overflow-y-auto">
      <div
        style={modalStyle}
        className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
      >
        
        {/* Header */}
        <div
          {...dragProps}
          className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-indigo-900/50 cursor-grab active:cursor-grabbing select-none"
          title="Haz clic y arrastra para mover esta ventana"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl text-indigo-300">
              <Move className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">Junior: Contabilizador Automático por Glosa</h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/30 uppercase tracking-wider">
                  Motor de IA
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Automatiza la generación de comprobantes contables (Ingresos/Egresos) a partir de glosas repetitivas de la cartola bancaria.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 p-2 border-b border-slate-200 flex items-center gap-2">
          <button
            onClick={() => { setActiveTab('RULES'); setExecutionResult(null); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'RULES' 
                ? 'bg-white text-indigo-900 shadow-xs border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Reglas Memorizadas ({rules.length})</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('NEW_RULE'); setExecutionResult(null); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'NEW_RULE' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Regla de Contabilización</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Execution Result Banner */}
          {executionResult && (
            <div className={`p-4 rounded-2xl border flex items-start gap-3 animate-in fade-in ${
              executionResult.success 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              {executionResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-black">{executionResult.message}</p>
                {executionResult.success && (
                  <p className="text-xs text-emerald-700 mt-1 font-medium">
                    Los comprobantes fueron registrados en el Libro Diario y las líneas de cartola quedaron conciliadas.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: LIST OF RULES */}
          {activeTab === 'RULES' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Reglas Activas de Junior para {company.name}</h4>
                  <p className="text-xs text-slate-500">
                    Junior ejecuta estas reglas para contabilizar cartolas de forma desatendida o a pedido.
                  </p>
                </div>
                <button
                  onClick={fetchRules}
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs flex items-center gap-1 font-bold border border-slate-200 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Actualizar</span>
                </button>
              </div>

              {loadingRules ? (
                <div className="py-12 text-center text-slate-500 text-xs">Cargando reglas de Junior...</div>
              ) : rules.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-slate-800">No hay reglas de glosa creadas todavía</h5>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      Crea tu primera regla o pídeselo a Junior en el chat: <br />
                      <em className="text-indigo-700 font-mono text-[11px]">"Junior, contabiliza todos los movimientos con glosa 'COMISION' contra la cuenta 5101004"</em>
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('NEW_RULE')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Primera Regla</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => {
                    const accObj = accounts.find(a => a.id === rule.accountId || a.code === rule.accountCode);
                    const isCargo = rule.movementType === 'CARGO';
                    const isAbono = rule.movementType === 'ABONO';

                    return (
                      <div
                        key={rule.id}
                        className="bg-white border border-slate-200/90 hover:border-indigo-200 rounded-2xl p-4 shadow-xs transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isCargo 
                                ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                                : isAbono
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}>
                              {isCargo ? '📤 Cargo (Egreso)' : isAbono ? '📥 Abono (Ingreso)' : '🔄 Ambos'}
                            </span>
                            <span className="font-mono font-black text-slate-900 text-sm bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                              "{rule.pattern}"
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium">
                            <span>Contrapartida:</span>
                            <strong className="font-mono text-indigo-700">[{rule.accountCode}]</strong>
                            <span className="text-slate-800 font-bold">{rule.accountName}</span>
                            {rule.auxiliaryRut && (
                              <span className="text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                                Aux: {rule.auxiliaryRut}
                              </span>
                            )}
                            {rule.costCenter && (
                              <span className="text-[11px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                                CC: {rule.costCenter}
                              </span>
                            )}
                            {rule.expenseItem && (
                              <span className="text-[11px] text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 font-medium">
                                Gasto: {rule.expenseItem}
                              </span>
                            )}
                            {rule.project && (
                              <span className="text-[11px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                                Proy: {rule.project}
                              </span>
                            )}
                            {rule.targetGloss && (
                              <span className="text-[11px] text-slate-600 italic bg-slate-50 px-1.5 py-0.5 rounded border">
                                Glosa: "{rule.targetGloss}"
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-auto">
                          <button
                            onClick={() => {
                              if (accObj) {
                                handleExecuteRule(
                                  rule.pattern,
                                  accObj,
                                  rule.movementType,
                                  rule.auxiliaryRut,
                                  rule.targetGloss,
                                  rule.costCenter,
                                  rule.expenseItem,
                                  rule.project,
                                  rule.product,
                                  false
                                );
                              }
                            }}
                            disabled={executing}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{executing ? 'Procesando...' : 'Ejecutar en Cartola'}</span>
                          </button>

                          <button
                            onClick={() => handleToggleRuleStatus(rule)}
                            className={`p-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                              rule.isActive 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-slate-100 text-slate-400 border-slate-200'
                            }`}
                            title={rule.isActive ? 'Regla activa' : 'Regla pausada'}
                          >
                            {rule.isActive ? 'Activa' : 'Pausada'}
                          </button>

                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="Eliminar regla"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE NEW RULE */}
          {activeTab === 'NEW_RULE' && (
            <div className="space-y-5">
              <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 flex items-start gap-3">
                <BrainCircuit className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-900 leading-relaxed">
                  <strong>¿Cómo funciona?</strong> Junior busca todas las líneas de cartola que contengan el texto indicado. 
                  Al encontrar coincidencias, genera automáticamente el comprobante contable balanceado (Partida Doble) y marca la cartola como conciliada.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Texto / Glosa a buscar */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                    1. Texto o Glosa en Cartola:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. COMISION BANCARIA, PAC TRANSBANK, INTERESES, LXS..."
                    value={formPattern}
                    onChange={e => setFormPattern(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="text-[11px] text-slate-500">
                    Cualquier línea de cartola que contenga este texto será capturada.
                  </span>
                </div>

                {/* Tipo de Movimiento */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                    2. Tipo de Movimiento:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setFormMovementType('CARGO')}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        formMovementType === 'CARGO'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📤 Cargos (Egresos)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormMovementType('ABONO')}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        formMovementType === 'ABONO'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📥 Abonos (Ingresos)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormMovementType('ALL')}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        formMovementType === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🔄 Ambos
                    </button>
                  </div>
                </div>
              </div>

              {/* Cuenta Contable de Contrapartida */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  3. Cuenta Contable de Contrapartida (Plan de Cuentas):
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filtrar cuentas por código o nombre (ej: 5101004 o Gastos Bancarios)..."
                      value={formSearchAccount}
                      onChange={e => setFormSearchAccount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800"
                    />
                  </div>

                  <select
                    value={formAccountId}
                    onChange={e => setFormAccountId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  >
                    <option value="">-- Selecciona la Cuenta de Contrapartida --</option>
                    {imputableAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        [{acc.code}] {acc.name} ({acc.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Dimensiones y Atributos de Análisis Contable */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  4. Dimensiones de Análisis Contable (Centro de Costos, Ítem de Gasto, Proyecto, Auxiliar):
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Centro de Costos */}
                  <div className={`p-2.5 rounded-xl border transition-all ${
                    selectedFormAccount?.requiereCentroCosto
                      ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-bold text-slate-700">Centro de Costos:</label>
                      {selectedFormAccount?.requiereCentroCosto && (
                        <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                          ⚠️ Requerido
                        </span>
                      )}
                    </div>
                    <select
                      value={formCostCenter}
                      onChange={e => setFormCostCenter(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Sin Centro de Costos --</option>
                      {costCenters.map(cc => (
                        <option key={cc.id || cc.code} value={cc.code}>
                          [{cc.code}] {cc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ítem de Gasto / Clasificación */}
                  <div className={`p-2.5 rounded-xl border transition-all ${
                    selectedFormAccount?.requiereItemGasto
                      ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-bold text-slate-700">Ítem de Gasto / Clasificación:</label>
                      {selectedFormAccount?.requiereItemGasto && (
                        <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                          ⚠️ Requerido
                        </span>
                      )}
                    </div>
                    <select
                      value={formExpenseItem}
                      onChange={e => setFormExpenseItem(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Sin Ítem de Gasto --</option>
                      {expenseItems.map(ei => (
                        <option key={ei.id || ei.code} value={ei.code}>
                          [{ei.code}] {ei.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Proyecto */}
                  <div className={`p-2.5 rounded-xl border transition-all ${
                    selectedFormAccount?.requiereProyecto
                      ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-bold text-slate-700">Proyecto:</label>
                      {selectedFormAccount?.requiereProyecto && (
                        <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                          ⚠️ Requerido
                        </span>
                      )}
                    </div>
                    <select
                      value={formProject}
                      onChange={e => setFormProject(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Sin Proyecto --</option>
                      {projects.map(p => (
                        <option key={p.id || p.code} value={p.code}>
                          [{p.code}] {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Auxiliar / RUT */}
                  <div className={`p-2.5 rounded-xl border transition-all ${
                    selectedFormAccount?.requiereAuxiliarRUT
                      ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-bold text-slate-700">Auxiliar (RUT / Entidad):</label>
                      {selectedFormAccount?.requiereAuxiliarRUT && (
                        <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                          ⚠️ Requerido
                        </span>
                      )}
                    </div>
                    <select
                      value={formAuxiliaryRut}
                      onChange={e => setFormAuxiliaryRut(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Sin Auxiliar Específico --</option>
                      {auxiliaries.map(aux => (
                        <option key={aux.id || aux.rut} value={aux.rut}>
                          {aux.rut} - {aux.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Glosa Personalizada para el Asiento (Opcional) */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Glosa Personalizada para el Comprobante (Opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Pago de comisión bancaria o Intereses mensual..."
                    value={formCustomGloss}
                    onChange={e => setFormCustomGloss(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Action Buttons: Scan Preview & Execute */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleScanPattern(formPattern, formMovementType)}
                  disabled={!formPattern.trim() || scanning}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-300 transition-colors cursor-pointer"
                >
                  <Search className="w-4 h-4 text-slate-500" />
                  <span>{scanning ? 'Buscando en cartolas...' : '1. Buscar Coincidencias en Cartolas'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedFormAccount) {
                      handleExecuteRule(
                        formPattern,
                        selectedFormAccount,
                        formMovementType,
                        formAuxiliaryRut,
                        formCustomGloss,
                        formCostCenter,
                        formExpenseItem,
                        formProject,
                        formProduct,
                        true
                      );
                    }
                  }}
                  disabled={!formPattern.trim() || !formAccountId || executing}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{executing ? 'Contabilizando...' : '2. Guardar Regla y Contabilizar Cartola'}</span>
                </button>
              </div>

              {/* Scanned Items Preview */}
              {scannedItems.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                    <span>
                      📋 Movimientos Encontrados en Cartolas ({scannedItems.length}):
                    </span>
                    <span className="text-indigo-700 font-mono font-black">
                      Total: ${scannedItems.reduce((s, i) => s + (i.line.charge || i.line.deposit || 0), 0).toLocaleString('es-CL')}
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-100 text-slate-700 font-sans border-b">
                        <tr>
                          <th className="p-2">Fecha</th>
                          <th className="p-2">Glosa Cartola</th>
                          <th className="p-2">Banco</th>
                          <th className="p-2 text-right">Cargo ($)</th>
                          <th className="p-2 text-right">Abono ($)</th>
                          <th className="p-2 text-center">Fecha Asiento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {scannedItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-bold text-slate-800">{item.line.date}</td>
                            <td className="p-2 text-slate-700 font-sans">{item.line.description}</td>
                            <td className="p-2 text-slate-500 font-sans">[{item.bankAccountCode}] {item.bankAccountName}</td>
                            <td className="p-2 text-right font-bold text-rose-700">
                              {item.line.charge > 0 ? `$${item.line.charge.toLocaleString('es-CL')}` : '-'}
                            </td>
                            <td className="p-2 text-right font-bold text-emerald-700">
                              {item.line.deposit > 0 ? `$${item.line.deposit.toLocaleString('es-CL')}` : '-'}
                            </td>
                            <td className="p-2 text-center">
                              {item.isDateShifted ? (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold" title="Mes cerrado, trasladado">
                                  {item.effectiveDate} ⚠️
                                </span>
                              ) : (
                                <span className="text-slate-600">{item.effectiveDate}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Reglas aisladas en la memoria contable de <strong>{company.name}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
