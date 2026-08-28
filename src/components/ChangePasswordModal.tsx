import React, { useState } from 'react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, collectionGroup } from 'firebase/firestore';
import { Key, Lock, Eye, EyeOff, ShieldCheck, X, Check, AlertCircle } from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';

interface ChangePasswordModalProps {
  userEmail: string;
  onClose: () => void;
}

export default function ChangePasswordModal({ userEmail, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!newPassword || newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las nuevas contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const currentUser = auth.currentUser;
      const cleanEmail = userEmail.toLowerCase().trim();

      // 1. Intentar actualizar en Firebase Auth si existe sesión activa
      if (currentUser && currentUser.email?.toLowerCase() === cleanEmail) {
        try {
          await updatePassword(currentUser, newPassword);
        } catch (authErr: any) {
          if (authErr?.code === 'auth/requires-recent-login') {
            if (!currentPassword) {
              throw new Error('Por seguridad, ingresa tu contraseña actual para confirmar la modificación.');
            }
            // Reautenticar y reintentar
            const credential = EmailAuthProvider.credential(cleanEmail, currentPassword);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPassword);
          } else {
            console.warn("Error en updatePassword Auth, continuando actualización en base de datos:", authErr);
          }
        }
      }

      // 2. Actualizar contraseña en registros Firestore para mantener sincronía
      let updatedInDb = false;

      // A. SuperUsers
      try {
        const qSuper = query(collection(db, 'superUsers'), where('email', '==', cleanEmail));
        const snapSuper = await getDocs(qSuper);
        for (const sDoc of snapSuper.docs) {
          await updateDoc(sDoc.ref, { password: newPassword });
          updatedInDb = true;
        }
      } catch (e) {
        console.warn("Superuser db update warn:", e);
      }

      // B. Administradores de Estudio
      try {
        const studiesSnap = await getDocs(collection(db, 'studies'));
        for (const sDoc of studiesSnap.docs) {
          const sData = sDoc.data();
          let needUpdate = false;
          let newAdmins = sData.administrators || [];

          if (Array.isArray(newAdmins) && newAdmins.length > 0) {
            newAdmins = newAdmins.map((adm: any) => {
              if (adm.email?.toLowerCase() === cleanEmail) {
                needUpdate = true;
                return { ...adm, password: newPassword };
              }
              return adm;
            });
          }

          const updates: any = {};
          if (needUpdate) {
            updates.administrators = newAdmins;
          }

          if ((sData.adminEmail || '').toLowerCase() === cleanEmail || (sData.email || '').toLowerCase() === cleanEmail) {
            updates.adminPassword = newPassword;
            updates.password = newPassword;
            needUpdate = true;
          }

          if (needUpdate) {
            await updateDoc(sDoc.ref, updates);
            updatedInDb = true;
          }
        }
      } catch (e) {
        console.warn("Study admin db update warn:", e);
      }

      // C. Contadores / Analistas en subcolecciones
      try {
        const qUsers = query(collectionGroup(db, 'users'), where('email', '==', cleanEmail));
        const snapUsers = await getDocs(qUsers);
        for (const uDoc of snapUsers.docs) {
          await updateDoc(uDoc.ref, { password: newPassword });
          updatedInDb = true;
        }
      } catch (e) {
        console.warn("Subcollection user db update warn:", e);
      }

      // Registrar auditoría
      logAuditEvent({
        userId: currentUser?.uid || cleanEmail,
        userEmail: cleanEmail,
        action: 'MODIFICAR',
        module: 'AUTENTICACION',
        details: `Modificación de contraseña para ${cleanEmail}`
      });

      setSuccessMsg('¡Contraseña actualizada exitosamente!');
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error("Change password error:", err);
      setError(err.message || 'Ocurrió un error al intentar cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-slate-800">
        
        {/* Encabezado Modal */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Key className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Modificar Mi Contraseña</h3>
              <p className="text-[11px] text-slate-500 font-mono">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensajes de Estado */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-600 stroke-[2.5]" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleChangePassword} className="space-y-3.5 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Contraseña Actual (opcional si ya estás autenticado)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showCurrentPass ? 'text' : 'password'}
                placeholder="Ingresa tu clave actual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nueva Contraseña <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showNewPass ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirmar Nueva Contraseña <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                placeholder="Repite la nueva contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                required
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Cambio Seguro</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
