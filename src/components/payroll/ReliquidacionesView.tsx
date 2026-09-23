import React, { useState, useMemo } from 'react';
import { 
  Employee, PayrollSlip, AnnualReliquidation, ReliquidationMonthDetail, ChartOfAccount as Account, Voucher 
} from '../../types';
import { 
  Calculator, FileText, Printer, Save, Layers, CheckCircle2, 
  AlertCircle, History, DollarSign, Calendar, TrendingUp, User, 
  ArrowRight, Shield, Building2 
} from 'lucide-react';
import { calculateAnnualReliquidation } from '../../utils/payrollCalculator';

interface ReliquidacionesViewProps {
  companyId: string;
  companyName: string;
  companyRut: string;
  employees: Employee[];
  savedSlips: PayrollSlip[];
  accounts: Account[];
  currentPeriod: string;
  savedReliquidations?: AnnualReliquidation[];
  onSaveReliquidation?: (reliq: AnnualReliquidation) => Promise<void> | void;
  onCentralizeVoucher?: (voucherData: any) => Promise<void> | void;
  onNavigateToLibroDiario?: (vId: string) => void;
}

export const ReliquidacionesView: React.FC<ReliquidacionesViewProps> = ({
  companyId,
  companyName,
  companyRut,
  employees,
  savedSlips,
  accounts,
  currentPeriod,
  savedReliquidations = [],
  onSaveReliquidation,
  onCentralizeVoucher,
  onNavigateToLibroDiario
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employees[0]?.id || '');
  const [reliquidationType, setReliquidationType] = useState<'BONO_ANUAL' | 'GRATIFICACION_ART47' | 'GRATIFICACION_ART50' | 'INCENTIVO_PERIODO'>('BONO_ANUAL');
  const [conceptName, setConceptName] = useState('Bono Anual por Cumplimiento de Metas y Desempeño');
  const [montoTotalBruto, setMontoTotalBruto] = useState<number>(2400000);
  const [yearOrigin, setYearOrigin] = useState<number>(new Date().getFullYear() - 1);
  const [periodPayment, setPeriodPayment] = useState<string>(currentPeriod);
  
  // Meses seleccionados para reliquidar (por defecto los 12 meses del año de devengo)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    const y = new Date().getFullYear() - 1;
    return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  });

  const [activeReliquidation, setActiveReliquidation] = useState<AnnualReliquidation | null>(null);
  const [notification, setNotification] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCentralizing, setIsCentralizing] = useState(false);

  // Actualizar meses cuando cambia el año de origen
  const handleYearOriginChange = (y: number) => {
    setYearOrigin(y);
    setSelectedMonths(Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`));
  };

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmployeeId) || employees[0] || null;
  }, [employees, selectedEmployeeId]);

  // Diccionario de liquidaciones históricas del empleado indexadas por 'YYYY-MM'
  const employeeSlipsMap = useMemo(() => {
    const map: Record<string, PayrollSlip | undefined> = {};
    if (!selectedEmployee) return map;
    for (const slip of savedSlips) {
      if (slip.employeeId === selectedEmployee.id) {
        map[slip.period] = slip;
      }
    }
    return map;
  }, [savedSlips, selectedEmployee]);

  // Parámetros históricos para reliquidación
  const historicalParamsMap = useMemo(() => {
    const map: Record<string, { uf: number; utm: number; topeAfpUf?: number; topeAfcUf?: number }> = {};
    for (const m of selectedMonths) {
      // Valores de referencia oficiales por año/mes
      const yearPart = parseInt(m.split('-')[0], 10);
      const ufApprox = yearPart === 2025 ? 38500 : (yearPart === 2026 ? 39800 : 37000);
      const utmApprox = yearPart === 2025 ? 67000 : (yearPart === 2026 ? 70000 : 64000);
      map[m] = {
        uf: ufApprox,
        utm: utmApprox,
        topeAfpUf: 84.3,
        topeAfcUf: 126.6
      };
    }
    return map;
  }, [selectedMonths]);

  // Calcular Reliquidación Legal
  const handleCalculate = () => {
    if (!selectedEmployee) {
      alert('Seleccione un trabajador.');
      return;
    }
    if (!montoTotalBruto || montoTotalBruto <= 0) {
      alert('Ingrese un monto bruto válido a reliquidar.');
      return;
    }
    if (selectedMonths.length === 0) {
      alert('Seleccione al menos un mes para el devengo de la reliquidación.');
      return;
    }

    const calculated = calculateAnnualReliquidation(
      selectedEmployee,
      montoTotalBruto,
      reliquidationType,
      conceptName,
      periodPayment,
      yearOrigin,
      selectedMonths,
      historicalParamsMap,
      employeeSlipsMap
    );

    setActiveReliquidation(calculated);
    setNotification('Cálculo de reliquidación legal ejecutado con éxito.');
    setTimeout(() => setNotification(''), 4000);
  };

  // Guardar Reliquidación
  const handleSave = async () => {
    if (!activeReliquidation) return;
    setIsSaving(true);
    try {
      await onSaveReliquidation?.(activeReliquidation);
      setNotification('Reliquidación guardada correctamente en el sistema.');
      setTimeout(() => setNotification(''), 4000);
    } catch (err) {
      console.error('Error al guardar reliquidación:', err);
      alert('Error al guardar la reliquidación.');
    } finally {
      setIsSaving(false);
    }
  };

  // Centralizar Reliquidación en el Libro Diario
  const handleCentralize = async () => {
    if (!activeReliquidation) return;
    setIsCentralizing(true);
    try {
      // Cuentas contables para centralizar reliquidación
      const expenseAcc = accounts.find(a => a.name.toLowerCase().includes('bono') || a.name.toLowerCase().includes('gratific') || a.code.startsWith('6104') || a.code.startsWith('6100')) || {
        id: 'acc_gasto_bonos',
        code: '6104',
        name: 'Bonos y Gratificaciones del Personal'
      };

      const previredLiabilityAcc = accounts.find(a => a.name.toLowerCase().includes('imposic') || a.name.toLowerCase().includes('prevision') || a.code.startsWith('2105')) || {
        id: 'acc_leyes_sociales',
        code: '2105',
        name: 'Instituciones de Previsión por Pagar'
      };

      const taxLiabilityAcc = accounts.find(a => a.name.toLowerCase().includes('impuesto unico') || a.code.startsWith('2106')) || {
        id: 'acc_impuesto_unico',
        code: '2106',
        name: 'Impuesto Único por Pagar (F29)'
      };

      const salaryPayableAcc = accounts.find(a => a.name.toLowerCase().includes('sueldos por pagar') || a.name.toLowerCase().includes('remuneraciones por pagar') || a.code.startsWith('2104')) || {
        id: 'acc_sueldos_pagar',
        code: '2104',
        name: 'Remuneraciones y Bonos por Pagar'
      };

      const lines = [
        {
          id: `line_deb_${Date.now()}_1`,
          accountId: expenseAcc.id,
          accountCode: expenseAcc.code,
          accountName: expenseAcc.name,
          debit: activeReliquidation.montoTotalBruto,
          credit: 0,
          glosa: `Gasto ${activeReliquidation.conceptName} ${activeReliquidation.employeeName} devengado ${activeReliquidation.yearOrigin}`
        },
        {
          id: `line_crd_${Date.now()}_2`,
          accountId: previredLiabilityAcc.id,
          accountCode: previredLiabilityAcc.code,
          accountName: previredLiabilityAcc.name,
          debit: 0,
          credit: activeReliquidation.totalCotizacionesPrevisionales,
          glosa: `Diferencial Cotizaciones Previsionales Reliquidación ${activeReliquidation.employeeName}`
        },
        {
          id: `line_crd_${Date.now()}_3`,
          accountId: taxLiabilityAcc.id,
          accountCode: taxLiabilityAcc.code,
          accountName: taxLiabilityAcc.name,
          debit: 0,
          credit: activeReliquidation.totalImpuestoUnicoRetenido,
          glosa: `Retención Impuesto Único Reliquidado ${activeReliquidation.employeeName} período ${activeReliquidation.periodPayment}`
        },
        {
          id: `line_crd_${Date.now()}_4`,
          accountId: salaryPayableAcc.id,
          accountCode: salaryPayableAcc.code,
          accountName: salaryPayableAcc.name,
          debit: 0,
          credit: activeReliquidation.liquidoAPagar,
          glosa: `Líquido a Pagar Bono Reliquidado ${activeReliquidation.employeeName}`
        }
      ];

      const voucherData = {
        companyId,
        date: `${activeReliquidation.periodPayment}-28`,
        type: 'TRASPASO',
        glosa: `Centralización Reliquidación Legal ${activeReliquidation.conceptName} - ${activeReliquidation.employeeName} (${activeReliquidation.employeeRut}) devengo ${activeReliquidation.yearOrigin}`,
        lines,
        totalDebit: activeReliquidation.montoTotalBruto,
        totalCredit: activeReliquidation.montoTotalBruto,
        status: 'VALIDADO'
      };

      if (onCentralizeVoucher) {
        await onCentralizeVoucher(voucherData);
        setNotification('Asiento de centralización de reliquidación generado con éxito en el Libro Diario.');
        setTimeout(() => setNotification(''), 4500);
      }
    } catch (err) {
      console.error('Error al centralizar reliquidación:', err);
      alert('Error al centralizar reliquidación.');
    } finally {
      setIsCentralizing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <Calculator className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Módulo de Reliquidaciones Legales de Remuneraciones
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            Reliquidación tributaria y previsional conforme al <strong>Art. 43 y 48 de la Ley de la Renta (SII)</strong> y <strong>Código del Trabajo de Chile</strong> para Bonos Anuales de Desempeño, Gratificaciones Legales Art. 47 y comisiones con devengo diferido.
          </p>
        </div>

        {activeReliquidation && (
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handleCentralize}
              disabled={isCentralizing}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              title="Generar Asiento Contable Cuadrado en el Libro Diario"
            >
              <Layers className="w-4 h-4" />
              {isCentralizing ? 'Centralizando...' : 'Centralizar Asiento'}
            </button>
          </div>
        )}
      </div>

      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{notification}</span>
        </div>
      )}

      {/* Asistente de Configuración del Bono a Reliquidar */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-600" />
          Parámetros de la Reliquidación Legal
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Colaborador a Reliquidar *
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.rut})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tipo de Reliquidación *
            </label>
            <select
              value={reliquidationType}
              onChange={(e) => {
                const val = e.target.value as any;
                setReliquidationType(val);
                if (val === 'BONO_ANUAL') setConceptName('Bono Anual por Cumplimiento de Metas');
                else if (val === 'GRATIFICACION_ART47') setConceptName('Gratificación Legal Art. 47 (30% Utilidad Líquida)');
                else if (val === 'GRATIFICACION_ART50') setConceptName('Ajuste Anual Gratificación Art. 50');
                else setConceptName('Incentivo Plurianual Devengado');
              }}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl"
            >
              <option value="BONO_ANUAL">Bono Anual de Desempeño / Metas</option>
              <option value="GRATIFICACION_ART47">Gratificación Legal Art. 47 (30% Utilidad)</option>
              <option value="GRATIFICACION_ART50">Ajuste Anual Gratificación Art. 50</option>
              <option value="INCENTIVO_PERIODO">Incentivo o Comisión con Devengo Diferido</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Monto Total Bruto a Reliquidar ($ CLP) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">$</span>
              <input
                type="number"
                min={1000}
                step={1000}
                value={montoTotalBruto}
                onChange={(e) => setMontoTotalBruto(Number(e.target.value))}
                className="w-full pl-8 pr-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Año Comercial de Devengo *
            </label>
            <select
              value={yearOrigin}
              onChange={(e) => handleYearOriginChange(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>Año Comercial {y}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Concepto / Glosa Formal
            </label>
            <input
              type="text"
              value={conceptName}
              onChange={(e) => setConceptName(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Período de Pago y Declaración
            </label>
            <input
              type="month"
              value={periodPayment}
              onChange={(e) => setPeriodPayment(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleCalculate}
              className="w-full py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              Calcular Reliquidación Legal
            </button>
          </div>
        </div>

        {/* Selección de Meses a Reliquidar */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700">
              Meses de Devengo del Bono ({selectedMonths.length} meses seleccionados - Cuota mensual: ${(Math.round(montoTotalBruto / Math.max(1, selectedMonths.length))).toLocaleString('es-CL')})
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedMonths(Array.from({ length: 12 }, (_, i) => `${yearOrigin}-${String(i + 1).padStart(2, '0')}`))}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
              >
                Todos (12 Meses)
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setSelectedMonths([])}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 text-xs">
            {Array.from({ length: 12 }, (_, i) => {
              const mKey = `${yearOrigin}-${String(i + 1).padStart(2, '0')}`;
              const isChecked = selectedMonths.includes(mKey);
              const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
              return (
                <label
                  key={mKey}
                  className={`p-2 rounded-xl border text-center font-mono cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMonths([...selectedMonths, mKey].sort());
                      } else {
                        setSelectedMonths(selectedMonths.filter(m => m !== mKey));
                      }
                    }}
                  />
                  <span>{monthNames[i]}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Resultados de la Reliquidación */}
      {activeReliquidation && (
        <div className="space-y-6">
          {/* Tarjetas de Totales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Monto Bruto Total
              </span>
              <span className="text-xl font-mono font-extrabold text-slate-900 block mt-1">
                ${activeReliquidation.montoTotalBruto.toLocaleString('es-CL')}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {activeReliquidation.monthsCount} cuotas de ${(Math.round(activeReliquidation.montoTotalBruto / activeReliquidation.monthsCount)).toLocaleString('es-CL')}
              </span>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                Cotizaciones Previsionales
              </span>
              <span className="text-xl font-mono font-extrabold text-amber-600 block mt-1">
                ${activeReliquidation.totalCotizacionesPrevisionales.toLocaleString('es-CL')}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                AFP + Salud 7% + AFC (con topes)
              </span>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                Impuesto Único Reliquidado
              </span>
              <span className="text-xl font-mono font-extrabold text-rose-600 block mt-1">
                ${activeReliquidation.totalImpuestoUnicoRetenido.toLocaleString('es-CL')}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Retención tributaria F29 Art. 43 LIR
              </span>
            </div>

            <div className="p-4 bg-emerald-50/80 rounded-2xl border-2 border-emerald-300 shadow-xs">
              <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">
                Líquido a Pagar al Trabajador
              </span>
              <span className="text-2xl font-mono font-extrabold text-emerald-700 block mt-1">
                ${activeReliquidation.liquidoAPagar.toLocaleString('es-CL')}
              </span>
              <span className="text-[11px] font-semibold text-emerald-800 mt-1 block">
                A pagar en nómina de {activeReliquidation.periodPayment}
              </span>
            </div>
          </div>

          {/* Grilla Detallada Mes a Mes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Detalle Matemático de Prorrateo Mes a Mes (Art. 43 LIR & Código del Trabajo)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Topes previsionales calculados con la UF oficial de cada mes de origen. UTM y tramos de impuesto histórico aplicados.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                {activeReliquidation.employeeName} ({activeReliquidation.employeeRut})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Mes Devengo</th>
                    <th className="py-2.5 px-3 text-right">Imponible Orig.</th>
                    <th className="py-2.5 px-3 text-right">Cuota Bono</th>
                    <th className="py-2.5 px-3 text-right">Nuevo Imponible</th>
                    <th className="py-2.5 px-3 text-right">Tope AFP ($)</th>
                    <th className="py-2.5 px-3 text-right">AFP Diff</th>
                    <th className="py-2.5 px-3 text-right">Salud 7% Diff</th>
                    <th className="py-2.5 px-3 text-right">AFC Diff</th>
                    <th className="py-2.5 px-3 text-right">Renta Tribut. Orig.</th>
                    <th className="py-2.5 px-3 text-right">Renta Tribut. Nueva</th>
                    <th className="py-2.5 px-3 text-right">Imp. Orig.</th>
                    <th className="py-2.5 px-3 text-right">Imp. Nuevo</th>
                    <th className="py-2.5 px-3 text-right font-extrabold text-rose-700">Imp. Diff Retención</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {activeReliquidation.detallesMesAMes.map((d, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                        {d.month}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        ${d.sueldoImponibleOriginal.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-600">
                        ${d.cuotaBono.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-900">
                        ${d.nuevoImponible.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        ${d.topeAfpPesos.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-700">
                        ${d.afpDiff.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-700">
                        ${d.saludDiff.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-700">
                        ${d.afcDiff.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">
                        ${d.rentaAfectaOriginal.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        ${d.rentaAfectaNueva.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        ${d.impuestoUnicoOriginal.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-800">
                        ${d.impuestoUnicoNuevo.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-rose-700 bg-rose-50/50">
                        ${d.impuestoUnicoDiff.toLocaleString('es-CL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-mono font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
                  <tr>
                    <td className="py-3 px-3 uppercase font-sans">Totales Reliquidados</td>
                    <td className="py-3 px-3 text-right">-</td>
                    <td className="py-3 px-3 text-right text-indigo-700">${activeReliquidation.montoTotalBruto.toLocaleString('es-CL')}</td>
                    <td className="py-3 px-3 text-right">-</td>
                    <td className="py-3 px-3 text-right">-</td>
                    <td className="py-3 px-3 text-right text-amber-700" colSpan={3}>
                      Total Prev: ${activeReliquidation.totalCotizacionesPrevisionales.toLocaleString('es-CL')}
                    </td>
                    <td className="py-3 px-3 text-right" colSpan={4}>-</td>
                    <td className="py-3 px-3 text-right font-extrabold text-rose-700 bg-rose-100">
                      ${activeReliquidation.totalImpuestoUnicoRetenido.toLocaleString('es-CL')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Formato de Comprobante Imprimible / Formal */}
          <div className="bg-white rounded-2xl border border-slate-300 p-8 shadow-sm space-y-6 print:block">
            <div className="flex justify-between items-start border-b border-slate-300 pb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 uppercase">
                  {companyName}
                </h2>
                <p className="text-xs text-slate-600">RUT: {companyRut}</p>
                <p className="text-xs font-bold text-indigo-900 mt-1 uppercase">
                  Comprobante Legal de Reliquidación de Remuneraciones
                </p>
                <p className="text-[11px] text-slate-500">
                  Conforme al Art. 43 y 48 de la Ley de Impuesto a la Renta (SII) y Art. 47 del Código del Trabajo
                </p>
              </div>
              <div className="text-right text-xs">
                <span className="font-bold text-slate-900 block">Período Pago: {activeReliquidation.periodPayment}</span>
                <span className="text-slate-500 block">Año Devengo: {activeReliquidation.yearOrigin}</span>
                <span className="text-[10px] font-mono text-slate-400">Folio: {activeReliquidation.id}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p><strong>Trabajador:</strong> {activeReliquidation.employeeName}</p>
                <p><strong>RUT:</strong> {activeReliquidation.employeeRut}</p>
                <p><strong>Cargo:</strong> {selectedEmployee?.position || 'Colaborador'}</p>
                <p><strong>AFP / Salud:</strong> {selectedEmployee?.pensionSystem} / {selectedEmployee?.healthSystem}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p><strong>Concepto Reliquidado:</strong> {activeReliquidation.conceptName}</p>
                <p><strong>Tipo:</strong> {activeReliquidation.reliquidationType}</p>
                <p><strong>Meses Prorrateados:</strong> {activeReliquidation.monthsCount} meses</p>
                <p><strong>Fecha Emisión:</strong> {new Date().toLocaleDateString('es-CL')}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 p-4 bg-slate-100 rounded-xl font-mono text-xs text-slate-900 text-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Bono Bruto</span>
                <span className="text-base font-bold">${activeReliquidation.montoTotalBruto.toLocaleString('es-CL')}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Leyes Sociales Retenidas</span>
                <span className="text-base font-bold text-amber-700">-${activeReliquidation.totalCotizacionesPrevisionales.toLocaleString('es-CL')}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Impuesto Único Reliquidado</span>
                <span className="text-base font-bold text-rose-700">-${activeReliquidation.totalImpuestoUnicoRetenido.toLocaleString('es-CL')}</span>
              </div>
              <div className="bg-emerald-100 p-2 rounded-lg">
                <span className="text-[10px] uppercase font-extrabold text-emerald-800 block">Líquido a Percibir</span>
                <span className="text-base font-extrabold text-emerald-900">${activeReliquidation.liquidoAPagar.toLocaleString('es-CL')}</span>
              </div>
            </div>

            <div className="pt-12 grid grid-cols-2 gap-16 text-center text-xs">
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold text-slate-900">Firma Empleador</p>
                <p className="text-slate-500 text-[11px]">{companyName}</p>
              </div>
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold text-slate-900">Firma Trabajador</p>
                <p className="text-slate-500 text-[11px]">{activeReliquidation.employeeName} - {activeReliquidation.employeeRut}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
