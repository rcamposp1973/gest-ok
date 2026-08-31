import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2, 
  Play, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  ShieldCheck, 
  Building2, 
  ArrowRight, 
  TrendingUp, 
  Users, 
  Calendar, 
  Zap, 
  Clock, 
  DollarSign, 
  PieChart, 
  Lock, 
  Smartphone, 
  Check, 
  HelpCircle
} from 'lucide-react';
import { APP_VERSION } from '../constants/version';

export default function PresentationView() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const slidesCount = 8;

  // Manejo de pantalla completa
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error("Error al activar pantalla completa:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.error("Error al salir de pantalla completa:", err);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Navegación con teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        e.preventDefault();
        setCurrentSlide(prev => Math.min(prev + 1, slidesCount - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlide(prev => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const nextSlide = () => setCurrentSlide(prev => Math.min(prev + 1, slidesCount - 1));
  const prevSlide = () => setCurrentSlide(prev => Math.max(prev - 1, 0));

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col bg-slate-950 text-white rounded-2xl shadow-2xl overflow-hidden border border-slate-800 transition-all ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none border-none h-screen w-screen' : 'min-h-[700px] w-full'
      }`}
    >
      {/* BARRA SUPERIOR DE CONTROL DE PRESENTACIÓN */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-3 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-indigo-500 to-emerald-400 p-2 rounded-lg font-black text-white text-xs tracking-wider">
            Gest_OK
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-200">Pitch Deck Comercial</span>
            <span className="text-[10px] bg-indigo-950 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded border border-indigo-700">
              {APP_VERSION}
            </span>
          </div>
        </div>

        {/* SELECTOR Y CONTROLES DE DIAPOSITIVAS */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono font-bold text-slate-400">
            Diapositiva <span className="text-emerald-400 font-bold">{currentSlide + 1}</span> de {slidesCount}
          </span>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={prevSlide}
              disabled={currentSlide === 0}
              className="p-1.5 rounded-md hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
              title="Anterior (Flecha Izquierda)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <button
              onClick={nextSlide}
              disabled={currentSlide === slidesCount - 1}
              className="p-1.5 rounded-md hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
              title="Siguiente (Flecha Derecha / Espacio)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            title="Pantalla Completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Salir' : 'Pantalla Completa'}</span>
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL DE LA DIAPOSITIVA */}
      <div className="flex-1 relative flex items-center justify-center p-6 md:p-12 overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        
        {/* DIAPOSITIVA 1: PORTADA */}
        {currentSlide === 0 && (
          <div className="max-w-4xl w-full text-center space-y-8 animate-fadeIn">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Plataforma Contable de Nueva Generación — Chile</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-tight">
                Gest_OK: El ERP Contable Diseñado por y para <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400">Contadores</span>
              </h1>
              <p className="text-slate-300 text-base md:text-xl max-w-2xl mx-auto leading-relaxed font-light">
                La plataforma contable que elimina la digitación innecesaria, automatiza análisis y te devuelve el control de tus cierres.
              </p>
            </div>

            {/* CUADRO DESTACADO MENSAJE CLAVE */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl max-w-2xl mx-auto relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-400"></div>
              <p className="text-slate-200 italic text-sm md:text-base font-medium">
                "No es un software hecho por informáticos que no entienden de contabilidad; es la herramienta real que tu estudio necesita."
              </p>
            </div>

            {/* MOCKUP INTERACTIVO / VISUAL TIPO EXCEL */}
            <div className="pt-4 max-w-3xl mx-auto">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 shadow-2xl text-left font-mono text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                    <span className="text-slate-400 text-[11px] ml-2">Estudio Prueba SpA &bull; Grilla Contable Oficial</span>
                  </div>
                  <span className="bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-800">
                    DEBE = HABER ($14.500.000)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-slate-400 text-[11px] font-bold bg-slate-950 p-2 rounded">
                  <span>COD_CTA</span>
                  <span>CUENTA</span>
                  <span>ANALISIS</span>
                  <span className="text-right">SALDO CLP</span>
                </div>
                <div className="space-y-1 mt-1 text-slate-300 text-[11px]">
                  <div className="grid grid-cols-4 gap-2 p-1 hover:bg-slate-800 rounded">
                    <span className="text-indigo-400">1-1-01-001</span>
                    <span>Caja Central</span>
                    <span className="text-slate-500">-</span>
                    <span className="text-right text-emerald-400">$ 2.500.000</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 p-1 hover:bg-slate-800 rounded">
                    <span className="text-indigo-400">1-1-02-001</span>
                    <span>Banco Santander</span>
                    <span className="text-amber-400">REQ_CONCIL*</span>
                    <span className="text-right text-emerald-400">$ 12.000.000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DIAPOSITIVA 2: EL PROBLEMA EN CHILE */}
        {currentSlide === 1 && (
          <div className="max-w-4xl w-full space-y-8 animate-fadeIn">
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-wider bg-rose-950/60 px-3 py-1 rounded-full border border-rose-800/40">
                El Diagnóstico de la Industria
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white">
                ¿Por qué los sistemas tradicionales nos hacen perder tiempo?
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-2 hover:border-rose-500/40 transition-colors">
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="p-2 bg-rose-950 rounded-xl border border-rose-800">
                    <Clock className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-white">Digitación lenta, rígida y repetitiva</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Pantallas antiguas con múltiples pestañas para ingresar un solo comprobante contable, ralentizando el trabajo diario del equipo.
                </p>
              </div>

              <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-2 hover:border-rose-500/40 transition-colors">
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="p-2 bg-rose-950 rounded-xl border border-rose-800">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-white">Errores en análisis al cerrar el año</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Falta de validaciones estrictas durante el año provocan descuadres masivos de RUT, folios y centro de costos al momento de auditar.
                </p>
              </div>

              <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-2 hover:border-rose-500/40 transition-colors">
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="p-2 bg-rose-950 rounded-xl border border-rose-800">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-white">Conciliación bancaria manual y tediosa</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Horas perdidas cruzando cartolas bancarias en planillas externas sin integración con los auxiliares de clientes y proveedores.
                </p>
              </div>

              <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-2 hover:border-rose-500/40 transition-colors">
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="p-2 bg-rose-950 rounded-xl border border-rose-800">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base text-white">Software legado con cobros excesivos</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Plataformas tradicionales (Softland/Nubox) que cobran sumas elevadas por usuarios extra o módulos básicos sin innovación continua.
                </p>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-r from-rose-950/40 to-slate-900 border border-rose-900/50 rounded-xl text-center">
              <p className="text-slate-200 text-sm font-semibold">
                ⚠️ <span className="text-rose-300">Mensaje Clave:</span> Perder horas en corregir descuadres o revisar analíticos frena el crecimiento directo de tu estudio contable.
              </p>
            </div>
          </div>
        )}

        {/* DIAPOSITIVA 3: LA SOLUCIÓN - GRILLAS ESTILO EXCEL */}
        {currentSlide === 2 && (
          <div className="max-w-4xl w-full space-y-8 animate-fadeIn">
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/40">
                La Solución Tecnológica
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white">
                Experiencia Fluida: Grillas Estilo Excel con Filtros Dinámicos
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                <div className="p-2 bg-indigo-950 text-indigo-400 rounded-lg w-fit">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-white">Matriz Tipo Planilla</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Trabaja con la rapidez y naturalidad de Excel, respaldado por una base de datos corporativa ultra segura.
                </p>
              </div>

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                <div className="p-2 bg-emerald-950 text-emerald-400 rounded-lg w-fit">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-white">Filtros Dinámicos en Encabezados</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Filtra al instante por código, nombre, exigibilidad o columna de balance directamente desde la cabecera.
                </p>
              </div>

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                <div className="p-2 bg-teal-950 text-teal-400 rounded-lg w-fit">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-white">Carga Masiva Validada</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Importa desde planillas Excel en segundos con comprobación automática de cuadratura (Debe = Haber).
                </p>
              </div>
            </div>

            {/* SIMULACIÓN INTERACTIVA DE GRILLA */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>VISTA PREVIA: Plan de Cuentas &bull; Cliente Prueba SpA</span>
                <span className="text-emerald-400 font-bold">100% Cuadrado</span>
              </div>
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-slate-800 text-slate-200 font-bold">
                    <tr>
                      <th className="p-2 border-r border-slate-700">COD_CTA</th>
                      <th className="p-2 border-r border-slate-700">NOMBRE_CTA</th>
                      <th className="p-2 border-r border-slate-700">IMPUTABLE</th>
                      <th className="p-2 border-r border-slate-700">REQ_AUX</th>
                      <th className="p-2 border-r border-slate-700">REQ_DOC</th>
                      <th className="p-2 text-right">BLCE 8 COL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950 text-slate-300">
                    <tr>
                      <td className="p-2 text-indigo-400 font-bold">1-1-01-001</td>
                      <td className="p-2 font-sans font-semibold">Caja Moneda Nacional</td>
                      <td className="p-2 text-emerald-400">SI</td>
                      <td className="p-2 text-slate-600">NO</td>
                      <td className="p-2 text-slate-600">NO</td>
                      <td className="p-2 text-right text-indigo-300">ACTIVO</td>
                    </tr>
                    <tr className="bg-slate-900/50">
                      <td className="p-2 text-indigo-400 font-bold">2-1-01-001</td>
                      <td className="p-2 font-sans font-semibold">Proveedores Nacionales</td>
                      <td className="p-2 text-emerald-400">SI</td>
                      <td className="p-2 text-emerald-400 font-bold">SI*</td>
                      <td className="p-2 text-emerald-400 font-bold">SI*</td>
                      <td className="p-2 text-right text-amber-300">PASIVO</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DIAPOSITIVA 4: CONTROL DE ANÁLISIS RIGUROSO */}
        {currentSlide === 3 && (
          <div className="max-w-4xl w-full space-y-8 animate-fadeIn">
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-800/40">
                Auditoría en Tiempo Real
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white">
                Cero Errores Contables: Exigibilidad Estricta de Análisis
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="font-bold text-base text-emerald-400 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" /> Validación Bloqueante
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Si el Plan de Cuentas exige RUT, DTE, Centro de Costos, Proyecto o Vencimiento, el sistema <strong>imposibilita guardar el asiento</strong> sin antes completar la información requerida.
                  </p>
                </div>

                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="font-bold text-base text-indigo-400 flex items-center gap-2">
                    <Building2 className="w-5 h-5" /> Catálogos Dinámicos Integrados
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Soporte nativo para documentos oficiales SII (Factura 33, Exenta 34, NC 61, ND 56) y tipos de documentos internos parametrizables.
                  </p>
                </div>

                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="font-bold text-base text-teal-400 flex items-center gap-2">
                    <PieChart className="w-5 h-5" /> Distribución Porcentual Automática
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Reparte gastos o ingresos en múltiples centros de costo o proyectos con un solo clic según reglas predefinidas.
                  </p>
                </div>
              </div>

              {/* DEMOSTRACIÓN VISUAL BADGES DE EXIGIBILIDAD */}
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-center space-y-6">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  Indicadores de Exigibilidad Activa
                </h4>

                <div className="space-y-3">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Auxiliar RUT Obligatorio</span>
                    <span className="px-2.5 py-1 bg-indigo-950 text-indigo-300 font-mono text-xs font-bold rounded border border-indigo-700">
                      RUT*
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Documento / Folio Requerido</span>
                    <span className="px-2.5 py-1 bg-amber-950 text-amber-300 font-mono text-xs font-bold rounded border border-amber-700">
                      DOC*
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Centro de Costo Asignado</span>
                    <span className="px-2.5 py-1 bg-emerald-950 text-emerald-300 font-mono text-xs font-bold rounded border border-emerald-700">
                      CC*
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Fecha Vencimiento</span>
                    <span className="px-2.5 py-1 bg-purple-950 text-purple-300 font-mono text-xs font-bold rounded border border-purple-700">
                      VCTO*
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DIAPOSITIVA 5: CONCILIACIÓN BANCARIA INTELIGENTE */}
        {currentSlide === 4 && (
          <div className="max-w-4xl w-full space-y-8 animate-fadeIn">
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-teal-400 uppercase tracking-wider bg-teal-950/60 px-3 py-1 rounded-full border border-teal-800/40">
                Automatización de Tesorería
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white">
                Concilia y Contabiliza en Segundos
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                <span className="text-2xl font-black text-indigo-400 font-mono">01</span>
                <h3 className="font-bold text-sm text-white">Detección de Período Abierto</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Identifica automáticamente el ejercicio vigente sin riesgo de ingresar registros en períodos cerrados.
                </p>
              </div>

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                <span className="text-2xl font-black text-emerald-400 font-mono">02</span>
                <h3 className="font-bold text-sm text-white">Desglose de Facturas Pendientes</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Muestra la cartera completa de clientes (deudores) y proveedores (acreedores) por saldar.
                </p>
              </div>

              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-2">
                <span className="text-2xl font-black text-teal-400 font-mono">03</span>
                <h3 className="font-bold text-sm text-white">Autocompletado Inteligente</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Al seleccionar el movimiento, el sistema rellena RUT, folio, centro de costos y vencimiento automáticamente.
                </p>
              </div>
            </div>

            {/* DIAGRAMA DE FLUJO INTERACTIVO */}
            <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase text-center tracking-wider">
                Flujo de Conciliación en 1 Clic
              </h4>
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 w-full md:w-1/3">
                  <p className="text-xs text-slate-400 font-mono">Paso A</p>
                  <p className="text-sm font-bold text-white mt-1">Cargo / Abono Cartola</p>
                  <p className="text-[11px] text-emerald-400 font-mono mt-1">$ 1.190.000 Santander</p>
                </div>

                <ArrowRight className="w-5 h-5 text-indigo-400 rotate-90 md:rotate-0" />

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 w-full md:w-1/3">
                  <p className="text-xs text-slate-400 font-mono">Paso B</p>
                  <p className="text-sm font-bold text-white mt-1">Selección de Factura</p>
                  <p className="text-[11px] text-indigo-300 font-mono mt-1">Factura 1045 &bull; Cliente Prueba SpA</p>
                </div>

                <ArrowRight className="w-5 h-5 text-emerald-400 rotate-90 md:rotate-0" />

                <div className="p-4 bg-emerald-950/60 rounded-xl border border-emerald-700/60 w-full md:w-1/3">
                  <p className="text-xs text-emerald-300 font-mono font-bold">Paso C</p>
                  <p className="text-sm font-bold text-white mt-1">Asiento Generado</p>
                  <p className="text-[11px] text-emerald-300 font-mono mt-1">100% Conciliado</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DIAPOSITIVA 6: INFORMES Y ESTRUCTURA FINANCIERA KPI */}
        {currentSlide === 5 && (
          <div className="max-w-4xl w-full space-y-8 animate-fadeIn">
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider bg-purple-950/60 px-3 py-1 rounded-full border border-purple-800/40">
                Reportabilidad Ejecutiva
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white">
                De la Contabilidad Tributaria a la Inteligencia de Negocio
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="p-2 bg-indigo-950 text-indigo-400 rounded-lg w-fit">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-white">Finanzas Operativas</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Libros tributarios oficiales (Diario, Mayor), Libro de Compras y Ventas, y Balance de 8 Columnas con desglose analítico.
                </p>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="p-2 bg-purple-950 text-purple-400 rounded-lg w-fit">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-white">KPIs e Informes IFRS</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Balance Clasificado IFRS y Estado de Resultados visual con métricas listas para presentar directamente a directorios.
                </p>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="p-2 bg-emerald-950 text-emerald-400 rounded-lg w-fit">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-white">Protección Referencial</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Blindaje total: imposible borrar o alterar cuentas o auxiliares con asientos contables vigentes en el sistema.
                </p>
              </div>
            </div>

            {/* PREVISUALIZACIÓN DASHBOARD */}
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-300 font-mono">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Informe Gerencial: Balance de 8 Columnas &bull; Cliente Prueba SpA</span>
              </div>
              <span className="text-indigo-400 font-bold">Listo para Exportar PDF / Excel</span>
            </div>
          </div>
        )}

        {/* DIAPOSITIVA 7: ROADMAP 30 DÍAS */}
        {currentSlide === 6 && (
          <div className="max-w-4xl w-full space-y-8 animate-fadeIn">
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider bg-amber-950/60 px-3 py-1 rounded-full border border-amber-800/40">
                Evolución Continua
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white">
                Solución Integral 360° en Camino (Roadmap 30 Días)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4 hover:border-amber-500/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-950 text-amber-400 rounded-xl border border-amber-800">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                      En Desarrollo
                    </span>
                    <h3 className="text-lg font-bold text-white mt-1">Módulo de Remuneraciones</h3>
                  </div>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Liquidaciones de sueldo, Libro de Remuneraciones electrónico (LRE) y cálculo actualizado de leyes sociales vigentes en Chile.
                </p>
              </div>

              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4 hover:border-emerald-500/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-800">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                      Próximo Lanzamiento
                    </span>
                    <h3 className="text-lg font-bold text-white mt-1">Facturación y DTEs Directos</h3>
                  </div>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Emisión y recepción automática de Documentos Tributarios Electrónicos sincronizados directamente con el SII Chile.
                </p>
              </div>
            </div>

            <div className="p-5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border border-amber-800/40 rounded-2xl text-center">
              <p className="text-slate-200 text-sm font-bold">
                🚀 Una sola plataforma para administrar toda la operación contable, tributaria y laboral de tus clientes.
              </p>
            </div>
          </div>
        )}

        {/* DIAPOSITIVA 8: OFERTA DE LANZAMIENTO / CTA */}
        {currentSlide === 7 && (
          <div className="max-w-4xl w-full text-center space-y-8 animate-fadeIn">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-xs font-bold">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Oportunidad Exclusiva de Lanzamiento</span>
            </div>

            <div className="space-y-4">
              <h2 className="text-3xl md:text-5xl font-black text-white">
                Súmate al Programa de Estudios Fundadores
              </h2>
              <p className="text-slate-300 text-base max-w-xl mx-auto font-light">
                Moderniza la gestión de tu estudio contable hoy mismo con beneficios únicos por adopción temprana.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
                <Check className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Prueba Gratuita 15 Días</h3>
                <p className="text-slate-400 text-xs">Acceso completo a todas las funcionalidades sin compromiso inicial.</p>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
                <Check className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Planes Flexibles</h3>
                <p className="text-slate-400 text-xs">Precios adaptados por volumen de empresas y usuarios de tu equipo.</p>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
                <Check className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Migración Asistida</h3>
                <p className="text-slate-400 text-xs">Carga masiva rápida vía plantillas Excel pre-configuradas.</p>
              </div>
            </div>

            {/* LLAMADO A LA ACCIÓN DESTACADO */}
            <div className="p-8 bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 border border-indigo-700/60 rounded-3xl shadow-2xl space-y-4 max-w-2xl mx-auto">
              <h3 className="text-xl md:text-2xl font-black text-white">
                "Agenda tu demo personalizada de 15 minutos hoy mismo."
              </h3>
              <p className="text-indigo-200 text-xs">
                Descubre cómo Gest_OK puede optimizar los tiempos de tu estudio contable en la primera semana.
              </p>
              <button 
                onClick={() => alert("¡Demostración solicitada! Gracias por interesarte en Gest_OK.")}
                className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-xl shadow-lg transition-transform hover:scale-105"
              >
                Solicitar Demostración Comercial
              </button>
            </div>
          </div>
        )}

      </div>

      {/* PIE DE NAVEGACIÓN Y MINIATURAS/PUNTOS */}
      <div className="bg-slate-900/90 border-t border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {Array.from({ length: slidesCount }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`h-2.5 rounded-full transition-all ${
                currentSlide === idx 
                  ? 'w-8 bg-emerald-400' 
                  : 'w-2.5 bg-slate-700 hover:bg-slate-500'
              }`}
              title={`Diapositiva ${idx + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          
          <button
            onClick={nextSlide}
            disabled={currentSlide === slidesCount - 1}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-bold text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs"
          >
            Siguiente <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
