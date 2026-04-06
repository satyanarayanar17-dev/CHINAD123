import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  title: string;
  body?: string;
}

const icons = {
  success: <CheckCircle size={18} className="text-emerald-600" />,
  error: <AlertTriangle size={18} className="text-error" />,
  info: <Info size={18} className="text-primary" />,
  warning: <AlertTriangle size={18} className="text-amber-600" />,
};

const borders = {
  success: 'border-l-emerald-500',
  error: 'border-l-error',
  info: 'border-l-primary',
  warning: 'border-l-amber-500',
};

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export const Toast = ({ toast, onDismiss }: ToastProps) => {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 3500);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div className={`flex items-start gap-3 bg-white shadow-xl border border-gray-100 border-l-4 ${borders[toast.variant]} rounded-xl p-4 min-w-72 max-w-sm animate-slide-in-right`}>
      <span className="shrink-0 mt-0.5">{icons[toast.variant]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-on-surface">{toast.title}</p>
        {toast.body && <p className="text-xs text-on-surface-variant mt-0.5">{toast.body}</p>}
      </div>
      <button onClick={() => onDismiss(toast.id)} className="text-on-surface-variant hover:text-on-surface shrink-0">
        <X size={14} />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer = ({ toasts, onDismiss }: ToastContainerProps) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

// Hook
export const useToast = () => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const push = React.useCallback((variant: ToastVariant, title: string, body?: string) => {
    const id = `t-${Date.now()}`;
    setToasts(p => [...p, { id, variant, title, body }]);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
};
