import { useCallback, useSyncExternalStore } from 'react';
import type { EditorSessionLike, EditorState } from '../types';

export function useEditorState(session: EditorSessionLike): EditorState {
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getSnapshot = useCallback(() => session.getState(), [session]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
