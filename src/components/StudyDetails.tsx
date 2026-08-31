import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, updateDoc, doc, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import { Study, Company, User, Plan, UserRole, StudyAdmin } from '../types';
import StudyAdminDashboard from './StudyAdminDashboard';
import { ShieldAlert, ArrowLeft, Edit3, Save, ExternalLink, UserPlus, Shield, CheckCircle2, XCircle, Key, Phone, Mail, UserCheck, AlertTriangle, Eye, EyeOff, Trash2 } from 'lucide-react';

interface StudyDetailsProps {
  study: Study;
  onBack: () => void;
}

export default function StudyDetails({ study: initialStudy, onBack }: StudyDetailsProps) {
  const [study, setStudy] = useState(initialStudy);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isEditingStudy, setIsEditingStudy] = useState(false);
  const [studyForm, setStudyForm] = useState(initialStudy);
  const [inSupportMode, setInSupportMode] = useState(false);

  // Gestión de Administradores
  const [administrators, setAdministrators] = useState<StudyAdmin[]>([]);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [editingAdminIndex, setEditingAdminIndex] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState<{ [key: number]: boolean }>({});

  // Formulario Nuevo/Editar Administrador
  const [adminFormData, setAdminFormData] = useState<StudyAdmin>({
    name: '',
    rut: '',
    email: '',
    password: '',
    phone: '',
    estado: 'Vigente',
    isPrimary: false
  });
  const [adminFormShowPass, setAdminFormShowPass] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => {
    const studyRef = doc(db, 'studies', study.id);
    
    // Escuchar cambios en el estudio
    const unsubscribeStudy = onSnapshot(studyRef, (docSnap) => {
      if (docSnap.exists()) {
        const sData = { id: docSnap.id, ...docSnap.data() } as Study;
        setStudy(sData);
        setStudyForm(sData);

        // Parsear lista de administradores
        let adminList: StudyAdmin[] = [];
        if (sData.administrators && Array.isArray(sData.administrators) && sData.administrators.length > 0) {
          adminList = sData.administrators;
        } else if (sData.adminEmail || sData.email) {
          adminList = [{
            name: sData.adminName || sData.name || 'Administrador Principal',
            rut: sData.adminRut || '',
            email: sData.adminEmail || sData.email,
            password: sData.adminPassword || (sData as any).password || '',
            phone: sData.adminPhone || sData.phone || '',
            estado: sData.adminEstado || sData.estado || 'Vigente',
            isPrimary: true
          }];
        }
        setAdministrators(adminList);
      }
    });

    const unsubscribeCompanies = onSnapshot(collection(studyRef, 'companies'), (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
    }, (err) => {
      console.warn("Error leyendo empresas:", err);
    });

    const unsubscribeUsers = onSnapshot(collection(studyRef, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    }, (err) => {
      console.warn("Error leyendo usuarios:", err);
    });
    
    getDocs(collection(db, 'plans')).then(snapshot => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan)));
    }).catch(err => console.warn("Error leyendo planes:", err));

    return () => { 
      unsubscribeStudy();
      unsubscribeCompanies(); 
      unsubscribeUsers(); 
    };
  }, [study.id]);

  const [isSavingStudy, setIsSavingStudy] = useState(false);

  // Guardar cambios en los datos del Estudio
  const handleSaveStudy = async () => {
    if (isSavingStudy) return; // Anti-double-click guard
    setIsSavingStudy(true);
    setActionError('');
    setActionSuccess('');
    try {
      const { id, ...dataToSave } = studyForm;
      await updateDoc(doc(db, 'studies', study.id), {
        name: dataToSave.name || '',
        rut: dataToSave.rut || '',
        giro: dataToSave.giro || '',
        address: dataToSave.address || '',
        phone: dataToSave.phone || '',
        email: dataToSave.email || '',
        maxCompanies: Math.max(1, Number(dataToSave.maxCompanies) || 10),
        maxUsers: Math.max(1, Number(dataToSave.maxUsers) || 5),
        estado: dataToSave.estado || 'Vigente'
      });
      setIsEditingStudy(false);
      setActionSuccess('Datos y límites del estudio actualizados correctamente.');
    } catch (err: any) {
      console.error("Error updating study:", err);
      setActionError("Error al actualizar estudio: " + (err.message || err));
    } finally {
      setIsSavingStudy(false);
    }
  };

  // Cambiar Vigencia de un Administrador (Vigente / Sin Vigencia)
  const handleToggleAdminStatus = async (index: number) => {
    setActionError('');
    setActionSuccess('');
    try {
      const updatedAdmins = [...administrators];
      const target = updatedAdmins[index];
      const newStatus = target.estado === 'Vigente' ? 'Sin Vigencia' : 'Vigente';
      target.estado = newStatus;

      // Actualizar en documento studies
      const primaryAdmin = updatedAdmins.find(a => a.isPrimary) || updatedAdmins[0];
      await updateDoc(doc(db, 'studies', study.id), {
        administrators: updatedAdmins,
        adminEstado: primaryAdmin ? primaryAdmin.estado : newStatus
      });

      // Actualizar también en subcolección users
      try {
        const qUsers = collection(db, 'studies', study.id, 'users');
        const snap = await getDocs(qUsers);
        for (const uDoc of snap.docs) {
          const uData = uDoc.data();
          if (uData.email?.toLowerCase() === target.email.toLowerCase()) {
            await updateDoc(doc(db, 'studies', study.id, 'users', uDoc.id), {
              estado: newStatus === 'Vigente' ? 'Activo' : 'Inactivo'
            });
          }
        }
      } catch (subErr) {
        console.warn("Subcollection update warning:", subErr);
      }

      setActionSuccess(`Estado del administrador ${target.email} actualizado a "${newStatus}".`);
    } catch (err: any) {
      console.error("Error changing admin status:", err);
      setActionError("Error al actualizar vigencia del administrador: " + err.message);
    }
  };

  // Abrir Modal para Crear Nuevo Administrador
  const handleOpenAddAdmin = () => {
    setEditingAdminIndex(null);
    setAdminFormData({
      name: '',
      rut: '',
      email: '',
      password: '',
      phone: '',
      estado: 'Vigente',
      isPrimary: administrators.length === 0
    });
    setAdminFormShowPass(false);
    setActionError('');
    setShowAddAdminModal(true);
  };

  // Abrir Modal para Editar Administrador Existente
  const handleOpenEditAdmin = (admin: StudyAdmin, index: number) => {
    setEditingAdminIndex(index);
    setAdminFormData({ ...admin });
    setAdminFormShowPass(false);
    setActionError('');
    setShowAddAdminModal(true);
  };

  // Guardar Administrador (Crear o Editar)
  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');

    const cleanEmail = adminFormData.email.trim().toLowerCase();
    if (!cleanEmail || !adminFormData.name.trim()) {
      setActionError('Nombre y Correo Electrónico son obligatorios.');
      return;
    }
    if (!adminFormData.password || adminFormData.password.length < 6) {
      setActionError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      let updatedList = [...administrators];

      if (editingAdminIndex !== null) {
        // Editando existente
        updatedList[editingAdminIndex] = {
          ...adminFormData,
          name: adminFormData.name.trim(),
          rut: adminFormData.rut?.trim() || '',
          email: cleanEmail,
          phone: adminFormData.phone?.trim() || '',
        };
      } else {
        // Creando nuevo / segundo administrador
        // Validar que el correo no esté ya en la lista de administradores del estudio
        if (updatedList.some(a => a.email.toLowerCase() === cleanEmail)) {
          setActionError('Este correo electrónico ya se encuentra asignado como administrador en este estudio.');
          return;
        }

        const newAdminItem: StudyAdmin = {
          ...adminFormData,
          name: adminFormData.name.trim(),
          rut: adminFormData.rut?.trim() || '',
          email: cleanEmail,
          phone: adminFormData.phone?.trim() || '',
          createdAt: new Date().toISOString(),
          isPrimary: updatedList.length === 0
        };
        updatedList.push(newAdminItem);
      }

      // Si se marca como primario, asegurar que los demás no lo sean
      if (adminFormData.isPrimary && editingAdminIndex !== null) {
        updatedList = updatedList.map((a, idx) => ({
          ...a,
          isPrimary: idx === editingAdminIndex
        }));
      }

      const primaryAdmin = updatedList.find(a => a.isPrimary) || updatedList[0];

      // Actualizar documento de estudio
      await updateDoc(doc(db, 'studies', study.id), {
        administrators: updatedList,
        adminName: primaryAdmin.name,
        adminRut: primaryAdmin.rut,
        adminEmail: primaryAdmin.email,
        adminPassword: primaryAdmin.password,
        adminPhone: primaryAdmin.phone,
        adminEstado: primaryAdmin.estado
      });

      // Crear o actualizar en subcolección users
      try {
        const qUsers = collection(db, 'studies', study.id, 'users');
        const snap = await getDocs(qUsers);
        let existingUserDocId: string | null = null;
        for (const uDoc of snap.docs) {
          if (uDoc.data().email?.toLowerCase() === cleanEmail) {
            existingUserDocId = uDoc.id;
            break;
          }
        }

        if (existingUserDocId) {
          await updateDoc(doc(db, 'studies', study.id, 'users', existingUserDocId), {
            name: adminFormData.name.trim(),
            rut: adminFormData.rut?.trim() || '',
            password: adminFormData.password,
            phone: adminFormData.phone?.trim() || '',
            estado: adminFormData.estado === 'Vigente' ? 'Activo' : 'Inactivo',
            role: UserRole.STUDY_ADMIN
          });
        } else {
          await addDoc(collection(db, 'studies', study.id, 'users'), {
            name: adminFormData.name.trim(),
            rut: adminFormData.rut?.trim() || '',
            email: cleanEmail,
            password: adminFormData.password,
            phone: adminFormData.phone?.trim() || '',
            role: UserRole.STUDY_ADMIN,
            studyId: study.id,
            estado: adminFormData.estado === 'Vigente' ? 'Activo' : 'Inactivo',
            createdAt: new Date().toISOString()
          });
        }
      } catch (subErr) {
        console.warn("Subcollection sync warning:", subErr);
      }

      setShowAddAdminModal(false);
      setActionSuccess(editingAdminIndex !== null ? 'Administrador modificado con éxito.' : 'Nuevo administrador agregado al estudio con éxito.');
    } catch (err: any) {
      console.error("Error saving admin:", err);
      setActionError("Error al guardar administrador: " + err.message);
    }
  };

  // Eliminar Administrador
  const handleDeleteAdmin = async (index: number) => {
    if (administrators.length <= 1) {
      alert("El estudio debe tener al menos un administrador registrado.");
      return;
    }
    const target = administrators[index];
    if (!window.confirm(`¿Seguro que deseas eliminar el administrador ${target.email}?`)) return;

    try {
      const updatedList = administrators.filter((_, i) => i !== index);
      if (target.isPrimary && updatedList.length > 0) {
        updatedList[0].isPrimary = true;
      }
      const primaryAdmin = updatedList[0];

      await updateDoc(doc(db, 'studies', study.id), {
        administrators: updatedList,
        adminName: primaryAdmin?.name || '',
        adminRut: primaryAdmin?.rut || '',
        adminEmail: primaryAdmin?.email || '',
        adminPassword: primaryAdmin?.password || '',
        adminPhone: primaryAdmin?.phone || '',
        adminEstado: primaryAdmin?.estado || 'Vigente'
      });

      setActionSuccess(`Administrador ${target.email} eliminado.`);
    } catch (err: any) {
      console.error("Error deleting admin:", err);
      setActionError("Error al eliminar administrador: " + err.message);
    }
  };

  if (inSupportMode) {
    return (
      <StudyAdminDashboard
        studyId={study.id}
        currentUserRole={UserRole.SUPER_USER}
        isSupportMode={true}
        onExitSupportMode={() => setInSupportMode(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Botones de Navegación y Soporte */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <button
          onClick={onBack}
          className="text-slate-600 hover:text-slate-900 font-medium text-xs flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-xs transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al listado de estudios
        </button>

        <button
          onClick={() => setInSupportMode(true)}
          className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold px-4 py-2 rounded-lg shadow transition-all flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4" /> Entrar al Estudio para Soporte Técnico
        </button>
      </div>

      {/* Notificaciones */}
      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Encabezado del Estudio */}
      <header className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono uppercase">Estudio Registrado</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              study.estado === 'Sin Vigencia' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {study.estado || 'Vigente'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">{study.name}</h2>
          <p className="text-slate-500 text-xs font-mono">ID Estudio: {study.id} &bull; RUT: {study.rut || 'No informado'}</p>
        </div>

        <button
          onClick={() => isEditingStudy ? handleSaveStudy() : setIsEditingStudy(true)}
          className={`text-xs font-semibold px-4 py-2 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors ${
            isEditingStudy ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
        >
          {isEditingStudy ? <><Save className="w-3.5 h-3.5" /> Guardar Cambios</> : <><Edit3 className="w-3.5 h-3.5" /> Modificar Datos del Estudio</>}
        </button>
      </header>

      {/* 1. SECCIÓN: PARÁMETROS DEL ESTUDIO */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">1. Parámetros y Datos Generales del Estudio</h3>
          {isEditingStudy && (
            <button
              onClick={() => { setIsEditingStudy(false); setStudyForm(study); }}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Cancelar
            </button>
          )}
        </div>

        {isEditingStudy ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nombre o Razón Social</label>
              <input
                value={studyForm.name || ''}
                onChange={e => setStudyForm({...studyForm, name: e.target.value})}
                className="p-2 border border-slate-300 rounded-lg w-full bg-white font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">RUT del Estudio</label>
              <input
                value={studyForm.rut || ''}
                onChange={e => setStudyForm({...studyForm, rut: e.target.value})}
                className="p-2 border border-slate-300 rounded-lg w-full font-mono bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Giro / Actividad</label>
              <input
                value={studyForm.giro || ''}
                onChange={e => setStudyForm({...studyForm, giro: e.target.value})}
                className="p-2 border border-slate-300 rounded-lg w-full bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Dirección</label>
              <input
                value={studyForm.address || ''}
                onChange={e => setStudyForm({...studyForm, address: e.target.value})}
                className="p-2 border border-slate-300 rounded-lg w-full bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
              <input
                value={studyForm.phone || ''}
                onChange={e => setStudyForm({...studyForm, phone: e.target.value})}
                className="p-2 border border-slate-300 rounded-lg w-full bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Contacto General</label>
              <input
                value={studyForm.email || ''}
                onChange={e => setStudyForm({...studyForm, email: e.target.value})}
                className="p-2 border border-slate-300 rounded-lg w-full bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Límite Máx. Empresas</label>
              <input
                type="number"
                min="1"
                max="9999"
                value={studyForm.maxCompanies || 10}
                onChange={e => setStudyForm({...studyForm, maxCompanies: parseInt(e.target.value, 10) || 1})}
                className="p-2 border border-slate-300 rounded-lg w-full bg-white font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Límite Máx. Usuarios</label>
              <input
                type="number"
                min="1"
                max="9999"
                value={studyForm.maxUsers || 5}
                onChange={e => setStudyForm({...studyForm, maxUsers: parseInt(e.target.value, 10) || 1})}
                className="p-2 border border-slate-300 rounded-lg w-full bg-white font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estado de Vigencia del Estudio</label>
              <select
                value={studyForm.estado || 'Vigente'}
                onChange={e => setStudyForm({...studyForm, estado: e.target.value as any})}
                className={`p-2 border rounded-lg w-full font-bold ${
                  studyForm.estado === 'Sin Vigencia' ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                }`}
              >
                <option value="Vigente">Vigente (Habilitado)</option>
                <option value="Sin Vigencia">Sin Vigencia (Bloqueado)</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <p className="text-slate-500 font-semibold">RUT:</p>
              <p className="font-mono text-slate-900 font-bold">{study.rut || 'No registrado'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold">Giro:</p>
              <p className="text-slate-900">{study.giro || 'Servicios Contables'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold">Dirección:</p>
              <p className="text-slate-900">{study.address || 'No informada'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold">Teléfono:</p>
              <p className="text-slate-900">{study.phone || 'No informado'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold">Email Contacto:</p>
              <p className="text-slate-900">{study.email || 'No informado'}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold">Cupo Empresas:</p>
              <p className="font-bold text-indigo-700">{companies.length} de {study.maxCompanies || 10} permitidas</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold">Cupo Usuarios:</p>
              <p className="font-bold text-indigo-700">{users.length} de {study.maxUsers || 5} permitidos</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold">Vigencia Estudio:</p>
              <span className={`inline-block mt-0.5 text-[11px] font-bold px-2 py-0.5 rounded ${
                study.estado === 'Sin Vigencia' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {study.estado || 'Vigente'}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 2. SECCIÓN: ADMINISTRADORES DEL ESTUDIO (SUPER USUARIOS) */}
      <section className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-indigo-100 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-700" />
            <div>
              <h3 className="text-base font-bold text-slate-900">2. Administradores del Estudio (Super Usuarios de Estudio)</h3>
              <p className="text-xs text-slate-500">
                Supervisores con facultades de administración sobre contadores, empresas y parametrización.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAddAdmin}
            className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" /> Designar Nuevo Administrador
          </button>
        </div>

        {administrators.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs text-slate-600 font-medium">No se registran administradores para este estudio.</p>
            <button
              onClick={handleOpenAddAdmin}
              className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
            >
              + Designar primer Administrador
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {administrators.map((admin, idx) => {
              const isVigente = admin.estado !== 'Sin Vigencia';
              const showPass = !!showPasswords[idx];

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-all ${
                    isVigente
                      ? 'bg-slate-50 border-slate-200 hover:border-indigo-300'
                      : 'bg-rose-50/40 border-rose-200 opacity-80'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{admin.name || 'Administrador'}</span>
                        {admin.isPrimary && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                            Principal
                          </span>
                        )}
                      </div>
                      {admin.rut && <p className="text-xs font-mono text-slate-500">RUT: {admin.rut}</p>}
                    </div>

                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      isVigente ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {admin.estado || 'Vigente'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-700 my-3">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{admin.email}</span>
                    </div>

                    {admin.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{admin.phone}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 pt-1">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-500">Clave:</span>
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                        {showPass ? (admin.password || '••••••') : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, [idx]: !showPass })}
                        className="text-slate-400 hover:text-slate-600"
                        title={showPass ? "Ocultar clave" : "Ver clave"}
                      >
                        {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Acciones del Administrador */}
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleAdminStatus(idx)}
                      className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
                        isVigente
                          ? 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                      }`}
                    >
                      {isVigente ? 'Dejar Sin Vigencia' : 'Habilitar Vigencia'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditAdmin(admin, idx)}
                        className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded transition-colors text-xs flex items-center gap-1 font-semibold"
                        title="Modificar datos del administrador"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Editar
                      </button>

                      {administrators.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAdmin(idx)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                          title="Eliminar este administrador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. SECCIÓN: EMPRESAS Y CONTADORES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-slate-900">Empresas Clientes ({companies.length})</h3>
            <button
              onClick={() => setInSupportMode(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              Gestionar en Soporte <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {companies.map(comp => (
              <li key={comp.id} className="py-2.5 flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold text-slate-900 block">{comp.name}</span>
                  <span className="text-slate-500 font-mono text-[11px]">RUT: {comp.rut}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  comp.estado === 'Inactivo' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {comp.estado || 'Activo'}
                </span>
              </li>
            ))}
            {companies.length === 0 && <li className="text-slate-500 italic text-xs py-2">No hay empresas registradas en este estudio.</li>}
          </ul>
        </section>

        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-slate-900">Contadores y Usuarios ({users.length})</h3>
            <button
              onClick={() => setInSupportMode(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              Gestionar en Soporte <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {users.map(user => (
              <li key={user.id} className="py-2.5 flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold text-slate-900 block">{user.name || user.email}</span>
                  <span className="text-slate-500 font-mono text-[11px]">{user.email}</span>
                </div>
                <span className="text-slate-600 uppercase text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded">
                  {user.role}
                </span>
              </li>
            ))}
            {users.length === 0 && <li className="text-slate-500 italic text-xs py-2">No hay contadores registrados en este estudio.</li>}
          </ul>
        </section>
      </div>

      {/* MODAL: DESIGNAR / EDITAR ADMINISTRADOR */}
      {showAddAdminModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="bg-indigo-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-300" />
                <h3 className="font-bold text-base">
                  {editingAdminIndex !== null ? 'Modificar Administrador del Estudio' : 'Designar Nuevo Administrador'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddAdminModal(false)}
                className="text-indigo-200 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveAdmin} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  placeholder="Ej: Carolina Tapia Gómez"
                  value={adminFormData.name}
                  onChange={(e) => setAdminFormData({ ...adminFormData, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RUT</label>
                  <input
                    type="text"
                    placeholder="Ej: 14.567.890-1"
                    value={adminFormData.rut || ''}
                    onChange={(e) => setAdminFormData({ ...adminFormData, rut: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono / Móvil</label>
                  <input
                    type="text"
                    placeholder="+56 9 9876 5432"
                    value={adminFormData.phone || ''}
                    onChange={(e) => setAdminFormData({ ...adminFormData, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Correo de Acceso (Email) *</label>
                <input
                  type="email"
                  placeholder="admin2@estudio.cl"
                  value={adminFormData.email}
                  onChange={(e) => setAdminFormData({ ...adminFormData, email: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Contraseña de Acceso *</label>
                <div className="relative">
                  <input
                    type={adminFormShowPass ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={adminFormData.password || ''}
                    onChange={(e) => setAdminFormData({ ...adminFormData, password: e.target.value })}
                    className="w-full p-2.5 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setAdminFormShowPass(!adminFormShowPass)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {adminFormShowPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estado de Vigencia</label>
                  <select
                    value={adminFormData.estado}
                    onChange={(e) => setAdminFormData({ ...adminFormData, estado: e.target.value as any })}
                    className={`w-full p-2.5 border rounded-lg font-bold outline-none ${
                      adminFormData.estado === 'Vigente' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
                    }`}
                  >
                    <option value="Vigente">Vigente</option>
                    <option value="Sin Vigencia">Sin Vigencia</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={adminFormData.isPrimary || false}
                      onChange={(e) => setAdminFormData({ ...adminFormData, isPrimary: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span>Administrador Principal</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-lg shadow-sm"
                >
                  {editingAdminIndex !== null ? 'Guardar Cambios' : 'Registrar Administrador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


