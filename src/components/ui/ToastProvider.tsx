import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  pushToast: (title: string, description?: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ACCENT_BORDER: Record<ToastVariant, string> = {
  success: 'border-l-emerald-500',
  error: 'border-l-rose-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, description?: string, variant: ToastVariant = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      if (variant !== 'error') {
        window.setTimeout(() => {
          dismiss(id);
        }, 4200);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border border-white/[0.1] border-l-2 ${ACCENT_BORDER[toast.variant]} bg-[#181B22] px-4 py-3 shadow-2xl shadow-black/70`}
          >
            <div className="mt-0.5 shrink-0">
              {toast.variant === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {toast.variant === 'error' && <XCircle className="h-4 w-4 text-rose-400" />}
              {toast.variant === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
              {toast.variant === 'info' && <Info className="h-4 w-4 text-blue-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#F4F5F7] leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="text-xs text-[#9CA3AF] mt-0.5 leading-relaxed">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-[#6B7280] hover:text-[#F4F5F7] transition-colors p-0.5 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
