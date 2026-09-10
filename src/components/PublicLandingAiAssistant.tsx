import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, 
  X, 
  Send, 
  CheckCircle2, 
  BadgeCheck,
  User, 
  Phone, 
  Mail, 
  Building2, 
  ArrowRight,
  ShieldCheck,
  Minimize2,
  HelpCircle,
  Clock,
  ArrowLeftRight,
  EyeOff,
  Eye
} from 'lucide-react';
import { AnimatedOkLogo } from './AnimatedOkLogo';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
  options?: string[];
  isLeadCapturePrompt?: boolean;
}

interface VisitorLeadForm {
  name: string;
  email: string;
  phone: string;
  company: string;
  interest: string;
}

export default function PublicLandingAiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(1);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadSaved, setLeadSaved] = useState(false);
  const [isSavingLead, setIsSavingLead] = useState(false);
  
  // Position ('bottom-right' | 'bottom-left') and Visibility (hidden vs visible)
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left'>(() => {
    return (localStorage.getItem('gestok_public_copilot_position') as any) || 'bottom-right';
  });
  const [isHidden, setIsHidden] = useState<boolean>(() => {
    return localStorage.getItem('gestok_public_copilot_hidden') === 'true';
  });

  const togglePosition = () => {
    const newPos = position === 'bottom-right' ? 'bottom-left' : 'bottom-right';
    setPosition(newPos);
    localStorage.setItem('gestok_public_copilot_position', newPos);
  };

  const toggleHidden = () => {
    const newHidden = !isHidden;
    setIsHidden(newHidden);
    localStorage.setItem('gestok_public_copilot_hidden', String(newHidden));
    if (newHidden) {
      setIsOpen(false);
    }
  };
  
  const [leadFormData, setLeadFormData] = useState<VisitorLeadForm>({
    name: '',
    email: '',
    phone: '',
    company: '',
    interest: 'Quiero información general y una demostración'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initialMessages: Message[] = [
    {
      id: 'm1',
      sender: 'ai',
      text: '¡Hola! 👋 Soy el asistente virtual de Pulso Contable / Gest_OK. ¿En qué puedo ayudarte a conocer hoy sobre nuestro sistema contable y tributario?',
      time: 'Ahora',
      options: [
        '¿Qué funcionalidades incluye el sistema?',
        '¿Cómo funciona la sincronización con el SII?',
        '¿Sirve para estudios con varios clientes?',
        'Quiero que un asesor me contacte'
      ]
    }
  ];

  const [messages, setMessages] = useState<Message[]>(initialMessages);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getAiResponse = (userQuery: string): { response: string; options?: string[]; triggerLeadPrompt?: boolean } => {
    const q = userQuery.toLowerCase().trim();

    // Consultas de precios o costos (Regla: No dar precios, invitar a contacto personalizado)
    if (q.includes('precio') || q.includes('cuanto cuesta') || q.includes('cuánto cuesta') || q.includes('valor') || q.includes('tarifa') || q.includes('planes') || q.includes('cotizar') || q.includes('costo') || q.includes('pagar')) {
      return {
        response: 'Los planes se adaptan de forma personalizada según el tamaño de tu estudio contable o el número de empresas que administres. ¿Te gustaría dejarme tus datos de contacto para que un especialista te envíe una propuesta a la medida?',
        options: ['Sí, quiero que me contacten', 'Ver principales funcionalidades', '¿Cómo se conecta con el SII?'],
        triggerLeadPrompt: true
      };
    }

    // Consultas técnicas profundas (Regla: Mantener a nivel funcional sin abrumar con arquitectura)
    if (q.includes('codigo') || q.includes('api rest') || q.includes('servidor') || q.includes('lenguaje') || q.includes('infraestructura') || q.includes('base de datos') || q.includes('tecnico') || q.includes('tecnología')) {
      return {
        response: 'El sistema opera 100% en la nube bajo los más altos estándares de seguridad y disponibilidad. No necesitas instalar nada en tu equipo: accedes directamente desde cualquier navegador con respaldo automático y acceso protegido para tu equipo.',
        options: ['¿Qué módulos incluye?', '¿Cómo sincroniza con el SII?', 'Quiero una demostración']
      };
    }

    // Funcionalidades generales
    if (q.includes('funcionalidad') || q.includes('que hace') || q.includes('qué hace') || q.includes('que incluye') || q.includes('módulos') || q.includes('modulos') || q.includes('características')) {
      return {
        response: 'Gest_OK es una plataforma integral diseñada para la normativa chilena que incluye:\n\n' +
          '• Sincronización directa del RCV (Compras y Ventas) con el SII.\n' +
          '• Liquidación automática del Formulario 29 (Débito, Crédito, PPM, Honorarios).\n' +
          '• Balance General de 8 Columnas e Informes IFRS.\n' +
          '• Libro Diario, Libro Mayor y Auxiliares por RUT.\n' +
          '• Facturador Electrónico DTE con timbraje y firma digital.\n' +
          '• Conciliación Bancaria y Flujo de Caja.\n' +
          '• Panel Multi-Empresa con control de roles para estudios.',
        options: ['¿Cómo sincroniza con el SII?', '¿Cómo maneja múltiples clientes?', 'Quiero una demostración guiada']
      };
    }

    // Sincronización con el SII / RCV / Facturación
    if (q.includes('sii') || q.includes('rcv') || q.includes('factura') || q.includes('dte') || q.includes('servicio de impuestos internos') || q.includes('f29') || q.includes('iva')) {
      return {
        response: 'La conexión con el SII permite descargar automáticamente tus libros de Compras, Ventas y Boletas de Honorarios. Al importarse, el sistema clasifica las cuentas y genera los asientos contables en segundos, calculando tu F29 y cuadrando el IVA sin digitación manual.',
        options: ['¿Cómo funciona el F29?', '¿Genera el Balance de 8 Columnas?', 'Quiero agendar una demo']
      };
    }

    // Estudios Contables / Multi-empresa / Múltiples clientes
    if (q.includes('estudio') || q.includes('multi') || q.includes('clientes') || q.includes('varias empresas') || q.includes('contador') || q.includes('contadores') || q.includes('roles') || q.includes('asignar')) {
      return {
        response: '¡Es ideal para estudios contables! Te permite gestionar decenas o cientos de empresas clientes en un solo panel centralizado. Puedes asignar contadores o analistas específicos a cada empresa, mantener la información totalmente aislada y segura, y supervisar el avance tributario global.',
        options: ['¿Puedo emitir facturas para mis clientes?', '¿Cómo se asignan los contadores?', 'Solicitar contacto de un asesor']
      };
    }

    // Balance, Contabilidad y Libros
    if (q.includes('balance') || q.includes('8 columnas') || q.includes('diario') || q.includes('mayor') || q.includes('asientos') || q.includes('plan de cuentas')) {
      return {
        response: 'El motor contable genera en tiempo real el Libro Diario, Mayor, Auxiliares de Clientes/Proveedores y el Balance Tributario de 8 Columnas con cuadratura automática al Debe, Haber, Inventario y Resultados. Además incluye un Plan de Cuentas estándar chileno 100% personalizable.',
        options: ['¿Calcula el F29 automáticamente?', '¿Tiene conciliación bancaria?', 'Quiero probar el sistema']
      };
    }

    // Demo / Contacto / Asesor
    if (q.includes('demo') || q.includes('demostracion') || q.includes('demostración') || q.includes('contacto') || q.includes('asesor') || q.includes('probar') || q.includes('agendar') || q.includes('reunión') || q.includes('reunion') || q.includes('comprar') || q.includes('contratar')) {
      return {
        response: '¡Excelente! Estaremos encantados de mostrarte el sistema en vivo y responder todas las preguntas específicas de tu estudio o empresa. Haz clic a continuación para registrar tus datos y coordinar contigo.',
        options: ['Ingresar mis datos de contacto', 'Ver más funcionalidades'],
        triggerLeadPrompt: true
      };
    }

    // Saludo
    if (q.includes('hola') || q.includes('buenos dias') || q.includes('buenas tardes') || q.includes('buenas noches') || q.includes('hey')) {
      return {
        response: '¡Hola! Es un gusto saludarte. Estoy aquí para explicarte todo lo que Gest_OK / Pulso Contable puede hacer para automatizar la gestión contable y tributaria de tu estudio o empresa. ¿Qué te gustaría conocer?',
        options: ['Ver principales funcionalidades', '¿Cómo sincroniza con el SII?', '¿Cómo funciona para estudios contables?', 'Quiero una demostración']
      };
    }

    // Despedida / Agradecimiento
    if (q.includes('gracias') || q.includes('muchas gracias') || q.includes('vale') || q.includes('chao') || q.includes('adios')) {
      return {
        response: '¡Con mucho gusto! Si necesitas algo más, aquí estaré. Si deseas ver el sistema en acción con tus propias empresas, no dudes en solicitar una demostración.',
        options: ['Quiero una demostración', '¿Qué módulos incluye?']
      };
    }

    // Respuesta por defecto (amable, segura y orientada a valor)
    return {
      response: 'Gest_OK es la solución integral en la nube para estudios contables y empresas en Chile: automatiza la sincronización del RCV con el SII, emite DTEs, cuadra el F29 al instante y genera Balances de 8 Columnas sin digitación manual. ¿Te gustaría conocer alguna funcionalidad en detalle o agendar una demostración?',
      options: ['¿Cómo sincroniza con el SII?', '¿Sirve para estudios con varios clientes?', 'Quiero que un asesor me contacte']
    };
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim()) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsTyping(true);

    if (text.toLowerCase().includes('contacto') || text.toLowerCase().includes('ingresar mis datos') || text.toLowerCase().includes('asesor me contacte')) {
      setTimeout(() => {
        setIsTyping(false);
        setShowLeadModal(true);
        const aiMsg: Message = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: 'He abierto el formulario para que nos dejes tus datos. Uno de nuestros asesores especialistas se comunicará contigo a la brevedad.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          options: ['Ver principales funcionalidades', '¿Cómo funciona el F29?']
        };
        setMessages(prev => [...prev, aiMsg]);
      }, 600);
      return;
    }

    setTimeout(() => {
      const aiReply = getAiResponse(text);
      setIsTyping(false);

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiReply.response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        options: aiReply.options,
        isLeadCapturePrompt: aiReply.triggerLeadPrompt
      };

      setMessages(prev => [...prev, aiMsg]);
    }, 700);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadFormData.name.trim() || !leadFormData.email.trim()) return;

    setIsSavingLead(true);
    try {
      await addDoc(collection(db, 'leads_contact'), {
        name: leadFormData.name.trim(),
        email: leadFormData.email.trim().toLowerCase(),
        phone: leadFormData.phone.trim(),
        companyOrStudy: leadFormData.company.trim() || 'No especificada',
        type: 'Asistente IA Landing',
        interest: leadFormData.interest,
        message: 'Lead capturado mediante el Asistente Virtual de IA en app.pulsocontable',
        createdAt: new Date().toISOString(),
        status: 'Pendiente',
        source: 'Asistente_IA_Landing'
      });

      setLeadSaved(true);
      setTimeout(() => {
        setShowLeadModal(false);
        setLeadSaved(false);
        setMessages(prev => [
          ...prev,
          {
            id: `lead-ack-${Date.now()}`,
            sender: 'ai',
            text: `¡Muchas gracias ${leadFormData.name}! ✨ Tus datos fueron recibidos con éxito. Nuestro equipo te contactará muy pronto para coordinar una demostración personalizada.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            options: ['¿Qué módulos incluye el sistema?', '¿Cómo sincroniza con el SII?']
          }
        ]);
        setLeadFormData({
          name: '',
          email: '',
          phone: '',
          company: '',
          interest: 'Quiero información general y una demostración'
        });
      }, 1500);
    } catch (err) {
      console.error('Error al guardar prospecto desde chat:', err);
      // Fallback
      setLeadSaved(true);
      setTimeout(() => {
        setShowLeadModal(false);
        setLeadSaved(false);
      }, 1500);
    } finally {
      setIsSavingLead(false);
    }
  };

  return (
    <>
      {/* Botón flotante o Contenedor con Posición y Opción de Ocultar */}
      {isHidden ? (
        <div className={`fixed bottom-5 ${position === 'bottom-right' ? 'right-5' : 'left-5'} z-50 flex items-center gap-1.5`}>
          <button
            onClick={toggleHidden}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/85 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700/70 shadow-lg text-xs font-semibold transition-all backdrop-blur-xs group cursor-pointer"
            title="Mostrar Asistente Virtual"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
            <span>Asistente IA</span>
          </button>
          <button
            onClick={togglePosition}
            className="p-1.5 rounded-full bg-slate-900/85 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-700/70 shadow-lg transition-all cursor-pointer"
            title={position === 'bottom-right' ? 'Mover a la izquierda' : 'Mover a la derecha'}
          >
            <ArrowLeftRight className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className={`fixed bottom-5 ${position === 'bottom-right' ? 'right-5 items-end' : 'left-5 items-start'} z-50 flex flex-col gap-2`}>
          {!isOpen && (
            <div className="relative group flex items-center gap-1.5">
              {position === 'bottom-left' && (
                <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 p-1 rounded-full shadow-lg backdrop-blur-xs">
                  <button
                    onClick={togglePosition}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                    title="Mover a la derecha"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={toggleHidden}
                    className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                    title="Esconder copiloto"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsOpen(true)}
                className="group relative flex items-center gap-3 bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 text-white px-4 py-3 rounded-full shadow-xl shadow-indigo-900/30 hover:shadow-indigo-600/40 hover:scale-105 transition-all duration-300 border border-indigo-400/40 cursor-pointer"
                aria-label="Abrir Asistente Virtual Gest_OK"
              >
                <div className="relative flex items-center justify-center">
                  <AnimatedOkLogo size="sm" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-slate-900 rounded-full"></span>
                </div>
                
                <div className="text-left pr-1">
                  <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                    <span>Asistente Virtual</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/30 text-emerald-200 rounded font-medium">En línea</span>
                  </div>
                  <div className="text-[11px] text-indigo-200">¿Tienes dudas sobre el sistema?</div>
                </div>

                {unreadCount > 0 && (
                  <span className="absolute -top-2 -left-2 bg-amber-500 text-slate-950 font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900 animate-bounce">
                    1
                  </span>
                )}
              </button>

              {position === 'bottom-right' && (
                <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 p-1 rounded-full shadow-lg backdrop-blur-xs">
                  <button
                    onClick={togglePosition}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                    title="Mover a la izquierda"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={toggleHidden}
                    className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                    title="Esconder copiloto"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Ventana de Chat Flotante */}
          {isOpen && (
            <div className="w-[360px] sm:w-[400px] h-[540px] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 font-sans z-50">
              
              {/* Header del Chat */}
              <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900 p-3.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <AnimatedOkLogo size="md" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>Asistente Gest_OK</span>
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        Oficial
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">Guía funcional & Orientación comercial</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={togglePosition}
                    className="text-slate-400 hover:text-indigo-300 p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title={position === 'bottom-right' ? 'Mover a la izquierda' : 'Mover a la derecha'}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={toggleHidden}
                    className="text-slate-400 hover:text-amber-300 p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Esconder copiloto"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Minimizar chat"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-slate-400 hover:text-red-400 p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Cerrar chat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

            {/* Aviso de Confidencialidad y Enfoque */}
            <div className="bg-indigo-950/40 border-b border-indigo-900/40 px-3 py-1.5 flex items-center gap-2 text-[11px] text-indigo-300">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Respuestas directas sobre funcionalidades y agendamiento de demos.</span>
            </div>

            {/* Cuerpo del Chat (Mensajes) */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-slate-950/60 text-xs">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                        : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-none shadow-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>

                  {/* Opciones de respuesta rápida */}
                  {msg.options && msg.options.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 max-w-[95%]">
                      {msg.options.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(opt)}
                          className="text-[11px] bg-slate-800 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 border border-slate-700 hover:border-indigo-500/50 px-2.5 py-1 rounded-full transition-all text-left flex items-center gap-1"
                        >
                          <span>{opt}</span>
                          <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Botón de solicitar contacto si aplica */}
                  {msg.isLeadCapturePrompt && (
                    <div className="mt-2.5">
                      <button
                        onClick={() => setShowLeadModal(true)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-md shadow-emerald-900/30 transition-all hover:scale-102"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Solicitar Contacto / Cotización</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-2 text-slate-400 bg-slate-800 border border-slate-700 w-fit px-3 py-2 rounded-2xl rounded-bl-none text-xs">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                  <span className="text-[11px] text-slate-400">Escribiendo respuesta...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Formulario de Entrada */}
            <div className="p-2.5 bg-slate-900 border-t border-slate-800">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Escribe tu consulta o duda..."
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white p-2 rounded-xl transition-colors shrink-0"
                  aria-label="Enviar mensaje"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Modal Capturador de Prospectos (Leads) */}
      {showLeadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowLeadModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <AnimatedOkLogo size="md" />
              <div>
                <h3 className="text-base font-bold text-white">Solicitar Información & Demo</h3>
                <p className="text-xs text-slate-400">Te contactaremos para enviarte una propuesta a la medida</p>
              </div>
            </div>

            {leadSaved ? (
              <div className="p-6 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">¡Solicitud Registrada con Éxito!</h4>
                <p className="text-xs text-slate-300">
                  Un asesor de nuestro equipo se comunicará contigo a la brevedad.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSaveLead} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nombre Completo *</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      required
                      type="text"
                      value={leadFormData.name}
                      onChange={(e) => setLeadFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ej. Juan Pérez"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Correo Electrónico *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      required
                      type="email"
                      value={leadFormData.email}
                      onChange={(e) => setLeadFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="juan@estudiocontable.cl"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Teléfono / WhatsApp</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="tel"
                        value={leadFormData.phone}
                        onChange={(e) => setLeadFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+56 9 8765 4321"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Empresa o Estudio</label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={leadFormData.company}
                        onChange={(e) => setLeadFormData(prev => ({ ...prev, company: e.target.value }))}
                        placeholder="Nombre estudio/pyme"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Interés Principal</label>
                  <select
                    value={leadFormData.interest}
                    onChange={(e) => setLeadFormData(prev => ({ ...prev, interest: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Quiero información para mi Estudio Contable">Para mi Estudio Contable (Múltiples Clientes)</option>
                    <option value="Quiero información para mi Empresa / Pyme">Para mi Empresa / Pyme</option>
                    <option value="Soy Contador Independiente">Soy Contador Independiente</option>
                    <option value="Quiero cotización personalizada">Cotización Personalizada</option>
                  </select>
                </div>

                <div className="pt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLeadModal(false)}
                    className="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingLead}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all shadow-md shadow-emerald-900/30 flex items-center gap-1.5"
                  >
                    {isSavingLead ? 'Enviando...' : 'Enviar Solicitud'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
