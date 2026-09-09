import React, { useState } from 'react';
import { 
  Employee, PensionSystem, HealthSystem, HealthPlanType, ContractType 
} from '../../types';
import { 
  X, Save, UserCheck, DollarSign, Shield, HeartPulse, Building2, 
  Briefcase, CheckCircle2, AlertCircle, FileText, Calendar 
} from 'lucide-react';
import { DEFAULT_AFP_COMMISSIONS } from '../../utils/payrollCalculator';

interface WorkerParametersModalProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Employee) => Promise<void> | void;
}

export const WorkerParametersModal: React.FC<WorkerParametersModalProps> = ({
  employee,
  isOpen,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState<Employee>({ ...employee });
  const [activeTab, setActiveTab] = useState<'SALARIAL' | 'PREVISIONAL' | 'ASIGNACIONES' | 'DESCUENTOS'>('SALARIAL');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handlePensionChange = (pension: PensionSystem) => {
    const comm = DEFAULT_AFP_COMMISSIONS[pension] || 11.44;
    setFormData(prev => ({
      ...prev,
      pensionSystem: pension,
      pensionCommissionPercent: comm
    }));
  };

  const handleHealthChange = (health: HealthSystem) => {
    setFormData(prev => ({
      ...prev,
      healthSystem: health,
      healthPlanType: health === 'FONASA' ? 'FONASA_7' : (prev.healthPlanType === 'FONASA_7' ? 'ISAPRE_UF' : prev.healthPlanType),
      healthPlanValue: health === 'FONASA' ? 0 : prev.healthPlanValue
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        updatedAt: new Date().toISOString()
      });
      setSuccessMessage('Parámetros actualizados con éxito.');
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 900);
    } catch (error) {
      console.error('Error al guardar parámetros:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                Modificar Parámetros del Trabajador
              </h2>
              <p className="text-xs text-slate-300">
                {employee.name} &bull; RUT: <span className="font-mono font-bold text-amber-300">{employee.rut}</span> &bull; {employee.position || 'Colaborador'}
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('SALARIAL')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'SALARIAL'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Sueldo y Contrato
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PREVISIONAL')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'PREVISIONAL'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            AFP, Salud y Previsión
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ASIGNACIONES')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'ASIGNACIONES'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Haberes y Asignaciones
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DESCUENTOS')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'DESCUENTOS'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Descuentos y Pagos
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {activeTab === 'SALARIAL' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sueldo Base Pactado Mensual ($ CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={formData.baseSalary || 0}
                      onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2 text-sm font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Este valor regirá como sueldo base proporcional según los días trabajados en el mes.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tipo de Contrato de Trabajo *
                  </label>
                  <select
                    value={formData.contractType || 'INDEFINIDO'}
                    onChange={(e) => setFormData({ ...formData, contractType: e.target.value as ContractType })}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="INDEFINIDO">Indefinido (AFC 0.6% Trab. / 2.4% Emp.)</option>
                    <option value="PLAZO_FIJO">Plazo Fijo (AFC 0.0% Trab. / 3.0% Emp.)</option>
                    <option value="POR_OBRA_FAENA">Por Obra o Faena (AFC 0.0% Trab. / 3.0% Emp.)</option>
                    <option value="APRENDIZAJE">Contrato de Aprendizaje</option>
                    <option value="PRACTICA">Práctica Profesional</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jornada Semanal Pactada (Horas)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={45}
                    value={formData.workHoursPerWeek || 44}
                    onChange={(e) => setFormData({ ...formData, workHoursPerWeek: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Utilizado como divisor legal para el cálculo del valor de la hora ordinaria y extra al 50%.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Modalidad de Gratificación
                  </label>
                  <select
                    value={formData.gratificacionType || (formData.hasGratificacionLegal ? 'ART_50' : 'SIN_GRATIFICACION')}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setFormData({ 
                        ...formData, 
                        gratificacionType: val,
                        hasGratificacionLegal: val === 'ART_50'
                      });
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="SIN_GRATIFICACION">Sin Gratificación Mensual (No Aplica / No se Paga Mensual)</option>
                    <option value="ART_50">Art. 50 Código del Trabajo (25% mensual tope 4.75 IMM / 12)</option>
                    <option value="CONVENIDA">Gratificación Convenida en Contrato (25% mensual sin tope)</option>
                    <option value="ART_47">Art. 47 (30% Utilidad Líquida Anual - Se liquida en balance)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Si el trabajador no percibe gratificación mensual o se liquida anualmente, selecciona "Sin Gratificación Mensual".
                  </p>
                </div>
              </div>

              <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-start gap-3">
                <Calendar className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700">
                  <p className="font-bold text-indigo-900">Vigencias Salariales Históricas</p>
                  <p className="mt-0.5">
                    Para registrar incrementos contractuales con vigencia (desde fecha de inicio hasta fecha de modificación), utiliza la opción <strong>Vigencias de Sueldo</strong> en la grilla para mantener el historial intacto y auditable.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'PREVISIONAL' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sistema de Pensiones (AFP) *
                  </label>
                  <select
                    value={formData.pensionSystem || 'HABITAT'}
                    onChange={(e) => handlePensionChange(e.target.value as PensionSystem)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="CAPITAL">AFP Capital (11.44%)</option>
                    <option value="CUPRUM">AFP Cuprum (11.44%)</option>
                    <option value="HABITAT">AFP Habitat (11.27%)</option>
                    <option value="MODELO">AFP Modelo (10.58%)</option>
                    <option value="PLANVITAL">AFP PlanVital (11.16%)</option>
                    <option value="PROVIDA">AFP ProVida (11.45%)</option>
                    <option value="UNO">AFP Uno (10.49%)</option>
                    <option value="INP">Ex-Caja / INP / IPS (18.84%)</option>
                    <option value="JUBILADO_COTIZA">Jubilado que Continúa Cotizando (Comisión AFP)</option>
                    <option value="JUBILADO_NO_COTIZA">Jubilado Exento de Cotización Previsional (0%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tasa Total AFP (% Incluye 10% + Comisión)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={0.01}
                      value={formData.pensionCommissionPercent || 11.27}
                      onChange={(e) => setFormData({ ...formData, pensionCommissionPercent: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sistema de Salud *
                  </label>
                  <select
                    value={formData.healthSystem || 'FONASA'}
                    onChange={(e) => handleHealthChange(e.target.value as HealthSystem)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="FONASA">FONASA (7% Legal Obligatorio)</option>
                    <option value="BANMEDICA">Isapre Banmédica</option>
                    <option value="COLMENA">Isapre Colmena Golden Cross</option>
                    <option value="CONSALUD">Isapre Consalud</option>
                    <option value="CRUZ_BLANCA">Isapre Cruz Blanca</option>
                    <option value="NUEVA_MASVIDA">Isapre Nueva Masvida</option>
                    <option value="VIDA_TRES">Isapre Vida Tres</option>
                    <option value="ESENCIAL">Isapre Esencial</option>
                  </select>
                </div>

                {formData.healthSystem !== 'FONASA' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pactación Plan Isapre
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={formData.healthPlanType || 'ISAPRE_UF'}
                        onChange={(e) => setFormData({ ...formData, healthPlanType: e.target.value as HealthPlanType })}
                        className="w-1/2 px-2.5 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl"
                      >
                        <option value="ISAPRE_UF">Plan en UF</option>
                        <option value="ISAPRE_PESOS">Plan en Pesos ($)</option>
                        <option value="ISAPRE_7_LEGAL">Sólo 7% Legal</option>
                      </select>
                      <input
                        type="number"
                        step={formData.healthPlanType === 'ISAPRE_UF' ? 0.001 : 100}
                        placeholder={formData.healthPlanType === 'ISAPRE_UF' ? 'Ej: 3.450 UF' : '$ en Pesos'}
                        value={formData.healthPlanValue || 0}
                        onChange={(e) => setFormData({ ...formData, healthPlanValue: Number(e.target.value) })}
                        className="w-1/2 px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-xs text-slate-600">
                    <HeartPulse className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Fonasa descuenta exactamente el 7% legal de la renta imponible con tope.</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cargas Familiares Acreditadas
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={formData.cargasFamiliares || 0}
                    onChange={(e) => setFormData({ ...formData, cargasFamiliares: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tramo Asignación Familiar
                  </label>
                  <select
                    value={formData.tramoCargaFamiliar || 'D'}
                    onChange={(e) => setFormData({ ...formData, tramoCargaFamiliar: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl"
                  >
                    <option value="A">Tramo A ($21.545 por carga - Renta hasta $613.627)</option>
                    <option value="B">Tramo B ($13.223 por carga - Renta hasta $896.241)</option>
                    <option value="C">Tramo C ($4.178 por carga - Renta hasta $1.397.777)</option>
                    <option value="D">Tramo D ($0 - Renta superior a $1.397.777)</option>
                  </select>
                </div>

                <div className="md:col-span-2 flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <input
                    type="checkbox"
                    id="chkAfc"
                    checked={formData.hasCesantiaAFC ?? true}
                    onChange={(e) => setFormData({ ...formData, hasCesantiaAFC: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded-sm"
                  />
                  <label htmlFor="chkAfc" className="text-xs text-slate-800 font-bold cursor-pointer">
                    Afecto a Seguro de Cesantía AFC (Ley 19.728)
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ASIGNACIONES' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Configure las asignaciones y haberes fijos mensuales pactados en el contrato individual.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Asignación de Colación ($ CLP No Imponible)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={formData.colacionPactada || 0}
                    onChange={(e) => setFormData({ ...formData, colacionPactada: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Asignación de Movilización ($ CLP No Imponible)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={formData.movilizacionPactada || 0}
                    onChange={(e) => setFormData({ ...formData, movilizacionPactada: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Viáticos Base Pactados ($ CLP No Imponible)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={formData.viaticosPactados || 0}
                    onChange={(e) => setFormData({ ...formData, viaticosPactados: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bono Base Imponible Pactado ($ CLP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={formData.bonosPactados || 0}
                    onChange={(e) => setFormData({ ...formData, bonosPactados: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Para cargar conceptos variables masivos (bonos de producción, comisiones por ventas, horas extras o viáticos de faena) para todos los trabajadores a la vez, use el botón <strong>Cargar Haberes Excel</strong> en la barra superior.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'DESCUENTOS' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cuota Mensual Préstamo Empresa ($ CLP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={formData.descuentoPrestamoCuota || 0}
                    onChange={(e) => setFormData({ ...formData, descuentoPrestamoCuota: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Seguro Complementario ($ CLP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={formData.descuentoSeguroComplementario || 0}
                    onChange={(e) => setFormData({ ...formData, descuentoSeguroComplementario: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Banco para Depósito de Remuneración
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Banco Estado, Banco de Chile, BCI"
                    value={formData.bankName || ''}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    N° Cuenta Bancaria
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Cuenta Corriente / Vista"
                    value={formData.bankAccountNumber || ''}
                    onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono font-semibold text-slate-800 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar y Recalcular'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
