import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { User, Company, UserRole, Assignment, Study, ChartOfAccount, Voucher, RCVDocument, BankReconciliation, FiscalPeriodYear, DTEConfig } from '../types';
import CompanyAccountingDashboard from './CompanyAccountingDashboard';
import ClientExecutiveManagementView from './ClientExecutiveManagementView';
import { ShieldAlert, Users, Building2, UserCheck, Shield, Key, LogOut, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Lock, Eye, EyeOff, FileText, Upload, Sparkles, Server, Check, ArrowRight, Activity } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';
import { isTestStudy, executeTestStudyDataPurge, TestStudyPurgeStats } from '../utils/testStudyPurgeUtils';

export interface StudyAdminDashboardProps {
  studyId: string;
  currentUserRole?: UserRole | null;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  isSupportMode?: boolean;
  onExitSupportMode?: () => void;
  onCompanyChange?: (company: Company | null) => void;
  onLogout?: () => void;
}

export default function StudyAdminDashboard({
  studyId,
  currentUserRole = UserRole.STUDY_ADMIN,
  currentUserId,
  currentUserEmail,
  isSupportMode = false,
  onExitSupportMode,
  onCompanyChange,
  onLogout
}: StudyAdminDashboardProps) {
  const isSuperUser = currentUserRole === UserRole.SUPER_USER;
  const isStudyAdmin = currentUserRole === UserRole.STUDY_ADMIN;
  const isAccountant = currentUserRole === UserRole.ACCOUNTANT;
  const isAnalyst = currentUserRole === UserRole.ANALYST;
  const isObserver = currentUserRole === UserRole.OBSERVER;
  const isRestrictedWorker = isAccountant || isAnalyst || isObserver;

  // Observer mode loaded data
  const [observerAccounts, setObserverAccounts] = useState<ChartOfAccount[]>([]);
  const [observerVouchers, setObserverVouchers] = useState<Voucher[]>([]);
  const [observerRcvDocs, setObserverRcvDocs] = useState<RCVDocument[]>([]);
  const [observerBankRecs, setObserverBankRecs] = useState<BankReconciliation[]>([]);
  const [observerFiscalYears, setObserverFiscalYears] = useState<FiscalPeriodYear[]>([]);
  const [loadingObserverData, setLoadingObserverData] = useState<boolean>(false);

  const [showChangePassModal, setShowChangePassModal] = useState(false);

  const [activeTab, setActiveTab] = useState<'users' | 'companies' | 'assignments' | 'demoPurge'>('companies');
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [studyData, setStudyData] = useState<Study | null>(null);

  const isCurrentStudyTest = isTestStudy(studyId, studyData?.name);

  // Test Study Purge states
  const [isTestPurging, setIsTestPurging] = useState(false);
  const [testPurgeTargetCompanyId, setTestPurgeTargetCompanyId] = useState<string>('ALL');
  const [testPurgeConfirmation, setTestPurgeConfirmation] = useState('');
  const [testPurgeSuccessMessage, setTestPurgeSuccessMessage] = useState<string | null>(null);
  const [testPurgeErrorMessage, setTestPurgeErrorMessage] = useState<string | null>(null);
  const [lastTestPurgeStats, setLastTestPurgeStats] = useState<TestStudyPurgeStats | null>(null);

  const handleExecuteTestPurge = async () => {
    if (!isCurrentStudyTest) {
      alert("⚠️ Acción bloqueada: Esta herramienta es exclusiva para demostraciones en 'ESTUDIO DE PRUEBA'.");
      return;
    }
    if (testPurgeConfirmation.trim().toUpperCase() !== 'PURGAR_DEMO') {
      alert('Debes escribir "PURGAR_DEMO" para confirmar el reinicio de datos de demostración.');
      return;
    }

    setIsTestPurging(true);
    setTestPurgeErrorMessage(null);
    setTestPurgeSuccessMessage(null);

    try {
      const stats = await executeTestStudyDataPurge(
        studyId,
        studyData?.name || 'ESTUDIO DE PRUEBA',
        testPurgeTargetCompanyId === 'ALL' ? undefined : testPurgeTargetCompanyId,
        currentUserEmail || undefined,
        currentUserId || undefined
      );
      setLastTestPurgeStats(stats);
      setTestPurgeSuccessMessage(
        `✅ Purga de datos de demostración completada con éxito. Se eliminaron ${stats.totalDeleted} registros en ${stats.purgedCompaniesCount} empresa(s). Las empresas y usuarios se mantienen intactos.`
      );
      setTestPurgeConfirmation('');
      await fetchData();
    } catch (err: any) {
      console.error("Error executing test purge:", err);
      setTestPurgeErrorMessage("Error al ejecutar purga: " + err.message);
    } finally {
      setIsTestPurging(false);
    }
  };

  // In-flight saving guards (Anti-Double Click Protection)
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);

  // Editing states
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // Selected company for accounting dashboard with localStorage persistence
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedCompanyForAccounting, setSelectedCompanyForAccounting] = useState<Company | null>(null);

  // Company form section tabs & controlled state to preserve inputs across tabs
  const [companySection, setCompanySection] = useState<'society' | 'legal' | 'sii' | 'assigned'>('society');
  const [showRepPass, setShowRepPass] = useState(false);
  const [showCompPass, setShowCompPass] = useState(false);
  const [showCertPass, setShowCertPass] = useState(false);

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
    assignedAccountantIds: [] as string[],
    // Credenciales SII y Certificado Digital
    rutRepresentanteSii: '',
    claveRepLegalSii: '',
    claveEmpresaSii: '',
    claveCertificadoDigital: '',
    siiApiProvider: 'DIRECT_SII' as 'DIRECT_SII' | 'SIMPLE_API' | 'OPEN_FACTURA' | 'LIBRE_DTE' | 'CUSTOM_API',
    siiApiKey: '',
    siiApiUrl: '',
    ambiente: 'Producción' as 'Producción' | 'Certificación' | 'SANDBOX',
    certificadoNombre: '',
    certificadoB64: '',
    hasCertificadoDigital: false,
  };
  const [companyFormData, setCompanyFormData] = useState(emptyCompanyFormData);

  const handleUploadCompanyPfx = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const res = ev.target?.result as string;
      if (res) {
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        setCompanyFormData(prev => ({
          ...prev,
          certificadoNombre: file.name,
          certificadoB64: base64,
          hasCertificadoDigital: true,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (editingCompany) {
      const dte = (editingCompany.dteConfig || {}) as Partial<DTEConfig>;
      setCompanyFormData({
        name: editingCompany.name || '',
        fantasyName: editingCompany.fantasyName || '',
        rut: editingCompany.rut || '',
        giro: editingCompany.giro || '',
        address: editingCompany.address || '',
        comuna: editingCompany.comuna || '',
        email: editingCompany.email || '',
        phone: editingCompany.phone || '',
        legalRepName: editingCompany.legalRepName || dte.nombreRepresentante || '',
        legalRepRut: editingCompany.legalRepRut || dte.rutRepresentante || '',
        legalRepEmail: editingCompany.legalRepEmail || '',
        contactName: editingCompany.contactName || '',
        contactPhone: editingCompany.contactPhone || '',
        estado: editingCompany.estado || 'Activo',
        assignedAccountantIds: editingCompany.assignedAccountantIds || [],
        // SII & DTE Credentials
        rutRepresentanteSii: dte.rutRepresentante || editingCompany.legalRepRut || '',
        claveRepLegalSii: dte.claveRepLegalSii || '',
        claveEmpresaSii: dte.claveEmpresaSii || '',
        claveCertificadoDigital: dte.claveCertificadoDigital || '',
        siiApiProvider: (dte.siiApiProvider as any) || 'DIRECT_SII',
        siiApiKey: dte.siiApiKey || '',
        siiApiUrl: dte.siiApiUrl || '',
        ambiente: (dte.ambiente as any) || 'Producción',
        certificadoNombre: dte.certificadoNombre || '',
        certificadoB64: dte.certificadoB64 || '',
        hasCertificadoDigital: !!(dte.hasCertificadoDigital || dte.certificadoB64),
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
      // 1. Fetch study document
      const studySnap = await getDoc(studyRef);
      if (studySnap.exists()) {
        setStudyData({ id: studySnap.id, ...studySnap.data() } as Study);
      }

      const usersSnap = await getDocs(collection(studyRef, 'users'));
      const fetchedUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));
      setUsers(fetchedUsers);

      const companiesSnap = await getDocs(collection(studyRef, 'companies'));
      const fetchedCompanies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
      setCompanies(fetchedCompanies);

      const assignmentsSnap = await getDocs(collection(studyRef, 'assignments'));
      const fetchedAssignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      setAssignments(fetchedAssignments);

      // Find current user object
      const currUserObj = fetchedUsers.find(u =>
        u.id === currentUserId ||
        (currentUserEmail && u.email?.toLowerCase() === currentUserEmail.toLowerCase())
      );
      const activeUserId = currUserObj?.id || currentUserId;
      const activeUserEmail = (currUserObj?.email || currentUserEmail || '').toLowerCase();

      // Restore active company from localStorage if saved
      const savedCompanyId = localStorage.getItem(`activeCompanyId_${studyId}`);
      if (savedCompanyId) {
        const found = fetchedCompanies.find(c => c.id === savedCompanyId);
        if (found) {
          const isAssigned = !isRestrictedWorker || (
            (found.assignedAccountantIds && activeUserId && found.assignedAccountantIds.includes(activeUserId)) ||
            (found.assignedAccountantEmails && activeUserEmail && found.assignedAccountantEmails.some(e => e.toLowerCase() === activeUserEmail)) ||
            fetchedAssignments.some(a => a.companyId === found.id && (a.userId === activeUserId || a.userId === currentUserId))
          );

          if (isRestrictedWorker && !isAssigned) {
            console.warn("Acceso no autorizado a empresa no asignada:", found.name);
            localStorage.removeItem(`activeCompanyId_${studyId}`);
            setSelectedCompanyForAccounting(null);
            onCompanyChange?.(null);
          } else if (!selectedCompanyForAccounting) {
            setSelectedCompanyForAccounting(found);
            onCompanyChange?.(found);
          }
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
    if (comp && isRestrictedWorker) {
      const currUserObj = users.find(u =>
        u.id === currentUserId ||
        (currentUserEmail && u.email?.toLowerCase() === currentUserEmail.toLowerCase())
      );
      const activeUserId = currUserObj?.id || currentUserId;
      const activeUserEmail = (currUserObj?.email || currentUserEmail || '').toLowerCase();

      const isAssigned = (
        (comp.assignedAccountantIds && activeUserId && comp.assignedAccountantIds.includes(activeUserId)) ||
        (comp.assignedAccountantEmails && activeUserEmail && comp.assignedAccountantEmails.some(e => e.toLowerCase() === activeUserEmail)) ||
        assignments.some(a => a.companyId === comp.id && (a.userId === activeUserId || a.userId === currentUserId))
      );

      if (!isAssigned) {
        alert(`🔒 Acceso Denegado: No tienes asignada la empresa "${comp.name}". Solicita al Administrador de tu Estudio que te asigne en la ficha de la empresa.`);
        return;
      }
    }

    setSelectedCompanyForAccounting(comp);
    onCompanyChange?.(comp);
    if (comp) {
      localStorage.setItem(`activeCompanyId_${studyId}`, comp.id);
      if (isObserver) {
        // Load company data for observer dashboard
        (async () => {
          setLoadingObserverData(true);
          try {
            const compRef = doc(db, 'studies', studyId, 'companies', comp.id);
            const [accSnap, vouSnap, rcvSnap, recSnap, fisSnap] = await Promise.all([
              getDocs(collection(compRef, 'chartOfAccounts')),
              getDocs(collection(compRef, 'vouchers')),
              getDocs(collection(compRef, 'rcvDocuments')),
              getDocs(collection(compRef, 'bankReconciliations')),
              getDocs(collection(compRef, 'fiscalYears'))
            ]);
            setObserverAccounts(accSnap.docs.map(d => ({ id: d.id, ...d.data() } as ChartOfAccount)));
            setObserverVouchers(vouSnap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher)));
            setObserverRcvDocs(rcvSnap.docs.map(d => ({ id: d.id, ...d.data() } as RCVDocument)));
            setObserverBankRecs(recSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankReconciliation)));
            setObserverFiscalYears(fisSnap.docs.map(d => ({ id: d.id, ...d.data() } as FiscalPeriodYear)));
          } catch (err) {
            console.error('Error fetching observer data:', err);
          } finally {
            setLoadingObserverData(false);
          }
        })();
      }
    } else {
      localStorage.removeItem(`activeCompanyId_${studyId}`);
    }
  };

  // User CRUD
  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSavingUser) return; // Anti-double click protection

    if (isRestrictedWorker) {
      alert('🔒 Acceso Denegado: Los perfiles Contador y Analista no tienen permisos para administrar usuarios.');
      return;
    }
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

    // Limit check
    const userLimit = studyData?.maxUsers || 5;
    if (!editingUser && users.length >= userLimit) {
      alert(`⚠️ Límite Alcanzado: El estudio ha completado el cupo máximo de ${userLimit} usuarios. Para aumentar el cupo, contacta al Administrador de Sistema.`);
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

    setIsSavingUser(true);
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
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleToggleUserEstado = async (u: User) => {
    if (isRestrictedWorker) {
      alert('🔒 Acceso Denegado: No tienes permisos para modificar el estado de usuarios.');
      return;
    }
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
    if (isRestrictedWorker) {
      alert('🔒 Acceso Denegado: No tienes permisos para eliminar usuarios.');
      return;
    }
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
    if (isSavingCompany) return; // Anti-double click protection

    if (isRestrictedWorker) {
      alert('🔒 Acceso Denegado: Los usuarios con perfil Contador o Analista no tienen permisos para crear ni modificar empresas.');
      return;
    }
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

    const assignedAccountantIds = companyFormData.assignedAccountantIds || [];
    const assignedAccountantEmails = users
      .filter(u => assignedAccountantIds.includes(u.id))
      .map(u => (u.email || '').toLowerCase());

    if (!name || !rut) {
      alert('Por favor completa los campos obligatorios (Razón Social y RUT) en la pestaña "1. Datos de la Sociedad".');
      setCompanySection('society');
      return;
    }

    // Limit check for new companies
    const companyLimit = studyData?.maxCompanies || 10;
    if (!editingCompany && companies.length >= companyLimit) {
      alert(`⚠️ Límite Alcanzado: El estudio ha completado el cupo máximo de ${companyLimit} empresas permitidas. Para ampliar el cupo, contacta al Administrador de Sistema.`);
      return;
    }

    if (!editingCompany && companies.some(c => c.rut === rut || c.name.toLowerCase() === name.toLowerCase())) {
      alert('Ya existe una empresa con este RUT o Razón Social en este estudio.');
      return;
    }

    setIsSavingCompany(true);
    try {
      const existingDteConfig = (editingCompany?.dteConfig || {}) as Partial<DTEConfig>;
      const repRutClean = (companyFormData.rutRepresentanteSii || legalRepRut || rut).trim();
      const repClaveClean = companyFormData.claveRepLegalSii.trim();
      const compClaveClean = companyFormData.claveEmpresaSii.trim();
      const certClaveClean = companyFormData.claveCertificadoDigital.trim();

      const dteConfigPayload: DTEConfig = {
        rutEmisor: rut,
        rutRepresentante: repRutClean,
        nombreRepresentante: legalRepName || companyFormData.legalRepName || '',
        claveRepLegalSii: repClaveClean || existingDteConfig.claveRepLegalSii || '',
        claveEmpresaSii: compClaveClean || existingDteConfig.claveEmpresaSii || '',
        claveCertificadoDigital: certClaveClean || existingDteConfig.claveCertificadoDigital || '',
        claveRepLegalSiiMasked: (repClaveClean || existingDteConfig.claveRepLegalSii) ? '••••••••' : '',
        claveEmpresaSiiMasked: (compClaveClean || existingDteConfig.claveEmpresaSii) ? '••••••••' : '',
        claveSiiMasked: (repClaveClean || existingDteConfig.claveRepLegalSii) ? '••••••••' : '',
        siiApiProvider: companyFormData.siiApiProvider || existingDteConfig.siiApiProvider || 'DIRECT_SII',
        siiApiKey: companyFormData.siiApiKey?.trim() || existingDteConfig.siiApiKey || '',
        siiApiUrl: companyFormData.siiApiUrl?.trim() || existingDteConfig.siiApiUrl || '',
        ambiente: companyFormData.ambiente || existingDteConfig.ambiente || 'Producción',
        hasCertificadoDigital: companyFormData.hasCertificadoDigital || !!companyFormData.certificadoB64 || !!existingDteConfig.hasCertificadoDigital,
        certificadoNombre: companyFormData.certificadoNombre || existingDteConfig.certificadoNombre || '',
        certificadoB64: companyFormData.certificadoB64 || existingDteConfig.certificadoB64 || '',
        defaultCiudadEmisor: comuna || 'Santiago',
        defaultComunaEmisor: comuna || 'Santiago',
        siiConnectionStatus: (repClaveClean || existingDteConfig.claveRepLegalSii || companyFormData.hasCertificadoDigital || existingDteConfig.hasCertificadoDigital) ? 'Conectado' : 'No Configurado',
      };

      const companyPayload = {
        studyId,
        name,
        fantasyName,
        rut,
        giro,
        address,
        comuna,
        ciudad: comuna || 'Santiago',
        email,
        phone,
        legalRepName,
        legalRepRut,
        legalRepEmail,
        contactName,
        contactPhone,
        estado: editingCompany ? (editingCompany.estado || 'Activo') : estado,
        assignedAccountantIds,
        assignedAccountantEmails,
        dteConfig: dteConfigPayload,
        dteModuleEnabled: true,
        updatedAt: new Date()
      };

      let targetCompanyId = editingCompany?.id;

      if (editingCompany) {
        await updateDoc(doc(studyRef, 'companies', editingCompany.id), companyPayload);
        alert('Empresa y asignación de usuarios actualizadas exitosamente.');
        setEditingCompany(null);
      } else {
        const compRef = await addDoc(collection(studyRef, 'companies'), {
          ...companyPayload,
          createdAt: new Date()
        });
        targetCompanyId = compRef.id;
        alert('Empresa registrada exitosamente.');
      }

      // Synchronize with 'assignments' collection
      if (targetCompanyId) {
        const currentCompanyAssignments = assignments.filter(a => a.companyId === targetCompanyId);
        const currentAssignedUserIds = currentCompanyAssignments.map(a => a.userId);

        // Add missing assignments
        for (const uid of assignedAccountantIds) {
          if (!currentAssignedUserIds.includes(uid)) {
            await addDoc(collection(studyRef, 'assignments'), {
              studyId,
              userId: uid,
              companyId: targetCompanyId,
              createdAt: new Date()
            });
          }
        }

        // Delete unselected assignments
        for (const assignObj of currentCompanyAssignments) {
          if (!assignedAccountantIds.includes(assignObj.userId)) {
            await deleteDoc(doc(studyRef, 'assignments', assignObj.id));
          }
        }
      }

      setCompanyFormData(emptyCompanyFormData);
      setCompanySection('society');
      await fetchData();
    } catch (err: any) {
      console.error("Error saving company:", err);
      alert('Error al guardar empresa: ' + (err.message || err));
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleToggleCompanyEstado = async (c: Company) => {
    if (isRestrictedWorker) {
      alert('🔒 Acceso Denegado: No tienes permisos para cambiar el estado de la empresa.');
      return;
    }
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
    if (isRestrictedWorker) {
      alert('🔒 Acceso Denegado: No tienes permisos para eliminar empresas.');
      return;
    }
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
    if (isRestrictedWorker) {
      alert('🔒 Acceso Denegado: No tienes permisos para crear ni modificar asignaciones.');
      return;
    }
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
        if (editingAssignment.companyId !== companyId) {
          const oldComp = companies.find(c => c.id === editingAssignment.companyId);
          if (oldComp) {
            const updatedOldIds = (oldComp.assignedAccountantIds || []).filter(uid => uid !== editingAssignment.userId);
            const userObj = users.find(u => u.id === editingAssignment.userId);
            const updatedOldEmails = userObj
              ? (oldComp.assignedAccountantEmails || []).filter(em => em.toLowerCase() !== userObj.email.toLowerCase())
              : oldComp.assignedAccountantEmails || [];
            await updateDoc(doc(studyRef, 'companies', oldComp.id), {
              assignedAccountantIds: updatedOldIds,
              assignedAccountantEmails: updatedOldEmails
            });
          }
        }
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

      // Sync company doc
      const targetComp = companies.find(c => c.id === companyId);
      const targetUser = users.find(u => u.id === userId);
      if (targetComp && targetUser) {
        const currentIds = targetComp.assignedAccountantIds || [];
        const currentEmails = targetComp.assignedAccountantEmails || [];
        if (!currentIds.includes(userId)) {
          const updatedIds = [...currentIds, userId];
          const updatedEmails = Array.from(new Set([...currentEmails, targetUser.email.toLowerCase()]));
          await updateDoc(doc(studyRef, 'companies', companyId), {
            assignedAccountantIds: updatedIds,
            assignedAccountantEmails: updatedEmails
          });
        }
      }

      e.currentTarget.reset();
      await fetchData();
    } catch (err: any) {
      console.error("Error saving assignment:", err);
      alert('Error al guardar asignación: ' + (err.message || err));
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    const targetAssign = assignments.find(a => a.id === id);
    if (window.confirm('¿Eliminar esta asignación?')) {
      try {
        await deleteDoc(doc(studyRef, 'assignments', id));
        if (targetAssign) {
          const targetComp = companies.find(c => c.id === targetAssign.companyId);
          if (targetComp) {
            const updatedIds = (targetComp.assignedAccountantIds || []).filter(uid => uid !== targetAssign.userId);
            const targetUser = users.find(u => u.id === targetAssign.userId);
            const updatedEmails = targetUser
              ? (targetComp.assignedAccountantEmails || []).filter(em => em.toLowerCase() !== targetUser.email.toLowerCase())
              : targetComp.assignedAccountantEmails || [];
            await updateDoc(doc(studyRef, 'companies', targetComp.id), {
              assignedAccountantIds: updatedIds,
              assignedAccountantEmails: updatedEmails
            });
          }
        }
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


  // Calculate visible companies based on role and assignments (Contador & Analista are restricted to assigned companies)
  const currentUserObj = users.find(u =>
    u.id === currentUserId ||
    (currentUserEmail && u.email?.toLowerCase() === currentUserEmail.toLowerCase())
  );
  const actualUserId = currentUserObj?.id || currentUserId;
  const actualUserEmail = (currentUserObj?.email || currentUserEmail || '').toLowerCase();

  const visibleCompanies = isRestrictedWorker
    ? companies.filter(c => {
        const hasDirectId = Boolean(c.assignedAccountantIds && actualUserId && c.assignedAccountantIds.includes(actualUserId));
        const hasDirectEmail = Boolean(c.assignedAccountantEmails && actualUserEmail && c.assignedAccountantEmails.some(e => e.toLowerCase() === actualUserEmail));
        const hasCollectionAssignment = assignments.some(a =>
          a.companyId === c.id && (a.userId === actualUserId || a.userId === currentUserId)
        );
        return hasDirectId || hasDirectEmail || hasCollectionAssignment;
      })
    : companies;

  if (selectedCompanyForAccounting) {
    const isCompanyAssigned = !isRestrictedWorker || visibleCompanies.some(c => c.id === selectedCompanyForAccounting.id);

    if (!isCompanyAssigned) {
      return (
        <div className="p-8 max-w-lg mx-auto bg-white border border-rose-200 rounded-2xl shadow-lg text-center space-y-4 my-8">
          <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 stroke-[1.75]" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Acceso Restringido por Seguridad</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            No tienes asignada la empresa <strong>{selectedCompanyForAccounting.name}</strong> (RUT: {selectedCompanyForAccounting.rut}).
          </p>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1 text-left">
            <p className="font-semibold text-slate-700">🔒 Control de Acceso del Estudio:</p>
            <p>
              Como {isAnalyst ? 'Analista' : 'Contador'}, únicamente puedes ingresar a las empresas clientes que el Administrador de tu Estudio te haya asignado en la ficha de la empresa.
            </p>
          </div>
          <button
            onClick={() => handleSelectCompany(null)}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow transition-colors"
          >
            &larr; Volver a Mis Empresas Asignadas
          </button>
        </div>
      );
    }

    if (isObserver) {
      if (loadingObserverData) {
        return (
          <div className="p-12 text-center text-slate-500 text-sm flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span>Cargando panel ejecutivo y de gestión para {selectedCompanyForAccounting.name}...</span>
          </div>
        );
      }

      return (
        <ClientExecutiveManagementView
          studyId={studyId}
          company={selectedCompanyForAccounting}
          accounts={observerAccounts}
          vouchers={observerVouchers}
          rcvDocuments={observerRcvDocs}
          bankReconciliations={observerBankRecs}
          fiscalYears={observerFiscalYears}
          auxiliaries={[]}
          onBack={() => handleSelectCompany(null)}
        />
      );
    }

    return (
      <CompanyAccountingDashboard
        studyId={studyId}
        company={selectedCompanyForAccounting}
        currentUserRole={currentUserRole}
        onBack={() => handleSelectCompany(null)}
      />
    );
  }

  const tabs: { id: 'users' | 'companies' | 'assignments'; label: string }[] = [
    { id: 'companies', label: 'Empresas Clientes' },
    { id: 'users', label: 'Gestión de Usuarios' },
    { id: 'assignments', label: 'Asignaciones' },
  ];

  return (
    <div className="space-y-6">
      {/* Banner de Modo Soporte / SuperAdmin */}
      {isSupportMode && (
        <div className="bg-purple-900 text-white px-4 py-2.5 rounded-xl shadow flex items-center justify-between font-medium text-xs border border-purple-700">
          <div className="flex items-center gap-2">
            <span className="bg-purple-700 text-purple-100 font-bold px-2 py-0.5 rounded text-[10px]">AUDITORÍA GLOBAL (SUPER ADMIN)</span>
            <span>Estás explorando este estudio en modo <strong>Super Administrador (Solo Lectura)</strong>.</span>
          </div>
          {onExitSupportMode && (
            <button
              onClick={onExitSupportMode}
              className="bg-white text-purple-950 hover:bg-purple-50 px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
              &larr; Volver al Panel Global
            </button>
          )}
        </div>
      )}

      {/* Header del Estudio con Formato Moderno Pulso Contable / Gest_OK */}
      <div className="bg-white text-[#0D253D] p-5 sm:p-6 rounded-2xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-slate-200/80">
        <div className="flex items-center gap-3.5">
          {/* Logo Oficial Pulso Contable / Gest_OK */}
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#533AFD] to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
            <Activity className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-lg text-[#0D253D] tracking-tight">
                Pulso Contable
              </span>
              <span className="text-[10px] font-mono font-bold bg-indigo-50 text-[#533AFD] px-2 py-0.5 rounded-full border border-indigo-100">
                Gest_OK
              </span>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider ${
                isAnalyst ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                isObserver ? 'bg-sky-50 text-sky-800 border border-sky-200' :
                isAccountant ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                isSuperUser ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                'bg-indigo-50 text-indigo-800 border border-indigo-200'
              }`}>
                {isAnalyst ? 'Analista' : isObserver ? 'Cliente Observador' : isAccountant ? 'Contador' : isSuperUser ? 'Super Admin (Lectura)' : 'Administración Estudio'}
              </span>
            </div>
            <h2 className="text-sm font-bold text-[#425466] mt-0.5">
              {isRestrictedWorker ? 'Mis Empresas Asignadas' : 'Panel de Gestión y Operación Contable'}
            </h2>
            <p className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-1.5">
              <span>Estudio ID:</span>
              <span className="font-mono bg-slate-50 px-2 py-0.5 rounded-md text-slate-700 border border-slate-200 font-semibold">{studyId}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="bg-[#F8FAFC] p-2.5 rounded-xl border border-slate-200/80 flex items-center gap-3 flex-1 sm:flex-initial">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                {isRestrictedWorker ? 'Ingresar a Empresa' : 'Selector de Empresa Activa'}
              </label>
              <select
                onChange={(e) => {
                  const found = visibleCompanies.find(c => c.id === e.target.value);
                  if (found) handleSelectCompany(found);
                }}
                value={selectedCompanyForAccounting?.id || ''}
                className="bg-white text-slate-900 text-xs p-2 rounded-lg font-semibold w-full sm:w-64 border border-slate-200 shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="" disabled>Seleccione empresa cliente...</option>
                {visibleCompanies.map(c => (
                  <option key={c.id} value={c.id}>{c.name} (RUT: {c.rut})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUserEmail && (
              <button
                type="button"
                onClick={() => setShowChangePassModal(true)}
                className="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/80 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Cambiar contraseña de acceso"
              >
                <Key className="w-3.5 h-3.5 text-amber-500" />
                <span>Clave</span>
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Cerrar sesión segura"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>Salir</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showChangePassModal && currentUserEmail && (
        <ChangePasswordModal
          userEmail={currentUserEmail}
          onClose={() => setShowChangePassModal(false)}
        />
      )}

      {/* Si es contador o analista, mostrar únicamente sus empresas asignadas */}
      {isRestrictedWorker ? (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-extrabold text-[#0D253D]">
              Empresas asignadas a tu cuenta ({visibleCompanies.length})
            </h3>
            <p className="text-xs text-[#64748D] mt-0.5">
              Selecciona la empresa con la que deseas trabajar para abrir los libros, F29 y conciliación.
            </p>
          </div>

          {visibleCompanies.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-sm font-semibold text-slate-700">No tienes empresas asignadas actualmente.</p>
              <p className="text-xs text-slate-500 mt-1">Por favor comunícate con el administrador de tu estudio para que asigne las empresas clientes a tu usuario.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleCompanies.map(c => (
                <div key={c.id} className="p-5 border border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-md rounded-2xl space-y-4 transition-all shadow-xs flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#533AFD] flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-100">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${c.estado === 'Inactivo' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                        {c.estado || 'Activo'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-[#0D253D] text-sm leading-snug">{c.name}</h4>
                      <p className="text-xs font-mono font-medium text-[#533AFD] mt-0.5">RUT: {c.rut}</p>
                      {c.fantasyName && <p className="text-xs text-[#64748D] mt-0.5">Fantasía: {c.fantasyName}</p>}
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectCompany(c)}
                    className="w-full py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 cursor-pointer transform hover:-translate-y-0.5"
                  >
                    <span>Abrir Contabilidad</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs inline-flex flex-wrap gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#533AFD] text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'users' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                <h3 className="text-lg font-medium text-slate-900 mb-4">
                  {editingUser ? 'Modificar Usuario del Estudio' : 'Registrar Nuevo Usuario del Estudio'}
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Rol / Perfil</label>
                    <select name="role" defaultValue={editingUser?.role || UserRole.ACCOUNTANT} required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      <option value={UserRole.ACCOUNTANT}>Contador (Operación Contable y Tributaria)</option>
                      <option value={UserRole.ANALYST}>Analista (Operación Contable sin Indicadores/KPIs)</option>
                      <option value={UserRole.OBSERVER}>Cliente Final / Observador (KPIs, CxC, CxP, Gastos, Ventas y Conciliación Bancaria)</option>
                      <option value={UserRole.STUDY_ADMIN}>Administrador de Estudio (Gestión Completa)</option>
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
                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                              u.role === UserRole.ANALYST ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              u.role === UserRole.OBSERVER ? 'bg-sky-100 text-sky-800 border border-sky-300' :
                              u.role === UserRole.STUDY_ADMIN ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                              'bg-indigo-100 text-indigo-700 border border-indigo-300'
                            }`}>
                              {u.role === UserRole.ANALYST ? 'Analista' : u.role === UserRole.OBSERVER ? 'Observador' : u.role === UserRole.STUDY_ADMIN ? 'Admin Estudio' : 'Contador'}
                            </span>
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
                <div className="flex border-b border-slate-200 mb-6 gap-2 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setCompanySection('society')}
                    className={`py-2 px-3 font-medium text-xs border-b-2 flex items-center gap-1.5 whitespace-nowrap ${companySection === 'society' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <span>1. Datos Sociedad</span>
                    {companyFormData.name && companyFormData.rut && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Datos obligatorios completos"></span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompanySection('legal')}
                    className={`py-2 px-3 font-medium text-xs border-b-2 flex items-center gap-1.5 whitespace-nowrap ${companySection === 'legal' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <span>2. Rep. Legal & Contacto</span>
                    {companyFormData.legalRepName && (
                      <span className="w-2 h-2 rounded-full bg-indigo-400" title="Datos ingresados"></span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompanySection('sii')}
                    className={`py-2 px-3 font-medium text-xs border-b-2 flex items-center gap-1.5 whitespace-nowrap ${companySection === 'sii' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>3. Credenciales SII & Certificado</span>
                    {(companyFormData.claveRepLegalSii || companyFormData.hasCertificadoDigital) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Credenciales SII configuradas"></span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompanySection('assigned')}
                    className={`py-2 px-3 font-medium text-xs border-b-2 flex items-center gap-1.5 whitespace-nowrap ${companySection === 'assigned' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <span>4. Personal Asignado</span>
                    {companyFormData.assignedAccountantIds && companyFormData.assignedAccountantIds.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600" title="Contadores asignados"></span>
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
                          <label className="block text-sm font-medium text-slate-700 mb-1">RUT Sociedad *</label>
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
                          Siguiente: Rep. Legal & Contacto &rarr;
                        </button>
                      </div>
                    </div>
                  )}

                  {companySection === 'legal' && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">1. Representante Legal</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Nombre Completo Rep. Legal</label>
                            <input
                              name="legalRepName"
                              value={companyFormData.legalRepName}
                              onChange={(e) => setCompanyFormData(prev => ({ ...prev, legalRepName: e.target.value }))}
                              placeholder="Ej. María González"
                              className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">RUT Rep. Legal</label>
                              <input
                                name="legalRepRut"
                                value={companyFormData.legalRepRut}
                                onChange={(e) => setCompanyFormData(prev => ({ ...prev, legalRepRut: e.target.value, rutRepresentanteSii: prev.rutRepresentanteSii || e.target.value }))}
                                placeholder="Ej. 12.345.678-9"
                                className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Email Rep. Legal</label>
                              <input
                                type="email"
                                name="legalRepEmail"
                                value={companyFormData.legalRepEmail}
                                onChange={(e) => setCompanyFormData(prev => ({ ...prev, legalRepEmail: e.target.value }))}
                                placeholder="mgonzalez@empresa.cl"
                                className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">2. Contacto Operativo</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Persona de Contacto</label>
                            <input
                              name="contactName"
                              value={companyFormData.contactName}
                              onChange={(e) => setCompanyFormData(prev => ({ ...prev, contactName: e.target.value }))}
                              placeholder="Ej. Carlos Soto"
                              className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono Contacto</label>
                            <input
                              name="contactPhone"
                              value={companyFormData.contactPhone}
                              onChange={(e) => setCompanyFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                              placeholder="+56987654321"
                              className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setCompanySection('society')}
                          className="border border-slate-300 text-slate-700 font-medium px-5 py-2 rounded-lg hover:bg-slate-50 transition-colors text-xs"
                        >
                          &larr; Anterior
                        </button>
                        <div className="flex items-center gap-3">
                          <button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded-lg transition-colors shadow-xs text-xs"
                          >
                            {editingCompany ? '💾 Guardar Cambios' : '💾 Guardar Empresa'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompanySection('sii')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2 rounded-lg transition-colors text-xs flex items-center gap-1.5"
                          >
                            <span>Siguiente: Credenciales SII</span>
                            <Key className="w-3.5 h-3.5" />
                            <span>&rarr;</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {companySection === 'sii' && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 flex items-start gap-3">
                        <div className="p-2 bg-amber-500 text-white rounded-lg shrink-0 mt-0.5 shadow-xs">
                          <Key className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-amber-950">Acceso Oficial al SII y Facturación DTE</h4>
                          <p className="text-xs text-amber-800 leading-relaxed mt-0.5">
                            Ingresa las credenciales tributarias del Representante Legal o de la Empresa y el Certificado Digital para sincronizar compras/ventas (RCV), consultar folios y emitir documentos tributarios electrónicos en vivo.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 shadow-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              RUT Representante Legal (SII) *
                            </label>
                            <input
                              type="text"
                              value={companyFormData.rutRepresentanteSii || companyFormData.legalRepRut}
                              onChange={(e) => setCompanyFormData(prev => ({ ...prev, rutRepresentanteSii: e.target.value }))}
                              placeholder="Ej. 12.345.678-9"
                              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">RUT personal del titular o apoderado ante el SII.</p>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-bold text-slate-700">
                                Clave Tributaria SII Rep. Legal *
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowRepPass(!showRepPass)}
                                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                              >
                                {showRepPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>{showRepPass ? 'Ocultar' : 'Mostrar'}</span>
                              </button>
                            </div>
                            <div className="relative">
                              <input
                                type={showRepPass ? 'text' : 'password'}
                                value={companyFormData.claveRepLegalSii}
                                onChange={(e) => setCompanyFormData(prev => ({ ...prev, claveRepLegalSii: e.target.value }))}
                                placeholder="Clave secreta SII (sii.cl)"
                                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                              />
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">Clave de acceso al portal del SII para consulta de RCV y DTE.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-bold text-slate-700">
                                Clave SII Empresa / Sociedad (Opcional)
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowCompPass(!showCompPass)}
                                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                              >
                                {showCompPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>{showCompPass ? 'Ocultar' : 'Mostrar'}</span>
                              </button>
                            </div>
                            <input
                              type={showCompPass ? 'text' : 'password'}
                              value={companyFormData.claveEmpresaSii}
                              onChange={(e) => setCompanyFormData(prev => ({ ...prev, claveEmpresaSii: e.target.value }))}
                              placeholder="Clave tributaria del RUT empresa"
                              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Para sociedades que cuenten con clave directa ante el SII.</p>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Ambiente de Operación SII
                            </label>
                            <select
                              value={companyFormData.ambiente}
                              onChange={(e) => setCompanyFormData(prev => ({ ...prev, ambiente: e.target.value as any }))}
                              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                            >
                              <option value="Producción">⚡ Producción Oficial (Emisión Real SII)</option>
                              <option value="Certificación">🧪 Certificación / Pruebas (Sandbox SII)</option>
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1">Selecciona Producción para sincronización real de libros y DTE.</p>
                          </div>
                        </div>
                      </div>

                      {/* Certificado Digital Section */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                              Certificado Digital de Firma Electrónica (.pfx / .p12)
                            </h4>
                          </div>
                          {companyFormData.hasCertificadoDigital ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Certificado Cargado
                            </span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
                              Sin Certificado
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Cargar Archivo .PFX o .P12
                            </label>
                            <input
                              type="file"
                              accept=".pfx,.p12"
                              onChange={handleUploadCompanyPfx}
                              className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-slate-200 bg-white rounded-lg p-1.5"
                            />
                            {companyFormData.certificadoNombre && (
                              <p className="text-[11px] text-indigo-700 font-mono mt-1 font-medium truncate">
                                📄 {companyFormData.certificadoNombre}
                              </p>
                            )}
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-medium text-slate-700">
                                Clave del Certificado Digital
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowCertPass(!showCertPass)}
                                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                              >
                                {showCertPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>{showCertPass ? 'Ocultar' : 'Mostrar'}</span>
                              </button>
                            </div>
                            <input
                              type={showCertPass ? 'text' : 'password'}
                              value={companyFormData.claveCertificadoDigital}
                              onChange={(e) => setCompanyFormData(prev => ({ ...prev, claveCertificadoDigital: e.target.value }))}
                              placeholder="Clave de la firma digital"
                              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setCompanySection('legal')}
                          className="border border-slate-300 text-slate-700 font-medium px-5 py-2 rounded-lg hover:bg-slate-50 transition-colors text-xs"
                        >
                          &larr; Anterior
                        </button>
                        <div className="flex items-center gap-3">
                          <button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded-lg transition-colors shadow-xs text-xs"
                          >
                            {editingCompany ? '💾 Guardar Cambios' : '💾 Guardar Empresa'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompanySection('assigned')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2 rounded-lg transition-colors text-xs"
                          >
                            Siguiente: Personal Asignado &rarr;
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {companySection === 'assigned' && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-indigo-600" />
                          <h4 className="text-sm font-bold text-slate-900">
                            Contadores y Analistas Asignados a esta Empresa
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500">
                          Selecciona los usuarios del estudio que tendrán autorización para visualizar y operar la contabilidad de <strong>{companyFormData.name || 'esta empresa'}</strong>.
                        </p>

                        {users.filter(u => u.role === UserRole.ACCOUNTANT || u.role === UserRole.ANALYST).length === 0 ? (
                          <div className="p-4 text-center bg-white rounded-lg border border-slate-200 text-xs text-slate-500 italic">
                            No hay usuarios con perfil Contador o Analista registrados en este estudio. Puedes crearlos en la pestaña "Gestión de Usuarios".
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto bg-white p-3 rounded-lg border border-slate-200">
                            {users.filter(u => u.role === UserRole.ACCOUNTANT || u.role === UserRole.ANALYST).map(u => {
                              const isChecked = (companyFormData.assignedAccountantIds || []).includes(u.id);
                              return (
                                <label key={u.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setCompanyFormData(prev => {
                                          const current = prev.assignedAccountantIds || [];
                                          const updated = checked
                                            ? [...current, u.id]
                                            : current.filter(id => id !== u.id);
                                          return { ...prev, assignedAccountantIds: updated };
                                        });
                                      }}
                                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <div>
                                      <p className="text-xs font-bold text-slate-900">{u.name}</p>
                                      <p className="text-[11px] text-slate-500">{u.email}</p>
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${u.role === UserRole.ANALYST ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-indigo-100 text-indigo-800 border border-indigo-200'}`}>
                                    {u.role === UserRole.ANALYST ? 'Analista' : 'Contador'}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setCompanySection('sii')}
                          className="border border-slate-300 text-slate-700 font-medium px-6 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-xs"
                        >
                          &larr; Anterior
                        </button>
                        <button
                          type="submit"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 text-xs"
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
                    {companies.map(c => {
                      const hasSiiConfig = !!(c.dteConfig?.claveRepLegalSii || c.dteConfig?.hasCertificadoDigital || c.dteConfig?.siiConnectionStatus === 'Conectado');
                      return (
                        <div key={c.id} className="p-3 border border-slate-200 bg-slate-50 rounded-lg space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900">{c.name}</p>
                              <p className="text-xs font-mono text-slate-600">RUT: {c.rut}</p>
                              {c.fantasyName && <p className="text-xs text-slate-500">Fantasía: {c.fantasyName}</p>}
                              <div className="mt-1.5 text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200">
                                <span className="font-semibold text-slate-700">Personal Asignado: </span>
                                {c.assignedAccountantIds && c.assignedAccountantIds.length > 0 ? (
                                  <span className="text-indigo-700 font-bold">
                                    {users.filter(u => c.assignedAccountantIds?.includes(u.id)).map(u => u.name).join(', ') || `${c.assignedAccountantIds.length} usuario(s)`}
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-medium italic">Sin contadores asignados</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-medium ${c.estado === 'Inactivo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {c.estado || 'Activo'}
                                </span>
                                {hasSiiConfig ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <Key className="w-3 h-3 text-emerald-600" /> SII Conectado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-800 border border-amber-300">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" /> SII Sin Claves
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 pt-2 border-t border-slate-200 text-xs font-medium">
                            <button onClick={() => handleSelectCompany(c)} className="text-emerald-600 hover:text-emerald-800 font-bold">
                              Contabilidad
                            </button>
                            <button 
                              onClick={() => { setEditingCompany(c); setCompanySection('sii'); }} 
                              className="text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1"
                              title="Configurar credenciales del SII y certificado digital"
                            >
                              <Key className="w-3 h-3" /> Credenciales SII
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
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                <h3 className="text-lg font-medium text-slate-900 mb-4">
                  {editingAssignment ? 'Modificar Asignación' : 'Asignar Empresa a Contador / Analista'}
                </h3>
                <form onSubmit={handleSaveAssignment} key={editingAssignment?.id || 'new-assignment'} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contador / Analista</label>
                    <select name="userId" defaultValue={editingAssignment?.userId || ''} required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      <option value="">Seleccionar contador o analista...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role === UserRole.ANALYST ? 'Analista' : u.role === UserRole.STUDY_ADMIN ? 'Admin' : 'Contador'}) - {u.email}
                        </option>
                      ))}
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
                            <p className="text-sm text-slate-500">
                              Usuario: {assignedUser?.name || 'Desconocido'} ({assignedUser?.role === UserRole.ANALYST ? 'Analista' : 'Contador'})
                            </p>
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
      )}
    </div>
  );
}
