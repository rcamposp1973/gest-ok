import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  LogIn, 
  Sparkles, 
  ShieldCheck, 
  ChevronRight, 
  ChevronLeft,
  FileSpreadsheet, 
  CheckCircle2, 
  Zap, 
  TrendingUp, 
  CreditCard, 
  Lock, 
  Mail, 
  Phone, 
  Send, 
  Check, 
  HelpCircle,
  BarChart3,
  Receipt,
  Scale,
  ArrowRight,
  Calculator,
  Laptop,
  CheckCircle,
  MessageCircle,
  Play,
  Activity,
  Star,
  Users,
  Database,
  FileText,
  ArrowUpRight,
  Clock,
  Briefcase,
  Quote
} from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { LandingTestimonial, LandingPricingPlan } from '../types';
import { DEFAULT_INITIAL_TESTIMONIALS } from './TestimonialManager';
import { DEFAULT_INITIAL_PRICING_PLANS } from './PricingManager';
import PublicLandingAiAssistant from './PublicLandingAiAssistant';

interface LandingHomeProps {
  onGoToLogin: (initialEmail?: string) => void;
}

export default function LandingHome({ onGoToLogin }: LandingHomeProps) {
  // Hero input rápido de email o RUT
  const [heroEmail, setHeroEmail] = useState('');

  // Pestaña activa en la maqueta interactiva del Dashboard
  const [activeTab, setActiveTab] = useState<'f29' | 'balance' | 'rcv' | 'banco'>('f29');

  // Formulario de contacto / solicitar demo
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadType, setLeadType] = useState<'Estudio Contable' | 'Pyme / Empresa' | 'Contador Independiente'>('Estudio Contable');
  const [leadMessage, setLeadMessage] = useState('');
  const [isSendingLead, setIsSendingLead] = useState(false);
  const [leadSentSuccess, setLeadSentSuccess] = useState(false);

  // Testimonios dinámicos (facultad del Super Administrador)
  const [testimonials, setTestimonials] = useState<LandingTestimonial[]>(() => {
    return DEFAULT_INITIAL_TESTIMONIALS.map((t, idx) => ({ ...t, id: `seed-t-${idx}` }));
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [isSlidePaused, setIsSlidePaused] = useState(false);

  // Planes de precios dinámicos (facultad del Super Administrador)
  const [pricingPlans, setPricingPlans] = useState<LandingPricingPlan[]>(() => {
    return DEFAULT_INITIAL_PRICING_PLANS.map((p, idx) => ({ ...p, id: `seed-p-${idx}` }));
  });

  useEffect(() => {
    const unsubTestimonials = onSnapshot(
      collection(db, 'landing_testimonials'),
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as LandingTestimonial))
            .filter(t => t.status === 'active');
          if (items.length > 0) {
            items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
            setTestimonials(items);
          }
        }
      },
      (err) => console.warn('Aviso lectura testimonios:', err)
    );

    const unsubPricing = onSnapshot(
      collection(db, 'landing_pricing'),
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as LandingPricingPlan))
            .filter(p => p.status === 'active');
          if (items.length > 0) {
            items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
            setPricingPlans(items);
          }
        }
      },
      (err) => console.warn('Aviso lectura planes precios:', err)
    );

    return () => {
      unsubTestimonials();
      unsubPricing();
    };
  }, []);

  // Rotación automática de diapositivas de testimonios (cada 6 segundos, pausa al interactuar)
  useEffect(() => {
    if (testimonials.length <= 1 || isSlidePaused) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [testimonials.length, isSlidePaused]);

  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % testimonials.length);
  };

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGoToLogin(heroEmail.trim());
  };

  const handleSendLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadEmail.trim() || !leadName.trim()) return;

    setIsSendingLead(true);
    try {
      await addDoc(collection(db, 'leads_contact'), {
        name: leadName.trim(),
        email: leadEmail.trim().toLowerCase(),
        phone: leadPhone.trim(),
        companyOrStudy: leadCompany.trim() || 'No especificada',
        type: leadType,
        message: leadMessage.trim(),
        createdAt: new Date().toISOString(),
        status: 'Pendiente',
        source: 'Landing_Page_Stripe_Redesign'
      });

      setLeadSentSuccess(true);
      setLeadName('');
      setLeadEmail('');
      setLeadPhone('');
      setLeadCompany('');
      setLeadMessage('');
    } catch (err) {
      console.error("Error al registrar contacto:", err);
      setLeadSentSuccess(true);
    } finally {
      setIsSendingLead(false);
    }
  };

  return (
    <div className="min-h-screen stripe-canvas text-[#0D253D] flex flex-col font-sans selection:bg-[#533AFD] selection:text-white">
      
      {/* ========================================================= */}
      {/* 1. HEADER / BARRA DE NAVEGACIÓN SUPERIOR                  */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Logo y Marca Pulso Contable / Gest_OK */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#533AFD] to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Activity className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-[#0D253D]">Pulso Contable</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-[#533AFD] border border-indigo-100 font-mono">
                  Gest_OK
                </span>
              </div>
              <p className="text-[11px] text-[#64748D] hidden sm:block">
                Contabilidad, Impuestos & Gestión Financiera
              </p>
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-[#425466]">
            <a href="#modulos" className="hover:text-[#533AFD] transition">Módulos</a>
            <a href="#caracteristicas" className="hover:text-[#533AFD] transition">Características</a>
            <a href="#precios" className="hover:text-[#533AFD] transition">Precios</a>
            <a href="#nosotros" className="hover:text-[#533AFD] transition">Nosotros</a>
            <a href="#contacto" className="hover:text-[#533AFD] transition">Contacto</a>
          </nav>

          {/* Acciones de Autenticación */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onGoToLogin()}
              className="px-3.5 py-2 text-xs font-bold text-[#0D253D] hover:text-[#533AFD] hover:bg-slate-100/60 rounded-full transition cursor-pointer"
            >
              Iniciar Sesión
            </button>

            <button
              id="btn-acceso-clientes"
              onClick={() => onGoToLogin()}
              className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] active:bg-[#3519d6] text-white text-xs font-bold rounded-full shadow-lg shadow-indigo-500/20 transition transform hover:-translate-y-0.5 cursor-pointer"
            >
              <span>Acceder a la App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. HERO SECTION CON MALLA DINÁMICA (STRIPE MESH GRADIENT) */}
      {/* ========================================================= */}
      <section className="relative overflow-hidden stripe-mesh-hero pt-12 pb-20 md:pt-20 md:pb-32 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            {/* Tagline Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-slate-200/80 text-xs font-semibold text-[#0D253D] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
              <span className="font-bold text-[#533AFD]">Normativa SII 2026:</span>
              <span className="text-[#64748D]">Sincronización RCV y Formulario 29 en tiempo real</span>
            </div>

            {/* Titular Principal Impactante */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#0D253D] leading-[1.12]">
              La contabilidad de tu empresa, <br className="hidden sm:inline" />
              <span className="text-[#533AFD]">en tiempo real</span> y sin complicaciones.
            </h1>

            {/* Subtítulo Claro y Directo */}
            <p className="text-base sm:text-lg text-[#425466] leading-relaxed max-w-2xl mx-auto font-normal">
              Automatiza tu gestión tributaria, sincroniza facturas electrónicas con el SII y toma el control del pulso financiero de tu negocio con balances y auditoría inteligente.
            </p>

            {/* CTA Primario: Input Rápido + Botón Comenzar Gratis */}
            <form onSubmit={handleHeroSubmit} className="pt-2 max-w-lg mx-auto">
              <div className="p-1.5 bg-white rounded-full border border-slate-200 shadow-xl shadow-slate-900/5 flex flex-col sm:flex-row items-center gap-2">
                <div className="flex items-center gap-2.5 pl-4 w-full sm:w-auto flex-1">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={heroEmail}
                    onChange={(e) => setHeroEmail(e.target.value)}
                    placeholder="Ingresa tu correo o RUT de empresa"
                    className="w-full py-2.5 text-xs sm:text-sm bg-transparent outline-none text-[#0D253D] placeholder:text-slate-400 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-3 bg-[#533AFD] hover:bg-[#4326EB] text-white font-bold text-xs sm:text-sm rounded-full shadow-md shadow-indigo-500/25 transition transform hover:-translate-y-0.5 active:translate-y-0 shrink-0 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Comenzar gratis</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-[#64748D] mt-2.5 flex items-center justify-center gap-4">
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-[#059669]" /> Sin tarjeta de crédito
                </span>
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-[#059669]" /> Conexión oficial SII
                </span>
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-[#059669]" /> Multi-empresa
                </span>
              </p>
            </form>

          </div>

          {/* ========================================================= */}
          {/* ELEMENTO VISUAL INTERACTIVO: DASHBOARD FLOTANTE STRIPE    */}
          {/* ========================================================= */}
          <div className="mt-14 max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 stripe-card-float overflow-hidden">
              
              {/* Window Header */}
              <div className="bg-slate-50/80 px-4 sm:px-6 py-3.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold text-slate-600 ml-2 font-mono hidden sm:inline">
                    app.gestok.cl/dashboard
                  </span>
                </div>

                {/* Tabs de la Maqueta */}
                <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl">
                  <button
                    onClick={() => setActiveTab('f29')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      activeTab === 'f29'
                        ? 'bg-white text-[#533AFD] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Formulario 29
                  </button>
                  <button
                    onClick={() => setActiveTab('balance')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      activeTab === 'balance'
                        ? 'bg-white text-[#533AFD] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Balance 8 Col.
                  </button>
                  <button
                    onClick={() => setActiveTab('rcv')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      activeTab === 'rcv'
                        ? 'bg-white text-[#533AFD] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    RCV SII
                  </button>
                  <button
                    onClick={() => setActiveTab('banco')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      activeTab === 'banco'
                        ? 'bg-white text-[#533AFD] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Conciliación
                  </button>
                </div>

                <div className="hidden lg:flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  <span className="text-[11px] font-bold text-[#059669]">Período 2026 Cuadrado</span>
                </div>
              </div>

              {/* Contenido del Tab Flotante */}
              <div className="p-4 sm:p-6 lg:p-8 bg-white">
                {activeTab === 'f29' && <F29Mockup />}
                {activeTab === 'balance' && <BalanceMockup />}
                {activeTab === 'rcv' && <RcvMockup />}
                {activeTab === 'banco' && <BankMockup />}
              </div>

              {/* Barra Inferior Informativa de la Maqueta */}
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#059669]" />
                  <span>Auditoría algorítmica de cuadratura activa</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[11px]">RUT 76.845.120-3</span>
                  <span className="font-mono text-[11px] font-semibold text-[#0D253D]">Última sincronización: Hace 3 min</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. BENTO GRID DE MÓDULOS DEL SISTEMA                      */}
      {/* ========================================================= */}
      <section id="modulos" className="py-20 bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#533AFD] bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              Ecosistema Integral
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#0D253D] tracking-tight">
              Módulos diseñados para la exactitud contable
            </h2>
            <p className="text-sm text-[#425466]">
              Desde la importación automática de facturas del SII hasta balances financieros auditados y conciliación bancaria inteligente.
            </p>
          </div>

          {/* Grid Bento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Card 1: Facturación Electrónica & RCV */}
            <div className="bg-[#F6F9FC] p-7 rounded-3xl border border-slate-200/80 hover:border-indigo-300 transition duration-300 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 text-[#533AFD] flex items-center justify-center mb-5 shadow-xs group-hover:scale-105 transition-transform">
                  <Receipt className="w-6 h-6 stroke-[1.75]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#533AFD]">Conexión SII Directa</span>
                <h3 className="text-lg font-bold text-[#0D253D] mt-1 mb-2">Facturación y RCV Oficial</h3>
                <p className="text-xs text-[#425466] leading-relaxed">
                  Descarga automática del Registro de Compras y Ventas, Boletas de Honorarios electrónicas (BHR) y emisión de DTEs con timbre fiscal TED.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-[#533AFD]">
                <span>Sincronización en &lt; 2s</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Card 2: Formulario 29 Inteligente */}
            <div className="bg-[#F6F9FC] p-7 rounded-3xl border border-slate-200/80 hover:border-indigo-300 transition duration-300 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 text-[#059669] flex items-center justify-center mb-5 shadow-xs group-hover:scale-105 transition-transform">
                  <Calculator className="w-6 h-6 stroke-[1.75]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#059669]">Liquidación Tributaria</span>
                <h3 className="text-lg font-bold text-[#0D253D] mt-1 mb-2">Formulario 29 Automatizado</h3>
                <p className="text-xs text-[#425466] leading-relaxed">
                  Cálculo oficial de Débito, Crédito, tasas de PPM con historial por fechas, impuestos de Alcoholes (ILA), retención de honorarios e IVA postergado.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-[#059669]">
                <span>Códigos SII Cuadrados</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Card 3: Balance 8 Columnas e IFRS */}
            <div className="bg-[#F6F9FC] p-7 rounded-3xl border border-slate-200/80 hover:border-indigo-300 transition duration-300 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 text-sky-600 flex items-center justify-center mb-5 shadow-xs group-hover:scale-105 transition-transform">
                  <Scale className="w-6 h-6 stroke-[1.75]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600">Estados Financieros</span>
                <h3 className="text-lg font-bold text-[#0D253D] mt-1 mb-2">Balance General e IFRS</h3>
                <p className="text-xs text-[#425466] leading-relaxed">
                  Libro Diario, Libro Mayor y Balance Tributario de 8 Columnas con verificación estricta de cuadratura entre Activo, Pasivo, Pérdidas y Ganancias.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-sky-600">
                <span>Cuadratura Matemática</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Card 4: Tesorería y Conciliación Bancaria */}
            <div className="bg-[#F6F9FC] p-7 rounded-3xl border border-slate-200/80 hover:border-indigo-300 transition duration-300 flex flex-col justify-between group md:col-span-2">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 text-indigo-600 flex items-center justify-center mb-5 shadow-xs group-hover:scale-105 transition-transform">
                    <BarChart3 className="w-6 h-6 stroke-[1.75]" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Control de Caja</span>
                  <h3 className="text-lg font-bold text-[#0D253D] mt-1 mb-2">Conciliación Bancaria Automática</h3>
                  <p className="text-xs text-[#425466] leading-relaxed">
                    Sube cartolas de cualquier banco chileno (Banco de Chile, Santander, BCI, Scotiabank). El sistema identifica el RUT en la glosa y concilia con las facturas de proveedores.
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-center space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Cartola vs Libro Banco:</span>
                    <span className="font-bold text-[#059669] font-mono">$ 0 Diferencia</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#059669] h-full w-full" />
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Cruces validados por RUT del proveedor en glosa bancaria.
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-indigo-600">
                <span>Multi-Banco y Cuentas Corrientes Ilimitadas</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Card 5: Auditoría y Copiloto IA */}
            <div className="bg-[#F6F9FC] p-7 rounded-3xl border border-slate-200/80 hover:border-indigo-300 transition duration-300 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 text-purple-600 flex items-center justify-center mb-5 shadow-xs group-hover:scale-105 transition-transform">
                  <Sparkles className="w-6 h-6 stroke-[1.75]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Copiloto Inteligente</span>
                <h3 className="text-lg font-bold text-[#0D253D] mt-1 mb-2">Auditoría con Junior IA</h3>
                <p className="text-xs text-[#425466] leading-relaxed">
                  Asistente contable especializado que audita descuadraturas, sugiere asientos y analiza cuentas con auxiliares en segundos.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-purple-600">
                <span>Detección Preventiva de Errores</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. CIFRAS DE IMPACTO Y MÉTRICAS DE CONFIANZA              */}
      {/* ========================================================= */}
      <section id="caracteristicas" className="py-16 stripe-canvas border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 stripe-card-shadow">
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#533AFD] tabular-nums">
                99.98%
              </div>
              <div className="text-xs font-bold text-[#0D253D] mt-1.5">Precisión de Cuadratura</div>
              <div className="text-[11px] text-[#64748D] mt-0.5">Sin descuadraturas en F29 o Balance</div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 stripe-card-shadow">
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#059669] tabular-nums">
                &lt; 2 seg
              </div>
              <div className="text-xs font-bold text-[#0D253D] mt-1.5">Sincronización SII</div>
              <div className="text-[11px] text-[#64748D] mt-0.5">Importación instantánea de RCV</div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 stripe-card-shadow">
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#0D253D] tabular-nums">
                100%
              </div>
              <div className="text-xs font-bold text-[#0D253D] mt-1.5">Normativa Chilena</div>
              <div className="text-[11px] text-[#64748D] mt-0.5">ProPyme, 14A, 14D y Renta Presunta</div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 stripe-card-shadow">
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-indigo-600 tabular-nums">
                0
              </div>
              <div className="text-xs font-bold text-[#0D253D] mt-1.5">Digitación Manual</div>
              <div className="text-[11px] text-[#64748D] mt-0.5">Auxiliares creados automáticamente</div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. SECCIÓN DE TESTIMONIOS (DIAPOSITIVAS INTERACTIVAS)     */}
      {/* ========================================================= */}
      <section 
        id="testimonios" 
        className="py-20 stripe-canvas border-b border-slate-200/80 overflow-hidden"
        onMouseEnter={() => setIsSlidePaused(true)}
        onMouseLeave={() => setIsSlidePaused(false)}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#533AFD] bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#533AFD]" />
              <span>Voces de Nuestros Clientes</span>
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#0D253D] tracking-tight">
              Testimonios de Contadores y Firmas Auditoras
            </h2>
            <p className="text-sm text-[#425466]">
              Experiencias reales de profesionales y estudios contables que han modernizado su operación con Gest_OK.
            </p>
          </div>

          {/* Diapositiva Principal del Carrusel */}
          {testimonials.length > 0 && (
            <div className="relative max-w-4xl mx-auto">
              
              {/* Tarjeta de la Diapositiva */}
              <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200/80 shadow-lg shadow-indigo-950/5 relative overflow-hidden min-h-[340px] flex flex-col justify-between transition-all duration-300">
                
                {/* Ícono de Comillas Suaves en Fondo */}
                <Quote className="absolute right-6 -bottom-6 w-32 h-32 text-indigo-50/70 pointer-events-none -rotate-12" />

                <div className="relative z-10 space-y-6">
                  
                  {/* Barra Superior de la Diapositiva */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: testimonials[activeSlide % testimonials.length]?.rating ?? 5 }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                      <span className="text-xs font-bold text-slate-700 ml-1 font-mono">
                        {(testimonials[activeSlide % testimonials.length]?.rating ?? 5)}.0
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Cliente Verificado Gest_OK</span>
                      </span>

                      <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        Diapositiva {(activeSlide % testimonials.length) + 1} de {testimonials.length}
                      </span>
                    </div>
                  </div>

                  {/* Comentario / Testimonio Grande */}
                  <div className="text-base sm:text-xl font-medium text-[#0D253D] leading-relaxed italic">
                    "{testimonials[activeSlide % testimonials.length]?.comment}"
                  </div>

                  {/* Métrica de impacto si existe */}
                  {testimonials[activeSlide % testimonials.length]?.metrics && (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 text-xs font-bold text-emerald-800 shadow-2xs">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{testimonials[activeSlide % testimonials.length]?.metrics}</span>
                    </div>
                  )}

                </div>

                {/* Pie de la Diapositiva: Autor y Cargo */}
                <div className="relative z-10 pt-6 mt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#533AFD] to-sky-400 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-indigo-500/20 shrink-0">
                      {testimonials[activeSlide % testimonials.length]?.author
                        ?.split(' ')
                        .map(n => n[0])
                        .slice(0, 2)
                        .join('') || 'PC'}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-[#0D253D]">
                        {testimonials[activeSlide % testimonials.length]?.author}
                      </h4>
                      <p className="text-xs text-[#64748D] mt-0.5 font-medium">
                        {testimonials[activeSlide % testimonials.length]?.role}
                        {testimonials[activeSlide % testimonials.length]?.company && (
                          <span className="text-slate-400"> • {testimonials[activeSlide % testimonials.length]?.company}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Controles de Navegación de Diapositiva */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={handlePrevSlide}
                      className="p-2.5 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition cursor-pointer hover:scale-105 active:scale-95 shadow-2xs"
                      title="Diapositiva anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={handleNextSlide}
                      className="p-2.5 rounded-full bg-[#533AFD] hover:bg-[#4326EB] text-white shadow-md shadow-indigo-500/25 transition cursor-pointer hover:scale-105 active:scale-95"
                      title="Siguiente diapositiva"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>

              {/* Indicadores de Puntos (Dots) */}
              <div className="flex items-center justify-center gap-2 mt-6">
                {testimonials.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveSlide(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      activeSlide % testimonials.length === idx
                        ? 'w-8 bg-[#533AFD]'
                        : 'w-2 bg-slate-300 hover:bg-slate-400'
                    }`}
                    title={`Ir a diapositiva ${idx + 1}`}
                  />
                ))}
              </div>

            </div>
          )}

        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. SECCIÓN DE PLANES Y PRECIOS (SUPER ADMIN CONFIGURABLE)  */}
      {/* ========================================================= */}
      <section id="precios" className="py-20 bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#533AFD] bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              Precios Claros y Transparentes
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#0D253D] tracking-tight">
              Planes que crecen con tu estudio o empresa
            </h2>
            <p className="text-sm text-[#425466]">
              Sin costos ocultos ni cobros por factura emitida. Actualizaciones tributarias incluidas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto items-stretch">
            {pricingPlans.map((plan) => {
              const isFreeOrContact = plan.priceCLP === 0;
              const formattedPrice = isFreeOrContact
                ? 'A Convenir'
                : `$${plan.priceCLP.toLocaleString('es-CL')}`;

              return (
                <div
                  key={plan.id}
                  className={`rounded-3xl p-8 border flex flex-col justify-between relative transition-all ${
                    plan.popular
                      ? 'bg-white border-2 border-[#533AFD] shadow-2xl'
                      : 'bg-[#F6F9FC] border-slate-200 shadow-xs'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#533AFD] text-white text-[10px] font-extrabold tracking-wider uppercase px-3 py-1 rounded-full shadow-md">
                      Más Popular para Estudios
                    </div>
                  )}

                  <div>
                    <h3 className="text-lg font-bold text-[#0D253D]">{plan.name}</h3>
                    {plan.description && (
                      <p className="text-xs text-[#64748D] mt-1">{plan.description}</p>
                    )}

                    <div className="mt-5 mb-6">
                      <span className={`text-3xl sm:text-4xl font-extrabold font-mono ${
                        plan.popular ? 'text-[#533AFD]' : 'text-[#0D253D]'
                      }`}>
                        {formattedPrice}
                      </span>
                      <span className="text-xs text-[#64748D] font-medium"> {plan.period}</span>
                    </div>

                    <ul className="space-y-3 text-xs text-[#425466]">
                      {(plan.features || []).map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-center gap-2">
                          <Check className={`w-4 h-4 shrink-0 ${plan.popular ? 'text-[#533AFD]' : 'text-[#059669]'}`} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {isFreeOrContact ? (
                    <a
                      href="#contacto"
                      className="mt-8 block text-center py-3 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-[#0D253D] rounded-full transition cursor-pointer shadow-xs"
                    >
                      Contactar Ventas
                    </a>
                  ) : (
                    <button
                      onClick={() => onGoToLogin()}
                      className={`mt-8 w-full py-3.5 px-4 text-xs font-bold rounded-full transition cursor-pointer ${
                        plan.popular
                          ? 'bg-[#533AFD] hover:bg-[#4326EB] text-white shadow-lg shadow-indigo-500/25 transform hover:-translate-y-0.5'
                          : 'bg-white hover:bg-slate-50 border border-slate-300 text-[#0D253D] shadow-xs'
                      }`}
                    >
                      {plan.popular ? 'Probar Estudio Contable' : `Comenzar Plan ${plan.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. SECCIÓN "NOSOTROS" Y RESPALDO TRIBUTARIO               */}
      {/* ========================================================= */}
      <section id="nosotros" className="py-20 stripe-canvas border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200/80 stripe-card-shadow grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-widest text-[#533AFD] bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                Sobre Nosotros & Respaldo
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0D253D]">
                Desarrollado por PulsoContable SpA en Santiago de Chile
              </h2>
              <p className="text-xs sm:text-sm text-[#425466] leading-relaxed">
                Gest_OK nace de la experiencia real de auditores tributarios y programadores de software financiero. Nuestro compromiso es eliminar la carga operativa y dar certeza tributaria a cada estudio contable de Chile.
              </p>
              <div className="space-y-2 pt-2 text-xs text-[#0D253D]">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="w-4 h-4 text-[#059669]" />
                  <span>Cumplimiento estricto con resoluciones e instrucciones del SII</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <Lock className="w-4 h-4 text-[#059669]" />
                  <span>Cifrado bancario SSL 256 bits y respaldos continuos</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <Briefcase className="w-4 h-4 text-[#059669]" />
                  <span>Soporte especializado brindado por contadores en Chile</span>
                </div>
              </div>
            </div>

            <div className="bg-[#F6F9FC] rounded-2xl p-6 border border-slate-200 space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#533AFD] to-sky-400 text-white flex items-center justify-center mx-auto shadow-md shadow-indigo-500/20">
                <Building2 className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-sm text-[#0D253D]">PulsoContable SpA</h3>
              <p className="text-xs text-slate-500">
                Avenida Providencia, Santiago, Chile <br />
                RUT: 77.XXX.XXX-X &bull; contacto@pulsocontable.cl
              </p>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-[#533AFD]">
                  Plataforma Certificada y Operando en Producción 2026
                </span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 7. SECCIÓN DE CONTACTO / SOLICITAR DEMO O ATENCIÓN         */}
      {/* ========================================================= */}
      <section id="contacto" className="py-20 bg-white border-b border-slate-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="bg-[#F6F9FC] rounded-3xl p-8 sm:p-12 border border-slate-200/90 stripe-card-shadow">
            
            <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-[#059669] text-xs font-semibold border border-emerald-200">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Atención Personalizada en Chile</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0D253D]">
                Solicita una Demostración o Cotización
              </h2>
              <p className="text-xs sm:text-sm text-[#425466]">
                Déjanos tus datos y un especialista contable se comunicará contigo para activar tu acceso de prueba o coordinar una sesión personalizada.
              </p>
            </div>

            {leadSentSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Check className="w-6 h-6 stroke-[2.5]" />
                </div>
                <h3 className="text-base font-bold text-emerald-800">¡Mensaje Recibido con Éxito!</h3>
                <p className="text-xs text-emerald-700 max-w-md mx-auto">
                  Muchas gracias. Un consultor contable de PulsoContable se pondrá en contacto contigo a la brevedad.
                </p>
                <button
                  onClick={() => setLeadSentSuccess(false)}
                  className="mt-2 px-4 py-2 bg-white hover:bg-slate-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-full transition cursor-pointer"
                >
                  Enviar otra consulta
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendLead} className="space-y-4">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#0D253D] mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Rodrigo Campos"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] placeholder-slate-400 focus:outline-none focus:border-[#533AFD] focus:ring-2 focus:ring-indigo-500/10 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0D253D] mb-1">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      placeholder="rcampos@estudio.cl"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] placeholder-slate-400 focus:outline-none focus:border-[#533AFD] focus:ring-2 focus:ring-indigo-500/10 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#0D253D] mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="tel"
                      placeholder="+56 9 1234 5678"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] placeholder-slate-400 focus:outline-none focus:border-[#533AFD] focus:ring-2 focus:ring-indigo-500/10 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0D253D] mb-1">Estudio Contable o Empresa</label>
                    <input
                      type="text"
                      placeholder="Ej: Campos & Asociados SpA"
                      value={leadCompany}
                      onChange={(e) => setLeadCompany(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] placeholder-slate-400 focus:outline-none focus:border-[#533AFD] focus:ring-2 focus:ring-indigo-500/10 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#0D253D] mb-1">Tipo de Organización</label>
                    <select
                      value={leadType}
                      onChange={(e: any) => setLeadType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:ring-2 focus:ring-indigo-500/10 font-medium"
                    >
                      <option value="Estudio Contable">Estudio Contable (Múltiples Clientes)</option>
                      <option value="Contador Independiente">Contador Independiente</option>
                      <option value="Pyme / Empresa">Pyme / Empresa Individual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0D253D] mb-1">Mensaje o Consulta (Opcional)</label>
                    <input
                      type="text"
                      placeholder="¿Deseas probar con una empresa demo?"
                      value={leadMessage}
                      onChange={(e) => setLeadMessage(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] placeholder-slate-400 focus:outline-none focus:border-[#533AFD] focus:ring-2 focus:ring-indigo-500/10 font-medium"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSendingLead}
                    className="w-full py-3.5 px-6 bg-[#533AFD] hover:bg-[#4326EB] text-white font-bold text-xs sm:text-sm rounded-full shadow-lg shadow-indigo-500/25 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSendingLead ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Solicitud de Demostración</span>
                      </>
                    )}
                  </button>
                </div>

              </form>
            )}

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 8. FOOTER CORPORATIVO DISCRETO                            */}
      {/* ========================================================= */}
      <footer className="mt-auto bg-[#0D253D] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-300">
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white text-sm">Pulso Contable &bull; Gest_OK</span>
                <p className="text-[11px] text-slate-400">Versión {APP_VERSION} &bull; PulsoContable SpA</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              <button
                onClick={() => onGoToLogin()}
                className="text-sky-300 hover:text-white font-semibold transition cursor-pointer"
              >
                Acceso a la Plataforma
              </button>
              <a href="#modulos" className="hover:text-white transition">Módulos</a>
              <a href="#precios" className="hover:text-white transition">Precios</a>
              <a href="#contacto" className="hover:text-white transition">Contacto</a>
              <span>&copy; {new Date().getFullYear()} Todos los derechos reservados.</span>
            </div>

          </div>
        </div>
      </footer>

      {/* Asistente Virtual de IA para Visitantes */}
      <PublicLandingAiAssistant />

    </div>
  );
}

// ----------------------------------------------------------------------------------
// MOCKUPS INTERACTIVOS DE DATOS FICTICIOS (ESTILO STRIPE LIGHT)
// ----------------------------------------------------------------------------------

function F29Mockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0D253D]">Formulario 29 Oficial:</span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-[#533AFD] border border-indigo-100 font-mono text-[11px] font-bold">
            Período 2026-04
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#059669] border border-emerald-200 text-[10px] font-bold">
            100% Cuadrado SII
          </span>
        </div>
        <div className="text-slate-500 text-[11px]">RUT 76.845.120-3 (Régimen ProPyme General 14-D)</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#F6F9FC] p-3.5 rounded-xl border border-slate-200 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-500">Débito Fiscal (Ventas)</div>
          <div className="text-lg font-bold font-mono text-[#059669] tabular-nums">$ 4.712.000</div>
          <div className="text-[10px] text-slate-400">Cód. [502] 120 Facturas y Boletas</div>
        </div>

        <div className="bg-[#F6F9FC] p-3.5 rounded-xl border border-slate-200 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-500">Crédito Fiscal (Compras)</div>
          <div className="text-lg font-bold font-mono text-sky-600 tabular-nums">$ 2.850.000</div>
          <div className="text-[10px] text-slate-400">Cód. [520] 45 Facturas Aceptadas</div>
        </div>

        <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100 space-y-1">
          <div className="text-[10px] uppercase font-bold text-[#533AFD]">Total Líquido a Pagar</div>
          <div className="text-lg font-bold font-mono text-[#533AFD] tabular-nums">$ 2.247.450</div>
          <div className="text-[10px] text-indigo-700/80">Incluye PPM 1.5% + Ret. Honorarios 14.5%</div>
        </div>
      </div>

      <table className="w-full text-left border-collapse border border-slate-200 text-[11px] rounded-xl overflow-hidden">
        <thead className="bg-slate-50 text-[#0D253D] font-bold">
          <tr>
            <th className="p-2.5 border-b border-slate-200">Línea / Concepto F29</th>
            <th className="p-2.5 border-b border-slate-200">Código SII</th>
            <th className="p-2.5 border-b border-slate-200 text-right">Base Imponible</th>
            <th className="p-2.5 border-b border-slate-200 text-right">Monto Determinado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
          <tr>
            <td className="p-2.5 font-medium">Débito Fiscal Facturas Emitidas</td>
            <td className="p-2.5 font-mono text-[#533AFD]">[502]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 24.800.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-[#059669] tabular-nums">$ 4.712.000</td>
          </tr>
          <tr>
            <td className="p-2.5 font-medium">Crédito Fiscal Facturas Recibidas</td>
            <td className="p-2.5 font-mono text-[#533AFD]">[520]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 15.000.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-sky-600 tabular-nums">$ 2.850.000</td>
          </tr>
          <tr>
            <td className="p-2.5 font-medium">P.P.M. Régimen ProPyme General (1.5%)</td>
            <td className="p-2.5 font-mono text-[#533AFD]">[062]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 24.800.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-[#0D253D] tabular-nums">$ 372.000</td>
          </tr>
          <tr>
            <td className="p-2.5 font-medium">Retención 2da Categoría Honorarios (14.5%)</td>
            <td className="p-2.5 font-mono text-[#533AFD]">[151]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 1.000.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-amber-600 tabular-nums">$ 145.000</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BalanceMockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0D253D]">Balance General Tributario (8 Columnas):</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#059669] border border-emerald-200 text-[10px] font-bold">
            Totalmente Cuadrado
          </span>
        </div>
        <div className="text-slate-500 text-[11px]">Ejercicio Tributario 2026 (Auditado)</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse border border-slate-200 text-[11px] rounded-xl overflow-hidden">
          <thead className="bg-slate-50 text-[#0D253D] font-bold">
            <tr>
              <th className="p-2.5 border-b border-slate-200">Código & Cuenta</th>
              <th className="p-2.5 border-b border-slate-200 text-right">Débitos</th>
              <th className="p-2.5 border-b border-slate-200 text-right">Créditos</th>
              <th className="p-2.5 border-b border-slate-200 text-right">Saldo Deudor</th>
              <th className="p-2.5 border-b border-slate-200 text-right">Saldo Acreedor</th>
              <th className="p-2.5 border-b border-slate-200 text-right">Activo</th>
              <th className="p-2.5 border-b border-slate-200 text-right">Pasivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 bg-white font-mono">
            <tr>
              <td className="p-2.5 font-sans font-semibold text-[#0D253D]">1-1-01-01 Banco Santander</td>
              <td className="p-2.5 text-right tabular-nums">$ 45.200.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 32.100.000</td>
              <td className="p-2.5 text-right text-[#059669] font-bold tabular-nums">$ 13.100.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right text-sky-600 font-bold tabular-nums">$ 13.100.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-semibold text-[#0D253D]">1-1-02-01 Clientes por Cobrar</td>
              <td className="p-2.5 text-right tabular-nums">$ 28.500.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 19.800.000</td>
              <td className="p-2.5 text-right text-[#059669] font-bold tabular-nums">$ 8.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right text-sky-600 font-bold tabular-nums">$ 8.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-semibold text-[#0D253D]">2-1-01-01 Proveedores Nacionales</td>
              <td className="p-2.5 text-right tabular-nums">$ 12.000.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 18.500.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right text-amber-600 font-bold tabular-nums">$ 6.500.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right text-amber-600 font-bold tabular-nums">$ 6.500.000</td>
            </tr>
            <tr className="bg-indigo-50/50 font-bold text-[#0D253D]">
              <td className="p-2.5 font-sans">SUMAS TOTALES Y RESULTADO</td>
              <td className="p-2.5 text-right tabular-nums">$ 85.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 85.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 21.800.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 21.800.000</td>
              <td className="p-2.5 text-right text-sky-700 tabular-nums">$ 21.800.000</td>
              <td className="p-2.5 text-right text-amber-700 tabular-nums">$ 21.800.000</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RcvMockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0D253D]">Registro de Compras y Ventas (RCV):</span>
          <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-mono text-[11px] font-bold">
            API SII Directa
          </span>
        </div>
        <div className="text-slate-500 text-[11px]">Auxiliares creados automáticamente</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#F6F9FC] p-3 rounded-xl border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Facturas Compra (33)</div>
          <div className="text-base font-bold font-mono text-[#0D253D] mt-0.5">35 docs</div>
        </div>
        <div className="bg-[#F6F9FC] p-3 rounded-xl border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Facturas Venta (33)</div>
          <div className="text-base font-bold font-mono text-[#0D253D] mt-0.5">18 docs</div>
        </div>
        <div className="bg-[#F6F9FC] p-3 rounded-xl border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Boletas Venta (39)</div>
          <div className="text-base font-bold font-mono text-[#059669] mt-0.5">1.250 docs</div>
        </div>
        <div className="bg-[#F6F9FC] p-3 rounded-xl border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Honorarios (BHR)</div>
          <div className="text-base font-bold font-mono text-amber-600 mt-0.5">4 boletas</div>
        </div>
      </div>

      <table className="w-full text-left border-collapse border border-slate-200 text-[11px] rounded-xl overflow-hidden">
        <thead className="bg-slate-50 text-[#0D253D] font-bold">
          <tr>
            <th className="p-2.5 border-b border-slate-200">Tipo & Folio</th>
            <th className="p-2.5 border-b border-slate-200">RUT Proveedor / Cliente</th>
            <th className="p-2.5 border-b border-slate-200">Razón Social</th>
            <th className="p-2.5 border-b border-slate-200 text-right">Neto</th>
            <th className="p-2.5 border-b border-slate-200 text-right">IVA</th>
            <th className="p-2.5 border-b border-slate-200 text-right">Total</th>
            <th className="p-2.5 border-b border-slate-200 text-center">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
          <tr>
            <td className="p-2.5 font-bold text-[#059669]">Factura #1240</td>
            <td className="p-2.5 font-mono">76.845.120-3</td>
            <td className="p-2.5 font-medium">DISTRIBUIDORA Y LOGÍSTICA CHILE S.A.</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 1.250.000</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 237.500</td>
            <td className="p-2.5 text-right font-mono font-bold text-[#0D253D] tabular-nums">$ 1.487.500</td>
            <td className="p-2.5 text-center">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#059669] border border-emerald-200 text-[10px] font-bold">
                Contabilizado
              </span>
            </td>
          </tr>
          <tr>
            <td className="p-2.5 font-bold text-sky-600">Boleta Resumen Mensual</td>
            <td className="p-2.5 font-mono">66.666.666-6</td>
            <td className="p-2.5 font-medium">Clientes Varios (1.250 Boletas)</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 8.400.000</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 1.596.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-[#0D253D] tabular-nums">$ 9.996.000</td>
            <td className="p-2.5 text-center">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#059669] border border-emerald-200 text-[10px] font-bold">
                Contabilizado
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BankMockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0D253D]">Conciliación Bancaria Mensual:</span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-[#533AFD] border border-indigo-100 font-mono text-[11px] font-bold">
            Banco Santander Cta Cte
          </span>
        </div>
        <div className="text-slate-500 text-[11px]">
          Diferencia de Cuadratura: <strong className="text-[#059669] font-mono">$ 0</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#F6F9FC] p-3.5 rounded-xl border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Saldo Cartola Bancaria</div>
          <div className="text-base font-bold font-mono text-[#0D253D] mt-0.5 tabular-nums">$ 14.850.200</div>
        </div>
        <div className="bg-[#F6F9FC] p-3.5 rounded-xl border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Saldo Libro Mayor Banco</div>
          <div className="text-base font-bold font-mono text-[#0D253D] mt-0.5 tabular-nums">$ 14.850.200</div>
        </div>
        <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200">
          <div className="text-[10px] text-[#059669] font-bold">Estado de Conciliación</div>
          <div className="text-base font-bold font-mono text-[#059669] mt-0.5">100% Conciliado</div>
        </div>
      </div>
    </div>
  );
}
