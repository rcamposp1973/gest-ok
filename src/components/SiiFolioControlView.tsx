import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { Company, SiiFolioAuthorization, FolioUsageLog } from '../types';
import {
  Stamp,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  FileText,
  ShieldCheck,
  RefreshCw,
  BookOpen,
  X,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';

interface SiiFolioControlViewProps {
  studyId: string;
  company: Company;
  isReadOnly?: boolean;
}

export default function SiiFolioControlView({
  studyId,
  company,
  isReadOnly = false
}: SiiFolioControlViewProps) {
  const [authorizations, setAuthorizations] = useState<SiiFolioAuthorization[]>([]);
  const [usageLogs, setUsageLogs] = useState<FolioUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAuthModal, setShowAddAuthModal] = useState(false);
  const [editingAuth, setEditingAuth] = useState<SiiFolioAuthorization | null>(null);

  // Form states
  const [resNumber, setResNumber] = useState('');
  const [resDate, setResDate] = useState(new Date().toISOString().split('T')[0]);
  const [startFolio, setStartFolio] = useState<number>(1);
  const [endFolio, setEndFolio] = useState<number>(1000);
  const [observations, setObservations] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter usage logs
  const [logSearch, setLogSearch] = useState('');
  const [logBookFilter, setLogBookFilter] = useState('ALL');

  const fetchFolioData = async () => {
    setLoading(true);
    try {
      // 1. Fetch resolutions
      const authSnap = await getDocs(
        collection(db, 'studies', studyId, 'companies', company.id, 'siiFolioAuthorizations')
      );
      const authList = authSnap.docs.map(d => ({ id: d.id, ...d.data() } as SiiFolioAuthorization));
      authList.sort((a, b) => (b.startFolio || 0) - (a.startFolio || 0));
      setAuthorizations(authList);

      // 2. Fetch usage logs
      const logsSnap = await getDocs(
        collection(db, 'studies', studyId, 'companies', company.id, 'siiFolioUsageLogs')
      );
      const logList = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as FolioUsageLog));
      logList.sort((a, b) => (b.printedAt || '').localeCompare(a.printedAt || ''));
      setUsageLogs(logList);
    } catch (err) {
      console.error("Error fetching SII folio authorizations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolioData();
  }, [studyId, company.id]);

  const handleOpenCreateAuth = () => {
    setEditingAuth(null);
    setResNumber(company.dteConfig?.resolutionNumber || '');
    setResDate(company.dteConfig?.resolutionDate || new Date().toISOString().split('T')[0]);
    
    // Auto-calculate next starting folio
    const highestEndFolio = authorizations.reduce((max, a) => Math.max(max, a.endFolio || 0), 0);
    setStartFolio(highestEndFolio + 1);
    setEndFolio(highestEndFolio + 1000);
    setObservations('Timbraje de hojas sueltas autorizado por el SII para libros de contabilidad principal.');
    setShowAddAuthModal(true);
  };

  const handleOpenEditAuth = (auth: SiiFolioAuthorization) => {
    setEditingAuth(auth);
    setResNumber(auth.resolutionNumber || '');
    setResDate(auth.resolutionDate || '');
    setStartFolio(auth.startFolio);
    setEndFolio(auth.endFolio);
    setObservations(auth.observations || '');
    setShowAddAuthModal(true);
  };

  const handleSaveAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (endFolio < startFolio) {
      alert("El folio final no puede ser menor al folio inicial.");
      return;
    }

    setIsSubmitting(true);
    try {
      const total = endFolio - startFolio + 1;
      const colRef = collection(db, 'studies', studyId, 'companies', company.id, 'siiFolioAuthorizations');

      if (editingAuth) {
        await updateDoc(doc(colRef, editingAuth.id), {
          resolutionNumber: resNumber.trim(),
          resolutionDate: resDate,
          startFolio: Number(startFolio),
          endFolio: Number(endFolio),
          totalFolios: total,
          observations: observations.trim(),
          updatedAt: new Date().toISOString()
        });
      } else {
        const payload: Omit<SiiFolioAuthorization, 'id'> = {
          companyId: company.id,
          resolutionNumber: resNumber.trim(),
          resolutionDate: resDate,
          startFolio: Number(startFolio),
          endFolio: Number(endFolio),
          totalFolios: total,
          currentFolio: Number(startFolio),
          status: 'Activa',
          observations: observations.trim(),
          createdAt: new Date().toISOString()
        };
        await addDoc(colRef, payload);
      }

      setShowAddAuthModal(false);
      await fetchFolioData();
    } catch (err: any) {
      console.error("Error saving folio auth:", err);
      alert("Error al guardar autorización: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAuth = async (authId: string) => {
    if (isReadOnly) return;
    if (!window.confirm("¿Seguro que deseas eliminar este registro de autorización de folios?")) return;
    try {
      await deleteDoc(doc(db, 'studies', studyId, 'companies', company.id, 'siiFolioAuthorizations', authId));
      await fetchFolioData();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  // Metrics summary
  const totalAuthorized = authorizations.reduce((sum, a) => sum + (a.totalFolios || 0), 0);
  const activeAuth = authorizations.find(a => a.status === 'Activa');
  const nextAvailableFolio = activeAuth ? (activeAuth.currentFolio || activeAuth.startFolio) : (authorizations[0]?.currentFolio || 1);
  const totalPagesConsumed = usageLogs.reduce((sum, l) => sum + (l.pagesCount || 0), 0);

  const filteredLogs = usageLogs.filter(log => {
    if (logBookFilter !== 'ALL' && log.bookType !== logBookFilter) return false;
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase().trim();
      return (
        log.bookType.toLowerCase().includes(q) ||
        log.periodLabel.toLowerCase().includes(q) ||
        String(log.startFolio).includes(q) ||
        String(log.endFolio).includes(q) ||
        (log.resolutionNumber || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-400/30 text-indigo-300">
                <Stamp className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight">Control de Timbraje y Folios Oficiales SII</h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Administración de resoluciones de timbraje de hojas sueltas autorizadas por el SII y trazabilidad del consumo correlativo de folios en la impresión de libros oficiales (Libro Diario, Mayor, Balance 8 Columnas, IFRS, RLI, Capital Propio y DDJJ).
            </p>
          </div>

          {!isReadOnly && (
            <button
              onClick={handleOpenCreateAuth}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Nueva Resolución SII</span>
            </button>
          )}
        </div>

        {/* KPIs bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Folios Autorizados</span>
            <p className="text-lg font-black text-indigo-300 font-mono mt-0.5">{totalAuthorized.toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-emerald-400">Próximo Folio a Utilizar</span>
            <p className="text-lg font-black text-emerald-300 font-mono mt-0.5">N° {String(nextAvailableFolio).padStart(6, '0')}</p>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-slate-400">Hojas Impresas (Consumidas)</span>
            <p className="text-lg font-black text-amber-300 font-mono mt-0.5">{totalPagesConsumed.toLocaleString('es-CL')} págs.</p>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-slate-400">Folios Disponibles</span>
            <p className="text-lg font-black text-slate-100 font-mono mt-0.5">
              {Math.max(0, totalAuthorized - totalPagesConsumed).toLocaleString('es-CL')}
            </p>
          </div>
        </div>
      </div>

      {/* Grid de 2 Bloques: 1. Resoluciones SII y 2. Historial de Consumo en Libros */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* BLOQUE IZQUIERDO (5 Cols): Resoluciones de Timbraje */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase">Resoluciones de Timbraje Activas</h3>
              </div>
              <button
                onClick={fetchFolioData}
                title="Refrescar"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Cargando autorizaciones...</div>
            ) : authorizations.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <Stamp className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">No hay resoluciones de timbraje registradas.</p>
                <p className="text-[11px] text-slate-400">Registra el número de resolución y rango de folios timbrados otorgados por el SII.</p>
                {!isReadOnly && (
                  <button
                    onClick={handleOpenCreateAuth}
                    className="mt-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-100"
                  >
                    + Registrar Resolución
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {authorizations.map(auth => {
                  const used = Math.max(0, (auth.currentFolio || auth.startFolio) - auth.startFolio);
                  const pct = Math.min(100, Math.round((used / auth.totalFolios) * 100));

                  return (
                    <div
                      key={auth.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all shadow-2xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">
                              Res. Ex. SII N° {auth.resolutionNumber || 'S/N'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              auth.status === 'Activa' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {auth.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">Fecha: {auth.resolutionDate || 'N/A'}</p>
                        </div>

                        {!isReadOnly && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditAuth(auth)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAuth(auth.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono bg-white p-2 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-[9px] uppercase font-sans text-slate-400 block">Folio Inicial</span>
                          <strong className="text-slate-800">{auth.startFolio}</strong>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-sans text-slate-400 block">Folio Final</span>
                          <strong className="text-slate-800">{auth.endFolio}</strong>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-sans text-emerald-600 block">Próximo</span>
                          <strong className="text-emerald-700 font-black">{auth.currentFolio || auth.startFolio}</strong>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span>Consumo: {used} / {auth.totalFolios} folios</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {auth.observations && (
                        <p className="text-[11px] text-slate-600 italic bg-slate-100/70 p-2 rounded border border-slate-200">
                          "{auth.observations}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* BLOQUE DERECHO (7 Cols): Historial de Hojas y Folios Asignados en Libros Impresos */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase">Trazabilidad de Folios por Libro Impreso</h3>
                  <p className="text-[11px] text-slate-500">Historial de folios consumidos para auditoría y declaraciones juradas (DDJJ)</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={logBookFilter}
                  onChange={e => setLogBookFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 font-medium"
                >
                  <option value="ALL">Todos los Libros</option>
                  <option value="Libro Diario">Libro Diario</option>
                  <option value="Libro Mayor">Libro Mayor</option>
                  <option value="Balance 8 Columnas">Balance 8 Columnas</option>
                  <option value="Balance IFRS">Balance IFRS</option>
                  <option value="Estado de Resultados">Estado de Resultados</option>
                  <option value="RLI / Capital Propio">RLI / Capital Propio</option>
                  <option value="DDJJ 1847">DDJJ 1847</option>
                </select>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Printer className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">No hay registros de impresión de libros oficiales.</p>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                  Al imprimir el Libro Diario, Mayor o Balance Tributario con formato oficial SII, el sistema asignará correlativamente los folios autorizados y registrará el rango ocupado (Desde / Hasta) para respaldar la RLI, Capital Propio y DDJJ.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-200">
                      <th className="p-2.5">Libro / Reporte</th>
                      <th className="p-2.5">Período / Ejercicio</th>
                      <th className="p-2.5 text-center font-mono">Folio Inicial</th>
                      <th className="p-2.5 text-center font-mono">Folio Final</th>
                      <th className="p-2.5 text-center font-mono">Hojas</th>
                      <th className="p-2.5">Fecha Impresión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                    {filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 font-sans font-bold text-slate-900 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                          <span>{log.bookType}</span>
                        </td>
                        <td className="p-2.5 text-slate-600 font-sans">{log.periodLabel}</td>
                        <td className="p-2.5 text-center font-bold text-indigo-700 bg-indigo-50/40">
                          {String(log.startFolio).padStart(6, '0')}
                        </td>
                        <td className="p-2.5 text-center font-bold text-indigo-700 bg-indigo-50/40">
                          {String(log.endFolio).padStart(6, '0')}
                        </td>
                        <td className="p-2.5 text-center font-black text-slate-800">
                          {log.pagesCount}
                        </td>
                        <td className="p-2.5 text-slate-500 font-sans text-[10px]">
                          {new Date(log.printedAt).toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tarjeta de Información Normativa SII */}
          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-xs">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block uppercase tracking-wider text-[11px]">Normativa de Hojas Timbradas y Libros de Contabilidad (SII)</span>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Según la Circular N° 19 y Resolución Exenta N° 2301 del SII, los contribuyentes autorizados a llevar contabilidad en hojas sueltas deben emitir sus libros cronológicos con el número de resolución y folio timbrado en cada hoja. El sistema registra cada rango emitido para que al confeccionar la RLI, Capital Propio Tributario y la Declaración Jurada 1847, se declare exactamente el folio del Libro Diario o Mayor donde consta la información.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: REGISTRAR / EDITAR RESOLUCIÓN SII */}
      {showAddAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                <Stamp className="w-5 h-5" />
                <h4>{editingAuth ? 'Editar Resolución de Timbraje SII' : 'Registrar Nueva Resolución de Timbraje SII'}</h4>
              </div>
              <button onClick={() => setShowAddAuthModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAuth} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">N° Resolución SII *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 1289 o 0"
                    value={resNumber}
                    onChange={e => setResNumber(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fecha Resolución *</label>
                  <input
                    type="date"
                    required
                    value={resDate}
                    onChange={e => setResDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Folio Inicial Autorizado *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={startFolio}
                    onChange={e => setStartFolio(parseInt(e.target.value) || 1)}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Folio Final Autorizado *</label>
                  <input
                    type="number"
                    required
                    min={startFolio}
                    value={endFolio}
                    onChange={e => setEndFolio(parseInt(e.target.value) || startFolio)}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between text-indigo-900 font-mono">
                <span>Total Hojas Timbradas:</span>
                <strong className="text-sm font-black">{Math.max(0, endFolio - startFolio + 1).toLocaleString('es-CL')} folios</strong>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observaciones / Tipo de Hojas</label>
                <textarea
                  rows={2}
                  value={observations}
                  onChange={e => setObservations(e.target.value)}
                  placeholder="Ej: Hojas sueltas tamaño carta timbradas por Unidad Santiago Centro."
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddAuthModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Resolución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
