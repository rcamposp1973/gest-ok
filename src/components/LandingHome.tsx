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
  Play
} from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import PublicLandingAiAssistant from './PublicLandingAiAssistant';

interface LandingHomeProps {
  onGoToLogin: () => void;
}

export default function LandingHome({ onGoToLogin }: LandingHomeProps) {
  // Carrusel interactivo de módulos en vivo
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  // Formulario de contacto / solicitar demo
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadType, setLeadType] = useState<'Estudio Contable' | 'Pyme / Empresa' | 'Contador Independiente'>('Estudio Contable');
  const [leadMessage, setLeadMessage] = useState('');
  const [isSendingLead, setIsSendingLead] = useState(false);
  const [leadSentSuccess, setLeadSentSuccess] = useState(false);

  // Módulos para el carrusel de capturas interactivas de muestra (datos 100% ficticios)
  const slides = [
    {
      id: 'f29',
      tag: 'TRIBUTARIA CHILE',
      title: 'Formulario 29 Automatizado',
      subtitle: 'Cálculo instantáneo de Débito, Crédito, PPM, Retenciones de Honorarios e IVA Postergado.',
      component: <F29Mockup />
    },
    {
      id: 'balance',
      tag: 'ESTADOS FINANCIEROS',
      title: 'Balance General de 8 Columnas e IFRS',
      subtitle: 'Cuadratura matemática en tiempo real al Debe y Haber, Inventario y Resultados.',
      component: <BalanceMockup />
    },
    {
      id: 'rcv',
      tag: 'CONEXIÓN SII OFICIAL',
      title: 'Sincronización Directa RCV y Facturación',
      subtitle: 'Importación en 2 segundos de Compras, Ventas y Honorarios con creación automática de Auxiliares.',
      component: <RcvMockup />
    },
    {
      id: 'conciliacion',
      tag: 'TESORERÍA Y BANCOS',
      title: 'Conciliación Bancaria y Flujo de Caja',
      subtitle: 'Cruce inteligente de cartolas bancarias con comprobantes contables y proyección de liquidez.',
      component: <BankMockup />
    }
  ];

  // Auto-play del carrusel
  useEffect(() => {
    if (!isAutoPlay) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isAutoPlay, slides.length]);

  const handleSendLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadEmail.trim() || !leadName.trim()) return;

    setIsSendingLead(true);
    try {
      // Guardar solicitud de demo / información en Firestore
      await addDoc(collection(db, 'leads_contact'), {
        name: leadName.trim(),
        email: leadEmail.trim().toLowerCase(),
        phone: leadPhone.trim(),
        companyOrStudy: leadCompany.trim() || 'No especificada',
        type: leadType,
        message: leadMessage.trim(),
        createdAt: new Date().toISOString(),
        status: 'Pendiente',
        source: 'Landing_Page_v2.3.5'
      });

      setLeadSentSuccess(true);
      setLeadName('');
      setLeadEmail('');
      setLeadPhone('');
      setLeadCompany('');
      setLeadMessage('');
    } catch (err) {
      console.error("Error al registrar contacto:", err);
      // Fallback amigable
      setLeadSentSuccess(true);
    } finally {
      setIsSendingLead(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* 1. TOPBAR DE NAVEGACIÓN */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo y Marca */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/20 border border-indigo-400/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white">Gest_OK</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Contabilidad y Gestión &bull; De la Contabilidad a la Gestión Estratégica
              </p>
            </div>
          </div>

          {/* Menú de Acciones */}
          <div className="flex items-center gap-3">
            <a 
              href="#modulos" 
              className="hidden md:inline-block text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 transition"
            >
              Módulos
            </a>
            <a 
              href="#contacto" 
              className="hidden sm:inline-block text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 transition"
            >
              Solicitar Demo
            </a>

            {/* BOTÓN PRINCIPAL DE ACCESO AL LOGIN */}
            <button
              id="btn-acceso-clientes"
              onClick={onGoToLogin}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-95 border border-indigo-400/30 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Acceso Usuarios</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. SECCIÓN HERO DE IMPACTO */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 bg-radial from-indigo-950/40 via-slate-900 to-slate-900 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold shadow-inner">
              <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span>Plataforma Contable de Alto Rendimiento para Chile</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Bienvenido a <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-200">Gest_OK</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 font-normal leading-relaxed">
              El sistema contable integral diseñado exclusivamente para <strong>estudios contables, contadores independientes y pymes chilenas</strong>. 
              Automatiza tu RCV con el SII, emite DTEs, cuadra F29 en segundos y emite balances auditados.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <button
                onClick={onGoToLogin}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl shadow-xl shadow-indigo-600/30 transition transform hover:-translate-y-0.5 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Ingresar al Sistema</span>
              </button>
              
              <a
                href="#contacto"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-800 hover:bg-slate-700/80 text-slate-200 hover:text-white font-semibold text-sm rounded-xl border border-slate-700 transition cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                <span>Solicitar Información y Demo</span>
              </a>
            </div>

            {/* Badges de Garantía */}
            <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left border-t border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Multi-Estudio</div>
                  <div className="text-[11px] text-slate-400">Empresas ilimitadas</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Conexión SII Directa</div>
                  <div className="text-[11px] text-slate-400">RCV, Facturas y BH</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Formulario 29</div>
                  <div className="text-[11px] text-slate-400">Códigos SII automáticos</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Balance IFRS / 8 Col.</div>
                  <div className="text-[11px] text-slate-400">Cuadratura instantánea</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3. SECCIÓN CARRUSEL VISUAL INTERACTIVO (LO QUE TENEMOS EN EL SISTEMA) */}
      <section id="modulos" className="py-16 bg-slate-950 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">
              VISTA PREVIA REAL DEL SISTEMA
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Herramientas diseñadas por y para contadores
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Datos de muestra estructurados para que visualices la potencia y claridad operativa de Gest_OK.
            </p>
          </div>

          {/* Carrusel */}
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 sm:p-6 lg:p-8"
            onMouseEnter={() => setIsAutoPlay(false)}
            onMouseLeave={() => setIsAutoPlay(true)}
          >
            {/* Navegación por Pestañas del Carrusel */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 border-b border-slate-800 pb-4">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSlide(idx)}
                  className={`text-left p-3 rounded-xl transition cursor-pointer border ${
                    currentSlide === idx 
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-white' 
                      : 'bg-slate-800/40 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="text-[10px] font-bold tracking-wider text-indigo-400 mb-0.5">{s.tag}</div>
                  <div className="text-xs font-semibold truncate">{s.title}</div>
                </button>
              ))}
            </div>

            {/* Encabezado del Slide Activo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span>{slides[currentSlide].title}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {slides[currentSlide].subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-xs text-slate-500 font-mono px-2">
                  {currentSlide + 1} / {slides.length}
                </span>
                <button
                  onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Siguiente"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mockup Dinámico Interactivo */}
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-2 sm:p-4">
              {slides[currentSlide].component}
            </div>

          </div>

        </div>
      </section>

      {/* 4. CARACTERÍSTICAS PRINCIPALES */}
      <section className="py-16 bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">
              TODO LO QUE NECESITA TU ESTUDIO
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Diseñado para optimizar tu tiempo contable
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/60 hover:border-indigo-500/40 transition">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                <Receipt className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Conexión Dual con el SII</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Descarga oficial del Registro de Compras y Ventas, Boletas de Honorarios electrónicas y emisión de DTEs directamente con timbre TED oficial.
              </p>
            </div>

            <div className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/60 hover:border-indigo-500/40 transition">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Formulario 29 Inteligente</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Genera la liquidación de impuestos F29 calculando automáticamente Base Imponible, Tasas PPM de 1ra y 2da categoría, retenciones 14.5% y postergación de IVA.
              </p>
            </div>

            <div className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/60 hover:border-indigo-500/40 transition">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-4">
                <Scale className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Contabilidad y Balances</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Libro Diario, Mayor, Balance Tributario de 8 Columnas y Balance IFRS. Clasificación automática de centros de costo, proyectos y auxiliares.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 5. SECCIÓN DE CONTACTO / SOLICITAR INFORMACIÓN O DEMO */}
      <section id="contacto" className="py-16 bg-slate-950 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
            
            <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Atención Personalizada</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Solicita una Demo o Contáctanos
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Déjanos tus datos y un especialista contable se pondrá en contacto contigo para mostrarte el sistema o activar una prueba en tu estudio.
              </p>
            </div>

            {leadSentSuccess ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center mx-auto font-bold shadow-lg">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-emerald-400">¡Mensaje Recibido con Éxito!</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  Gracias por tu interés en Gest_OK. Nos pondremos en contacto contigo a la brevedad a tu correo electrónico o teléfono.
                </p>
                <button
                  onClick={() => setLeadSentSuccess(false)}
                  className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Enviar otra consulta
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendLead} className="space-y-4">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Rodrigo Valenzuela"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      placeholder="Ej: contacto@estudiocontable.cl"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="tel"
                      placeholder="+56 9 8765 4321"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Empresa o Estudio</label>
                    <input
                      type="text"
                      placeholder="Ej: Asesorías y Contabilidad SpA"
                      value={leadCompany}
                      onChange={(e) => setLeadCompany(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Tipo de Organización</label>
                    <select
                      value={leadType}
                      onChange={(e: any) => setLeadType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Estudio Contable">Estudio Contable</option>
                      <option value="Contador Independiente">Contador Independiente</option>
                      <option value="Pyme / Empresa">Pyme / Empresa</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Mensaje o Consulta (Opcional)</label>
                  <textarea
                    rows={3}
                    placeholder="Cuéntanos cuántas empresas administras o qué módulos te interesan más..."
                    value={leadMessage}
                    onChange={(e) => setLeadMessage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                  ></textarea>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Tus datos son 100% confidenciales y protegidos.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingLead}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition transform active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isSendingLead ? (
                      <span>Enviando información...</span>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Solicitar Demostración</span>
                      </>
                    )}
                  </button>
                </div>

              </form>
            )}

          </div>

        </div>
      </section>

      {/* 6. FOOTER DISCRETO Y PROFESIONAL */}
      <footer className="mt-auto bg-slate-950 border-t border-slate-800/80 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-slate-400">Gest_OK Contabilidad Chile</span>
            <span>•</span>
            <span>Versión {APP_VERSION}</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onGoToLogin}
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition cursor-pointer"
            >
              Acceso a la Plataforma
            </button>
            <span>•</span>
            <span>Derechos Reservados © {new Date().getFullYear()}</span>
          </div>

        </div>
      </footer>

      {/* Asistente Virtual de IA para Visitantes (Público / Captador de Leads) */}
      <PublicLandingAiAssistant />

    </div>
  );
}

// ----------------------------------------------------------------------------------
// COMPONENTES DE MUESTRA (MOCKUPS INTERACTIVOS DE DATOS FICTICIOS)
// ----------------------------------------------------------------------------------

function F29Mockup() {
  return (
    <div className="space-y-3 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">F29 - Período Tributario:</span>
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">2026-04</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">Cálculo Oficial Cuadrado</span>
        </div>
        <div className="text-slate-400 text-[11px]">RUT Empresa: 76.XXX.XXX-X (Ejemplo)</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-400">Débito Fiscal (Ventas)</div>
          <div className="text-base font-bold text-emerald-400">$ 4.712.000</div>
          <div className="text-[10px] text-slate-500">Cód. [502] 120 Facturas y Boletas</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-400">Crédito Fiscal (Compras)</div>
          <div className="text-base font-bold text-sky-400">$ 2.850.000</div>
          <div className="text-[10px] text-slate-500">Cód. [520] 45 Documentos Aceptados</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-lg border border-indigo-500/30 bg-indigo-950/20 space-y-1">
          <div className="text-[10px] uppercase font-bold text-indigo-300">Impuesto Neto a Pagar</div>
          <div className="text-base font-bold text-white">$ 2.247.450</div>
          <div className="text-[10px] text-indigo-400/80">Incluye PPM 1.5% + Ret. Honorarios 14.5%</div>
        </div>
      </div>

      <table className="w-full text-left border-collapse border border-slate-800 text-[11px] rounded-lg overflow-hidden">
        <thead className="bg-slate-900 text-slate-300">
          <tr>
            <th className="p-2 border-b border-slate-800">Línea / Concepto F29</th>
            <th className="p-2 border-b border-slate-800">Código SII</th>
            <th className="p-2 border-b border-slate-800 text-right">Base Imponible</th>
            <th className="p-2 border-b border-slate-800 text-right">Monto Determinado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300 bg-slate-950/40">
          <tr>
            <td className="p-2 font-medium">Débito Fiscal Facturas Emitidas</td>
            <td className="p-2 font-mono text-indigo-300">[502]</td>
            <td className="p-2 text-right font-mono">$ 24.800.000</td>
            <td className="p-2 text-right font-mono text-emerald-400">$ 4.712.000</td>
          </tr>
          <tr>
            <td className="p-2 font-medium">Crédito Fiscal Facturas Recibidas</td>
            <td className="p-2 font-mono text-indigo-300">[520]</td>
            <td className="p-2 text-right font-mono">$ 15.000.000</td>
            <td className="p-2 text-right font-mono text-sky-400">$ 2.850.000</td>
          </tr>
          <tr>
            <td className="p-2 font-medium">P.P.M. Régimen ProPyme General (1.5%)</td>
            <td className="p-2 font-mono text-indigo-300">[062]</td>
            <td className="p-2 text-right font-mono">$ 24.800.000</td>
            <td className="p-2 text-right font-mono text-slate-200">$ 372.000</td>
          </tr>
          <tr>
            <td className="p-2 font-medium">Retención 2da Categoría Honorarios (14.5%)</td>
            <td className="p-2 font-mono text-indigo-300">[151]</td>
            <td className="p-2 text-right font-mono">$ 1.000.000</td>
            <td className="p-2 text-right font-mono text-amber-300">$ 145.000</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BalanceMockup() {
  return (
    <div className="space-y-3 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">Balance General Tributario (8 Columnas):</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">Totalmente Cuadrado</span>
        </div>
        <div className="text-slate-400 text-[11px]">Valores al 31 de Diciembre (Auditado)</div>
      </div>

      <table className="w-full text-left border-collapse border border-slate-800 text-[11px] rounded-lg overflow-hidden">
        <thead className="bg-slate-900 text-slate-300">
          <tr>
            <th className="p-2 border-b border-slate-800">Código & Cuenta</th>
            <th className="p-2 border-b border-slate-800 text-right">Débitos</th>
            <th className="p-2 border-b border-slate-800 text-right">Créditos</th>
            <th className="p-2 border-b border-slate-800 text-right">Saldo Deudor</th>
            <th className="p-2 border-b border-slate-800 text-right">Saldo Acreedor</th>
            <th className="p-2 border-b border-slate-800 text-right">Activo</th>
            <th className="p-2 border-b border-slate-800 text-right">Pasivo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300 bg-slate-950/40 font-mono">
          <tr>
            <td className="p-2 font-sans font-medium text-slate-200">1-1-01-01 Banco Santander</td>
            <td className="p-2 text-right">$ 45.200.000</td>
            <td className="p-2 text-right">$ 32.100.000</td>
            <td className="p-2 text-right text-emerald-400">$ 13.100.000</td>
            <td className="p-2 text-right">$ 0</td>
            <td className="p-2 text-right text-sky-400">$ 13.100.000</td>
            <td className="p-2 text-right">$ 0</td>
          </tr>
          <tr>
            <td className="p-2 font-sans font-medium text-slate-200">1-1-02-01 Clientes por Cobrar</td>
            <td className="p-2 text-right">$ 28.500.000</td>
            <td className="p-2 text-right">$ 19.800.000</td>
            <td className="p-2 text-right text-emerald-400">$ 8.700.000</td>
            <td className="p-2 text-right">$ 0</td>
            <td className="p-2 text-right text-sky-400">$ 8.700.000</td>
            <td className="p-2 text-right">$ 0</td>
          </tr>
          <tr>
            <td className="p-2 font-sans font-medium text-slate-200">2-1-01-01 Proveedores Nacionales</td>
            <td className="p-2 text-right">$ 12.000.000</td>
            <td className="p-2 text-right">$ 18.500.000</td>
            <td className="p-2 text-right">$ 0</td>
            <td className="p-2 text-right text-amber-400">$ 6.500.000</td>
            <td className="p-2 text-right">$ 0</td>
            <td className="p-2 text-right text-amber-300">$ 6.500.000</td>
          </tr>
          <tr className="bg-indigo-950/30 font-bold text-white">
            <td className="p-2 font-sans">SUMAS TOTALES Y RESULTADO</td>
            <td className="p-2 text-right">$ 85.700.000</td>
            <td className="p-2 text-right">$ 85.700.000</td>
            <td className="p-2 text-right">$ 21.800.000</td>
            <td className="p-2 text-right">$ 21.800.000</td>
            <td className="p-2 text-right text-sky-300">$ 21.800.000</td>
            <td className="p-2 text-right text-amber-300">$ 21.800.000</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RcvMockup() {
  return (
    <div className="space-y-3 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">Registro de Compras y Ventas (RCV):</span>
          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[11px]">API SII Directa</span>
        </div>
        <div className="text-slate-400 text-[11px]">Auxiliares creados automáticamente</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
          <div className="text-[10px] text-slate-400">Total Facturas Compra (33)</div>
          <div className="text-sm font-bold text-white">35 docs</div>
        </div>
        <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
          <div className="text-[10px] text-slate-400">Total Facturas Venta (33)</div>
          <div className="text-sm font-bold text-white">18 docs</div>
        </div>
        <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
          <div className="text-[10px] text-slate-400">Resumen Boletas Venta (39)</div>
          <div className="text-sm font-bold text-emerald-400">1.250 boletas</div>
        </div>
        <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
          <div className="text-[10px] text-slate-400">Honorarios Electrónicos (BHR)</div>
          <div className="text-sm font-bold text-amber-400">4 boletas</div>
        </div>
      </div>

      <table className="w-full text-left border-collapse border border-slate-800 text-[11px] rounded-lg overflow-hidden">
        <thead className="bg-slate-900 text-slate-300">
          <tr>
            <th className="p-2 border-b border-slate-800">Tipo & Folio</th>
            <th className="p-2 border-b border-slate-800">RUT Proveedor / Cliente</th>
            <th className="p-2 border-b border-slate-800">Razón Social</th>
            <th className="p-2 border-b border-slate-800 text-right">Neto</th>
            <th className="p-2 border-b border-slate-800 text-right">IVA</th>
            <th className="p-2 border-b border-slate-800 text-right">Total</th>
            <th className="p-2 border-b border-slate-800 text-center">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300 bg-slate-950/40">
          <tr>
            <td className="p-2 font-medium text-emerald-400">Factura #1240</td>
            <td className="p-2 font-mono">76.845.120-3</td>
            <td className="p-2">DISTRIBUIDORA Y LOGÍSTICA CHILE S.A.</td>
            <td className="p-2 text-right font-mono">$ 1.250.000</td>
            <td className="p-2 text-right font-mono">$ 237.500</td>
            <td className="p-2 text-right font-mono font-bold">$ 1.487.500</td>
            <td className="p-2 text-center"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">Contabilizado</span></td>
          </tr>
          <tr>
            <td className="p-2 font-medium text-sky-400">Boleta Resumen Mensual</td>
            <td className="p-2 font-mono">66.666.666-6</td>
            <td className="p-2">Clientes Varios (1.250 Boletas)</td>
            <td className="p-2 text-right font-mono">$ 8.400.000</td>
            <td className="p-2 text-right font-mono">$ 1.596.000</td>
            <td className="p-2 text-right font-mono font-bold">$ 9.996.000</td>
            <td className="p-2 text-center"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">Contabilizado</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BankMockup() {
  return (
    <div className="space-y-3 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">Conciliación Bancaria Mensual:</span>
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">Banco de Chile Cta Cte</span>
        </div>
        <div className="text-slate-400 text-[11px]">Diferencia de Cuadratura: <strong className="text-emerald-400">$ 0</strong></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
          <div className="text-[10px] text-slate-400">Saldo Cartola Bancaria</div>
          <div className="text-base font-bold text-white">$ 14.850.200</div>
        </div>
        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
          <div className="text-[10px] text-slate-400">Saldo Libro Mayor Contable</div>
          <div className="text-base font-bold text-white">$ 14.850.200</div>
        </div>
        <div className="bg-emerald-950/30 p-3 rounded-lg border border-emerald-500/30">
          <div className="text-[10px] text-emerald-400 font-semibold">Estado de Conciliación</div>
          <div className="text-base font-bold text-emerald-400">100% Conciliado</div>
        </div>
      </div>
    </div>
  );
}
