import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Plan } from '../types';
import { 
  OFFICIAL_SUBSCRIPTION_PLANS, 
  SYSTEM_MODULES_CATALOG, 
  StudyPlanCode, 
  getDefaultModulesForPlan,
  getOfficialPlansList 
} from '../constants/subscriptionPlans';
import { 
  CreditCard, 
  ShieldCheck, 
  Layers, 
  Check, 
  X, 
  Sparkles, 
  Plus, 
  Trash2, 
  Info, 
  Building2, 
  Users,
  Award
} from 'lucide-react';

export default function PlanManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [maxCompanies, setMaxCompanies] = useState(10);
  const [maxUsers, setMaxUsers] = useState(3);
  const [priceUF, setPriceUF] = useState(1.5);
  const [activeTab, setActiveTab] = useState<'official' | 'matrix' | 'custom'>('official');

  const officialPlans = getOfficialPlansList();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'plans'), (snapshot) => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan)));
    });
    return () => unsubscribe();
  }, []);

  const handleAddCustomPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addDoc(collection(db, 'plans'), { 
      name: name.trim(), 
      maxCompanies: Number(maxCompanies) || 1, 
      maxUsers: Number(maxUsers) || 1,
      priceUF: Number(priceUF) || 0,
      createdAt: new Date().toISOString()
    });
    setName(''); 
    setMaxCompanies(10); 
    setMaxUsers(3);
    setPriceUF(1.5);
  };

  const handleDeleteCustomPlan = async (id: string) => {
    if (window.confirm('¿Seguro que deseas eliminar este plan personalizado?')) {
      await deleteDoc(doc(db, 'plans', id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">Catálogo y Grilla de Planes de Suscripción</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gestión de la estructura de planes oficiales, asignación de módulos y límites por estudio contable.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveTab('official')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'official' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-indigo-600" /> Planes Oficiales (4)
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'matrix' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" /> Matriz Comparativa de Módulos
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'custom' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" /> Planes Personalizados ({plans.length})
          </button>
        </div>
      </div>

      {/* TAB 1: PLANES OFICIALES */}
      {activeTab === 'official' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {officialPlans.map((plan) => {
            const isPop = plan.code === 'PLAN_ESTUDIO_10';
            const isFull = plan.code === 'PLAN_ESTUDIO_FULL';
            const isCorp = plan.code === 'PLAN_CORPORATIVO';

            return (
              <div 
                key={plan.code}
                className={`relative bg-white rounded-2xl border transition-all flex flex-col justify-between ${
                  isPop 
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md' 
                    : isCorp
                    ? 'border-slate-800 shadow-sm'
                    : 'border-slate-200 shadow-sm'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-indigo-600 text-white text-[10px] font-black uppercase px-3 py-0.5 rounded-full shadow-sm tracking-wide">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="p-5 flex-1">
                  <div className="mb-4">
                    <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">{plan.code}</span>
                    <h3 className="text-base font-black text-slate-900 mt-0.5">{plan.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{plan.subtitle}</p>
                  </div>

                  {/* Price */}
                  <div className="py-3 px-3.5 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900">{plan.priceText}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Facturación mensual en UF + IVA</p>
                  </div>

                  {/* Capacity Limits */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-100/50 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] text-indigo-700 font-semibold mb-0.5">
                        <Building2 className="w-3.5 h-3.5" /> Empresas
                      </div>
                      <span className="text-sm font-black text-indigo-950">
                        {plan.maxCompanies >= 999 ? 'Ilimitadas' : plan.maxCompanies}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] text-slate-600 font-semibold mb-0.5">
                        <Users className="w-3.5 h-3.5" /> Usuarios
                      </div>
                      <span className="text-sm font-black text-slate-900">
                        {plan.maxUsers >= 999 ? 'Ilimitados' : plan.maxUsers}
                      </span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Características:</span>
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span className="leading-tight">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-b-2xl border-t border-slate-100 text-center">
                  <span className="text-[11px] font-medium text-slate-500">
                    Módulos activos: <strong className="text-slate-900">{Object.values(plan.defaultModules).filter(Boolean).length} / {SYSTEM_MODULES_CATALOG.length}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: MATRIZ COMPARATIVA DE MÓDULOS */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Matriz de Acceso por Módulo y Plan</h3>
              <p className="text-xs text-slate-500">Comprueba qué funcionalidades están disponibles por defecto en cada plan de suscripción.</p>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-3 py-1 rounded-full">
              {SYSTEM_MODULES_CATALOG.length} Módulos del Sistema
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-1/3">Módulo / Capacidad</th>
                  {officialPlans.map(p => (
                    <th key={p.code} className="py-3 px-3 text-center">
                      <span className="font-bold text-slate-900">{p.name}</span>
                      <span className="block text-[9px] text-slate-500">{p.priceText}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {/* Categorías de Módulos */}
                {(['CONTABILIDAD', 'TRIBUTARIO', 'BANCOS_TESORERIA', 'GESTION_COMERCIAL', 'RECURSOS_HUMANOS', 'AVANZADO'] as const).map((catKey) => {
                  const catModules = SYSTEM_MODULES_CATALOG.filter(m => m.category === catKey);
                  if (catModules.length === 0) return null;

                  const catNames: Record<string, string> = {
                    CONTABILIDAD: 'Contabilidad & Auditoría IFRS',
                    TRIBUTARIO: 'Tributación SII & F29',
                    BANCOS_TESORERIA: 'Tesorería & Conciliación Bancaria',
                    GESTION_COMERCIAL: 'Gestión Comercial & Inventarios',
                    RECURSOS_HUMANOS: 'Remuneraciones & Previred',
                    AVANZADO: 'Portales de Clientes & Analítica Avanzada / IA'
                  };

                  return (
                    <React.Fragment key={catKey}>
                      <tr className="bg-slate-50/80 font-bold text-slate-900 text-[11px]">
                        <td colSpan={5} className="py-2 px-4 uppercase tracking-wider text-indigo-900">
                          {catNames[catKey]}
                        </td>
                      </tr>
                      {catModules.map(module => (
                        <tr key={module.key} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{module.icon}</span>
                              <span>{module.label}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">{module.description}</div>
                          </td>
                          {officialPlans.map(p => {
                            const isIncluded = p.defaultModules[module.key];
                            return (
                              <td key={p.code} className="py-2.5 px-3 text-center">
                                {isIncluded ? (
                                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700">
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400">
                                    <X className="w-3.5 h-3.5" />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PLANES PERSONALIZADOS */}
      {activeTab === 'custom' && (
        <div className="space-y-6">
          <form onSubmit={handleAddCustomPlan} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Plus className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">Crear Nuevo Plan Personalizado / Especial</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Nombre del Plan</label>
                <input 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Ej: Plan Especial Corporaciones"
                  className="p-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-indigo-500" 
                  required 
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Precio en UF + IVA</label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={priceUF} 
                  onChange={e => setPriceUF(Number(e.target.value))} 
                  className="p-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-indigo-500" 
                  required 
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Máx. Empresas</label>
                <input 
                  type="number" 
                  value={maxCompanies} 
                  onChange={e => setMaxCompanies(Number(e.target.value))} 
                  className="p-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-indigo-500" 
                  required 
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Máx. Usuarios</label>
                <input 
                  type="number" 
                  value={maxUsers} 
                  onChange={e => setMaxUsers(Number(e.target.value))} 
                  className="p-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-indigo-500" 
                  required 
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                type="submit" 
                className="bg-indigo-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Guardar Plan Personalizado
              </button>
            </div>
          </form>

          {/* Lista de Planes Custom */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Planes Personalizados Creados</h3>
            {plans.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No hay planes personalizados adicionales registrados.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {plans.map(plan => (
                  <div key={plan.id} className="py-3 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">{plan.name}</span>
                      <span className="text-slate-500">
                        {plan.priceUF ? `UF ${plan.priceUF} + IVA • ` : ''} 
                        Empresas: <strong className="text-indigo-700">{plan.maxCompanies}</strong> &bull; 
                        Usuarios: <strong className="text-indigo-700">{plan.maxUsers}</strong>
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteCustomPlan(plan.id)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Eliminar Plan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
