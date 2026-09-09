import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Package,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  Calendar,
  Search,
  Filter,
  Layers,
  FileText,
  DollarSign,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Download,
  Clock,
  ChevronRight,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { ProductService, InventoryMovement, ChartOfAccount } from '../types';

interface StockKardexViewProps {
  companyId: string;
  companyName: string;
  products: ProductService[];
  movements: InventoryMovement[];
  accounts: ChartOfAccount[];
  isReadOnly?: boolean;
}

export const StockKardexView: React.FC<StockKardexViewProps> = ({
  companyId,
  companyName,
  products,
  movements,
  accounts,
  isReadOnly = false
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUSTMENT'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Filtrar solo productos físicos para Kardex
  const physicalProducts = useMemo(() => {
    return products.filter(p => p.type === 'PRODUCT');
  }, [products]);

  // Movimientos filtrados
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const matchesProduct = selectedProductId === 'ALL' || m.productId === selectedProductId;
      const matchesType = movementTypeFilter === 'ALL' || m.type === movementTypeFilter;
      const matchesSearch =
        m.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.documentNumber && m.documentNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.rutContraparte && m.rutContraparte.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.razonSocialContraparte && m.razonSocialContraparte.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesProduct && matchesType && matchesSearch;
    });
  }, [movements, selectedProductId, movementTypeFilter, searchTerm]);

  // Estadísticas globales de inventario
  const totalStockUnits = useMemo(() => {
    return physicalProducts.reduce((sum, p) => sum + p.currentStock, 0);
  }, [physicalProducts]);

  const totalInventoryValuation = useMemo(() => {
    return physicalProducts.reduce((sum, p) => sum + (p.currentStock * p.purchaseCost), 0);
  }, [physicalProducts]);

  const lowStockCount = useMemo(() => {
    return physicalProducts.filter(p => p.currentStock <= p.minStock).length;
  }, [physicalProducts]);

  const formatCLP = (val: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);
  };

  const selectedProductObj = physicalProducts.find(p => p.id === selectedProductId);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">Kardex de Inventario & Valorización PMP</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Empresa: <strong className="text-slate-700">{companyName}</strong> — Control físico y valorizado bajo método Precio Medio Ponderado (PMP / CPP).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg border border-indigo-200">
            Norma Tributaria Art. 30 LIR (CPP / PMP)
          </span>
        </div>
      </div>

      {/* STATS DE INVENTARIO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Productos en Bodega</span>
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{physicalProducts.length} SKU</div>
          <p className="text-[11px] text-slate-500 mt-1">Catálogo con control de stock</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unidades Totales</span>
            <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-900 mt-2">{totalStockUnits.toLocaleString('es-CL')}</div>
          <p className="text-[11px] text-slate-500 mt-1">Existencias físicas consolidadas</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Valorización Total PMP</span>
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">{formatCLP(totalInventoryValuation)}</div>
          <p className="text-[11px] text-slate-500 mt-1">Activo Contable (Cta. 110601)</p>
        </div>

        <div className={`p-4 rounded-xl border shadow-2xs ${lowStockCount > 0 ? 'bg-amber-50/80 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900 uppercase tracking-wider">Alertas Stock Mínimo</span>
            <AlertTriangle className={`w-5 h-5 ${lowStockCount > 0 ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-2">{lowStockCount} Ítems</div>
          <p className="text-[11px] text-amber-700 mt-1">Existencias bajo punto de reorden</p>
        </div>
      </div>

      {/* FILTROS Y SELECTOR DE PRODUCTO */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Seleccionar Producto / SKU</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">-- Ver Movimientos de Todos los Productos --</option>
              {physicalProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name} (Stock: {p.currentStock} {p.unitOfMeasure} | PMP: {formatCLP(p.purchaseCost)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Movimiento</label>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setMovementTypeFilter('ALL')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${movementTypeFilter === 'ALL' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setMovementTypeFilter('IN')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${movementTypeFilter === 'IN' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Entradas (Compras)
              </button>
              <button
                onClick={() => setMovementTypeFilter('OUT')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${movementTypeFilter === 'OUT' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Salidas (Ventas)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Búsqueda Rápida</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="N° Doc, RUT, Proveedor, SKU..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Ficha Resumen si hay producto seleccionado */}
        {selectedProductObj && (
          <div className="mt-3 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-mono font-bold text-sm">
                {selectedProductObj.unitOfMeasure}
              </div>
              <div>
                <div className="font-bold text-indigo-950 text-sm">{selectedProductObj.name}</div>
                <div className="text-indigo-700 font-mono text-[11px]">SKU: {selectedProductObj.code} | Categoría: {selectedProductObj.category || 'General'}</div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-[10px] text-indigo-700 uppercase block font-semibold">Stock Actual</span>
                <span className="font-mono font-bold text-base text-indigo-900">
                  {selectedProductObj.currentStock} {selectedProductObj.unitOfMeasure}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-indigo-700 uppercase block font-semibold">Costo PMP Actual</span>
                <span className="font-mono font-bold text-base text-emerald-700">
                  {formatCLP(selectedProductObj.purchaseCost)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-indigo-700 uppercase block font-semibold">Valor Total Stock</span>
                <span className="font-mono font-bold text-base text-slate-900">
                  {formatCLP(selectedProductObj.currentStock * selectedProductObj.purchaseCost)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TABLA DE KARDEX DETALLADO */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span>Historial Cronológico de Movimientos de Kardex</span>
          </h3>
          <span className="text-[11px] font-semibold text-slate-500">
            {filteredMovements.length} registro(s) encontrado(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Tipo & Documento</th>
                <th className="py-3 px-4">Producto / SKU</th>
                <th className="py-3 px-4">Contraparte / RUT</th>
                <th className="py-3 px-4 text-right">Cantidad</th>
                <th className="py-3 px-4 text-right">Costo Unit. (PMP)</th>
                <th className="py-3 px-4 text-right">Costo Total</th>
                <th className="py-3 px-4 text-center">Stock Resultante</th>
                <th className="py-3 px-4 text-center">Asiento Contable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No se registran movimientos en el Kardex para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map(mov => {
                  const isEntry = mov.type === 'IN';
                  return (
                    <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {mov.date}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {isEntry ? (
                            <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <TrendingDown className="w-3 h-3 text-emerald-600" />
                              <span>ENTRADA</span>
                            </span>
                          ) : (
                            <span className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-blue-600" />
                              <span>SALIDA</span>
                            </span>
                          )}
                          <span className="font-semibold text-slate-700">
                            {mov.movementReason} {mov.documentNumber ? `#${mov.documentNumber}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{mov.productName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{mov.productCode}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {mov.rutContraparte ? (
                          <div>
                            <div className="font-semibold text-slate-900 truncate max-w-[140px]">{mov.razonSocialContraparte || 'Contraparte'}</div>
                            <div className="font-mono text-[10px] text-slate-400">{mov.rutContraparte}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Interno</span>
                        )}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${isEntry ? 'text-emerald-700' : 'text-blue-700'}`}>
                        {isEntry ? `+${mov.quantity}` : `-${mov.quantity}`}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {formatCLP(mov.unitCost)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCLP(mov.totalCost)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                          {mov.resultingStock} UN
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {mov.voucherId ? (
                          <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded border border-indigo-200">
                            Voucher #{mov.voucherId.slice(-4)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Automático</span>
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
    </div>
  );
};
