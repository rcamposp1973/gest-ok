import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowDownRight, 
  ArrowUpRight, 
  Boxes, 
  Wrench, 
  FileSpreadsheet, 
  Download, 
  RefreshCw, 
  Tag, 
  DollarSign, 
  Building2, 
  SlidersHorizontal,
  X
} from 'lucide-react';
import { ProductService, ChartOfAccount, InventoryMovement, CostCenterMaster, ExpenseItemMaster } from '../types';

interface ProductsServicesViewProps {
  companyId: string;
  companyName: string;
  accounts: ChartOfAccount[];
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
  products?: ProductService[];
  onProductsChange?: (items: ProductService[]) => void;
  isReadOnly?: boolean;
}

export const ProductsServicesView: React.FC<ProductsServicesViewProps> = ({
  companyId,
  companyName,
  accounts,
  costCenters = [],
  expenseItems = [],
  products: initialProducts,
  onProductsChange,
  isReadOnly = false
}) => {
  // Mock/Local initial state for demo & Firestore sync
  const [items, setItems] = useState<ProductService[]>(initialProducts && initialProducts.length > 0 ? initialProducts : [
    {
      id: 'prod-1',
      companyId,
      code: 'SRV-CONS-01',
      name: 'Asesoría y Consultoría Contable Mensual',
      type: 'SERVICE',
      unitOfMeasure: 'HRS',
      salesPrice: 250000,
      purchaseCost: 0,
      salesAccountId: accounts.find(a => a.code.startsWith('41') || a.name.toLowerCase().includes('servicio'))?.id || '',
      purchaseAccountId: accounts.find(a => a.code.startsWith('51') || a.name.toLowerCase().includes('honorario'))?.id || '',
      defaultCostCenterId: 'CC-ADM',
      defaultItemGastoId: 'SERV-PROF',
      currentStock: 0,
      minStock: 0,
      allowNegativeStock: true,
      category: 'Servicios Profesionales',
      estado: 'Activo'
    },
    {
      id: 'prod-2',
      companyId,
      code: 'PROD-RES-01',
      name: 'Resma Papel Carta 75g (Caja 5 unidades)',
      type: 'PRODUCT',
      unitOfMeasure: 'UN',
      salesPrice: 24990,
      purchaseCost: 16500,
      salesAccountId: accounts.find(a => a.code.startsWith('41') || a.name.toLowerCase().includes('venta'))?.id || '',
      purchaseAccountId: accounts.find(a => a.code.startsWith('1106') || a.code.startsWith('51') || a.name.toLowerCase().includes('mercader'))?.id || '',
      defaultCostCenterId: 'CC-OP',
      defaultItemGastoId: 'INSUMOS-OF',
      currentStock: 38,
      minStock: 15,
      allowNegativeStock: false,
      category: 'Librería & Oficina',
      estado: 'Activo'
    },
    {
      id: 'prod-3',
      companyId,
      code: 'PROD-TON-BLK',
      name: 'Toner Láser Negro Alta Capacidad',
      type: 'PRODUCT',
      unitOfMeasure: 'UN',
      salesPrice: 79900,
      purchaseCost: 52000,
      salesAccountId: accounts.find(a => a.code.startsWith('41'))?.id || '',
      purchaseAccountId: accounts.find(a => a.code.startsWith('1106') || a.code.startsWith('51'))?.id || '',
      defaultCostCenterId: 'CC-OP',
      defaultItemGastoId: 'INSUMOS-COMP',
      currentStock: 4,
      minStock: 10,
      allowNegativeStock: false,
      category: 'Insumos Computación',
      estado: 'Activo'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PRODUCT' | 'SERVICE'>('ALL');
  const [filterStockStatus, setFilterStockStatus] = useState<'ALL' | 'LOW_STOCK' | 'NORMAL'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductService | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<ProductService>>({
    code: '',
    name: '',
    type: 'PRODUCT',
    unitOfMeasure: 'UN',
    salesPrice: 0,
    purchaseCost: 0,
    salesAccountId: '',
    purchaseAccountId: '',
    defaultCostCenterId: '',
    defaultItemGastoId: '',
    currentStock: 0,
    minStock: 5,
    allowNegativeStock: false,
    category: 'General',
    estado: 'Activo'
  });

  // Derived metrics
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = 
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesType = filterType === 'ALL' || item.type === filterType;
      
      let matchesStock = true;
      if (filterStockStatus === 'LOW_STOCK') {
        matchesStock = item.type === 'PRODUCT' && item.currentStock <= item.minStock;
      } else if (filterStockStatus === 'NORMAL') {
        matchesStock = item.type !== 'PRODUCT' || item.currentStock > item.minStock;
      }

      return matchesSearch && matchesType && matchesStock;
    });
  }, [items, searchTerm, filterType, filterStockStatus]);

  const stats = useMemo(() => {
    const totalProducts = items.filter(i => i.type === 'PRODUCT').length;
    const totalServices = items.filter(i => i.type === 'SERVICE').length;
    const lowStockCount = items.filter(i => i.type === 'PRODUCT' && i.currentStock <= i.minStock).length;
    const inventoryValuation = items
      .filter(i => i.type === 'PRODUCT')
      .reduce((sum, i) => sum + (i.currentStock * i.purchaseCost), 0);

    return { totalProducts, totalServices, lowStockCount, inventoryValuation };
  }, [items]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      code: '',
      name: '',
      type: 'PRODUCT',
      unitOfMeasure: 'UN',
      salesPrice: 0,
      purchaseCost: 0,
      salesAccountId: accounts.find(a => a.type === 'Ingreso' || a.code.startsWith('4'))?.id || '',
      purchaseAccountId: accounts.find(a => a.type === 'Gasto' || a.code.startsWith('1106') || a.code.startsWith('5'))?.id || '',
      defaultCostCenterId: '',
      defaultItemGastoId: '',
      currentStock: 0,
      minStock: 5,
      allowNegativeStock: false,
      category: 'General',
      estado: 'Activo'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ProductService) => {
    setEditingItem(item);
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este ítem del catálogo?')) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      alert('Por favor ingresa al menos el código/SKU y la descripción del producto o servicio.');
      return;
    }

    if (editingItem) {
      setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...formData } as ProductService : i));
    } else {
      const newItem: ProductService = {
        ...formData as ProductService,
        id: `prod-${Date.now()}`,
        companyId,
        createdAt: new Date().toISOString()
      };
      setItems(prev => [newItem, ...prev]);
    }
    setIsModalOpen(false);
  };

  const formatCLP = (val: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">Catálogo de Productos, Servicios & Control de Stock</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Empresa: <strong className="text-slate-700">{companyName}</strong> — Maestro para facturación DTE, imputaciones contables automáticas y control de existencias.
          </p>
        </div>

        {!isReadOnly && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Producto / Servicio</span>
          </button>
        )}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Productos Físicos</span>
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.totalProducts}</div>
          <p className="text-[11px] text-slate-500 mt-1">Mueven inventario & Kardex</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Servicios / Intangibles</span>
            <Wrench className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.totalServices}</div>
          <p className="text-[11px] text-slate-500 mt-1">Facturación directa sin stock</p>
        </div>

        <div className={`p-4 rounded-xl border shadow-2xs ${stats.lowStockCount > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Alerta Stock Bajo</span>
            <AlertTriangle className={`w-5 h-5 ${stats.lowStockCount > 0 ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-2">{stats.lowStockCount}</div>
          <p className="text-[11px] text-amber-700 mt-1">Ítems con stock ≤ mínimo</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Valorización de Stock (PMP)</span>
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-2">{formatCLP(stats.inventoryValuation)}</div>
          <p className="text-[11px] text-slate-500 mt-1">Costo neto en existencias</p>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por SKU, nombre, categoría..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${filterType === 'ALL' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Todos ({items.length})
            </button>
            <button
              onClick={() => setFilterType('PRODUCT')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${filterType === 'PRODUCT' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Productos ({stats.totalProducts})
            </button>
            <button
              onClick={() => setFilterType('SERVICE')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${filterType === 'SERVICE' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Servicios ({stats.totalServices})
            </button>
          </div>

          <button
            onClick={() => setFilterStockStatus(prev => prev === 'ALL' ? 'LOW_STOCK' : 'ALL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-semibold transition-colors ${
              filterStockStatus === 'LOW_STOCK' 
                ? 'bg-amber-100 border-amber-300 text-amber-900' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Solo Quiebre / Bajo Stock</span>
          </button>
        </div>
      </div>

      {/* ITEMS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">SKU / Código</th>
                <th className="py-3 px-4">Descripción & Categoría</th>
                <th className="py-3 px-4">Tipo & Unidad</th>
                <th className="py-3 px-4 text-right">Precio Venta (Neto)</th>
                <th className="py-3 px-4 text-right">Costo / PMP</th>
                <th className="py-3 px-4 text-center">Stock Actual</th>
                <th className="py-3 px-4">Imputación Contable</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No se encontraron productos o servicios que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const isLow = item.type === 'PRODUCT' && item.currentStock <= item.minStock;
                  const salesAcc = accounts.find(a => a.id === item.salesAccountId);
                  const purchaseAcc = accounts.find(a => a.id === item.purchaseAccountId);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {item.code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        {item.category && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Tag className="w-2.5 h-2.5 text-slate-400" />
                            <span>{item.category}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {item.type === 'PRODUCT' ? (
                            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                              PRODUCTO
                            </span>
                          ) : (
                            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                              SERVICIO
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.unitOfMeasure}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800 font-mono">
                        {formatCLP(item.salesPrice)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 font-mono">
                        {item.purchaseCost > 0 ? formatCLP(item.purchaseCost) : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.type === 'PRODUCT' ? (
                          <div className="inline-flex flex-col items-center">
                            <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-full ${
                              isLow 
                                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}>
                              {item.currentStock} {item.unitOfMeasure}
                            </span>
                            <span className="text-[9px] text-slate-400 mt-0.5">Mín: {item.minStock}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">N/A (Servicio)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[11px]">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-emerald-700">
                            <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                            <span className="truncate max-w-[150px]" title={salesAcc ? `${salesAcc.code} - ${salesAcc.name}` : 'Sin cuenta asignada'}>
                              {salesAcc ? `${salesAcc.code} ${salesAcc.name}` : 'Sin asignar (Ingreso)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-600">
                            <ArrowDownRight className="w-3 h-3 text-amber-500" />
                            <span className="truncate max-w-[150px]" title={purchaseAcc ? `${purchaseAcc.code} - ${purchaseAcc.name}` : 'Sin cuenta asignada'}>
                              {purchaseAcc ? `${purchaseAcc.code} ${purchaseAcc.name}` : 'Sin asignar (Gasto/Costo)'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {!isReadOnly && (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="Editar Ítem"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar Ítem"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {editingItem ? 'Editar Producto / Servicio' : 'Nuevo Producto / Servicio'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Tipo y SKU */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo de Ítem *</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as 'PRODUCT' | 'SERVICE' })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="PRODUCT">📦 PRODUCTO (Mueve Stock/Kardex)</option>
                    <option value="SERVICE">🛠️ SERVICIO (Sin Inventario)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código / SKU *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: PROD-001 / SRV-01"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidad de Medida *</label>
                  <select
                    value={formData.unitOfMeasure}
                    onChange={e => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="UN">UN - Unidad</option>
                    <option value="HRS">HRS - Horas</option>
                    <option value="GL">GL - Global</option>
                    <option value="KG">KG - Kilogramos</option>
                    <option value="M">M - Metros</option>
                    <option value="LT">LT - Litros</option>
                    <option value="CJ">CJ - Caja</option>
                  </select>
                </div>
              </div>

              {/* Nombre y Categoría */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Descripción / Nombre Oficial *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: Resma Papel Carta 75g"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <input
                    type="text"
                    placeholder="ej: Librería / Servicios"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Precios */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Precios y Costos (Valores Netos en CLP)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Precio Venta (Neto)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.salesPrice}
                      onChange={e => setFormData({ ...formData, salesPrice: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Costo Compra / PMP (Neto)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.purchaseCost}
                      onChange={e => setFormData({ ...formData, purchaseCost: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Imputación Contable */}
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <h4 className="font-bold text-indigo-900 mb-2 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Imputación Contable Automática en Vouchers</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cuenta Ingreso (Ventas)</label>
                    <select
                      value={formData.salesAccountId}
                      onChange={e => setFormData({ ...formData, salesAccountId: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Seleccionar Cuenta de Ingreso --</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cuenta Gasto/Activo (Compras)</label>
                    <select
                      value={formData.purchaseAccountId}
                      onChange={e => setFormData({ ...formData, purchaseAccountId: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Seleccionar Cuenta de Gasto/Existencia --</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Centro de Costo por Defecto</label>
                    <select
                      value={formData.defaultCostCenterId}
                      onChange={e => setFormData({ ...formData, defaultCostCenterId: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Sin Centro de Costo --</option>
                      {costCenters.length > 0 ? (
                        costCenters.map(cc => (
                          <option key={cc.id} value={cc.code}>
                            {cc.code} - {cc.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="CC-ADM">CC-ADM - Administración Central</option>
                          <option value="CC-OP">CC-OP - Operaciones</option>
                          <option value="CC-VTAS">CC-VTAS - Ventas y Comercial</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Clasificador / Ítem de Gasto por Defecto</label>
                    <select
                      value={formData.defaultItemGastoId}
                      onChange={e => setFormData({ ...formData, defaultItemGastoId: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Sin Ítem de Gasto --</option>
                      {expenseItems.length > 0 ? (
                        expenseItems.map(item => (
                          <option key={item.id} value={item.code}>
                            {item.code} - {item.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="SERV-PROF">SERV-PROF - Servicios Profesionales</option>
                          <option value="INSUMOS-OF">INSUMOS-OF - Insumos de Oficina</option>
                          <option value="INSUMOS-COMP">INSUMOS-COMP - Insumos Computacionales</option>
                          <option value="ARRIENDO">ARRIENDO - Arriendos y Operaciones</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

              </div>

              {/* Control de Inventario (si es PRODUCT) */}
              {formData.type === 'PRODUCT' && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 animate-fadeIn">
                  <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-blue-600" />
                    <span>Parámetros de Stock y Kardex</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Stock Actual</label>
                      <input
                        type="number"
                        value={formData.currentStock}
                        onChange={e => setFormData({ ...formData, currentStock: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Stock Mínimo (Alerta)</label>
                      <input
                        type="number"
                        value={formData.minStock}
                        onChange={e => setFormData({ ...formData, minStock: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        id="allowNegative"
                        checked={formData.allowNegativeStock}
                        onChange={e => setFormData({ ...formData, allowNegativeStock: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                      />
                      <label htmlFor="allowNegative" className="font-semibold text-slate-700">
                        Permitir Stock Negativo
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs transition-colors"
                >
                  {editingItem ? 'Guardar Cambios' : 'Crear Ítem en Catálogo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
