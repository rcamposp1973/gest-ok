import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { User, Company, UserRole, Assignment } from '../types';
import CompanyAccountingDashboard from './CompanyAccountingDashboard';

export interface StudyAdminDashboardProps {
  studyId: string;
  currentUserRole?: UserRole | null;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  isSupportMode?: boolean;
  onExitSupportMode?: () => void;
}

export default function StudyAdminDashboard({
  studyId,
  currentUserRole = UserRole.STUDY_ADMIN,
  currentUserId,
  currentUserEmail,
  isSupportMode = false,
  onExitSupportMode
}: StudyAdminDashboardProps) {
  const isAccountant = currentUserRole === UserRole.ACCOUNTANT;
  const [activeTab, setActiveTab] = useState<'users' | 'companies' | 'assignments'>('companies');
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Editing states
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // Selected company for accounting dashboard with localStorage persistence
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedCompanyForAccounting, setSelectedCompanyForAccounting] = useState<Company | null>(null);

  // Company form section tabs & controlled state to preserve inputs across tabs
  const [companySection, setCompanySection] = useState<'society' | 'legal' | 'contact'>('society');
  const emptyCompanyFormData = {
    name: '',
    fantasyName: '',
    rut: '',
    giro: '',
    address: '',
    comuna: '',
    email: '',
    phone: '',
    legalRepName: '',
    legalRepRut: '',
    legalRepEmail: '',
    contactName: '',
    contactPhone: '',
    estado: 'Activo' as 'Activo' | 'Inactivo',
  };
  const [companyFormData, setCompanyFormData] = useState(emptyCompanyFormData);

  useEffect(() => {
    if (editingCompany) {
      setCompanyFormData({
        name: editingCompany.name || '',
        fantasyName: editingCompany.fantasyName || '',
        rut: editingCompany.rut || '',
        giro: editingCompany.giro || '',
        address: editingCompany.address || '',
        comuna: editingCompany.comuna || '',
        email: editingCompany.email || '',
        phone: editingCompany.phone || '',
        legalRepName: editingCompany.legalRepName || '',
        legalRepRut: editingCompany.legalRepRut || '',
        legalRepEmail: editingCompany.legalRepEmail || '',
        contactName: editingCompany.contactName || '',
        contactPhone: editingCompany.contactPhone || '',
        estado: editingCompany.estado || 'Activo',
      });
    } else {
      setCompanyFormData(emptyCompanyFormData);
    }
  }, [editingCompany]);

  const studyRef = doc(db, 'studies', studyId);

  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const usersSnap = await getDocs(collection(studyRef, 'users'));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));

      const companiesSnap = await getDocs(collection(studyRef, 'companies'));
      const fetchedCompanies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
      setCompanies(fetchedCompanies);

      const assignmentsSnap = await getDocs(collection(studyRef, 'assignments'));
      setAssignments(assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));

      // Restore active company from localStorage if saved
      const savedCompanyId = localStorage.getItem(`activeCompanyId_${studyId}`);
      if (savedCompanyId && !selectedCompanyForAccounting) {
        const found = fetchedCompanies.find(c => c.id === savedCompanyId);
        if (found) {
          setSelectedCompanyForAccounting(found);
        }
      }
    } catch (err: any) {
      console.error("Error fetching study data:", err);
      setFetchError(err.message || 'Error al cargar los datos del estudio');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchData();
  }, [studyId]);

  const handleSelectCompany = (comp: Company | null) => {
    setSelectedCompanyForAccounting(comp);
    if (comp) {
      localStorage.setItem(`activeCompanyId_${studyId}`, comp.id);
    } else {
      localStorage.removeItem(`activeCompanyId_${studyId}`);
    }
  };

  // User CRUD
  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const role = (formData.get('role') as UserRole) || UserRole.ACCOUNTANT;
    const estado = (formData.get('estado') as 'Activo' | 'Inactivo') || 'Activo';

    if (!name || !email) {
      alert('Por favor completa los campos obligatorios.');
      return;
    }

    if (!editingUser && !password) {
      alert('La contraseña es obligatoria para nuevos usuarios.');
      return;
    }

    if (password && password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (!editingUser && users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      alert('Ya existe un usuario con este correo electrónico en este estudio.');
      return;
    }

    try {
      if (editingUser) {
        const updateData: any = { name, email, role, estado };
        if (password) updateData.password = password;
        await updateDoc(doc(studyRef, 'users', editingUser.id), updateData);
        alert('Usuario actualizado exitosamente.');
        setEditingUser(null);
      } else {
        await addDoc(collection(studyRef, 'users'), {
          studyId,
          name,
          email,
          password,
          role,
          estado: 'Activo',
          createdAt: new Date()
        });
        alert('Usuario registrado exitosamente.');
      }
      e.currentTarget.reset();
      await fetchData();
    } catch (err: any) {
      console.error("Error saving user:", err);
      alert('Error al guardar usuario: ' + (err.message || err));
    }
  };

  const handleToggleUserEstado = async (u: User) => {
    const nuevoEstado = u.estado === 'Inactivo' ? 'Activo' : 'Inactivo';
    try {
      await updateDoc(doc(studyRef, 'users', u.id), { estado: nuevoEstado });
      await fetchData();
    } catch (err: any) {
      console.error("Error updating user status:", err);
      alert('Error al actualizar estado: ' + (err.message || err));
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('¿Eliminar este usuario?')) {
      try {
        await deleteDoc(doc(studyRef, 'users', id));
        await fetchData();
      } catch (err: any) {
        console.error("Error deleting user:", err);
        alert('Error al eliminar usuario: ' + (err.message || err));
      }
    }
  };

  // Company CRUD
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = companyFormData.name.trim();
    const fantasyName = companyFormData.fantasyName.trim();
    const rut = companyFormData.rut.toLowerCase().trim();
    const giro = companyFormData.giro.trim();
    const address = companyFormData.address.trim();
    const comuna = companyFormData.comuna.trim();
    const email = companyFormData.email.trim();
    const phone = companyFormData.phone.trim();

    const legalRepName = companyFormData.legalRepName.trim();
    const legalRepRut = companyFormData.legalRepRut.toLowerCase().trim();
    const legalRepEmail = companyFormData.legalRepEmail.trim();

    const contactName = companyFormData.contactName.trim();
    const contactPhone = companyFormData.contactPhone.trim();
    const estado = companyFormData.estado || 'Activo';

    if (!name || !rut) {
      alert('Por favor completa los campos obligatorios (Razón Social y RUT) en la pestaña "1. Datos de la Sociedad".');
      setCompanySection('society');
      return;
    }

    if (!editingCompany && companies.some(c => c.rut === rut || c.name.toLowerCase() === name.toLowerCase())) {
      alert('Ya existe una empresa con este RUT o Razón Social en este estudio.');
      return;
    }

    try {
      const companyPayload = {
        studyId,
        name,
        fantasyName,
        rut,
        giro,
        address,
        comuna,
        email,
        phone,
        legalRepName,
        legalRepRut,
        legalRepEmail,
        contactName,
        contactPhone,
        estado: editingCompany ? (editingCompany.estado || 'Activo') : estado,
        updatedAt: new Date()
      };

      if (editingCompany) {
        await updateDoc(doc(studyRef, 'companies', editingCompany.id), companyPayload);
        alert('Empresa actualizada exitosamente.');
        setEditingCompany(null);
      } else {
        await addDoc(collection(studyRef, 'companies'), {
          ...companyPayload,
          createdAt: new Date()
        });
        alert('Empresa registrada exitosamente.');
      }
      setCompanyFormData(emptyCompanyFormData);
      setCompanySection('society');
      await fetchData();
    } catch (err: any) {
      console.error("Error saving company:", err);
      alert('Error al guardar empresa: ' + (err.message || err));
    }
  };

  const handleToggleCompanyEstado = async (c: Company) => {
    const nuevoEstado = c.estado === 'Inactivo' ? 'Activo' : 'Inactivo';
    try {
      await updateDoc(doc(studyRef, 'companies', c.id), { estado: nuevoEstado });
      await fetchData();
    } catch (err: any) {
      console.error("Error updating company status:", err);
      alert('Error al actualizar estado: ' + (err.message || err));
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (window.confirm('¿Eliminar esta empresa?')) {
      try {
        await deleteDoc(doc(studyRef, 'companies', id));
        await fetchData();
      } catch (err: any) {
        console.error("Error deleting company:", err);
        alert('Error al eliminar empresa: ' + (err.message || err));
      }
    }
  };

  // Assignment CRUD
  const handleSaveAssignment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const userId = formData.get('userId') as string;
    const companyId = formData.get('companyId') as string;

    if (!userId || !companyId) {
      alert('Selecciona un usuario y una empresa.');
      return;
    }

    if (!editingAssignment && assignments.some(a => a.userId === userId && a.companyId === companyId)) {
      alert('Esta asignación ya existe.');
      return;
    }

    try {
      if (editingAssignment) {
        await updateDoc(doc(studyRef, 'assignments', editingAssignment.id), { userId, companyId });
        alert('Asignación actualizada exitosamente.');
        setEditingAssignment(null);
      } else {
        await addDoc(collection(studyRef, 'assignments'), {
          studyId,
          userId,
          companyId,
          createdAt: new Date()
        });
        alert('Asignación creada exitosamente.');
      }
      e.currentTarget.reset();
      await fetchData();
    } catch (err: any) {
      console.error("Error saving assignment:", err);
      alert('Error al guardar asignación: ' + (err.message || err));
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (window.confirm('¿Eliminar esta asignación?')) {
      try {
        await deleteDoc(doc(studyRef, 'assignments', id));
        await fetchData();
      } catch (err: any) {
        console.error("Error deleting assignment:", err);
        alert('Error al eliminar asignación: ' + (err.message || err));
      }
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span>Cargando panel de administración del estudio y empresas...</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white border border-rose-200 rounded-xl shadow-sm text-center space-y-4">
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-900">Error al sincronizar con el estudio</h3>
        <p className="text-xs text-slate-500">{fetchError}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
        >
          Reintentar Sincronización
        </button>
      </div>
    );
  }


  if (selectedCompanyForAccounting) {
    return (
      <CompanyAccountingDashboard
        studyId={studyId}
        company={selectedCompanyForAccounting}
        onBack={() => handleSelectCompany(null)}
      />
    );
  }

  // Calculate visible companies based on role and assignments
  const assignedCompanyIds = assignments
    .filter(a => a.userId === currentUserId || (currentUserEmail && users.find(u => u.email?.toLowerCase() === currentUserEmail.toLowerCase())?.id === a.userId))
    .map(a => a.companyId);
  const visibleCompanies = isAccountant
    ? companies.filter(c => assignedCompanyIds.includes(c.id))
    : companies;

  const tabs = [
    { id: 'companies', label: 'Empresas Clientes' },
    { id: 'users', label: 'Gestión de Usuarios' },
    { id: 'assignments', label: 'Asignaciones' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Banner de Modo Soporte */}
      {isSupportMode && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 rounded-xl shadow flex items-center justify-between font-medium text-xs">
          <div className="flex items-center gap-2">
            <span className="bg-slate-950 text-amber-400 font-bold px-2 py-0.5 rounded text-[10px]">SOPORTE TÉCNICO</span>
            <span>Estás interactuando con este estudio en <strong>Modo Soporte SuperAdmin</strong>.</span>
          </div>
          {onExitSupportMode && (
            <button
              onClick={onExitSupportMode}
              className="bg-slate-950 text-white hover:bg-slate-800 px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
              &larr; Volver al Panel Global
            </button>
          )}
        </div>
      )}

      {/* Header del Estudio */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-slate-800">
        <div>
          <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded font-mono">
            {isAccountant ? 'PERFIL CONTADOR' : 'ADMINISTRACIÓN DE ESTUDIO'}
          </span>
          <h2 className="text-2xl font-bold mt-1">
            {isAccountant ? 'Mis Empresas Asignadas' : 'Panel de Administración y Contabilidad'}
          </h2>
          <p className="text-slate-300 text-xs mt-1">
            Estudio ID: <span className="font-mono bg-indigo-950 px-2 py-0.5 rounded">{studyId}</span>
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 flex items-center gap-3 w-full md:w-auto">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-indigo-200 mb-1 uppercase tracking-wider">
              {isAccountant ? 'Ingresar a Empresa' : 'Selector de Empresa Activa'}
            </label>
            <select
              onChange={(e) => {
                const found = visibleCompanies.find(c => c.id === e.target.value);
                if (found) handleSelectCompany(found);
              }}
              value={selectedCompanyForAccounting?.id || ''}
              className="bg-white text-slate-900 text-sm p-2 rounded-lg font-medium w-full md:w-64 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            >
              <option value="" disabled>Seleccione empresa cliente...</option>
              {visibleCompanies.map(c => (
                <option key={c.id} value={c.id}>{c.name} (RUT: {c.rut})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Si es contador, mostrar únicamente sus empresas asignadas */}
      {isAccountant ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-900">
            Empresas asignadas a tu cuenta ({visibleCompanies.length})
          </h3>
          {visibleCompanies.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-700">No tienes empresas asignadas actualmente.</p>
              <p className="text-xs text-slate-500 mt-1">Por favor comunícate con el administrador de tu estudio para que asigne las empresas clientes a tu usuario.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleCompanies.map(c => (
                <div key={c.id} className="p-4 border border-slate-200 bg-slate-50 hover:bg-slate-100/80 rounded-xl space-y-3 transition-colors">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{c.name}</h4>
                    <p className="text-xs font-mono text-slate-600">RUT: {c.rut}</p>
                    {c.fantasyName && <p className="text-xs text-slate-500">Fantasía: {c.fantasyName}</p>}
                    <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded font-medium ${c.estado === 'Inactivo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {c.estado || 'Activo'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleSelectCompany(c)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    Abrir Contabilidad &rarr;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </>
      )}

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="text-lg font-medium text-slate-900 mb-4">
              {editingUser ? 'Modificar Usuario (Contador)' : 'Registrar Nuevo Usuario (Contador)'}
            </h3>
            <form onSubmit={handleSaveUser} key={editingUser?.id || 'new-user'} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                <input name="name" defaultValue={editingUser?.name || ''} placeholder="Ej. Juan Pérez" required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                <input type="email" name="email" defaultValue={editingUser?.email || ''} placeholder="usuario@estudio.cl" required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {editingUser ? 'Nueva Contraseña (dejar en blanco para mantener)' : 'Contraseña (Mín. 6 caracteres)'}
                </label>
                <input type="password" name="password" placeholder="••••••••" minLength={6} required={!editingUser} className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                <select name="role" defaultValue={editingUser?.role || UserRole.ACCOUNTANT} required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value={UserRole.ACCOUNTANT}>Contador</option>
                  <option value={UserRole.STUDY_ADMIN}>Administrador de Estudio</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors">
                  {editingUser ? 'Guardar Cambios' : 'Registrar Usuario'}
                </button>
                {editingUser && (
                  <button type="button" onClick={() => setEditingUser(null)} className="border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-50">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="text-lg font-medium text-slate-900 mb-4">Usuarios Registrados ({users.length})</h3>
            {users.length === 0 ? (
              <p className="text-slate-500 text-sm">No hay usuarios registrados en este estudio.</p>
            ) : (
              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 border border-slate-100 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-sm text-slate-500">{u.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">{u.role}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.estado === 'Inactivo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {u.estado || 'Activo'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingUser(u)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                        Editar
                      </button>
                      <button onClick={() => handleToggleUserEstado(u)} className="text-amber-600 hover:text-amber-800 text-sm font-medium">
                        {u.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}
                      </button>
                      <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'companies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm lg:col-span-2">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-slate-900">
                {editingCompany ? `Modificar Empresa: ${editingCompany.name}` : 'Registrar Empresa Cliente (Ficha Completa)'}
              </h3>
              {editingCompany && (
                <button type="button" onClick={() => setEditingCompany(null)} className="text-sm text-slate-500 hover:text-slate-800 underline">
                  Cancelar Edición
                </button>
              )}
            </div>
            
            {/* Form Sections Navigation */}
            <div className="flex border-b border-slate-200 mb-6 gap-2">
              <button
                type="button"
                onClick={() => setCompanySection('society')}
                className={`py-2 px-4 font-medium text-sm border-b-2 flex items-center gap-2 ${companySection === 'society' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <span>1. Datos de la Sociedad</span>
                {companyFormData.name && companyFormData.rut && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Datos obligatorios completos"></span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setCompanySection('legal')}
                className={`py-2 px-4 font-medium text-sm border-b-2 flex items-center gap-2 ${companySection === 'legal' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <span>2. Representante Legal</span>
                {companyFormData.legalRepName && (
                  <span className="w-2 h-2 rounded-full bg-indigo-400" title="Datos ingresados"></span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setCompanySection('contact')}
                className={`py-2 px-4 font-medium text-sm border-b-2 flex items-center gap-2 ${companySection === 'contact' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <span>3. Contacto Operativo</span>
                {companyFormData.contactName && (
                  <span className="w-2 h-2 rounded-full bg-indigo-400" title="Datos ingresados"></span>
                )}
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-4">
              {companySection === 'society' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social *</label>
                      <input
                        name="name"
                        value={companyFormData.name}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Ej. Empresa SpA"
                        required
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Fantasía</label>
                      <input
                        name="fantasyName"
                        value={companyFormData.fantasyName}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, fantasyName: e.target.value }))}
                        placeholder="Ej. Mi Empresa"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">RUT (minúsculas) *</label>
                      <input
                        name="rut"
                        value={companyFormData.rut}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, rut: e.target.value }))}
                        placeholder="Ej. 76.123.456-7"
                        required
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Giro / Actividad Económica</label>
                      <input
                        name="giro"
                        value={companyFormData.giro}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, giro: e.target.value }))}
                        placeholder="Ej. Servicios Informáticos"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Tributaria</label>
                      <input
                        name="address"
                        value={companyFormData.address}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Ej. Av. Providencia 1234"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Comuna</label>
                      <input
                        name="comuna"
                        value={companyFormData.comuna}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, comuna: e.target.value }))}
                        placeholder="Ej. Providencia"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email Empresa</label>
                      <input
                        type="email"
                        name="email"
                        value={companyFormData.email}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="contacto@empresa.cl"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                      <input
                        name="phone"
                        value={companyFormData.phone}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+56912345678"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors shadow-xs"
                    >
                      {editingCompany ? '💾 Guardar Cambios' : '💾 Guardar Empresa Ahora'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanySection('legal')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
                    >
                      Siguiente: Representante Legal &rarr;
                    </button>
                  </div>
                </div>
              )}

              {companySection === 'legal' && (
                <div className="space-y-4 animate-fadeIn">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo Rep. Legal</label>
                    <input
                      name="legalRepName"
                      value={companyFormData.legalRepName}
                      onChange={(e) => setCompanyFormData(prev => ({ ...prev, legalRepName: e.target.value }))}
                      placeholder="Ej. María González"
                      className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">RUT Rep. Legal</label>
                      <input
                        name="legalRepRut"
                        value={companyFormData.legalRepRut}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, legalRepRut: e.target.value }))}
                        placeholder="Ej. 12.345.678-9"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email Rep. Legal</label>
                      <input
                        type="email"
                        name="legalRepEmail"
                        value={companyFormData.legalRepEmail}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, legalRepEmail: e.target.value }))}
                        placeholder="mgonzalez@empresa.cl"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setCompanySection('society')}
                      className="border border-slate-300 text-slate-700 font-medium px-5 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      &larr; Anterior
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors shadow-xs"
                      >
                        {editingCompany ? '💾 Guardar Cambios' : '💾 Guardar Empresa'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompanySection('contact')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
                      >
                        Siguiente: Contacto &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {companySection === 'contact' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Persona de Contacto</label>
                      <input
                        name="contactName"
                        value={companyFormData.contactName}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, contactName: e.target.value }))}
                        placeholder="Ej. Carlos Soto"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono Contacto</label>
                      <input
                        name="contactPhone"
                        value={companyFormData.contactPhone}
                        onChange={(e) => setCompanyFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                        placeholder="+56987654321"
                        className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setCompanySection('legal')}
                      className="border border-slate-300 text-slate-700 font-medium px-6 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      &larr; Anterior
                    </button>
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-8 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2"
                    >
                      <span>💾</span>
                      <span>{editingCompany ? 'Guardar Cambios de Empresa' : 'Registrar Empresa Cliente'}</span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="text-lg font-medium text-slate-900 mb-4">Empresas Registradas ({companies.length})</h3>
            {companies.length === 0 ? (
              <p className="text-slate-500 text-sm">No hay empresas registradas en este estudio.</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {companies.map(c => (
                  <div key={c.id} className="p-3 border border-slate-200 bg-slate-50 rounded-lg space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{c.name}</p>
                        <p className="text-xs font-mono text-slate-600">RUT: {c.rut}</p>
                        {c.fantasyName && <p className="text-xs text-slate-500">Fantasía: {c.fantasyName}</p>}
                        <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded font-medium ${c.estado === 'Inactivo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {c.estado || 'Activo'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-200 text-xs font-medium">
                      <button onClick={() => handleSelectCompany(c)} className="text-emerald-600 hover:text-emerald-800 font-bold">
                        Contabilidad
                      </button>
                      <button onClick={() => { setEditingCompany(c); setCompanySection('society'); }} className="text-indigo-600 hover:text-indigo-800">
                        Editar
                      </button>
                      <button onClick={() => handleToggleCompanyEstado(c)} className="text-amber-600 hover:text-amber-800">
                        {c.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}
                      </button>
                      <button onClick={() => handleDeleteCompany(c.id)} className="text-red-500 hover:text-red-700">
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="text-lg font-medium text-slate-900 mb-4">
              {editingAssignment ? 'Modificar Asignación' : 'Asignar Empresa a Contador'}
            </h3>
            <form onSubmit={handleSaveAssignment} key={editingAssignment?.id || 'new-assignment'} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contador</label>
                <select name="userId" defaultValue={editingAssignment?.userId || ''} required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Seleccionar contador...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Empresa Cliente</label>
                <select name="companyId" defaultValue={editingAssignment?.companyId || ''} required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Seleccionar empresa...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name} (RUT: {c.rut})</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors">
                  {editingAssignment ? 'Guardar Cambios' : 'Crear Asignación'}
                </button>
                {editingAssignment && (
                  <button type="button" onClick={() => setEditingAssignment(null)} className="border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-50">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="text-lg font-medium text-slate-900 mb-4">Asignaciones Actuales ({assignments.length})</h3>
            {assignments.length === 0 ? (
              <p className="text-slate-500 text-sm">No hay asignaciones creadas.</p>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto">
                {assignments.map(a => {
                  const assignedUser = users.find(u => u.id === a.userId);
                  const assignedCompany = companies.find(c => c.id === a.companyId);
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 border border-slate-100 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-900">Empresa: {assignedCompany?.name || 'Desconocida'}</p>
                        <p className="text-sm text-slate-500">Contador: {assignedUser?.name || 'Desconocido'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingAssignment(a)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                          Editar
                        </button>
                        <button onClick={() => handleDeleteAssignment(a.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
