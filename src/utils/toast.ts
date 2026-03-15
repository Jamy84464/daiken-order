type ToastCallback = (data: { msg: string; type: string }) => void;

let _toastListeners: ToastCallback[] = [];

export function onToast(fn: ToastCallback): () => void {
  _toastListeners.push(fn);
  return () => { _toastListeners = _toastListeners.filter(f => f !== fn); };
}

export function showToast(msg: string, type: string = "error"): void {
  _toastListeners.forEach(fn => fn({ msg, type }));
}
