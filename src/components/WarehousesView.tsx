import React, { useState } from 'react';
import {
  Warehouse as WarehouseIcon,
  Plus,
  Search,
  Edit,
  Trash2,
  Building2,
  MapPin,
  User,
  Phone,
  CheckCircle2,
  Star,
  AlertTriangle,
  Boxes,
  ShieldCheck,
  X
} from 'lucide-react';
import { Warehouse, ProductService } from '../types';

interface WarehousesViewProps {
  companyId: string;
  companyName: string;
  warehouses: Warehouse[];
  products: ProductService[];
  onSaveWarehouse: (wh: Partial<Warehouse>) => Promise<void>;
  onDeleteWarehouse: (whId: string) => Promise<void>;
  onSetDefaultWarehouse: (whId: string) => Promise<void>;
  isReadOnly?: boolean;
}

export const WarehousesView: React.FC<WarehousesViewProps> = ({
  companyId,
  companyName,
  warehouses,
  products,
  onSaveWarehouse,
  onDeleteWarehouse,
  onSetDefaultWarehouse,
  isReadOnly = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<Warehouse>>({
    code: '',
    name: '',
    address: '',
    responsible: '',
    phone: '',
    isDefault: false,
    estado: 'Activo'
  });

  const filteredWarehouses = warehouses.filter(w =>
    w.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.address && w.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (w.responsible && w.responsible.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenCreate = () => {
    setEditingWh(null);
    const nextNum = warehouses.length + 1;
    setFormData({
      code: `BOD-${String(nextNum).padStart(2, '0')}`,
      name: '',
      address: '',
      responsible: '',
      phone: '',
      isDefault: warehouses.length === 0,
      estado: 'Activo'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (wh: Warehouse) => {
    setEditingWh(wh);
    setFormData({ ...wh });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code?.trim() || !formData.name?.trim()) {
      alert('Por favor ingresa al menos el código y nombre de la bodega.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaveWarehouse({
        ...formData,
        id: editingWh ? editingWh.id : undefined,
        companyId
      });
      setIsModalOpen(false);
    } catch (err: any) {
      alert(`Error al guardar la bodega: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (wh: Warehouse) => {
    if (wh.isDefault) {
      alert('No puedes eliminar la bodega principal predeterminada.');
      return;
    }
    if (window.confirm(`¿Estás seguro de eliminar la bodega "${wh.name}" (${wh.code})?`)) {
      try {
        await onDeleteWarehouse(wh.id);
      } catch (err: any) {
        alert(`Error al eliminar: ${err.message || err}`);
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100 text-indigo-700">
              <WarehouseIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Maestro Multi-Bodega & Puntos de Almacenamiento</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Empresa: <strong className="text-slate-700">{companyName}</strong> — Gestión de sucursales, depósitos centrales y control de ubicaciones logísticas.
              </p>
            </div>
          </div>
        </div>

        {!isReadOnly && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Bodega</span>
          </button>
        )}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bodegas Habilitadas</span>
            <WarehouseIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{warehouses.filter(w => w.estado === 'Activo').length}</div>
          <p className="text-[11px] text-slate-500 mt-1">Ubicaciones activas para entrada/salida</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bodega Principal</span>
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
          </div>
          <div className="text-base font-bold text-slate-800 mt-2 truncate">
            {warehouses.find(w => w.isDefault)?.name || 'Sin Asignar'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Recepción y despacho predeterminado</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Artículos con Stock</span>
            <Boxes className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">
            {products.filter(p => p.type === 'PRODUCT' && p.currentStock > 0).length} SKU
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Disponibles en inventario consolidado</p>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar bodega por código, nombre, dirección o encargado..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-xs font-semibold text-slate-500">
          {filteredWarehouses.length} de {warehouses.length} bodega(s)
        </span>
      </div>

      {/* LISTA / CARDS DE BODEGAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredWarehouses.map(wh => {
          return (
            <div
              key={wh.id}
              className={`bg-white rounded-xl border transition-all p-5 shadow-2xs flex flex-col justify-between relative ${
                wh.isDefault ? 'border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/20' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                      {wh.code}
                    </span>
                    {wh.isDefault && (
                      <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        <Star className="w-3 h-3 fill-amber-500" />
                        Principal
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      wh.estado === 'Activo' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {wh.estado}
                  </span>
                </div>

                <h3 className="font-bold text-slate-800 text-sm mt-3">{wh.name}</h3>

                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  {wh.address ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{wh.address}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400 italic">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>Sin dirección registrada</span>
                    </div>
                  )}

                  {wh.responsible ? (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{wh.responsible}</span>
                    </div>
                  ) : null}

                  {wh.phone ? (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{wh.phone}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {!isReadOnly && (
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  {!wh.isDefault ? (
                    <button
                      onClick={() => onSetDefaultWarehouse(wh.id)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
                    >
                      Hacer Principal
                    </button>
                  ) : (
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Predeterminada
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(wh)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
                      title="Editar Bodega"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {!wh.isDefault && (
                      <button
                        onClick={() => handleDelete(wh)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        title="Eliminar Bodega"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredWarehouses.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
            <WarehouseIcon className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-sm">No se encontraron bodegas</p>
            <p className="text-xs text-slate-400 mt-1">Crea una nueva bodega para organizar tus inventarios y transferencias.</p>
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR BODEGA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <WarehouseIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-base">
                  {editingWh ? 'Editar Bodega' : 'Nueva Bodega / Punto de Almacenamiento'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código / Identificador *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: BOD-01"
                    value={formData.code || ''}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estado</label>
                  <select
                    value={formData.estado || 'Activo'}
                    onChange={e => setFormData({ ...formData, estado: e.target.value as 'Activo' | 'Inactivo' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre de la Bodega *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Bodega Central - Casa Matriz, Sucursal Oriente, Bodega Obra 2"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dirección / Ubicación Física</label>
                <input
                  type="text"
                  placeholder="Ej: Av. Providencia 1234, Galpón 4"
                  value={formData.address || ''}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Responsable / Encargado</label>
                  <input
                    type="text"
                    placeholder="Ej: Juan Pérez"
                    value={formData.responsible || ''}
                    onChange={e => setFormData({ ...formData, responsible: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono / Anexo</label>
                  <input
                    type="text"
                    placeholder="Ej: +56 9 8765 4321"
                    value={formData.phone || ''}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.isDefault || false}
                    onChange={e => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="font-semibold text-slate-700">
                    Establecer como Bodega Principal (Predeterminada para recepción de compras y ventas)
                  </span>
                </label>
              </div>

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
                  disabled={isSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingWh ? 'Guardar Cambios' : 'Crear Bodega'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
