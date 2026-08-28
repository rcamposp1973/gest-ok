import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { SuperUser } from '../types';
import { ShieldCheck, UserPlus, Edit3, Trash2, CheckCircle2, XCircle, Key, Eye, EyeOff, AlertTriangle, Phone, Mail, ShieldAlert } from 'lucide-react';

export default function SuperUsersManager() {
  const [superUsers, setSuperUsers] = useState<SuperUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SuperUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<SuperUser>({
    name: '',
    email: '',
    password: '',
    rut: '',
    phone: '',
    estado: 'Activo',
  });

  useEffect(() => {
    // 1. Ensure seed/initial super users exist in superUsers collection if empty
    const ensureSeedSuperUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'superUsers'));
        if (snap.empty) {
          // Seed the initial root super admin
          await addDoc(collection(db, 'superUsers'), {
            name: 'Ramón Campos (Pulso Contable)',
            email: 'rcampos@pulsocontable.cl',
            rut: '12.345.678-9',
            phone: '+56 9 8765 4321',
            password: 'password123',
            estado: 'Activo',
            createdAt: new Date().toISOString(),
          });
        } else {
          // Clean up any incorrect superUser doc with study admin emails
          for (const sDoc of snap.docs) {
            const dData = sDoc.data();
            if (dData.email?.toLowerCase() === 'campos.ramon@gmail.com') {
              console.log("Removing study admin from superUsers collection:", sDoc.id);
              await deleteDoc(doc(db, 'superUsers', sDoc.id));
            }
          }
        }
      } catch (e) {
        console.warn("SuperUsers seed warning:", e);
      }
    };

    ensureSeedSuperUsers();

    // 2. Realtime listener on superUsers collection
    const unsubscribe = onSnapshot(collection(db, 'superUsers'), (snapshot) => {
      const usersList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SuperUser));
      // Sort alphabetically by name
      usersList.sort((a, b) => a.name.localeCompare(b.name));
      setSuperUsers(usersList);
      setLoading(false);
    }, (err) => {
      console.error("Error loading super users:", err);
      setError("Error al cargar super administradores: " + err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      rut: '',
      phone: '',
      estado: 'Activo',
    });
    setShowPassword(false);
    setError(null);
    setSuccess(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (user: SuperUser) => {
    setEditingUser(user);
    setFormData({
      ...user,
      password: user.password || '',
    });
    setShowPassword(false);
    setError(null);
    setSuccess(null);
    setShowModal(true);
  };

  const handleSaveSuperUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanEmail = formData.email.trim().toLowerCase();
    const cleanName = formData.name.trim();

    if (!cleanName || !cleanEmail) {
      setError("Nombre y Correo Electrónico son obligatorios.");
      return;
    }

    if (!editingUser && (!formData.password || formData.password.length < 6)) {
      setError("La contraseña es obligatoria y debe tener al menos 6 caracteres.");
      return;
    }

    // Check duplicate email
    if (!editingUser && superUsers.some(u => u.email.toLowerCase() === cleanEmail)) {
      setError("Ya existe un Super Administrador registrado con este correo electrónico.");
      return;
    }

    try {
      if (editingUser?.id) {
        const updatePayload: any = {
          name: cleanName,
          email: cleanEmail,
          rut: formData.rut?.trim() || '',
          phone: formData.phone?.trim() || '',
          estado: formData.estado || 'Activo',
        };
        if (formData.password) {
          updatePayload.password = formData.password;
        }
        await updateDoc(doc(db, 'superUsers', editingUser.id), updatePayload);
        setSuccess(`Super Administrador ${cleanName} actualizado correctamente.`);
      } else {
        await addDoc(collection(db, 'superUsers'), {
          name: cleanName,
          email: cleanEmail,
          rut: formData.rut?.trim() || '',
          phone: formData.phone?.trim() || '',
          password: formData.password,
          estado: formData.estado || 'Activo',
          createdAt: new Date().toISOString(),
        });
        setSuccess(`Nuevo Super Administrador ${cleanName} registrado exitosamente.`);
      }
      setShowModal(false);
    } catch (err: any) {
      console.error("Error saving super user:", err);
      setError("Error al guardar super administrador: " + err.message);
    }
  };

  const handleToggleStatus = async (user: SuperUser) => {
    if (!user.id) return;
    setError(null);
    setSuccess(null);

    const isCurrentlyActive = user.estado === 'Activo' || user.estado === 'Vigente';
    const newStatus = isCurrentlyActive ? 'Inactivo' : 'Activo';

    // Prevent blocking all super admins
    const activeCount = superUsers.filter(u => u.estado === 'Activo' || u.estado === 'Vigente').length;
    if (isCurrentlyActive && activeCount <= 1) {
      alert("⚠️ No puedes desactivar al único Super Administrador activo del sistema.");
      return;
    }

    try {
      await updateDoc(doc(db, 'superUsers', user.id), {
        estado: newStatus
      });
      setSuccess(`Estado de ${user.name} cambiado a "${newStatus}".`);
    } catch (err: any) {
      console.error("Error toggling status:", err);
      setError("Error al cambiar estado: " + err.message);
    }
  };

  const handleDeleteSuperUser = async (user: SuperUser) => {
    if (!user.id) return;
    setError(null);
    setSuccess(null);

    if (superUsers.length <= 1) {
      alert("⚠️ Debe existir al menos un Super Administrador en la plataforma.");
      return;
    }

    if (!window.confirm(`¿Estás seguro de eliminar el rol de Super Administrador para ${user.name} (${user.email})?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'superUsers', user.id));
      setSuccess(`Super Administrador ${user.name} eliminado del sistema.`);
    } catch (err: any) {
      console.error("Error deleting super user:", err);
      setError("Error al eliminar: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-600/30 text-indigo-400 rounded-lg">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Gestión de Super Administradores Globales</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Control jerárquico global y gobernanza de accesos con privilegios de plataforma.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Registrar Nuevo Super Admin</span>
        </button>
      </div>

      {/* NOTIFICATIONS */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* MATRIX INFO BOX */}
      <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4.5 text-xs text-indigo-950 space-y-2">
        <div className="flex items-center gap-2 font-bold text-indigo-900">
          <ShieldAlert className="w-4 h-4 text-indigo-700" />
          <span>Matriz de Permisos: Rol Super Administrador (Global)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] text-indigo-900">
          <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100">
            <span className="font-bold text-indigo-950 block mb-1">🏢 Gestión Total de Estudios</span>
            Crea, edita, audita y bloquea Estudios Contables, Administradores de Estudio y Planes.
          </div>
          <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100">
            <span className="font-bold text-indigo-950 block mb-1">🌐 Navegación Total</span>
            Accede a cualquier estudio contable y empresa registrada para soporte y supervisión.
          </div>
          <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100">
            <span className="font-bold text-rose-700 block mb-1">🔒 Restricción de Solo Lectura</span>
            Dentro de las empresas solo tiene permisos de LECTURA (Solo Ver). No puede alterar registros contables o tributarios.
          </div>
        </div>
      </div>

      {/* TABLE OF SUPER ADMINS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Super Administradores Registrados ({superUsers.length})
            </h3>
            <p className="text-xs text-slate-500">Usuarios con privilegios globales en la base de datos</p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span>Cargando super administradores...</span>
          </div>
        ) : superUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No se encontraron super administradores registrados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Nombre / Identificación</th>
                  <th className="p-3.5">Correo Electrónico</th>
                  <th className="p-3.5">Teléfono / Contacto</th>
                  <th className="p-3.5 text-center">Estado / Vigencia</th>
                  <th className="p-3.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {superUsers.map((user) => {
                  const isActive = user.estado === 'Activo' || user.estado === 'Vigente';
                  return (
                    <tr key={user.id || user.email} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        {user.rut && <div className="text-[11px] font-mono text-slate-500">RUT: {user.rut}</div>}
                      </td>
                      <td className="p-3.5 font-mono text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {user.phone ? (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{user.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No registrado</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {isActive ? '● Activo' : '○ Inactivo / Bloqueado'}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex justify-center items-center gap-1.5">
                          <button
                            onClick={() => handleToggleStatus(user)}
                            title={isActive ? 'Bloquear / Desactivar' : 'Activar'}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                              isActive
                                ? 'border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100'
                                : 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                            }`}
                          >
                            {isActive ? 'Bloquear' : 'Activar'}
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Editar Super Administrador"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSuperUser(user)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar Super Administrador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR SUPER ADMIN */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">
                  {editingUser ? 'Editar Super Administrador' : 'Registrar Nuevo Super Administrador'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSuperUser} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Ramón Campos"
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico (Login) *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@pulsocontable.cl"
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RUT</label>
                  <input
                    type="text"
                    value={formData.rut || ''}
                    onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                    placeholder="12.345.678-9"
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+56 9 1234 5678"
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {editingUser ? 'Nueva Contraseña (dejar en blanco para conservar)' : 'Contraseña de Acceso *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password || ''}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser ? '••••••••' : 'Mínimo 6 caracteres'}
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono pr-10 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Estado de Vigencia</label>
                <select
                  value={formData.estado}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value as any })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="Activo">Activo / Vigente</option>
                  <option value="Inactivo">Inactivo / Bloqueado</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-all"
                >
                  {editingUser ? 'Guardar Cambios' : 'Crear Super Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
