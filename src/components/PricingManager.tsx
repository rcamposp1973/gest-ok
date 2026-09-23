import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { LandingPricingPlan } from '../types';
import { 
  CreditCard, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff, 
  Check, 
  X, 
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Star
} from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { useAuth } from '../context/AuthContext';

export const DEFAULT_INITIAL_PRICING_PLANS: Omit<LandingPricingPlan, 'id'>[] = [
  {
    name: 'Plan de Entrada',
    priceUF: 0.5,
    priceText: 'UF 0,5 + IVA',
    priceCLP: 19900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Individual / 1 Empresa',
    subtitle: 'Plan individual para una empresa, solo contabilidad.',
    description: 'Para contadores con empresas individuales o pymes que requieren contabilidad tributaria esencial y RCV.',
    maxCompanies: 1,
    maxUsers: 1,
    features: [
      '1 Empresa / RUT Comercial',
      'Sincronización RCV Automática con SII',
      'Formulario 29 con Códigos SII oficiales',
      'Importación masiva de cartolas bancarias',
      'Libros Diario, Mayor y Auxiliares de Cuentas Corrientes'
    ],
    status: 'active',
    order: 1
  },
  {
    name: 'Plan Estudio 10',
    priceUF: 1.2,
    priceText: 'UF 1,2 + IVA',
    priceCLP: 47900,
    period: '/ mes + IVA',
    popular: false,
    badge: '10 Empresas / 2 Usuarios',
    subtitle: 'Plan para 2 usuarios y 10 empresas.',
    description: 'Para contadores independientes y firmas contables con cartera de clientes en crecimiento.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      '10 Empresas / Clientes',
      '1 Usuario Administrador - 1 Usuario Analista',
      'Balance 8 Columnas e IFRS',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos con exportación Excel',
      'Indicadores Financieros (KPIs)',
      'Asistencia en la Implementación y puesta en marcha de 5 empresas'
    ],
    status: 'active',
    order: 2
  },
  {
    name: 'Plan Estudio Full',
    priceUF: 2.4,
    priceText: 'UF 2,4 + IVA',
    priceCLP: 94900,
    period: '/ mes + IVA',
    popular: true,
    badge: 'Más Popular / 100 Empresas',
    subtitle: 'Plan para 4 usuarios y 100 empresas.',
    description: 'Para firmas contables medianas y consolidadas con alta productividad y atención a clientes.',
    maxCompanies: 100,
    maxUsers: 4,
    features: [
      '100 Empresas / Clientes',
      '1 Usuario Administrador - 3 Usuarios Analistas',
      'Balance 8 Columnas e IFRS',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos con exportación Excel',
      'Indicadores Financieros (KPIs)',
      'Asistencia en la Implementación y puesta en marcha de 5 empresas',
      'Visor para Clientes (Portal de Consulta)'
    ],
    status: 'active',
    order: 3
  },
  {
    name: 'Plan Corporativo / PYMES',
    priceUF: 4.0,
    priceText: 'Desde UF 4,0 + IVA',
    priceCLP: 159900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Holding / A Convenir',
    subtitle: 'Módulos y Usuarios a convenir según requerimientos.',
    description: 'Para grandes estudios, holdings y corporativos con requerimientos avanzados y alto volumen.',
    maxCompanies: 500,
    maxUsers: 20,
    features: [
      'Módulos y Usuarios a convenir (Escalable)',
      'Todos los módulos del sistema (Finanzas, Comercial, KPIs, RCV, Personal, Tesorería)',
      'Integración con facturadores electrónicos y ERP',
      'Soporte prioritario 24/7 con SLA garantizado',
      'Capacitación in-company para todo el equipo contable',
      'Servidor dedicado y respaldos automáticos'
    ],
    status: 'active',
    order: 4
  }
];

export default function PricingManager() {
  const { currentUser } = useAuth();
  const [plans, setPlans] = useState<LandingPricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [priceUF, setPriceUF] = useState<number | ''>(1.2);
  const [priceText, setPriceText] = useState('UF 1,2 + IVA');
  const [priceCLP, setPriceCLP] = useState<number>(47900);
  const [period, setPeriod] = useState('/ mes + IVA');
  const [popular, setPopular] = useState(false);
  const [badge, setBadge] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [order, setOrder] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const q = collection(db, 'landing_pricing');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rawItems = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as LandingPricingPlan[];

        const uniqueMap = new Map<string, LandingPricingPlan>();
        for (const plan of rawItems) {
          if (plan.name) {
            const key = plan.name.trim().toUpperCase();
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, plan);
            }
          }
        }

        const items = Array.from(uniqueMap.values());
        items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setPlans(items);
        setLoading(false);
      },
      (err) => {
        console.warn('Error reading landing_pricing:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleResetForm = () => {
    setName('');
    setPriceUF(1.2);
    setPriceText('UF 1,2 + IVA');
    setPriceCLP(47900);
    setPeriod('/ mes + IVA');
    setPopular(false);
    setBadge('');
    setSubtitle('');
    setDescription('');
    setFeaturesText('');
    setStatus('active');
    setOrder(plans.length + 1);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleOpenEdit = (p: LandingPricingPlan) => {
    setEditingId(p.id);
    setName(p.name || '');
    setPriceUF(p.priceUF !== undefined && p.priceUF !== null ? p.priceUF : '');
    setPriceText(p.priceText || (p.priceUF ? `UF ${p.priceUF} + IVA` : ''));
    setPriceCLP(p.priceCLP ?? 0);
    setPeriod(p.period || '/ mes + IVA');
    setPopular(!!p.popular);
    setBadge(p.badge || '');
    setSubtitle(p.subtitle || '');
    setDescription(p.description || '');
    setFeaturesText((p.features || []).join('\n'));
    setStatus(p.status === 'inactive' ? 'inactive' : 'active');
    setOrder(p.order ?? 1);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNotice({ type: 'error', text: 'El nombre del plan es requerido.' });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    const featuresArray = featuresText
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    try {
      const payload = {
        name: name.trim(),
        priceUF: priceUF === '' ? null : Number(priceUF),
        priceText: priceText.trim() || (priceUF !== '' ? `UF ${priceUF} + IVA` : 'A Convenir'),
        priceCLP: Number(priceCLP) || 0,
        period: period.trim(),
        popular: Boolean(popular),
        badge: badge.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        features: featuresArray,
        status,
        order: Number(order) || 1,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'landing_pricing', editingId), payload);
        logAuditEvent({
          userId: currentUser?.uid || 'super_admin',
          userEmail: currentUser?.email || 'super_admin@pulsocontable.cl',
          action: 'UPDATE',
          module: 'MARKETING_LANDING',
          details: `Plan de precio modificado: ${name}`
        });
        setNotice({ type: 'success', text: 'Plan de precios actualizado con éxito.' });
      } else {
        await addDoc(collection(db, 'landing_pricing'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAuditEvent({
          userId: currentUser?.uid || 'super_admin',
          userEmail: currentUser?.email || 'super_admin@pulsocontable.cl',
          action: 'CREATE',
          module: 'MARKETING_LANDING',
          details: `Nuevo plan de precio agregado: ${name}`
        });
        setNotice({ type: 'success', text: 'Nuevo plan de precios publicado.' });
      }

      handleResetForm();
    } catch (err: any) {
      console.error('Error saving pricing plan:', err);
      setNotice({ type: 'error', text: 'Error al guardar: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (p: LandingPricingPlan) => {
    const nextStatus = p.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'landing_pricing', p.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Error toggling plan:', err);
    }
  };

  const handleDelete = async (id: string, planName: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el plan "${planName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'landing_pricing', id));
      setNotice({ type: 'success', text: 'Plan eliminado.' });
    } catch (err: any) {
      console.error('Error deleting plan:', err);
      setNotice({ type: 'error', text: 'Error al eliminar: ' + err.message });
    }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm('¿Cargar los 4 planes de precios oficiales (UF 0.5, UF 1.2, UF 2.4 y Corporativo) en la base de datos?')) return;
    setIsSaving(true);
    try {
      // 1. Eliminar planes antiguos para no duplicar
      for (const p of plans) {
        if (p.id) {
          try {
            await deleteDoc(doc(db, 'landing_pricing', p.id));
          } catch (delErr) {
            console.warn('Error borrando plan anterior:', delErr);
          }
        }
      }

      // 2. Insertar los 4 planes oficiales
      for (const item of DEFAULT_INITIAL_PRICING_PLANS) {
        await addDoc(collection(db, 'landing_pricing'), {
          ...item,
          createdAt: new Date().toISOString()
        });
      }
      setNotice({ type: 'success', text: 'Se cargaron los 4 planes oficiales con éxito.' });
    } catch (err: any) {
      console.error('Error seeding pricing plans:', err);
      setNotice({ type: 'error', text: 'Error al cargar planes: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-[#533AFD] text-xs font-bold border border-indigo-100 mb-2">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Facultad del Super Administrador</span>
          </div>
          <h2 className="text-xl font-extrabold text-[#0D253D] tracking-tight">
            Gestión de Precios y Planes (Página de Bienvenida)
          </h2>
          <p className="text-xs text-[#64748D] mt-1 max-w-2xl">
            Controla los valores en CLP, características, períodos y el plan destacado que se visualizan en la sección de Precios de la portada pública.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {plans.length === 0 && (
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={isSaving}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-[#0D253D] text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Cargar 4 Planes Oficiales</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isFormOpen && !editingId) {
                setIsFormOpen(false);
              } else {
                handleResetForm();
                setIsFormOpen(true);
              }
            }}
            className="px-4 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition flex items-center gap-2 cursor-pointer"
          >
            {isFormOpen && !editingId ? (
              <>
                <X className="w-4 h-4" />
                <span>Cerrar Formulario</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Nuevo Plan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
          notice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form Card */}
      {isFormOpen && (
        <form onSubmit={handleSave} className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-indigo-100 shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-[#0D253D]">
                {editingId ? 'Editar Plan de Precios' : 'Crear Nuevo Plan de Precios'}
              </h3>
              <p className="text-xs text-slate-500">Configura los valores, características e insignia destacada.</p>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Nombre del Plan *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. PLAN ESTUDIO 10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Precio en UF (Ej. 0.5, 1.2, 2.4)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Ej. 1.2"
                value={priceUF}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setPriceUF(val);
                  if (val !== '') {
                    setPriceText(`UF ${String(val).replace('.', ',')} + IVA`);
                  }
                }}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Texto del Precio (Portada) *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. UF 1,2 + IVA"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Precio Ref. Mensual CLP
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={priceCLP}
                onChange={(e) => setPriceCLP(Number(e.target.value))}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Insignia / Badge
              </label>
              <input
                type="text"
                placeholder="Ej. 10 Empresas / 2 Usuarios"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Período / Sufijo
              </label>
              <input
                type="text"
                placeholder="/ mes + IVA"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Subtítulo / Resumen
              </label>
              <input
                type="text"
                placeholder="Ej. Plan para 2 usuarios y 10 empresas."
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Descripción del Plan
              </label>
              <input
                type="text"
                placeholder="Ej. Para contadores independientes y firmas contables en crecimiento."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Orden de Visualización
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                ¿Plan Destacado? (Insignia "Más Popular")
              </label>
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={popular}
                  onChange={(e) => setPopular(e.target.checked)}
                  className="w-4 h-4 text-[#533AFD] rounded border-slate-300 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-[#0D253D]">Destacar en Portada</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
              Características Incluidas (Una por cada línea) *
            </label>
            <textarea
              required
              rows={5}
              placeholder={'Empresas ilimitadas\nMulti-usuario con roles\nBalance 8 Columnas e IFRS\nConciliación Bancaria Automática'}
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-3.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Cada línea de texto se mostrará con un ícono de verificación en la tarjeta del plan.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#0D253D]">Estado del Plan:</span>
              <button
                type="button"
                onClick={() => setStatus(status === 'active' ? 'inactive' : 'active')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  status === 'active' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                }`}
              >
                {status === 'active' ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Activo (Visible en Portada)</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span>Inactivo (Oculto)</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleResetForm}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'Actualizar Plan' : 'Publicar Plan en Portada'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Grid of Plans */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-[#0D253D]">
              Planes Configurados ({plans.length})
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
              Control en tiempo real
            </span>
          </div>

          <p className="text-xs text-slate-400">
            {plans.filter(p => p.status === 'active').length} activos en la portada
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Cargando planes...</div>
        ) : plans.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
            <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-medium text-slate-600">
              No hay planes de precios registrados en la base de datos.
            </p>
            <button
              type="button"
              onClick={handleSeedDefaults}
              className="px-4 py-2 bg-indigo-50 text-[#533AFD] hover:bg-indigo-100 text-xs font-bold rounded-full transition"
            >
              Cargar los 3 planes de precios oficiales
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => {
              const isActive = p.status === 'active';
              return (
                <div
                  key={p.id}
                  className={`rounded-3xl p-6 border transition-all flex flex-col justify-between relative ${
                    p.popular
                      ? 'border-2 border-[#533AFD] bg-white shadow-xl'
                      : isActive
                      ? 'border-slate-200 bg-[#F6F9FC] shadow-xs'
                      : 'border-slate-200 bg-slate-50/70 opacity-60'
                  }`}
                >
                  {p.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#533AFD] text-white text-[10px] font-extrabold tracking-wider uppercase px-3 py-1 rounded-full shadow-md">
                      Plan Más Popular
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-base text-[#0D253D]">{p.name}</h4>
                        <p className="text-xs text-[#64748D] mt-0.5">{p.description}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isActive ? 'Activo' : 'Oculto'}
                      </span>
                    </div>

                    <div className="my-2">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-600">
                          {p.priceText || (p.priceUF ? `UF ${String(p.priceUF).replace('.', ',')} + IVA` : (p.priceCLP > 0 ? `$${p.priceCLP.toLocaleString('es-CL')}` : 'A Convenir'))}
                        </span>
                        <span className="text-xs text-[#64748D] font-medium"> {p.period}</span>
                      </div>
                      {p.priceCLP > 0 && (
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Ref. CLP: ${p.priceCLP.toLocaleString('es-CL')} / mes
                        </p>
                      )}
                    </div>

                    <ul className="space-y-2 text-xs text-[#425466] pt-2 border-t border-slate-200/60">
                      {(p.features || []).map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-[#059669] shrink-0 mt-0.5" />
                          <span className="leading-tight">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-6 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(p)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      {isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{isActive ? 'Ocultar' : 'Activar'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id, p.name)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
