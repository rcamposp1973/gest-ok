import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, collectionGroup } from 'firebase/firestore';
import { Lock, Mail, Eye, EyeOff, LogIn, ShieldCheck, Building2, KeyRound, ArrowLeft, CheckCircle2, MessageCircle } from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { APP_VERSION } from '../constants/version';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          if (!snapSuper.empty || cleanEmail === 'rcampos@pulsocontable.cl' || cleanEmail === 'campos.ramon@gmail.com') {
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
            } else if (cleanEmail === 'rcampos@pulsocontable.cl' || cleanEmail === 'campos.ramon@gmail.com') {
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
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-xl border border-slate-700/60 overflow-hidden">
        
        {/* Encabezado Corporativo Formal */}
        <div className="bg-slate-950 p-6 text-white text-center border-b border-slate-800">
          <div className="w-10 h-10 bg-slate-800 rounded-md border border-slate-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <Building2 className="w-5 h-5 text-slate-100 stroke-[1.25]" />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">PLATAFORMA CORPORATIVA</div>
          <h1 className="text-xl font-bold tracking-tight text-white mt-1">Gest_OK</h1>
          <p className="text-slate-400 text-xs mt-1 font-normal">Sistema Contable y Gestión Multi-Estudio Chile</p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-800 text-xs font-medium">
              {error}
            </div>
          )}

          {resetSuccess && (
            <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs font-medium flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5 stroke-[1.5]" />
              <span>{resetSuccess}</span>
            </div>
          )}

          {isResetMode ? (
            /* Modo Recuperación de Contraseña */
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-slate-700 stroke-[1.25]" />
                  <span>Recuperar Contraseña</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ingresa tu correo electrónico y te enviaremos las instrucciones de recuperación.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Correo Electrónico Registrado</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 stroke-[1.25]" />
                  <input
                    type="email"
                    placeholder="usuario@estudio.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-700 focus:bg-white focus:border-slate-700 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-semibold text-xs rounded-md transition-colors border border-slate-700 shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {resetLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 stroke-[1.25]" /> Enviar Enlace de Recuperación
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(false);
                    setError('');
                    setResetSuccess('');
                  }}
                  className="text-xs text-slate-700 hover:text-slate-900 font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5 stroke-[1.25]" /> Volver a Iniciar Sesión
                </button>
              </div>
            </form>
          ) : (
            /* Modo Iniciar Sesión */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Correo Electrónico</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 stroke-[1.25]" />
                  <input
                    type="email"
                    placeholder="usuario@estudio.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-700 focus:bg-white focus:border-slate-700 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Contraseña</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 stroke-[1.25]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50 border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-700 focus:bg-white focus:border-slate-700 outline-none transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4 stroke-[1.25]" /> : <Eye className="w-4 h-4 stroke-[1.25]" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 mt-2 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-semibold text-xs rounded-md transition-colors border border-slate-700 shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4 stroke-[1.25]" /> Iniciar Sesión
                  </>
                )}
              </button>

              <div className="text-center pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setError('');
                    setResetSuccess('');
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline transition-colors"
                >
                  ¿Olvidaste tu clave?
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 space-y-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-600 stroke-[1.25]" />
              <span>Acceso Seguro Encriptado SSL</span>
            </div>

            <div className="text-[11px] text-slate-500 space-y-0.5 border-t border-slate-100 pt-3">
              <p className="font-semibold text-slate-700">Sistema Desarrollado por PulsoContable SpA</p>
              <p>
                Contacto:{' '}
                <a
                  href="mailto:contacto@pulsocontable.cl"
                  className="text-slate-700 hover:text-slate-900 font-semibold underline underline-offset-2 transition-colors"
                >
                  contacto@pulsocontable.cl
                </a>
              </p>
              <p className="text-slate-400">Santiago, Chile</p>
              <p className="text-[10px] text-slate-400 font-medium pt-1">
                Gest_OK® <span className="font-mono text-indigo-600 font-bold px-1 bg-indigo-50 border border-indigo-100 rounded">{APP_VERSION}</span> — Marca Registrada. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Botón Flotante WhatsApp - Pide tu prueba gratis de 15 días */}
      <a
        id="btn-whatsapp-free-trial"
        href="https://wa.me/56946318783?text=Hola%21%21%21%20quiero%20usar%20GEST_OK"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-4 sm:right-7 z-50 flex items-center gap-3 bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-3 rounded-full shadow-2xl hover:shadow-emerald-500/20 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 border border-white/20 group focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2 focus:ring-offset-slate-900"
        title="Pide tu prueba gratis de 15 días en WhatsApp"
      >
        <div className="w-9 h-9 bg-white/25 group-hover:bg-white/35 rounded-full flex items-center justify-center flex-shrink-0 transition-colors shadow-inner">
          <MessageCircle className="w-5 h-5 text-white fill-white/40 stroke-[2.2]" />
        </div>
        <div className="flex flex-col text-left pr-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-950/80 leading-none">
            WhatsApp Oficial
          </span>
          <span className="text-xs sm:text-sm font-extrabold text-white tracking-tight leading-tight mt-0.5 whitespace-nowrap">
            Pide tu prueba gratis de 15 días
          </span>
        </div>
      </a>
    </div>
  );
}


