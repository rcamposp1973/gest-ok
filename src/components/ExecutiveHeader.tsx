import React, { useState, useEffect } from 'react';
import { UserRole, Company, Study } from '../types';
import { generateOfficialChileanIndicators, syncOnlineChileanIndicators, DailyIndicator } from '../utils/chileanEconomicIndicators';
import { Building2, Home, LogOut, Settings, BarChart3, ChevronDown, Check, X, Key } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';
import { APP_VERSION } from '../constants/version';

interface ExecutiveHeaderProps {
  currentUserEmail?: string | null;
  currentUserRole?: UserRole | string | null;
  activeCompany?: Company | null;
  activeStudy?: Study | null;
  selectedPeriod?: string;
  onLogout: () => void;
  onGoHome: () => void;
  onOpenHistoricalRates?: () => void;
}

export const INDICATOR_LABELS: Record<string, { label: string; symbol: string; prefix: string }> = {
  uf: { label: 'UF', symbol: 'UF', prefix: '$' },
  dolar: { label: 'Dólar (USD)', symbol: 'USD', prefix: '$' },
  utm: { label: 'UTM', symbol: 'UTM', prefix: '$' },
  euro: { label: 'Euro (EUR)', symbol: 'EUR', prefix: '$' },
  yen: { label: 'Yen (JPY)', symbol: 'JPY', prefix: '$' },
  ipc: { label: 'IPC Mensual', symbol: 'IPC', prefix: '' },
};

export default function ExecutiveHeader({
  currentUserEmail,
  currentUserRole,
  activeCompany,
  activeStudy,
  selectedPeriod,
  onLogout,
  onGoHome,
  onOpenHistoricalRates
}: ExecutiveHeaderProps) {
  // Saved 2 indicators in localStorage, default ['uf', 'dolar']
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gestok_pref_indicators');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 2) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not load indicator preferences:", e);
    }
    return ['uf', 'dolar'];
  });

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [latestRate, setLatestRate] = useState<DailyIndicator | null>(null);

  useEffect(() => {
    const loadIndicators = async () => {
      const series = await syncOnlineChileanIndicators();
      if (series.length > 0) {
        setLatestRate(series[series.length - 1]);
      }
    };
    loadIndicators();
  }, []);

  const handleSaveIndicators = (newSelection: string[]) => {
    if (newSelection.length === 2) {
      setSelectedIndicators(newSelection);
      localStorage.setItem('gestok_pref_indicators', JSON.stringify(newSelection));
      setShowConfigModal(false);
    }
  };

  const getRoleLabel = () => {
    if (currentUserRole === UserRole.SUPER_USER || currentUserRole === 'SUPER_USER') return 'Super Admin Global';
    if (currentUserRole === UserRole.STUDY_ADMIN || currentUserRole === 'STUDY_ADMIN') return 'Admin Estudio';
    if (currentUserRole === UserRole.ANALYST || currentUserRole === 'ANALYST') return 'Analista Contable';
    return 'Contador';
  };

  const formatVal = (key: string, rateObj: DailyIndicator | null) => {
    if (!rateObj) return '...';
    const raw = (rateObj as any)[key];
    if (raw === undefined || raw === null) return 'N/A';
    if (key === 'ipc') return `${raw > 0 ? '+' : ''}${raw}%`;
    return `$${Number(raw).toLocaleString('es-CL')}`;
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-slate-900 text-white border-b border-slate-800/90 shadow-sm flex-shrink-0">
        <div className="max-w-[1700px] mx-auto px-4 py-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* LADO IZQUIERDO: Logo, Nombre Sistema, Usuario, Rol y Acciones */}
          <div className="flex items-center gap-3">
            <div
              onClick={onGoHome}
              className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors rounded-md border border-slate-700 flex items-center justify-center font-bold shadow-xs cursor-pointer flex-shrink-0"
              title="Ir al Inicio"
            >
              <Building2 className="w-5 h-5 stroke-[1.25]" />
            </div>

            <div className="flex flex-col">
              {/* Línea 1: Nombre del Sistema */}
              <div className="flex items-center gap-2">
                <span
                  onClick={onGoHome}
                  className="font-bold text-base tracking-tight text-white cursor-pointer hover:text-slate-200 transition-colors"
                >
                  Gest_OK
                </span>
                <span className="text-[10px] font-mono font-bold bg-indigo-950/80 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-700/60 shadow-2xs" title={`Versión actual de la plataforma (${APP_VERSION})`}>
                  {APP_VERSION}
                </span>
                <span className="text-slate-400 text-xs hidden sm:inline font-normal">| Plataforma Contable Corporativa</span>
              </div>

              {/* Línea 2: Usuario y Rol */}
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-300 font-mono text-[11px] truncate max-w-[200px]" title={currentUserEmail || ''}>
                  {currentUserEmail}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase bg-slate-800/90 text-slate-200 border border-slate-700">
                  {getRoleLabel()}
                </span>
              </div>

              {/* Línea 3: Botonera Inicio, Cambiar Clave y Cerrar Sesión */}
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  onClick={() => setShowChangePassModal(true)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-950 text-slate-200 hover:text-white text-[11px] font-medium rounded border border-slate-700 transition-colors flex items-center gap-1"
                  title="Modificar tu contraseña de acceso"
                >
                  <Key className="w-3.5 h-3.5 stroke-[1.25]" />
                  <span>Cambiar Clave</span>
                </button>

                <button
                  onClick={onLogout}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-950 text-slate-300 hover:text-rose-300 text-[11px] font-medium rounded border border-slate-700 transition-colors flex items-center gap-1"
                  title="Cerrar la sesión actual de forma segura"
                >
                  <LogOut className="w-3.5 h-3.5 stroke-[1.25]" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </div>
          </div>

          {/* CENTRO: Contexto Activo (Empresa Activa / Estudio Activo) */}
          <div className="flex-1 max-w-xl mx-auto text-center px-3 py-1.5 bg-slate-950/70 rounded-lg border border-slate-800 my-1 md:my-0">
            {activeCompany ? (
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 justify-center">
                  <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">Empresa Activa</span>
                  {selectedPeriod && (
                    <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700">
                      Período: {selectedPeriod}
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-bold text-white truncate max-w-md mt-0.5">
                  {activeCompany.name}
                </h2>
                <p className="text-[11px] font-mono text-slate-400">
                  RUT: {activeCompany.rut || 'Sin RUT'}
                </p>
              </div>
            ) : activeStudy ? (
              <div className="flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">Estudio Contable Activo</span>
                <h2 className="text-sm font-bold text-white truncate max-w-md mt-0.5">
                  {activeStudy.name}
                </h2>
                <p className="text-[11px] font-mono text-slate-400">
                  RUT: {activeStudy.rut || 'Sin RUT'}
                </p>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-1 font-medium">
                Panel General de Control | Gest_OK
              </div>
            )}
          </div>

          {/* LADO DERECHO: Indicadores Fijos (2 seleccionados) + Ajustes y Ver Todos */}
          <div className="flex items-center justify-end gap-2.5 flex-shrink-0">
            {/* Widget de 2 Indicadores Fijos con Fecha Visible */}
            <div className="flex flex-col items-end bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              {latestRate?.date && (
                <div className="text-[10px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  <span>Al {latestRate.date.split('-').reverse().join('/')}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {selectedIndicators.map(key => {
                  const info = INDICATOR_LABELS[key] || { label: key.toUpperCase(), symbol: key.toUpperCase() };
                  const valStr = formatVal(key, latestRate);
                  return (
                    <div key={key} className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-right min-w-[90px]">
                      <div className="text-[10px] text-slate-400 font-sans font-medium uppercase tracking-wider">
                        {info.label}
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-100">
                        {valStr}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Botonera de Gestión de Indicadores */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-medium rounded border border-slate-700 transition-colors flex items-center justify-center gap-1"
                title="Personalizar los 2 indicadores visibles en el encabezado"
              >
                <Settings className="w-3 h-3 stroke-[1.25]" />
                <span>Cambiar</span>
              </button>

              {onOpenHistoricalRates && (
                <button
                  type="button"
                  onClick={onOpenHistoricalRates}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[10px] font-medium rounded border border-slate-700 transition-colors flex items-center justify-center gap-1"
                  title="Abrir tabla histórica completa de indicadores"
                >
                  <BarChart3 className="w-3 h-3 stroke-[1.25]" />
                  <span>Ver Todos</span>
                </button>
              )}
            </div>

          </div>

        </div>
      </header>

      {/* MODAL PARA SELECCIONAR LOS 2 INDICADORES VISIBLES */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-300 max-w-sm w-full p-5 space-y-4 text-slate-800">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-700 stroke-[1.25]" />
                <h3 className="font-bold text-sm text-slate-900">Configurar Indicadores Visibles</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                <X className="w-4 h-4 stroke-[1.25]" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Selecciona exactamente <strong>2 indicadores</strong> que deseas mantener fijos en la barra superior. Tu elección se guardará para todas tus sesiones.
            </p>

            <div className="space-y-2 py-1">
              {Object.keys(INDICATOR_LABELS).map((key) => {
                const isSelected = selectedIndicators.includes(key);
                const info = INDICATOR_LABELS[key];

                const toggleSelection = () => {
                  if (isSelected) {
                    if (selectedIndicators.length > 1) {
                      setSelectedIndicators(selectedIndicators.filter(k => k !== key));
                    }
                  } else {
                    if (selectedIndicators.length < 2) {
                      setSelectedIndicators([...selectedIndicators, key]);
                    } else {
                      // Reemplazar el segundo por el nuevo
                      setSelectedIndicators([selectedIndicators[0], key]);
                    }
                  }
                };

                return (
                  <div
                    key={key}
                    onClick={toggleSelection}
                    className={`p-2.5 rounded border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-slate-100 border-slate-700 text-slate-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[2]" />}
                      </div>
                      <span>{info.label}</span>
                    </div>
                    <span className="font-mono text-slate-600 text-[11px] tabular-nums">
                      {formatVal(key, latestRate)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium border border-slate-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveIndicators(selectedIndicators)}
                disabled={selectedIndicators.length !== 2}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded text-xs font-bold border border-slate-700 shadow-2xs transition-colors"
              >
                Guardar Preferencias
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CAMBIO DE CONTRASEÑA */}
      {showChangePassModal && currentUserEmail && (
        <ChangePasswordModal
          userEmail={currentUserEmail}
          onClose={() => setShowChangePassModal(false)}
        />
      )}
    </>
  );
}
