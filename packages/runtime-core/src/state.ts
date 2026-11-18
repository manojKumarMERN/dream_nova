export interface RuntimeRouteState {
  pathname: string;
  pageId: string | undefined;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface RuntimeFormState {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  formErrors: string[];
  loading: boolean;
  submitted: boolean;
  success?: string | undefined;
  failure?: string | undefined;
}

export interface RuntimeComponentState {
  value?: unknown;
  errors?: Record<string, string>;
  [key: string]: unknown;
}

export interface RuntimeMessage {
  id: string;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export interface RuntimeErrorRecord {
  id: string;
  message: string;
  code?: string | undefined;
}

export interface RuntimeStateSnapshot {
  app: Record<string, unknown>;
  pages: Record<string, Record<string, unknown>>;
  components: Record<string, RuntimeComponentState>;
  forms: Record<string, RuntimeFormState>;
  hidden: Record<string, boolean>;
  route: RuntimeRouteState;
  messages: RuntimeMessage[];
  errors: RuntimeErrorRecord[];
}

export function createEmptyFormState(): RuntimeFormState {
  return {
    values: {},
    errors: {},
    formErrors: [],
    loading: false,
    submitted: false
  };
}

export function createInitialRuntimeState(
  route: RuntimeRouteState = {
    pathname: '/',
    pageId: undefined,
    params: {},
    query: {}
  }
): RuntimeStateSnapshot {
  return {
    app: {},
    pages: {},
    components: {},
    forms: {},
    hidden: {},
    route,
    messages: [],
    errors: []
  };
}

export type RuntimeStateListener = () => void;

export class RuntimeStateStore {
  private current: RuntimeStateSnapshot;
  private readonly listeners = new Set<RuntimeStateListener>();
  private sequence = 0;

  constructor(initial: RuntimeStateSnapshot = createInitialRuntimeState()) {
    this.current = initial;
  }

  getSnapshot = (): RuntimeStateSnapshot => this.current;

  subscribe = (listener: RuntimeStateListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(updater: (current: RuntimeStateSnapshot) => RuntimeStateSnapshot): void {
    const next = updater(this.current);
    if (next === this.current) {
      return;
    }
    this.current = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  updateApp(patch: Record<string, unknown>): void {
    this.set((current) => ({ ...current, app: { ...current.app, ...patch } }));
  }

  updatePage(pageId: string, patch: Record<string, unknown>): void {
    this.set((current) => ({
      ...current,
      pages: {
        ...current.pages,
        [pageId]: { ...(current.pages[pageId] ?? {}), ...patch }
      }
    }));
  }

  updateComponent(nodeId: string, patch: RuntimeComponentState): void {
    this.set((current) => ({
      ...current,
      components: {
        ...current.components,
        [nodeId]: { ...(current.components[nodeId] ?? {}), ...patch }
      }
    }));
  }

  updateForm(formId: string, updater: (current: RuntimeFormState) => RuntimeFormState): void {
    this.set((current) => ({
      ...current,
      forms: {
        ...current.forms,
        [formId]: updater(current.forms[formId] ?? createEmptyFormState())
      }
    }));
  }

  setHidden(nodeId: string, hidden: boolean): void {
    this.set((current) => ({ ...current, hidden: { ...current.hidden, [nodeId]: hidden } }));
  }

  setRoute(route: RuntimeRouteState): void {
    this.set((current) => ({ ...current, route }));
  }

  addMessage(kind: RuntimeMessage['kind'], text: string): void {
    this.sequence += 1;
    const message: RuntimeMessage = { id: `message-${String(this.sequence)}`, kind, text };
    this.set((current) => ({ ...current, messages: [...current.messages, message] }));
  }

  addError(error: Omit<RuntimeErrorRecord, 'id'>): void {
    this.sequence += 1;
    const record: RuntimeErrorRecord = { id: `error-${String(this.sequence)}`, ...error };
    this.set((current) => ({ ...current, errors: [...current.errors, record] }));
  }

  reset(route?: RuntimeRouteState): void {
    this.set(() => createInitialRuntimeState(route));
  }
}
