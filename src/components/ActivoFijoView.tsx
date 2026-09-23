import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, Plus, Download, FileSpreadsheet, Calculator, 
  RefreshCw, Sparkles, Trash2, Edit3, ShieldAlert, CheckCircle2, 
  Search, Sliders, DollarSign, Calendar, FileText
} from 'lucide-react';
import { Company, ChartOfAccount, Voucher } from '../types';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface FixedAsset {
  id: string;
  code: string; // Ej: AF-001
  name: string; // Ej: Camión Mercedes Benz 2024
  category: 'TERRENOS' | 'CONSTRUCCIONES' | 'MAQUINARIAS' | 'VEHICULOS' | 'EQUIPOS_COMPUTACIONALES' | 'MUEBLES_UTILES';
  invoiceNumber?: string;
  supplierRut?: string;
  supplierName?: string;
  acquisitionDate: string; // YYYY-MM-DD
  acquisitionValue: number; // Valor Neto Compra ($)
  residualValue?: number; // Valor Residual ($)
  
  // Parámetros Tributarios (LIR Art. 31 N°5)
  usefulLifeTributariaMonths: number; // Vida útil tributaria en meses (ej: 36)
  tipoDepreciacionTributaria: 'LINEAL' | 'ACELERADA_UN_TERCIO' | 'INSTANTANEA_PROPYME';
  
  // Parámetros Financieros (IFRS / NIIF)
  usefulLifeIFRSMonths: number; // Vida útil IFRS en meses (ej: 60)
  
  accountAssetId?: string; // Cuenta de Activo Fijo (1201...)
  accountDepreciationId?: string; // Cuenta Depreciación Acumulada (1202...)
  accountExpenseId?: string; // Cuenta Gasto Depreciación (4102...)
  
  createdAt?: string;
}

interface ActivoFijoViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  onCentralizeVoucher?: (voucher: Omit<Voucher, 'id' | 'createdAt'>) => Promise<string>;
}

export const ActivoFijoView: React.FC<ActivoFijoViewProps> = ({
  studyId,
  company,
  accounts,
  onCentralizeVoucher
}) => {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  // Modal de Nuevo Activo
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Partial<FixedAsset> | null>(null);

  // Periodo de Cálculo
  const [calculationYear, setCalculationYear] = useState<number>(2026);
  const [ipcAccumulatedRate, setIpcAccumulatedRate] = useState<number>(3.8); // 3.8% IPC anual estimado

  // Cargar Activos de Firestore
  const fetchAssets = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'fixedAssets'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FixedAsset));
      setAssets(list);
    } catch (err) {
      console.error("Error loading fixed assets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [studyId, company.id]);

  // Cálculos del Cuadro de Activo Fijo para el año de cálculo
  const calculatedTable = useMemo(() => {
    return assets.map(asset => {
      const purchaseYear = new Date(asset.acquisitionDate).getFullYear();
      const purchaseMonth = new Date(asset.acquisitionDate).getMonth() + 1;

      // Meses de uso en el año seleccionado
      let monthsUsedInYear = 0;
      if (purchaseYear < calculationYear) {
        monthsUsedInYear = 12;
      } else if (purchaseYear === calculationYear) {
        monthsUsedInYear = 13 - purchaseMonth;
      }

      // 1. Depreciación Tributaria
      const valorHistorico = asset.acquisitionValue;
      const reajusteIPC = Math.round(valorHistorico * (ipcAccumulatedRate / 100));
      const valorActualizado = valorHistorico + reajusteIPC;

      let vidaUtilTribMeses = asset.usefulLifeTributariaMonths || 36;
      if (asset.tipoDepreciacionTributaria === 'ACELERADA_UN_TERCIO') {
        vidaUtilTribMeses = Math.max(12, Math.floor(vidaUtilTribMeses / 3));
      } else if (asset.tipoDepreciacionTributaria === 'INSTANTANEA_PROPYME') {
        vidaUtilTribMeses = 1;
      }

      const depreciacionMensualTrib = valorActualizado / vidaUtilTribMeses;
      const depreciacionEjercicioTrib = Math.min(valorActualizado, Math.round(depreciacionMensualTrib * monthsUsedInYear));
      const valorNetoTributario = Math.max(1, valorActualizado - depreciacionEjercicioTrib);

      // 2. Depreciación Financiera (IFRS)
      const valorResidual = asset.residualValue || 0;
      const baseDepreciableIFRS = Math.max(0, valorHistorico - valorResidual);
      const vidaUtilIFRSMeses = asset.usefulLifeIFRSMonths || 60;
      const depreciacionMensualIFRS = baseDepreciableIFRS / vidaUtilIFRSMeses;
      const depreciacionEjercicioIFRS = Math.round(depreciacionMensualIFRS * monthsUsedInYear);
      const valorLibrosIFRS = Math.max(valorResidual, valorHistorico - depreciacionEjercicioIFRS);

      return {
        ...asset,
        valorHistorico,
        reajusteIPC,
        valorActualizado,
        monthsUsedInYear,
        depreciacionEjercicioTrib,
        valorNetoTributario,
        depreciacionEjercicioIFRS,
        valorLibrosIFRS
      };
    });
  }, [assets, calculationYear, ipcAccumulatedRate]);

  // Totales
  const totals = useMemo(() => {
    return calculatedTable.reduce((acc, curr) => ({
      historico: acc.historico + curr.valorHistorico,
      reajuste: acc.reajuste + curr.reajusteIPC,
      actualizado: acc.actualizado + curr.valorActualizado,
      depTrib: acc.depTrib + curr.depreciacionEjercicioTrib,
      netoTrib: acc.netoTrib + curr.valorNetoTributario,
      depIFRS: acc.depIFRS + curr.depreciacionEjercicioIFRS,
      librosIFRS: acc.librosIFRS + curr.valorLibrosIFRS
    }), { historico: 0, reajuste: 0, actualizado: 0, depTrib: 0, netoTrib: 0, depIFRS: 0, librosIFRS: 0 });
  }, [calculatedTable]);

  // Guardar o Actualizar Activo
  const handleSaveAsset = async () => {
    if (!editingAsset?.name || !editingAsset?.acquisitionValue) {
      alert("Por favor ingresa al menos el Nombre y el Valor de Compra del Activo.");
      return;
    }

    try {
      const assetId = editingAsset.id || 'AF_' + Date.now();
      const assetData: FixedAsset = {
        id: assetId,
        code: editingAsset.code || `AF-${assets.length + 1}`,
        name: editingAsset.name.toUpperCase(),
        category: editingAsset.category || 'MAQUINARIAS',
        acquisitionDate: editingAsset.acquisitionDate || new Date().toISOString().slice(0, 10),
        acquisitionValue: Number(editingAsset.acquisitionValue),
        residualValue: Number(editingAsset.residualValue || 0),
        usefulLifeTributariaMonths: Number(editingAsset.usefulLifeTributariaMonths || 36),
        tipoDepreciacionTributaria: editingAsset.tipoDepreciacionTributaria || 'LINEAL',
        usefulLifeIFRSMonths: Number(editingAsset.usefulLifeIFRSMonths || 60),
        createdAt: editingAsset.createdAt || new Date().toISOString()
      };

      await setDoc(doc(db, 'studies', studyId, 'companies', company.id, 'fixedAssets', assetId), assetData);
      setShowModal(false);
      setEditingAsset(null);
      await fetchAssets();
    } catch (err: any) {
      alert("Error al guardar activo fijo: " + err.message);
    }
  };

  // Centralizar Comprobante de Depreciación en Libro Diario
  const handleCentralizeDepreciation = async () => {
    if (totals.depTrib <= 0) {
      alert("No hay monto de depreciación para contabilizar en este ejercicio.");
      return;
    }

    if (!onCentralizeVoucher) {
      alert("La función de contabilización centralizada está activa.");
      return;
    }

    try {
      const voucher = {
        companyId: company.id,
        period: `${calculationYear}-12`,
        voucherNumber: 900 + Math.floor(Math.random() * 90),
        voucherType: 'Traspaso' as const,
        date: `${calculationYear}-12-31`,
        type: 'Traspaso' as const,
        gloss: `CENTRALIZACION DEPRECIACION Y CORRECCION MONETARIA ACTIVO FIJO AÑO ${calculationYear}`,
        lines: [
          {
            id: 'l1',
            accountId: 'acc_4102001',
            accountCode: '4102001',
            accountName: 'GASTO DEPRECIACION ACTIVO FIJO',
            debit: totals.depTrib,
            credit: 0,
            gloss: `Depreciación tributaria ejercicio ${calculationYear}`
          },
          {
            id: 'l2',
            accountId: 'acc_1202001',
            accountCode: '1202001',
            accountName: 'DEPRECIACION ACUMULADA ACTIVO FIJO',
            debit: 0,
            credit: totals.depTrib,
            gloss: `Abono depreciación acumulada ejercicio ${calculationYear}`
          }
        ],
        totalDebit: totals.depTrib,
        totalCredit: totals.depTrib,
        status: 'Valido' as const,
        origin: 'ACTIVO_FIJO' as const
      };

      await onCentralizeVoucher(voucher);
      alert(`¡Comprobante de Traspaso de Depreciación ($${totals.depTrib.toLocaleString('es-CL')}) generado exitosamente en el Libro Diario!`);
    } catch (err: any) {
      alert("Error al centralizar comprobante: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-black tracking-tight">
              Módulo de Activo Fijo y Depreciación Dual (Art. 31 N° 5 LIR / IFRS)
            </h2>
            <span className="text-[10px] bg-indigo-500/30 border border-indigo-400/50 text-indigo-200 px-2.5 py-0.5 rounded-full font-bold">
              v3.0 Tier-1
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Control de inventario de activos, Corrección Monetaria IPC, Cuadro Tributario y Financiero
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingAsset({});
              setShowModal(true);
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Activo Fijo</span>
          </button>

          <button
            onClick={handleCentralizeDepreciation}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Centralizar Depreciación (${totals.depTrib.toLocaleString('es-CL')})</span>
          </button>
        </div>
      </div>

      {/* PARAMETERS BAR */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600">Año de Ejercicio:</label>
            <input
              type="number"
              value={calculationYear}
              onChange={e => setCalculationYear(Number(e.target.value))}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 w-24"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600">IPC Acumulado (%):</label>
            <input
              type="number"
              step="0.1"
              value={ipcAccumulatedRate}
              onChange={e => setIpcAccumulatedRate(Number(e.target.value))}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 w-24"
            />
          </div>
        </div>

        {/* SUMMARY METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block">VALOR HISTÓRICO</span>
            <span className="font-mono font-bold text-slate-900 text-sm">${totals.historico.toLocaleString('es-CL')}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block">REAJUSTE IPC</span>
            <span className="font-mono font-bold text-indigo-700 text-sm">${totals.reajuste.toLocaleString('es-CL')}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block">DEP. TRIBUTARIA</span>
            <span className="font-mono font-bold text-amber-700 text-sm">${totals.depTrib.toLocaleString('es-CL')}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold block">DEP. IFRS</span>
            <span className="font-mono font-bold text-emerald-700 text-sm">${totals.depIFRS.toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-black uppercase border-b border-slate-300">
                <th className="p-3">Código</th>
                <th className="p-3">Descripción Activo</th>
                <th className="p-3">Categoría</th>
                <th className="p-3">Fecha Compra</th>
                <th className="p-3 text-right">Valor Histórico</th>
                <th className="p-3 text-right">IPC</th>
                <th className="p-3 text-right">Dep. Tributaria ({calculationYear})</th>
                <th className="p-3 text-right">Valor Neto Trib.</th>
                <th className="p-3 text-right">Dep. IFRS ({calculationYear})</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {calculatedTable.length > 0 ? (
                calculatedTable.map(asset => (
                  <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-indigo-900">{asset.code}</td>
                    <td className="p-3 font-bold text-slate-900">{asset.name}</td>
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200">
                        {asset.category}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-600">{asset.acquisitionDate}</td>
                    <td className="p-3 font-mono text-right font-bold text-slate-800">
                      ${asset.valorHistorico.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 font-mono text-right text-indigo-700 font-medium">
                      +${asset.reajusteIPC.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 font-mono text-right font-bold text-amber-800 bg-amber-50/40">
                      ${asset.depreciacionEjercicioTrib.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 font-mono text-right font-bold text-slate-900">
                      ${asset.valorNetoTributario.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 font-mono text-right font-bold text-emerald-800 bg-emerald-50/40">
                      ${asset.depreciacionEjercicioIFRS.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={async () => {
                          if (confirm(`¿Eliminar activo ${asset.code}?`)) {
                            await deleteDoc(doc(db, 'studies', studyId, 'companies', company.id, 'fixedAssets', asset.id));
                            await fetchAssets();
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    No hay activos fijos registrados. Haz clic en "Nuevo Activo Fijo" para comenzar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVO/EDITAR ACTIVO */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Registrar Nuevo Activo Fijo</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Código / Tag:</label>
                  <input
                    type="text"
                    placeholder="Ej: AF-001"
                    value={editingAsset?.code || ''}
                    onChange={e => setEditingAsset(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full border rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nombre / Descripción:</label>
                  <input
                    type="text"
                    placeholder="Ej: Maquinaria Industrial HP"
                    value={editingAsset?.name || ''}
                    onChange={e => setEditingAsset(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border rounded-lg p-2 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fecha Adquisición:</label>
                  <input
                    type="date"
                    value={editingAsset?.acquisitionDate || ''}
                    onChange={e => setEditingAsset(prev => ({ ...prev, acquisitionDate: e.target.value }))}
                    className="w-full border rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor Neto Compra ($):</label>
                  <input
                    type="number"
                    placeholder="Ej: 15000000"
                    value={editingAsset?.acquisitionValue || ''}
                    onChange={e => setEditingAsset(prev => ({ ...prev, acquisitionValue: Number(e.target.value) }))}
                    className="w-full border rounded-lg p-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-amber-50 p-3 rounded-xl border border-amber-200">
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Vida Útil Tributaria (Meses):</label>
                  <input
                    type="number"
                    placeholder="36"
                    value={editingAsset?.usefulLifeTributariaMonths || 36}
                    onChange={e => setEditingAsset(prev => ({ ...prev, usefulLifeTributariaMonths: Number(e.target.value) }))}
                    className="w-full border border-amber-300 rounded-lg p-2 bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Tipo Depreciación Tributaria:</label>
                  <select
                    value={editingAsset?.tipoDepreciacionTributaria || 'LINEAL'}
                    onChange={e => setEditingAsset(prev => ({ ...prev, tipoDepreciacionTributaria: e.target.value as any }))}
                    className="w-full border border-amber-300 rounded-lg p-2 bg-white font-bold"
                  >
                    <option value="LINEAL">Lineal Estándar</option>
                    <option value="ACELERADA_UN_TERCIO">Acelerada 1/3 (Art. 31 N°5)</option>
                    <option value="INSTANTANEA_PROPYME">Instantánea ProPyme (100% Gasto)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-slate-700">Cancelar</button>
              <button onClick={handleSaveAsset} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg">Guardar Activo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
