/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProcessProvider } from './context/ProcessContext';
import GlobalProcessIndicator from './components/GlobalProcessIndicator';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import CreateStudy from './components/CreateStudy';
import React, { useEffect, useState } from 'react';
import { doc, collection, collectionGroup, onSnapshot, deleteDoc, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db, auth } from './lib/firebase';
import { signOut } from 'firebase/auth';
import { Study, UserRole, Company } from './types';
import PlanManager from './components/PlanManager';
import StudyDetails from './components/StudyDetails';
import StudyAdminDashboard from './components/StudyAdminDashboard';
import SuperUsersManager from './components/SuperUsersManager';
import AuditLogsViewer from './components/AuditLogsViewer';
import ExecutiveHeader from './components/ExecutiveHeader';
import IndicadoresEconomicosView from './components/IndicadoresEconomicosView';
import PresentationView from './components/PresentationView';
import MarketingPromoManager from './components/MarketingPromoManager';
import SuperAdminSystemMonitor from './components/SuperAdminSystemMonitor';
import { logAuditEvent } from './utils/auditLogger';
import { APP_VERSION } from './constants/version';
import { Building2, PlusCircle, CreditCard, ShieldCheck, Users, ShieldAlert, History, Sparkles, LogOut, Megaphone, Activity } from 'lucide-react';

function Dashboard() {
  const { currentUser } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [superAdminTab, setSuperAdminTab] = useState<'monitor' | 'studies' | 'create_study' | 'plans' | 'super_users' | 'marketing_promo' | 'audit_logs' | 'presentation'>('monitor');
  const [role, setRole] = useState<UserRole | null>(null);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [showGlobalIndicatorsModal, setShowGlobalIndicatorsModal] = useState(false);

  const handleLogout = async () => {
    try {
      if (currentUser) {
        logAuditEvent({
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          userRole: role || 'USUARIO',
          action: 'LOGOUT',
          module: 'AUTENTICACION',
          details: `Cierre de sesión de usuario ${currentUser.email}`
        });
      }
      sessionStorage.removeItem('gestok_login_logged');
      await signOut(auth);
    } catch (e) {
      console.error("Error signing out:", e);
    }
  };

  const fetchUserDataAndRole = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      console.log("Fetching data for:", currentUser.email);
      const userEmail = currentUser.email?.toLowerCase();

      // 1. Root Super Admin Global Bootstrap (rcampos@pulsocontable.cl)
      if (userEmail === 'rcampos@pulsocontable.cl') {
        console.log("User is root bootstrap Super Admin Global:", userEmail);
        setRole(UserRole.SUPER_USER);
        setUserData({ email: userEmail, name: 'Ramón Campos (Pulso Contable)', isSuperUser: true });
        return;
      }

      // 2. Check StudyAdmin (in studies collection or administrators array)
      const studiesSnap = await getDocs(collection(db, 'studies'));
      let foundStudyAdmin = false;

      for (const sDoc of studiesSnap.docs) {
        const sData = sDoc.data();
        const studyStatus = sData.estado || 'Vigente';

        // A. Check in administrators array
        if (sData.administrators && Array.isArray(sData.administrators)) {
          const matchAdmin = sData.administrators.find(
            (a: any) => a.email?.toLowerCase() === userEmail
          );
          if (matchAdmin) {
            if (studyStatus === 'Sin Vigencia') {
              throw new Error('El estudio contable asignado se encuentra sin vigencia.');
            }
            if (matchAdmin.estado === 'Sin Vigencia') {
              throw new Error('Tu usuario administrador se encuentra sin vigencia.');
            }
            setUserData({ ...sData, id: sDoc.id, studyId: sDoc.id, currentAdmin: matchAdmin });
            setRole(UserRole.STUDY_ADMIN);
            foundStudyAdmin = true;
            break;
          }
        }

        // B. Check root level legacy/primary admin fields
        const rootAdminEmail = (sData.adminEmail || sData.email || '').toLowerCase();
        if (!foundStudyAdmin && (rootAdminEmail === userEmail || (sData.adminId === currentUser.uid && rootAdminEmail === userEmail))) {
          if (studyStatus === 'Sin Vigencia') {
            throw new Error('El estudio contable asignado se encuentra sin vigencia.');
          }
          if (sData.adminEstado === 'Sin Vigencia') {
            throw new Error('Tu usuario administrador se encuentra sin vigencia.');
          }
          setUserData({ ...sData, id: sDoc.id, studyId: sDoc.id });
          setRole(UserRole.STUDY_ADMIN);
          foundStudyAdmin = true;
          break;
        }
      }

      if (foundStudyAdmin) return;

      // 3. Check Accountant / Analyst (in studies/{id}/users)
      try {
        const qUser = query(collectionGroup(db, 'users'), where('email', '==', userEmail));
        const snapUser = await getDocs(qUser);
        if (!snapUser.empty) {
          const uDoc = snapUser.docs[0];
          const uData = uDoc.data();
          if (uData.estado === 'Inactivo' || uData.estado === 'Sin Vigencia') {
            throw new Error('Tu usuario se encuentra inactivo o sin vigencia.');
          }
          setUserData({ ...uData, id: uDoc.id, studyId: uData.studyId });
          const userRole = uData.role === UserRole.ANALYST ? UserRole.ANALYST : (uData.role || UserRole.ACCOUNTANT);
          setRole(userRole);
          return;
        }
      } catch (cgErr: any) {
        console.warn("CollectionGroup query error, fallback to nested search:", cgErr);
        for (const sDoc of studiesSnap.docs) {
          const uSnap = await getDocs(query(collection(db, 'studies', sDoc.id, 'users'), where('email', '==', userEmail)));
          if (!uSnap.empty) {
            const uDoc = uSnap.docs[0];
            const uData = uDoc.data();
            if (uData.estado === 'Inactivo' || uData.estado === 'Sin Vigencia') {
              throw new Error('Tu usuario se encuentra inactivo o sin vigencia.');
            }
            setUserData({ ...uData, id: uDoc.id, studyId: sDoc.id });
            const userRole = uData.role === UserRole.ANALYST ? UserRole.ANALYST : (uData.role || UserRole.ACCOUNTANT);
            setRole(userRole);
            return;
          }
        }
      }

      // 4. Check Explicit SuperUser in Firestore 'superUsers' collection (excluding study admins)
      try {
        const qSuper = query(collection(db, 'superUsers'), where('email', '==', userEmail));
        const snapSuper = await getDocs(qSuper);
        if (!snapSuper.empty) {
          // Safeguard: Study admins / regular users must NEVER be granted SUPER_USER
          if (foundStudyAdmin || userEmail === 'campos.ramon@gmail.com') {
            console.warn("Blocking study admin from superuser collection promotion:", userEmail);
            for (const superDoc of snapSuper.docs) {
              await deleteDoc(doc(db, 'superUsers', superDoc.id));
            }
            return;
          }

          const superDoc = snapSuper.docs[0];
          const superData = superDoc.data();
          if (superData.estado === 'Inactivo' || superData.estado === 'Sin Vigencia') {
            throw new Error('Tu cuenta de Super Administrador se encuentra inactiva o bloqueada.');
          }
          console.log("User is superuser (DB verified):", userEmail);
          setRole(UserRole.SUPER_USER);
          setUserData({ ...superData, id: superDoc.id, isSuperUser: true });
          return;
        }
      } catch (superErr: any) {
        if (superErr.message?.includes('inactiva') || superErr.message?.includes('bloqueada')) throw superErr;
        console.warn("Error querying superUsers collection:", superErr);
      }
    } catch (err: any) {
      console.error("Error loading user data in Dashboard:", err);
      setErrorMsg(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserDataAndRole();
    
    // Subscribe to studies (only for superuser)
    let unsubscribe = () => {};
    if (role === UserRole.SUPER_USER || currentUser?.email === 'rcampos@pulsocontable.cl') {
      try {
        unsubscribe = onSnapshot(collection(db, 'studies'), (snapshot) => {
          const studiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Study));
          setStudies(studiesData);
        }, (err) => {
          console.error("Error subscribing to studies:", err);
        });
      } catch (e) {
        console.error("Studies subscription error:", e);
      }
    }
    return () => unsubscribe();
  }, [currentUser?.email, role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-slate-700">Cargando datos contables y verificando perfil...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900">Error de Autenticación o Acceso</h3>
          <p className="text-xs text-slate-500">{errorMsg}</p>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={fetchUserDataAndRole}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Reintentar
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Routing based on role
  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-md w-full text-center space-y-4">
          <h3 className="text-base font-bold text-slate-900">Acceso no configurado</h3>
          <p className="text-xs text-slate-500">
            Tu usuario ({currentUser?.email}) no tiene un rol o estudio asignado actualmente.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={fetchUserDataAndRole}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Verificar Nuevamente
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleDeleteStudy = async (studyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('¿Seguro que deseas eliminar este estudio contable y todos sus datos asociados?')) {
      await deleteDoc(doc(db, 'studies', studyId));
      if (selectedStudy?.id === studyId) setSelectedStudy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900">
      {/* Encabezado Principal Persistente (Executive Header) */}
      <ExecutiveHeader
        currentUserEmail={currentUser?.email}
        currentUserRole={role}
        activeCompany={activeCompany}
        activeStudy={selectedStudy || (role === UserRole.STUDY_ADMIN ? userData : null)}
        onLogout={handleLogout}
        onGoHome={() => {
          setActiveCompany(null);
          setSelectedStudy(null);
        }}
        onOpenHistoricalRates={() => setShowGlobalIndicatorsModal(true)}
      />
      
      <main className="flex-1 p-3 md:p-5 w-full">
        {role === UserRole.SUPER_USER ? (
          selectedStudy ? (
            <StudyDetails
              study={selectedStudy}
              onBack={() => setSelectedStudy(null)}
              onLogout={handleLogout}
            />
          ) : (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* SUPER ADMIN NAVIGATION TABS */}
            <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSuperAdminTab('monitor')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    superAdminTab === 'monitor'
                      ? 'bg-slate-950 text-white shadow-sm ring-2 ring-indigo-500/20'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>Monitor en Vivo & Estadísticas 📊</span>
                </button>

                <button
                  onClick={() => setSuperAdminTab('studies')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    superAdminTab === 'studies'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Estudios Registrados ({studies.length})</span>
                </button>

                <button
                  onClick={() => setSuperAdminTab('create_study')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    superAdminTab === 'create_study'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Crear Nuevo Estudio</span>
                </button>

                <button
                  onClick={() => setSuperAdminTab('super_users')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    superAdminTab === 'super_users'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Super Administradores (RBAC)</span>
                </button>

                <button
                  onClick={() => setSuperAdminTab('marketing_promo')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    superAdminTab === 'marketing_promo'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Megaphone className="w-4 h-4" />
                  <span>Promoción Portada (Landing)</span>
                </button>

                <button
                  onClick={() => setSuperAdminTab('audit_logs')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    superAdminTab === 'audit_logs'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <History className="w-4 h-4 text-indigo-400" />
                  <span>Bitácora de Sistema (Audit Logs)</span>
                </button>

                <button
                  onClick={() => setSuperAdminTab('presentation')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    superAdminTab === 'presentation'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Kit Comercial & Video Tour</span>
                </button>
              </div>

              {/* Botón de Cerrar Sesión dedicado para Super Administrador */}
              <button
                onClick={handleLogout}
                className="px-3.5 py-2 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Cerrar sesión del Super Administrador"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span>Cerrar Sesión</span>
              </button>
            </div>

            {/* TAB CONTENTS */}
            {superAdminTab === 'monitor' && (
              <SuperAdminSystemMonitor
                onSelectStudy={(study) => {
                  setSelectedStudy(study);
                  setSuperAdminTab('studies');
                }}
              />
            )}
            {superAdminTab === 'presentation' && (
              <PresentationView />
            )}

            {superAdminTab === 'marketing_promo' && (
              <MarketingPromoManager />
            )}

            {superAdminTab === 'audit_logs' && (
              <AuditLogsViewer studies={studies} />
            )}

            {superAdminTab === 'super_users' && (
              <SuperUsersManager />
            )}

            {superAdminTab === 'create_study' && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-4xl mx-auto">
                <h3 className="text-base font-bold text-slate-950 mb-4 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                  <span>Crear Nuevo Estudio Contable</span>
                </h3>
                <CreateStudy />
              </div>
            )}

            {superAdminTab === 'studies' && (
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Estudios Contables Registrados ({studies.length})</h3>
                    <p className="text-xs text-slate-500">Selecciona un estudio para auditar sus sociedades o gestionar sus administradores.</p>
                  </div>
                  <button
                    onClick={() => setSuperAdminTab('create_study')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Nuevo Estudio
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {studies.map(study => {
                    const isVigente = study.estado !== 'Sin Vigencia';
                    const adminEmail = study.adminEmail || study.email || (study.administrators && study.administrators[0]?.email) || 'No configurado';
                    const adminCount = (study.administrators && study.administrators.length) || 1;

                    return (
                      <div
                        key={study.id}
                        onClick={() => setSelectedStudy(study)}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm hover:text-indigo-600 transition-colors">
                                {study.name}
                              </h4>
                              <p className="text-xs font-mono text-slate-500">RUT: {study.rut || 'No informado'}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              isVigente ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {study.estado || 'Vigente'}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 space-y-1 my-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <p className="flex justify-between">
                              <span className="text-slate-400">Admin:</span>
                              <span className="font-mono font-medium text-slate-800 truncate max-w-[170px]">{adminEmail}</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-slate-400">Total Admins:</span>
                              <span className="font-semibold text-indigo-700">{adminCount} asignado(s)</span>
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between mt-2">
                          <span className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            Auditar y Gestionar &rarr;
                          </span>

                          {study.name !== 'Pulso Contable' && study.name !== 'EST_PRUEBA' && (
                            <button
                              onClick={(e) => handleDeleteStudy(study.id, e)}
                              className="text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-0.5 rounded hover:bg-rose-50 transition-colors"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {studies.length === 0 && (
                    <div className="col-span-full p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-500 italic">
                      No hay estudios registrados actualmente. Utiliza el botón superior para registrar el primero.
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
          )
        ) : (role === UserRole.STUDY_ADMIN || role === UserRole.ACCOUNTANT || role === UserRole.ANALYST || role === UserRole.OBSERVER) && userData?.studyId ? (
          <StudyAdminDashboard
            studyId={userData.studyId}
            currentUserRole={role}
            currentUserId={userData?.id || currentUser?.uid}
            currentUserEmail={currentUser?.email}
            onCompanyChange={(comp) => setActiveCompany(comp)}
            onLogout={handleLogout}
          />
        ) : (
          <div className="p-8 bg-white rounded-2xl border border-slate-200 shadow-lg max-w-lg mx-auto text-center space-y-5">
            <div className="w-14 h-14 bg-emerald-100 text-[#4A5D45] rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v12a2 2 0 01-2 2m-6 0h6" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">¡Bienvenido a Gest_OK!</h3>
              <p className="text-xs text-slate-500 mt-1">Tu cuenta está activa ({currentUser?.email}). Para comenzar, crea tu estudio contable o solicita asignación a tu administrador.</p>
            </div>

            <div className="pt-2 space-y-3">
              <button
                onClick={async () => {
                  if (!currentUser) return;
                  setLoading(true);
                  try {
                    await addDoc(collection(db, 'studies'), {
                      name: `Estudio Contable de ${currentUser.email?.split('@')[0] || 'Nuevo Usuario'}`,
                      rut: '76.543.210-K',
                      adminEmail: currentUser.email,
                      email: currentUser.email,
                      adminId: currentUser.uid,
                      address: 'Santiago, Chile',
                      phone: '+56 9 1234 5678',
                      giro: 'Servicios Contables y Asesorías',
                      estado: 'Vigente',
                      createdAt: new Date().toISOString()
                    });
                    
                    // Re-fetch user data
                    await fetchUserDataAndRole();
                  } catch (e: any) {
                    console.error("Error al crear estudio automático:", e);
                    setErrorMsg("Error al crear el estudio: " + e.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow transition-all flex items-center justify-center gap-2"
              >
                🚀 Crear Mi Estudio Contable e Ingresar
              </button>

              <button
                onClick={handleLogout}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition-colors"
              >
                Cerrar Sesión / Ingresar con otra cuenta
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400 text-center">
        Gest_OK {APP_VERSION} - Build 20260903 | Sistema de Gestión Contable y Tributaria
      </footer>

      {/* Modal de Indicadores Económicos Oficiales Global */}
      {showGlobalIndicatorsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <span className="text-xl">📊</span>
                <span>Indicadores Económicos Oficiales (SII y Banco Central de Chile)</span>
              </h3>
              <button
                onClick={() => setShowGlobalIndicatorsModal(false)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors"
              >
                ✕ Cerrar
              </button>
            </div>
            <IndicadoresEconomicosView
              studyId={userData?.studyId || selectedStudy?.id || 'default'}
              selectedYear={2026}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    let timeout: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        signOut(auth);
      }, 17 * 60 * 1000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('mousedown', resetTimer);

    resetTimer();

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
    };
  }, [currentUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/" /> : <Login />} />
        <Route path="/register" element={currentUser ? <Navigate to="/" /> : <Register />} />
        <Route path="/create-study" element={currentUser ? <CreateStudy /> : <Navigate to="/login" />} />
        <Route path="/" element={currentUser ? <Dashboard /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <ProcessProvider>
        <GlobalProcessIndicator />
        <AppContent />
      </ProcessProvider>
    </AuthProvider>
  );
}
