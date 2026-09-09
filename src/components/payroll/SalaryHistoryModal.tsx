import React, { useState } from 'react';
import { Employee, SalaryHistoryEntry } from '../../types';
import { 
  X, Calendar, Plus, Clock, CheckCircle2, History, AlertCircle, 
  DollarSign, ArrowRight, ShieldCheck, FileCheck2 
} from 'lucide-react';

interface SalaryHistoryModalProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Employee) => Promise<void> | void;
}

export const SalaryHistoryModal: React.FC<SalaryHistoryModalProps> = ({
  employee,
  isOpen,
  onClose,
  onSave
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newSalary, setNewSalary] = useState<number>(employee.baseSalary || 650000);
  const [newStartDate, setNewStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [newReason, setNewReason] = useState<string>('Reajuste Contractual');
  const [newDocRef, setNewDocRef] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState('');

  if (!isOpen) return null;

  // Si el empleado aún no tiene salaryHistory inicializado, creamos la entrada inicial basada en su contrato
  const existingHistory: SalaryHistoryEntry[] = (employee.salaryHistory && employee.salaryHistory.length > 0)
    ? [...employee.salaryHistory].sort((a, b) => b.startDate.localeCompare(a.startDate))
    : [
        {
          id: `init_${employee.id}`,
          employeeId: employee.id,
          startDate: employee.hireDate || '2024-01-01',
          baseSalary: employee.baseSalary || 650000,
          reason: 'Contrato de Trabajo Inicial',
          isCurrent: true,
          createdAt: employee.hireDate || '2024-01-01'
        }
      ];

  const handleAddNewValidity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalary || newSalary <= 0) {
      alert('Por favor ingrese un sueldo base válido.');
      return;
    }
    if (!newStartDate) {
      alert('Por favor seleccione la fecha de inicio de vigencia.');
      return;
    }

    setIsSaving(true);
    try {
      // Calcular fecha de término de la vigencia anterior (un día antes del inicio de la nueva vigencia)
      const startDateObj = new Date(newStartDate + 'T00:00:00');
      const prevEndDateObj = new Date(startDateObj);
      prevEndDateObj.setDate(prevEndDateObj.getDate() - 1);
      const prevEndDateStr = prevEndDateObj.toISOString().slice(0, 10);

      // Cerrar las vigencias anteriores que estaban activas o que se solapan
      const updatedHistory: SalaryHistoryEntry[] = existingHistory.map(item => {
        if (item.isCurrent || !item.endDate) {
          return {
            ...item,
            isCurrent: false,
            endDate: prevEndDateStr
          };
        }
        return item;
      });

      // Crear la nueva vigencia activa
      const newEntry: SalaryHistoryEntry = {
        id: `sal_${employee.id}_${Date.now()}`,
        employeeId: employee.id,
        startDate: newStartDate,
        baseSalary: newSalary,
        reason: newReason || 'Modificación de Sueldo Pactado',
        documentFolio: newDocRef.trim() || undefined,
        isCurrent: true,
        createdAt: new Date().toISOString()
      };

      updatedHistory.unshift(newEntry);

      // Actualizar empleado con el nuevo sueldo y su historial
      const updatedEmployee: Employee = {
        ...employee,
        baseSalary: newSalary,
        salaryHistory: updatedHistory,
        updatedAt: new Date().toISOString()
      };

      await onSave(updatedEmployee);
      setNotification(`✅ Nueva vigencia registrada: $${newSalary.toLocaleString('es-CL')} vigente desde ${newStartDate}. El sueldo anterior quedó sin vigencia.`);
      setIsAddingNew(false);
      setTimeout(() => setNotification(''), 4000);
    } catch (error) {
      console.error('Error al guardar vigencia:', error);
      alert('Ocurrió un error al guardar la vigencia salarial.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-950 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                Vigencias y Modificaciones de Sueldo
              </h2>
              <p className="text-xs text-slate-300">
                {employee.name} &bull; RUT: <span className="font-mono font-bold text-amber-300">{employee.rut}</span>
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {notification && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notification}</span>
            </div>
          )}

          {/* Banner explicativo del usuario */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3 text-xs text-slate-700">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">Control de Vigencias Contractuales</p>
              <p className="mt-0.5 text-slate-600">
                Los sueldos tienen vigencia desde que se contrata hasta que se modifica contractualmente. Al registrar un nuevo monto, el tramo previo queda sin vigencia y el nuevo sueldo entra a regir para los cálculos mensuales del período en adelante.
              </p>
            </div>
          </div>

          {/* Sueldo Actual Resumido */}
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-wider block">
                Sueldo Base Vigente Actual
              </span>
              <span className="text-2xl font-mono font-extrabold text-emerald-400">
                ${(employee.baseSalary || 0).toLocaleString('es-CL')} <span className="text-xs text-slate-300 font-sans font-normal">CLP / mes</span>
              </span>
            </div>
            {!isAddingNew && (
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                className="px-3.5 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Nueva Vigencia
              </button>
            )}
          </div>

          {/* Formulario de Nueva Vigencia */}
          {isAddingNew && (
            <form onSubmit={handleAddNewValidity} className="p-4 bg-amber-50/60 border-2 border-amber-300 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <span className="text-xs font-extrabold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-amber-700" />
                  Registrar Nuevo Sueldo Pactado (Anexo de Contrato)
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-bold"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nuevo Sueldo Base Mensual ($ CLP) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={newSalary}
                    onChange={(e) => setNewSalary(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Fecha Inicio de Vigencia *
                  </label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Motivo de la Modificación *
                  </label>
                  <select
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-amber-300 rounded-xl"
                  >
                    <option value="Reajuste Contractual">Reajuste Contractual</option>
                    <option value="Reajuste IPC Anual">Reajuste IPC Semestral / Anual</option>
                    <option value="Ascenso / Cambio de Cargo">Ascenso / Cambio de Cargo o Responsabilidad</option>
                    <option value="Aumento Mérito y Desempeño">Aumento por Mérito y Desempeño</option>
                    <option value="Negociación Colectiva">Negociación Colectiva / Convenio</option>
                    <option value="Adecuación Ingreso Mínimo Mensual">Adecuación Legal Ingreso Mínimo (IMM)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    N° o Folio de Anexo de Contrato
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Anexo N° 2 / Acta 2026"
                    value={newDocRef}
                    onChange={(e) => setNewDocRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-amber-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <FileCheck2 className="w-4 h-4" />
                  {isSaving ? 'Guardando...' : 'Confirmar Nueva Vigencia'}
                </button>
              </div>
            </form>
          )}

          {/* Línea de Tiempo de Vigencias */}
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" />
              Historial Cronológico de Sueldos y Vigencias ({existingHistory.length})
            </h3>

            <div className="space-y-3">
              {existingHistory.map((item, index) => {
                const isCurrent = item.isCurrent || !item.endDate;
                return (
                  <div
                    key={item.id || index}
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-emerald-50/50 border-emerald-300 shadow-xs ring-1 ring-emerald-200'
                        : 'bg-slate-50/70 border-slate-200 opacity-80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-2.5 py-1 text-[10px] font-extrabold rounded-full uppercase tracking-wider ${
                            isCurrent
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isCurrent ? '🟢 Vigente' : '⚪ Sin Vigencia (Histórico)'}
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-900">
                          ${item.baseSalary.toLocaleString('es-CL')} CLP
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Desde: <strong>{item.startDate}</strong></span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span>Hasta: <strong>{item.endDate || 'Actualidad'}</strong></span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
                      <span>Motivo: <strong className="text-slate-800">{item.reason}</strong></span>
                      {item.documentFolio && (
                        <span className="text-[11px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                          Ref: {item.documentFolio}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
