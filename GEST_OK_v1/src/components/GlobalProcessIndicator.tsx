import React from 'react';
import { useProcess } from '../context/ProcessContext';
import { Loader2, Hourglass, Sparkles, Cpu } from 'lucide-react';

export default function GlobalProcessIndicator() {
  const { isProcessing, message, progress } = useProcess();

  if (!isProcessing) return null;

  const percentage = progress && progress.total && progress.total > 0 && progress.current !== undefined
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : null;

  return (
    <>
      {/* 1. Barra de progreso superior ultra-fluida (Top Loading Bar) */}
      <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-transparent overflow-hidden pointer-events-none">
        {percentage !== null ? (
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-indigo-600 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(99,102,241,0.8)]"
            style={{ width: `${percentage}%` }}
          />
        ) : (
          <div className="h-full w-full bg-slate-100/30 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-indigo-600 animate-[indeterminate_1.5s_infinite_linear] origin-left shadow-[0_0_10px_rgba(99,102,241,0.9)]" />
          </div>
        )}
      </div>

      {/* 2. Indicador Flotante Moderno (Reloj de Arena / Spinner Dinámico) */}
      <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center gap-3.5 max-w-md pointer-events-auto ring-1 ring-white/10">
          
          {/* Icono animado: Reloj de arena moderno con pulso y rotación */}
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 flex-shrink-0 shadow-inner">
            <Hourglass className="w-5 h-5 animate-pulse text-indigo-300" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          {/* Mensajes y Progreso */}
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-wide text-slate-100 flex items-center gap-1.5">
                {message || 'Procesando operación...'}
              </span>
              {percentage !== null && (
                <span className="text-[11px] font-mono font-bold text-emerald-400">
                  {percentage}%
                </span>
              )}
            </div>

            {progress?.stage && (
              <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
                {progress.stage}
              </p>
            )}

            {/* Barra interna de avance si hay conteo de ítems */}
            {percentage !== null && (
              <div className="mt-1.5 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-emerald-400 to-indigo-500 h-full rounded-full transition-all duration-200"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            )}

            {progress && progress.total !== undefined && progress.current !== undefined && (
              <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1">
                <span>Completados: {progress.current} / {progress.total}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
