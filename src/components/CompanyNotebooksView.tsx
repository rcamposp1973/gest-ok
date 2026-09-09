import React, { useState, useEffect } from 'react';
import { Company, ChartOfAccount, Voucher, RCVDocument, Auxiliary, UserRole } from '../types';
import { db } from '../lib/firebase';
import { doc, collection, getDocs, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { 
  BookOpen, Sparkles, Plus, Trash2, Edit3, Save, ArrowLeft, Lock, 
  CheckCircle2, AlertTriangle, ShieldCheck, FileText, Bot, Send, 
  Download, Clock, Calendar, CheckSquare, Square, RefreshCw, Layers
} from 'lucide-react';

interface CompanyNotebooksViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rcvDocuments: RCVDocument[];
  auxiliaries: Auxiliary[];
  currentUserRole?: UserRole;
  onBack?: () => void;
}

interface NotebookItem {
  id: string;
  title: string;
  category: 'Tributario' | 'Financiero' | 'Auditoría' | 'Directorio' | 'General';
  content: string;
  tasks: { id: string; text: string; completed: boolean }[];
  updatedAt: string;
}

export default function CompanyNotebooksView({
  studyId,
  company,
  accounts,
  vouchers,
  rcvDocuments,
  auxiliaries,
  currentUserRole,
  onBack
}: CompanyNotebooksViewProps) {
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [activeNotebook, setActiveNotebook] = useState<NotebookItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<NotebookItem['category']>('Tributario');
  const [editContent, setEditContent] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  
  // Trial & Subscription State
  const [trialData, setTrialData] = useState<{ createdAt: any; isSubscribed: boolean }>({ createdAt: null, isSubscribed: false });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // AI Assistant State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  const companyNotebooksRef = collection(db, 'studies', studyId, 'companies', company.id, 'smartNotebooks');
  const subRef = doc(db, 'studies', studyId, 'companies', company.id, 'notebookSubscription', 'status');

  useEffect(() => {
    loadData();
  }, [studyId, company.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load Subscription / Trial status
      const subSnap = await getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'notebookSubscription'));
      let subInfo = { createdAt: new Date(), isSubscribed: false };
      if (!subSnap.empty) {
        const d = subSnap.docs[0].data();
        subInfo = { createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || Date.now()), isSubscribed: !!d.isSubscribed };
      } else {
        // Initialize 15-day trial
        await setDoc(subRef, { createdAt: Timestamp.now(), isSubscribed: false }, { merge: true });
      }
      setTrialData(subInfo);

      // 2. Load Notebooks
      const snap = await getDocs(companyNotebooksRef);
      const list: NotebookItem[] = [];
      snap.docs.forEach(d => {
        list.push({ id: d.id, ...d.data() } as NotebookItem);
      });

      if (list.length === 0) {
        // Create default notebook
        const defaultNb: NotebookItem = {
          id: 'nb_' + Date.now(),
          title: `Cuaderno Cierre Mensual - ${company.name}`,
          category: 'Tributario',
          content: `# Cuaderno de Trabajo Inteligente\n\nEmpresa: ${company.name} (RUT: ${company.rut})\n\n### Objetivos del Cuaderno:\n- Revisión y cuadratura de saldos del Balance.\n- Verificación de documentos en RCV.\n- Notas para el cierre de período y reuniones con gerencia.`,
          tasks: [
            { id: 't1', text: 'Validar conciliación bancaria del mes', completed: false },
            { id: 't2', text: 'Revisar cuadratura de auxiliar de clientes y proveedores', completed: true },
            { id: 't3', text: 'Emitir borrador de F29 y validar retenciones', completed: false }
          ],
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(companyNotebooksRef, defaultNb.id), defaultNb);
        list.push(defaultNb);
      }

      setNotebooks(list);
      setActiveNotebook(list[0]);
    } catch (e) {
      console.error("Error loading notebooks:", e);
    } finally {
      setLoading(false);
    }
  };

  // Check if trial expired (15 days)
  const isTrialExpired = () => {
    if (trialData.isSubscribed) return false;
    if (!trialData.createdAt) return false;
    const created = trialData.createdAt instanceof Date ? trialData.createdAt : new Date(trialData.createdAt);
    const now = new Date();
    const diffDays = (now.getTime() - created.getTime()) / (1000 * 3600 * 24);
    return diffDays > 15;
  };

  const daysRemaining = () => {
    if (trialData.isSubscribed) return 'Ilimitado (Suscrito)';
    if (!trialData.createdAt) return '15 días';
    const created = trialData.createdAt instanceof Date ? trialData.createdAt : new Date(trialData.createdAt);
    const now = new Date();
    const diffDays = Math.max(0, Math.ceil(15 - (now.getTime() - created.getTime()) / (1000 * 3600 * 24)));
    return `${diffDays} días restantes de prueba`;
  };

  const handleSaveNotebook = async () => {
    if (!activeNotebook) return;
    try {
      const updated: NotebookItem = {
        ...activeNotebook,
        title: editTitle || activeNotebook.title,
        category: editCategory,
        content: editContent,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(companyNotebooksRef, updated.id), updated);
      setNotebooks(prev => prev.map(n => n.id === updated.id ? updated : n));
      setActiveNotebook(updated);
      setIsEditing(false);
    } catch (e) {
      console.error("Error saving notebook:", e);
      alert('Error al guardar el cuaderno.');
    }
  };

  const handleCreateNotebook = async () => {
    if (isTrialExpired()) {
      setShowUpgradeModal(true);
      return;
    }
    const newNb: NotebookItem = {
      id: 'nb_' + Date.now(),
      title: `Nuevo Cuaderno de Auditoría`,
      category: 'Financiero',
      content: `# Notas de Trabajo\n\nDetalle y observaciones para la empresa ${company.name}.`,
      tasks: [{ id: 't1', text: 'Revisión inicial de saldos', completed: false }],
      updatedAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(companyNotebooksRef, newNb.id), newNb);
      setNotebooks(prev => [...prev, newNb]);
      setActiveNotebook(newNb);
      setEditTitle(newNb.title);
      setEditCategory(newNb.category);
      setEditContent(newNb.content);
      setIsEditing(true);
    } catch (e) {
      console.error("Error creating notebook:", e);
    }
  };

  const handleDeleteNotebook = async (id: string) => {
    if (notebooks.length <= 1) {
      alert('Debe mantener al menos un cuaderno en la empresa.');
      return;
    }
    if (!confirm('¿Está seguro de eliminar este cuaderno?')) return;
    try {
      await deleteDoc(doc(companyNotebooksRef, id));
      const remaining = notebooks.filter(n => n.id !== id);
      setNotebooks(remaining);
      setActiveNotebook(remaining[0]);
    } catch (e) {
      console.error("Error deleting notebook:", e);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    if (!activeNotebook) return;
    const updatedTasks = activeNotebook.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
    const updated = { ...activeNotebook, tasks: updatedTasks, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(companyNotebooksRef, updated.id), updated);
      setActiveNotebook(updated);
      setNotebooks(prev => prev.map(n => n.id === updated.id ? updated : n));
    } catch (e) {
      console.error("Error updating task:", e);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskText.trim() || !activeNotebook) return;
    const newTask = { id: 'task_' + Date.now(), text: newTaskText.trim(), completed: false };
    const updated = { ...activeNotebook, tasks: [...activeNotebook.tasks, newTask], updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(companyNotebooksRef, updated.id), updated);
      setActiveNotebook(updated);
      setNotebooks(prev => prev.map(n => n.id === updated.id ? updated : n));
      setNewTaskText('');
    } catch (e) {
      console.error("Error adding task:", e);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!activeNotebook) return;
    const updatedTasks = activeNotebook.tasks.filter(t => t.id !== taskId);
    const updated = { ...activeNotebook, tasks: updatedTasks, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(companyNotebooksRef, updated.id), updated);
      setActiveNotebook(updated);
      setNotebooks(prev => prev.map(n => n.id === updated.id ? updated : n));
    } catch (e) {
      console.error("Error deleting task:", e);
    }
  };

  const handleAskAI = async () => {
    if (!aiPrompt.trim()) return;
    if (isTrialExpired()) {
      setShowUpgradeModal(true);
      return;
    }

    setAiLoading(true);
    setAiResponse(null);
    try {
      const companyContext = {
        name: company.name,
        rut: company.rut,
        totalAccounts: accounts.length,
        totalVouchers: vouchers.length,
        totalRcvDocs: rcvDocuments.length,
        totalAuxiliaries: auxiliaries.length
      };

      const res = await fetch('/api/notebook-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          companyContext,
          notesContext: activeNotebook?.content || ''
        })
      });

      const data = await res.json();
      if (data.success) {
        setAiResponse(data.text);
      } else {
        setAiResponse(`Error al consultar con la IA: ${data.error || 'Desconocido'}`);
      }
    } catch (e: any) {
      console.error("Error calling AI notebook:", e);
      setAiResponse(`Error de conexión con el servidor de IA: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleActivateSubscription = async () => {
    try {
      await setDoc(subRef, { createdAt: trialData.createdAt || Timestamp.now(), isSubscribed: true }, { merge: true });
      setTrialData(prev => ({ ...prev, isSubscribed: true }));
      setShowUpgradeModal(false);
      alert('¡Suscripción al Módulo de Cuadernos Inteligentes activada con éxito!');
    } catch (e) {
      console.error("Error activating subscription:", e);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
        <p className="text-sm font-medium">Cargando Cuadernos Inteligentes de {company.name}...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-xl shadow-lg border border-indigo-900/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700 cursor-pointer"
              title="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-3 bg-indigo-600/30 border border-indigo-500/40 rounded-xl">
            <BookOpen className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Cuadernos Contables Inteligentes</h1>
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" /> IA Activa
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Empresa: <strong className="text-white">{company.name}</strong> (RUT: {company.rut}) • Privado y exclusivo para esta empresa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-mono">Estado de Licencia</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
              trialData.isSubscribed 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                : isTrialExpired() 
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}>
              {trialData.isSubscribed ? 'Suscripción Activa (Add-on)' : daysRemaining()}
            </span>
          </div>
          {!trialData.isSubscribed && (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Contratar Add-on
            </button>
          )}
          <button
            onClick={handleCreateNotebook}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nuevo Cuaderno
          </button>
        </div>
      </div>

      {/* Trial Expired Banner */}
      {isTrialExpired() && !trialData.isSubscribed && (
        <div className="bg-rose-50 border-2 border-rose-300 p-4 rounded-xl flex items-center justify-between text-rose-900 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold">Período de prueba de 15 días finalizado</p>
              <p className="text-xs text-rose-700">Para seguir editando cuadernos y utilizando el asistente de IA con los datos de {company.name}, active la suscripción mensual del add-on.</p>
            </div>
          </div>
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow cursor-pointer whitespace-nowrap"
          >
            Activar Suscripción
          </button>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Notebooks List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 lg:col-span-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">Cuadernos de la Empresa</h3>
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {notebooks.map(nb => {
              const isActive = activeNotebook?.id === nb.id;
              return (
                <div
                  key={nb.id}
                  onClick={() => {
                    setActiveNotebook(nb);
                    setIsEditing(false);
                    setAiResponse(null);
                  }}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                    isActive 
                      ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 shadow-xs' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        nb.category === 'Tributario' ? 'bg-amber-100 text-amber-800' :
                        nb.category === 'Financiero' ? 'bg-emerald-100 text-emerald-800' :
                        nb.category === 'Auditoría' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {nb.category}
                      </span>
                    </div>
                    <p className="text-xs font-bold truncate">{nb.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(nb.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {notebooks.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteNotebook(nb.id); }}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      title="Eliminar cuaderno"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center/Right: Notebook Editor & AI Assistant */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-3 space-y-6">
          {activeNotebook && (
            <>
              {/* Notebook Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="space-y-1 flex-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Título del Cuaderno"
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as any)}
                        className="px-3 py-1 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                      >
                        <option value="Tributario">Tributario</option>
                        <option value="Financiero">Financiero</option>
                        <option value="Auditoría">Auditoría</option>
                        <option value="Directorio">Directorio</option>
                        <option value="General">General</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                          {activeNotebook.category}
                        </span>
                        <span className="text-[11px] text-slate-400">Actualizado {new Date(activeNotebook.updatedAt).toLocaleString()}</span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 mt-1">{activeNotebook.title}</h2>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSaveNotebook}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" /> Guardar Cambios
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (isTrialExpired()) {
                          setShowUpgradeModal(true);
                          return;
                        }
                        setEditTitle(activeNotebook.title);
                        setEditCategory(activeNotebook.category);
                        setEditContent(activeNotebook.content);
                        setIsEditing(true);
                      }}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar Cuaderno
                    </button>
                  )}
                </div>
              </div>

              {/* Notebook Content Area */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Notes / Markdown Section */}
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" /> Notas y Minutas de Trabajo
                    </h3>
                    {isEditing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={12}
                        className="w-full p-4 border border-slate-300 rounded-xl text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                        placeholder="Escribe notas en formato Markdown..."
                      />
                    ) : (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 whitespace-pre-wrap font-mono leading-relaxed min-h-[250px]">
                        {activeNotebook.content}
                      </div>
                    )}
                  </div>

                  {/* AI Copilot Query Box inside Notebook */}
                  <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-indigo-900">Asistente IA de Cuaderno (Gemini)</h4>
                          <p className="text-[11px] text-indigo-700">Analiza los saldos, cuentas y notas de esta empresa en tiempo real.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAskAI(); }}
                        placeholder="Ej: ¿Cuáles son las cuentas con mayor saldo deudor este mes y qué implica para el F29?"
                        className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                      />
                      <button
                        onClick={handleAskAI}
                        disabled={aiLoading}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Analizar con IA
                      </button>
                    </div>

                    {aiResponse && (
                      <div className="p-3 bg-white border border-indigo-200 rounded-lg text-xs text-slate-800 space-y-2">
                        <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5 font-bold text-indigo-900">
                          <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Respuesta de la IA</span>
                          <button onClick={() => setAiResponse(null)} className="text-slate-400 hover:text-slate-600 text-xs">Cerrar</button>
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed">
                          {aiResponse}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Checklist & Tasks Sidebar */}
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" /> Tareas & Checklist
                    </h3>
                    
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {activeNotebook.tasks.length === 0 ? (
                        <p className="text-[11px] text-slate-400 text-center py-4">No hay tareas pendientes.</p>
                      ) : (
                        activeNotebook.tasks.map(task => (
                          <div key={task.id} className="flex items-start justify-between gap-2 bg-white p-2 rounded-lg border border-slate-200 text-xs shadow-2xs">
                            <label className="flex items-start gap-2 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                checked={task.completed}
                                onChange={() => handleToggleTask(task.id)}
                                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className={`${task.completed ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                                {task.text}
                              </span>
                            </label>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex gap-1.5 pt-2 border-t border-slate-200">
                      <input
                        type="text"
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
                        placeholder="Nueva tarea..."
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={handleAddTask}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="bg-indigo-900 text-white rounded-xl p-4 space-y-2">
                    <h4 className="text-[11px] uppercase tracking-wider font-mono text-indigo-300">Resumen de Empresa</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-indigo-200">Cuentas Contables:</span>
                        <span className="font-bold font-mono">{accounts.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-indigo-200">Vouchers Ingresados:</span>
                        <span className="font-bold font-mono">{vouchers.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-indigo-200">Documentos RCV:</span>
                        <span className="font-bold font-mono">{rcvDocuments.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-indigo-200">Auxiliares Activos:</span>
                        <span className="font-bold font-mono">{auxiliaries.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Upgrade / Subscription Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-950">Activar Módulo Add-on: Cuadernos Inteligentes</h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                Disfruta de cuadernos contables ilimitados por empresa, notas estructuradas, checklists y asistente IA con Gemini en tiempo real.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600">Período de Prueba:</span>
                <span className="font-bold text-emerald-600">15 Días (Incluido)</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600">Valor Mensual Add-on:</span>
                <span className="font-bold text-slate-900 font-mono text-sm">0.5 UF / mes por Estudio</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Activación inmediata para todas las empresas de tu estudio contable. Sin compromisos a largo plazo.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Cerrar
              </button>
              <button
                onClick={handleActivateSubscription}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> Activar Suscripción Ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
