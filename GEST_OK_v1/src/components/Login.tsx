import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, collectionGroup } from 'firebase/firestore';
import { Lock, Mail, Eye, EyeOff, LogIn, ShieldCheck, Building2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

          // A. Caso SuperAdmin
          if (cleanEmail === 'rcampos@pulsocontable.cl') {
            userAuthorized = true;
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
      <div className="max-w-sm w-full bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Encabezado Profesional */}
        <div className="bg-slate-950 p-6 text-white text-center border-b border-slate-800">
          <div className="w-11 h-11 bg-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-3 shadow-md">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Gest_OK</h1>
          <p className="text-slate-400 text-xs mt-1 font-medium">Sistema Contable y Gestión Multi-Estudio</p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Correo Electrónico</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  placeholder="usuario@estudio.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-lg transition-all shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" /> Iniciar Sesión
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Acceso Seguro Encriptado SSL</span>
          </div>
        </div>
      </div>
    </div>
  );
}


