import { useEffect } from 'react';

export interface DesignerShortcutHandlers {
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useDesignerShortcuts(handlers: DesignerShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'c') {
        event.preventDefault();
        handlers.onCopy();
      } else if (modifier && key === 'x') {
        event.preventDefault();
        handlers.onCut();
      } else if (modifier && key === 'v') {
        event.preventDefault();
        handlers.onPaste();
      } else if (modifier && key === 'z' && event.shiftKey) {
        event.preventDefault();
        handlers.onRedo();
      } else if (modifier && key === 'z') {
        event.preventDefault();
        handlers.onUndo();
      } else if (modifier && key === 'y') {
        event.preventDefault();
        handlers.onRedo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handlers.onDelete();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
