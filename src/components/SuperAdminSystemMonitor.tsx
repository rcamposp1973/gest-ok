import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, collectionGroup, getDocs, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { Study, Company, User, SuperUser, AuditLog } from '../types';
import {
  Activity,
  TrendingUp,
  Building2,
  Users,
  Briefcase,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  ShieldCheck,
  Zap,
  Globe,
  Radio,
  Server,
  Database,
  Search,
  Filter,
  ArrowUpRight,
  Sparkles,
  Wifi,
  FileSpreadsheet,
  Receipt,
  FileText,
  UserCheck,
  Key
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface SuperAdminSystemMonitorProps {
  onSelectStudy?: (study: Study) => void;
}

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

export default function SuperAdminSystemMonitor({ onSelectStudy }: SuperAdminSystemMonitorProps) {
  // State
  const [studies, setStudies] = useState<Study[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [superUsers, setSuperUsers] = useState<SuperUser[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // 30s
  const [latencyMs, setLatencyMs] = useState<number>(45);

  // Time granularity for statistical charts
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month'>('day');
  const [activeTab, setActiveTab] = useState<'live' | 'stats' | 'studies' | 'users' | 'apiGateway'>('live');

  // Master System Gateway SII Settings (Super Admin Only)
  const [masterApiKey, setMasterApiKey] = useState<string>(() => {
    return localStorage.getItem('gest_ok_master_api_key') || '5511-W960-6395-2355-3470';
  });
  const [masterProvider, setMasterProvider] = useState<string>('SIMPLE_API');
  const [masterApiEndpoint, setMasterApiEndpoint] = useState<string>('https://api.simpleapi.cl/v1');
  const [apiSaveSuccess, setApiSaveSuccess] = useState<boolean>(false);

  // Load live data
  const fetchData = async () => {
    setRefreshing(true);
    const startT = performance.now();
    try {
      // 1. Studies
      const studiesSnap = await getDocs(collection(db, 'studies'));
      const fetchedStudies = studiesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as Study[];
      setStudies(fetchedStudies);

      // 2. Companies (via collectionGroup)
      const companiesSnap = await getDocs(collectionGroup(db, 'companies'));
      const fetchedCompanies = companiesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as Company[];
      setCompanies(fetchedCompanies);

      // 3. Users (via collectionGroup)
      const usersSnap = await getDocs(collectionGroup(db, 'users'));
      const fetchedUsers = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as User[];
      setUsers(fetchedUsers);

      // 4. Super Users
      const superUsersSnap = await getDocs(collection(db, 'superUsers'));
      const fetchedSuperUsers = superUsersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as SuperUser[];
      setSuperUsers(fetchedSuperUsers);

      // 5. Recent Audit Logs (for live feed and timeline aggregation)
      const qLogs = query(
        collection(db, 'auditLogs'),
        orderBy('timestamp', 'desc'),
        limit(800)
      );
      const logsSnap = await getDocs(qLogs);
      const fetchedLogs = logsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as AuditLog[];
      setRecentLogs(fetchedLogs);

      const endT = performance.now();
      setLatencyMs(Math.max(12, Math.round(endT - startT)));
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error loading monitoring metrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load and live listener for real-time audit logs stream
  useEffect(() => {
    fetchData();

    // Listen to real-time audit log stream
    const qStream = query(
      collection(db, 'auditLogs'),
      orderBy('timestamp', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(qStream, (snap) => {
      const liveItems = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as AuditLog[];
      
      setRecentLogs((prev) => {
        const map = new Map<string, AuditLog>();
        liveItems.forEach((l) => map.set(l.id || '', l));
        prev.forEach((l) => {
          if (l.id && !map.has(l.id)) map.set(l.id, l);
        });
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });
    });

    return () => unsubscribe();
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchData();
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval]);

  // Derived KPI Metrics
  const metrics = useMemo(() => {
    // Studies
    const totalStudies = studies.length;
    const activeStudies = studies.filter(
      (s) => s.estado === 'Vigente' || s.estado === undefined
    ).length;
    const inactiveStudies = totalStudies - activeStudies;

    // Companies
    const totalCompanies = companies.length;
    // An active/connected company is one that either exists or has had audit activity in recent logs
    const companyIdsWithRecentActivity = new Set(
      recentLogs
        .filter((l) => l.companyId || l.companyName)
        .map((l) => l.companyId || l.companyName)
    );
    const activeCompanies = companies.filter(
      (c) =>
        companyIdsWithRecentActivity.has(c.id) ||
        companyIdsWithRecentActivity.has(c.name) ||
        c.rut
    ).length;

    // Users
    // All unique study admins + users + super users
    const allStudyAdminEmails = new Set<string>();
    studies.forEach((s) => {
      if (s.adminEmail) allStudyAdminEmails.add(s.adminEmail.toLowerCase());
      if (s.administrators) {
        s.administrators.forEach((adm) => {
          if (adm.email) allStudyAdminEmails.add(adm.email.toLowerCase());
        });
      }
    });

    const totalUsersCount = users.length + allStudyAdminEmails.size + superUsers.length;

    // Connected / Active Users (Users with activity/login in last 24h or last 15 min)
    const now = new Date().getTime();
    const fifteenMinAgo = now - 15 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    const activeUsers15m = new Set<string>();
    const activeUsers24h = new Set<string>();

    recentLogs.forEach((l) => {
      if (!l.userEmail || !l.timestamp) return;
      const logTime = new Date(l.timestamp).getTime();
      if (logTime >= fifteenMinAgo) {
        activeUsers15m.add(l.userEmail.toLowerCase());
      }
      if (logTime >= twentyFourHoursAgo) {
        activeUsers24h.add(l.userEmail.toLowerCase());
      }
    });

    // Counts of records by time
    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const recordsToday = recentLogs.filter(
      (l) => l.timestamp && l.timestamp.startsWith(todayStr)
    ).length;

    const recordsThisWeek = recentLogs.filter((l) => {
      if (!l.timestamp) return false;
      return new Date(l.timestamp).getTime() >= sevenDaysAgo;
    }).length;

    const recordsThisMonth = recentLogs.filter((l) => {
      if (!l.timestamp) return false;
      return new Date(l.timestamp).getTime() >= thirtyDaysAgo;
    }).length;

    // Operations breakdown
    const moduleCounts: { [key: string]: number } = {};
    recentLogs.forEach((l) => {
      const mod = l.module || 'OTROS';
      moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
    });

    return {
      totalStudies,
      activeStudies,
      inactiveStudies,
      totalCompanies,
      activeCompanies,
      totalUsersCount,
      activeUsers15m: activeUsers15m.size,
      activeUsers24h: activeUsers24h.size,
      recordsToday,
      recordsThisWeek,
      recordsThisMonth,
      totalLogsCaptured: recentLogs.length,
      moduleCounts
    };
  }, [studies, companies, users, superUsers, recentLogs]);

  // Aggregated Statistical Data for Charts
  const timeSeriesData = useMemo(() => {
    const now = new Date();
    const result: {
      label: string;
      comprobantes: number;
      rcv: number;
      conciliacion: number;
      dte: number;
      seguridad: number;
      total: number;
    }[] = [];

    if (timePeriod === 'day') {
      // Last 14 days
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayKey = d.toISOString().split('T')[0];
        const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;

        let comp = 0;
        let rcv = 0;
        let conc = 0;
        let dte = 0;
        let seg = 0;

        recentLogs.forEach((l) => {
          if (l.timestamp && l.timestamp.startsWith(dayKey)) {
            if (l.module === 'COMPROBANTES') comp++;
            else if (l.module?.startsWith('RCV')) rcv++;
            else if (l.module === 'CONCILIACION') conc++;
            else if (l.module === 'DTE') dte++;
            else if (l.module === 'AUTENTICACION' || l.module === 'SUPER_ADMINS') seg++;
            else comp++;
          }
        });

        result.push({
          label: dayLabel,
          comprobantes: comp,
          rcv,
          conciliacion: conc,
          dte,
          seguridad: seg,
          total: comp + rcv + conc + dte + seg
        });
      }
    } else if (timePeriod === 'week') {
      // Last 8 weeks
      for (let i = 7; i >= 0; i--) {
        const endW = new Date(now);
        endW.setDate(endW.getDate() - i * 7);
        const startW = new Date(endW);
        startW.setDate(startW.getDate() - 6);

        const startT = startW.getTime();
        const endT = endW.getTime() + 24 * 3600 * 1000;
        const weekLabel = `Sem ${8 - i} (${startW.getDate()}/${startW.getMonth() + 1})`;

        let comp = 0;
        let rcv = 0;
        let conc = 0;
        let dte = 0;
        let seg = 0;

        recentLogs.forEach((l) => {
          if (!l.timestamp) return;
          const t = new Date(l.timestamp).getTime();
          if (t >= startT && t <= endT) {
            if (l.module === 'COMPROBANTES') comp++;
            else if (l.module?.startsWith('RCV')) rcv++;
            else if (l.module === 'CONCILIACION') conc++;
            else if (l.module === 'DTE') dte++;
            else if (l.module === 'AUTENTICACION' || l.module === 'SUPER_ADMINS') seg++;
            else comp++;
          }
        });

        result.push({
          label: weekLabel,
          comprobantes: comp,
          rcv,
          conciliacion: conc,
          dte,
          seguridad: seg,
          total: comp + rcv + conc + dte + seg
        });
      }
    } else {
      // Last 6 months
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
        const monthLabel = `${monthNames[m]} ${y.toString().slice(-2)}`;

        let comp = 0;
        let rcv = 0;
        let conc = 0;
        let dte = 0;
        let seg = 0;

        recentLogs.forEach((l) => {
          if (l.timestamp && l.timestamp.startsWith(monthKey)) {
            if (l.module === 'COMPROBANTES') comp++;
            else if (l.module?.startsWith('RCV')) rcv++;
            else if (l.module === 'CONCILIACION') conc++;
            else if (l.module === 'DTE') dte++;
            else if (l.module === 'AUTENTICACION' || l.module === 'SUPER_ADMINS') seg++;
            else comp++;
          }
        });

        result.push({
          label: monthLabel,
          comprobantes: comp,
          rcv,
          conciliacion: conc,
          dte,
          seguridad: seg,
          total: comp + rcv + conc + dte + seg
        });
      }
    }

    return result;
  }, [recentLogs, timePeriod]);

  // Distribution by Module for Donut Chart
  const moduleDistributionData = useMemo(() => {
    const data = [
      { name: 'Comprobantes', value: metrics.moduleCounts['COMPROBANTES'] || 0, color: '#4f46e5' },
      { name: 'RCV Compras/Ventas', value: (metrics.moduleCounts['RCV_COMPRAS'] || 0) + (metrics.moduleCounts['RCV_VENTAS'] || 0) + (metrics.moduleCounts['RCV_HONORARIOS'] || 0), color: '#06b6d4' },
      { name: 'Conciliación Bancaria', value: metrics.moduleCounts['CONCILIACION'] || 0, color: '#10b981' },
      { name: 'DTE & Facturación', value: metrics.moduleCounts['DTE'] || 0, color: '#f59e0b' },
      { name: 'Seguridad & Accesos', value: (metrics.moduleCounts['AUTENTICACION'] || 0) + (metrics.moduleCounts['SUPER_ADMINS'] || 0), color: '#8b5cf6' },
      { name: 'Otros Módulos', value: (metrics.moduleCounts['EMPRESAS'] || 0) + (metrics.moduleCounts['ESTUDIOS'] || 0) + (metrics.moduleCounts['PLAN_CUENTAS'] || 0), color: '#64748b' }
    ].filter((item) => item.value > 0);

    // Fallback if no logs yet
    if (data.length === 0) {
      return [{ name: 'Actividad General', value: 1, color: '#4f46e5' }];
    }
    return data;
  }, [metrics.moduleCounts]);

  // Ranking of studies by companies and activity
  const studyRanking = useMemo(() => {
    const map = new Map<string, { study: Study; companiesCount: number; activityCount: number }>();
    studies.forEach((s) => {
      map.set(s.id, { study: s, companiesCount: 0, activityCount: 0 });
    });

    companies.forEach((c) => {
      if (c.studyId && map.has(c.studyId)) {
        map.get(c.studyId)!.companiesCount++;
      }
    });

    recentLogs.forEach((l) => {
      if (l.studyId && map.has(l.studyId)) {
        map.get(l.studyId)!.activityCount++;
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => b.activityCount + b.companiesCount - (a.activityCount + a.companiesCount)
    );
  }, [studies, companies, recentLogs]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Live Pulse Bar */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-emerald-500/20 border border-emerald-400/30 rounded-full text-[11px] font-bold text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SISTEMA EN VIVO • PULSO CONTABLE</span>
              <span className="text-slate-400 font-mono">({latencyMs} ms)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Activity className="w-6 h-6 text-indigo-400" />
              <span>Centro de Control & Monitor Estadístico</span>
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Monitoreo en tiempo real de estudios vigentes, empresas activas, usuarios conectados y ritmo operativo del software contable.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Auto refresh select */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 hidden sm:inline">Refresco:</span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-white font-bold text-xs focus:outline-hidden cursor-pointer"
              >
                <option value={10} className="bg-slate-900 text-white">Cada 10 seg</option>
                <option value={30} className="bg-slate-900 text-white">Cada 30 seg</option>
                <option value={60} className="bg-slate-900 text-white">Cada 1 min</option>
                <option value={0} className="bg-slate-900 text-white">Manual</option>
              </select>
            </div>

            {/* Refresh button */}
            <button
              onClick={fetchData}
              disabled={refreshing}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              title="Actualizar métricas ahora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Sincronizando...' : 'Actualizar'}</span>
            </button>
          </div>
        </div>

        {/* Status ticker pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Server className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-slate-400">Motor DB:</span>
            <span className="font-bold text-emerald-400">Firestore Cloud</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-slate-400">Seguridad:</span>
            <span className="font-bold text-emerald-400">RBAC Activo</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-400">Conectados (15m):</span>
            <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-md">{metrics.activeUsers15m} usuarios</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Radio className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-400">Última sincro:</span>
            <span className="font-mono text-slate-300">{lastRefreshed.toLocaleTimeString('es-CL')}</span>
          </div>
        </div>
      </div>

      {/* 4 Major KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Estudios Contables */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Estudios Contables
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {metrics.totalStudies}
            </span>
            <span className="text-xs text-slate-400 font-medium">totales</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{metrics.activeStudies} Vigentes</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <XCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>{metrics.inactiveStudies} Cerrados</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Empresas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Empresas / Sociedades
            </span>
            <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {metrics.totalCompanies}
            </span>
            <span className="text-xs text-slate-400 font-medium">sociedades</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-cyan-700 font-semibold">
              <Zap className="w-3.5 h-3.5 text-cyan-600" />
              <span>{metrics.activeCompanies} Conectadas / Activas</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              ~{(metrics.totalCompanies / (metrics.totalStudies || 1)).toFixed(1)} /estudio
            </span>
          </div>
        </div>

        {/* KPI 3: Usuarios & Conectados */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Usuarios & Sesiones
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {metrics.totalUsersCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">habilitados</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-purple-700 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{metrics.activeUsers15m} En Vivo</span>
            </div>
            <span className="text-slate-500 font-medium">
              {metrics.activeUsers24h} activos (24h)
            </span>
          </div>
        </div>

        {/* KPI 4: Registros Operativos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Actividad Operativa
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {metrics.recordsToday}
            </span>
            <span className="text-xs text-emerald-600 font-bold">hoy</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">
              <strong className="text-slate-900">{metrics.recordsThisWeek}</strong> esta sem.
            </span>
            <span className="text-slate-600 font-medium">
              <strong className="text-slate-900">{metrics.recordsThisMonth}</strong> este mes
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'live'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Monitor en Vivo & Stream</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Tendencias Estadísticas</span>
          </button>

          <button
            onClick={() => setActiveTab('studies')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'studies'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Estudios & Capacidad</span>
          </button>

          <button
            onClick={() => setActiveTab('apiGateway')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'apiGateway'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Gateway SII Master</span>
          </button>
        </div>

        {activeTab === 'stats' && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setTimePeriod('day')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                timePeriod === 'day'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Días (14d)
            </button>
            <button
              onClick={() => setTimePeriod('week')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                timePeriod === 'week'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Semanas (8s)
            </button>
            <button
              onClick={() => setTimePeriod('month')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                timePeriod === 'month'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Meses (6m)
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: LIVE MONITOR & STREAM */}
      {activeTab === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Real-time Activity Feed (8 cols) */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-sm font-black text-slate-900">
                  Transmisión de Actividad en Vivo (Live Event Stream)
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-400">
                Últimas 25 operaciones capturadas
              </span>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {recentLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No se han registrado eventos recientes en la bitácora.
                </div>
              ) : (
                recentLogs.slice(0, 25).map((log, idx) => {
                  const isLogin = log.module === 'AUTENTICACION';
                  const isVoucher = log.module === 'COMPROBANTES';
                  const isRcv = log.module?.startsWith('RCV');
                  const isDte = log.module === 'DTE';
                  const isConciliation = log.module === 'CONCILIACION';

                  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                  let Icon = Activity;

                  if (isLogin) {
                    badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                    Icon = ShieldCheck;
                  } else if (isVoucher) {
                    badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                    Icon = FileSpreadsheet;
                  } else if (isRcv) {
                    badgeColor = 'bg-cyan-50 text-cyan-700 border-cyan-200';
                    Icon = Receipt;
                  } else if (isDte) {
                    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                    Icon = FileText;
                  } else if (isConciliation) {
                    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    Icon = CheckCircle2;
                  }

                  const timeStr = log.timestamp
                    ? new Date(log.timestamp).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })
                    : '--:--';

                  return (
                    <div
                      key={log.id || idx}
                      className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 transition-all flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`p-2 rounded-lg border ${badgeColor} shrink-0 mt-0.5`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">{log.userEmail || 'Usuario'}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${badgeColor}`}>
                              {log.module}
                            </span>
                            {log.studyName && (
                              <span className="text-[10px] font-medium text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                🏢 {log.studyName}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 font-medium truncate max-w-xl">
                            {log.details || `${log.action} en ${log.module}`}
                          </p>
                        </div>
                      </div>

                      <span className="text-[11px] font-mono text-slate-400 shrink-0 mt-1">
                        {timeStr}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Health Status & Active Services */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-600" />
                <span>Salud de Microservicios</span>
              </h3>

              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">Firestore Multi-Tenant</div>
                    <div className="text-[11px] text-slate-500">Base de datos de alta disponibilidad</div>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase">
                    ONLINE (100%)
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">Firebase Auth & RBAC</div>
                    <div className="text-[11px] text-slate-500">Gestión de sesiones y perfiles</div>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase">
                    OPERATIVO
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">Motor de Conciliación CLP</div>
                    <div className="text-[11px] text-slate-500">Lectura inteligente de cartolas</div>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase">
                    ACTIVO
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">Integración DTE / SII</div>
                    <div className="text-[11px] text-slate-500">Facturación electrónica y RCV</div>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase">
                    CONECTADO
                  </span>
                </div>
              </div>
            </div>

            {/* Quick summary card */}
            <div className="bg-linear-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase">
                <Sparkles className="w-4 h-4" />
                <span>Monitoreo Global Pulso Contable</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                El sistema mantiene <strong>{metrics.activeStudies}</strong> estudios operando con <strong>{metrics.totalCompanies}</strong> sociedades activas y <strong>{metrics.recordsThisMonth}</strong> registros procesados este mes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STATISTICAL TRENDS & TIME CHARTS */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Main Area Chart: Volume over time */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <span>Volumen de Registros y Transacciones por {timePeriod === 'day' ? 'Día' : timePeriod === 'week' ? 'Semana' : 'Mes'}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Comportamiento histórico y demanda operativa de los módulos contables.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-indigo-600" />
                  <span>Comprobantes</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-cyan-500" />
                  <span>RCV</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500" />
                  <span>Conciliación</span>
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRcv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      border: 'none'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total Operaciones"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="comprobantes"
                    name="Comprobantes"
                    stroke="#818cf8"
                    strokeWidth={1.5}
                    fillOpacity={0.3}
                    fill="#818cf8"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Two-column layout: Module distribution & Bar breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Donut Chart: Module distribution */}
            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                <PieChartIcon className="w-4 h-4 text-indigo-600" />
                <span>Distribución por Módulo del Software</span>
              </h3>

              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={moduleDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {moduleDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                        border: 'none'
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar Chart: Detailed breakdown */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Desglose Comparativo de Registros</span>
              </h3>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                        border: 'none'
                      }}
                    />
                    <Bar dataKey="comprobantes" name="Comprobantes" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="rcv" name="RCV" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="conciliacion" name="Conciliación" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STUDIES & CAPACITY BREAKDOWN */}
      {activeTab === 'studies' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Resumen de Estudios Contables y Capacidad de Empresas
              </h3>
              <p className="text-xs text-slate-500">
                Monitoreo de límites de plan y empresas creadas por cada estudio.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Estudio Contable</th>
                  <th className="py-3 px-4">RUT Estudio</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Empresas Creadas</th>
                  <th className="py-3 px-4">Límite Plan</th>
                  <th className="py-3 px-4">Uso de Capacidad</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {studyRanking.map(({ study, companiesCount, activityCount }) => {
                  const maxComp = study.maxCompanies || 10;
                  const pct = Math.min(100, Math.round((companiesCount / maxComp) * 100));
                  const isVigente = study.estado === 'Vigente' || study.estado === undefined;

                  return (
                    <tr key={study.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {study.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {study.rut || 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isVigente
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isVigente ? 'Vigente' : 'Sin Vigencia'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {companiesCount} empresas
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {maxComp} máx
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-32 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full ${
                              pct >= 90
                                ? 'bg-rose-500'
                                : pct >= 70
                                ? 'bg-amber-500'
                                : 'bg-indigo-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 inline-block">
                          {pct}% utilizado
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {onSelectStudy && (
                          <button
                            onClick={() => onSelectStudy(study)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            Abrir Estudio
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* TAB 4: GATEWAY MASTER API SII */}
      {activeTab === 'apiGateway' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Privado • Solo Super Admin
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Gateway Centralizado de Conexión API SII
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  Esta API Key es única para toda la plataforma Gest_OK. Cualquier empresa creada en cualquier estudio queda automáticamente habilitada para consultar Compras, Ventas y Boletas de Honorarios, manteniendo las claves confidenciales y 100% invisibles para clientes y contadores.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Gateway SII Operativo
                </span>
              </div>
            </div>

            {apiSaveSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Configuración de Gateway guardada exitosamente y propagada a todos los estudios del sistema.</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Proveedor API de Servicio</label>
                <select
                  value={masterProvider}
                  onChange={(e) => setMasterProvider(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="SIMPLE_API">SimpleAPI.cl (Recomendado Multi-Estudio)</option>
                  <option value="OPEN_FACTURA">OpenFactura (Haulmer)</option>
                  <option value="LIBRE_DTE">LibreDTE</option>
                  <option value="DIRECT_SII">Conexión Directa SII</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">URL Endpoint Base</label>
                <input
                  type="text"
                  value={masterApiEndpoint}
                  onChange={(e) => setMasterApiEndpoint(e.target.value)}
                  placeholder="https://api.simpleapi.cl/v1"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Master API Key (Centralizada)</label>
                <input
                  type="text"
                  value={masterApiKey}
                  onChange={(e) => setMasterApiKey(e.target.value)}
                  placeholder="5511-W960-6395-2355-3470"
                  className="w-full bg-slate-50 border border-amber-300 rounded-xl p-2.5 text-xs text-amber-900 font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-2xs"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem('gest_ok_master_api_key', masterApiKey.trim());
                    setApiSaveSuccess(true);
                    setTimeout(() => setApiSaveSuccess(false), 4000);
                  } catch (e) {
                    alert('Error al guardar credenciales en almacenamiento.');
                  }
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Guardar Parámetros de Gateway Master</span>
              </button>
            </div>
          </div>

          {/* Infrastructure & Scale Architecture Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Estudios con Acceso Directo</h4>
                  <span className="text-lg font-bold text-slate-900 font-mono">{studies.length}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Todos los estudios contables registrados heredan automáticamente el Gateway sin requerir configuración individual.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Empresas con Rescate RCV</h4>
                  <span className="text-lg font-bold text-slate-900 font-mono">{companies.length}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Empresas listas para rescatar Compras, Ventas y Honorarios de manera inmediata y centralizada.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Escalabilidad Multi-Empresa</h4>
                  <span className="text-xs font-bold text-emerald-600">Alta Disponibilidad</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Las consultas se distribuyen y validan contra Firestore para evitar consumos duplicados de cuota de API.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
