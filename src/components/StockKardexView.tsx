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
  Tag,
  Plus,
  Warehouse as WarehouseIcon,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { ProductService, InventoryMovement, ChartOfAccount, Warehouse, Voucher } from '../types';

interface StockKardexViewProps {
  companyId: string;
  companyName: string;
  products: ProductService[];
  movements: InventoryMovement[];
  accounts: ChartOfAccount[];
  warehouses?: Warehouse[];
  onSaveMovement?: (
    mov: Partial<InventoryMovement>,
    targetMov?: Partial<InventoryMovement>,
    autoVoucher?: Partial<Voucher>
  ) => Promise<void>;
  isReadOnly?: boolean;
}

export const StockKardexView: React.FC<StockKardexViewProps> = ({
  companyId,
  companyName,
  products,
  movements,
  accounts,
  warehouses = [],
  onSaveMovement,
  isReadOnly = false
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('ALL');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUSTMENT'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal para Nuevo Movimiento / Ajuste Manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State para Movimiento Manual
  const [formProdId, setFormProdId] = useState<string>('');
  const [formReason, setFormReason] = useState<
    'APERTURA' | 'AJUSTE_INVENTARIO' | 'MERMA' | 'CONSUMO_INTERNO' | 'TRASPASO_BODEGA' | 'COMPRA' | 'DEVOLUCION'
  >('AJUSTE_INVENTARIO');
  const [formWhId, setFormWhId] = useState<string>('');
  const [formTargetWhId, setFormTargetWhId] = useState<string>('');
  const [formQty, setFormQty] = useState<number>(1);
  const [formUnitCost, setFormUnitCost] = useState<number>(0);
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formDocRef, setFormDocRef] = useState<string>('');
  const [formObservations, setFormObservations] = useState<string>('');
  const [generateVoucher, setGenerateVoucher] = useState<boolean>(true);

  // Filtrar solo productos físicos para Kardex
  const physicalProducts = useMemo(() => {
    return products.filter(p => p.type === 'PRODUCT');
  }, [products]);

  // Movimientos filtrados
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const matchesProduct = selectedProductId === 'ALL' || m.productId === selectedProductId;
      const matchesWarehouse =
        selectedWarehouseId === 'ALL' ||
        m.warehouseId === selectedWarehouseId ||
        m.targetWarehouseId === selectedWarehouseId;
      const matchesType = movementTypeFilter === 'ALL' || m.type === movementTypeFilter;
      const matchesSearch =
        m.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.documentNumber && m.documentNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.warehouseName && m.warehouseName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.observations && m.observations.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.rutContraparte && m.rutContraparte.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.razonSocialContraparte && m.razonSocialContraparte.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesProduct && matchesWarehouse && matchesType && matchesSearch;
    });
  }, [movements, selectedProductId, selectedWarehouseId, movementTypeFilter, searchTerm]);

  // Estadísticas globales de inventario
  const totalStockUnits = useMemo(() => {
    return physicalProducts.reduce((sum, p) => sum + (p.currentStock || 0), 0);
  }, [physicalProducts]);

  const totalInventoryValuation = useMemo(() => {
    return physicalProducts.reduce((sum, p) => sum + ((p.currentStock || 0) * (p.purchaseCost || 0)), 0);
  }, [physicalProducts]);

  const lowStockCount = useMemo(() => {
    return physicalProducts.filter(p => (p.currentStock || 0) <= (p.minStock || 0)).length;
  }, [physicalProducts]);

  const formatCLP = (val: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);
  };

  const selectedProductObj = physicalProducts.find(p => p.id === selectedProductId);

  // Abrir modal de nuevo movimiento
  const handleOpenModal = () => {
    const defaultWh = warehouses.find(w => w.isDefault)?.id || (warehouses.length > 0 ? warehouses[0].id : '');
    const defaultProd = selectedProductId !== 'ALL' ? selectedProductId : (physicalProducts.length > 0 ? physicalProducts[0].id : '');
    const prodObj = physicalProducts.find(p => p.id === defaultProd);

    setFormProdId(defaultProd);
    setFormWhId(defaultWh);
    setFormTargetWhId(warehouses.find(w => w.id !== defaultWh)?.id || '');
    setFormQty(1);
    setFormUnitCost(prodObj ? prodObj.purchaseCost : 0);
    setFormReason('AJUSTE_INVENTARIO');
    setFormDocRef(`AJUSTE-${Date.now().toString().slice(-4)}`);
    setFormObservations('');
    setGenerateVoucher(true);
    setIsModalOpen(true);
  };

  // Al cambiar el producto en el form, actualizar el costo sugerido
  const handleProductFormChange = (prodId: string) => {
    setFormProdId(prodId);
    const prod = physicalProducts.find(p => p.id === prodId);
    if (prod) {
      setFormUnitCost(prod.purchaseCost || 0);
    }
  };

  // Enviar movimiento manual
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProdId) {
      alert('Selecciona un producto para el movimiento.');
      return;
    }
    if (formQty <= 0) {
      alert('La cantidad debe ser mayor a 0.');
      return;
    }
    if (formReason === 'TRASPASO_BODEGA' && (!formWhId || !formTargetWhId || formWhId === formTargetWhId)) {
      alert('Para un traspaso debes seleccionar una bodega de origen y una bodega de destino distintas.');
      return;
    }

    const prod = physicalProducts.find(p => p.id === formProdId);
    if (!prod) return;

    const sourceWh = warehouses.find(w => w.id === formWhId);
    const targetWh = warehouses.find(w => w.id === formTargetWhId);

    // Determinar tipo de movimiento físico
    let movType: 'IN' | 'OUT' | 'ADJUSTMENT' = 'ADJUSTMENT';
    if (formReason === 'COMPRA' || formReason === 'APERTURA') {
      movType = 'IN';
    } else if (formReason === 'MERMA' || formReason === 'CONSUMO_INTERNO') {
      movType = 'OUT';
    } else if (formReason === 'TRASPASO_BODEGA') {
      movType = 'OUT'; // Para la bodega origen es salida
    }

    // Calcular nuevo stock consolidado
    const prevStock = prod.currentStock || 0;
    const qtyChange = movType === 'IN' ? formQty : (movType === 'OUT' ? -formQty : formQty);
    const resultingStock = Math.max(0, prevStock + qtyChange);

    // Calcular nuevo PMP si es entrada valorizada
    let resultingUnitCost = prod.purchaseCost || 0;
    if (movType === 'IN' && formUnitCost > 0) {
      const prevTotalVal = prevStock * (prod.purchaseCost || 0);
      const addedVal = formQty * formUnitCost;
      const newTotalQty = prevStock + formQty;
      resultingUnitCost = newTotalQty > 0 ? Math.round((prevTotalVal + addedVal) / newTotalQty) : formUnitCost;
    }

    const mainMovement: Partial<InventoryMovement> = {
      companyId,
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      date: formDate,
      type: movType,
      movementReason: formReason,
      quantity: formQty,
      unitCost: formUnitCost > 0 ? formUnitCost : (prod.purchaseCost || 0),
      totalCost: formQty * (formUnitCost > 0 ? formUnitCost : (prod.purchaseCost || 0)),
      previousStock: prevStock,
      resultingStock,
      warehouseId: sourceWh?.id || formWhId || undefined,
      warehouseName: sourceWh?.name || 'Bodega Central',
      documentNumber: formDocRef,
      documentType: formReason,
      observations: formObservations || `Registro manual de inventario: ${formReason}`,
      createdAt: new Date().toISOString()
    };

    // Movimiento complementario de entrada para la bodega de destino si es traspaso
    let targetMovement: Partial<InventoryMovement> | undefined = undefined;
    if (formReason === 'TRASPASO_BODEGA' && targetWh) {
      targetMovement = {
        companyId,
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        date: formDate,
        type: 'IN',
        movementReason: 'TRASPASO_BODEGA',
        quantity: formQty,
        unitCost: mainMovement.unitCost || 0,
        totalCost: mainMovement.totalCost || 0,
        previousStock: prevStock,
        resultingStock: prevStock, // el total consolidado no cambia
        warehouseId: targetWh.id,
        warehouseName: targetWh.name,
        targetWarehouseId: sourceWh?.id,
        targetWarehouseName: sourceWh?.name,
        documentNumber: formDocRef,
        documentType: 'TRASPASO_BODEGA',
        observations: `Entrada por traspaso desde ${sourceWh?.name || 'Bodega Origen'}`,
        createdAt: new Date().toISOString()
      };
    }

    // Preparar asiento contable automático si está activado
    let autoVoucher: Partial<Voucher> | undefined = undefined;
    if (generateVoucher && formReason !== 'TRASPASO_BODEGA') {
      const invAcc = accounts.find(a => a.code.startsWith('1106') || a.name.toLowerCase().includes('mercader')) || accounts[0];
      const costTotal = (mainMovement.totalCost || 0);

      if (formReason === 'MERMA') {
        const mermaAcc = accounts.find(a => a.code.startsWith('52') || a.name.toLowerCase().includes('merma') || a.name.toLowerCase().includes('extraord')) || accounts.find(a => a.type === 'Gasto') || accounts[0];
        autoVoucher = {
          date: formDate,
          type: 'Traspaso',
          gloss: `Merma de Inventario SKU ${prod.code} (${formQty} ${prod.unitOfMeasure}) - Doc ${formDocRef}`,
          lines: [
            {
              id: 'l1',
              accountId: mermaAcc.id,
              accountCode: mermaAcc.code,
              accountName: mermaAcc.name,
              debit: costTotal,
              credit: 0,
              gloss: `Pérdida por merma/deterioro de existencias`
            },
            {
              id: 'l2',
              accountId: invAcc.id,
              accountCode: invAcc.code,
              accountName: invAcc.name,
              debit: 0,
              credit: costTotal,
              gloss: `Rebaja inventario por merma`
            }
          ]
        };
      } else if (formReason === 'CONSUMO_INTERNO') {
        const expenseAcc = accounts.find(a => a.code.startsWith('51') || a.name.toLowerCase().includes('insumo') || a.name.toLowerCase().includes('operac')) || accounts.find(a => a.type === 'Gasto') || accounts[0];
        autoVoucher = {
          date: formDate,
          type: 'Traspaso',
          gloss: `Consumo Interno de Existencias SKU ${prod.code} (${formQty} ${prod.unitOfMeasure})`,
          lines: [
            {
              id: 'l1',
              accountId: expenseAcc.id,
              accountCode: expenseAcc.code,
              accountName: expenseAcc.name,
              debit: costTotal,
              credit: 0,
              gloss: `Gasto por consumo interno de materiales`
            },
            {
              id: 'l2',
              accountId: invAcc.id,
              accountCode: invAcc.code,
              accountName: invAcc.name,
              debit: 0,
              credit: costTotal,
              gloss: `Rebaja inventario por consumo`
            }
          ]
        };
      } else if (formReason === 'APERTURA') {
        const capitalAcc = accounts.find(a => a.code.startsWith('3101') || a.name.toLowerCase().includes('capital') || a.name.toLowerCase().includes('patrimonio')) || accounts[0];
        autoVoucher = {
          date: formDate,
          type: 'Traspaso',
          gloss: `Inventario Inicial Apertura SKU ${prod.code} (${formQty} ${prod.unitOfMeasure})`,
          lines: [
            {
              id: 'l1',
              accountId: invAcc.id,
              accountCode: invAcc.code,
              accountName: invAcc.name,
              debit: costTotal,
              credit: 0,
              gloss: `Carga inventario inicial`
            },
            {
              id: 'l2',
              accountId: capitalAcc.id,
              accountCode: capitalAcc.code,
              accountName: capitalAcc.name,
              debit: 0,
              credit: costTotal,
              gloss: `Aporte inicial existencias`
            }
          ]
        };
      }
    }

    setIsSubmitting(true);
    try {
      if (onSaveMovement) {
        await onSaveMovement(mainMovement, targetMovement, autoVoucher);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(`Error al registrar movimiento: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Exportar Kardex a CSV
  const handleExportKardexCSV = () => {
    if (filteredMovements.length === 0) {
      alert('No hay movimientos en el Kardex para exportar.');
      return;
    }

    const headers = [
      'Fecha',
      'Tipo_Movimiento',
      'Motivo',
      'N_Documento',
      'Bodega',
      'Codigo_SKU',
      'Descripcion_Producto',
      'RUT_Contraparte',
      'Razon_Social_Contraparte',
      'Entrada_Cantidad',
      'Salida_Cantidad',
      'Costo_Unitario_PMP',
      'Costo_Total',
      'Stock_Resultante',
      'Voucher_Asociado',
      'Observaciones'
    ];

    const rows = filteredMovements.map(m => {
      const isEntry = m.type === 'IN';
      return [
        m.date,
        m.type,
        m.movementReason,
        m.documentNumber || '',
        m.warehouseName || 'Bodega Central',
        `"${m.productCode.replace(/"/g, '""')}"`,
        `"${m.productName.replace(/"/g, '""')}"`,
        m.rutContraparte || '',
        `"${(m.razonSocialContraparte || '').replace(/"/g, '""')}"`,
        isEntry ? m.quantity : 0,
        !isEntry ? m.quantity : 0,
        m.unitCost,
        m.totalCost,
        m.resultingStock,
        m.voucherId || '',
        `"${(m.observations || '').replace(/"/g, '""')}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Kardex_Inventario_PMP_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">Kardex de Inventario & Valorización PMP Multi-Bodega</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Empresa: <strong className="text-slate-700">{companyName}</strong> — Control físico y valorizado bajo método Precio Medio Ponderado (PMP / CPP) según Art. 30 LIR.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportKardexCSV}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all"
            title="Exportar Kardex a CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Exportar CSV</span>
          </button>

          {!isReadOnly && (
            <button
              onClick={handleOpenModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Movimiento / Ajuste</span>
            </button>
          )}
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
          <p className="text-[11px] text-slate-500 mt-1">Catálogo físico con control de stock</p>
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

      {/* FILTROS Y SELECTOR DE PRODUCTO Y BODEGA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Seleccionar Producto / SKU</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">-- Ver Todos los Productos --</option>
              {physicalProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name} (Stock: {p.currentStock} {p.unitOfMeasure} | PMP: {formatCLP(p.purchaseCost)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Filtrar por Bodega</label>
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">-- Todas las Bodegas --</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.code} - {w.name} {w.isDefault ? '(Principal)' : ''}
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
                Entradas
              </button>
              <button
                onClick={() => setMovementTypeFilter('OUT')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${movementTypeFilter === 'OUT' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Salidas
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Búsqueda Rápida</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="N° Doc, Bodega, SKU, RUT..."
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
                <div className="text-indigo-700 font-mono text-[11px]">
                  SKU: {selectedProductObj.code} | Categoría: {selectedProductObj.category || 'General'}
                </div>
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
                  {formatCLP((selectedProductObj.currentStock || 0) * (selectedProductObj.purchaseCost || 0))}
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
                <th className="py-3 px-4">Tipo & Motivo</th>
                <th className="py-3 px-4">Bodega</th>
                <th className="py-3 px-4">Producto / SKU</th>
                <th className="py-3 px-4">Contraparte / Referencia</th>
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
                  <td colSpan={10} className="py-8 text-center text-slate-400">
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
                            <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 whitespace-nowrap">
                              <TrendingDown className="w-3 h-3 text-emerald-600" />
                              <span>ENTRADA</span>
                            </span>
                          ) : (
                            <span className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1 whitespace-nowrap">
                              <TrendingUp className="w-3 h-3 text-blue-600" />
                              <span>SALIDA</span>
                            </span>
                          )}
                          <span className="font-semibold text-slate-700 whitespace-nowrap">
                            {mov.movementReason} {mov.documentNumber ? `#${mov.documentNumber}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          <WarehouseIcon className="w-3 h-3 text-slate-400" />
                          <span>{mov.warehouseName || 'Bodega Central'}</span>
                          {mov.targetWarehouseName ? (
                            <span className="text-indigo-600 font-bold"> → {mov.targetWarehouseName}</span>
                          ) : null}
                        </span>
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
                          <div className="truncate max-w-[140px] text-slate-500">
                            {mov.observations || 'Ajuste interno'}
                          </div>
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

      {/* MODAL REGISTRO DE MOVIMIENTO / AJUSTE DE STOCK */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-base">Registrar Movimiento / Ajuste de Inventario</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Motivo del Movimiento *</label>
                  <select
                    value={formReason}
                    onChange={e => setFormReason(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="AJUSTE_INVENTARIO">Ajuste por Toma Física (Inventario)</option>
                    <option value="MERMA">Merma, Daño o Vencimiento (Pérdida)</option>
                    <option value="CONSUMO_INTERNO">Consumo Interno / Uso Operacional</option>
                    <option value="TRASPASO_BODEGA">Traspaso entre Bodegas</option>
                    <option value="APERTURA">Apertura Inicial de Inventario</option>
                    <option value="COMPRA">Recepción Manual de Mercaderías</option>
                    <option value="DEVOLUCION">Devolución de Existencias</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha del Movimiento *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Producto / Artículo *</label>
                <select
                  required
                  value={formProdId}
                  onChange={e => handleProductFormChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Seleccionar Producto Físico --</option>
                  {physicalProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} (Stock Actual: {p.currentStock} {p.unitOfMeasure} | PMP: {formatCLP(p.purchaseCost)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {formReason === 'TRASPASO_BODEGA' ? 'Bodega Origen *' : 'Bodega Asignada *'}
                  </label>
                  <select
                    required
                    value={formWhId}
                    onChange={e => setFormWhId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.name} {w.isDefault ? '(Principal)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {formReason === 'TRASPASO_BODEGA' && (
                  <div>
                    <label className="block font-semibold text-indigo-900 mb-1">Bodega Destino *</label>
                    <select
                      required
                      value={formTargetWhId}
                      onChange={e => setFormTargetWhId(e.target.value)}
                      className="w-full px-3 py-2 border border-indigo-300 bg-indigo-50/50 rounded-lg font-semibold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Seleccionar Destino --</option>
                      {warehouses
                        .filter(w => w.id !== formWhId)
                        .map(w => (
                          <option key={w.id} value={w.id}>
                            {w.code} - {w.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cantidad *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={formQty}
                    onChange={e => setFormQty(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Costo Unitario ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formUnitCost}
                    onChange={e => setFormUnitCost(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Sugerido según PMP actual</p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">N° Documento / Folio de Respaldo</label>
                <input
                  type="text"
                  placeholder="Ej: Acta de Merma #04, Guía de Traslado #102, Acta Toma Física"
                  value={formDocRef}
                  onChange={e => setFormDocRef(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observaciones / Justificación</label>
                <textarea
                  rows={2}
                  placeholder="Detalles sobre el motivo o estado del producto..."
                  value={formObservations}
                  onChange={e => setFormObservations(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {formReason !== 'TRASPASO_BODEGA' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={generateVoucher}
                      onChange={e => setGenerateVoucher(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">
                        Generar Asiento Contable Automático en Libro Diario
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formReason === 'MERMA' && 'Gasto Pérdida por Mermas (Debe) / Mercaderías en Bodega (Haber)'}
                        {formReason === 'CONSUMO_INTERNO' && 'Gasto Consumo Interno (Debe) / Mercaderías en Bodega (Haber)'}
                        {formReason === 'APERTURA' && 'Mercaderías en Bodega (Debe) / Capital Inicial (Haber)'}
                        {formReason === 'AJUSTE_INVENTARIO' && 'Ajuste valorizado automático en cuenta de inventarios'}
                        {formReason === 'COMPRA' && 'Mercaderías en Bodega (Debe) / Cuenta por Pagar (Haber)'}
                        {formReason === 'DEVOLUCION' && 'Regularización automática'}
                      </span>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Procesando...' : 'Confirmar & Guardar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
