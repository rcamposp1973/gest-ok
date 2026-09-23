import React, { useState, useMemo } from 'react';
import { 
  FileText, Download, CheckCircle2, AlertTriangle, 
  Building2, Users, FileSpreadsheet, ShieldCheck, Sparkles, HelpCircle
} from 'lucide-react';
import { Company, Employee, PayrollSlip, ChartOfAccount } from '../types';
import * as XLSX from 'xlsx';

interface DeclaracionesJuradasViewProps {
  company: Company;
  employees: Employee[];
  savedSlips?: PayrollSlip[];
  accounts: ChartOfAccount[];
}

export const DeclaracionesJuradasView: React.FC<DeclaracionesJuradasViewProps> = ({
  company,
  employees = [],
  savedSlips = [],
  accounts = []
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(2025); // Año AT
  const [activeDjTab, setActiveDjTab] = useState<'DJ_1887' | 'DJ_1879' | 'DJ_1847'>('DJ_1887');

  // Procesamiento de DJ 1887 (Sueldos y Remuneraciones)
  const dj1887Data = useMemo(() => {
    return employees.map(emp => {
      // Filtrar liquidaciones del año seleccionado
      const empSlips = savedSlips.filter(s => {
        const pYear = s.period ? parseInt(s.period.split('-')[0], 10) : 0;
        return pYear === selectedYear && (s.employeeId === emp.id || s.employeeRut === emp.rut);
      });

      const totalRentasAfectas = empSlips.reduce((sum, s) => sum + (s.rentaAfectaImpuesto || s.totalHaberesImponibles || s.sueldoBaseProporcional || 0), 0);
      const totalImpuestoUnico = empSlips.reduce((sum, s) => sum + (s.impuestoUnicoSegundaCategoria || 0), 0);
      const totalLeyesSociales = empSlips.reduce((sum, s) => sum + (s.totalDescuentosPrevisionales || 0), 0);

      return {
        rut: emp.rut,
        nombre: emp.name || emp.rut,
        mesesTrabajados: empSlips.length || 12,
        rentasAfectas: totalRentasAfectas,
        impuestoUnico: totalImpuestoUnico,
        leyesSociales: totalLeyesSociales,
        rebajaZonasExtremas: 0
      };
    });
  }, [employees, savedSlips, selectedYear]);

  // Exportar TXT Estándar SII para DJ 1887
  const handleExportDJ1887Txt = () => {
    let txt = `1887;${company.rut};${selectedYear + 1};${dj1887Data.length}\n`;
    dj1887Data.forEach((row, idx) => {
      txt += `${idx + 1};${row.rut};${row.rentasAfectas};${row.impuestoUnico};${row.leyesSociales}\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DJ1887_${company.rut}_AT${selectedYear + 1}.txt`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-amber-950 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-black tracking-tight">
              Módulo de Declaraciones Juradas Anuales SII (DDJJ Operación Renta)
            </h2>
            <span className="text-[10px] bg-amber-500/30 border border-amber-400/50 text-amber-200 px-2.5 py-0.5 rounded-full font-bold">
              v3.0 Tier-1
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Generación y exportación de archivos planos oficiales para carga en SII (DJ 1887, DJ 1879, DJ 1847)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-300">Año Comercial:</label>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:bg-slate-900"
          >
            <option value={2025} className="text-slate-900">2025 (AT 2026)</option>
            <option value={2024} className="text-slate-900">2024 (AT 2025)</option>
          </select>
        </div>
      </div>

      {/* TABS DE DDJJ */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveDjTab('DJ_1887')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeDjTab === 'DJ_1887' ? 'border-amber-600 text-amber-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📄 DJ 1887 - Sueldos y Remuneraciones
        </button>
        <button
          onClick={() => setActiveDjTab('DJ_1879')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeDjTab === 'DJ_1879' ? 'border-amber-600 text-amber-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📄 DJ 1879 - Retenciones de Honorarios
        </button>
        <button
          onClick={() => setActiveDjTab('DJ_1847')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeDjTab === 'DJ_1847' ? 'border-amber-600 text-amber-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📄 DJ 1847 - Balance 8 Columnas e Inventario
        </button>
      </div>

      {/* CONTENIDO TAB DJ 1887 */}
      {activeDjTab === 'DJ_1887' && (
        <div className="bg-white rounded-2xl border border-slate-300 p-6 space-y-4 shadow-xs">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm text-slate-900">DJ 1887 - Declaración Jurada sobre Rentas del Art. 42 N° 1</h3>
              <p className="text-xs text-slate-500">Muestreo anual ajustado de remuneraciones e impuesto único de trabajadores</p>
            </div>
            <button
              onClick={handleExportDJ1887Txt}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar TXT para SII (DJ 1887)</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b">
                  <th className="p-2.5">RUT Trabajador</th>
                  <th className="p-2.5">Nombre Completo</th>
                  <th className="p-2.5 text-center">Meses Trab.</th>
                  <th className="p-2.5 text-right">Monto Rentas Afectas</th>
                  <th className="p-2.5 text-right">Impuesto Único Retenido</th>
                  <th className="p-2.5 text-right">Leyes Sociales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {dj1887Data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-bold text-indigo-900">{row.rut}</td>
                    <td className="p-2.5 font-medium">{row.nombre}</td>
                    <td className="p-2.5 text-center font-bold">{row.mesesTrabajados}</td>
                    <td className="p-2.5 text-right font-mono">${row.rentasAfectas.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-mono text-indigo-700">${row.impuestoUnico.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-mono">${row.leyesSociales.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
