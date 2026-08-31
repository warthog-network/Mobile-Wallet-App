export type ToastKind = 'success' | 'error' | 'info';

export type ToastPayload = {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  duration: number;
};

type Listener = (toast: ToastPayload) => void;

const listeners = new Set<Listener>();
let seq = 0;

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 2400,
  info: 2800,
  error: 3800,
};

export function showToast(
  kind: ToastKind,
  title: string,
  message?: string,
  duration?: number,
) {
  const toast: ToastPayload = {
    id: ++seq,
    kind,
    title,
    message: message?.trim() ? message : undefined,
    duration: duration ?? DEFAULT_DURATION[kind],
  };
  listeners.forEach((fn) => fn(toast));
}

export const toast = {
  success: (title: string, message?: string) => showToast('success', title, message),
  error: (title: string, message?: string) => showToast('error', title, message),
  info: (title: string, message?: string) => showToast('info', title, message),
};

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
