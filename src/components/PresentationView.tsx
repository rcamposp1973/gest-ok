import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2, 
  Play, 
  Pause,
  RotateCcw,
  Volume2, 
  VolumeX,
  Copy, 
  Check, 
  Sparkles, 
  Video, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  ShieldCheck, 
  Building2, 
  ArrowRight, 
  TrendingUp, 
  Zap, 
  Clock, 
  DollarSign, 
  PieChart, 
  Lock, 
  Send, 
  Share2, 
  MessageCircle, 
  Instagram, 
  Facebook, 
  Smartphone, 
  Layers, 
  ExternalLink,
  Download,
  Award
} from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import socialSquareImg from '../assets/images/gestok_social_square_1788373265590.jpg';
import storyReelImg from '../assets/images/gestok_story_reel_1788373282275.jpg';

interface ReelScene {
  id: number;
  durationSeconds: number;
  badge: string;
  hookText: string;
  subText: string;
  narration: string;
  highlightWords: string[];
}

export default function PresentationView() {
  // Pestañas principales de Redes Sociales y Formatos
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'instagram' | 'facebook' | 'videotour'>('whatsapp');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ESTADO INSTAGRAM: Selector de Carrusel (1:1) vs Reel/Story (9:16)
  const [instagramFormat, setInstagramFormat] = useState<'carousel' | 'reel'>('carousel');
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);

  // ESTADO REEL / VIDEO TOUR ANIMADO
  const [activeReelIdx, setActiveReelIdx] = useState(0);
  const [isPlayingReel, setIsPlayingReel] = useState(false);
  const [reelProgress, setReelProgress] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // ESTADO WHATSAPP: Mensaje para Grupos vs Mensaje Directo
  const [whatsappTemplate, setWhatsappTemplate] = useState<'group' | 'direct'>('group');

  // ESCENAS DEL VIDEO REEL VERTICAL (9:16) Y TOUR VISUAL
  const reelScenes: ReelScene[] = [
    {
      id: 1,
      durationSeconds: 6,
      badge: "EL PROBLEMA",
      hookText: "¿SIGUES DIGITANDO FACTURAS A MANO EN 2026?",
      subText: "Softland y Nubox te cobran por todo y siguen atrapados en interfaces lentas.",
      narration: "¿Sigues perdiendo horas digitando facturas y cuadrando cartolas a mano en tu estudio contable? Es momento de cambiar.",
      highlightWords: ["DIGITANDO", "MANO", "CAMBIAR"]
    },
    {
      id: 2,
      durationSeconds: 7,
      badge: "FACTURACIÓN SII",
      hookText: "CONEXIÓN DUAL OFICIAL CON EL SII",
      subText: "Emite Facturas 33/34 y NC 61 con XML y Timbre TED sin entrar a sii.cl.",
      narration: "Gest_OK se conecta directamente al SII con credenciales duales de la empresa y del representante legal.",
      highlightWords: ["CONEXIÓN DUAL", "SII", "TIMBRE TED"]
    },
    {
      id: 3,
      durationSeconds: 7,
      badge: "RCV & HONORARIOS",
      hookText: "CARGA MASIVA RCV EN 2 SEGUNDOS",
      subText: "Arrastra los CSVs del SII: cero duplicados y creación automática de auxiliares.",
      narration: "Arrastra tus compras, ventas y boletas de honorarios. El sistema valida duplicados y crea los asientos solos.",
      highlightWords: ["2 SEGUNDOS", "CERO DUPLICADOS", "ASIENTOS SOLOS"]
    },
    {
      id: 4,
      durationSeconds: 7,
      badge: "BANCO Y TESORERÍA",
      hookText: "CONCILIACIÓN BANCARIA EN 1 CLIC",
      subText: "Cruza cartolas de Santander, Chile o BCI contra facturas pendientes de cobro.",
      narration: "Sube la cartola de cualquier banco chileno y concilia tus facturas en un solo clic manteniendo el banco cuadrado.",
      highlightWords: ["1 CLIC", "SANTANDER", "BANCO CUADRADO"]
    },
    {
      id: 5,
      durationSeconds: 6,
      badge: "CIERRES & F29",
      hookText: "F29 & BALANCE IFRS AUTOMÁTICOS",
      subText: "Exigibilidad estricta: imposible guardar con descuadres de RUT o Centro de Costos.",
      narration: "Obtén tu Formulario 29 mensual y el Balance de 8 Columnas clasificado sin trasnoches ni errores.",
      highlightWords: ["F29 AUTOMÁTICO", "BALANCE IFRS", "SIN ERRORES"]
    },
    {
      id: 6,
      durationSeconds: 6,
      badge: "OFERTA LANZAMIENTO",
      hookText: "15 DÍAS DE PRUEBA GRATIS + MIGRACIÓN",
      subText: "Súmate al Programa de Estudios Fundadores sin tarjeta de crédito.",
      narration: "Pruébalo gratis por 15 días con migración asistida de tus datos. Agenda tu demo en gestok.cl.",
      highlightWords: ["15 DÍAS GRATIS", "MIGRACIÓN", "GESTOK.CL"]
    }
  ];

  const currentReel = reelScenes[activeReelIdx];

  // LOCUCIÓN CON SÍNTESIS DE VOZ NAVEGADOR
  const speakNarration = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-CL';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  // CONTROL DEL SIMULADOR DE VIDEO / REEL
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlayingReel) {
      const sceneDuration = currentReel.durationSeconds * 1000;
      const tick = 100;
      interval = setInterval(() => {
        setReelProgress(prev => {
          const next = prev + (tick / sceneDuration) * 100;
          if (next >= 100) {
            if (activeReelIdx < reelScenes.length - 1) {
              setActiveReelIdx(idx => idx + 1);
              return 0;
            } else {
              setIsPlayingReel(false);
              return 100;
            }
          }
          return next;
        });
      }, tick);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingReel, activeReelIdx, currentReel.durationSeconds]);

  // Al cambiar de escena en reproducción con voz activa
  useEffect(() => {
    if (isPlayingReel && voiceEnabled) {
      speakNarration(currentReel.narration);
    }
  }, [activeReelIdx, isPlayingReel, voiceEnabled]);

  const togglePlayReel = () => {
    if (!isPlayingReel) {
      setIsPlayingReel(true);
      if (reelProgress >= 100) {
        setActiveReelIdx(0);
        setReelProgress(0);
      }
      if (voiceEnabled) speakNarration(currentReel.narration);
    } else {
      setIsPlayingReel(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  };

  const handleResetReel = () => {
    setIsPlayingReel(false);
    setActiveReelIdx(0);
    setReelProgress(0);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const toggleVoice = () => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } else {
      setVoiceEnabled(true);
      if (isPlayingReel) speakNarration(currentReel.narration);
    }
  };

  // PANTALLA COMPLETA
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // =========================================================================
  // TEXTOS FORMATEADOS PARA CADA RED SOCIAL
  // =========================================================================

  // WHATSAPP: MENSAJE PARA GRUPOS
  const whatsappGroupText = `🇨🇱 *¿CUÁNTAS HORAS PIERDE TU ESTUDIO CONTABLE AL MES DIGITANDO FACTURAS Y CUADRANDO BANCOS A MANO?* ⏱️📊

Colegas contadores y administradores, les presento *GEST_OK*, la plataforma contable en la nube creada en Chile *por contadores para contadores*:

⚡ *Conexión Dual Directa con el SII:* Emisión oficial de Facturas afectas (33), exentas (34) y Notas de Crédito (61) con XML y Timbre Electrónico TED sin entrar a sii.cl.
📥 *Importación RCV y Boletas de Honorarios BHE:* Cargas el CSV oficial del SII en 2 segundos; el sistema detecta duplicados y crea los auxiliares automáticamente.
🏦 *Conciliación Bancaria en 1 Clic:* Importas cartolas de Santander, Banco de Chile, BCI o BancoEstado y concilia facturas pendientes al instante.
🛡️ *Exigibilidad Estricta de Análisis:* Cero descuadres de RUT o Centro de Costo en auditorías.
📑 *Formulario 29 y Balance 8 Columnas IFRS:* Listos en tiempo real para cerrar el mes sin trasnoches.

🎁 *LANZAMIENTO EXCLUSIVO:*
Estamos abriendo cupos para el *Programa de Estudios Fundadores*:
✅ *15 días de prueba 100% gratuita* (sin tarjeta).
✅ *Migración asistida* de tus empresas y plan de cuentas.
✅ *Tarifa preferencial congelada de por vida*.

👉 Agenda una demo rápida de 15 minutos o solicita tu acceso aquí:
📲 *WhatsApp Directo:* +56 9 8765 4321
🌐 *Web:* https://gestok.cl`;

  // WHATSAPP: MENSAJE DIRECTO 1 A 1
  const whatsappDirectText = `Hola [Nombre del Contador o Socio], ¿cómo estás? Te escribo porque sé lo desgastante que son los cierres mensuales y la digitación manual de facturas y cartolas bancarias.

Desarrollamos *GEST_OK*, un software contable chileno en la nube que automatiza el 70% de la carga operativa:
- Emite DTEs con conexión dual al SII (XML y Timbre TED automático).
- Importa masivamente RCV y Honorarios sin duplicados.
- Concilia cartolas bancarias en 1 clic.
- Genera el F29 mensual y el Balance de 8 columnas al día.

Te invito a probarlo gratis por 15 días con migración asistida de tu primera empresa para que compares la velocidad frente a tu software actual.

¿Tienes 10 minutos esta semana para mostrarte una demo rápida por pantalla? Un abrazo.`;

  // INSTAGRAM: COPY COMPLETO CON HASHTAGS
  const instagramPostCopy = `¿Sigues cerrando el mes a las 3 AM por culpa de la digitación manual? 😫📉

Los sistemas contables tradicionales como Softland o Nubox se quedaron en interfaces lentas, con cobros abusivos por cada usuario extra y sin automatizaciones reales.

Es momento de dar el salto a @gest_ok.cl 🚀

Con Gest_OK gestionas tu estudio contable con tecnología de punta:
⚡ Emisión DTE con conexión dual certificada al SII (Facturas 33, 34 y NC 61).
📥 Importación en 2 segundos de Compras, Ventas y Boletas de Honorarios con validación anti-duplicados.
🏦 Conciliación Bancaria en 1 clic de Santander, Banco de Chile, BCI y BancoEstado.
🛡️ Exigibilidad estricta que previene descuadres de análisis antes de guardar.
📊 Formulario 29 mensual y Balance IFRS de 8 columnas en tiempo real.

🎁 BENEFICIO DE LANZAMIENTO:
Súmate hoy al Programa de Estudios Fundadores:
✅ 15 Días Gratis de acceso completo.
✅ Migración asistida de tu plan de cuentas y empresas en menos de 48 hrs.
✅ Tarifa preferencial congelada de por vida.

👉 Comenta la palabra "DEMO" o haz clic en el enlace de nuestra biografía para activar tu acceso inmediato.

---
#ContadoresChile #ContabilidadChile #PymesChile #EmprendedoresChile #SoftwareContable #FacturaElectronica #SIIChile #OperacionRenta #EstudiosContables #FinanzasChile #GestionPyme #SoftlandChile #NuboxChile #ConciliacionBancaria #Formulario29`;

  // FACEBOOK: POST PARA GRUPOS DE CONTADORES Y EMPRENDEDORES
  const facebookGroupPost = `🚨 ATENCIÓN CONTADORES Y SOCIOS DE ESTUDIOS EN CHILE: ¿Cuánto tiempo le dedican a tareas mecánicas que un software debería hacer solo?

Hicimos una encuesta con más de 40 contadores y encontramos 3 dolores comunes:
1️⃣ Digitar manualmente facturas y notas de crédito en softwares de escritorio obsoletos.
2️⃣ Cruzar cartolas bancarias en Excel a fin de mes persiguiendo diferencias de centavos.
3️⃣ Corregir descuadres de RUT y centros de costos justo antes de presentar el F29 o el Balance.

Por eso creamos GEST_OK (https://gestok.cl), el ERP contable en la nube diseñado exclusivamente para la normativa chilena:

🔹 CONEXIÓN DUAL SII: Emisión de facturas y notas de crédito con Timbre TED y centralización contable automática sin salir del sistema.
🔹 IMPORTADOR INTELIGENTE RCV: Arrastras el archivo del SII y en 3 segundos tienes registradas las compras y ventas con creación automática de fichas de proveedores/clientes.
🔹 CONCILIACIÓN BANCARIA EN 1 CLIC: Reconoce cargos/abonos de tu cartola y cruza contra tus facturas pendientes.
🔹 AUDITORÍA Y F29 EN VIVO: El débito, crédito y retenciones de honorarios se calculan en tiempo real.

Estamos recibiendo a los primeros 25 estudios en el "Programa de Estudios Fundadores":
🎯 15 días de prueba sin costo ni compromiso.
🎯 Te ayudamos personalmente a migrar tus planes de cuentas y auxiliares.
🎯 Precio congelado de por vida con usuarios ilimitados.

¿Te gustaría probarlo en tu estudio? Escribe "QUIERO DEMO" en los comentarios o envíame un mensaje privado y te agendo una presentación de 15 minutos.`;

  // 6 LÁMINAS DEL CARRUSEL DE INSTAGRAM (1:1)
  const carouselSlides = [
    {
      slideNum: "1/6",
      title: "¿SIGUES DIGITANDO FACTURAS A MANO EN 2026?",
      subtitle: "Descubre cómo los estudios contables modernos en Chile automatizan el 70% de su trabajo.",
      badge: "EL DOLOR ACTUAL",
      accentColor: "from-rose-600 to-amber-600",
      content: (
        <div className="space-y-4 text-center">
          <div className="p-4 bg-rose-950/50 border border-rose-800/80 rounded-2xl">
            <p className="text-sm text-rose-200 font-medium">
              "Horas perdidas pasando datos de sii.cl a sistemas viejos, cuadrando bancos en Excel y persiguiendo descuadres a fin de año."
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-amber-400 font-bold">
            <span>Hay una forma mejor 👉 Desliza para conocerla</span>
          </div>
        </div>
      )
    },
    {
      slideNum: "2/6",
      title: "CONEXIÓN DUAL OFICIAL CON EL SII",
      subtitle: "Emite Facturas 33/34 y Notas de Crédito 61 con Timbre Electrónico TED oficial.",
      badge: "FACTURACIÓN DTE",
      accentColor: "from-indigo-600 to-blue-600",
      content: (
        <div className="space-y-3">
          <div className="p-3 bg-indigo-950/60 border border-indigo-700/60 rounded-xl text-xs space-y-1">
            <p className="font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" /> Bóveda Segura de Firma Digital PFX
            </p>
            <p className="text-slate-300 text-[11px]">Validación del Representante Legal (Portal RCV) y de la Empresa (DTE / BHE).</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">DOCUMENTOS</span>
              <span className="font-bold text-indigo-300">Factura 33 / 34 / 61</span>
            </div>
            <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">ASIENTO CONTABLE</span>
              <span className="font-bold text-emerald-400">100% Automático</span>
            </div>
          </div>
        </div>
      )
    },
    {
      slideNum: "3/6",
      title: "CARGA MASIVA RCV Y HONORARIOS",
      subtitle: "Importa compras, ventas y boletas BHE desde los archivos oficiales del SII en 2 segundos.",
      badge: "AUTOMATIZACIÓN",
      accentColor: "from-teal-600 to-emerald-600",
      content: (
        <div className="space-y-3">
          <div className="p-3 bg-teal-950/60 border border-teal-700/60 rounded-xl text-xs space-y-1">
            <p className="font-bold text-white flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-teal-400" /> Cero Duplicados Garantizado
            </p>
            <p className="text-slate-300 text-[11px]">El sistema detecta si un RUT, Tipo y Folio ya existe y auto-crea la ficha del auxiliar.</p>
          </div>
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center">
            <span className="text-emerald-400 font-mono font-bold text-base block">100+ Documentos en 3 seg</span>
            <span className="text-slate-400 text-[11px]">Generación del comprobante de compras y ventas masivo</span>
          </div>
        </div>
      )
    },
    {
      slideNum: "4/6",
      title: "CONCILIACIÓN BANCARIA EN 1 CLIC",
      subtitle: "Cruza cartolas de cualquier banco chileno contra tus facturas pendientes.",
      badge: "TESORERÍA INTELIGENTE",
      accentColor: "from-emerald-600 to-cyan-600",
      content: (
        <div className="space-y-3">
          <div className="p-3 bg-emerald-950/60 border border-emerald-700/60 rounded-xl text-xs space-y-1">
            <p className="font-bold text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-400" /> Cruce Inteligente de Facturas
            </p>
            <p className="text-slate-300 text-[11px]">Detecta abonos y cargos de Santander, Chile, BCI o BancoEstado y sugiere el match.</p>
          </div>
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center">
            <span className="text-emerald-300 font-mono font-bold text-xs block">Saldo Cartola = Saldo Libro Mayor</span>
            <span className="text-slate-400 text-[11px]">Asiento bancario generado sin digitar una sola cuenta</span>
          </div>
        </div>
      )
    },
    {
      slideNum: "5/6",
      title: "GRILLAS EXCEL & EXIGIBILIDAD ESTRICTA",
      subtitle: "La agilidad de una planilla con la seguridad de una base de datos blindada.",
      badge: "CALIDAD DE DATOS",
      accentColor: "from-purple-600 to-indigo-600",
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 justify-center text-[10px] font-mono font-bold">
            <span className="px-2 py-1 bg-indigo-950 text-indigo-300 rounded border border-indigo-700">RUT* Bloqueante</span>
            <span className="px-2 py-1 bg-amber-950 text-amber-300 rounded border border-amber-700">DOC* Requerido</span>
            <span className="px-2 py-1 bg-emerald-950 text-emerald-300 rounded border border-emerald-700">CC* Obligatorio</span>
          </div>
          <div className="p-3 bg-purple-950/50 border border-purple-800/60 rounded-xl text-center text-xs">
            <p className="font-bold text-white">Formulario 29 & Balance 8 Columnas IFRS</p>
            <p className="text-slate-300 text-[11px]">Calculados en tiempo real listos para exportar a Excel y PDF.</p>
          </div>
        </div>
      )
    },
    {
      slideNum: "6/6",
      title: "PROGRAMA DE ESTUDIOS FUNDADORES",
      subtitle: "Pruébalo 15 días gratis con migración de datos asistida por nuestros expertos.",
      badge: "OFERTA LIMITADA",
      accentColor: "from-emerald-500 to-teal-500",
      content: (
        <div className="space-y-4 text-center">
          <div className="p-4 bg-gradient-to-r from-emerald-950 to-teal-950 border border-emerald-700 rounded-2xl space-y-2">
            <span className="inline-block px-3 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-full">
              CUPOS LIMITADOS
            </span>
            <ul className="text-xs text-slate-200 text-left space-y-1 list-disc list-inside">
              <li>15 días de acceso total sin tarjeta de crédito.</li>
              <li>Migración asistida de tus empresas y auxiliares.</li>
              <li>Tarifa preferencial congelada para siempre.</li>
            </ul>
          </div>
          <div className="pt-1">
            <span className="text-emerald-400 font-bold text-xs">
              Comenta "DEMO" o entra a gestok.cl 📲
            </span>
          </div>
        </div>
      )
    }
  ];

  // =========================================================================
  // FUNCIONES DE DESCARGA DIRECTA (IMÁGENES HD Y DOCUMENTOS DE TEXTO)
  // =========================================================================
  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTextKit = () => {
    const content = `================================================================================
GEST_OK - KIT COMERCIAL Y MATERIAL COMPLETO PARA REDES SOCIALES
Software Contable en la Nube con Conexión Dual SII & Conciliación Bancaria
Chile - 2026
Web: https://gestok.cl
================================================================================

1. WHATSAPP - MENSAJE PARA GRUPOS DE CONTADORES Y PYMES
--------------------------------------------------------------------------------
${whatsappGroupText}

--------------------------------------------------------------------------------
2. WHATSAPP - MENSAJE DIRECTO (1 A 1 CON SOCIOS Y COLEGAS)
--------------------------------------------------------------------------------
${whatsappDirectText}

--------------------------------------------------------------------------------
3. INSTAGRAM - COPY COMPLETO Y HASHTAGS OFICIALES
--------------------------------------------------------------------------------
${instagramPostCopy}

--------------------------------------------------------------------------------
4. INSTAGRAM - ESTRUCTURA DEL CARRUSEL DE 6 LÁMINAS (1:1)
--------------------------------------------------------------------------------
${carouselSlides.map(s => `[LÁMINA ${s.slideNum}] ${s.badge}
TÍTULO: ${s.title}
SUBTÍTULO: ${s.subtitle}
`).join('\n')}

--------------------------------------------------------------------------------
5. REEL / TIKTOK / STORIES - GUIÓN DE VIDEO VERTICAL (9:16 - 40 SEGUNDOS)
--------------------------------------------------------------------------------
${reelScenes.map(s => `[ESCENA ${s.id} - ${s.durationSeconds}s] ${s.badge}
TEXTO GIGANTE EN PANTALLA: ${s.hookText}
SUBTEXTO: ${s.subText}
LOCUCIÓN / GUION DE VOZ: "${s.narration}"
`).join('\n')}

--------------------------------------------------------------------------------
6. FACEBOOK - POST COMPLETO PARA GRUPOS DE CONTABILIDAD Y EMPRENDEDORES
--------------------------------------------------------------------------------
${facebookGroupPost}
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'GEST_OK_Kit_Redes_Sociales.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadAllPack = () => {
    downloadTextKit();
    setTimeout(() => {
      downloadFile(socialSquareImg, 'GEST_OK_Flyer_Cuadrado_1x1_Feed_WhatsApp.jpg');
    }, 400);
    setTimeout(() => {
      downloadFile(storyReelImg, 'GEST_OK_Flyer_Vertical_9x16_Story_Reel.jpg');
    }, 800);
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col bg-slate-950 text-white rounded-2xl shadow-2xl overflow-hidden border border-slate-800 transition-all ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none border-none h-screen w-screen' : 'min-h-[800px] w-full'
      }`}
    >
      {/* BARRA SUPERIOR DE CONTROL EJECUTIVO */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 p-2 rounded-xl font-black text-slate-950 text-xs tracking-wider shadow-md">
            GEST_OK
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">Kit de Redes Sociales & Presentación Comercial</span>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded border border-indigo-700">
                {APP_VERSION}
              </span>
              <span className="text-[10px] bg-amber-950 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-800">
                🔒 Solo Super Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Material visual y textos persuasivos listos para enviar a grupos de WhatsApp, Instagram y Facebook.</p>
          </div>
        </div>

        {/* NAVEGACIÓN ENTRE REDES SOCIALES Y BOTÓN DE DESCARGA */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadAllPack}
            className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 hover:opacity-95 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-transform hover:scale-102 cursor-pointer"
            title="Descarga automáticamente las imágenes en alta resolución y el archivo .txt con todos los copys"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Descargar Pack Completo</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-300" />
              <span>WhatsApp Grupos</span>
            </button>

            <button
              onClick={() => setActiveTab('instagram')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'instagram'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Instagram className="w-3.5 h-3.5 text-pink-300" />
              <span>Instagram (Feed & Reels)</span>
            </button>

            <button
              onClick={() => setActiveTab('facebook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'facebook'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Facebook className="w-3.5 h-3.5 text-blue-300" />
              <span>Facebook Grupos</span>
            </button>

            <button
              onClick={() => setActiveTab('videotour')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'videotour'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-indigo-300" />
              <span>Simulador Video Tour</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 ml-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs transition-colors border border-slate-800 cursor-pointer"
              title="Pantalla Completa"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL POR CANAL */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto bg-slate-950">

        {/* ========================================================================= */}
        {/* CANAL 1: WHATSAPP (GRUPOS & DIRECTO)                                      */}
        {/* ========================================================================= */}
        {activeTab === 'whatsapp' && (
          <div className="max-w-6xl mx-auto w-full space-y-6">
            
            {/* SELECTOR DE PLANTILLA WHATSAPP */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Presentación para Grupos de WhatsApp & Contactos Directos</h3>
                  <p className="text-xs text-slate-400">Mensaje con formato visual en negritas, emoticones y tarjeta publicitaria adjunta.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWhatsappTemplate('group')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    whatsappTemplate === 'group'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  📢 Para Grupos de Contadores
                </button>
                <button
                  onClick={() => setWhatsappTemplate('direct')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    whatsappTemplate === 'direct'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  👤 Mensaje 1 a 1 para Socios
                </button>
              </div>
            </div>

            {/* VISTA DUAL: SIMULADOR DE CHAT WHATSAPP + IMAGEN PROMOCIONAL ADJUNTA */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUMNA IZQUIERDA: SIMULADOR DE CHAT DE WHATSAPP */}
              <div className="lg:col-span-7 bg-[#0b141a] rounded-3xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col">
                
                {/* BARRA SUPERIOR WHATSAPP */}
                <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between border-b border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-slate-950 font-black flex items-center justify-center text-sm shadow">
                      GO
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <span>{whatsappTemplate === 'group' ? 'Contadores de Chile 🇨🇱 / Red Pymes' : 'Socio / Colega Contador'}</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono">Oficial</span>
                      </p>
                      <p className="text-[10px] text-slate-400">en línea</p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(whatsappTemplate === 'group' ? whatsappGroupText : whatsappDirectText, 'whatsapp_msg')}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                  >
                    {copiedKey === 'whatsapp_msg' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'whatsapp_msg' ? '¡Copiado!' : 'Copiar para WhatsApp'}</span>
                  </button>
                </div>

                {/* CUERPO DEL CHAT WHATSAPP */}
                <div className="p-4 md:p-6 space-y-4 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px] min-h-[460px] overflow-y-auto">
                  
                  {/* BURBUJA DE MENSAJE WHATSAPP */}
                  <div className="bg-[#005c4b] text-slate-100 rounded-2xl rounded-tl-xs p-4 text-xs space-y-3 shadow-md max-w-xl ml-auto border border-emerald-600/30 leading-relaxed font-sans">
                    
                    {/* IMAGEN PREVIEW DENTRO DE LA BURBUJA */}
                    <div className="rounded-xl overflow-hidden border border-emerald-700/40 relative">
                      <img 
                        src={socialSquareImg} 
                        alt="Gest_OK Portada WhatsApp" 
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-[11px] font-bold text-white">
                        GEST_OK &bull; Software Contable en la Nube con SII Dual
                      </div>
                    </div>

                    <div className="whitespace-pre-line text-[11.5px] leading-relaxed text-slate-100">
                      {whatsappTemplate === 'group' ? whatsappGroupText : whatsappDirectText}
                    </div>

                    <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/70 pt-1">
                      <span>10:30 AM</span>
                      <span className="text-cyan-300 font-bold font-mono">✓✓</span>
                    </div>
                  </div>

                </div>

                {/* ACCIONES DE ENVÍO DIRECTO */}
                <div className="bg-[#202c33] px-4 py-3 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">💡 Tip: Copia el texto y adjunta la imagen para lograr una tasa de apertura del 90%.</span>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(whatsappTemplate === 'group' ? whatsappGroupText : whatsappDirectText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow transition-transform hover:scale-105"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Abrir en WhatsApp Web</span>
                  </a>
                </div>
              </div>

              {/* COLUMNA DERECHA: TARJETA GRÁFICA PROMOCIONAL LISTA PARA DESCARGAR */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Flyer Oficial para Adjuntar</span>
                    </span>
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">
                      Formato 1:1 Cuadrado
                    </span>
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-2xl relative group">
                    <img 
                      src={socialSquareImg} 
                      alt="Flyer Oficial Gest_OK" 
                      className="w-full object-cover rounded-2xl group-hover:scale-102 transition-transform duration-300"
                    />
                  </div>

                  {/* BOTONES DE DESCARGA DIRECTA */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => downloadFile(socialSquareImg, 'GEST_OK_Flyer_WhatsApp_1x1.jpg')}
                      className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-all cursor-pointer text-center"
                    >
                      <Download className="w-4 h-4" />
                      <span>Descargar Imagen (1:1 HD)</span>
                    </button>
                    <button
                      onClick={downloadTextKit}
                      className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
                      title="Descarga un archivo .txt con todos los textos de WhatsApp, Instagram y Facebook"
                    >
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>Textos (.txt)</span>
                    </button>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-xs">
                    <p className="font-bold text-slate-200">¿Cómo enviar a grupos de WhatsApp?</p>
                    <ol className="text-[11px] text-slate-400 space-y-1 list-decimal list-inside">
                      <li>Haz clic en <strong>Descargar Imagen (1:1 HD)</strong> para guardarla en tu computador o teléfono.</li>
                      <li>Haz clic en <strong>Copiar para WhatsApp</strong> para copiar el mensaje persuasivo.</li>
                      <li>Abre el grupo o contacto en WhatsApp, pega el texto y adjunta la imagen descargada.</li>
                    </ol>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CANAL 2: INSTAGRAM (CARRUSEL 1:1 & REEL / STORY 9:16)                     */}
        {/* ========================================================================= */}
        {activeTab === 'instagram' && (
          <div className="max-w-6xl mx-auto w-full space-y-6">
            
            {/* SELECTOR DE FORMATO INSTAGRAM */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow">
                  <Instagram className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Presentación para Instagram (Feed & Reels/Stories)</h3>
                  <p className="text-xs text-slate-400">Selecciona entre carrusel de diapositivas deslizables o video reel vertical.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInstagramFormat('carousel')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    instagramFormat === 'carousel'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  📸 Carrusel de 6 Láminas (1:1)
                </button>
                <button
                  onClick={() => setInstagramFormat('reel')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    instagramFormat === 'reel'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  📱 Reel / Story Vertical (9:16)
                </button>
              </div>
            </div>

            {/* FORMATO A: CARRUSEL DE 6 LÁMINAS */}
            {instagramFormat === 'carousel' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* VISOR DE LA LÁMINA SELECCIONADA */}
                <div className="lg:col-span-7 flex flex-col items-center space-y-4">
                  <div className="w-full max-w-md aspect-square bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border-2 border-slate-800 shadow-2xl p-6 flex flex-col justify-between relative overflow-hidden">
                    
                    {/* BARRAS DECORATIVAS */}
                    <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500"></div>

                    {/* ENCABEZADO DE LÁMINA */}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                        LÁMINA {carouselSlides[currentSlideIdx].slideNum}
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                        {carouselSlides[currentSlideIdx].badge}
                      </span>
                    </div>

                    {/* TÍTULOS Y CONTENIDO DINÁMICO */}
                    <div className="space-y-3 text-center my-auto py-4">
                      <h2 className="text-xl md:text-2xl font-black text-white leading-tight">
                        {carouselSlides[currentSlideIdx].title}
                      </h2>
                      <p className="text-xs text-slate-300 font-light">
                        {carouselSlides[currentSlideIdx].subtitle}
                      </p>

                      <div className="pt-2">
                        {carouselSlides[currentSlideIdx].content}
                      </div>
                    </div>

                    {/* PIE DE LÁMINA */}
                    <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] text-slate-400 font-mono">
                      <span className="font-bold text-white flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        @gest_ok.cl
                      </span>
                      <span className="text-purple-400 font-bold">
                        {currentSlideIdx < carouselSlides.length - 1 ? 'Desliza para ver más 👉' : '¡Guarda este post! 📌'}
                      </span>
                    </div>

                  </div>

                  {/* CONTROLES DE NAVEGACIÓN DEL CARRUSEL */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCurrentSlideIdx(prev => Math.max(prev - 1, 0))}
                      disabled={currentSlideIdx === 0}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      {carouselSlides.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentSlideIdx(idx)}
                          className={`w-3 h-3 rounded-full transition-all cursor-pointer ${
                            currentSlideIdx === idx ? 'bg-pink-500 scale-125' : 'bg-slate-700 hover:bg-slate-500'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentSlideIdx(prev => Math.min(prev + 1, carouselSlides.length - 1))}
                      disabled={currentSlideIdx === carouselSlides.length - 1}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* BOTONES DE DESCARGA DIRECTA CARRUSEL */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      onClick={() => downloadFile(socialSquareImg, 'GEST_OK_Instagram_Portada_1x1.jpg')}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow cursor-pointer transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <span>Descargar Portada Feed (1:1 HD)</span>
                    </button>
                    <button
                      onClick={downloadTextKit}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-800 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-pink-400" />
                      <span>Descargar 6 Láminas & Copys (.txt)</span>
                    </button>
                  </div>
                </div>

                {/* COPYWRITING DEL POST Y HASHTAGS */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-5 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-pink-400" />
                        <span>Copywriting & Hashtags Oficiales</span>
                      </span>
                      <button
                        onClick={() => copyToClipboard(instagramPostCopy, 'ig_copy')}
                        className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow cursor-pointer"
                      >
                        {copiedKey === 'ig_copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'ig_copy' ? '¡Copiado!' : 'Copiar Texto + Tags'}</span>
                      </button>
                    </div>

                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-line max-h-[460px] overflow-y-auto leading-relaxed">
                      {instagramPostCopy}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* FORMATO B: REEL / STORY VERTICAL (9:16) */}
            {instagramFormat === 'reel' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                
                {/* SMARTPHONE PLAYER SIMULATOR (9:16) */}
                <div className="lg:col-span-6 flex justify-center">
                  <div className="w-[310px] md:w-[330px] aspect-[9/16] bg-slate-950 rounded-[44px] border-[6px] border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                    
                    {/* FONDO VERTICAL CON IMAGEN GENERADA */}
                    <img 
                      src={storyReelImg} 
                      alt="Gest_OK Reel Story Background" 
                      className="absolute inset-0 w-full h-full object-cover opacity-60"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/70" />

                    {/* BARRA SUPERIOR DE HISTORIA (STORIES BAR) */}
                    <div className="relative z-10 px-4 pt-3 flex gap-1">
                      {reelScenes.map((s, idx) => (
                        <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-white transition-all duration-100"
                            style={{
                              width: idx < activeReelIdx ? '100%' : idx === activeReelIdx ? `${reelProgress}%` : '0%'
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* CABECERA DE PERFIL */}
                    <div className="relative z-10 px-4 pt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center">
                          GO
                        </div>
                        <span className="text-xs font-bold text-white drop-shadow">gest_ok.cl</span>
                      </div>
                      <span className="text-[10px] bg-slate-900/80 px-2 py-0.5 rounded-full text-emerald-400 font-mono font-bold border border-slate-700">
                        {currentReel.badge}
                      </span>
                    </div>

                    {/* CENTRO: SUBTÍTULOS GIGANTES VIRALES (ESTILO MRBEAST / HORMOZI) */}
                    <div className="relative z-10 p-5 text-center space-y-3 my-auto">
                      <div className="inline-block px-3 py-1 bg-amber-400 text-slate-950 font-black text-xs rounded-lg uppercase tracking-wider shadow-lg transform -rotate-1">
                        ESCENA {activeReelIdx + 1} de {reelScenes.length}
                      </div>

                      <h2 className="text-2xl font-black text-white leading-tight drop-shadow-md">
                        {currentReel.hookText}
                      </h2>

                      <p className="text-xs text-slate-200 leading-relaxed font-medium bg-black/50 p-3 rounded-2xl backdrop-blur-xs border border-white/10">
                        {currentReel.subText}
                      </p>
                    </div>

                    {/* PIE CON CONTROLES */}
                    <div className="relative z-10 p-4 space-y-3 bg-gradient-to-t from-slate-950 to-transparent">
                      <div className="flex items-center justify-between text-xs">
                        <button
                          onClick={toggleVoice}
                          className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                            voiceEnabled 
                              ? 'bg-teal-500 text-slate-950 border-teal-400' 
                              : 'bg-black/60 text-slate-300 border-white/20'
                          }`}
                        >
                          {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                          <span>{voiceEnabled ? 'Voz On' : 'Voz Off'}</span>
                        </button>

                        <button
                          onClick={togglePlayReel}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                        >
                          {isPlayingReel ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                          <span>{isPlayingReel ? 'Pausar' : 'Reproducir'}</span>
                        </button>

                        <button
                          onClick={handleResetReel}
                          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-xl border border-white/20 cursor-pointer"
                          title="Reiniciar"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* BOTONES DE DESCARGA DIRECTA REEL 9:16 */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => downloadFile(storyReelImg, 'GEST_OK_Story_Reel_Vertical_9x16.jpg')}
                      className="px-4 py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-300 hover:to-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer transition-all"
                    >
                      <Download className="w-4 h-4 stroke-[2.5]" />
                      <span>Descargar Gráfica Reel (9:16 HD)</span>
                    </button>
                    <button
                      onClick={downloadTextKit}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>Descargar Guiones (.txt)</span>
                    </button>
                  </div>
                </div>

                {/* COLUMNA DERECHA: GUION DETALLADO PARA GRABAR TU REEL EN LOOM/CANVA/INSTAGRAM */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-emerald-400" />
                        <span>Guión de Locución para el Reel (40 Segundos)</span>
                      </h4>
                      <button
                        onClick={() => copyToClipboard(reelScenes.map(s => `[${s.badge}] ${s.hookText}\nLocución: "${s.narration}"\n`).join('\n'), 'all_reel_script')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                      >
                        {copiedKey === 'all_reel_script' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'all_reel_script' ? '¡Copiado!' : 'Copiar Todo'}</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                      {reelScenes.map((s, idx) => (
                        <div 
                          key={s.id}
                          onClick={() => {
                            setActiveReelIdx(idx);
                            setReelProgress(0);
                            if (voiceEnabled && isPlayingReel) speakNarration(s.narration);
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            activeReelIdx === idx
                              ? 'bg-indigo-950/60 border-indigo-500 shadow-md'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-bold text-indigo-400">Escena {idx + 1}: {s.badge}</span>
                            <span className="font-mono text-slate-500">{s.durationSeconds}s</span>
                          </div>
                          <p className="text-xs font-bold text-white">{s.hookText}</p>
                          <p className="text-[11px] text-slate-300 italic mt-1">"{s.narration}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* CANAL 3: FACEBOOK (GRUPOS DE CONTADORES & COMUNIDADES)                     */}
        {/* ========================================================================= */}
        {activeTab === 'facebook' && (
          <div className="max-w-4xl mx-auto w-full space-y-6">
            
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow">
                  <Facebook className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Publicación de Alto Impacto para Grupos de Facebook</h3>
                  <p className="text-xs text-slate-400">Diseñado con estructura persuasiva: Problema &rarr; Solución &rarr; Oferta de lanzamiento.</p>
                </div>
              </div>

              <button
                onClick={() => copyToClipboard(facebookGroupPost, 'fb_post')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow transition-colors cursor-pointer"
              >
                {copiedKey === 'fb_post' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedKey === 'fb_post' ? '¡Texto Copiado!' : 'Copiar Publicación de Facebook'}</span>
              </button>
            </div>

            {/* VISTA PREVIA ESTILO FACEBOOK POST */}
            <div className="bg-[#242526] rounded-3xl border border-slate-700/60 shadow-2xl overflow-hidden text-slate-200">
              
              {/* CABECERA POST FACEBOOK */}
              <div className="p-4 flex items-center justify-between border-b border-slate-700/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-sm">
                    GO
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Gest_OK Chile &bull; Contabilidad en la Nube</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    </p>
                    <p className="text-[10px] text-slate-400">Publicado para Grupos de Contadores &bull; Hace un momento &bull; 🌐</p>
                  </div>
                </div>
              </div>

              {/* CUERPO DEL TEXTO */}
              <div className="p-5 text-xs whitespace-pre-line leading-relaxed text-slate-100 font-sans">
                {facebookGroupPost}
              </div>

              {/* IMAGEN DEL POST */}
              <div className="border-t border-b border-slate-700/50 bg-black">
                <img 
                  src={socialSquareImg} 
                  alt="Post Promocional Facebook" 
                  className="w-full max-h-[460px] object-cover"
                />
              </div>

              {/* INTERACCIONES DE FACEBOOK SIMULADAS */}
              <div className="p-3 bg-[#18191a] flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/40">
                <div className="flex items-center gap-1.5">
                  <span className="p-1 bg-blue-500 rounded-full text-white text-[10px]">👍</span>
                  <span className="p-1 bg-rose-500 rounded-full text-white text-[10px]">❤️</span>
                  <span className="text-[11px] text-slate-300 ml-1">48 contadores y pymes interesadas</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  <span>19 comentarios &bull; 7 compartidos</span>
                </div>
              </div>

            </div>

            {/* PANEL DE DESCARGA DIRECTA FACEBOOK */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Descarga la imagen oficial en alta resolución lista para adjuntar a tu publicación de Facebook.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadFile(socialSquareImg, 'GEST_OK_Facebook_Post_HD.jpg')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Imagen HD</span>
                </button>
                <button
                  onClick={downloadTextKit}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>Descargar Texto (.txt)</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* CANAL 4: SIMULADOR VIDEO TOUR CINEMATOGRÁFICO MEJORADO                     */}
        {/* ========================================================================= */}
        {activeTab === 'videotour' && (
          <div className="max-w-5xl mx-auto w-full space-y-6">
            
            {/* REPRODUCTOR VISUAL COMPLETO */}
            <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 shadow-2xl space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[11px] font-bold font-mono">
                      Escena {activeReelIdx + 1} de {reelScenes.length} &bull; {currentReel.badge}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-1">{currentReel.hookText}</h3>
                  <p className="text-xs text-slate-400">{currentReel.subText}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadTextKit}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
                    title="Descargar guiones completos en formato .txt"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    <span>Descargar Guión</span>
                  </button>

                  <button
                    onClick={toggleVoice}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                      voiceEnabled ? 'bg-teal-500/20 text-teal-300 border-teal-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {voiceEnabled ? <Volume2 className="w-4 h-4 text-teal-400" /> : <VolumeX className="w-4 h-4" />}
                    <span>{voiceEnabled ? 'Locución Activa' : 'Activar Voz'}</span>
                  </button>

                  <button
                    onClick={togglePlayReel}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                  >
                    {isPlayingReel ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>{isPlayingReel ? 'Pausar Tour' : 'Iniciar Video'}</span>
                  </button>
                </div>
              </div>

              {/* PANTALLA VISUAL GRANDE DE PRESENTACIÓN */}
              <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center p-8">
                <img 
                  src={socialSquareImg} 
                  alt="Video Stage" 
                  className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-xs"
                />
                <div className="relative z-10 max-w-2xl text-center space-y-4">
                  <span className="px-3 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-full uppercase tracking-wider">
                    {currentReel.badge}
                  </span>
                  <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">
                    {currentReel.hookText}
                  </h1>
                  <p className="text-sm md:text-base text-slate-200 font-light bg-black/60 p-4 rounded-2xl border border-white/10">
                    "{currentReel.narration}"
                  </p>
                </div>
              </div>

              {/* BARRA DE TIEMPO */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Progreso de Escena ({currentReel.durationSeconds}s)</span>
                  <span>{Math.round(reelProgress)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 transition-all duration-100 ease-linear"
                    style={{ width: `${reelProgress}%` }}
                  />
                </div>
              </div>

              {/* MINIATURAS DE ESCENAS */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                {reelScenes.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveReelIdx(idx);
                      setReelProgress(0);
                      if (voiceEnabled && isPlayingReel) speakNarration(s.narration);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      activeReelIdx === idx
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <p className="text-[10px] font-mono font-bold">Escena {idx + 1}</p>
                    <p className="text-xs font-bold truncate mt-0.5">{s.badge}</p>
                  </button>
                ))}
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
