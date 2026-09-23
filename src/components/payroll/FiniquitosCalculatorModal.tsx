import React, { useState, useMemo } from 'react';
import { 
  FileText, Calculator, Download, Printer, X, CheckCircle2, 
  AlertCircle, DollarSign, Calendar, User, ShieldCheck, ArrowRight, Building2
} from 'lucide-react';
import { Employee, FiniquitoRecord, ChartOfAccount } from '../../types';
import { formatRut } from '../../utils/rutMatcher';
import jsPDF from 'jspdf';

interface FiniquitosCalculatorModalProps {
  companyName: string;
  companyRut: string;
  companyAddress?: string;
  employees: Employee[];
  accounts: ChartOfAccount[];
  onClose: () => void;
  onSaveFiniquito?: (record: FiniquitoRecord) => void;
}

export const CHILEAN_TERMINATION_CAUSALS = [
  { code: 'ART_161_NECESIDADES', name: 'Art. 161 - Necesidades de la Empresa', requiereIAS: true, requiereAvisoPrevio: true },
  { code: 'ART_159_MUTUO_ACUERDO', name: 'Art. 159 N° 1 - Mutuo Acuerdo de las Partes', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_RENUNCIA', name: 'Art. 159 N° 2 - Renuncia Voluntaria del Trabajador', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_VENCIMIENTO', name: 'Art. 159 N° 4 - Vencimiento del Plazo del Contrato', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_CONCLUSION', name: 'Art. 159 N° 5 - Conclusión del Trabajo o Servicio', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_160_GRAVE', name: 'Art. 160 - Incumplimiento Grave / Conducta Indebida', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_161_DESAHUCIO', name: 'Art. 161 inc. 2° - Desahucio Escrito del Empleador (Cargos de Confianza)', requiereIAS: true, requiereAvisoPrevio: true }
];

export const FiniquitosCalculatorModal: React.FC<FiniquitosCalculatorModalProps> = ({
  companyName,
  companyRut,
  companyAddress = 'Santiago, Chile',
  employees,
  accounts,
  onClose,
  onSaveFiniquito
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [causalCode, setCausalCode] = useState<string>('ART_161_NECESIDADES');
  const [fechaCese, setFechaCese] = useState<string>(new Date().toISOString().slice(0, 10));
  const [conAvisoPrevio, setConAvisoPrevio] = useState<boolean>(false);
  
  // Días de vacaciones consumidos o pendientes
  const [diasVacacionesHabiles, setDiasVacacionesHabiles] = useState<number>(0);
  const [descuentosPrestamos, setDescuentosPrestamos] = useState<number>(0);
  const [otrosHaberes, setOtrosHaberes] = useState<number>(0);
  const [otrosDescuentos, setOtrosDescuentos] = useState<number>(0);

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmployeeId || e.rut === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const causalConfig = useMemo(() => {
    return CHILEAN_TERMINATION_CAUSALS.find(c => c.code === causalCode) || CHILEAN_TERMINATION_CAUSALS[0];
  }, [causalCode]);

  // Cálculos Automáticos según Código del Trabajo
  const finiquitoCalculated = useMemo(() => {
    if (!selectedEmployee) return null;

    const fIngreso = new Date(selectedEmployee.hireDate || '2025-01-01');
    const fCese = new Date(fechaCese || new Date());

    // Antigüedad en días
    const diffTime = Math.max(0, fCese.getTime() - fIngreso.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Antigüedad en Años y Meses
    const anosCompletos = Math.floor(diffDays / 365);
    const mesesRestantes = Math.floor((diffDays % 365) / 30);
    
    // Regla Art. 161: Se otorga 1 año de indemnización por cada año completo o fracción superior a 6 meses. Máximo 11 años.
    let anosParaIAS = anosCompletos;
    if (mesesRestantes >= 6) {
      anosParaIAS += 1;
    }
    anosParaIAS = Math.min(11, anosParaIAS);

    const baseSueldo = selectedEmployee.baseSalary || 500000;
    // Tope de 90 UF legal (aprox $3.450.000)
    const topeUF = 3450000;
    const baseSueldoTopado = Math.min(baseSueldo, topeUF);

    // 1. IAS (Indemnización por Años de Servicio)
    const montoIAS = causalConfig.requiereIAS ? anosParaIAS * baseSueldoTopado : 0;

    // 2. Sustitutiva de Aviso Previo
    const montoAvisoPrevio = (causalConfig.requiereAvisoPrevio && !conAvisoPrevio) ? baseSueldoTopado : 0;

    // 3. Vacaciones Proporcionales (1.25 días por mes trabajado)
    const mesesTrabajadosTotal = (diffDays / 30);
    const diasVacacionesTotalesDevengados = mesesTrabajadosTotal * 1.25;
    const diasPendientesReal = Math.max(0, diasVacacionesTotalesDevengados - diasVacacionesHabiles);
    
    // Factor de conversión días hábiles a corridos (1.4 aproximado)
    const valorDiaTrabajador = baseSueldo / 30;
    const montoVacaciones = Math.round(diasPendientesReal * 1.4 * valorDiaTrabajador);

    const totalBruto = montoIAS + montoAvisoPrevio + montoVacaciones + otrosHaberes;
    const totalDescuentos = descuentosPrestamos + otrosDescuentos;
    const totalLiquido = Math.max(0, totalBruto - totalDescuentos);

    return {
      diffDays,
      anosCompletos,
      mesesRestantes,
      anosParaIAS,
      baseSueldo,
      montoIAS,
      montoAvisoPrevio,
      diasPendientesReal: Math.round(diasPendientesReal * 10) / 10,
      montoVacaciones,
      totalBruto,
      totalDescuentos,
      totalLiquido
    };
  }, [selectedEmployee, fechaCese, causalConfig, conAvisoPrevio, diasVacacionesHabiles, descuentosPrestamos, otrosHaberes, otrosDescuentos]);

  // Generar PDF Oficial del Finiquito
  const handleDownloadPDF = () => {
    if (!selectedEmployee || !finiquitoCalculated) return;

    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('FINIQUITO DE CONTRATO DE TRABAJO', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`En Santiago de Chile, a ${new Date().toLocaleDateString('es-CL')}, entre:`, 14, 32);

    doc.setFont('helvetica', 'bold');
    doc.text(`EMPLEADOR: ${companyName.toUpperCase()}`, 14, 40);
    doc.setFont('helvetica', 'normal');
    doc.text(`RUT: ${formatRut(companyRut)} | Domicilio: ${companyAddress}`, 14, 46);

    doc.setFont('helvetica', 'bold');
    doc.text(`TRABAJADOR: ${selectedEmployee.name}`.toUpperCase(), 14, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(`RUT: ${formatRut(selectedEmployee.rut)} | Cargo: ${selectedEmployee.position || 'Trabajador'}`, 14, 62);

    doc.setFont('helvetica', 'bold');
    doc.text('I. ANTECEDENTES DEL CONTRATO', 14, 74);
    doc.setFont('helvetica', 'normal');
    doc.text(`• Fecha de Ingreso: ${selectedEmployee.hireDate}`, 14, 82);
    doc.text(`• Fecha de Cese de Funciones: ${fechaCese}`, 14, 88);
    doc.text(`• Causal de Término: ${causalConfig.name}`, 14, 94);
    doc.text(`• Tiempo de Servicios: ${finiquitoCalculated.anosCompletos} años y ${finiquitoCalculated.mesesRestantes} meses.`, 14, 100);

    doc.setFont('helvetica', 'bold');
    doc.text('II. LIQUIDACIÓN DE HABERES E INDEMNIZACIONES', 14, 112);

    let y = 120;
    doc.setFont('helvetica', 'normal');
    doc.text(`Indemnización por Años de Servicio (${finiquitoCalculated.anosParaIAS} años):`, 14, y);
    doc.text(`$ ${finiquitoCalculated.montoIAS.toLocaleString('es-CL')}`, 170, y, { align: 'right' });
    y += 6;

    doc.text(`Indemnización Sustitutiva Aviso Previo:`, 14, y);
    doc.text(`$ ${finiquitoCalculated.montoAvisoPrevio.toLocaleString('es-CL')}`, 170, y, { align: 'right' });
    y += 6;

    doc.text(`Vacaciones Proporcionales (${finiquitoCalculated.diasPendientesReal} días):`, 14, y);
    doc.text(`$ ${finiquitoCalculated.montoVacaciones.toLocaleString('es-CL')}`, 170, y, { align: 'right' });
    y += 6;

    if (otrosHaberes > 0) {
      doc.text(`Otros Haberes Finiquito:`, 14, y);
      doc.text(`$ ${otrosHaberes.toLocaleString('es-CL')}`, 170, y, { align: 'right' });
      y += 6;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL BRUTO FINIQUITO:`, 14, y);
    doc.text(`$ ${finiquitoCalculated.totalBruto.toLocaleString('es-CL')}`, 170, y, { align: 'right' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    if (descuentosPrestamos > 0 || otrosDescuentos > 0) {
      doc.text(`Descuentos (Préstamos / Anticipos):`, 14, y);
      doc.text(`- $ ${finiquitoCalculated.totalDescuentos.toLocaleString('es-CL')}`, 170, y, { align: 'right' });
      y += 8;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`TOTAL LÍQUIDO A RECIBIR: $ ${finiquitoCalculated.totalLiquido.toLocaleString('es-CL')}`, 14, y);

    y += 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('DECLARACIÓN DE AMPLO Y COMPLETO FINIQUITO:', 14, y);
    y += 6;
    doc.text('El trabajador declara recibir a su entera satisfacción la suma líquida antes señalada, no teniendo cargo ni reclamo alguno', 14, y);
    y += 5;
    doc.text('que formular en contra del empleador por concepto de remuneraciones, cotizaciones o indemnizaciones de ninguna especie.', 14, y);

    y += 35;
    doc.line(20, y, 90, y);
    doc.line(120, y, 190, y);
    doc.text('FIRMA EMPLEADOR', 55, y + 5, { align: 'center' });
    doc.text('FIRMA TRABAJADOR', 155, y + 5, { align: 'center' });

    doc.save(`Finiquito_${selectedEmployee.rut}_${fechaCese}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-200 shadow-xs">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight flex items-center gap-2">
                <span>Calculadora Legal de Finiquito de Contrato (Código del Trabajo Chile)</span>
                <span className="text-[10px] bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 px-2 py-0.5 rounded-full uppercase font-bold">
                  v3.0 Tier-1
                </span>
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Cálculo de Años de Servicio (Art. 161), Aviso Previo y Vacaciones Proporcionales
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Employee Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Seleccionar Colaborador / Trabajador:
              </label>
              <select
                value={selectedEmployeeId}
                onChange={e => setSelectedEmployeeId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Seleccionar Trabajador Activo --</option>
                {employees.map(emp => (
                  <option key={emp.id || emp.rut} value={emp.id || emp.rut}>
                    {emp.name} ({formatRut(emp.rut)}) - Sueldo: ${emp.baseSalary?.toLocaleString('es-CL')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Causal de Término de Contrato (Código del Trabajo):
              </label>
              <select
                value={causalCode}
                onChange={e => setCausalCode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                {CHILEAN_TERMINATION_CAUSALS.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedEmployee && finiquitoCalculated && (
            <>
              {/* Parameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-1">
                  <span className="text-[11px] font-bold text-indigo-900 block">Fecha de Cese de Funciones:</span>
                  <input
                    type="date"
                    value={fechaCese}
                    onChange={e => setFechaCese(e.target.value)}
                    className="w-full bg-white border border-indigo-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Aviso Previo Dado (30 días):</span>
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={conAvisoPrevio}
                      onChange={e => setConAvisoPrevio(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-xs text-slate-800 font-medium">Sí, se notificó con 30 días de anticipación</span>
                  </label>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Días Vacaciones Ya Tomadas:</span>
                  <input
                    type="number"
                    value={diasVacacionesHabiles}
                    onChange={e => setDiasVacacionesHabiles(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Summary Calculation Display */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-sm text-slate-200">
                      Resumen del Finiquito: {selectedEmployee.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-indigo-300 bg-indigo-900/50 px-2.5 py-1 rounded-full border border-indigo-700/50">
                    Antigüedad: {finiquitoCalculated.anosCompletos} años, {finiquitoCalculated.mesesRestantes} meses
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase block font-bold">Años de Servicio (Art. 161)</span>
                    <span className="text-lg font-mono font-black text-emerald-400 mt-1 block">
                      $ {finiquitoCalculated.montoIAS.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {finiquitoCalculated.anosParaIAS} años computables
                    </span>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase block font-bold">Sustitutiva Aviso Previo</span>
                    <span className="text-lg font-mono font-black text-indigo-400 mt-1 block">
                      $ {finiquitoCalculated.montoAvisoPrevio.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {finiquitoCalculated.montoAvisoPrevio > 0 ? '1 mes de sueldo' : 'Sin indemnización'}
                    </span>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase block font-bold">Vacaciones Proporcionales</span>
                    <span className="text-lg font-mono font-black text-amber-400 mt-1 block">
                      $ {finiquitoCalculated.montoVacaciones.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {finiquitoCalculated.diasPendientesReal} días pend.
                    </span>
                  </div>

                  <div className="bg-emerald-950/80 p-3 rounded-xl border border-emerald-600/50">
                    <span className="text-emerald-300 text-[10px] uppercase block font-bold">Total Líquido Finiquito</span>
                    <span className="text-xl font-mono font-black text-emerald-300 mt-1 block">
                      $ {finiquitoCalculated.totalLiquido.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-emerald-400 mt-0.5 block">
                      Monto a pago al trabajador
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cerrar
          </button>

          {selectedEmployee && finiquitoCalculated && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPDF}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Descargar Finiquito Oficial (PDF)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
