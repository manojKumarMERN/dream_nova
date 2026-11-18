import { useCallback, useState } from 'react';
import { createUniqueId } from '../session';
import type { Toast } from '../types';

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = createUniqueId('toast');
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  return { toasts, push, dismiss };
}
