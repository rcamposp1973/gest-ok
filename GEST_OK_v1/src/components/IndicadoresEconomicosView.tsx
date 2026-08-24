import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { ExchangeRate } from '../types';
import { syncOnlineChileanIndicators, generateOfficialChileanIndicators } from '../utils/chileanEconomicIndicators';
import { useProcess } from '../context/ProcessContext';
import { 
  TrendingUp, 
  Calendar, 
  RefreshCw, 
  Download, 
  Search, 
  FileSpreadsheet, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  DollarSign,
  Layers,
  ArrowUpDown,
  Calculator,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface IndicadoresEconomicosViewProps {
  studyId: string;
  selectedYear: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function IndicadoresEconomicosView({ studyId, selectedYear }: IndicadoresEconomicosViewProps) {
  const { withProcess } = useProcess();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // Filtros
  const [currentYear, setCurrentYear] = useState<number>(selectedYear || 2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [viewMode, setViewMode] = useState<'monthly_table' | 'annual_summary' | 'calculator'>('monthly_table');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculadora de Conversión y Corrección Monetaria
  const [calcAmount, setCalcAmount] = useState<number>(1000000);
  const [calcDateFrom, setCalcDateFrom] = useState<string>(`${currentYear}-01-01`);
  const [calcDateTo, setCalcDateTo] = useState<string>(`${currentYear}-12-31`);
  const [calcIndicator, setCalcIndicator] = useState<'UF' | 'USD' | 'EUR' | 'UTM' | 'IPC'>('UF');

  // Cargar indicadores de la base de datos para el año
  const loadRates = async (yearToLoad: number) => {
    setLoading(true);
    try {
      const ratesRef = collection(db, 'studies', studyId, 'exchangeRates');
      const snapshot = await getDocs(ratesRef);
      let list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ExchangeRate));

      // Filtrar por año
      list = list.filter(r => r.date && r.date.startsWith(`${yearToLoad}-`));

      // Si no existen datos o están vacíos para este año, generar indicadores base oficiales
      if (list.length === 0) {
        const rawGenerated = generateOfficialChileanIndicators(`${yearToLoad}-01-01`);
        const generated: ExchangeRate[] = rawGenerated.map(item => ({
          id: item.date,
          date: item.date,
          uf: item.uf,
          dolar: item.dolar,
          utm: item.utm,
          euro: item.euro,
          yen: item.yen,
          ipc: item.ipc,
          ipcAcomulado: item.ipcAcomulado
        }));

        // Guardar lote en Firestore
        const batch = writeBatch(db);
        generated.forEach(item => {
          const docRef = doc(db, 'studies', studyId, 'exchangeRates', item.date);
          batch.set(docRef, item);
        });
        await batch.commit();
        list = generated;
        setStatusMessage({
          type: 'info',
          text: `Se inicializaron automáticamente los indicadores oficiales del Banco Central y SII para el año ${yearToLoad}.`
        });
      }

      // Ordenar por fecha ascendente
      list.sort((a, b) => a.date.localeCompare(b.date));
      setRates(list);
    } catch (err: any) {
      console.error("Error cargando indicadores económicos:", err);
      setStatusMessage({
        type: 'error',
        text: 'Error al conectar con la base de datos de indicadores: ' + err.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRates(currentYear);
  }, [studyId, currentYear]);

  // Sincronización en línea desde APIs oficiales (mindicador.cl / Banco Central)
  const handleSyncOnline = async () => {
    setSyncing(true);
    setStatusMessage(null);
    try {
      await withProcess(
        `Sincronizando Indicadores Oficiales (UF, Dólar, UTM, Euro, IPC)...`,
        async (updateProgress) => {
          updateProgress({
            message: `Consultando APIs oficiales del Banco Central y SII...`,
            stage: `Conectando con fuentes de datos chilenas`
          });
          const dailyList = await syncOnlineChileanIndicators();
          const yearList = dailyList.filter(d => d.date.startsWith(`${currentYear}-`));

          updateProgress({
            current: yearList.length,
            total: yearList.length,
            message: `Guardando ${yearList.length} valores oficiales en la base de datos...`,
            stage: `Año ${currentYear}`
          });
          
          const batch = writeBatch(db);
          yearList.forEach(item => {
            const docRef = doc(db, 'studies', studyId, 'exchangeRates', item.date);
            batch.set(docRef, {
              id: item.date,
              date: item.date,
              uf: item.uf,
              dolar: item.dolar,
              utm: item.utm,
              euro: item.euro,
              yen: item.yen,
              ipc: item.ipc,
              ipcAcomulado: item.ipcAcomulado
            });
          });
          await batch.commit();

          setStatusMessage({
            type: 'success',
            text: `Se han sincronizado exitosamente ${yearList.length} registros del año ${currentYear} con las fuentes oficiales.`
          });
          await loadRates(currentYear);
        }
      );
    } catch (err: any) {
      console.error("Error en sincronización:", err);
      setStatusMessage({
        type: 'error',
        text: 'No se pudo completar la sincronización en línea: ' + err.message
      });
    } finally {
      setSyncing(false);
    }
  };

  // Filtrado de registros para la tabla mensual
  const monthPrefix = `${currentYear}-${String(selectedMonth).padStart(2, '0')}`;
  const monthlyRates = rates.filter(r => r.date.startsWith(monthPrefix));

  // Obtener indicadores clave del mes (primer día, último día, promedio)
  const firstDayRate = monthlyRates.length > 0 ? monthlyRates[0] : null;
  const lastDayRate = monthlyRates.length > 0 ? monthlyRates[monthlyRates.length - 1] : null;
  
  const avgUf = monthlyRates.length > 0 ? (monthlyRates.reduce((acc, r) => acc + (r.uf || 0), 0) / monthlyRates.length) : 0;
  const avgDolar = monthlyRates.length > 0 ? (monthlyRates.reduce((acc, r) => acc + (r.dolar || 0), 0) / monthlyRates.length) : 0;
  const avgEuro = monthlyRates.length > 0 ? (monthlyRates.reduce((acc, r) => acc + (r.euro || 0), 0) / monthlyRates.length) : 0;
  const currentUtm = firstDayRate?.utm || 0;
  const currentIpc = firstDayRate?.ipc !== undefined ? firstDayRate.ipc : 0;

  // Formato chileno de moneda
  const formatCLP = (val: number, decimals: number = 2) => {
    if (val === undefined || val === null || isNaN(val)) return '$0';
    return '$' + Number(val).toLocaleString('es-CL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  // Exportar a CSV / Excel
  const handleExportCSV = () => {
    if (rates.length === 0) return;
    const headers = ['Fecha', 'UF (CLP)', 'Dólar Observado (USD)', 'Euro (EUR)', 'UTM (CLP)', 'IPC Mensual (%)'];
    const rows = rates.map(r => [
      r.date,
      r.uf ? r.uf.toString().replace('.', ',') : '',
      r.dolar ? r.dolar.toString().replace('.', ',') : '',
      r.euro ? r.euro.toString().replace('.', ',') : '',
      r.utm ? r.utm.toString().replace('.', ',') : '',
      r.ipc !== undefined ? r.ipc.toString().replace('.', ',') : ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
      [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Indicadores_Economicos_Chile_${currentYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cálculo de Corrección Monetaria y Reajustabilidad
  const getRateAtDate = (dateStr: string, indicator: string) => {
    const match = rates.find(r => r.date === dateStr);
    if (!match) return null;
    if (indicator === 'UF') return match.uf;
    if (indicator === 'USD') return match.dolar;
    if (indicator === 'EUR') return match.euro;
    if (indicator === 'UTM') return match.utm;
    return null;
  };

  const rateFrom = getRateAtDate(calcDateFrom, calcIndicator) || 1;
  const rateTo = getRateAtDate(calcDateTo, calcIndicator) || 1;
  const factorVariacion = rateFrom > 0 ? (rateTo / rateFrom) : 1;
  const variacionPorcentual = ((factorVariacion - 1) * 100);
  const montoReajustado = calcAmount * factorVariacion;
  const diferenciaReajuste = montoReajustado - calcAmount;

  return (
    <div className="space-y-6">
      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wide">
              Módulo Oficial SII & Banco Central
            </span>
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-mono">
              Año Fiscal {currentYear}
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Indicadores Económicos Oficiales de Chile
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Consulta día a día de UF, Dólar Observado, Euro, UTM e IPC con integración para corrección monetaria y asientos contables.
          </p>
        </div>

        {/* ACCIONES SUPERIORES */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Año */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setCurrentYear(currentYear - 1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-all"
              title="Año Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-bold text-xs text-slate-800 font-mono">{currentYear}</span>
            <button
              onClick={() => setCurrentYear(currentYear + 1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-all"
              title="Año Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleSyncOnline}
            disabled={syncing || loading}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Oficial'}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={rates.length === 0}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Exportar Excel/CSV
          </button>
        </div>
      </div>

      {/* MENSAJES DE ESTADO */}
      {statusMessage && (
        <div className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
          statusMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : statusMessage.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-indigo-50 border-indigo-200 text-indigo-800'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
            {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
            {statusMessage.type === 'info' && <Info className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">&times;</button>
        </div>
      )}

      {/* TARJETAS RESUMEN DEL MES SELECCIONADO */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* UF */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">UF al Cierre Mes</span>
            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">SII</span>
          </div>
          <p className="text-lg font-bold text-slate-900 font-mono">
            {lastDayRate?.uf ? formatCLP(lastDayRate.uf, 2) : '$0,00'}
          </p>
          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
            <span>Inicio Mes:</span>
            <span className="font-mono font-semibold text-slate-700">{firstDayRate?.uf ? formatCLP(firstDayRate.uf, 2) : '-'}</span>
          </div>
        </div>

        {/* DÓLAR */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Dólar Observado</span>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">BCCh</span>
          </div>
          <p className="text-lg font-bold text-slate-900 font-mono">
            {lastDayRate?.dolar ? formatCLP(lastDayRate.dolar, 2) : '$0,00'}
          </p>
          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
            <span>Promedio:</span>
            <span className="font-mono font-semibold text-slate-700">{formatCLP(avgDolar, 2)}</span>
          </div>
        </div>

        {/* EURO */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Euro (EUR)</span>
            <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">BCCh</span>
          </div>
          <p className="text-lg font-bold text-slate-900 font-mono">
            {lastDayRate?.euro ? formatCLP(lastDayRate.euro, 2) : '$0,00'}
          </p>
          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
            <span>Promedio:</span>
            <span className="font-mono font-semibold text-slate-700">{formatCLP(avgEuro, 2)}</span>
          </div>
        </div>

        {/* UTM */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">UTM del Mes</span>
            <span className="text-[10px] font-mono bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold">SII</span>
          </div>
          <p className="text-lg font-bold text-slate-900 font-mono">
            {currentUtm ? formatCLP(currentUtm, 0) : '$0'}
          </p>
          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
            <span>UTA (x12):</span>
            <span className="font-mono font-semibold text-slate-700">{formatCLP(currentUtm * 12, 0)}</span>
          </div>
        </div>

        {/* IPC */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Variación IPC</span>
            <span className="text-[10px] font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold">INE</span>
          </div>
          <p className={`text-lg font-bold font-mono ${currentIpc >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {currentIpc > 0 ? `+${currentIpc}%` : `${currentIpc}%`}
          </p>
          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
            <span>Mes:</span>
            <span className="font-semibold text-slate-700">{MONTH_NAMES[selectedMonth - 1]}</span>
          </div>
        </div>
      </div>

      {/* PESTAÑAS DE NAVEGACIÓN DE VISTAS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode('monthly_table')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              viewMode === 'monthly_table'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Tabla Mensual Día a Día
          </button>

          <button
            onClick={() => setViewMode('annual_summary')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              viewMode === 'annual_summary'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Resumen Anual (12 Meses)
          </button>

          <button
            onClick={() => setViewMode('calculator')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              viewMode === 'calculator'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Calculadora de Corrección Monetaria & Reajustes
          </button>
        </div>

        {/* SELECTOR DE MES (Solo en modo mensual) */}
        {viewMode === 'monthly_table' && (
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {MONTH_NAMES.map((name, index) => {
              const monthNum = index + 1;
              const isSelected = selectedMonth === monthNum;
              return (
                <button
                  key={monthNum}
                  onClick={() => setSelectedMonth(monthNum)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* VISTA 1: TABLA MENSUAL DÍA A DÍA */}
      {viewMode === 'monthly_table' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Valores Diarios — {MONTH_NAMES[selectedMonth - 1]} {currentYear}
              </h3>
              <span className="text-[11px] font-medium text-slate-500">
                ({monthlyRates.length} días registrados)
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar fecha (ej: 15)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/75 text-slate-700 uppercase font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4 text-right">UF (Unidad de Fomento)</th>
                  <th className="py-3 px-4 text-right">Dólar Observado (USD)</th>
                  <th className="py-3 px-4 text-right">Euro (EUR)</th>
                  <th className="py-3 px-4 text-right">UTM (Mensual)</th>
                  <th className="py-3 px-4 text-right">IPC (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyRates
                  .filter(r => !searchTerm || r.date.includes(searchTerm))
                  .map((rate) => {
                    const day = rate.date.split('-')[2];
                    const dateObj = new Date(`${rate.date}T12:00:00Z`);
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                    return (
                      <tr 
                        key={rate.date} 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isWeekend ? 'bg-slate-50/30' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                          <span className="font-bold text-indigo-700 mr-2">{day}</span>
                          <span className="text-slate-400">{rate.date}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCLP(rate.uf, 2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-800">
                          {formatCLP(rate.dolar, 2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                          {formatCLP(rate.euro, 2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                          {formatCLP(rate.utm, 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold">
                          <span className={rate.ipc && rate.ipc > 0 ? 'text-emerald-700' : 'text-slate-600'}>
                            {rate.ipc !== undefined ? `${rate.ipc}%` : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                {monthlyRates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                      No hay registros disponibles para el mes de {MONTH_NAMES[selectedMonth - 1]} {currentYear}.
                      Pulsa "Sincronizar Oficial" para regenerar los datos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: RESUMEN ANUAL DE LOS 12 MESES */}
      {viewMode === 'annual_summary' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm">
              Tabla Anual Consolidada — Ejercicio {currentYear}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Valores al cierre de cada mes para balances, reajustes de capital propio y corrección monetaria.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/75 text-slate-700 uppercase font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Mes</th>
                  <th className="py-3 px-4 text-right">UF (Fin de Mes)</th>
                  <th className="py-3 px-4 text-right">Dólar Observado Promedio</th>
                  <th className="py-3 px-4 text-right">Euro Promedio</th>
                  <th className="py-3 px-4 text-right">UTM Mensual</th>
                  <th className="py-3 px-4 text-right">IPC Mes (%)</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MONTH_NAMES.map((mName, mIdx) => {
                  const mNum = mIdx + 1;
                  const prefix = `${currentYear}-${String(mNum).padStart(2, '0')}`;
                  const mRates = rates.filter(r => r.date.startsWith(prefix));
                  const lastR = mRates.length > 0 ? mRates[mRates.length - 1] : null;
                  const firstR = mRates.length > 0 ? mRates[0] : null;
                  const avgD = mRates.length > 0 ? (mRates.reduce((a, b) => a + (b.dolar || 0), 0) / mRates.length) : 0;
                  const avgE = mRates.length > 0 ? (mRates.reduce((a, b) => a + (b.euro || 0), 0) / mRates.length) : 0;

                  return (
                    <tr key={mNum} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {mName} {currentYear}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-indigo-700">
                        {lastR ? formatCLP(lastR.uf, 2) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                        {avgD > 0 ? formatCLP(avgD, 2) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {avgE > 0 ? formatCLP(avgE, 2) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                        {firstR ? formatCLP(firstR.utm, 0) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                        {firstR?.ipc !== undefined ? `${firstR.ipc}%` : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedMonth(mNum);
                            setViewMode('monthly_table');
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          Ver Detalle &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 3: CALCULADORA DE CORRECCIÓN MONETARIA & REAJUSTES */}
      {viewMode === 'calculator' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Calculator className="w-5 h-5 text-indigo-600" />
              Calculadora de Corrección Monetaria y Reajustabilidad
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Determina automáticamente el factor de variación de UF, Dólar, Euro o UTM entre dos fechas y calcula el monto reajustado con su diferencia contable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Monto Original a Reajustar ($ CLP) *</label>
              <input
                type="number"
                value={calcAmount}
                onChange={(e) => setCalcAmount(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-sm font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Indicador Reajustador *</label>
              <select
                value={calcIndicator}
                onChange={(e) => setCalcIndicator(e.target.value as any)}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="UF">UF (Unidad de Fomento)</option>
                <option value="USD">Dólar Observado (USD)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="UTM">UTM (Unidad Tributaria Mensual)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Fecha Base (Inicio) *</label>
              <input
                type="date"
                value={calcDateFrom}
                onChange={(e) => setCalcDateFrom(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Fecha Término (Cierre) *</label>
              <input
                type="date"
                value={calcDateTo}
                onChange={(e) => setCalcDateTo(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* RESULTADOS DEL CÁLCULO */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Resultados de la Corrección / Reajuste
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 font-medium block">Valor {calcIndicator} Inicial:</span>
                <span className="text-sm font-bold font-mono text-slate-800">{formatCLP(rateFrom, 2)}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 font-medium block">Valor {calcIndicator} Final:</span>
                <span className="text-sm font-bold font-mono text-slate-800">{formatCLP(rateTo, 2)}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 font-medium block">Factor de Variación:</span>
                <span className="text-sm font-bold font-mono text-indigo-700">
                  {factorVariacion.toFixed(6)} ({variacionPorcentual >= 0 ? '+' : ''}{variacionPorcentual.toFixed(2)}%)
                </span>
              </div>

              <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                <span className="text-[11px] text-emerald-800 font-medium block">Monto Reajustado:</span>
                <span className="text-base font-bold font-mono text-emerald-900">{formatCLP(montoReajustado, 0)}</span>
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-700">
                Diferencia por Corrección Monetaria / Reajuste (Ganancia / Pérdida):
              </span>
              <span className={`font-mono font-bold text-sm ${diferenciaReajuste >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {diferenciaReajuste >= 0 ? `+${formatCLP(diferenciaReajuste, 0)}` : formatCLP(diferenciaReajuste, 0)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
