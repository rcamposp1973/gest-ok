import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Filter,
  FileText,
  DollarSign,
  Package,
  Wrench,
  Layers,
  Building2,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertTriangle,
  X,
  Trash2,
  Printer,
  FileSpreadsheet,
  Zap
} from 'lucide-react';
import {
  ProductService,
  CommercialDocument,
  CommercialItemLine,
  ChartOfAccount,
  Auxiliary,
  CostCenterMaster,
  ExpenseItemMaster,
  Voucher,
  InventoryMovement
} from '../types';

interface OperativaComercialViewProps {
  companyId: string;
  companyName: string;
  companyRut: string;
  products: ProductService[];
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  costCenters: CostCenterMaster[];
  expenseItems: ExpenseItemMaster[];
  commercialDocs: CommercialDocument[];
  onSaveDocument: (doc: CommercialDocument, movements: InventoryMovement[], newVouchers: Voucher[]) => void;
  isReadOnly?: boolean;
}

export const OperativaComercialView: React.FC<OperativaComercialViewProps> = ({
  companyId,
  companyName,
  companyRut,
  products,
  accounts,
  auxiliaries,
  costCenters,
  expenseItems,
  commercialDocs,
  onSaveDocument,
  isReadOnly = false
}) => {
  const [activeTab, setActiveTab] = useState<'VENTA' | 'COMPRA'>('VENTA');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State para nueva Operación Comercial
  const [opType, setOpType] = useState<'VENTA' | 'COMPRA'>('VENTA');
  const [docType, setDocType] = useState<'COTIZACION' | 'ORDEN_VENTA' | 'FACTURA_VENTA' | 'ORDEN_COMPRA' | 'RECEPCION_COMPRA' | 'FACTURA_COMPRA' | 'GUIA_DESPACHO'>('FACTURA_VENTA');
  const [folio, setFolio] = useState<string>(String(Date.now()).slice(-5));
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  
  // Contraparte
  const [selectedAuxId, setSelectedAuxId] = useState<string>('');
  const [rutContraparte, setRutContraparte] = useState<string>('');
  const [razonSocialContraparte, setRazonSocialContraparte] = useState<string>('');
  const [observations, setObservations] = useState<string>('');

  // Ítems de la orden / documento
  const [lines, setLines] = useState<CommercialItemLine[]>([]);

  // Ítem temporal para agregar a la grilla
  const [tempProductId, setTempProductId] = useState<string>('');
  const [tempQty, setTempQty] = useState<number>(1);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [tempCostCenterId, setTempCostCenterId] = useState<string>('');
  const [tempExpenseItemId, setTempExpenseItemId] = useState<string>('');

  // Filtrar documentos
  const filteredDocs = useMemo(() => {
    return commercialDocs.filter(d => {
      const matchesOp = d.operationType === activeTab;
      const matchesSearch =
        String(d.folio).includes(searchTerm) ||
        d.rutContraparte.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.razonSocialContraparte.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesOp && matchesSearch;
    });
  }, [commercialDocs, activeTab, searchTerm]);

  // Totales calculados de las líneas actuales del formulario
  const formTotals = useMemo(() => {
    const subtotalNeto = lines.reduce((sum, l) => sum + l.subtotalNeto, 0);
    const ivaAmount = Math.round(subtotalNeto * 0.19);
    const totalAmount = subtotalNeto + ivaAmount;
    const totalCostPmp = lines.reduce((sum, l) => sum + (l.type === 'PRODUCT' ? (l.quantity * l.unitCostNeto) : 0), 0);
    return { subtotalNeto, ivaAmount, totalAmount, totalCostPmp };
  }, [lines]);

  // Manejador al seleccionar producto en el modal
  const handleProductSelect = (prodId: string) => {
    setTempProductId(prodId);
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setTempPrice(opType === 'VENTA' ? prod.salesPrice : prod.purchaseCost);
      setTempCostCenterId(prod.defaultCostCenterId || '');
      setTempExpenseItemId(prod.defaultItemGastoId || '');
    }
  };

  // Manejador al seleccionar auxiliar (Cliente / Proveedor)
  const handleAuxiliarySelect = (auxId: string) => {
    setSelectedAuxId(auxId);
    const aux = auxiliaries.find(a => a.id === auxId);
    if (aux) {
      setRutContraparte(aux.rut);
      setRazonSocialContraparte(aux.name);
    }
  };

  const handleAddLine = () => {
    const prod = products.find(p => p.id === tempProductId);
    if (!prod) {
      alert('Por favor selecciona un producto o servicio del catálogo.');
      return;
    }
    if (tempQty <= 0) {
      alert('La cantidad debe ser mayor a 0.');
      return;
    }

    // Validar stock si es venta y producto físico y no permite negativo
    if (opType === 'VENTA' && prod.type === 'PRODUCT' && !prod.allowNegativeStock) {
      if (prod.currentStock < tempQty) {
        alert(`❌ Stock insuficiente: El producto ${prod.name} tiene solo ${prod.currentStock} ${prod.unitOfMeasure} en bodega y no permite stock negativo.`);
        return;
      }
    }

    const subtotal = tempQty * tempPrice;
    const iva = Math.round(subtotal * 0.19);

    const newLine: CommercialItemLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      type: prod.type,
      quantity: tempQty,
      unitOfMeasure: prod.unitOfMeasure,
      unitPriceNeto: tempPrice,
      unitCostNeto: prod.purchaseCost,
      subtotalNeto: subtotal,
      ivaAmount: iva,
      total: subtotal + iva,
      salesAccountId: prod.salesAccountId,
      purchaseAccountId: prod.purchaseAccountId,
      costCenterId: tempCostCenterId || prod.defaultCostCenterId,
      expenseItemId: tempExpenseItemId || prod.defaultItemGastoId
    };

    setLines(prev => [...prev, newLine]);
    // Reset temp inputs
    setTempProductId('');
    setTempQty(1);
    setTempPrice(0);
  };

  const handleRemoveLine = (lineId: string) => {
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  const handleOpenCreateModal = (operation: 'VENTA' | 'COMPRA') => {
    setOpType(operation);
    setDocType(operation === 'VENTA' ? 'FACTURA_VENTA' : 'FACTURA_COMPRA');
    setFolio(String(Date.now()).slice(-5));
    setDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setSelectedAuxId('');
    setRutContraparte('');
    setRazonSocialContraparte('');
    setObservations('');
    setLines([]);
    setTempProductId('');
    setTempQty(1);
    setTempPrice(0);
    setIsModalOpen(true);
  };

  const handleSaveCommercialDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rutContraparte || !razonSocialContraparte) {
      alert('Por favor ingresa o selecciona el RUT y Razón Social de la contraparte.');
      return;
    }
    if (lines.length === 0) {
      alert('Debes agregar al menos una línea de producto o servicio a la orden.');
      return;
    }

    const docId = `comm-${Date.now()}`;
    const period = date.slice(0, 7);
    const voucherPeriod = period;

    // 1. Crear Documento Comercial
    const newDoc: CommercialDocument = {
      id: docId,
      companyId,
      operationType: opType,
      documentType: docType,
      folio,
      date,
      dueDate,
      period,
      auxiliaryId: selectedAuxId,
      rutContraparte,
      razonSocialContraparte,
      items: lines,
      subtotalNeto: formTotals.subtotalNeto,
      ivaAmount: formTotals.ivaAmount,
      totalAmount: formTotals.totalAmount,
      totalCostPmp: formTotals.totalCostPmp,
      status: 'Contabilizada',
      stockUpdated: true,
      observations,
      createdAt: new Date().toISOString()
    };

    // 2. Generar Movimientos de Kardex para productos físicos
    const generatedMovements: InventoryMovement[] = [];
    lines.forEach(line => {
      if (line.type === 'PRODUCT') {
        const prod = products.find(p => p.id === line.productId);
        const prevStock = prod ? prod.currentStock : 0;
        const resultingStock = opType === 'COMPRA' ? (prevStock + line.quantity) : (prevStock - line.quantity);
        const unitCost = opType === 'COMPRA' ? line.unitPriceNeto : line.unitCostNeto;

        generatedMovements.push({
          id: `mov-${Date.now()}-${line.id}`,
          companyId,
          productId: line.productId,
          productCode: line.productCode,
          productName: line.productName,
          date,
          type: opType === 'COMPRA' ? 'IN' : 'OUT',
          movementReason: opType === 'COMPRA' ? 'COMPRA' : 'VENTA',
          quantity: line.quantity,
          unitCost,
          totalCost: line.quantity * unitCost,
          previousStock: prevStock,
          resultingStock,
          commercialDocId: docId,
          documentNumber: String(folio),
          documentType: docType,
          rutContraparte,
          razonSocialContraparte,
          observations: `Operación comercial #${folio} - ${razonSocialContraparte}`,
          createdAt: new Date().toISOString()
        });
      }
    });

    // 3. Generar Asientos Contables Automáticos
    const generatedVouchers: Voucher[] = [];

    // A. Asiento Comercial (Venta / Compra)
    const voucherNumberBase = Math.floor(1000 + Math.random() * 9000);
    const voucherIdOp = `vouch-${Date.now()}-op`;

    if (opType === 'VENTA') {
      // Cuenta Clientes por Cobrar (110301)
      const clientAccount = accounts.find(a => a.code.startsWith('1103') || a.name.toLowerCase().includes('cliente')) || accounts[0];
      // Cuenta IVA Débito Fiscal (210701)
      const ivaDebitoAccount = accounts.find(a => a.code.startsWith('2107') || a.name.toLowerCase().includes('iva debito') || a.name.toLowerCase().includes('débito')) || accounts[0];

      const voucherLines: any[] = [
        {
          id: `vl-1`,
          accountId: clientAccount?.id || '',
          accountCode: clientAccount?.code || '110301',
          accountName: clientAccount?.name || 'Clientes Nacionales',
          debit: formTotals.totalAmount,
          credit: 0,
          gloss: `Factura Venta #${folio} - ${razonSocialContraparte}`,
          rut: rutContraparte,
          documentType: 'Factura Venta',
          documentNumber: String(folio)
        }
      ];

      // Líneas de Ingreso por cada ítem
      lines.forEach((l, idx) => {
        const incomeAcc = accounts.find(a => a.id === l.salesAccountId) || accounts.find(a => a.type === 'Ingreso' || a.code.startsWith('4')) || accounts[0];
        voucherLines.push({
          id: `vl-inc-${idx}`,
          accountId: incomeAcc?.id || '',
          accountCode: incomeAcc?.code || '410101',
          accountName: incomeAcc?.name || 'Ventas y Servicios',
          debit: 0,
          credit: l.subtotalNeto,
          gloss: `${l.productName} (x${l.quantity} ${l.unitOfMeasure})`,
          rut: rutContraparte,
          costCenter: l.costCenterId,
          expenseItem: l.expenseItemId
        });
      });

      // Línea de IVA Débito
      if (formTotals.ivaAmount > 0) {
        voucherLines.push({
          id: `vl-iva`,
          accountId: ivaDebitoAccount?.id || '',
          accountCode: ivaDebitoAccount?.code || '210701',
          accountName: ivaDebitoAccount?.name || 'IVA Débito Fiscal',
          debit: 0,
          credit: formTotals.ivaAmount,
          gloss: `IVA Débito Factura #${folio}`,
          rut: rutContraparte
        });
      }

      generatedVouchers.push({
        id: voucherIdOp,
        voucherNumber: voucherNumberBase,
        date,
        period: voucherPeriod,
        type: 'Ingreso',
        gloss: `Venta Factura #${folio} ${razonSocialContraparte}`,
        lines: voucherLines,
        totalDebit: formTotals.totalAmount,
        totalCredit: formTotals.totalAmount,
        status: 'Valido',
        creationMode: 'AUTOMATICO',
        createdAt: new Date().toISOString()
      });
      newDoc.voucherIdVentaCompra = voucherIdOp;

      // B. Asiento Automático de Costo de Ventas si hay productos físicos
      const physicalLines = lines.filter(l => l.type === 'PRODUCT');
      if (physicalLines.length > 0 && formTotals.totalCostPmp > 0) {
        const voucherIdCost = `vouch-${Date.now()}-cost`;
        const costAccount = accounts.find(a => a.code.startsWith('5101') || a.name.toLowerCase().includes('costo de venta')) || accounts.find(a => a.type === 'Gasto') || accounts[0];
        const mercaderiasAccount = accounts.find(a => a.code.startsWith('1106') || a.name.toLowerCase().includes('mercader') || a.name.toLowerCase().includes('existencia')) || accounts[0];

        const costLines: any[] = [
          {
            id: `cv-1`,
            accountId: costAccount?.id || '',
            accountCode: costAccount?.code || '510101',
            accountName: costAccount?.name || 'Costo de Ventas (PMP)',
            debit: formTotals.totalCostPmp,
            credit: 0,
            gloss: `Costo de Ventas PMP Factura #${folio}`,
            documentNumber: String(folio)
          },
          {
            id: `cv-2`,
            accountId: mercaderiasAccount?.id || '',
            accountCode: mercaderiasAccount?.code || '110601',
            accountName: mercaderiasAccount?.name || 'Existencias / Mercaderías',
            debit: 0,
            credit: formTotals.totalCostPmp,
            gloss: `Rebaja de Existencias Factura #${folio}`,
            documentNumber: String(folio)
          }
        ];

        generatedVouchers.push({
          id: voucherIdCost,
          voucherNumber: voucherNumberBase + 1,
          date,
          period: voucherPeriod,
          type: 'Traspaso',
          gloss: `Costo de Ventas Factura #${folio} - Rebaja Bodega`,
          lines: costLines,
          totalDebit: formTotals.totalCostPmp,
          totalCredit: formTotals.totalCostPmp,
          status: 'Valido',
          creationMode: 'AUTOMATICO',
          createdAt: new Date().toISOString()
        });
        newDoc.voucherIdCostoVentas = voucherIdCost;
      }
    } else {
      // COMPRA: Proveedores (210401) vs Gasto/Mercadería (1106/51) + IVA Crédito (110701)
      const provAccount = accounts.find(a => a.code.startsWith('2104') || a.name.toLowerCase().includes('proveedor')) || accounts[0];
      const ivaCreditoAccount = accounts.find(a => a.code.startsWith('1107') || a.name.toLowerCase().includes('iva credito') || a.name.toLowerCase().includes('crédito')) || accounts[0];

      const voucherLines: any[] = [];

      // Líneas de Gasto o Mercadería
      lines.forEach((l, idx) => {
        const purchaseAcc = accounts.find(a => a.id === l.purchaseAccountId) || (l.type === 'PRODUCT' ? accounts.find(a => a.code.startsWith('1106')) : accounts.find(a => a.type === 'Gasto')) || accounts[0];
        voucherLines.push({
          id: `vl-comp-${idx}`,
          accountId: purchaseAcc?.id || '',
          accountCode: purchaseAcc?.code || (l.type === 'PRODUCT' ? '110601' : '510201'),
          accountName: purchaseAcc?.name || (l.type === 'PRODUCT' ? 'Mercaderías' : 'Gastos Operacionales'),
          debit: l.subtotalNeto,
          credit: 0,
          gloss: `${l.productName} (x${l.quantity} ${l.unitOfMeasure})`,
          rut: rutContraparte,
          costCenter: l.costCenterId,
          expenseItem: l.expenseItemId
        });
      });

      // IVA Crédito Fiscal
      if (formTotals.ivaAmount > 0) {
        voucherLines.push({
          id: `vl-iva-comp`,
          accountId: ivaCreditoAccount?.id || '',
          accountCode: ivaCreditoAccount?.code || '110701',
          accountName: ivaCreditoAccount?.name || 'IVA Crédito Fiscal',
          debit: formTotals.ivaAmount,
          credit: 0,
          gloss: `IVA Crédito Factura Compra #${folio}`,
          rut: rutContraparte
        });
      }

      // Proveedores por Pagar
      voucherLines.push({
        id: `vl-prov`,
        accountId: provAccount?.id || '',
        accountCode: provAccount?.code || '210401',
        accountName: provAccount?.name || 'Proveedores Nacionales',
        debit: 0,
        credit: formTotals.totalAmount,
        gloss: `Factura Compra #${folio} - ${razonSocialContraparte}`,
        rut: rutContraparte,
        documentType: 'Factura Compra',
        documentNumber: String(folio)
      });

      generatedVouchers.push({
        id: voucherIdOp,
        voucherNumber: voucherNumberBase,
        date,
        period: voucherPeriod,
        type: 'Egreso',
        gloss: `Compra Factura #${folio} ${razonSocialContraparte}`,
        lines: voucherLines,
        totalDebit: formTotals.totalAmount,
        totalCredit: formTotals.totalAmount,
        status: 'Valido',
        creationMode: 'AUTOMATICO',
        createdAt: new Date().toISOString()
      });
      newDoc.voucherIdVentaCompra = voucherIdOp;
    }

    // Guardar en el estado global
    onSaveDocument(newDoc, generatedMovements, generatedVouchers);
    setIsModalOpen(false);
    alert(`✅ Operación Comercial #${folio} Registrada con Éxito!\n\n• Documento: ${docType}\n• Total: $${formTotals.totalAmount.toLocaleString('es-CL')}\n• Kardex Actualizado: ${generatedMovements.length} movimientos.\n• Asientos Contables Generados: ${generatedVouchers.length} vouchers en Libro Diario.`);
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
            <ShoppingCart className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">Operaciones Comerciales ERP & Integración Contable</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Empresa: <strong className="text-slate-700">{companyName}</strong> — Flujo de Compras, Ventas, Control de Kardex PMP y Asientos Automáticos.
          </p>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenCreateModal('VENTA')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Nueva Venta (Cliente)</span>
            </button>
            <button
              onClick={() => handleOpenCreateModal('COMPRA')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <TrendingDown className="w-4 h-4" />
              <span>Nueva Compra (Proveedor)</span>
            </button>
          </div>
        )}
      </div>

      {/* TABS VENTA / COMPRA */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('VENTA')}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'VENTA'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Ventas y Clientes</span>
          </button>
          <button
            onClick={() => setActiveTab('COMPRA')}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'COMPRA'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Compras y Proveedores</span>
          </button>
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por N° Folio, RUT o Razón Social..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* GRILLA DE DOCUMENTOS COMERCIALES */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Documentos de {activeTab === 'VENTA' ? 'Venta y Facturación' : 'Compra y Recepción'}</span>
          </h3>
          <span className="text-[11px] font-semibold text-slate-500">
            {filteredDocs.length} documento(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="py-3 px-4">Folio / Doc</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Contraparte</th>
                <th className="py-3 px-4">Detalle Ítems</th>
                <th className="py-3 px-4 text-right">Neto</th>
                <th className="py-3 px-4 text-right">IVA</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Estado & Kardex</th>
                <th className="py-3 px-4 text-center">Vouchers Generados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No se registran documentos de {activeTab.toLowerCase()} emitidos aún. Haz clic en "Nueva {activeTab === 'VENTA' ? 'Venta' : 'Compra'}" para comenzar.
                  </td>
                </tr>
              ) : (
                filteredDocs.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <div>#{doc.folio}</div>
                      <span className="text-[10px] text-slate-500 font-sans font-normal">{doc.documentType}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {doc.date}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{doc.razonSocialContraparte}</div>
                      <div className="font-mono text-[10px] text-slate-400">{doc.rutContraparte}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        {doc.items.map((item, idx) => (
                          <div key={idx} className="text-[11px] text-slate-700 flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${item.type === 'PRODUCT' ? 'bg-blue-500' : 'bg-indigo-500'}`} />
                            <span className="font-semibold">{item.quantity} {item.unitOfMeasure}</span>
                            <span className="text-slate-500 truncate max-w-[160px]">{item.productName}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatCLP(doc.subtotalNeto)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {formatCLP(doc.ivaAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatCLP(doc.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {doc.status}
                        </span>
                        {doc.stockUpdated && (
                          <span className="text-[9px] font-semibold text-blue-600 flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5" /> Stock Actualizado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {doc.voucherIdVentaCompra && (
                          <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded border border-indigo-200" title="Asiento de Ingreso/Gasto e IVA">
                            Voucher Comercial
                          </span>
                        )}
                        {doc.voucherIdCostoVentas && (
                          <span className="text-[10px] font-mono bg-amber-50 text-amber-800 font-semibold px-2 py-0.5 rounded border border-amber-200" title="Asiento de Costo de Ventas PMP y Salida de Existencias">
                            Asiento Costo Ventas
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR DOCUMENTO COMERCIAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className={`px-6 py-4 text-white flex justify-between items-center ${opType === 'VENTA' ? 'bg-blue-900' : 'bg-emerald-900'}`}>
              <div className="flex items-center gap-2">
                {opType === 'VENTA' ? <TrendingUp className="w-5 h-5 text-blue-300" /> : <TrendingDown className="w-5 h-5 text-emerald-300" />}
                <h3 className="font-bold text-base">
                  {opType === 'VENTA' ? 'Emitir Operación de Venta / Factura Cliente' : 'Registrar Operación de Compra / Proveedor'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCommercialDoc} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Cabecera Documento */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo Documento</label>
                  <select
                    value={docType}
                    onChange={e => setDocType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
                  >
                    {opType === 'VENTA' ? (
                      <>
                        <option value="FACTURA_VENTA">Factura Electrónica (33)</option>
                        <option value="COTIZACION">Cotización / Presupuesto</option>
                        <option value="ORDEN_VENTA">Nota de Venta / Pedido</option>
                        <option value="GUIA_DESPACHO">Guía de Despacho (52)</option>
                      </>
                    ) : (
                      <>
                        <option value="FACTURA_COMPRA">Factura de Compra (33)</option>
                        <option value="ORDEN_COMPRA">Orden de Compra</option>
                        <option value="RECEPCION_COMPRA">Recepción de Mercaderías</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Folio / Número *</label>
                  <input
                    type="text"
                    required
                    value={folio}
                    onChange={e => setFolio(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha Emisión *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha Vencimiento</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Contraparte (Cliente o Proveedor) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span>{opType === 'VENTA' ? 'Datos del Cliente (Receptor)' : 'Datos del Proveedor (Emisor)'}</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Seleccionar Auxiliar (Opcional)</label>
                    <select
                      value={selectedAuxId}
                      onChange={e => handleAuxiliarySelect(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Buscar en Auxiliares --</option>
                      {auxiliaries.map(aux => (
                        <option key={aux.id} value={aux.id}>
                          {aux.rut} - {aux.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">RUT Contraparte *</label>
                    <input
                      type="text"
                      required
                      placeholder="12.345.678-9"
                      value={rutContraparte}
                      onChange={e => setRutContraparte(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Razón Social *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nombre o Empresa"
                      value={razonSocialContraparte}
                      onChange={e => setRazonSocialContraparte(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500 font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Agregar Ítems desde Catálogo */}
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <h4 className="font-bold text-indigo-900 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-600" />
                    <span>Agregar Ítem desde el Catálogo de Productos y Servicios</span>
                  </span>
                  <span className="text-[10px] text-indigo-600 font-normal">
                    * Los productos físicos actualizarán el Kardex PMP automáticamente.
                  </span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">Producto / Servicio</label>
                    <select
                      value={tempProductId}
                      onChange={e => handleProductSelect(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Seleccionar del Catálogo --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          [{p.type === 'PRODUCT' ? '📦 PROD' : '🛠️ SERV'}] {p.code} - {p.name} {p.type === 'PRODUCT' ? `(Stock: ${p.currentStock} ${p.unitOfMeasure})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      value={tempQty}
                      onChange={e => setTempQty(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Precio Unit. (Neto)</label>
                    <input
                      type="number"
                      min="0"
                      value={tempPrice}
                      onChange={e => setTempPrice(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Centro Costo</label>
                    <select
                      value={tempCostCenterId}
                      onChange={e => setTempCostCenterId(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Por defecto</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.code}>{cc.code} - {cc.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabla de Líneas Agregadas */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Descripción</th>
                      <th className="py-2.5 px-3 text-center">Tipo</th>
                      <th className="py-2.5 px-3 text-right">Cant.</th>
                      <th className="py-2.5 px-3 text-right">Precio Neto</th>
                      <th className="py-2.5 px-3 text-right">Subtotal Neto</th>
                      <th className="py-2.5 px-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          Aún no has agregado productos ni servicios a este documento.
                        </td>
                      </tr>
                    ) : (
                      lines.map(line => (
                        <tr key={line.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-800">{line.productCode}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{line.productName}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${line.type === 'PRODUCT' ? 'bg-blue-100 text-blue-800' : 'bg-indigo-100 text-indigo-800'}`}>
                              {line.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{line.quantity} {line.unitOfMeasure}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCLP(line.unitPriceNeto)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatCLP(line.subtotalNeto)}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totales y Asientos Contables a Generar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
                  <h5 className="font-bold text-slate-800 mb-1 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>Automatizaciones Contables que se ejecutarán:</span>
                  </h5>
                  <ul className="text-[11px] space-y-1 list-disc list-inside text-slate-600 mt-1">
                    <li>Generación automática del <strong>Voucher de {opType === 'VENTA' ? 'Ingreso (Venta + IVA Débito)' : 'Egreso (Compra + IVA Crédito)'}</strong>.</li>
                    {opType === 'VENTA' && lines.some(l => l.type === 'PRODUCT') && (
                      <li className="text-indigo-700 font-semibold">
                        Generación automática del <strong>Asiento de Costo de Ventas</strong> (Débito: Costo de Ventas | Crédito: Existencias 110601).
                      </li>
                    )}
                    {lines.some(l => l.type === 'PRODUCT') && (
                      <li className="text-emerald-700 font-semibold">
                        Actualización del <strong>Kardex de Inventario y recálculo de PMP</strong>.
                      </li>
                    )}
                  </ul>
                </div>

                <div className="p-3 bg-slate-900 text-white rounded-xl space-y-1.5 text-right font-mono">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Subtotal Neto:</span>
                    <span>{formatCLP(formTotals.subtotalNeto)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>IVA (19%):</span>
                    <span>{formatCLP(formTotals.ivaAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-emerald-400 border-t border-slate-700 pt-1">
                    <span>Total a Pagar/Cobrar:</span>
                    <span>{formatCLP(formTotals.totalAmount)}</span>
                  </div>
                </div>
              </div>

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
                  className={`px-6 py-2 text-white rounded-lg font-bold shadow-xs transition-colors flex items-center gap-1.5 ${
                    opType === 'VENTA' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar y Contabilizar Operación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
