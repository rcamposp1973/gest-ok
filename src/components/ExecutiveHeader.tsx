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
    if (currentUserRole === UserRole.SUPER_USER || currentUserRole === 'SUPER_USER') return '🛡️ Super Admin Global';
    if (currentUserRole === UserRole.STUDY_ADMIN || currentUserRole === 'STUDY_ADMIN') return '🏢 Admin Estudio Contable';
    if (currentUserRole === UserRole.ANALYST || currentUserRole === 'ANALYST') return '📊 Analista Contable';
    if (currentUserRole === UserRole.OBSERVER || currentUserRole === 'OBSERVER') return '👁️ Cliente Observador';
    return '💼 Contador';
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
      <header className="sticky top-0 z-50 bg-[#0f172a] text-white border-b border-slate-800 shadow-xs flex-shrink-0">
        <div className="max-w-[1800px] mx-auto px-4 py-1.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 min-h-[48px]">
          
          {/* LADO IZQUIERDO: Logo, Nombre de la App, Versión y Tagline */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onGoHome}
              className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors rounded-md border border-slate-700/80 flex items-center justify-center cursor-pointer shadow-2xs"
              title="Ir al Inicio / Selección de Estudio y Empresa"
            >
              <Building2 className="w-4 h-4 stroke-[1.75] text-indigo-300" />
            </button>

            <div className="flex items-center gap-2">
              <span
                onClick={onGoHome}
                className="font-bold text-base tracking-tight text-white cursor-pointer hover:text-slate-200 transition-colors select-none"
              >
                Gest_OK
              </span>
              <span 
                className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 leading-none" 
                title={`Versión actual de la plataforma (${APP_VERSION})`}
              >
                {APP_VERSION}
              </span>
              <span className="hidden xl:inline text-slate-600 select-none">•</span>
              <span className="hidden xl:inline text-[11px] text-slate-400 font-normal">
                Gestión basada en la Contabilidad
              </span>
            </div>
          </div>

          {/* CENTRO: Contexto Activo (Estudio + Empresa Activa + RUT) */}
          <div className="flex-1 max-w-xl mx-auto text-center px-3 py-1 bg-slate-900/90 rounded-md border border-slate-800/90 my-0.5 md:my-0">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <span className="truncate max-w-[200px]" title={activeStudy?.name || 'Estudio Contable'}>
                {activeStudy?.name || 'Estudio Contable'}
              </span>
              <span className="text-slate-600">/</span>
              <span className="font-semibold text-white tracking-tight truncate max-w-[260px]" title={activeCompany ? activeCompany.name : 'Panel General'}>
                {activeCompany ? activeCompany.name : 'Panel General'}
              </span>
              {activeCompany?.rut && (
                <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                  {activeCompany.rut}
                </span>
              )}
            </div>
          </div>

          {/* LADO DERECHO: Indicadores Económicos Oficiales + Bloque de Usuario Organizado */}
          <div className="flex items-center justify-end gap-2.5 flex-shrink-0">
            
            {/* Widget de 2 Indicadores Fijos con Fecha */}
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-md border border-slate-800 text-right">
              {latestRate?.date && (
                <span className="text-[9px] font-mono text-slate-400 mr-1 hidden 2xl:inline" title="Fecha del valor oficial">
                  {latestRate.date.split('-').reverse().join('/')}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                {selectedIndicators.map(key => {
                  const info = INDICATOR_LABELS[key] || { label: key.toUpperCase(), symbol: key.toUpperCase() };
                  const valStr = formatVal(key, latestRate);
                  return (
                    <div key={key} className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/80 text-right min-w-[70px]">
                      <div className="text-[9px] text-slate-400 font-sans font-medium uppercase tracking-wider leading-tight">
                        {info.label}
                      </div>
                      <div className="text-[11px] font-mono font-semibold text-slate-100 leading-tight">
                        {valStr}
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setShowConfigModal(true)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
                  title="Configurar indicadores visibles"
                >
                  <Settings className="w-3 h-3 stroke-[1.5]" />
                </button>
              </div>
            </div>

            {/* BLOQUE DE USUARIO COMPACTO & ELEGANTE */}
            <div className="bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 flex items-center gap-2.5">
              <div className="text-right">
                <div className="text-[11px] font-mono font-medium text-slate-200 truncate max-w-[160px] leading-tight" title={currentUserEmail || ''}>
                  {currentUserEmail || 'usuario'}
                </div>
                <div className="text-[9px] font-semibold uppercase text-indigo-300 leading-tight tracking-wider">
                  {getRoleLabel()}
                </div>
              </div>

              <div className="h-5 w-px bg-slate-800"></div>

              {/* Acciones Rápidas */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onGoHome}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  title="Volver a la selección de empresas"
                >
                  <Home className="w-3.5 h-3.5" />
                </button>

                {currentUserEmail && (
                  <button
                    type="button"
                    onClick={() => setShowChangePassModal(true)}
                    className="p-1 text-slate-300 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors"
                    title="Cambiar contraseña de acceso"
                  >
                    <Key className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors"
                  title="Cerrar sesión segura"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
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
