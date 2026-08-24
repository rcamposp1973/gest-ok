import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { Plan, UserRole, StudyAdmin } from '../types';
import { Building2, UserCheck, Shield, Lock, Eye, EyeOff } from 'lucide-react';

interface CreateStudyProps {
  onSuccess?: () => void;
}

export default function CreateStudy({ onSuccess }: CreateStudyProps) {
  // Datos del Estudio
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [giro, setGiro] = useState('');
  const [planId, setPlanId] = useState('');
  const [estado, setEstado] = useState<'Vigente' | 'Sin Vigencia'>('Vigente');

  // Datos del Administrador del Estudio
  const [adminName, setAdminName] = useState('');
  const [adminRut, setAdminRut] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminEstado, setAdminEstado] = useState<'Vigente' | 'Sin Vigencia'>('Vigente');
  const [showPassword, setShowPassword] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'plans')).then(snapshot => {
      const pList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Plan));
      setPlans(pList);
      if (pList.length > 0 && !planId) {
        setPlanId(pList[0].id);
      }
    }).catch(err => console.warn("Error leyendo planes:", err));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanStudyName = name.trim();
    const cleanStudyRut = rut.trim();
    const cleanAdminEmail = adminEmail.trim().toLowerCase();

    if (!cleanStudyName || !cleanStudyRut || !planId || !cleanAdminEmail || !adminPassword) {
      setError('Por favor complete todos los campos obligatorios del estudio y del administrador.');
      return;
    }

    if (adminPassword.length < 6) {
      setError('La contraseña del administrador debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verificar duplicados por Nombre o RUT de estudio
      const studiesRef = collection(db, 'studies');
      const qName = query(studiesRef, where("name", "==", cleanStudyName));
      const qRut = query(studiesRef, where("rut", "==", cleanStudyRut));
      const [snapName, snapRut] = await Promise.all([getDocs(qName), getDocs(qRut)]);
      
      if (!snapName.empty) {
        throw new Error(`Ya existe un estudio con el nombre "${cleanStudyName}".`);
      }
      if (!snapRut.empty) {
        throw new Error(`Ya existe un estudio registrado con el RUT "${cleanStudyRut}".`);
      }

      const initialAdmin: StudyAdmin = {
        name: adminName.trim() || cleanStudyName,
        rut: adminRut.trim(),
        email: cleanAdminEmail,
        password: adminPassword,
        phone: adminPhone.trim(),
        estado: adminEstado,
        createdAt: new Date().toISOString(),
        isPrimary: true
      };

      // 2. Crear documento de Estudio
      const newStudyRef = await addDoc(collection(db, 'studies'), {
        name: cleanStudyName,
        rut: cleanStudyRut,
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim() || cleanAdminEmail,
        giro: giro.trim(),
        planId,
        estado,
        adminId: auth.currentUser?.uid || 'superadmin',
        adminName: initialAdmin.name,
        adminRut: initialAdmin.rut,
        adminEmail: cleanAdminEmail,
        adminPassword: adminPassword,
        adminPhone: initialAdmin.phone,
        adminEstado: initialAdmin.estado,
        administrators: [initialAdmin],
        createdAt: new Date().toISOString()
      });

      // 3. Crear usuario administrador en la subcolección de usuarios del estudio
      try {
        await addDoc(collection(db, 'studies', newStudyRef.id, 'users'), {
          name: initialAdmin.name,
          rut: initialAdmin.rut,
          email: cleanAdminEmail,
          password: adminPassword,
          phone: initialAdmin.phone,
          role: UserRole.STUDY_ADMIN,
          studyId: newStudyRef.id,
          estado: adminEstado === 'Vigente' ? 'Activo' : 'Inactivo',
          createdAt: new Date().toISOString()
        });
      } catch (subErr) {
        console.warn("Subcollection user creation warning:", subErr);
      }

      setSuccessMsg(`¡Estudio "${cleanStudyName}" y Administrador creados exitosamente!`);
      // Reset form
      setName('');
      setRut('');
      setAddress('');
      setPhone('');
      setEmail('');
      setGiro('');
      setAdminName('');
      setAdminRut('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminPhone('');

      if (onSuccess) {
        setTimeout(() => onSuccess(), 1200);
      }
    } catch (err: any) {
      console.error("Error al crear estudio:", err);
      setError(err.message || 'Error inesperado al crear el estudio contable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-medium">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-6">
        {/* SECCIÓN 1: DATOS DEL ESTUDIO */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">1. Datos Generales del Estudio Contable</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nombre o Razón Social del Estudio *</label>
              <input
                type="text"
                placeholder="Ej: Consultores Contables SpA"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">RUT del Estudio *</label>
              <input
                type="text"
                placeholder="Ej: 76.123.456-7"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Giro / Actividad Económica</label>
              <input
                type="text"
                placeholder="Ej: Servicios de Contabilidad y Auditoría"
                value={giro}
                onChange={(e) => setGiro(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Dirección Comercial</label>
              <input
                type="text"
                placeholder="Ej: Av. Providencia 1234, Of. 501"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Teléfono Central</label>
              <input
                type="text"
                placeholder="Ej: +56 9 1234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Institucional del Estudio</label>
              <input
                type="email"
                placeholder="contacto@estudio.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Plan de Suscripción Asignado *</label>
              <select
                value={planId}
                onChange={e => setPlanId(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              >
                <option value="">Seleccionar Plan...</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Máx: {p.maxCompanies} empresas, {p.maxUsers} usuarios)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Vigencia del Estudio</label>
              <select
                value={estado}
                onChange={e => setEstado(e.target.value as any)}
                className={`w-full p-2.5 border rounded-lg font-bold outline-none ${
                  estado === 'Vigente' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                <option value="Vigente">Vigente (Activo)</option>
                <option value="Sin Vigencia">Sin Vigencia (Bloqueado)</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: ADMINISTRADOR / SUPER USUARIO DEL ESTUDIO */}
        <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-200 space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-200 pb-2.5">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-700" />
              <div>
                <h4 className="text-sm font-bold text-slate-900">2. Administrador Designado (Super Usuario del Estudio)</h4>
                <p className="text-[11px] text-slate-500">Tendrá acceso para gestionar contadores, empresas y parametrización.</p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono">ROL: STUDY_ADMIN</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nombre Completo del Administrador *</label>
              <input
                type="text"
                placeholder="Ej: Juan Pérez Morales"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">RUT del Administrador</label>
              <input
                type="text"
                placeholder="Ej: 15.678.901-2"
                value={adminRut}
                onChange={(e) => setAdminRut(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Correo de Acceso del Administrador *</label>
              <input
                type="email"
                placeholder="admin@estudio.cl"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Contraseña de Acceso *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full p-2.5 pr-10 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Teléfono / Móvil</label>
              <input
                type="text"
                placeholder="Ej: +56 9 8765 4321"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Vigencia del Administrador</label>
              <select
                value={adminEstado}
                onChange={e => setAdminEstado(e.target.value as any)}
                className={`w-full p-2.5 border rounded-lg font-bold outline-none ${
                  adminEstado === 'Vigente' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                <option value="Vigente">Vigente (Habilitado)</option>
                <option value="Sin Vigencia">Sin Vigencia (Deshabilitado)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-lg shadow transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <UserCheck className="w-4 h-4" /> Guardar y Registrar Estudio con su Administrador
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

