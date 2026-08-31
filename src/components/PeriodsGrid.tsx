import React, { useState, useMemo } from 'react';
import { FiscalYear, AccountingVoucher, RCVDocument } from '../types';
import { 
  Calendar, 
  Search, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertCircle, 
  X,
  FileSpreadsheet,
  Layers,
  Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface PeriodsGridProps {
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  fiscalYears: FiscalYear[];
  vouchers: AccountingVoucher[];
  rcvDocuments: RCVDocument[];
  onToggleMonthStatus: (year: number, monthNum: number, currentStatus: 'Abierto' | 'Cerrado') => Promise<void>;
  onEnsureFiscalYear: (year: number) => Promise<void>;
}

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function PeriodsGrid({
  selectedYear,
  setSelectedYear,
  fiscalYears,
  vouchers,
  rcvDocuments,
  onToggleMonthStatus,
  onEnsureFiscalYear
}: PeriodsGridProps) {
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState({
    year: 'ALL',
    periodCode: '',
    monthName: '',
    status: 'ALL'
  });

  // Asegurar año fiscal si no está inicializado
  const currentFy = useMemo(() => {
    return fiscalYears.find(f => f.id === String(selectedYear));
  }, [fiscalYears, selectedYear]);

  // Lista unificada de períodos (12 meses por año)
  const periodRows = useMemo(() => {
    if (!currentFy || !currentFy.months) return [];

    return Object.entries(currentFy.months).map(([mNumStr, status]) => {
      const mNum = parseInt(mNumStr);
      const periodCode = `${selectedYear}-${String(mNum).padStart(2, '0')}`;
      const monthName = MONTH_NAMES[mNum] || `Mes ${mNum}`;

      // Conteo de comprobantes contables en este período
      const voucherCount = vouchers.filter(v => 
        v.date && v.date.startsWith(periodCode) && v.status !== 'Anulado'
      ).length;

      // Conteo de documentos RCV en este período
      const rcvCount = rcvDocuments.filter(d => 
        d.period === periodCode || (d.fechaEmision && d.fechaEmision.startsWith(periodCode))
      ).length;

      return {
        id: periodCode,
        year: selectedYear,
        monthNum: mNum,
        monthName,
        periodCode,
        status: status as 'Abierto' | 'Cerrado',
        voucherCount,
        rcvCount
      };
    });
  }, [currentFy, selectedYear, vouchers, rcvDocuments]);

  // Filtrado reactivo en la grilla
  const filteredRows = useMemo(() => {
    return periodRows.filter(row => {
      // Buscador global
      if (globalSearch) {
        const q = globalSearch.toLowerCase().trim();
        const matchesGlobal =
          row.periodCode.toLowerCase().includes(q) ||
          row.monthName.toLowerCase().includes(q) ||
          row.status.toLowerCase().includes(q);
        if (!matchesGlobal) return false;
      }

      // Filtros por columna
      if (columnFilters.year !== 'ALL' && String(row.year) !== columnFilters.year) return false;
      if (columnFilters.periodCode && !row.periodCode.toLowerCase().includes(columnFilters.periodCode.toLowerCase().trim())) return false;
      if (columnFilters.monthName && !row.monthName.toLowerCase().includes(columnFilters.monthName.toLowerCase().trim())) return false;
      if (columnFilters.status !== 'ALL' && row.status !== columnFilters.status) return false;

      return true;
    });
  }, [periodRows, globalSearch, columnFilters]);

  // Exportar a Excel
  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;
    const data = filteredRows.map((r, idx) => ({
      'N°': idx + 1,
      'Año Comercial': r.year,
      'Código Período': r.periodCode,
      'Mes': r.monthName,
      'Estado': r.status,
      'Comprobantes Contables': r.voucherCount,
      'Documentos RCV': r.rcvCount
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Periods');
    XLSX.writeFile(wb, `Ejercicios_Periodos_${selectedYear}.xlsx`);
  };

  const openCount = periodRows.filter(r => r.status === 'Abierto').length;
  const closedCount = periodRows.filter(r => r.status === 'Cerrado').length;
  const hasActiveFilters = globalSearch || Object.values(columnFilters).some(v => v && v !== 'ALL');

  return (
    <div className="space-y-4">
      {/* HEADER SUPERIOR */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              Control de Ejercicios y Períodos Tributarios (Grilla Oficial)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Apertura y cierre mensual de contabilidad para emisión de balances, F29 e informes oficiales.
          </p>
        </div>

        {/* ACCIONES SUPERIORES */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Año Comercial */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 p-1 rounded-lg">
            <label className="text-xs font-bold text-slate-700 pl-2">Año Fiscal:</label>
            <select
              value={selectedYear}
              onChange={e => {
                const yr = parseInt(e.target.value);
                setSelectedYear(yr);
                onEnsureFiscalYear(yr);
              }}
              className="bg-white border border-slate-300 px-2 py-1 rounded text-xs font-bold font-mono text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
              <Unlock className="w-3.5 h-3.5" /> Abiertos: {openCount}
            </span>
            <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-300 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Cerrados: {closedCount}
            </span>
          </div>

          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* GRILLA ESTILO EXCEL */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-xs text-left border-collapse font-sans select-none">
            <thead>
              {/* ENCABEZADOS DE TÍTULO */}
              <tr className="bg-slate-800 text-white text-[11px] font-bold tracking-tight border-b border-slate-900 sticky top-0 z-10 shadow-xs">
                <th className="w-12 px-2 py-2 text-center bg-slate-900 border-r border-slate-700">N°</th>
                <th className="w-28 px-2 py-2 border-r border-slate-700 text-center font-mono">AÑO</th>
                <th className="w-36 px-2 py-2 border-r border-slate-700 font-mono">CÓDIGO PERÍODO *</th>
                <th className="w-48 px-2 py-2 border-r border-slate-700">MES CALENDARIO *</th>
                <th className="w-36 px-2 py-2 text-center border-r border-slate-700">ESTADO DEL PERÍODO</th>
                <th className="w-44 px-2 py-2 text-center border-r border-slate-700">ASIENTOS REGISTRADOS</th>
                <th className="w-44 px-2 py-2 text-center border-r border-slate-700">DOCUMENTOS RCV</th>
                <th className="w-44 px-2 py-2 text-center bg-slate-900">ACCIONES DE CIERRE</th>
              </tr>

              {/* ENCABEZADOS DE FILTROS EN TITULOS */}
              <tr className="bg-slate-900 text-slate-200 text-[10px] border-b-2 border-slate-900 sticky top-[33px] z-10 shadow-xs">
                <th className="p-1 text-center bg-slate-950 border-r border-slate-800 font-mono text-slate-500">🔍</th>
                <th className="p-1 border-r border-slate-800">
                  <select
                    value={columnFilters.year}
                    onChange={e => setColumnFilters(prev => ({ ...prev, year: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 rounded text-[10px] outline-none font-mono focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="ALL">Todos</option>
                    {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar YYYY-MM..."
                    value={columnFilters.periodCode}
                    onChange={e => setColumnFilters(prev => ({ ...prev, periodCode: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 placeholder-slate-500 px-1.5 py-0.5 rounded text-[10px] outline-none font-mono focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar mes (ej: Enero)..."
                    value={columnFilters.monthName}
                    onChange={e => setColumnFilters(prev => ({ ...prev, monthName: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 placeholder-slate-500 px-1.5 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <select
                    value={columnFilters.status}
                    onChange={e => setColumnFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="ALL">Todos</option>
                    <option value="Abierto">Abierto</option>
                    <option value="Cerrado">Cerrado</option>
                  </select>
                </th>
                <th className="p-1 border-r border-slate-800 bg-slate-950"></th>
                <th className="p-1 border-r border-slate-800 bg-slate-950"></th>
                <th className="p-1 bg-slate-950 text-center">
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        setGlobalSearch('');
                        setColumnFilters({ year: 'ALL', periodCode: '', monthName: '', status: 'ALL' });
                      }}
                      className="text-[9px] bg-rose-900/80 hover:bg-rose-800 text-rose-200 px-1.5 py-0.5 rounded font-bold"
                    >
                      Limpiar
                    </button>
                  )}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    <p className="font-semibold text-sm text-slate-700">No se encontraron períodos para el filtro seleccionado.</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const isOpen = row.status === 'Abierto';

                  return (
                    <tr 
                      key={row.periodCode}
                      className={`hover:bg-amber-50/40 transition-colors ${
                        isOpen ? 'bg-white' : 'bg-slate-50/80 text-slate-600'
                      }`}
                    >
                      {/* N° */}
                      <td className="px-2 py-2 text-center font-mono text-[10px] text-slate-400 bg-slate-50 border-r border-slate-200">
                        {idx + 1}
                      </td>

                      {/* AÑO */}
                      <td className="px-2 py-2 text-center font-mono font-bold text-slate-700 border-r border-slate-200">
                        {row.year}
                      </td>

                      {/* CÓDIGO PERÍODO */}
                      <td className="px-3 py-2 font-mono font-bold text-indigo-700 border-r border-slate-200">
                        <span className="bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {row.periodCode}
                        </span>
                      </td>

                      {/* NOMBRE DEL MES */}
                      <td className="px-3 py-2 font-semibold text-slate-900 border-r border-slate-200">
                        {row.monthName} {row.year}
                      </td>

                      {/* ESTADO PERÍODO */}
                      <td className="px-2 py-2 text-center border-r border-slate-200">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded font-bold text-[11px] ${
                          isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {isOpen ? <Unlock className="w-3 h-3 text-emerald-600" /> : <Lock className="w-3 h-3 text-slate-500" />}
                          <span>{row.status}</span>
                        </span>
                      </td>

                      {/* COMPROBANTES REGISTRADOS */}
                      <td className="px-2 py-2 text-center border-r border-slate-200 font-mono font-semibold text-slate-800">
                        {row.voucherCount > 0 ? (
                          <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                            {row.voucherCount} asientos
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* DOCUMENTOS RCV */}
                      <td className="px-2 py-2 text-center border-r border-slate-200 font-mono font-semibold text-slate-800">
                        {row.rcvCount > 0 ? (
                          <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded border border-purple-200">
                            {row.rcvCount} docs
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* ACCIONES */}
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => onToggleMonthStatus(row.year, row.monthNum, row.status)}
                          className={`w-full text-xs font-bold py-1.5 px-3 rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 ${
                            isOpen
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {isOpen ? (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>Cerrar Período</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Abrir Período</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA STATS */}
        <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500 font-medium">
          <span>Mostrando {filteredRows.length} períodos de {selectedYear}</span>
          <span className="font-mono">Centralización & Cierre Fiscal</span>
        </div>
      </div>
    </div>
  );
}
