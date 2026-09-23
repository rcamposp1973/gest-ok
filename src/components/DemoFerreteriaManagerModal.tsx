import React, { useState } from 'react';
import {
  Sparkles,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Users,
  Building2,
  FileSpreadsheet,
  Receipt,
  Landmark,
  Layers,
  FolderKanban,
  Package,
  FileCheck,
  X,
  AlertCircle,
  Clock
} from 'lucide-react';
import { Company } from '../types';
import { generateOrResetDemoFerreteria, isDemoFerreteriaCompany, DEMO_COMPANY_NAME } from '../utils/demoFerreteriaGenerator';

interface DemoFerreteriaManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  currentCompany?: Company | null;
  userEmail?: string;
  userId?: string;
  onSuccess?: () => void;
}

export const DemoFerreteriaManagerModal: React.FC<DemoFerreteriaManagerModalProps> = ({
  isOpen,
  onClose,
  studyId,
  currentCompany,
  userEmail,
  userId,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isDemo = isDemoFerreteriaCompany(currentCompany);

  const handleExecuteReset = async () => {
    const confirmPrompt = window.confirm(
      `¿Desea inicializar/resetear todos los datos del año 2025 de ${DEMO_COMPANY_NAME}?\n\n` +
      `• Se cargarán 10 transacciones diarias de compras, ventas y honorarios.\n` +
      `• Se configurarán 10 trabajadores con remuneraciones e Impuesto Único.\n` +
      `• Se generarán cartolas bancarias 100% conciliadas para los 12 meses.\n` +
      `• Se poblarán F29 pagados, DDJJ de renta (1887, 1879, 1835), RLI, Centros de Costos, Proyectos y Kardex.\n\n` +
      `🔒 Esta acción solo afecta a la empresa de demostración, manteniendo seguras todas las demás empresas.`
    );

    if (!confirmPrompt) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMessage(null);
    setProgressPercent(5);
    setProgressMsg('Iniciando proceso...');

    try {
      const res = await generateOrResetDemoFerreteria(
        studyId,
        userEmail,
        userId,
        (msg, pct) => {
          setProgressMsg(msg);
          setProgressPercent(pct);
        }
      );

      setSuccessMessage(res.message);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error resetting demo data:', err);
      setErrorMsg(err.message || 'Ocurrió un error al preparar la demo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 px-6 py-5 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-md">
              <Sparkles className="w-6 h-6 text-amber-200 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Centro de Control de Demostraciones</h2>
              <p className="text-xs text-amber-100">
                Sociedad Demo: <span className="font-semibold">{DEMO_COMPANY_NAME}</span> (Año 2025)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-sm">
          {/* Security Banner */}
          <div className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Aislamiento Seguro de Demo:</span> Este entorno está protegido. 
              Cualquier cambio, transacción o reseteo que se ejecute en este módulo <strong>SOLO</strong> aplica a la sociedad 
              <span className="font-semibold"> {DEMO_COMPANY_NAME}</span>. Las empresas operativas de tu estudio permanecen 100% intactas y seguras.
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-500">
              Contenido y Módulos Cargados para Presentaciones
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-start gap-2.5">
                <Users className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-xs text-slate-900">10 Trabajadores y Nóminas</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Gerente, Jefe Operaciones, Contador, Ventas, Bodega. Sueldos con Impuesto Único de 2da Categoría y 120 liquidaciones 2025.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-start gap-2.5">
                <Receipt className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-xs text-slate-900">10 Transacciones Diarias</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Compras (Fac 33), Ventas con facturas y boletas (39), honorarios con retención 13.75%, gastos operativos y comprobantes.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-start gap-2.5">
                <Landmark className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-xs text-slate-900">Cartolas Bancarias Conciliadas</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Banco Santander con cargos y abonos 100% conciliados y cuadrados con el Libro Mayor mes a mes.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-start gap-2.5">
                <FileCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-xs text-slate-900">F29, DDJJ y Renta (RLI/F22)</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    12 Formularios 29 pagados, DJ 1887 de sueldos, DJ 1879 de honorarios, DJ 1835 de arriendos y RLI 2025 calculada.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-start gap-2.5">
                <Layers className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-xs text-slate-900">Centros de Costo e Ítems de Gasto</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Distribución en Administración, Ventas Salón, Logística y Obras con trazabilidad por cuentas.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-start gap-2.5">
                <Package className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-xs text-slate-900">Productos, Bodegas y Kardex</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Stock inicial y valorizado de cementos, fierros, herramientas Bosch/Stanley, pinturas y fletes.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progress or status */}
          {loading && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 animate-spin text-amber-600" />
                  <span>{progressMsg}</span>
                </div>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-amber-200/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-900 text-xs animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">¡Demo inicializada con éxito!</span>
                {successMessage}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-900 text-xs animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">Error en la operación</span>
                {errorMsg}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Año de demostración: <strong>2025</strong></span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 sm:flex-none px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cerrar
            </button>

            <button
              onClick={handleExecuteReset}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Generando Base Demo...' : '🔄 Resetear Demo al Estado Inicial'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DemoFerreteriaManagerModal;
