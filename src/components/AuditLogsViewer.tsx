import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, getDocs, onSnapshot, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditLog, Study } from '../types';
import { 
  ShieldCheck, 
  Search, 
  Calendar, 
  Filter, 
  RefreshCw, 
  Download, 
  Trash2, 
  User, 
  Building2, 
  Clock, 
  FileText, 
  Activity,
  AlertCircle,
  Eye,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown
} from 'lucide-react';

interface AuditLogsViewerProps {
  studies?: Study[];
  restrictedStudyId?: string; // If embedded inside a study view
}

export default function AuditLogsViewer({ studies = [], restrictedStudyId }: AuditLogsViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('TODOS');
  const [selectedModule, setSelectedModule] = useState<string>('TODOS');
  const [selectedUser, setSelectedUser] = useState<string>('TODOS');
  const [selectedStudyId, setSelectedStudyId] = useState<string>(restrictedStudyId || 'TODOS');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLog | null>(null);
  const [limitCount, setLimitCount] = useState<number>(300);

  // Fetch / Subscribe to Audit Logs
  useEffect(() => {
    setLoading(true);
    let q = query(
      collection(db, 'auditLogs'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as AuditLog[];
      setLogs(fetchedLogs);
      setLoading(false);
    }, (error) => {
      console.error("Error al escuchar auditLogs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount]);

  // Unique lists for dropdowns
  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.userEmail) set.add(l.userEmail);
    });
    return Array.from(set).sort();
  }, [logs]);

  const uniqueModules = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.module) set.add(l.module);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Restricted study (if applicable)
      if (restrictedStudyId && log.studyId && log.studyId !== restrictedStudyId) {
        return false;
      }

      // 2. Study filter
      if (selectedStudyId !== 'TODOS' && log.studyId !== selectedStudyId) {
        return false;
      }

      // 3. Action filter
      if (selectedAction !== 'TODOS' && log.action !== selectedAction) {
        return false;
      }

      // 4. Module filter
      if (selectedModule !== 'TODOS' && log.module !== selectedModule) {
        return false;
      }

      // 5. User filter
      if (selectedUser !== 'TODOS' && log.userEmail?.toLowerCase() !== selectedUser.toLowerCase()) {
        return false;
      }

      // 6. Date Range filter
      if (startDate) {
        const logDate = log.timestamp ? log.timestamp.split('T')[0] : '';
        if (logDate < startDate) return false;
      }
      if (endDate) {
        const logDate = log.timestamp ? log.timestamp.split('T')[0] : '';
        if (logDate > endDate) return false;
      }

      // 7. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchText = (
          (log.details || '') +
          ' ' +
          (log.userEmail || '') +
          ' ' +
          (log.module || '') +
          ' ' +
          (log.action || '') +
          ' ' +
          (log.studyName || '') +
          ' ' +
          (log.companyName || '')
        ).toLowerCase();
        if (!matchText.includes(q)) return false;
      }

      return true;
    });
  }, [logs, restrictedStudyId, selectedStudyId, selectedAction, selectedModule, selectedUser, startDate, endDate, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let todayCount = 0;
    let creates = 0;
    let updates = 0;
    let deletes = 0;
    let logins = 0;

    filteredLogs.forEach(l => {
      if (l.timestamp?.startsWith(todayStr)) todayCount++;
      if (l.action === 'CREAR' || l.action === 'IMPORTACION_MASIVA' || l.action === 'CONTABILIZAR') creates++;
      if (l.action === 'MODIFICAR') updates++;
      if (l.action === 'ELIMINAR' || l.action === 'PURGA' || l.action === 'ANULAR') deletes++;
      if (l.action === 'LOGIN') logins++;
    });

    return {
      total: filteredLogs.length,
      today: todayCount,
      creates,
      updates,
      deletes,
      logins
    };
  }, [filteredLogs]);

  // Set quick date filters
  const handleQuickDate = (type: 'today' | '7days' | '30days' | 'all') => {
    const now = new Date();
    if (type === 'today') {
      const today = now.toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
    } else if (type === '7days') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (type === '30days') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      alert('No hay registros para exportar con los filtros actuales.');
      return;
    }

    const headers = ['ID', 'Fecha_Hora', 'Usuario_Email', 'Rol', 'Estudio', 'Empresa', 'Modulo', 'Accion', 'Detalle'];
    const rows = filteredLogs.map(l => [
      `"${l.id || ''}"`,
      `"${l.timestamp || ''}"`,
      `"${l.userEmail || ''}"`,
      `"${l.userRole || ''}"`,
      `"${(l.studyName || l.studyId || '').replace(/"/g, '""')}"`,
      `"${(l.companyName || l.companyId || '').replace(/"/g, '""')}"`,
      `"${l.module || ''}"`,
      `"${l.action || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bitacora_Auditoria_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format Date time
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString('es-CL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return isoString;
    }
  };

  // Action badge color
  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREAR':
      case 'CONTABILIZAR':
      case 'IMPORTACION_MASIVA':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'MODIFICAR':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'ELIMINAR':
      case 'PURGA':
      case 'ANULAR':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'LOGIN':
      case 'LOGOUT':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'EXPORTAR':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header card with KPI metrics */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <span>Bitácora Global del Sistema y Auditoría (Audit Logs)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro inmutable de eventos, trazabilidad de comprobantes, compras/ventas RCV y acciones realizadas en la plataforma.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* KPI stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1 border-t border-slate-100">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Filtrados</p>
            <p className="text-lg font-black text-slate-800 font-mono mt-0.5">{stats.total}</p>
          </div>
          <div className="bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-200/60">
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Eventos Hoy</p>
            <p className="text-lg font-black text-indigo-700 font-mono mt-0.5">{stats.today}</p>
          </div>
          <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200/60">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Creaciones / RCV</p>
            <p className="text-lg font-black text-emerald-700 font-mono mt-0.5">{stats.creates}</p>
          </div>
          <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Modificaciones</p>
            <p className="text-lg font-black text-amber-700 font-mono mt-0.5">{stats.updates}</p>
          </div>
          <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-200/60">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Bajas / Purgas</p>
            <p className="text-lg font-black text-rose-700 font-mono mt-0.5">{stats.deletes}</p>
          </div>
          <div className="bg-purple-50/60 p-2.5 rounded-xl border border-purple-200/60">
            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Sesiones / Login</p>
            <p className="text-lg font-black text-purple-700 font-mono mt-0.5">{stats.logins}</p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>Filtros de Búsqueda Avanzada</span>
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-slate-400 hidden sm:inline mr-1">Rango Rápido:</span>
            <button
              onClick={() => handleQuickDate('today')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                startDate === new Date().toISOString().split('T')[0] && endDate === new Date().toISOString().split('T')[0]
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => handleQuickDate('7days')}
              className="px-2 py-0.5 rounded font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              7 días
            </button>
            <button
              onClick={() => handleQuickDate('30days')}
              className="px-2 py-0.5 rounded font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              30 días
            </button>
            <button
              onClick={() => handleQuickDate('all')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                !startDate && !endDate
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Histórico
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Search Query Input */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar en detalle, usuario, empresa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
            />
          </div>

          {/* User filter */}
          <div>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white outline-none"
            >
              <option value="TODOS">👤 Todos los Usuarios ({uniqueUsers.length})</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* Module Filter */}
          <div>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white outline-none"
            >
              <option value="TODOS">📁 Todos los Módulos</option>
              <option value="AUTENTICACION">🔐 AUTENTICACION</option>
              <option value="COMPROBANTES">📑 COMPROBANTES</option>
              <option value="RCV_COMPRAS">📥 RCV_COMPRAS</option>
              <option value="RCV_VENTAS">📤 RCV_VENTAS</option>
              <option value="RCV_HONORARIOS">💼 RCV_HONORARIOS</option>
              <option value="PLAN_CUENTAS">📊 PLAN_CUENTAS</option>
              <option value="AUXILIARES">👥 AUXILIARES</option>
              <option value="PERIODOS_FISCALES">📅 PERIODOS_FISCALES</option>
              <option value="EMPRESAS">🏢 EMPRESAS</option>
              <option value="ESTUDIOS">🏛️ ESTUDIOS</option>
              <option value="SUPER_ADMINS">🛡️ SUPER_ADMINS</option>
              <option value="USUARIOS">👤 USUARIOS</option>
              <option value="DTE">📄 DTE</option>
              <option value="F29">💰 F29</option>
              <option value="PAGOS_COBRANZAS">💳 PAGOS_COBRANZAS</option>
            </select>
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white outline-none"
            >
              <option value="TODOS">⚡ Todas las Acciones</option>
              <option value="LOGIN">LOGIN</option>
              <option value="CREAR">CREAR</option>
              <option value="MODIFICAR">MODIFICAR</option>
              <option value="ELIMINAR">ELIMINAR</option>
              <option value="CONTABILIZAR">CONTABILIZAR</option>
              <option value="IMPORTACION_MASIVA">IMPORTACION_MASIVA</option>
              <option value="ANULAR">ANULAR</option>
              <option value="PURGA">PURGA</option>
              <option value="EXPORTAR">EXPORTAR</option>
            </select>
          </div>

          {/* Study Filter (if not restricted) */}
          {!restrictedStudyId && (
            <div>
              <select
                value={selectedStudyId}
                onChange={(e) => setSelectedStudyId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white outline-none"
              >
                <option value="TODOS">🏛️ Todos los Estudios ({studies.length})</option>
                {studies.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Date inputs row */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {(startDate || endDate || searchQuery || selectedAction !== 'TODOS' || selectedModule !== 'TODOS' || selectedUser !== 'TODOS' || selectedStudyId !== 'TODOS') && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
                setSelectedAction('TODOS');
                setSelectedModule('TODOS');
                setSelectedUser('TODOS');
                setSelectedStudyId('TODOS');
              }}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-0.5 rounded hover:bg-rose-50 transition-colors ml-auto"
            >
              Limpiar todos los filtros
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            <span>Eventos Auditados ({filteredLogs.length})</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Límite de lectura:</span>
            <select
              value={limitCount}
              onChange={(e) => setLimitCount(Number(e.target.value))}
              className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-mono font-medium"
            >
              <option value={100}>100 logs</option>
              <option value={300}>300 logs</option>
              <option value={500}>500 logs</option>
              <option value={1000}>1000 logs</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-medium text-slate-600">Cargando eventos de auditoría desde Firestore...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-700">No se encontraron eventos con los filtros seleccionados</p>
            <p className="text-[11px] text-slate-400">Intenta ampliar el rango de fechas o limpiar los filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
                  <th className="py-2.5 px-3 whitespace-nowrap">Fecha / Hora</th>
                  <th className="py-2.5 px-3">Usuario y Rol</th>
                  <th className="py-2.5 px-3">Estudio / Sociedad</th>
                  <th className="py-2.5 px-3">Módulo</th>
                  <th className="py-2.5 px-3 text-center">Acción</th>
                  <th className="py-2.5 px-3">Detalle del Evento</th>
                  <th className="py-2.5 px-3 text-center">Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Fecha / Hora */}
                      <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        {formatDateTime(log.timestamp)}
                      </td>

                      {/* Usuario */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 truncate max-w-[160px]" title={log.userEmail}>
                            {log.userEmail || 'Sistema'}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            {log.userRole || 'USUARIO'}
                          </span>
                        </div>
                      </td>

                      {/* Estudio / Sociedad */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col text-[11px]">
                          <span className="font-medium text-slate-800 truncate max-w-[140px]" title={log.studyName || log.studyId}>
                            {log.studyName || log.studyId || '-'}
                          </span>
                          {log.companyName && (
                            <span className="text-[10px] text-indigo-600 truncate max-w-[140px]" title={log.companyName}>
                              {log.companyName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Módulo */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {log.module}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getActionBadge(log.action)}`}>
                          {log.action}
                        </span>
                      </td>

                      {/* Detalle */}
                      <td className="py-2 px-3 text-slate-800 text-[11px]">
                        <p className="line-clamp-2 max-w-md" title={log.details}>
                          {log.details}
                        </p>
                      </td>

                      {/* Info / Detalle Modal */}
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLogForDetails(log)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Ver Detalle Completo / Metadatos"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Ver Detalles Completos y Metadatos */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold">Detalle de Registro de Auditoría</h3>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Fecha y Hora</span>
                  <p className="font-mono font-bold text-slate-900 text-xs mt-0.5">{formatDateTime(selectedLogForDetails.timestamp)}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Acción Realizada</span>
                  <p className="mt-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getActionBadge(selectedLogForDetails.action)}`}>
                      {selectedLogForDetails.action}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Usuario / Email</span>
                  <p className="font-medium text-slate-800 text-xs mt-0.5">{selectedLogForDetails.userEmail || 'Sistema'}</p>
                  <p className="text-[10px] text-slate-400 font-mono">ID: {selectedLogForDetails.userId || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Rol del Usuario</span>
                  <p className="font-mono font-semibold text-slate-800 text-xs mt-0.5">{selectedLogForDetails.userRole || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Módulo / Entidad</span>
                  <p className="font-semibold text-indigo-700 text-xs mt-0.5">{selectedLogForDetails.module}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Estudio / Sociedad</span>
                  <p className="text-slate-800 font-medium text-xs mt-0.5">
                    {selectedLogForDetails.studyName || selectedLogForDetails.studyId || 'N/A'}
                    {selectedLogForDetails.companyName ? ` (${selectedLogForDetails.companyName})` : ''}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-bold uppercase text-[11px]">Descripción / Detalle:</span>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-900 text-xs mt-1 leading-relaxed">
                  {selectedLogForDetails.details}
                </div>
              </div>

              {selectedLogForDetails.metadata && Object.keys(selectedLogForDetails.metadata).length > 0 && (
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[11px]">Metadatos / Datos Afectados (JSON):</span>
                  <pre className="bg-slate-950 text-emerald-400 p-3 rounded-xl text-[11px] font-mono overflow-x-auto mt-1 max-h-48 border border-slate-800">
                    {JSON.stringify(selectedLogForDetails.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
