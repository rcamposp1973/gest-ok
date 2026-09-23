import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  showSuccess: (message: string, title?: string, duration?: number) => string;
  showError: (message: string, title?: string, duration?: number) => string;
  showWarning: (message: string, title?: string, duration?: number) => string;
  showInfo: (message: string, title?: string, duration?: number) => string;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Global dispatcher to allow toast calls from anywhere
type ToastListener = (toast: Omit<ToastItem, 'id'>) => void;
const globalListeners: Set<ToastListener> = new Set();

export const notify = {
  success: (message: string, title: string = 'Operación Exitosa', duration: number = 3800) => {
    globalListeners.forEach(l => l({ message, title, type: 'success', duration }));
  },
  error: (message: string, title: string = 'Atención', duration: number = 5000) => {
    globalListeners.forEach(l => l({ message, title, type: 'error', duration }));
  },
  warning: (message: string, title: string = 'Advertencia', duration: number = 4200) => {
    globalListeners.forEach(l => l({ message, title, type: 'warning', duration }));
  },
  info: (message: string, title: string = 'Información', duration: number = 3800) => {
    globalListeners.forEach(l => l({ message, title, type: 'info', duration }));
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const duration = toast.duration ?? 3800;

    const newToast: ToastItem = { ...toast, id, duration };

    setToasts(prev => [newToast, ...prev.slice(0, 4)]); // Keep max 5 toasts

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }, [dismissToast]);

  const showSuccess = useCallback((message: string, title: string = 'Operación Exitosa', duration?: number) => {
    return showToast({ type: 'success', title, message, duration: duration ?? 3800 });
  }, [showToast]);

  const showError = useCallback((message: string, title: string = 'Atención', duration?: number) => {
    return showToast({ type: 'error', title, message, duration: duration ?? 5000 });
  }, [showToast]);

  const showWarning = useCallback((message: string, title: string = 'Advertencia', duration?: number) => {
    return showToast({ type: 'warning', title, message, duration: duration ?? 4200 });
  }, [showToast]);

  const showInfo = useCallback((message: string, title: string = 'Información', duration?: number) => {
    return showToast({ type: 'info', title, message, duration: duration ?? 3800 });
  }, [showToast]);

  // Connect global listeners
  useEffect(() => {
    const listener: ToastListener = (t) => {
      showToast(t);
    };
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, [showToast]);

  // Dismiss on general navigation or user activity if requested
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // If clicking outside the toast container, we can let toasts fade out or keep them.
      // Auto-dismiss happens on timers.
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        dismissToast,
        clearAllToasts
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return fallback using global notify if outside provider
    return {
      toasts: [],
      showToast: (t: any) => {
        if (t.type === 'error') notify.error(t.message, t.title);
        else if (t.type === 'warning') notify.warning(t.message, t.title);
        else if (t.type === 'info') notify.info(t.message, t.title);
        else notify.success(t.message, t.title);
        return 'fallback';
      },
      showSuccess: (msg: string, title?: string) => { notify.success(msg, title); return 'fb'; },
      showError: (msg: string, title?: string) => { notify.error(msg, title); return 'fb'; },
      showWarning: (msg: string, title?: string) => { notify.warning(msg, title); return 'fb'; },
      showInfo: (msg: string, title?: string) => { notify.info(msg, title); return 'fb'; },
      dismissToast: () => {},
      clearAllToasts: () => {}
    };
  }
  return context;
};

// Visual Toast Container and Items
const ToastContainer: React.FC<{ toasts: ToastItem[]; onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 max-w-md w-[calc(100vw-2.5rem)] pointer-events-none select-none transition-all duration-300"
      aria-live="assertive"
    >
      {toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const getStyle = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-slate-900/95 border-emerald-500/50 text-white shadow-emerald-950/40',
          iconBg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
          progressBar: 'bg-emerald-500',
          Icon: CheckCircle2,
          defaultTitle: 'Operación Exitosa'
        };
      case 'warning':
        return {
          bg: 'bg-slate-900/95 border-amber-500/50 text-white shadow-amber-950/40',
          iconBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
          progressBar: 'bg-amber-500',
          Icon: AlertTriangle,
          defaultTitle: 'Advertencia'
        };
      case 'error':
        return {
          bg: 'bg-slate-900/95 border-rose-500/50 text-white shadow-rose-950/40',
          iconBg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
          progressBar: 'bg-rose-500',
          Icon: AlertCircle,
          defaultTitle: 'Error'
        };
      case 'info':
      default:
        return {
          bg: 'bg-slate-900/95 border-indigo-500/50 text-white shadow-indigo-950/40',
          iconBg: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
          progressBar: 'bg-indigo-500',
          Icon: Info,
          defaultTitle: 'Notificación'
        };
    }
  };

  const style = getStyle();
  const IconComponent = style.Icon;

  return (
    <div
      onClick={onDismiss}
      className={`pointer-events-auto flex items-start gap-3.5 p-4 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer group animate-in fade-in slide-in-from-top-3 ${style.bg}`}
      role="alert"
      title="Haz clic para cerrar esta notificación"
    >
      <div className={`p-2 rounded-xl shrink-0 ${style.iconBg}`}>
        <IconComponent className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0 pr-1">
        {toast.title && (
          <h5 className="text-xs font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5 mb-0.5">
            {toast.title}
          </h5>
        )}
        <p className="text-xs text-slate-300 leading-relaxed break-words whitespace-pre-line font-medium">
          {toast.message}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
        aria-label="Cerrar notificación"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
