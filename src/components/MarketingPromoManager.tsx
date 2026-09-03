import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { MarketingPromoConfig } from '../types';
import { logAuditEvent } from '../utils/auditLogger';
import {
  Megaphone,
  Save,
  MessageCircle,
  Eye,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Link,
  Phone,
  HelpCircle,
  RefreshCw,
  Power,
  Layers,
  Palette
} from 'lucide-react';

const DEFAULT_CONFIG: MarketingPromoConfig = {
  enabled: false, // Oculto por defecto según requerimiento
  badgeText: 'WhatsApp Oficial',
  headline: 'Pide tu prueba gratis de 15 días',
  whatsappNumber: '56946318783',
  whatsappCustomMessage: 'Hola!! Quiero usar GEST_OK y solicitar mi prueba gratis.',
  targetUrl: '',
  actionType: 'whatsapp',
  buttonColor: '#25D366'
};

const COLOR_PRESETS = [
  { label: 'Verde WhatsApp', value: '#25D366', ring: 'ring-[#25D366]' },
  { label: 'Índigo Corporativo', value: '#4F46E5', ring: 'ring-indigo-600' },
  { label: 'Esmeralda', value: '#059669', ring: 'ring-emerald-600' },
  { label: 'Morado Real', value: '#7C3AED', ring: 'ring-purple-600' },
  { label: 'Ámbar Cálido', value: '#D97706', ring: 'ring-amber-600' },
  { label: 'Azul Marino', value: '#1E40AF', ring: 'ring-blue-700' },
];

export default function MarketingPromoManager() {
  const { currentUser } = useAuth();
  const [config, setConfig] = useState<MarketingPromoConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const docRef = doc(db, 'system_config', 'marketing_promo');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<MarketingPromoConfig>;
          setConfig({
            ...DEFAULT_CONFIG,
            ...data
          });
        } else {
          setConfig(DEFAULT_CONFIG);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching marketing promo config:', err);
        setErrorMessage('No se pudo cargar la configuración en tiempo real.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage('');

    try {
      const docRef = doc(db, 'system_config', 'marketing_promo');
      const payload: MarketingPromoConfig = {
        ...config,
        headline: config.headline.trim() || 'Pide tu prueba gratis de 15 días',
        badgeText: config.badgeText.trim() || 'WhatsApp Oficial',
        whatsappNumber: config.whatsappNumber.replace(/[^0-9]/g, '') || '56946318783',
        whatsappCustomMessage: config.whatsappCustomMessage.trim() || 'Hola!! Quiero usar GEST_OK',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || 'super_admin'
      };

      await setDoc(docRef, payload, { merge: true });

      await logAuditEvent({
        userId: currentUser?.uid || 'super_admin',
        userEmail: currentUser?.email || 'super_admin@pulsocontable.cl',
        userRole: 'SUPER_USER',
        action: 'MODIFICAR',
        module: 'MARKETING_PROMO',
        details: `Super Admin actualizó botón promocional de portada: Estado=${payload.enabled ? 'ACTIVO' : 'DESACTIVADO (OCULTO)'}, Texto="${payload.headline}"`,
        metadata: payload
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error saving marketing promo config:', err);
      setErrorMessage(`Error al guardar: ${err.message || 'Intente nuevamente'}`);
    } finally {
      setSaving(false);
    }
  };

  // Build simulated link for preview
  const previewHref =
    config.actionType === 'whatsapp'
      ? `https://wa.me/${config.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
          config.whatsappCustomMessage
        )}`
      : config.targetUrl || '#';

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center gap-3 text-slate-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Cargando configuración de promoción...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-[11px] font-bold tracking-wide uppercase text-indigo-300">
            <Megaphone className="w-3.5 h-3.5" />
            <span>Control de Marketing & Promoción</span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">
            Gestión del Botón Promocional en Portada
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl">
            Permite activar, desactivar y redactar a discreción el botón flotante que visualizan los visitantes en la pantalla de inicio y acceso al sistema.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`px-3.5 py-2 rounded-xl border text-xs font-black flex items-center gap-2 ${
              config.enabled
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                config.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>{config.enabled ? 'BOTÓN VISIBLE EN PORTADA' : 'BOTÓN OCULTO (DESACTIVADO)'}</span>
          </div>
        </div>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Configuración guardada y sincronizada exitosamente. Los cambios son visibles de inmediato en la pantalla de inicio.</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Controls (Left Column) */}
        <div className="lg:col-span-7 space-y-5">
          <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            {/* Master Toggle */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <label htmlFor="promo-toggle" className="text-sm font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
                  <Power className={`w-4 h-4 ${config.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Estado del Botón Promocional</span>
                </label>
                <p className="text-xs text-slate-500">
                  {config.enabled
                    ? 'El botón está actualmente activo y visible para cualquier visitante.'
                    : 'El botón está oculto y nadie puede verlo en la portada.'}
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  id="promo-toggle"
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Content Fields */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Textos del Botón</span>
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Texto Principal / Llamado a la Acción (Headline) *
                </label>
                <input
                  type="text"
                  value={config.headline}
                  onChange={(e) => setConfig({ ...config, headline: e.target.value })}
                  placeholder="Ej: Pide tu prueba gratis de 15 días"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Este es el texto principal destacado en negrita dentro del botón.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Etiqueta Superior / Subtítulo (Badge)
                </label>
                <input
                  type="text"
                  value={config.badgeText}
                  onChange={(e) => setConfig({ ...config, badgeText: e.target.value })}
                  placeholder="Ej: WhatsApp Oficial / Promoción Especial"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Texto pequeño en mayúsculas que aparece justo arriba del texto principal.
                </p>
              </div>
            </div>

            {/* Destination Configuration */}
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Link className="w-3.5 h-3.5 text-indigo-600" />
                <span>Destino del Clic</span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, actionType: 'whatsapp' })}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    config.actionType === 'whatsapp'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <MessageCircle className="w-4 h-4 text-[#25D366]" />
                  <span>Chat de WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfig({ ...config, actionType: 'url' })}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    config.actionType === 'url'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-800 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Link className="w-4 h-4 text-indigo-600" />
                  <span>Enlace Web / URL</span>
                </button>
              </div>

              {config.actionType === 'whatsapp' ? (
                <div className="space-y-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                  <div>
                    <label className="block text-xs font-bold text-emerald-950 mb-1 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Número de WhatsApp (con código de país) *</span>
                    </label>
                    <input
                      type="text"
                      value={config.whatsappNumber}
                      onChange={(e) => setConfig({ ...config, whatsappNumber: e.target.value })}
                      placeholder="Ej: 56946318783"
                      className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-200"
                    />
                    <p className="text-[10px] text-emerald-700 mt-1">
                      Para Chile usa el formato: 569XXXXXXXX (sin signos '+' ni espacios).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-emerald-950 mb-1">
                      Mensaje Predeterminado al Iniciar Chat *
                    </label>
                    <textarea
                      rows={2}
                      value={config.whatsappCustomMessage}
                      onChange={(e) => setConfig({ ...config, whatsappCustomMessage: e.target.value })}
                      placeholder="Ej: Hola!! Quiero usar GEST_OK y pedir mi prueba gratis de 15 días."
                      className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                  <label className="block text-xs font-bold text-indigo-950 mb-1">
                    URL de Destino (Enlace) *
                  </label>
                  <input
                    type="url"
                    value={config.targetUrl || ''}
                    onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
                    placeholder="https://tupagina.cl/registro-promocion"
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              )}
            </div>

            {/* Color Appearance */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Palette className="w-3.5 h-3.5 text-indigo-600" />
                <span>Color y Apariencia</span>
              </h3>

              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setConfig({ ...config, buttonColor: preset.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                      config.buttonColor === preset.value
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-indigo-400'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow-inner"
                      style={{ backgroundColor: preset.value }}
                    />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Guardando Cambios...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Guardar y Aplicar en Portada</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Live Simulator (Right Column) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 text-white shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold tracking-tight text-slate-200">
                  Vista Previa en Vivo (Portada)
                </span>
              </div>
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  config.enabled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {config.enabled ? 'Visible' : 'Oculto'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400">
              Así es exactamente como se representará el botón flotante en la pantalla principal para todos los usuarios:
            </p>

            {/* Simulation Canvas */}
            <div className="relative h-64 bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-hidden flex flex-col justify-between p-4">
              {/* Mock background elements */}
              <div className="space-y-2 opacity-30 pointer-events-none">
                <div className="h-3 w-28 bg-slate-700 rounded"></div>
                <div className="h-2 w-44 bg-slate-800 rounded"></div>
                <div className="h-16 w-full bg-slate-900 border border-slate-800 rounded-lg"></div>
              </div>

              <div className="text-[10px] text-slate-500 text-center font-mono select-none">
                [ Simulación de Pantalla de Acceso / Login ]
              </div>

              {/* Live floating button */}
              <div className="flex justify-end items-end">
                {config.enabled ? (
                  <a
                    href={previewHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      // Prevent navigation in demo preview if needed or open
                    }}
                    style={{ backgroundColor: config.buttonColor || '#25D366' }}
                    className="flex items-center gap-3 text-white px-3.5 py-2.5 rounded-full shadow-2xl transition-all duration-200 border border-white/20 hover:scale-105 active:scale-95 group max-w-full"
                    title={config.headline}
                  >
                    <div className="w-8 h-8 bg-white/25 group-hover:bg-white/35 rounded-full flex items-center justify-center shrink-0 transition-colors shadow-inner">
                      {config.actionType === 'whatsapp' ? (
                        <MessageCircle className="w-4 h-4 text-white fill-white/40 stroke-[2.2]" />
                      ) : (
                        <Link className="w-4 h-4 text-white stroke-[2.2]" />
                      )}
                    </div>
                    <div className="flex flex-col text-left pr-1 min-w-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-black/40 leading-none truncate">
                        {config.badgeText || 'WhatsApp Oficial'}
                      </span>
                      <span className="text-xs font-extrabold text-white tracking-tight leading-tight mt-0.5 truncate">
                        {config.headline || 'Pide tu prueba gratis'}
                      </span>
                    </div>
                  </a>
                ) : (
                  <div className="bg-slate-800/90 border border-dashed border-slate-700 px-4 py-3 rounded-xl text-center text-slate-400 text-xs w-full flex flex-col items-center gap-1">
                    <Power className="w-4 h-4 text-slate-500" />
                    <span className="font-bold text-slate-300">Botón desactivado</span>
                    <span className="text-[10px] text-slate-500">
                      El botón no se muestra en la pantalla de inicio mientras permanezca desactivado.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick tips */}
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1 text-[11px] text-slate-300">
              <div className="font-bold text-white flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                <span>Consejo para Campañas:</span>
              </div>
              <p className="text-slate-400">
                Puedes cambiar el texto en fechas comerciales clave como *Cierre de Mes*, *Operación Renta*, o *Black Friday*, y reactivarlo cuando desees captar nuevos estudios contables.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
