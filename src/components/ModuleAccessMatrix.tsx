import React from 'react';
import { 
  StudyModulePermissions, 
  StudySubscriptionStatus 
} from '../types';
import { 
  StudyPlanCode, 
  OFFICIAL_SUBSCRIPTION_PLANS, 
  SYSTEM_MODULES_CATALOG, 
  getDefaultModulesForPlan,
  getOfficialPlansList 
} from '../constants/subscriptionPlans';
import { 
  Shield, 
  Check, 
  X, 
  Sparkles, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  HelpCircle, 
  Layers, 
  Users, 
  Building2, 
  CreditCard,
  Eye,
  DollarSign
} from 'lucide-react';

interface ModuleAccessMatrixProps {
  selectedPlanCode: StudyPlanCode | string;
  modules: StudyModulePermissions;
  subscriptionStatus: StudySubscriptionStatus;
  maxCompanies: number;
  maxUsers: number;
  paymentNotes?: string;
  readOnly?: boolean;
  onPlanChange?: (planCode: StudyPlanCode, maxCompanies: number, maxUsers: number, defaultModules: StudyModulePermissions) => void;
  onModulesChange?: (updatedModules: StudyModulePermissions) => void;
  onSubscriptionStatusChange?: (status: StudySubscriptionStatus) => void;
  onMaxCompaniesChange?: (val: number) => void;
  onMaxUsersChange?: (val: number) => void;
  onPaymentNotesChange?: (val: string) => void;
}

export default function ModuleAccessMatrix({
  selectedPlanCode,
  modules,
  subscriptionStatus = 'Vigente',
  maxCompanies,
  maxUsers,
  paymentNotes = '',
  readOnly = false,
  onPlanChange,
  onModulesChange,
  onSubscriptionStatusChange,
  onMaxCompaniesChange,
  onMaxUsersChange,
  onPaymentNotesChange
}: ModuleAccessMatrixProps) {
  const officialPlans = getOfficialPlansList();
  const currentPlanDef = OFFICIAL_SUBSCRIPTION_PLANS[selectedPlanCode as StudyPlanCode] || OFFICIAL_SUBSCRIPTION_PLANS.CUSTOM;

  const handleSelectPlanPreset = (code: StudyPlanCode) => {
    if (readOnly || !onPlanChange) return;
    const plan = OFFICIAL_SUBSCRIPTION_PLANS[code];
    if (plan) {
      onPlanChange(code, plan.maxCompanies, plan.maxUsers, { ...plan.defaultModules });
    }
  };

  const handleToggleModule = (key: keyof StudyModulePermissions) => {
    if (readOnly || !onModulesChange) return;
    const currentVal = Boolean(modules[key]);
    const nextModules = {
      ...modules,
      [key]: !currentVal
    };
    onModulesChange(nextModules);
  };

  const handleEnableAllModules = () => {
    if (readOnly || !onModulesChange) return;
    const allEnabled: StudyModulePermissions = {};
    SYSTEM_MODULES_CATALOG.forEach(m => {
      allEnabled[m.key] = true;
    });
    onModulesChange(allEnabled);
  };

  const handleResetToPlanDefaults = () => {
    if (readOnly || !onModulesChange) return;
    const defaults = getDefaultModulesForPlan(selectedPlanCode);
    onModulesChange(defaults);
  };

  return (
    <div className="space-y-6">
      {/* 1. SELECTOR DE PLANES PREDEFINIDOS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Planes de Suscripción Oficiales</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Selecciona un plan base para autocompletar límites de empresas, usuarios y accesos estándar.
            </p>
          </div>
          {selectedPlanCode && (
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
              Plan Activo: {currentPlanDef.name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {officialPlans.map((plan) => {
            const isSelected = selectedPlanCode === plan.code;
            return (
              <div
                key={plan.code}
                onClick={() => !readOnly && handleSelectPlanPreset(plan.code)}
                className={`relative rounded-xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-50/70 border-indigo-600 ring-2 ring-indigo-500/20 shadow-md'
                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/60 shadow-xs'
                } ${readOnly ? 'cursor-default' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-2.5 right-3 bg-indigo-600 text-white text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shadow-xs">
                    Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-900">{plan.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                      {plan.badge}
                    </span>
                  </div>

                  <div className="mb-2">
                    <span className="text-sm font-black font-mono text-indigo-600">
                      {plan.priceText}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium"> {plan.period}</span>
                  </div>

                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed mb-3">
                    {plan.subtitle}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    {plan.maxCompanies} {plan.maxCompanies === 1 ? 'Empresa' : 'Empresas'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" />
                    {plan.maxUsers} {plan.maxUsers === 1 ? 'Usuario' : 'Usuarios'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. ESTADO DE SUSCRIPCIÓN & CONTROL DE MOROSIDAD */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-600" />
            <span>Estado de Suscripción / Acceso</span>
          </label>
          <select
            value={subscriptionStatus}
            disabled={readOnly}
            onChange={(e) => onSubscriptionStatusChange && onSubscriptionStatusChange(e.target.value as StudySubscriptionStatus)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="Vigente">🟢 Vigente (Acceso Completo)</option>
            <option value="Solo_Lectura">🟡 Solo Lectura / Consulta (Período de Gracia)</option>
            <option value="Suspendido_Pago">🔴 Suspendido / Bloqueado por Pago</option>
            <option value="Sin_Vigencia">⚪ Sin Vigencia (Inactivo)</option>
          </select>
          <p className="text-[10px] text-slate-500 mt-1">
            {subscriptionStatus === 'Vigente' && 'El cliente puede operar normalmente en todos sus módulos habilitados.'}
            {subscriptionStatus === 'Solo_Lectura' && 'Puede entrar a consultar reportes y exportar, pero no puede crear ni editar datos.'}
            {subscriptionStatus === 'Suspendido_Pago' && 'Acceso bloqueado por morosidad. Muestra pantalla para regularizar pago.'}
            {subscriptionStatus === 'Sin_Vigencia' && 'Cuenta desactivada totalmente.'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-600" />
            <span>Límite de Empresas</span>
          </label>
          <input
            type="number"
            min="1"
            value={maxCompanies}
            disabled={readOnly}
            onChange={(e) => onMaxCompaniesChange && onMaxCompaniesChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
          />
          <p className="text-[10px] text-slate-500 mt-1">Cantidad máxima de empresas/RUTs que puede administrar.</p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-600" />
            <span>Límite de Usuarios</span>
          </label>
          <input
            type="number"
            min="1"
            value={maxUsers}
            disabled={readOnly}
            onChange={(e) => onMaxUsersChange && onMaxUsersChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
          />
          <p className="text-[10px] text-slate-500 mt-1">Cantidad de usuarios (Admin + Analistas/Observadores).</p>
        </div>
      </div>

      {/* 3. GRILLA DE ACCESOS Y MÓDULOS (FEATURE MATRIX) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span>🎛️</span>
              <span>Grilla de Accesos a Módulos del Sistema (Feature Matrix)</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Activa o desactiva módulos individualmente según lo contratado o requerimientos del cliente.
            </p>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetToPlanDefaults}
                className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Valores por Defecto del Plan
              </button>
              <button
                type="button"
                onClick={handleEnableAllModules}
                className="text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Habilitar Todos los Módulos
              </button>
            </div>
          )}
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SYSTEM_MODULES_CATALOG.map((mod) => {
            const isEnabled = Boolean(modules[mod.key]);
            const isDefaultInPlan = Boolean(currentPlanDef.defaultModules[mod.key]);
            const isAddon = isEnabled && !isDefaultInPlan;

            return (
              <div
                key={mod.key}
                onClick={() => handleToggleModule(mod.key)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isEnabled
                    ? 'bg-white border-indigo-300 ring-1 ring-indigo-500/10 shadow-xs'
                    : 'bg-slate-50/60 border-slate-200 opacity-75 hover:opacity-100'
                } ${readOnly ? 'cursor-default' : ''}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{mod.icon}</span>
                      <span className={`text-xs font-bold ${isEnabled ? 'text-slate-900' : 'text-slate-500'}`}>
                        {mod.label}
                      </span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={readOnly}
                        onChange={() => handleToggleModule(mod.key)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {mod.description}
                  </p>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider">
                    {mod.category.replace('_', ' ')}
                  </span>
                  {isEnabled ? (
                    isAddon ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">
                        ⭐ Módulo Adicional (+ Cobro)
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                        ✓ Incluido en Plan
                      </span>
                    )
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                      🔒 No Habilitado
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. NOTAS COMERCIALES / PACTACIÓN ADICIONAL */}
      <div>
        <label className="block text-xs font-bold uppercase text-slate-700 mb-1 flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-slate-600" />
          <span>Notas Comerciales & Módulos Adicionales Facturados</span>
        </label>
        <input
          type="text"
          value={paymentNotes}
          disabled={readOnly}
          onChange={(e) => onPaymentNotesChange && onPaymentNotesChange(e.target.value)}
          placeholder="Ej: Plan Entrada con adicional de KPIs (+0.2 UF). Cobro mensual por transferencia directa."
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
    </div>
  );
}
