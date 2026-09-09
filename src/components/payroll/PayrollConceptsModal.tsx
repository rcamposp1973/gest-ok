import React, { useState } from 'react';
import { PayrollConcept, ChartOfAccount as Account } from '../../types';
import { 
  X, Plus, Edit2, Trash2, CheckCircle2, Shield, DollarSign, 
  Layers, AlertCircle, HelpCircle, Check, BookOpen 
} from 'lucide-react';
import { DEFAULT_PAYROLL_CONCEPTS } from '../../utils/payrollCalculator';

interface PayrollConceptsModalProps {
  companyId: string;
  concepts: PayrollConcept[];
  accounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onSaveConcept: (concept: PayrollConcept) => Promise<void> | void;
  onDeleteConcept?: (conceptId: string) => Promise<void> | void;
}

export const PayrollConceptsModal: React.FC<PayrollConceptsModalProps> = ({
  companyId,
  concepts,
  accounts,
  isOpen,
  onClose,
  onSaveConcept,
  onDeleteConcept
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingConcept, setEditingConcept] = useState<PayrollConcept | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState('');

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'HABER_IMPONIBLE' | 'HABER_NO_IMPONIBLE' | 'DESCUENTO'>('HABER_IMPONIBLE');
  const [imponible, setImponible] = useState(true);
  const [tributable, setTributable] = useState(true);
  const [aplicaGratificacion, setAplicaGratificacion] = useState(true);
  const [reliquidable, setReliquidable] = useState(false);
  const [accountingAccountId, setAccountingAccountId] = useState('');
  const [defaultAmount, setDefaultAmount] = useState<number>(0);

  if (!isOpen) return null;

  const handleStartCreate = () => {
    setEditingConcept(null);
    setCode('');
    setName('');
    setType('HABER_IMPONIBLE');
    setImponible(true);
    setTributable(true);
    setAplicaGratificacion(true);
    setReliquidable(false);
    setAccountingAccountId('');
    setDefaultAmount(0);
    setIsEditing(true);
  };

  const handleStartEdit = (concept: PayrollConcept) => {
    setEditingConcept(concept);
    setCode(concept.code);
    setName(concept.name);
    setType(concept.type);
    setImponible(concept.imponible);
    setTributable(concept.tributable);
    setAplicaGratificacion(concept.aplicaGratificacion);
    setReliquidable(concept.reliquidable || false);
    setAccountingAccountId(concept.accountingAccountId || '');
    setDefaultAmount(concept.defaultAmount || 0);
    setIsEditing(true);
  };

  const handleTypeChange = (newType: 'HABER_IMPONIBLE' | 'HABER_NO_IMPONIBLE' | 'DESCUENTO') => {
    setType(newType);
    if (newType === 'HABER_IMPONIBLE') {
      setImponible(true);
      setTributable(true);
      setAplicaGratificacion(true);
    } else if (newType === 'HABER_NO_IMPONIBLE') {
      setImponible(false);
      setTributable(false);
      setAplicaGratificacion(false);
      setReliquidable(false);
    } else {
      setImponible(false);
      setTributable(false);
      setAplicaGratificacion(false);
      setReliquidable(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      alert('Debe ingresar Código y Nombre para el concepto.');
      return;
    }

    setIsSaving(true);
    try {
      const sanitizedCode = code.trim().toUpperCase().replace(/\s+/g, '_');
      const conceptToSave: PayrollConcept = {
        id: editingConcept?.id || `concept_${companyId}_${Date.now()}`,
        companyId,
        code: sanitizedCode,
        name: name.trim(),
        type,
        imponible,
        tributable,
        aplicaGratificacion,
        reliquidable,
        accountingAccountId: accountingAccountId || undefined,
        defaultAmount: defaultAmount || 0,
        active: true,
        createdAt: editingConcept?.createdAt || new Date().toISOString()
      };

      await onSaveConcept(conceptToSave);
      setNotification(`Concepto "${sanitizedCode}" guardado exitosamente.`);
      setIsEditing(false);
      setTimeout(() => setNotification(''), 3500);
    } catch (err) {
      console.error('Error al guardar concepto:', err);
      alert('Error al guardar el concepto.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadDefaults = async () => {
    if (confirm('¿Desea cargar los conceptos estándar (Bono Producción, Comisiones, Bono Responsabilidad, Viáticos, etc.)?')) {
      for (const def of DEFAULT_PAYROLL_CONCEPTS) {
        if (!concepts.some(c => c.code === def.code)) {
          await onSaveConcept({
            ...def,
            companyId,
            id: `concept_${companyId}_${def.code}`
          });
        }
      }
      setNotification('Conceptos estándar incorporados exitosamente.');
      setTimeout(() => setNotification(''), 3500);
    }
  };

  // Filtrar cuentas contables sugeridas (Gastos 6xxx o Pasivos 2xxx)
  const expenseAccounts = accounts.filter(a => a.type === 'Gasto' || a.code.startsWith('6') || a.type === 'Pasivo' || a.code.startsWith('2') || a.code.startsWith('4'));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                Apertura y Configuración de Conceptos de Remuneración
              </h2>
              <p className="text-xs text-slate-300">
                Bonos, comisiones, viáticos y haberes dinámicos por empresa con parametrización de centralización contable
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

        {/* Action Bar */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Total conceptos configurados: <strong className="text-slate-900">{concepts.length}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadDefaults}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl shadow-2xs transition-colors"
            >
              Cargar Estándar Previred/DT
            </button>
            <button
              type="button"
              onClick={handleStartCreate}
              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nuevo Concepto
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {notification && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notification}</span>
            </div>
          )}

          {/* Modal / Formulario de Creación / Edición */}
          {isEditing && (
            <form onSubmit={handleSubmit} className="p-5 bg-indigo-50/50 border-2 border-indigo-200 rounded-2xl space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Edit2 className="w-4 h-4 text-indigo-600" />
                  {editingConcept ? `Editar Concepto: ${editingConcept.code}` : 'Nuevo Concepto de Haberes / Descuentos'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-bold"
                >
                  Cerrar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Código de Concepto (Ej: BONO_PROD) *
                  </label>
                  <input
                    type="text"
                    placeholder="BONO_PROD, COM_VTAS, VIATICO"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Identificador para la carga en Excel tabulado.</p>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nombre o Glosa Descriptiva *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Bono de Producción y Cumplimiento de Metas"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Tipo de Concepto *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="HABER_IMPONIBLE">Haber Imponible (Bono, Comisión, etc.)</option>
                    <option value="HABER_NO_IMPONIBLE">Haber No Imponible (Viático, Colación, etc.)</option>
                    <option value="DESCUENTO">Descuento u Otros Descuentos</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Cuenta Contable para Centralización Automática (Libro Diario)
                  </label>
                  <select
                    value={accountingAccountId}
                    onChange={(e) => setAccountingAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="">-- Sin cuenta específica (Usa cuenta general de nómina) --</option>
                    {expenseAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        [{acc.code}] {acc.name} ({acc.type})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Permite a la empresa centralizar este haber a una cuenta de gasto analítica (ej: Bonos de Producción, Comisiones de Ventas, Viáticos).
                  </p>
                </div>
              </div>

              {/* Parametrización Previsional y Tributaria */}
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                  Reglas de Imponibilidad y Tributación Legal
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={imponible}
                      onChange={(e) => setImponible(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded-sm"
                    />
                    <span>¿Imponible? (Cotiza AFP/Salud)</span>
                  </label>

                  <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tributable}
                      onChange={(e) => setTributable(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded-sm"
                    />
                    <span>¿Tributable? (Impuesto Único)</span>
                  </label>

                  <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aplicaGratificacion}
                      onChange={(e) => setAplicaGratificacion(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded-sm"
                    />
                    <span>¿Aplica Gratificación (25%)?</span>
                  </label>

                  <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reliquidable}
                      onChange={(e) => setReliquidable(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded-sm"
                    />
                    <span>¿Es Reliquidable Anual?</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {isSaving ? 'Guardando...' : 'Guardar Concepto'}
                </button>
              </div>
            </form>
          )}

          {/* Tabla de Conceptos */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Código Excel</th>
                  <th className="py-2.5 px-3">Nombre Concepto</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-center">Imponible</th>
                  <th className="py-2.5 px-3 text-center">Tributable</th>
                  <th className="py-2.5 px-3 text-center">Gratif.</th>
                  <th className="py-2.5 px-3 text-center">Reliquidable</th>
                  <th className="py-2.5 px-3">Cuenta Contable</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {concepts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      No hay conceptos adicionales creados. Presione <strong>Nuevo Concepto</strong> o <strong>Cargar Estándar</strong>.
                    </td>
                  </tr>
                ) : (
                  concepts.map((concept) => {
                    const acc = accounts.find(a => a.id === concept.accountingAccountId);
                    return (
                      <tr key={concept.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                          {concept.code}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {concept.name}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            concept.type === 'HABER_IMPONIBLE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : concept.type === 'HABER_NO_IMPONIBLE'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {concept.type === 'HABER_IMPONIBLE' ? 'Haber Imponible' : concept.type === 'HABER_NO_IMPONIBLE' ? 'No Imponible' : 'Descuento'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {concept.imponible ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-slate-300">✗</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {concept.tributable ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-slate-300">✗</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {concept.aplicaGratificacion ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-slate-300">✗</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {concept.reliquidable ? <span className="text-purple-600 font-bold">✓ Anual</span> : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600">
                          {acc ? (
                            <span className="font-mono text-slate-800 font-semibold" title={acc.name}>
                              [{acc.code}] {acc.name.slice(0, 20)}...
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Centralización Global</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(concept)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Editar Concepto"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {onDeleteConcept && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`¿Eliminar concepto ${concept.code}?`)) {
                                    onDeleteConcept(concept.id);
                                  }
                                }}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Eliminar Concepto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
          >
            Aceptar y Volver
          </button>
        </div>
      </div>
    </div>
  );
};
