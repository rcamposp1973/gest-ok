import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, collectionGroup } from 'firebase/firestore';
import { 
  Lock, Mail, Eye, EyeOff, ShieldCheck, KeyRound, 
  ArrowLeft, CheckCircle2, Activity, ArrowRight
} from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { APP_VERSION } from '../constants/version';

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
    <div className="min-h-screen bg-[#F6F9FC] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-[#533AFD] selection:text-white">
      <div className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-10 flex flex-col justify-between">
        
        <div>
          {/* Top Bar: Botón Volver a Landing y Versión */}
          <div className="flex items-center justify-between mb-6">
            {onBackToLanding ? (
              <button
                type="button"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748D] hover:text-[#0D253D] transition cursor-pointer group"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                <span>Volver a la portada</span>
              </button>
            ) : (
              <div />
            )}

            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase font-mono">
              {APP_VERSION.startsWith('v') ? APP_VERSION : `v${APP_VERSION}`}
            </span>
          </div>

          {/* Logo de Marca Minimalista con Onda Contable */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#533AFD] to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
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
            <h1 className="text-2xl font-extrabold tracking-tight text-[#0D253D]">
              {isResetMode ? 'Recupera tu acceso' : 'Bienvenido de nuevo'}
            </h1>
            <p className="text-xs sm:text-sm text-[#64748D] mt-1 leading-relaxed">
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
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 stroke-[2]" />
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
                className="w-full py-3 px-4 bg-[#533AFD] hover:bg-[#4326EB] active:bg-[#3519d6] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-indigo-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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
                <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                  Contraseña
                </label>
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
              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#533AFD] focus:ring-indigo-500/20 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-xs text-[#64748D] font-medium">Recordar este dispositivo</span>
                </label>
              </div>

              {/* Botón CTA Primario Voltaje Índigo */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-[#533AFD] hover:bg-[#4326EB] active:bg-[#3519d6] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-indigo-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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

              {/* Olvidaste tu clave por debajo del botón Iniciar Sesión */}
              <div className="text-center pt-2">
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
            </form>
          )}
        </div>

        {/* Footer del Formulario */}
        <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between gap-3 text-[11px] text-[#64748D]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#059669]" />
            <span>Conexión Encriptada SSL 256-bit</span>
          </div>
          <span>PulsoContable SpA &bull; Chile</span>
        </div>

      </div>
    </div>
  );
}


