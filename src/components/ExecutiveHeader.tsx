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
      <header className="sticky top-0 z-50 bg-[#1e2e42] text-white border-b border-slate-700/80 shadow-sm flex-shrink-0">
        <div className="max-w-[1750px] mx-auto px-4 py-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* LADO IZQUIERDO: Logo, Nombre de la App, Versión pequeña y Tagline */}
          <div className="flex items-center gap-3">
            <div
              onClick={onGoHome}
              className="w-10 h-10 bg-[#283b54] hover:bg-[#324966] text-white transition-colors rounded-lg border border-slate-600/70 flex items-center justify-center font-bold shadow-xs cursor-pointer flex-shrink-0"
              title="Ir al Inicio"
            >
              <Building2 className="w-5 h-5 stroke-[1.5]" />
            </div>

            <div className="flex flex-col">
              {/* Nombre de la App + Versión más pequeña */}
              <div className="flex items-center gap-2">
                <span
                  onClick={onGoHome}
                  className="font-bold text-lg tracking-tight text-white cursor-pointer hover:text-slate-200 transition-colors"
                >
                  Gest_OK
                </span>
                <span 
                  className="text-[10px] font-mono font-bold bg-[#142130] text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40 shadow-2xs" 
                  title={`Versión actual de la plataforma (${APP_VERSION})`}
                >
                  {APP_VERSION}
                </span>
              </div>

              {/* Tagline */}
              <span className="text-[11px] text-slate-300 font-normal tracking-wide">
                Gestión basada en la Contabilidad
              </span>
            </div>
          </div>

          {/* CENTRO: Nombre de la Empresa Consultora (Sutil) + Empresa Activa (Más grande) */}
          <div className="flex-1 max-w-xl mx-auto text-center px-4 py-1.5 bg-[#142130]/80 rounded-lg border border-slate-700/80 my-1 md:my-0">
            {/* Empresa Consultora / Estudio Contable (Sutil) */}
            <div className="text-[11px] text-slate-300 font-medium tracking-wide flex items-center justify-center gap-1.5">
              <span>{activeStudy?.name || 'Estudio Contable'}</span>
              {selectedPeriod && (
                <span className="text-[10px] font-mono font-semibold bg-[#283b54] text-slate-200 px-1.5 py-0.2 rounded border border-slate-600">
                  Período: {selectedPeriod}
                </span>
              )}
            </div>

            {/* Empresa Activa (Más abajo y más grande) */}
            <h2 className="text-base font-bold text-white tracking-tight truncate max-w-lg mt-0.5">
              {activeCompany ? activeCompany.name : (activeStudy ? activeStudy.name : 'Panel General de Control')}
            </h2>
            {activeCompany?.rut && (
              <p className="text-[11px] font-mono text-slate-400">
                RUT: {activeCompany.rut}
              </p>
            )}
          </div>

          {/* LADO DERECHO: Indicadores Económicos + Bloque de Usuario Organizado */}
          <div className="flex items-center justify-end gap-3 flex-shrink-0">
            
            {/* Widget de 2 Indicadores Fijos con Fecha */}
            <div className="hidden lg:flex flex-col items-end bg-[#142130] px-2.5 py-1.5 rounded-lg border border-slate-700/80">
              {latestRate?.date && (
                <div className="text-[10px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  <span>Al {latestRate.date.split('-').reverse().join('/')}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {selectedIndicators.map(key => {
                  const info = INDICATOR_LABELS[key] || { label: key.toUpperCase(), symbol: key.toUpperCase() };
                  const valStr = formatVal(key, latestRate);
                  return (
                    <div key={key} className="bg-[#1e2e42] px-2 py-0.5 rounded border border-slate-700 text-right min-w-[75px]">
                      <div className="text-[9px] text-slate-400 font-sans font-medium uppercase tracking-wider">
                        {info.label}
                      </div>
                      <div className="text-[11px] font-mono font-bold text-slate-100">
                        {valStr}
                      </div>
                    </div>
                  );
                })}

                {/* Botón rápido para configurar indicadores */}
                <button
                  type="button"
                  onClick={() => setShowConfigModal(true)}
                  className="p-1 bg-[#1e2e42] hover:bg-[#283b54] text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
                  title="Configurar los 2 indicadores visibles"
                >
                  <Settings className="w-3 h-3 stroke-[1.25]" />
                </button>
              </div>
            </div>

            {/* BLOQUE DE USUARIO REORGANIZADO:
                1. Empresa Activa como nombre principal
                2. Abajo: Usuario (email)
                3. Abajo: Rol
                4. Abajo: Opción "Ir al inicio"
            */}
            <div className="bg-[#142130] px-3.5 py-1.5 rounded-lg border border-slate-700/80 text-right flex flex-col items-end min-w-[190px]">
              {/* 1. Empresa Activa como nombre principal */}
              <div className="text-xs font-bold text-white tracking-tight truncate max-w-[210px]" title={activeCompany?.name || activeStudy?.name || 'Gest_OK'}>
                {activeCompany ? activeCompany.name : (activeStudy ? activeStudy.name : 'Gest_OK Corporativo')}
              </div>

              {/* 2. Usuario */}
              <div className="text-[11px] font-mono text-slate-300 truncate max-w-[210px]" title={currentUserEmail || ''}>
                {currentUserEmail || 'usuario@pulsocontable.cl'}
              </div>

              {/* 3. Rol */}
              <div className="text-[10px] font-semibold uppercase text-indigo-300 mt-0.5">
                {getRoleLabel()}
              </div>

              {/* 4. Opción Ir al inicio */}
              <button
                onClick={onGoHome}
                className="mt-1 text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1 hover:underline transition-all"
                title="Volver a la vista principal"
              >
                <Home className="w-3 h-3 stroke-[1.5]" />
                <span>Ir al inicio</span>
              </button>
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
