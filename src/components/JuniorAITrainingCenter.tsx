import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc, 
  collectionGroup 
} from 'firebase/firestore';
import { Study, Company } from '../types';
import { 
  Sparkles, 
  BrainCircuit, 
  BookOpen, 
  ShieldCheck, 
  Building2, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  CheckCircle2, 
  Scale, 
  FileText, 
  HelpCircle, 
  Search, 
  Send,
  Layers,
  Lock,
  Globe,
  Tag,
  RefreshCw,
  Sliders,
  ChevronRight
} from 'lucide-react';

export interface CopilotKnowledgeItem {
  id: string;
  scope: 'GLOBAL' | 'COMPANY';
  studyId?: string;
  companyId?: string;
  companyName?: string;
  category: 'TRIBUTARIA_CHILENA' | 'FINANCIERA_IFRS' | 'OPERACION_SISTEMA' | 'CRITERIO_ESPECIFICO';
  title: string;
  keywords: string[];
  directiveContent: string;
  recommendedEntries?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_GLOBAL_KNOWLEDGE: Omit<CopilotKnowledgeItem, 'id'>[] = [
  {
    scope: 'GLOBAL',
    category: 'TRIBUTARIA_CHILENA',
    title: 'Retención de Boletas de Honorarios (Ley N° 21.133)',
    keywords: ['honorario', 'honorarios', 'bhr', 'retencion', 'retención', '14.5', '14.5%'],
    directiveContent: 'La tasa de retención aplicable a Boletas de Honorarios (Segunda Categoría) es del 14.5%. Se declara en el Formulario 29, Línea 57, Código [151]. El cálculo parte del valor bruto multiplicando por 0.145, o si se pactó líquido, se calcula Bruto = Líquido / (1 - 0.145).',
    recommendedEntries: '[4201002] Gastos por Honorarios (Debe) / [2103003] Retención 2da Cat F29 (Haber) / [2101002] Honorarios por Pagar (Haber)',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    scope: 'GLOBAL',
    category: 'FINANCIERA_IFRS',
    title: 'Estructura IFRS Estado de Resultados por Función (NIC 1)',
    keywords: ['margen operacional', 'ingresos operacionales', 'costo de venta', 'ebit', 'ifrs', 'nic 1'],
    directiveContent: 'Bajo IFRS NIC 1, el Margen Operacional (Ganancia Bruta) es la diferencia directa entre los Ingresos de Actividades Ordinarias (cuentas 31xxxxx) y los Costos de Venta o Costos de Explotación Directos (cuentas 41xxxxx). Los Gastos de Administración y Ventas (42xxxxx) se restan posteriormente para obtener el Resultado Operacional (EBIT).',
    recommendedEntries: 'Ingresos Operacionales (31) - Costos de Ventas (41) = Margen Operacional.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    scope: 'GLOBAL',
    category: 'FINANCIERA_IFRS',
    title: 'Partida Doble y Clasificación Balance IFRS (Activo = Pasivo + Patrimonio)',
    keywords: ['balance', 'partida doble', 'activo corriente', 'pasivo corriente', 'patrimonio neto', 'nic 1'],
    directiveContent: 'En el Balance Clasificado IFRS, los Activos y Pasivos se segregan estrictamente en Corrientes (realizables o exigibles en menos de 12 meses) y No Corrientes (largo plazo). El Activo Total (código 1) debe cuadrar con la suma de Pasivo Total (código 2) más Patrimonio Neto (código 23/3).',
    recommendedEntries: 'Activo Total = Pasivo Total + Patrimonio Neto.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    scope: 'GLOBAL',
    category: 'TRIBUTARIA_CHILENA',
    title: 'Régimen ProPyme General (Art. 14 D N° 3 LIR)',
    keywords: ['propyme', '14d3', '14 d n 3', 'tasa idpc', 'primera categoria'],
    directiveContent: 'El Régimen ProPyme General tributa en base a ingresos percibidos y gastos pagados (o devengados si aplica contabilidad completa). La tasa de Impuesto de Primera Categoría (IDPC) es del 25% (con rebajas transitorias según ley). Sus socios tienen derecho al 100% de crédito por IDPC pagado contra sus impuestos finales (Global Complementario).',
    recommendedEntries: 'IDPC 25% con 100% de imputación a Global Complementario.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    scope: 'GLOBAL',
    category: 'OPERACION_SISTEMA',
    title: 'Conciliación Bancaria Automática y Algoritmo Nuez Mariposa',
    keywords: ['conciliacion', 'cartola', 'nuez mariposa', 'rut match', 'partidas pendientes'],
    directiveContent: 'El sistema permite conciliar la cartola bancaria contra el Libro Mayor. El algoritmo Nuez Mariposa extrae los RUTs contenidos en las descripciones de las transferencias y los cruza directamente con el maestro de auxiliares y comprobantes pendientes para proponer contabilización y cruce en 1 clic.',
    recommendedEntries: 'Usa el botón "Nuez Mariposa RUT Match" en Conciliación Bancaria.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export default function JuniorAITrainingCenter() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [companies, setCompanies] = useState<{ company: Company; studyId: string }[]>([]);
  const [selectedStudyId, setSelectedStudyId] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  
  const [knowledgeList, setKnowledgeList] = useState<CopilotKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'GLOBAL' | 'COMPANY' | 'PLAYGROUND'>('GLOBAL');

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<CopilotKnowledgeItem> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Playground State
  const [testQuery, setTestQuery] = useState('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [appliedRules, setAppliedRules] = useState<CopilotKnowledgeItem[]>([]);

  // Load Studies, Companies and Knowledge Base
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. Studies
      const studiesSnap = await getDocs(collection(db, 'studies'));
      const sList = studiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Study));
      setStudies(sList);

      // 2. Companies
      const compSnap = await getDocs(collectionGroup(db, 'companies'));
      const cList: { company: Company; studyId: string }[] = [];
      compSnap.docs.forEach(d => {
        const pathSegments = d.ref.path.split('/');
        const sId = pathSegments[1] || '';
        cList.push({ company: { id: d.id, ...d.data() } as Company, studyId: sId });
      });
      setCompanies(cList);

      if (sList.length > 0 && !selectedStudyId) {
        setSelectedStudyId(sList[0].id);
      }
      if (cList.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(cList[0].company.id);
      }

      // 3. Global Knowledge
      const globalSnap = await getDocs(collection(db, 'system_junior_knowledge'));
      let loadedKnowledge: CopilotKnowledgeItem[] = [];

      if (globalSnap.empty) {
        // Seed default initial knowledge
        for (const item of DEFAULT_GLOBAL_KNOWLEDGE) {
          const docRef = await addDoc(collection(db, 'system_junior_knowledge'), item);
          loadedKnowledge.push({ id: docRef.id, ...item });
        }
      } else {
        loadedKnowledge = globalSnap.docs.map(d => ({ id: d.id, ...d.data() } as CopilotKnowledgeItem));
      }

      // 4. Company Specific Knowledge
      const compKnowledgeSnap = await getDocs(collectionGroup(db, 'copilotCompanyKnowledge'));
      compKnowledgeSnap.docs.forEach(d => {
        loadedKnowledge.push({ id: d.id, ...d.data() } as CopilotKnowledgeItem);
      });

      setKnowledgeList(loadedKnowledge);
    } catch (err) {
      console.error("Error loading Junior knowledge:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const currentCompanyObj = companies.find(c => c.company.id === selectedCompanyId)?.company;

  // Filtered list
  const filteredList = knowledgeList.filter(item => {
    if (activeTab === 'GLOBAL' && item.scope !== 'GLOBAL') return false;
    if (activeTab === 'COMPANY') {
      if (item.scope !== 'COMPANY') return false;
      if (selectedCompanyId && item.companyId !== selectedCompanyId) return false;
    }
    if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchContent = item.directiveContent.toLowerCase().includes(q);
      const matchKeys = (item.keywords || []).some(k => k.toLowerCase().includes(q));
      if (!matchTitle && !matchContent && !matchKeys) return false;
    }
    return true;
  });

  // Save Knowledge Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.title || !editingItem?.directiveContent) {
      alert('Por favor completa el título y el contenido instructivo.');
      return;
    }

    try {
      const isGlobal = editingItem.scope === 'GLOBAL';
      const payload: Omit<CopilotKnowledgeItem, 'id'> = {
        scope: isGlobal ? 'GLOBAL' : 'COMPANY',
        studyId: isGlobal ? '' : (currentCompanyObj ? selectedStudyId : ''),
        companyId: isGlobal ? '' : selectedCompanyId,
        companyName: isGlobal ? '' : (currentCompanyObj?.name || 'Empresa'),
        category: editingItem.category || 'TRIBUTARIA_CHILENA',
        title: editingItem.title.trim(),
        keywords: Array.isArray(editingItem.keywords) 
          ? editingItem.keywords 
          : typeof editingItem.keywords === 'string' 
            ? (editingItem.keywords as string).split(',').map(s => s.trim()).filter(Boolean)
            : [],
        directiveContent: editingItem.directiveContent.trim(),
        recommendedEntries: (editingItem.recommendedEntries || '').trim(),
        isActive: editingItem.isActive !== undefined ? editingItem.isActive : true,
        createdAt: editingItem.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (isGlobal) {
        if (editingItem.id) {
          await setDoc(doc(db, 'system_junior_knowledge', editingItem.id), payload, { merge: true });
        } else {
          await addDoc(collection(db, 'system_junior_knowledge'), payload);
        }
      } else {
        if (!selectedStudyId || !selectedCompanyId) {
          alert('Selecciona un estudio y empresa para guardar la regla aislada.');
          return;
        }
        if (editingItem.id) {
          await setDoc(doc(db, 'studies', selectedStudyId, 'companies', selectedCompanyId, 'copilotCompanyKnowledge', editingItem.id), payload, { merge: true });
        } else {
          await addDoc(collection(db, 'studies', selectedStudyId, 'companies', selectedCompanyId, 'copilotCompanyKnowledge'), payload);
        }
      }

      alert('¡Regla de conocimiento de Junior guardada con éxito!');
      setIsEditing(false);
      setEditingItem(null);
      await fetchAllData();
    } catch (err: any) {
      console.error("Error saving knowledge item:", err);
      alert('Error al guardar: ' + err.message);
    }
  };

  // Delete Knowledge Item
  const handleDeleteItem = async (item: CopilotKnowledgeItem) => {
    if (!window.confirm(`¿Estás seguro de eliminar la regla de entrenamiento "${item.title}"?`)) return;

    try {
      if (item.scope === 'GLOBAL') {
        await deleteDoc(doc(db, 'system_junior_knowledge', item.id));
      } else if (item.studyId && item.companyId) {
        await deleteDoc(doc(db, 'studies', item.studyId, 'companies', item.companyId, 'copilotCompanyKnowledge', item.id));
      }
      alert('Regla eliminada.');
      await fetchAllData();
    } catch (err: any) {
      console.error("Error deleting item:", err);
      alert('Error al eliminar: ' + err.message);
    }
  };

  // Run Test Query in Playground
  const handleRunPlaygroundTest = () => {
    if (!testQuery.trim()) return;
    const q = testQuery.toLowerCase().trim();

    // 1. Find matching company-specific rules (higher priority)
    const matchingCompanyRules = knowledgeList.filter(k => 
      k.scope === 'COMPANY' && 
      k.companyId === selectedCompanyId &&
      k.isActive &&
      (k.keywords.some(kw => q.includes(kw.toLowerCase())) || q.includes(k.title.toLowerCase()))
    );

    // 2. Find matching global rules
    const matchingGlobalRules = knowledgeList.filter(k => 
      k.scope === 'GLOBAL' && 
      k.isActive &&
      (k.keywords.some(kw => q.includes(kw.toLowerCase())) || q.includes(k.title.toLowerCase()))
    );

    const allMatches = [...matchingCompanyRules, ...matchingGlobalRules];
    setAppliedRules(allMatches);

    let output = `🧠 **Respuesta Generada por Junior (Evaluación de Entrenamiento):**\n\n`;
    
    if (matchingCompanyRules.length > 0) {
      output += `🏢 **Criterio Aislado de la Empresa (${currentCompanyObj?.name || 'Empresa Seleccionada'}):**\n`;
      matchingCompanyRules.forEach(r => {
        output += `• **${r.title}**: ${r.directiveContent}\n`;
        if (r.recommendedEntries) {
          output += `  👉 *Asiento sugerido:* \`${r.recommendedEntries}\`\n`;
        }
      });
      output += `\n`;
    }

    if (matchingGlobalRules.length > 0) {
      output += `🏛️ **Normativa General y Conocimiento Tributario / IFRS:**\n`;
      matchingGlobalRules.forEach(r => {
        output += `• **${r.title}**: ${r.directiveContent}\n`;
        if (r.recommendedEntries) {
          output += `  👉 *Asiento / Criterio:* \`${r.recommendedEntries}\`\n`;
        }
      });
    }

    if (allMatches.length === 0) {
      output += `No se encontraron reglas específicas en la base de conocimientos que coincidan exactamente con tu consulta.\nJunior responderá utilizando su motor base de LIR, IVA, F29 y NIC 1.`;
    }

    setTestResponse(output);
  };

  return (
    <div className="space-y-4 font-sans max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                Centro de Entrenamiento de Junior (IA Contable)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                Super Admin Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Administración de directivas tributarias chilenas, normas IFRS y reglas aisladas por empresa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAllData}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            onClick={() => {
              setEditingItem({
                scope: activeTab === 'COMPANY' ? 'COMPANY' : 'GLOBAL',
                category: 'TRIBUTARIA_CHILENA',
                title: '',
                keywords: [],
                directiveContent: '',
                recommendedEntries: '',
                isActive: true
              });
              setIsEditing(true);
            }}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Directiva</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-100 p-1.5 rounded-xl border border-slate-200 flex flex-wrap gap-1 text-xs">
        <button
          onClick={() => setActiveTab('GLOBAL')}
          className={`px-4 py-2 rounded-lg font-black transition-all flex items-center gap-2 ${
            activeTab === 'GLOBAL' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Globe className="w-4 h-4 text-indigo-600" />
          <span>1. Conocimiento Global del Sistema (IFRS & Tributario)</span>
          <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 text-[10px] font-mono">
            {knowledgeList.filter(k => k.scope === 'GLOBAL').length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('COMPANY')}
          className={`px-4 py-2 rounded-lg font-black transition-all flex items-center gap-2 ${
            activeTab === 'COMPANY' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4 text-emerald-600" />
          <span>2. Criterios Aislados por Empresa (Privacidad Total)</span>
          <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 text-[10px] font-mono">
            {knowledgeList.filter(k => k.scope === 'COMPANY').length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('PLAYGROUND')}
          className={`px-4 py-2 rounded-lg font-black transition-all flex items-center gap-2 ${
            activeTab === 'PLAYGROUND' ? 'bg-white text-purple-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span>3. Banco de Pruebas y Simulación (Playground)</span>
        </button>
      </div>

      {/* COMPANY SELECTOR IF IN COMPANY TAB OR PLAYGROUND */}
      {(activeTab === 'COMPANY' || activeTab === 'PLAYGROUND') && (
        <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-emerald-950">Estudio Contable:</span>
              <select
                value={selectedStudyId}
                onChange={(e) => {
                  setSelectedStudyId(e.target.value);
                  const firstInStudy = companies.find(c => c.studyId === e.target.value);
                  if (firstInStudy) setSelectedCompanyId(firstInStudy.company.id);
                }}
                className="bg-white border border-emerald-300 rounded-md px-2.5 py-1 text-xs font-bold text-slate-900"
              >
                {studies.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-emerald-950">Empresa Seleccionada:</span>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="bg-white border border-emerald-300 rounded-md px-2.5 py-1 text-xs font-bold text-slate-900"
              >
                {companies
                  .filter(c => !selectedStudyId || c.studyId === selectedStudyId)
                  .map(c => (
                    <option key={c.company.id} value={c.company.id}>
                      {c.company.name} ({c.company.rut})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="text-[11px] text-emerald-800 font-medium flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" />
            <span>El conocimiento registrado aquí <strong>NUNCA</strong> se comparte con otras sociedades.</span>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      {activeTab !== 'PLAYGROUND' ? (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap gap-3 items-center justify-between text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por título, contenido o palabras clave..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Categoría:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-bold text-slate-800"
              >
                <option value="ALL">Todas las Categorías</option>
                <option value="TRIBUTARIA_CHILENA">Normativa Tributaria Chilena</option>
                <option value="FINANCIERA_IFRS">Contabilidad Financiera IFRS</option>
                <option value="OPERACION_SISTEMA">Operación del Sistema</option>
                <option value="CRITERIO_ESPECIFICO">Criterio Específico de Empresa</option>
              </select>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredList.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-all"
              >
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          item.scope === 'GLOBAL' ? 'bg-indigo-100 text-indigo-900' : 'bg-emerald-100 text-emerald-900'
                        }`}>
                          {item.scope === 'GLOBAL' ? 'Global' : `Empresa: ${item.companyName || 'Aislada'}`}
                        </span>

                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.category.replace('_', ' ')}
                        </span>
                      </div>

                      <h4 className="font-black text-sm text-slate-900">
                        {item.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setIsEditing(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Editar directiva"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Eliminar directiva"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-sans">
                    {item.directiveContent}
                  </p>

                  {item.recommendedEntries && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-800">
                      <span className="font-sans font-bold text-slate-700 block mb-1">👉 Asiento / Criterio Recomendado:</span>
                      {item.recommendedEntries}
                    </div>
                  )}

                  {/* Keywords */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(item.keywords || []).map((kw, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between items-center">
                  <span>Actualizado: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('es-CL') : 'Reciente'}</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Activo en Junior
                  </span>
                </div>
              </div>
            ))}
          </div>

          {filteredList.length === 0 && (
            <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs">
              No se encontraron directivas de entrenamiento para este criterio o búsqueda.
            </div>
          )}
        </div>
      ) : (
        /* PLAYGROUND */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="font-black text-sm uppercase text-slate-900 tracking-wide flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Simulador de Consultas y Entrenamiento</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Prueba preguntas contables o tributarias para ver cómo Junior aplica las directivas globales y aisladas de <strong>{currentCompanyObj?.name}</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Escribe una pregunta de prueba para Junior:</label>
              <textarea
                rows={4}
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Ej: ¿Cómo se calcula la retención de una boleta de honorarios de $1.000.000? o ¿Cómo se calcula el margen operacional según IFRS?"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <button
              onClick={handleRunPlaygroundTest}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Evaluar Respuesta de Junior</span>
            </button>

            {/* Quick Test Prompt Pills */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-slate-500 block mb-1.5">Preguntas Rápidas de Prueba:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Cálculo de Boleta de Honorarios 14.5%',
                  'Margen Operacional y NIC 1',
                  'Estructura de Balance Clasificado',
                  'Régimen ProPyme General 14D3'
                ].map((pill, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTestQuery(pill);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-purple-50 hover:text-purple-900 text-[11px] text-slate-700 border border-slate-200 transition-colors text-left"
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md border border-slate-800 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                <span className="text-xs font-black uppercase tracking-wide text-amber-300 flex items-center gap-1.5">
                  <BrainCircuit className="w-4 h-4" />
                  <span>Consola de Respuesta de Junior</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {appliedRules.length} directivas aplicadas
                </span>
              </div>

              {testResponse ? (
                <div className="text-xs font-sans whitespace-pre-wrap leading-relaxed space-y-2 text-slate-200">
                  {testResponse}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500 text-xs">
                  Escribe una consulta a la izquierda y presiona "Evaluar Respuesta de Junior" para ver el resultado en tiempo real.
                </div>
              )}
            </div>

            {appliedRules.length > 0 && (
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 text-[11px]">
                <span className="font-bold text-amber-400 block mb-1">Directivas activadas en esta consulta:</span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                  {appliedRules.map((r, i) => (
                    <li key={i}>
                      <strong>[{r.scope}]</strong> {r.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDIT / CREATE KNOWLEDGE ITEM */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-black text-base text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-indigo-600" />
                <span>{editingItem?.id ? 'Editar Directiva de Junior' : 'Nueva Directiva de Entrenamiento'}</span>
              </h3>
              <button
                onClick={() => { setIsEditing(false); setEditingItem(null); }}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Alcance (Scope):</label>
                  <select
                    value={editingItem?.scope || 'GLOBAL'}
                    onChange={(e) => setEditingItem({ ...editingItem, scope: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                  >
                    <option value="GLOBAL">Global (Todo el Sistema)</option>
                    <option value="COMPANY">Aislado a esta Empresa ({currentCompanyObj?.name || 'Seleccionada'})</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoría:</label>
                  <select
                    value={editingItem?.category || 'TRIBUTARIA_CHILENA'}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                  >
                    <option value="TRIBUTARIA_CHILENA">Normativa Tributaria Chilena</option>
                    <option value="FINANCIERA_IFRS">Contabilidad Financiera IFRS</option>
                    <option value="OPERACION_SISTEMA">Operación del Sistema</option>
                    <option value="CRITERIO_ESPECIFICO">Criterio Específico de Empresa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Título de la Directiva:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Retención 14.5% en Boletas de Honorarios"
                  value={editingItem?.title || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Palabras Clave / Triggers (Separadas por comas):</label>
                <input
                  type="text"
                  placeholder="honorario, retencion, 14.5, bhr"
                  value={Array.isArray(editingItem?.keywords) ? editingItem?.keywords.join(', ') : editingItem?.keywords || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, keywords: e.target.value as any })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Instrucción / Contenido de la Directiva:</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Escribe la regla o explicación clara que Junior debe considerar..."
                  value={editingItem?.directiveContent || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, directiveContent: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Propuesta de Asiento Contable Recomendado (Opcional):</label>
                <input
                  type="text"
                  placeholder="Ej: [4201002] Honorarios (Debe) / [2103003] Retención 2da Cat F29 (Haber)"
                  value={editingItem?.recommendedEntries || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, recommendedEntries: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setEditingItem(null); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-lg shadow-sm"
                >
                  Guardar Directiva
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
