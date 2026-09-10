import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, collectionGroup, doc, onSnapshot } from 'firebase/firestore';
import { 
  Lock, Mail, Eye, EyeOff, LogIn, ShieldCheck, Building2, KeyRound, 
  ArrowLeft, CheckCircle2, MessageCircle, Link as LinkIcon,
  Activity, ArrowRight, TrendingUp, Check, Star, Sparkles
} from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { APP_VERSION } from '../constants/version';
import { MarketingPromoConfig } from '../types';

interface LoginProps {
  onBackToLanding?: () => void;
  initialEmail?: string;
}

export default function Login({ onBackToLanding, initialEmail = '' }: LoginProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sincronizar si cambia initialEmail externamente
  useEffect(() => {
    if (initialEmail && !email) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  // Configuración de promoción dinámica desde Firestore (Super Admin) - Oculto por defecto
  const [promoConfig, setPromoConfig] = useState<MarketingPromoConfig | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'system_config', 'marketing_promo'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as MarketingPromoConfig;
          setPromoConfig(data);
        } else {
          setPromoConfig(null);
        }
      },
      (err) => {
        console.warn('Error reading marketing promo config:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // Estado para modo "Recuperar Contraseña"
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccess('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    setResetLoading(true);

    try {
      // 1. Intentar enviar correo de restablecimiento vía Firebase Auth
      let resetSent = false;
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        resetSent = true;
      } catch (authErr: any) {
        console.warn("Firebase Auth reset warning:", authErr);
      }

      // 2. Verificar existencia de usuario en colecciones Firestore
      let userFound = resetSent;
      if (!userFound) {
        try {
          const qSuper = query(collection(db, 'superUsers'), where('email', '==', cleanEmail));
          const snapSuper = await getDocs(qSuper);
          if (!snapSuper.empty || cleanEmail === 'rcampos@pulsocontable.cl') {
            userFound = true;
          }
        } catch (e) {}

        if (!userFound) {
          try {
            const studiesSnap = await getDocs(collection(db, 'studies'));
            for (const sDoc of studiesSnap.docs) {
              const sData = sDoc.data();
              if ((sData.adminEmail || '').toLowerCase() === cleanEmail || (sData.email || '').toLowerCase() === cleanEmail) {
                userFound = true;
                break;
              }
              if (sData.administrators && Array.isArray(sData.administrators)) {
                if (sData.administrators.some((a: any) => a.email?.toLowerCase() === cleanEmail)) {
                  userFound = true;
                  break;
                }
              }
            }
          } catch (e) {}
        }

        if (!userFound) {
          try {
            const qUsers = query(collectionGroup(db, 'users'), where('email', '==', cleanEmail));
            const snapUsers = await getDocs(qUsers);
            if (!snapUsers.empty) userFound = true;
          } catch (e) {}
        }
      }

      if (!userFound) {
        throw new Error('El correo electrónico ingresado no se encuentra registrado en la plataforma.');
      }

      // Registrar auditoría
      logAuditEvent({
        userId: 'system-reset-request',
        userEmail: cleanEmail,
        action: 'MODIFICAR',
        module: 'AUTENTICACION',
        details: `Solicitud de restablecimiento de clave para ${cleanEmail}`
      });

      setResetSuccess(`Se ha enviado un enlace con las instrucciones para restablecer tu contraseña a ${cleanEmail}. Por favor revisa tu bandeja de entrada o carpeta de spam.`);
    } catch (err: any) {
      console.error("Forgot password error:", err);
      setError(err.message || 'Error al procesar la solicitud de recuperación.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      // 1. Intentar iniciar sesión directo en Firebase Auth
      try {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (authErr: any) {
        const errCode = authErr?.code || authErr?.message || '';

        // Si el usuario no existe en Auth o credencial inválida, verificar en base de datos Firestore para sincronización
        if (errCode.includes('auth/user-not-found') || errCode.includes('auth/invalid-credential')) {
          let userAuthorized = false;

          // A. Caso SuperAdmin (Consultar colección superUsers en Firestore o bootstrap)
          try {
            const qSuper = query(collection(db, 'superUsers'), where('email', '==', cleanEmail));
            const snapSuper = await getDocs(qSuper);
            if (!snapSuper.empty) {
              const sUser = snapSuper.docs[0].data();
              if (sUser.estado === 'Inactivo' || sUser.estado === 'Sin Vigencia') {
                throw new Error('Tu cuenta de Super Administrador se encuentra inactiva o bloqueada.');
              }
              const expectedPass = sUser.password;
              if (!expectedPass || expectedPass === password) {
                userAuthorized = true;
              }
            } else if (cleanEmail === 'rcampos@pulsocontable.cl') {
              userAuthorized = true;
            }
          } catch (errSuper: any) {
            if (errSuper.message?.includes('inactiva') || errSuper.message?.includes('bloqueada')) throw errSuper;
            console.warn("Error verificando superadmin:", errSuper);
          }

          // B. Caso Administrador de Estudio (colección /studies)
          if (!userAuthorized) {
            try {
              const studiesSnap = await getDocs(collection(db, 'studies'));
              for (const sDoc of studiesSnap.docs) {
                const sData = sDoc.data();
                const studyStatus = sData.estado || 'Vigente';

                // Revisar lista de administradores
                if (sData.administrators && Array.isArray(sData.administrators)) {
                  const matchAdmin = sData.administrators.find(
                    (a: any) => a.email?.toLowerCase() === cleanEmail
                  );
                  if (matchAdmin) {
                    if (studyStatus === 'Sin Vigencia') {
                      throw new Error('El estudio contable asignado se encuentra sin vigencia.');
                    }
                    if (matchAdmin.estado === 'Sin Vigencia') {
                      throw new Error('Tu usuario administrador se encuentra sin vigencia.');
                    }
                    const expectedPass = matchAdmin.password;
                    if (!expectedPass || expectedPass === password) {
                      userAuthorized = true;
                      break;
                    }
                  }
                }

                // Revisar campos raíz de admin (legacy / primario)
                const legacyAdminEmail = (sData.adminEmail || sData.email || '').toLowerCase();
                if (legacyAdminEmail === cleanEmail) {
                  if (studyStatus === 'Sin Vigencia') {
                    throw new Error('El estudio contable asignado se encuentra sin vigencia.');
                  }
                  if (sData.adminEstado === 'Sin Vigencia') {
                    throw new Error('Tu usuario administrador se encuentra sin vigencia.');
                  }
                  const expectedPass = sData.adminPassword || sData.password;
                  if (!expectedPass || expectedPass === password) {
                    userAuthorized = true;
                    break;
                  }
                }
              }
            } catch (errDb: any) {
              if (errDb.message?.includes('sin vigencia')) throw errDb;
              console.warn("Error verificando estudio:", errDb);
            }
          }

          // C. Caso Contador / Usuario de Estudio (colecciones /studies/{id}/users)
          if (!userAuthorized) {
            try {
              const qUser = query(collectionGroup(db, 'users'), where('email', '==', cleanEmail));
              const snapUsers = await getDocs(qUser);
              if (!snapUsers.empty) {
                const uDoc = snapUsers.docs[0];
                const uData = uDoc.data();
                if (uData.estado === 'Inactivo' || uData.estado === 'Sin Vigencia') {
                  throw new Error('Tu usuario contador se encuentra inactivo o sin vigencia.');
                }
                const expectedPass = uData.password;
                if (!expectedPass || expectedPass === password) {
                  userAuthorized = true;
                }
              }
            } catch (errCg: any) {
              if (errCg.message?.includes('sin vigencia') || errCg.message?.includes('inactivo')) throw errCg;
              console.warn("Error verificando contador:", errCg);
            }
          }

          if (userAuthorized) {
            // Sincronizar y crear usuario en Firebase Authentication
            try {
              await createUserWithEmailAndPassword(auth, cleanEmail, password);
            } catch (createErr: any) {
              if (createErr?.code?.includes('auth/email-already-in-use')) {
                throw new Error('La contraseña ingresada es incorrecta.');
              } else {
                throw createErr;
              }
            }
          } else {
            throw new Error('Credenciales incorrectas o usuario no registrado en el sistema.');
          }
        } else if (errCode.includes('auth/wrong-password')) {
          throw new Error('La contraseña ingresada es incorrecta.');
        } else if (errCode.includes('auth/invalid-email')) {
          throw new Error('El correo electrónico no tiene un formato válido.');
        } else if (errCode.includes('auth/too-many-requests')) {
          throw new Error('Demasiados intentos fallidos. Por favor espera unos minutos.');
        } else {
          throw authErr;
        }
      }

      // 2. Registrar identificador de sesión activa
      const sessionId = crypto.randomUUID();
      sessionStorage.setItem('activeSessionId', sessionId);

      // 3. Registrar auditoría de inicio de sesión
      logAuditEvent({
        userId: auth.currentUser?.uid || 'auth-login',
        userEmail: cleanEmail,
        action: 'LOGIN',
        module: 'AUTENTICACION',
        details: `Inicio de sesión exitoso de ${cleanEmail}`,
        metadata: { sessionId }
      });

      if (cleanEmail !== 'rcampos@pulsocontable.cl') {
        try {
          const qStudy1 = query(collection(db, 'studies'), where('adminEmail', '==', cleanEmail));
          const qStudy2 = query(collection(db, 'studies'), where('email', '==', cleanEmail));
          const [snap1, snap2] = await Promise.all([getDocs(qStudy1), getDocs(qStudy2)]);
          
          if (!snap1.empty) {
            await updateDoc(snap1.docs[0].ref, { activeSessionId: sessionId });
          } else if (!snap2.empty) {
            await updateDoc(snap2.docs[0].ref, { activeSessionId: sessionId });
          }
        } catch (sErr) {
          console.warn("Non-fatal session update error:", sErr);
        }
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F9FC] flex flex-col justify-center selection:bg-[#533AFD] selection:text-white">
      <div className="w-full max-w-7xl mx-auto my-auto lg:my-8 bg-white lg:rounded-3xl lg:border lg:border-slate-200/80 stripe-card-shadow overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[90vh]">
        
        {/* ========================================================= */}
        {/* COLUMNA IZQUIERDA: FORMULARIO DE ACCESO ULTRALIMPIO       */}
        {/* ========================================================= */}
        <div className="lg:col-span-6 xl:col-span-5 p-6 sm:p-10 xl:p-14 flex flex-col justify-between bg-white">
          
          <div>
            {/* Top Bar: Botón Volver a Landing */}
            <div className="flex items-center justify-between mb-8">
              {onBackToLanding ? (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#64748D] hover:text-[#0D253D] transition cursor-pointer group"
                >
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  <span>Volver a la portada</span>
                </button>
              ) : (
                <div />
              )}

              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                {APP_VERSION.startsWith('v') ? APP_VERSION : `v${APP_VERSION}`}
              </span>
            </div>

            {/* Logo de Marca Minimalista con Onda Contable */}
            <div className="flex items-center gap-3 mb-6">
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
                <p className="text-[11px] text-[#64748D]">Sistema Contable, Financiero & Tributario</p>
              </div>
            </div>

            {/* Encabezado del Formulario */}
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0D253D]">
                {isResetMode ? 'Recupera tu acceso' : 'Bienvenido de nuevo'}
              </h1>
              <p className="text-xs sm:text-sm text-[#64748D] mt-1.5 leading-relaxed">
                {isResetMode
                  ? 'Ingresa tu correo o RUT corporativo registrado para enviar el enlace de recuperación.'
                  : 'Ingresa tus credenciales para acceder a la gestión contable de tu estudio o empresa.'}
              </p>
            </div>

            {/* Feedback Messages */}
            {error && (
              <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200/80 rounded-xl text-rose-800 text-xs font-medium flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {resetSuccess && (
              <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-800 text-xs font-medium flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5 stroke-[2]" />
                <span className="leading-relaxed">{resetSuccess}</span>
              </div>
            )}

            {isResetMode ? (
              /* MODO RECUPERAR CONTRASEÑA */
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                    Correo Electrónico o RUT
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748D] absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      placeholder="usuario@estudio.cl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:border-[#533AFD] focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-400 font-medium"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-3.5 px-4 bg-[#533AFD] hover:bg-[#4326EB] active:bg-[#3519d6] text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {resetLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Enviar Enlace de Recuperación</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setError('');
                      setResetSuccess('');
                    }}
                    className="text-xs font-semibold text-[#533AFD] hover:underline inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver a Iniciar Sesión</span>
                  </button>
                </div>
              </form>
            ) : (
              /* MODO INICIAR SESIÓN NORMAL */
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                    Correo Electrónico o RUT
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748D] absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      placeholder="usuario@estudio.cl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:border-[#533AFD] focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-400 font-medium"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[#0D253D]">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetMode(true);
                        setError('');
                        setResetSuccess('');
                      }}
                      className="text-xs font-semibold text-[#533AFD] hover:underline transition cursor-pointer"
                    >
                      ¿Olvidaste tu clave?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#64748D] absolute left-3.5 top-3.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:border-[#533AFD] focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-400 font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-[#64748D] hover:text-[#0D253D] transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Recordarme */}
                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#533AFD] focus:ring-indigo-500/20 focus:ring-offset-0"
                    />
                    <span className="text-xs text-[#64748D] font-medium">Recordar este dispositivo</span>
                  </label>
                </div>

                {/* Botón CTA Primario Voltaje Índigo estilo Stripe */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#533AFD] hover:bg-[#4326EB] active:bg-[#3519d6] text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Iniciar Sesión en Gest_OK</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Footer del Formulario */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#64748D]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#059669]" />
              <span>Conexión Encriptada SSL 256-bit</span>
            </div>
            <span>PulsoContable SpA &bull; Chile</span>
          </div>

        </div>

        {/* ========================================================= */}
        {/* COLUMNA DERECHA: PANEL VISUAL STRIPE CON MÉTRICAS EN VIVO  */}
        {/* ========================================================= */}
        <div className="lg:col-span-6 xl:col-span-7 stripe-mesh-side p-8 sm:p-12 xl:p-16 flex flex-col justify-between text-white relative overflow-hidden">
          
          {/* Top Tagline */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Conexión SII en Tiempo Real Activa</span>
            </div>

            <div className="text-[11px] text-slate-300/80 font-mono hidden sm:block">
              Período Tributario 2026
            </div>
          </div>

          {/* Tarjeta Flotante con Cifras Financieras Tabulares */}
          <div className="my-8 relative z-10 space-y-4">
            
            {/* Tarjeta Central de Cuadratura */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl p-5 text-[#0D253D] shadow-2xl border border-white/40 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    Formulario 29 Automatizado
                  </span>
                  <h3 className="text-sm font-extrabold text-[#0D253D] mt-1">
                    Liquidación Tributaria Mensual
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-[#059669] text-xs font-bold inline-flex items-center gap-1">
                  <Check className="w-3 h-3 stroke-[3]" />
                  <span>100% Cuadrado</span>
                </span>
              </div>

              {/* Métricas con Cifras Tabulares */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Débito Fiscal</div>
                  <div className="text-sm font-bold font-mono text-[#0D253D] mt-0.5 tabular-nums">
                    $ 4.712.000
                  </div>
                  <div className="text-[10px] text-slate-400">120 Facturas RCV</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Crédito Fiscal</div>
                  <div className="text-sm font-bold font-mono text-[#059669] mt-0.5 tabular-nums">
                    $ 2.850.000
                  </div>
                  <div className="text-[10px] text-slate-400">45 Compras Aceptadas</div>
                </div>

                <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 col-span-2 sm:col-span-1">
                  <div className="text-[10px] uppercase font-bold text-indigo-700">Neto a Pagar</div>
                  <div className="text-sm font-bold font-mono text-indigo-900 mt-0.5 tabular-nums">
                    $ 2.247.450
                  </div>
                  <div className="text-[10px] text-indigo-600">Con PPM e ILA</div>
                </div>
              </div>

              {/* Progress Line */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Cuadratura con Cartola Bancaria</span>
                <span className="font-bold text-emerald-600 font-mono">Diferencia: $0</span>
              </div>
            </div>

            {/* Certificación de Seguridad & Normativa SII */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-300 stroke-[2.5]" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">Plataforma Certificada & Segura</div>
                <div className="text-[11px] text-slate-200/90 mt-0.5 leading-snug">
                  Acceso exclusivo cifrado. Normativa SII 2026 y respaldo continuo de libros oficiales.
                </div>
              </div>
            </div>

          </div>

          {/* Bottom Bento Mini-Grid */}
          <div className="relative z-10 pt-4 border-t border-white/10 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-white tabular-nums">
                &lt; 2s
              </div>
              <div className="text-[10px] text-slate-300 font-medium mt-0.5">
                Sincronización SII
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-emerald-400 tabular-nums">
                100%
              </div>
              <div className="text-[10px] text-slate-300 font-medium mt-0.5">
                Cuadratura IFRS
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-sky-300 tabular-nums">
                Multi
              </div>
              <div className="text-[10px] text-slate-300 font-medium mt-0.5">
                Empresas Ilimitadas
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Botón Flotante de Promoción (si está habilitado) */}
      {promoConfig?.enabled && (
        <a
          id="btn-whatsapp-free-trial"
          href={
            promoConfig.actionType === 'whatsapp'
              ? `https://wa.me/${(promoConfig.whatsappNumber || '56946318783').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(promoConfig.whatsappCustomMessage || 'Hola!! Quiero usar GEST_OK')}`
              : (promoConfig.targetUrl || '#')
          }
          target="_blank"
          rel="noopener noreferrer"
          style={{ backgroundColor: promoConfig.buttonColor || '#25D366' }}
          className="fixed bottom-6 right-4 sm:right-7 z-50 flex items-center gap-3 text-white px-4 py-3 rounded-full shadow-2xl hover:brightness-105 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 border border-white/20 group focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900"
          title={promoConfig.headline || 'Promoción'}
        >
          <div className="w-9 h-9 bg-white/25 group-hover:bg-white/35 rounded-full flex items-center justify-center shrink-0 transition-colors shadow-inner">
            {promoConfig.actionType === 'whatsapp' ? (
              <MessageCircle className="w-5 h-5 text-white fill-white/40 stroke-[2.2]" />
            ) : (
              <LinkIcon className="w-5 h-5 text-white stroke-[2.2]" />
            )}
          </div>
          <div className="flex flex-col text-left pr-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-black/30 leading-none">
              {promoConfig.badgeText || 'WhatsApp Oficial'}
            </span>
            <span className="text-xs sm:text-sm font-extrabold text-white tracking-tight leading-tight mt-0.5 whitespace-nowrap">
              {promoConfig.headline || 'Pide tu prueba gratis'}
            </span>
          </div>
        </a>
      )}
    </div>
  );
}


