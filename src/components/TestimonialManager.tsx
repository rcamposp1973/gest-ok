import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy 
} from 'firebase/firestore';
import { LandingTestimonial } from '../types';
import { 
  Star, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff, 
  Quote, 
  Building2, 
  Sparkles, 
  Check, 
  X, 
  RotateCcw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { useAuth } from '../context/AuthContext';

export const DEFAULT_INITIAL_TESTIMONIALS: Omit<LandingTestimonial, 'id'>[] = [
  {
    author: 'Juan Pablo Mardones',
    role: 'Socio Auditor',
    company: 'Audit & Tax Asesores SpA (Santiago)',
    comment: 'Gest_OK redujo nuestro tiempo de cierre mensual en un 65%. La conciliación bancaria inteligente y la importación directa desde el RCV del SII funcionan sin ninguna fricción.',
    rating: 5,
    metrics: '65% menos tiempo en cierres mensuales',
    status: 'active',
    order: 1
  },
  {
    author: 'Marcela Bustamante',
    role: 'Contadora General',
    company: 'Servicios Integrales Valparaíso Ltda.',
    comment: 'El copiloto con IA detecta inconsistencias en los libros de compra y venta antes de enviar el F29 al SII. Es una tranquilidad inmensa para todo el equipo contable.',
    rating: 5,
    metrics: '0 multas SII en los últimos 2 años',
    status: 'active',
    order: 2
  },
  {
    author: 'Cristián Silva O.',
    role: 'Director de Finanzas',
    company: 'Grupo Empresarial Biobío',
    comment: 'Pudimos migrar más de 40 empresas en un solo fin de semana gracias a las plantillas Excel y la carga masiva. La estabilidad y el soporte chileno marcan toda la diferencia.',
    rating: 5,
    metrics: 'Más de 40 empresas administradas en paralelo',
    status: 'active',
    order: 3
  },
  {
    author: 'Andrea Morales P.',
    role: 'Jefa de Contabilidad',
    company: 'Constructora e Inmobiliaria Del Sur',
    comment: 'Los balances a 8 columnas y bajo norma IFRS se generan en segundos con cuadratura matemática exacta. La interfaz es moderna, rápida e intuitiva.',
    rating: 5,
    metrics: '100% cuadratura en balances IFRS y tributarios',
    status: 'active',
    order: 4
  }
];

export default function TestimonialManager() {
  const { currentUser } = useAuth();
  const [testimonials, setTestimonials] = useState<LandingTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [author, setAuthor] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [metrics, setMetrics] = useState('');
  const [status, setStatus] = useState<'active' | 'draft'>('active');
  const [order, setOrder] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const q = collection(db, 'landing_testimonials');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as LandingTestimonial[];
        
        // Sort by order ascending
        items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setTestimonials(items);
        setLoading(false);
      },
      (err) => {
        console.warn('Error reading landing_testimonials:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleResetForm = () => {
    setAuthor('');
    setRole('');
    setCompany('');
    setComment('');
    setRating(5);
    setMetrics('');
    setStatus('active');
    setOrder(testimonials.length + 1);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleOpenEdit = (t: LandingTestimonial) => {
    setEditingId(t.id);
    setAuthor(t.author || '');
    setRole(t.role || '');
    setCompany(t.company || '');
    setComment(t.comment || '');
    setRating(t.rating ?? 5);
    setMetrics(t.metrics || '');
    setStatus(t.status === 'draft' ? 'draft' : 'active');
    setOrder(t.order ?? 1);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!author.trim() || !comment.trim()) {
      setNotice({ type: 'error', text: 'El autor y el comentario son requeridos.' });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const payload = {
        author: author.trim(),
        role: role.trim(),
        company: company.trim(),
        comment: comment.trim(),
        rating: Number(rating) || 5,
        metrics: metrics.trim(),
        status,
        order: Number(order) || 1,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'landing_testimonials', editingId), payload);
        logAuditEvent({
          userId: currentUser?.uid || 'super_admin',
          userEmail: currentUser?.email || 'super_admin@pulsocontable.cl',
          action: 'UPDATE',
          module: 'MARKETING_LANDING',
          details: `Testimonio actualizado para ${author}`
        });
        setNotice({ type: 'success', text: 'Testimonio actualizado con éxito.' });
      } else {
        await addDoc(collection(db, 'landing_testimonials'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAuditEvent({
          userId: currentUser?.uid || 'super_admin',
          userEmail: currentUser?.email || 'super_admin@pulsocontable.cl',
          action: 'CREATE',
          module: 'MARKETING_LANDING',
          details: `Nuevo testimonio creado para ${author}`
        });
        setNotice({ type: 'success', text: 'Nuevo testimonio agregado a la diapositiva.' });
      }

      handleResetForm();
    } catch (err: any) {
      console.error('Error saving testimonial:', err);
      setNotice({ type: 'error', text: 'Error al guardar: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (t: LandingTestimonial) => {
    const nextStatus = t.status === 'active' ? 'draft' : 'active';
    try {
      await updateDoc(doc(db, 'landing_testimonials', t.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Error toggling testimonial:', err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el testimonio de "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'landing_testimonials', id));
      setNotice({ type: 'success', text: 'Testimonio eliminado.' });
    } catch (err: any) {
      console.error('Error deleting testimonial:', err);
      setNotice({ type: 'error', text: 'Error al eliminar: ' + err.message });
    }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm('¿Cargar los 4 testimonios oficiales de demostración en la base de datos?')) return;
    setIsSaving(true);
    try {
      for (const item of DEFAULT_INITIAL_TESTIMONIALS) {
        await addDoc(collection(db, 'landing_testimonials'), {
          ...item,
          createdAt: new Date().toISOString()
        });
      }
      setNotice({ type: 'success', text: 'Se cargaron los 4 testimonios iniciales con éxito.' });
    } catch (err: any) {
      console.error('Error seeding testimonials:', err);
      setNotice({ type: 'error', text: 'Error al cargar predeterminados: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-[#533AFD] text-xs font-bold border border-indigo-100 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Facultad del Super Administrador</span>
          </div>
          <h2 className="text-xl font-extrabold text-[#0D253D] tracking-tight">
            Gestión de Testimonios (Diapositivas de Portada)
          </h2>
          <p className="text-xs text-[#64748D] mt-1 max-w-2xl">
            Controla las opiniones y testimonios de clientes que se muestran en el carrusel de la página de bienvenida (Landing). Los cambios se publican inmediatamente en la diapositiva.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {testimonials.length === 0 && (
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={isSaving}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-[#0D253D] text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Cargar 4 Iniciales</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isFormOpen && !editingId) {
                setIsFormOpen(false);
              } else {
                handleResetForm();
                setIsFormOpen(true);
              }
            }}
            className="px-4 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition flex items-center gap-2 cursor-pointer"
          >
            {isFormOpen && !editingId ? (
              <>
                <X className="w-4 h-4" />
                <span>Cerrar Formulario</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Nuevo Testimonio</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
          notice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form Card */}
      {isFormOpen && (
        <form onSubmit={handleSave} className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-indigo-100 shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-[#0D253D]">
                {editingId ? 'Editar Testimonio de Diapositiva' : 'Crear Nuevo Testimonio para Diapositiva'}
              </h3>
              <p className="text-xs text-slate-500">Completa los campos para publicar la opinión en la página de bienvenida.</p>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Nombre del Autor / Contador *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Rodrigo Gómez"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Cargo / Rol Profesional
              </label>
              <input
                type="text"
                placeholder="Ej. Socio Auditor, Contador General"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Empresa o Estudio Contable
              </label>
              <input
                type="text"
                placeholder="Ej. Tax & Audit SpA (Santiago)"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Calificación (Estrellas 1 a 5)
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 text-slate-300 hover:text-amber-400 transition cursor-pointer"
                  >
                    <Star className={`w-5 h-5 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
                <span className="text-xs font-bold text-[#0D253D] ml-2 font-mono">{rating} / 5</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Métrica de Impacto Destacada (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. 65% ahorro de tiempo en cierres"
                value={metrics}
                onChange={(e) => setMetrics(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Orden de Aparición en Diapositiva
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
              Comentario / Testimonio Completo *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Escribe aquí la experiencia y resultados del usuario con la plataforma Gest_OK..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-3.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white leading-relaxed"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#0D253D]">Estado de Publicación:</span>
              <button
                type="button"
                onClick={() => setStatus(status === 'active' ? 'draft' : 'active')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  status === 'active' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                }`}
              >
                {status === 'active' ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Activo (Visible en Portada)</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span>Borrador (Oculto)</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleResetForm}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'Actualizar Testimonio' : 'Publicar en Diapositiva'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* List / Cards of Testimonials */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-[#0D253D]">
              Diapositivas Activas en Portada ({testimonials.length})
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
              Rotación en tiempo real
            </span>
          </div>

          <p className="text-xs text-slate-400">
            {testimonials.filter(t => t.status === 'active').length} visibles al público
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Cargando diapositivas...</div>
        ) : testimonials.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
            <Quote className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-medium text-slate-600">
              No hay testimonios registrados en la base de datos.
            </p>
            <button
              type="button"
              onClick={handleSeedDefaults}
              className="px-4 py-2 bg-indigo-50 text-[#533AFD] hover:bg-indigo-100 text-xs font-bold rounded-full transition"
            >
              Cargar los 4 testimonios oficiales recomendados
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {testimonials.map((t, index) => {
              const isActive = t.status === 'active';
              return (
                <div
                  key={t.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isActive
                      ? 'bg-white border-slate-200/90 hover:border-indigo-300 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-50 text-[#533AFD] flex items-center justify-center font-bold text-xs">
                          {t.order ?? index + 1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: t.rating ?? 5 }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isActive ? 'Visible' : 'Borrador'}
                      </span>
                    </div>

                    <p className="text-xs text-[#425466] italic leading-relaxed bg-[#F8FAFC] p-3 rounded-xl border border-slate-100">
                      "{t.comment}"
                    </p>

                    {t.metrics && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] font-semibold text-[#059669]">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span>{t.metrics}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100">
                      <h4 className="font-bold text-xs text-[#0D253D]">{t.author}</h4>
                      <p className="text-[11px] text-slate-500">
                        {t.role} {t.company && `• ${t.company}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(t)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      {isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{isActive ? 'Ocultar' : 'Activar'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(t)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t.id, t.author)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
