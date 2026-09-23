import React, { useState, useEffect } from 'react';
import { UserRole, Company, Study } from '../types';
import { generateOfficialChileanIndicators, syncOnlineChileanIndicators, DailyIndicator } from '../utils/chileanEconomicIndicators';
import { Building2, Home, LogOut, Settings, BarChart3, ChevronDown, Check, X, Key, Activity, ShieldCheck } from 'lucide-react';
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
    if (currentUserRole === UserRole.OBSERVER || currentUserRole === 'OBSERVER') return 'Cliente Observador';
    return 'Contador';
  };

  const formatVal = (key: string, rateObj: DailyIndicator | null) => {
    if (!rateObj) return '...';
    const raw = (rateObj as any)[key];
    if (raw === undefined || raw === null) return 'N/A';
    if (key === 'ipc') {
      const num = Number(raw);
      return `${num > 0 ? '+' : ''}${num.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
    }
    if (key === 'utm') {
      return `$${Math.round(Number(raw)).toLocaleString('es-CL')}`;
    }
    return `$${Number(raw).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md text-[#0D253D] border-b border-slate-200/80 shadow-xs flex-shrink-0">
        <div className="max-w-[1800px] mx-auto px-4 py-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 min-h-[52px]">
          
          {/* LADO IZQUIERDO: Logo oficial Pulso Contable / Gest_OK con Gradiente y Onda */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onGoHome}
              className="flex items-center gap-2.5 group cursor-pointer text-left focus:outline-hidden"
              title="Ir al Inicio / Selección de Estudio y Empresa"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#533AFD] to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform shrink-0">
                <Activity className="w-4.5 h-4.5 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight text-[#0D253D] group-hover:text-[#533AFD] transition-colors">
                    Pulso Contable
                  </span>
                  <span 
                    className="text-[10px] font-mono font-bold bg-indigo-50 text-[#533AFD] px-2 py-0.5 rounded-full border border-indigo-100 leading-none"
                  >
                    Gest_OK
                  </span>
                  <span 
                    className="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 leading-none hidden sm:inline" 
                    title={`Versión actual de la plataforma (${APP_VERSION})`}
                  >
                    {APP_VERSION}
                  </span>
                </div>
                <div className="text-[10px] text-[#64748D] hidden xl:block font-medium">
                  Gestión basada en la Contabilidad
                </div>
              </div>
            </button>
          </div>

          {/* CENTRO: Contexto Activo (Estudio + Empresa Activa + RUT) */}
          <div className="flex-1 max-w-xl mx-auto text-center px-3.5 py-1.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors rounded-xl border border-slate-200/80 my-0.5 md:my-0 shadow-2xs">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <span className="truncate max-w-[200px] text-slate-600 font-medium" title={activeStudy?.name || 'Estudio Contable'}>
                {activeStudy?.name || 'Estudio Contable'}
              </span>
              <span className="text-slate-400">/</span>
              <span className="font-bold text-[#0D253D] tracking-tight truncate max-w-[260px]" title={activeCompany ? activeCompany.name : 'Panel General'}>
                {activeCompany ? activeCompany.name : 'Panel General'}
              </span>
              {activeCompany?.rut && (
                <span className="text-[10px] font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                  {activeCompany.rut}
                </span>
              )}
            </div>
          </div>

          {/* LADO DERECHO: Indicadores Económicos Oficiales + Bloque de Usuario Organizado */}
          <div className="flex items-center justify-end gap-2.5 flex-shrink-0">
            
            {/* Widget de 2 Indicadores Fijos con Fecha */}
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-50/90 px-2.5 py-1 rounded-xl border border-slate-200/80 text-right shadow-2xs">
              {latestRate?.date && (
                <span className="text-[9px] font-mono text-slate-500 mr-1 hidden 2xl:inline" title="Fecha del valor oficial">
                  {latestRate.date.split('-').reverse().join('/')}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                {selectedIndicators.map(key => {
                  const info = INDICATOR_LABELS[key] || { label: key.toUpperCase(), symbol: key.toUpperCase() };
                  const valStr = formatVal(key, latestRate);
                  const isUF = key === 'uf';
                  return (
                    <div key={key} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 text-right min-w-[70px] shadow-2xs">
                      <div className="text-[9px] text-slate-500 font-sans font-bold uppercase tracking-wider leading-tight">
                        {info.label}
                      </div>
                      <div className={`text-xs font-mono font-extrabold ${isUF ? 'text-[#533AFD]' : 'text-[#059669]'} leading-tight tabular-nums`}>
                        {valStr}
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setShowConfigModal(true)}
                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                  title="Configurar indicadores visibles"
                >
                  <Settings className="w-3.5 h-3.5 stroke-[1.5]" />
                </button>
              </div>
            </div>

            {/* BLOQUE DE USUARIO COMPACTO & ELEGANTE */}
            <div className="bg-slate-50/90 px-3 py-1 rounded-xl border border-slate-200/80 flex items-center gap-2.5 shadow-2xs">
              <div className="text-right">
                <div className="text-xs font-mono font-semibold text-[#0D253D] truncate max-w-[160px] leading-tight" title={currentUserEmail || ''}>
                  {currentUserEmail || 'usuario'}
                </div>
                <div className="text-[9px] font-bold uppercase text-[#533AFD] leading-tight tracking-wider">
                  {getRoleLabel()}
                </div>
              </div>

              <div className="h-5 w-px bg-slate-200"></div>

              {/* Acciones Rápidas */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onGoHome}
                  className="p-1.5 text-slate-500 hover:text-[#0D253D] hover:bg-white rounded-lg transition-colors cursor-pointer"
                  title="Volver a la selección de empresas"
                >
                  <Home className="w-3.5 h-3.5" />
                </button>

                {currentUserEmail && (
                  <button
                    type="button"
                    onClick={() => setShowChangePassModal(true)}
                    className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    title="Cambiar contraseña de acceso"
                  >
                    <Key className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
