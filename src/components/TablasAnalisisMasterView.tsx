import React, { useState, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  Company,
  CostCenterMaster,
  ExpenseItemMaster,
  NonSiiDocTypeMaster,
  ProjectMaster,
  ProductMaster,
  CustomAnalysisTableItem
} from '../types';
import { logAuditEvent } from '../utils/auditLogger';

interface TablasAnalisisMasterViewProps {
  studyId: string;
  company: Company;
  isReadOnly?: boolean;
  costCenters: CostCenterMaster[];
  expenseItems: ExpenseItemMaster[];
  nonSiiDocTypes: NonSiiDocTypeMaster[];
  projects: ProjectMaster[];
  products: ProductMaster[];
  customAnalysisItems: CustomAnalysisTableItem[];
  onRefreshData: () => Promise<void>;
  onUpdateCompanyCustomCols?: (newCols: string[]) => Promise<void>;
}

type MasterTabType = 'costCenters' | 'expenseItems' | 'nonSiiDocs' | 'projects' | 'products' | 'customTables';

export default function TablasAnalisisMasterView({
  studyId,
  company,
  isReadOnly,
  costCenters,
  expenseItems,
  nonSiiDocTypes,
  projects,
  products,
  customAnalysisItems,
  onRefreshData,
  onUpdateCompanyCustomCols
}: TablasAnalisisMasterViewProps) {
  const [activeTab, setActiveTab] = useState<MasterTabType>('costCenters');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Activo' | 'Inactivo'>('Todos');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'extra' | 'estado'>('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isSaving, setIsSaving] = useState(false);

  // Selected custom analysis column when on 'customTables' tab
  const customCols = company.customAccountColumns || [];
  const [selectedCustomCol, setSelectedCustomCol] = useState<string>(customCols[0] || '');
  const [newColNameInput, setNewColNameInput] = useState('');
  const [showAddColModal, setShowAddColModal] = useState(false);

  // Editing state for modals
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenterMaster | null>(null);
  const [editingExpenseItem, setEditingExpenseItem] = useState<ExpenseItemMaster | null>(null);
  const [editingNonSiiDoc, setEditingNonSiiDoc] = useState<NonSiiDocTypeMaster | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectMaster | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductMaster | null>(null);
  const [editingCustomItem, setEditingCustomItem] = useState<CustomAnalysisTableItem | null>(null);

  // Form open states for new items
  const [showNewModal, setShowNewModal] = useState(false);

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // ----------------------------------------------------
  // PRELOAD STANDARD CATALOGS (Carga Inicial Sugerida)
  // ----------------------------------------------------
  const handleSeedStandardCatalogs = async () => {
    if (isReadOnly) return;
    if (!window.confirm(`¿Desea precargar catálogos estándar para ${company.name}? (Centros de costo, ítems de gasto y documentos internos)`)) return;

    setIsSaving(true);
    try {
      const userUid = auth.currentUser?.uid || 'anon';
      const userEmail = auth.currentUser?.email || '';
      const nowIso = new Date().toISOString();

      // 1. Centros de Costos Estándar
      if (costCenters.length === 0) {
        const defaultCCs = [
          { code: 'ADM', name: 'Administración General & Casa Matriz', area: 'Gerencia' },
          { code: 'VTAS', name: 'Comercial & Ventas', area: 'Comercial' },
          { code: 'OPE', name: 'Operaciones y Producción', area: 'Operaciones' },
          { code: 'TI', name: 'Tecnología & Sistemas', area: 'Soporte' },
          { code: 'LOG', name: 'Logística y Despacho', area: 'Operaciones' }
        ];
        for (const cc of defaultCCs) {
          await addDoc(collection(companyRef, 'costCenters'), {
            companyId: company.id,
            code: cc.code,
            name: cc.name,
            area: cc.area,
            estado: 'Activo',
            createdAt: nowIso
          });
        }
      }

      // 2. Ítems de Gasto Estándar
      if (expenseItems.length === 0) {
        const defaultExpenses = [
          { code: 'GTO-ARR', name: 'Arriendos de Inmuebles y Oficinas', category: 'Fijo' },
          { code: 'GTO-LUM', name: 'Servicios Básicos (Luz, Agua, Gas, Internet)', category: 'Fijo' },
          { code: 'GTO-REM', name: 'Sueldos, Gratificaciones y Remuneraciones', category: 'Operacional' },
          { code: 'GTO-HON', name: 'Honorarios Profesionales y Asesorías', category: 'Operacional' },
          { code: 'GTO-MAN', name: 'Mantención, Aseo y Reparaciones', category: 'Variable' },
          { code: 'GTO-VIA', name: 'Viáticos, Pasajes y Movilización', category: 'Variable' },
          { code: 'GTO-PUB', name: 'Publicidad, Marketing y Diseño', category: 'Variable' },
          { code: 'GTO-FIN', name: 'Comisiones Bancarias e Intereses', category: 'No Operacional' }
        ];
        for (const exp of defaultExpenses) {
          await addDoc(collection(companyRef, 'expenseItems'), {
            companyId: company.id,
            code: exp.code,
            name: exp.name,
            category: exp.category,
            estado: 'Activo',
            createdAt: nowIso
          });
        }
      }

      // 3. Documentos No SII Estándar
      if (nonSiiDocTypes.length === 0) {
        const defaultDocs = [
          { code: 'VALE_CAJA', name: 'Vale Provisorio de Caja Chica', description: 'Anticipos o gastos menores de caja chica' },
          { code: 'REND_GASTO', name: 'Rendición de Gastos y Fondos por Rendir', description: 'Planilla de rendición con comprobantes de compras' },
          { code: 'REC_INTERNO', name: 'Recibo Interno de Caja / Comprobante de Entrega', description: 'Documento interno de recepción o egreso' },
          { code: 'COMP_TRF', name: 'Comprobante de Transferencia Bancaria', description: 'Comprobante de pago bancario electrónico' },
          { code: 'LIQ_SUELDO', name: 'Liquidación de Sueldos y Salarios', description: 'Comprobante mensual de pago de remuneraciones' },
          { code: 'CONTRATO', name: 'Contrato de Servicios / Prestación', description: 'Respaldos legales de contratos vigentes' }
        ];
        for (const docType of defaultDocs) {
          await addDoc(collection(companyRef, 'nonSiiDocTypes'), {
            companyId: company.id,
            code: docType.code,
            name: docType.name,
            description: docType.description,
            estado: 'Activo',
            createdAt: nowIso
          });
        }
      }

      // Log Audit
      logAuditEvent({
        userId: userUid,
        userEmail: userEmail,
        studyId,
        companyId: company.id,
        action: 'CREAR',
        module: 'PLAN_CUENTAS',
        details: `Precarga de catálogos estándar de análisis para ${company.name}`
      });

      await onRefreshData();
      alert('Catálogos estándar cargados exitosamente.');
    } catch (err: any) {
      console.error('Error seeding catalogs:', err);
      alert('Error al precargar catálogos: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ----------------------------------------------------
  // CRUD HANDLERS
  // ----------------------------------------------------

  // Centros de Costos
  const handleSaveCostCenter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly) return;
    const form = new FormData(e.currentTarget);
    const code = (form.get('code') as string || '').trim().toUpperCase();
    const name = (form.get('name') as string || '').trim();
    const area = (form.get('area') as string || '').trim();
    const estado = (form.get('estado') as 'Activo' | 'Inactivo') || 'Activo';

    if (!code || !name) {
      alert('El código y el nombre del Centro de Costos son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload: any = {
        companyId: company.id,
        code,
        name,
        area,
        estado,
        updatedAt: nowIso
      };

      if (editingCostCenter) {
        await updateDoc(doc(companyRef, 'costCenters', editingCostCenter.id), payload);
      } else {
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'costCenters'), payload);
      }

      await onRefreshData();
      setEditingCostCenter(null);
      setShowNewModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar Centro de Costo: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Ítems de Gasto
  const handleSaveExpenseItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly) return;
    const form = new FormData(e.currentTarget);
    const code = (form.get('code') as string || '').trim().toUpperCase();
    const name = (form.get('name') as string || '').trim();
    const category = (form.get('category') as string || '').trim();
    const estado = (form.get('estado') as 'Activo' | 'Inactivo') || 'Activo';

    if (!code || !name) {
      alert('El código y el nombre del Ítem de Gasto son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload: any = {
        companyId: company.id,
        code,
        name,
        category,
        estado,
        updatedAt: nowIso
      };

      if (editingExpenseItem) {
        await updateDoc(doc(companyRef, 'expenseItems', editingExpenseItem.id), payload);
      } else {
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'expenseItems'), payload);
      }

      await onRefreshData();
      setEditingExpenseItem(null);
      setShowNewModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar Ítem de Gasto: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Documentos No SII
  const handleSaveNonSiiDoc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly) return;
    const form = new FormData(e.currentTarget);
    const code = (form.get('code') as string || '').trim().toUpperCase();
    const name = (form.get('name') as string || '').trim();
    const description = (form.get('description') as string || '').trim();
    const estado = (form.get('estado') as 'Activo' | 'Inactivo') || 'Activo';

    if (!code || !name) {
      alert('El código y el nombre del Tipo de Documento son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload: any = {
        companyId: company.id,
        code,
        name,
        description,
        estado,
        updatedAt: nowIso
      };

      if (editingNonSiiDoc) {
        await updateDoc(doc(companyRef, 'nonSiiDocTypes', editingNonSiiDoc.id), payload);
      } else {
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'nonSiiDocTypes'), payload);
      }

      await onRefreshData();
      setEditingNonSiiDoc(null);
      setShowNewModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar Tipo de Documento: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Proyectos / Obras
  const handleSaveProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly) return;
    const form = new FormData(e.currentTarget);
    const code = (form.get('code') as string || '').trim().toUpperCase();
    const name = (form.get('name') as string || '').trim();
    const clientOrLocation = (form.get('clientOrLocation') as string || '').trim();
    const estado = (form.get('estado') as 'Activo' | 'Inactivo') || 'Activo';

    if (!code || !name) {
      alert('El código y el nombre del Proyecto u Obra son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload: any = {
        companyId: company.id,
        code,
        name,
        clientOrLocation,
        estado,
        updatedAt: nowIso
      };

      if (editingProject) {
        await updateDoc(doc(companyRef, 'projects', editingProject.id), payload);
      } else {
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'projects'), payload);
      }

      await onRefreshData();
      setEditingProject(null);
      setShowNewModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar Proyecto: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Productos / Servicios
  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly) return;
    const form = new FormData(e.currentTarget);
    const code = (form.get('code') as string || '').trim().toUpperCase();
    const name = (form.get('name') as string || '').trim();
    const unit = (form.get('unit') as string || '').trim().toUpperCase();
    const estado = (form.get('estado') as 'Activo' | 'Inactivo') || 'Activo';

    if (!code || !name) {
      alert('El código y el nombre del Producto / Servicio son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload: any = {
        companyId: company.id,
        code,
        name,
        unit,
        estado,
        updatedAt: nowIso
      };

      if (editingProduct) {
        await updateDoc(doc(companyRef, 'products', editingProduct.id), payload);
      } else {
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'products'), payload);
      }

      await onRefreshData();
      setEditingProduct(null);
      setShowNewModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar Producto: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Custom Analysis Items
  const handleSaveCustomItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly || !selectedCustomCol) return;
    const form = new FormData(e.currentTarget);
    const code = (form.get('code') as string || '').trim().toUpperCase();
    const name = (form.get('name') as string || '').trim();
    const description = (form.get('description') as string || '').trim();
    const estado = (form.get('estado') as 'Activo' | 'Inactivo') || 'Activo';

    if (!code || !name) {
      alert('El código y el nombre son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload: any = {
        companyId: company.id,
        analysisColumnName: selectedCustomCol,
        code,
        name,
        description,
        estado,
        updatedAt: nowIso
      };

      if (editingCustomItem) {
        await updateDoc(doc(companyRef, 'customAnalysisItems', editingCustomItem.id), payload);
      } else {
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'customAnalysisItems'), payload);
      }

      await onRefreshData();
      setEditingCustomItem(null);
      setShowNewModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar ítem de análisis: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Add new Custom Column definition to company
  const handleCreateNewCustomColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColNameInput.trim() || !onUpdateCompanyCustomCols) return;
    const colNameClean = newColNameInput.trim().toUpperCase();
    if (customCols.includes(colNameClean)) {
      alert(`El análisis "${colNameClean}" ya existe.`);
      return;
    }
    const updated = [...customCols, colNameClean];
    await onUpdateCompanyCustomCols(updated);
    setSelectedCustomCol(colNameClean);
    setNewColNameInput('');
    setShowAddColModal(false);
  };

  // Toggle status
  const handleToggleStatus = async (collectionName: string, id: string, currentStatus: 'Activo' | 'Inactivo') => {
    if (isReadOnly) return;
    try {
      const nextStatus = currentStatus === 'Activo' ? 'Inactivo' : 'Activo';
      await updateDoc(doc(companyRef, collectionName, id), { estado: nextStatus, updatedAt: new Date().toISOString() });
      await onRefreshData();
    } catch (err: any) {
      alert('Error al actualizar estado: ' + err.message);
    }
  };

  // ----------------------------------------------------
  // FILTERED & SORTED LISTS
  // ----------------------------------------------------
  const sortItems = useCallback(<T extends { code: string; name: string; estado?: string }>(
    items: T[],
    getExtraField?: (item: T) => string
  ): T[] => {
    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortBy === 'code') {
        valA = (a.code || '').toLowerCase();
        valB = (b.code || '').toLowerCase();
      } else if (sortBy === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else if (sortBy === 'estado') {
        valA = (a.estado || 'Activo').toLowerCase();
        valB = (b.estado || 'Activo').toLowerCase();
      } else if (sortBy === 'extra' && getExtraField) {
        valA = (getExtraField(a) || '').toLowerCase();
        valB = (getExtraField(b) || '').toLowerCase();
      }

      const comp = valA.localeCompare(valB, 'es', { numeric: true });
      return sortOrder === 'asc' ? comp : -comp;
    });
  }, [sortBy, sortOrder]);

  const filteredCostCenters = useMemo(() => {
    const filtered = costCenters.filter(c => {
      const matchesSearch = c.code.toLowerCase().includes(searchQuery.toLowerCase()) || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.area || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'Todos' || c.estado === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return sortItems(filtered, c => c.area || '');
  }, [costCenters, searchQuery, statusFilter, sortItems]);

  const filteredExpenseItems = useMemo(() => {
    const filtered = expenseItems.filter(e => {
      const matchesSearch = e.code.toLowerCase().includes(searchQuery.toLowerCase()) || e.name.toLowerCase().includes(searchQuery.toLowerCase()) || (e.category || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'Todos' || e.estado === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return sortItems(filtered, e => e.category || '');
  }, [expenseItems, searchQuery, statusFilter, sortItems]);

  const filteredNonSiiDocs = useMemo(() => {
    const filtered = nonSiiDocTypes.filter(d => {
      const matchesSearch = d.code.toLowerCase().includes(searchQuery.toLowerCase()) || d.name.toLowerCase().includes(searchQuery.toLowerCase()) || (d.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'Todos' || d.estado === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return sortItems(filtered, d => d.description || '');
  }, [nonSiiDocTypes, searchQuery, statusFilter, sortItems]);

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter(p => {
      const matchesSearch = p.code.toLowerCase().includes(searchQuery.toLowerCase()) || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.clientOrLocation || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'Todos' || p.estado === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return sortItems(filtered, p => p.clientOrLocation || '');
  }, [projects, searchQuery, statusFilter, sortItems]);

  const filteredProducts = useMemo(() => {
    const filtered = products.filter(p => {
      const matchesSearch = p.code.toLowerCase().includes(searchQuery.toLowerCase()) || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.unit || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'Todos' || p.estado === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return sortItems(filtered, p => p.unit || '');
  }, [products, searchQuery, statusFilter, sortItems]);

  const filteredCustomItems = useMemo(() => {
    const filtered = customAnalysisItems.filter(ci => {
      if (ci.analysisColumnName !== selectedCustomCol) return false;
      const matchesSearch = ci.code.toLowerCase().includes(searchQuery.toLowerCase()) || ci.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'Todos' || ci.estado === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return sortItems(filtered);
  }, [customAnalysisItems, selectedCustomCol, searchQuery, statusFilter, sortItems]);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗂️</span>
            <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Tablas Maestras de Análisis Contables
            </h2>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-xs font-bold font-mono">
              {company.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Catálogos y mantenedores oficiales de Centros de Costos, Ítems de Gasto, Documentos Internos / No SII, Proyectos, Productos y Análisis Personalizados. Estos registros alimentan la validación y selección en comprobantes contables y distribuciones.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSeedStandardCatalogs}
            disabled={isSaving || isReadOnly}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="Precargar registros estándar sugeridos si los catálogos están vacíos"
          >
            <span>⚡</span>
            <span>Carga Inicial Sugerida</span>
          </button>
          <button
            onClick={() => {
              setEditingCostCenter(null);
              setEditingExpenseItem(null);
              setEditingNonSiiDoc(null);
              setEditingProject(null);
              setEditingProduct(null);
              setEditingCustomItem(null);
              setShowNewModal(true);
            }}
            disabled={isReadOnly}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>Nuevo Registro</span>
          </button>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white px-3 pt-2 rounded-t-xl overflow-x-auto gap-1 shadow-2xs">
        <button
          onClick={() => { setActiveTab('costCenters'); setSearchQuery(''); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'costCenters'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🏢</span>
          <span>Centros de Costo</span>
          <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full text-[10px] font-mono font-bold">
            {costCenters.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('expenseItems'); setSearchQuery(''); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'expenseItems'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🏷️</span>
          <span>Ítems de Gasto</span>
          <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full text-[10px] font-mono font-bold">
            {expenseItems.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('nonSiiDocs'); setSearchQuery(''); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'nonSiiDocs'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>📄</span>
          <span>Documentos No SII / Internos</span>
          <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full text-[10px] font-mono font-bold">
            {nonSiiDocTypes.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('projects'); setSearchQuery(''); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'projects'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🏗️</span>
          <span>Proyectos / Obras</span>
          <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full text-[10px] font-mono font-bold">
            {projects.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('products'); setSearchQuery(''); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'products'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>📦</span>
          <span>Productos / Servicios</span>
          <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full text-[10px] font-mono font-bold">
            {products.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('customTables'); setSearchQuery(''); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'customTables'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>⚙️</span>
          <span>Análisis Personalizados ({customCols.length})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Buscar por código, nombre o categoría..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="border border-slate-300 p-2 pl-8 w-full rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-medium"
          />
          <span className="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {activeTab === 'customTables' && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Análisis:</label>
              <select
                value={selectedCustomCol}
                onChange={e => setSelectedCustomCol(e.target.value)}
                className="border border-slate-300 p-1.5 rounded-lg text-xs bg-white font-bold text-indigo-800"
              >
                {customCols.length === 0 && <option value="">Sin análisis creados</option>}
                {customCols.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddColModal(true)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors"
                title="Crear nueva columna / análisis para la empresa"
              >
                + Nuevo Análisis
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-semibold">Ordenar:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="border border-slate-300 p-1.5 rounded-lg text-xs bg-white font-medium"
            >
              <option value="code">Por Código</option>
              <option value="name">Por Nombre (Abecedario)</option>
              <option value="extra">Por Área / Categoría / Uso</option>
              <option value="estado">Por Estado</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 text-xs font-bold transition-colors"
              title="Cambiar orden Ascendente / Descendente"
            >
              {sortOrder === 'asc' ? '▲ ASC' : '▼ DESC'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-semibold">Estado:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="border border-slate-300 p-1.5 rounded-lg text-xs bg-white font-medium"
            >
              <option value="Todos">Todos</option>
              <option value="Activo">Activos</option>
              <option value="Inactivo">Inactivos</option>
            </select>
          </div>
        </div>
      </div>

      {/* CONTENT TABLES ACCORDING TO ACTIVE TAB */}

      {/* 1. CENTROS DE COSTO */}
      {activeTab === 'costCenters' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-32 font-mono">Código</th>
                <th className="p-3">Nombre Centro de Costo</th>
                <th className="p-3 w-48">Área / Nivel</th>
                <th className="p-3 w-28 text-center">Estado</th>
                <th className="p-3 w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCostCenters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No se encontraron Centros de Costo. Haga clic en <strong>"Nuevo Registro"</strong> o <strong>"Carga Inicial Sugerida"</strong>.
                  </td>
                </tr>
              ) : (
                filteredCostCenters.map(cc => (
                  <tr key={cc.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-indigo-700">{cc.code}</td>
                    <td className="p-3 font-semibold text-slate-900">{cc.name}</td>
                    <td className="p-3 text-slate-600">{cc.area || '-'}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleStatus('costCenters', cc.id, cc.estado)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          cc.estado === 'Activo'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        {cc.estado}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => { setEditingCostCenter(cc); setShowNewModal(true); }}
                        className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. ÍTEMS DE GASTO */}
      {activeTab === 'expenseItems' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-32 font-mono">Código</th>
                <th className="p-3">Nombre del Ítem de Gasto</th>
                <th className="p-3 w-48">Categoría / Tipo</th>
                <th className="p-3 w-28 text-center">Estado</th>
                <th className="p-3 w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredExpenseItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No se encontraron Ítems de Gasto registrados.
                  </td>
                </tr>
              ) : (
                filteredExpenseItems.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-orange-700">{exp.code}</td>
                    <td className="p-3 font-semibold text-slate-900">{exp.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                        {exp.category || 'General'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleStatus('expenseItems', exp.id, exp.estado)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          exp.estado === 'Activo'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        {exp.estado}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => { setEditingExpenseItem(exp); setShowNewModal(true); }}
                        className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. DOCUMENTOS NO SII */}
      {activeTab === 'nonSiiDocs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-36 font-mono">Código</th>
                <th className="p-3">Tipo de Documento Interno</th>
                <th className="p-3">Descripción / Uso</th>
                <th className="p-3 w-28 text-center">Estado</th>
                <th className="p-3 w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredNonSiiDocs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No se encontraron Tipos de Documentos Internos / No SII.
                  </td>
                </tr>
              ) : (
                filteredNonSiiDocs.map(docT => (
                  <tr key={docT.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-700">{docT.code}</td>
                    <td className="p-3 font-semibold text-slate-900">{docT.name}</td>
                    <td className="p-3 text-slate-600">{docT.description || '-'}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleStatus('nonSiiDocTypes', docT.id, docT.estado)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          docT.estado === 'Activo'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        {docT.estado}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => { setEditingNonSiiDoc(docT); setShowNewModal(true); }}
                        className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. PROYECTOS / OBRAS */}
      {activeTab === 'projects' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-36 font-mono">Código</th>
                <th className="p-3">Nombre Proyecto / Obra</th>
                <th className="p-3 w-64">Cliente / Ubicación</th>
                <th className="p-3 w-28 text-center">Estado</th>
                <th className="p-3 w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No se encontraron Proyectos u Obras registradas.
                  </td>
                </tr>
              ) : (
                filteredProjects.map(proy => (
                  <tr key={proy.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-teal-700">{proy.code}</td>
                    <td className="p-3 font-semibold text-slate-900">{proy.name}</td>
                    <td className="p-3 text-slate-600">{proy.clientOrLocation || '-'}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleStatus('projects', proy.id, proy.estado)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          proy.estado === 'Activo'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        {proy.estado}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => { setEditingProject(proy); setShowNewModal(true); }}
                        className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. PRODUCTOS / SERVICIOS */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-36 font-mono">Código</th>
                <th className="p-3">Nombre Producto / Servicio</th>
                <th className="p-3 w-32 font-mono">Unidad</th>
                <th className="p-3 w-28 text-center">Estado</th>
                <th className="p-3 w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No se encontraron Productos o Servicios registrados.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-indigo-700">{p.code}</td>
                    <td className="p-3 font-semibold text-slate-900">{p.name}</td>
                    <td className="p-3 font-mono text-slate-600">{p.unit || 'UN'}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleStatus('products', p.id, p.estado)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          p.estado === 'Activo'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        {p.estado}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => { setEditingProduct(p); setShowNewModal(true); }}
                        className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. ANÁLISIS DINÁMICOS / PERSONALIZADOS */}
      {activeTab === 'customTables' && (
        <div className="space-y-3">
          {!selectedCustomCol ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 space-y-3">
              <p className="text-sm font-semibold">Esta empresa no tiene columnas de análisis adicionales configuradas aún.</p>
              <button
                type="button"
                onClick={() => setShowAddColModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                + Crear Primer Análisis Personalizado
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <span>⚙️</span>
                  <span>Tabla de Registros Válidos para: <strong>{selectedCustomCol}</strong></span>
                </span>
                <span className="text-[11px] text-slate-500">
                  {filteredCustomItems.length} registros
                </span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-36 font-mono">Código</th>
                    <th className="p-3">Nombre / Descripción</th>
                    <th className="p-3 w-28 text-center">Estado</th>
                    <th className="p-3 w-28 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCustomItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">
                        No hay registros en la tabla para "{selectedCustomCol}". Haga clic en <strong>"Nuevo Registro"</strong> para agregar valores válidos.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomItems.map(ci => (
                      <tr key={ci.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-slate-800">{ci.code}</td>
                        <td className="p-3 font-semibold text-slate-900">{ci.name}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleToggleStatus('customAnalysisItems', ci.id, ci.estado)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              ci.estado === 'Activo'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-rose-50 text-rose-800 border-rose-300'
                            }`}
                          >
                            {ci.estado}
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => { setEditingCustomItem(ci); setShowNewModal(true); }}
                            className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE / EDIT ITEM */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <span>➕</span>
                <span>
                  {activeTab === 'costCenters' && (editingCostCenter ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo')}
                  {activeTab === 'expenseItems' && (editingExpenseItem ? 'Editar Ítem de Gasto' : 'Nuevo Ítem de Gasto')}
                  {activeTab === 'nonSiiDocs' && (editingNonSiiDoc ? 'Editar Documento Interno' : 'Nuevo Documento No SII / Interno')}
                  {activeTab === 'projects' && (editingProject ? 'Editar Proyecto / Obra' : 'Nuevo Proyecto / Obra')}
                  {activeTab === 'products' && (editingProduct ? 'Editar Producto / Servicio' : 'Nuevo Producto / Servicio')}
                  {activeTab === 'customTables' && (editingCustomItem ? `Editar Registro (${selectedCustomCol})` : `Nuevo Registro para ${selectedCustomCol}`)}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => { setShowNewModal(false); setEditingCostCenter(null); setEditingExpenseItem(null); setEditingNonSiiDoc(null); setEditingProject(null); setEditingProduct(null); setEditingCustomItem(null); }}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* FORM BODY BASED ON TAB */}
            {activeTab === 'costCenters' && (
              <form onSubmit={handleSaveCostCenter} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código del Centro de Costo * {editingCostCenter && <span className="text-[10px] text-amber-700 font-normal ml-1">(El código no es modificable)</span>}
                  </label>
                  <input
                    type="text"
                    name="code"
                    defaultValue={editingCostCenter?.code || ''}
                    placeholder="Ej. CC-ADM, 100, VTAS"
                    required
                    readOnly={Boolean(editingCostCenter)}
                    className={`border border-slate-300 p-2 w-full rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 ${
                      editingCostCenter ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre / Denominación *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingCostCenter?.name || ''}
                    placeholder="Ej. Administración Central, Ventas Santiago"
                    required
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Área / Gerencia / Nivel</label>
                  <input
                    type="text"
                    name="area"
                    defaultValue={editingCostCenter?.area || ''}
                    placeholder="Ej. Gerencia General, Operaciones, Soporte"
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
                  <select
                    name="estado"
                    defaultValue={editingCostCenter?.estado || 'Activo'}
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                  >
                    {isSaving ? 'Guardando...' : 'Guardar Centro de Costo'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'expenseItems' && (
              <form onSubmit={handleSaveExpenseItem} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código del Ítem de Gasto * {editingExpenseItem && <span className="text-[10px] text-amber-700 font-normal ml-1">(El código no es modificable)</span>}
                  </label>
                  <input
                    type="text"
                    name="code"
                    defaultValue={editingExpenseItem?.code || ''}
                    placeholder="Ej. GTO-ARR, GTO-REM, GTO-COM"
                    required
                    readOnly={Boolean(editingExpenseItem)}
                    className={`border border-slate-300 p-2 w-full rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 ${
                      editingExpenseItem ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Gasto *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingExpenseItem?.name || ''}
                    placeholder="Ej. Arriendo Inmueble, Remuneraciones, Combustibles"
                    required
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Categoría / Tipo de Gasto</label>
                  <select
                    name="category"
                    defaultValue={editingExpenseItem?.category || 'Operacional'}
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white"
                  >
                    <option value="Fijo">Gasto Fijo</option>
                    <option value="Variable">Gasto Variable</option>
                    <option value="Operacional">Costo / Gasto Operacional</option>
                    <option value="Administrativo">Gasto Administrativo</option>
                    <option value="No Operacional">Gasto No Operacional / Financiero</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
                  <select
                    name="estado"
                    defaultValue={editingExpenseItem?.estado || 'Activo'}
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                  >
                    {isSaving ? 'Guardando...' : 'Guardar Ítem de Gasto'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'nonSiiDocs' && (
              <form onSubmit={handleSaveNonSiiDoc} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código del Documento * {editingNonSiiDoc && <span className="text-[10px] text-amber-700 font-normal ml-1">(El código no es modificable)</span>}
                  </label>
                  <input
                    type="text"
                    name="code"
                    defaultValue={editingNonSiiDoc?.code || ''}
                    placeholder="Ej. VALE_CAJA, REND_GASTO, REC_INT"
                    required
                    readOnly={Boolean(editingNonSiiDoc)}
                    className={`border border-slate-300 p-2 w-full rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 ${
                      editingNonSiiDoc ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre / Tipo de Documento *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingNonSiiDoc?.name || ''}
                    placeholder="Ej. Vale Provisorio de Caja Chica, Rendición de Gastos"
                    required
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Descripción / Uso</label>
                  <input
                    type="text"
                    name="description"
                    defaultValue={editingNonSiiDoc?.description || ''}
                    placeholder="Ej. Para respaldar gastos internos no tributarios"
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
                  <select
                    name="estado"
                    defaultValue={editingNonSiiDoc?.estado || 'Activo'}
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                  >
                    {isSaving ? 'Guardando...' : 'Guardar Tipo Documento'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'projects' && (
              <form onSubmit={handleSaveProject} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código del Proyecto / Obra * {editingProject && <span className="text-[10px] text-amber-700 font-normal ml-1">(El código no es modificable)</span>}
                  </label>
                  <input
                    type="text"
                    name="code"
                    defaultValue={editingProject?.code || ''}
                    placeholder="Ej. PROY-01, OBRA-NORTE"
                    required
                    readOnly={Boolean(editingProject)}
                    className={`border border-slate-300 p-2 w-full rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 ${
                      editingProject ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Proyecto u Obra *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingProject?.name || ''}
                    placeholder="Ej. Edificio Costanera, Proyecto TI 2026"
                    required
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cliente / Ubicación</label>
                  <input
                    type="text"
                    name="clientOrLocation"
                    defaultValue={editingProject?.clientOrLocation || ''}
                    placeholder="Ej. Minera Escondida / Antofagasta"
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
                  <select
                    name="estado"
                    defaultValue={editingProject?.estado || 'Activo'}
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                  >
                    {isSaving ? 'Guardando...' : 'Guardar Proyecto'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'products' && (
              <form onSubmit={handleSaveProduct} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código del Producto / Servicio * {editingProduct && <span className="text-[10px] text-amber-700 font-normal ml-1">(El código no es modificable)</span>}
                  </label>
                  <input
                    type="text"
                    name="code"
                    defaultValue={editingProduct?.code || ''}
                    placeholder="Ej. PROD-100, SERV-01"
                    required
                    readOnly={Boolean(editingProduct)}
                    className={`border border-slate-300 p-2 w-full rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 ${
                      editingProduct ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre / Detalle *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingProduct?.name || ''}
                    placeholder="Ej. Servicio de Asesoría Mensual"
                    required
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unidad de Medida</label>
                  <input
                    type="text"
                    name="unit"
                    defaultValue={editingProduct?.unit || 'UN'}
                    placeholder="Ej. UN, HRS, MES, KG, GL"
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
                  <select
                    name="estado"
                    defaultValue={editingProduct?.estado || 'Activo'}
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                  >
                    {isSaving ? 'Guardando...' : 'Guardar Producto'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'customTables' && (
              <form onSubmit={handleSaveCustomItem} className="p-5 space-y-4">
                <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900">
                  Registrando valor para la columna de análisis: <strong className="font-mono">{selectedCustomCol}</strong>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código del Registro * {editingCustomItem && <span className="text-[10px] text-amber-700 font-normal ml-1">(El código no es modificable)</span>}
                  </label>
                  <input
                    type="text"
                    name="code"
                    defaultValue={editingCustomItem?.code || ''}
                    placeholder="Ej. SUC-01, ZONA-NORTE, PAT-ABCD12"
                    required
                    readOnly={Boolean(editingCustomItem)}
                    className={`border border-slate-300 p-2 w-full rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 ${
                      editingCustomItem ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre / Descripción *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingCustomItem?.name || ''}
                    placeholder="Ej. Sucursal Las Condes, Zona Austral"
                    required
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
                  <select
                    name="estado"
                    defaultValue={editingCustomItem?.estado || 'Activo'}
                    className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                  >
                    {isSaving ? 'Guardando...' : 'Guardar Registro'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW CUSTOM COLUMN / ANALYSIS DEFINITION */}
      {showAddColModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Crear Nueva Columna / Análisis Contable</h3>
              <button
                type="button"
                onClick={() => setShowAddColModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateNewCustomColumn} className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Al crear un nuevo análisis, este se agregará como una columna de exigibilidad en el Plan de Cuentas y permitirá alimentar su tabla de valores válidos.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Análisis (Ej. SUCURSAL, ZONA, VEHICULO, FAENA) *
                </label>
                <input
                  type="text"
                  value={newColNameInput}
                  onChange={e => setNewColNameInput(e.target.value)}
                  placeholder="Ej. SUCURSAL"
                  required
                  className="border border-slate-300 p-2 w-full rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddColModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Crear Análisis y Tabla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
