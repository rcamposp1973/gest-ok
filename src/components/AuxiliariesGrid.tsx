import React, { useState, useMemo } from 'react';
import { Auxiliary, ChartOfAccount, AccountingVoucher } from '../types';
import { doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Search, 
  Plus, 
  FileSpreadsheet, 
  RefreshCw, 
  Edit3, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  ShieldAlert,
  Download,
  Users,
  Building2,
  Sparkles,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface AuxiliariesGridProps {
  studyId: string;
  companyId: string;
  auxiliaries: Auxiliary[];
  accounts: ChartOfAccount[];
  vouchers: AccountingVoucher[];
  onRefresh: () => Promise<void>;
  onEdit: (aux: Auxiliary) => void;
  onCreate?: () => void;
  onNavigateToBulkImport: () => void;
}

export default function AuxiliariesGrid({
  studyId,
  companyId,
  auxiliaries,
  accounts,
  vouchers,
  onRefresh,
  onEdit,
  onCreate,
  onNavigateToBulkImport
}: AuxiliariesGridProps) {
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState({
    rut: '',
    name: '',
    role: 'ALL',
    estado: 'ALL',
    email: '',
    phone: '',
    debtorAccount: '',
    creditorAccount: ''
  });
  const [sortBy, setSortBy] = useState<'rut' | 'name' | 'role' | 'estado'>('rut');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [auxToDelete, setAuxToDelete] = useState<Auxiliary | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const companyRef = doc(db, 'studies', studyId, 'companies', companyId);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Consolidación y Unificación de Auxiliares por RUT único garantizado
  const uniqueAuxiliaries = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    const nonRut: Auxiliary[] = [];

    auxiliaries.forEach(aux => {
      const clean = (aux.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
      if (!clean) {
        nonRut.push(aux);
        return;
      }
      if (!map.has(clean)) {
        map.set(clean, { ...aux });
      } else {
        const existing = map.get(clean)!;
        const scoreExisting = (existing.defaultCreditorAccountId ? 10 : 0) + 
                              (existing.defaultDebtorAccountId ? 10 : 0) + 
                              (existing.defaultExpenseOrIncomeAccountId ? 8 : 0) +
                              (existing.defaultCostCenter ? 4 : 0) +
                              (existing.defaultExpenseItem ? 4 : 0) +
                              (existing.defaultProject ? 4 : 0) +
                              (existing.defaultProduct ? 4 : 0) +
                              (existing.defaultCustomAnalyses && Object.keys(existing.defaultCustomAnalyses).length > 0 ? 6 : 0) +
                              (existing.email ? 2 : 0) +
                              (existing.phone ? 2 : 0);
        const scoreNew = (aux.defaultCreditorAccountId ? 10 : 0) + 
                         (aux.defaultDebtorAccountId ? 10 : 0) + 
                         (aux.defaultExpenseOrIncomeAccountId ? 8 : 0) +
                         (aux.defaultCostCenter ? 4 : 0) +
                         (aux.defaultExpenseItem ? 4 : 0) +
                         (aux.defaultProject ? 4 : 0) +
                         (aux.defaultProduct ? 4 : 0) +
                         (aux.defaultCustomAnalyses && Object.keys(aux.defaultCustomAnalyses).length > 0 ? 6 : 0) +
                         (aux.email ? 2 : 0) +
                         (aux.phone ? 2 : 0);
        const primary = scoreNew > scoreExisting ? { ...aux } : { ...existing };
        const secondary = scoreNew > scoreExisting ? existing : aux;

        // Fusión de campos
        if (!primary.name && secondary.name) primary.name = secondary.name;
        if (!primary.email && secondary.email) primary.email = secondary.email;
        if (!primary.phone && secondary.phone) primary.phone = secondary.phone;
        if (!primary.banco && secondary.banco) primary.banco = secondary.banco;
        if (!primary.numeroCuenta && secondary.numeroCuenta) {
          primary.numeroCuenta = secondary.numeroCuenta;
          primary.tipoCuenta = secondary.tipoCuenta || primary.tipoCuenta;
        }
        if (!primary.defaultDebtorAccountId && secondary.defaultDebtorAccountId) {
          primary.defaultDebtorAccountId = secondary.defaultDebtorAccountId;
        }
        if (!primary.defaultCreditorAccountId && secondary.defaultCreditorAccountId) {
          primary.defaultCreditorAccountId = secondary.defaultCreditorAccountId;
        }
        if (!primary.defaultExpenseOrIncomeAccountId && secondary.defaultExpenseOrIncomeAccountId) {
          primary.defaultExpenseOrIncomeAccountId = secondary.defaultExpenseOrIncomeAccountId;
        }
        if (!primary.defaultCostCenter && secondary.defaultCostCenter) {
          primary.defaultCostCenter = secondary.defaultCostCenter;
        }
        if (!primary.defaultExpenseItem && secondary.defaultExpenseItem) {
          primary.defaultExpenseItem = secondary.defaultExpenseItem;
        }
        if (!primary.defaultProject && secondary.defaultProject) {
          primary.defaultProject = secondary.defaultProject;
        }
        if (!primary.defaultProduct && secondary.defaultProduct) {
          primary.defaultProduct = secondary.defaultProduct;
        }
        if (secondary.defaultCustomAnalyses && Object.keys(secondary.defaultCustomAnalyses).length > 0) {
          primary.defaultCustomAnalyses = {
            ...(secondary.defaultCustomAnalyses || {}),
            ...(primary.defaultCustomAnalyses || {})
          };
        }
        if ((primary.role === 'Deudor' && secondary.role === 'Acreedor') || (primary.role === 'Acreedor' && secondary.role === 'Deudor')) {
          primary.role = 'Ambos';
        }
        map.set(clean, primary);
      }
    });

    return [...nonRut, ...Array.from(map.values())];
  }, [auxiliaries]);

  // Mapa de cuentas para lookup rápido [id] -> account
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => map.set(a.id, a));
    return map;
  }, [accounts]);

  // Filtrado reactivo multicriterio sobre la lista única
  const filteredAuxiliaries = useMemo(() => {
    return uniqueAuxiliaries.filter(aux => {
      // Búsqueda global
      const q = globalSearch.toLowerCase().trim();
      if (q) {
        const matchesGlobal =
          (aux.rut || '').toLowerCase().includes(q) ||
          (aux.name || '').toLowerCase().includes(q) ||
          (aux.email || '').toLowerCase().includes(q) ||
          (aux.phone || '').toLowerCase().includes(q) ||
          (aux.role || '').toLowerCase().includes(q);
        if (!matchesGlobal) return false;
      }

      // Filtros por columna en el encabezado
      if (columnFilters.rut && !(aux.rut || '').toLowerCase().includes(columnFilters.rut.toLowerCase().trim())) {
        return false;
      }
      if (columnFilters.name && !(aux.name || '').toLowerCase().includes(columnFilters.name.toLowerCase().trim())) {
        return false;
      }
      if (columnFilters.role !== 'ALL' && aux.role !== columnFilters.role) {
        return false;
      }
      if (columnFilters.estado !== 'ALL') {
        const currentEst = aux.estado || 'Activo';
        if (currentEst !== columnFilters.estado) return false;
      }
      if (columnFilters.email && !(aux.email || '').toLowerCase().includes(columnFilters.email.toLowerCase().trim())) {
        return false;
      }
      if (columnFilters.phone && !(aux.phone || '').toLowerCase().includes(columnFilters.phone.toLowerCase().trim())) {
        return false;
      }

      if (columnFilters.debtorAccount) {
        const dAcc = aux.defaultDebtorAccountId ? accountMap.get(aux.defaultDebtorAccountId) : null;
        const dStr = dAcc ? `${dAcc.code} ${dAcc.name}`.toLowerCase() : '';
        if (!dStr.includes(columnFilters.debtorAccount.toLowerCase().trim())) return false;
      }

      if (columnFilters.creditorAccount) {
        const cAcc = aux.defaultCreditorAccountId ? accountMap.get(aux.defaultCreditorAccountId) : null;
        const cStr = cAcc ? `${cAcc.code} ${cAcc.name}`.toLowerCase() : '';
        if (!cStr.includes(columnFilters.creditorAccount.toLowerCase().trim())) return false;
      }

      return true;
    });
  }, [uniqueAuxiliaries, globalSearch, columnFilters, accountMap]);

  // Ordenamiento secundario
  const sortedAuxiliaries = useMemo(() => {
    return [...filteredAuxiliaries].sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortBy === 'rut') {
        valA = (a.rut || '').toLowerCase();
        valB = (b.rut || '').toLowerCase();
      } else if (sortBy === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else if (sortBy === 'role') {
        valA = (a.role || '').toLowerCase();
        valB = (b.role || '').toLowerCase();
      } else if (sortBy === 'estado') {
        valA = (a.estado || 'Activo').toLowerCase();
        valB = (b.estado || 'Activo').toLowerCase();
      }

      const comp = valA.localeCompare(valB, 'es', { numeric: true });
      return sortOrder === 'asc' ? comp : -comp;
    });
  }, [filteredAuxiliaries, sortBy, sortOrder]);

  // Toggle Estado Activo / Inactivo
  const handleToggleState = async (aux: Auxiliary) => {
    try {
      const newEst = aux.estado === 'Inactivo' ? 'Activo' : 'Inactivo';
      await setDoc(doc(companyRef, 'auxiliaries', aux.id), { estado: newEst }, { merge: true });
      showToast(`Estado de ${aux.name} cambiado a ${newEst}`);
      await onRefresh();
    } catch (err: any) {
      showToast('Error al actualizar estado: ' + err.message, 'error');
    }
  };

  // Solicitar eliminación de auxiliar
  const handleRequestDelete = (aux: Auxiliary) => {
    setAuxToDelete(aux);
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!auxToDelete) return;
    try {
      await deleteDoc(doc(companyRef, 'auxiliaries', auxToDelete.id));
      showToast(`Auxiliar ${auxToDelete.name} eliminado exitosamente.`);
      setAuxToDelete(null);
      await onRefresh();
    } catch (err: any) {
      showToast('Error al eliminar auxiliar: ' + err.message, 'error');
    }
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    if (filteredAuxiliaries.length === 0) return;
    const data = filteredAuxiliaries.map((aux, idx) => {
      const dAcc = aux.defaultDebtorAccountId ? accountMap.get(aux.defaultDebtorAccountId) : null;
      const cAcc = aux.defaultCreditorAccountId ? accountMap.get(aux.defaultCreditorAccountId) : null;
      const eAcc = aux.defaultExpenseOrIncomeAccountId ? accountMap.get(aux.defaultExpenseOrIncomeAccountId) : null;

      return {
        'N°': idx + 1,
        'RUT': aux.rut,
        'Razón Social / Nombre': aux.name,
        'Rol Principal': aux.role,
        'Estado': aux.estado || 'Activo',
        'Email': aux.email || '',
        'Teléfono': aux.phone || '',
        'Cuenta Deudor (Cliente)': dAcc ? `[${dAcc.code}] ${dAcc.name}` : '',
        'Cuenta Acreedor (Proveedor)': cAcc ? `[${cAcc.code}] ${cAcc.name}` : '',
        'Cuenta Ingreso / Gasto': eAcc ? `[${eAcc.code}] ${eAcc.name}` : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auxiliaries');
    XLSX.writeFile(wb, `Maestro_Auxiliaries_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const hasActiveFilters = globalSearch || Object.values(columnFilters).some(v => v && v !== 'ALL');

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE BÚSQUEDA Y ACCIONES */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-sm">Maestro de Auxiliares</h3>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100">
              Total: {uniqueAuxiliaries.length}
            </span>
            <span className="bg-emerald-50 text-emerald-800 px-2 py-1 rounded-lg border border-emerald-200">
              Deudores: {uniqueAuxiliaries.filter(a => a.role === 'Deudor' || a.role === 'Ambos').length}
            </span>
            <span className="bg-amber-50 text-amber-800 px-2 py-1 rounded-lg border border-amber-200">
              Acreedores: {uniqueAuxiliaries.filter(a => a.role === 'Acreedor' || a.role === 'Ambos').length}
            </span>
          </div>
        </div>

        {/* ACCIONES */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* BUSCADOR GENERAL */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por RUT, Nombre o Email..."
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <button
            onClick={onCreate || (() => onEdit(null as any))}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg border border-indigo-700 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nuevo Auxiliar</span>
          </button>

          <button
            onClick={onNavigateToBulkImport}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors"
          >
            <span>📥</span>
            <span>Carga Masiva Excel</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={filteredAuxiliaries.length === 0}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setGlobalSearch('');
                setColumnFilters({
                  rut: '',
                  name: '',
                  role: 'ALL',
                  estado: 'ALL',
                  email: '',
                  phone: '',
                  debtorAccount: '',
                  creditorAccount: ''
                });
              }}
              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpiar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* TABLA GRILLA ESTILO EXCEL */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-xs text-left border-collapse font-sans select-none">
            <thead>
              {/* ENCABEZADOS DE TÍTULO */}
              <tr className="bg-slate-800 text-white text-[11px] font-bold tracking-tight border-b border-slate-900 sticky top-0 z-10 shadow-xs">
                <th className="w-10 px-2 py-2 text-center bg-slate-900 border-r border-slate-700">N°</th>
                <th 
                  onClick={() => { if (sortBy === 'rut') setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); else { setSortBy('rut'); setSortOrder('asc'); } }}
                  className="w-32 px-2 py-2 border-r border-slate-700 font-mono cursor-pointer hover:bg-slate-700 transition-colors"
                  title="Ordenar por RUT"
                >
                  RUT * {sortBy === 'rut' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th 
                  onClick={() => { if (sortBy === 'name') setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); else { setSortBy('name'); setSortOrder('asc'); } }}
                  className="w-64 px-2 py-2 border-r border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
                  title="Ordenar por Razón Social / Nombre"
                >
                  RAZÓN SOCIAL / NOMBRE * {sortBy === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th 
                  onClick={() => { if (sortBy === 'role') setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); else { setSortBy('role'); setSortOrder('asc'); } }}
                  className="w-28 px-2 py-2 text-center border-r border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
                  title="Ordenar por Rol Principal"
                >
                  ROL PRINCIPAL {sortBy === 'role' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th 
                  onClick={() => { if (sortBy === 'estado') setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); else { setSortBy('estado'); setSortOrder('asc'); } }}
                  className="w-24 px-2 py-2 text-center border-r border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
                  title="Ordenar por Estado"
                >
                  ESTADO {sortBy === 'estado' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th className="w-44 px-2 py-2 border-r border-slate-700">EMAIL</th>
                <th className="w-32 px-2 py-2 border-r border-slate-700">TELÉFONO</th>
                <th className="w-48 px-2 py-2 border-r border-slate-700">CTA DEUDOR (CLIENTE)</th>
                <th className="w-48 px-2 py-2 border-r border-slate-700">CTA ACREEDOR (PROVEEDOR)</th>
                <th className="w-28 px-2 py-2 text-center bg-slate-900">ACCIONES</th>
              </tr>

              {/* ENCABEZADOS DE FILTROS */}
              <tr className="bg-slate-900 text-slate-200 text-[10px] border-b-2 border-slate-900 sticky top-[33px] z-10 shadow-xs">
                <th className="p-1 text-center bg-slate-950 border-r border-slate-800 font-mono text-slate-500">🔍</th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar RUT..."
                    value={columnFilters.rut}
                    onChange={e => setColumnFilters(prev => ({ ...prev, rut: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 placeholder-slate-500 px-1.5 py-0.5 rounded text-[10px] outline-none font-mono focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar Nombre / Razon Social..."
                    value={columnFilters.name}
                    onChange={e => setColumnFilters(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 placeholder-slate-500 px-1.5 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <select
                    value={columnFilters.role}
                    onChange={e => setColumnFilters(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="ALL">Todos</option>
                    <option value="Deudor">Deudor (Cliente)</option>
                    <option value="Acreedor">Acreedor (Proveedor)</option>
                    <option value="Ambos">Ambos</option>
                  </select>
                </th>
                <th className="p-1 border-r border-slate-800">
                  <select
                    value={columnFilters.estado}
                    onChange={e => setColumnFilters(prev => ({ ...prev, estado: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="ALL">Todos</option>
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar Email..."
                    value={columnFilters.email}
                    onChange={e => setColumnFilters(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar Teléfono..."
                    value={columnFilters.phone}
                    onChange={e => setColumnFilters(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar Cta Deudor..."
                    value={columnFilters.debtorAccount}
                    onChange={e => setColumnFilters(prev => ({ ...prev, debtorAccount: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar Cta Acreedor..."
                    value={columnFilters.creditorAccount}
                    onChange={e => setColumnFilters(prev => ({ ...prev, creditorAccount: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 bg-slate-950 text-center font-mono text-[9px] text-slate-400">
                  {filteredAuxiliaries.length} reg
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {sortedAuxiliaries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    <p className="font-semibold text-sm text-slate-700">No se encontraron auxiliares</p>
                    <p className="text-xs text-slate-400 mt-1">Prueba cambiando los términos de búsqueda o filtros.</p>
                  </td>
                </tr>
              ) : (
                sortedAuxiliaries.map((aux, idx) => {
                  const dAcc = aux.defaultDebtorAccountId ? accountMap.get(aux.defaultDebtorAccountId) : null;
                  const cAcc = aux.defaultCreditorAccountId ? accountMap.get(aux.defaultCreditorAccountId) : null;
                  const isInactive = aux.estado === 'Inactivo';

                  return (
                    <tr 
                      key={aux.id}
                      className={`hover:bg-indigo-50/40 transition-colors ${
                        isInactive ? 'bg-slate-50/70 text-slate-500' : 'bg-white'
                      }`}
                    >
                      {/* N° */}
                      <td className="px-2 py-2 text-center font-mono text-[10px] text-slate-400 bg-slate-50 border-r border-slate-200">
                        {idx + 1}
                      </td>

                      {/* RUT */}
                      <td className="px-2 py-2 font-mono font-bold text-slate-900 border-r border-slate-200">
                        <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                          {aux.rut}
                        </span>
                      </td>

                      {/* NOMBRE */}
                      <td className="px-2.5 py-2 font-semibold text-slate-900 border-r border-slate-200">
                        {aux.name}
                      </td>

                      {/* ROL */}
                      <td className="px-2 py-2 text-center border-r border-slate-200">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          aux.role === 'Deudor'
                            ? 'bg-indigo-100 text-indigo-800'
                            : aux.role === 'Acreedor'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {aux.role}
                        </span>
                      </td>

                      {/* ESTADO */}
                      <td className="px-2 py-2 text-center border-r border-slate-200">
                        <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                          isInactive ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {aux.estado || 'Activo'}
                        </span>
                      </td>

                      {/* EMAIL */}
                      <td className="px-2 py-2 text-slate-600 border-r border-slate-200 truncate max-w-[160px]" title={aux.email}>
                        {aux.email || '-'}
                      </td>

                      {/* TELÉFONO */}
                      <td className="px-2 py-2 text-slate-600 border-r border-slate-200 font-mono text-[11px]">
                        {aux.phone || '-'}
                      </td>

                      {/* CTA DEUDOR */}
                      <td className="px-2 py-2 border-r border-slate-200 text-slate-700 text-[11px]">
                        {dAcc ? (
                          <span title={`[${dAcc.code}] ${dAcc.name}`}>
                            <strong className="font-mono text-indigo-700 mr-1">[{dAcc.code}]</strong>
                            <span className="truncate">{dAcc.name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Sin asignar</span>
                        )}
                      </td>

                      {/* CTA ACREEDOR */}
                      <td className="px-2 py-2 border-r border-slate-200 text-slate-700 text-[11px]">
                        {cAcc ? (
                          <span title={`[${cAcc.code}] ${cAcc.name}`}>
                            <strong className="font-mono text-amber-700 mr-1">[{cAcc.code}]</strong>
                            <span className="truncate">{cAcc.name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Sin asignar</span>
                        )}
                      </td>

                      {/* ACCIONES */}
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onEdit(aux)}
                            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Editar auxiliar"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleState(aux)}
                            className={`p-1 rounded transition-colors ${
                              isInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isInactive ? 'Activar auxiliar' : 'Desactivar auxiliar'}
                          >
                            {isInactive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleRequestDelete(aux)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                            title="Eliminar auxiliar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
          <span>
            Mostrando {filteredAuxiliaries.length} de {uniqueAuxiliaries.length} auxiliares
          </span>
          <span className="font-mono">Sistema Contable &bull; SII Chile</span>
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {auxToDelete && (() => {
        const cleanDeleteRut = (auxToDelete.rut || '').replace(/\./g, '').trim().toUpperCase();
        const hasMovements = vouchers.some(v => 
          v.status !== 'Anulado' && 
          (v.lines || []).some(l => (l.auxiliaryRut || '').replace(/\./g, '').trim().toUpperCase() === cleanDeleteRut)
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
              <div className={`px-5 py-4 flex items-center justify-between text-white ${hasMovements ? 'bg-amber-600' : 'bg-rose-600'}`}>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  <h3 className="font-bold text-base">
                    {hasMovements ? 'Auxiliar Protegido' : 'Confirmar Eliminación'}
                  </h3>
                </div>
                <button
                  onClick={() => setAuxToDelete(null)}
                  className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-slate-500 text-[10px]">RUT / RAZÓN SOCIAL:</p>
                  <p className="font-mono font-bold text-slate-900 text-sm">{auxToDelete.rut}</p>
                  <p className="font-bold text-slate-800 mt-0.5">{auxToDelete.name}</p>
                </div>

                {hasMovements ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 space-y-1">
                    <p className="font-bold">🔒 Protección de Integridad Contable:</p>
                    <p className="text-[11px] leading-relaxed">
                      Este auxiliar registra movimientos o imputaciones en comprobantes contables activos. No puede ser eliminado para preservar la coherencia contable y auditoría. Puedes <strong>Desactivarlo</strong> si ya no opera.
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-600 leading-relaxed">
                    ¿Estás seguro de que deseas eliminar este auxiliar del maestro? Esta acción no se puede deshacer.
                  </p>
                )}
              </div>

              <div className="bg-slate-100 border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAuxToDelete(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-300 transition-colors"
                >
                  {hasMovements ? 'Entendido' : 'Cancelar'}
                </button>
                {!hasMovements && (
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-lg shadow transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar Registro</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* TOAST FLOTANTE DE NOTIFICACIONES */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div className={`px-4 py-3 rounded-xl shadow-xl border flex items-center gap-2.5 text-xs font-semibold ${
            toastMessage.type === 'error'
              ? 'bg-rose-600 text-white border-rose-700'
              : toastMessage.type === 'info'
              ? 'bg-slate-800 text-white border-slate-900'
              : 'bg-emerald-600 text-white border-emerald-700'
          }`}>
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-white/80 hover:text-white p-0.5 rounded ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
