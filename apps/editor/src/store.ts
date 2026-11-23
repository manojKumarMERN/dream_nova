import { create } from 'zustand';
import type { ComponentContract } from '@nova/contracts';
import { BUILT_IN_COMPONENT_CONTRACTS } from '@nova/component-registry';
import type { DataEnvironment } from './sdk';
import { loadAppDefinition, listApps, loadVersions, saveApp } from './sdk';
import { createSession } from './session';
import type {
  AppSummaryRecord,
  EditorSessionLike,
  EditorState,
  Toast,
  VersionRecord,
  WorkflowRef
} from './types';
import type { AppDefinition } from '@nova/spec';

export type LeftTab = 'components' | 'pages' | 'assets' | 'data';

export type DataStudioSection =
  | 'overview'
  | 'designer'
  | 'tables'
  | 'relationships'
  | 'records'
  | 'query-builder'
  | 'sql'
  | 'sources'
  | 'connectors'
  | 'migrations'
  | 'permissions'
  | 'logs';

export type DataStudioMode = 'simple' | 'advanced';

let activePageIdRef: string | undefined;

export const studioSession: EditorSessionLike = createSession(undefined, () => activePageIdRef);
const initialState = studioSession.getState();
activePageIdRef = initialState.definition.pages[0]?.id;

export interface StudioStore {
  session: EditorSessionLike;
  editor: EditorState;
  contractsReady: boolean;
  componentContracts: readonly ComponentContract[];
  activePageId: string | undefined;
  leftTab: LeftTab;
  appId: string;
  versionId: string;
  versions: VersionRecord[];
  apps: AppSummaryRecord[];
  status: string;
  saving: boolean;
  dirty: boolean;
  saveError: string | undefined;
  savedDefinition: AppDefinition;
  saveSequence: number;
  preview: boolean;
  showGrid: boolean;
  zoom: number;
  pan: { x: number; y: number };
  aiOpen: boolean;
  workflowTarget: WorkflowRef | null;
  menu: { id: string; x: number; y: number } | null;
  notice: { kind: Toast['kind']; message: string; id: number } | null;
  dataStudioSection: DataStudioSection;
  dataStudioMode: DataStudioMode;
  dataEnvironment: DataEnvironment;
  dataStudioSearch: string;
  dataStudioSidebarCollapsed: boolean;
  setDataStudioSection: (section: DataStudioSection) => void;
  setDataStudioMode: (mode: DataStudioMode) => void;
  setDataEnvironment: (environment: DataEnvironment) => void;
  setDataStudioSearch: (search: string) => void;
  toggleDataStudioSidebar: () => void;
  setContractsReady: (ready: boolean) => void;
  setComponentContracts: (contracts: readonly ComponentContract[]) => void;
  setActivePage: (pageId: string) => void;
  setLeftTab: (tab: LeftTab) => void;
  setStatus: (status: string) => void;
  setPreview: (preview: boolean) => void;
  setShowGrid: (showGrid: boolean) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  resetViewport: () => void;
  setAiOpen: (open: boolean) => void;
  setWorkflowTarget: (target: WorkflowRef | null) => void;
  setMenu: (menu: { id: string; x: number; y: number } | null) => void;
  notify: (kind: Toast['kind'], message: string) => void;
  setVersions: (versions: VersionRecord[]) => void;
  refreshVersions: () => Promise<void>;
  refreshApps: () => Promise<void>;
  markSaved: (definition: AppDefinition, versionId?: string) => void;
  save: (options?: { label?: string; autosave?: boolean }) => Promise<void>;
  openApp: (appId: string, versionId?: string) => Promise<boolean>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useStudioStore = create<StudioStore>((set, get) => ({
  session: studioSession,
  editor: initialState,
  contractsReady: false,
  componentContracts: BUILT_IN_COMPONENT_CONTRACTS,
  activePageId: activePageIdRef,
  leftTab: 'components',
  appId: initialState.definition.appId,
  versionId: 'draft',
  versions: [],
  apps: [],
  status: 'Ready',
  saving: false,
  dirty: false,
  saveError: undefined,
  savedDefinition: initialState.definition,
  saveSequence: 0,
  preview: false,
  showGrid: true,
  zoom: 100,
  pan: { x: 0, y: 0 },
  aiOpen: false,
  workflowTarget: null,
  menu: null,
  notice: null,
  dataStudioSection: 'overview',
  dataStudioMode: 'simple',
  dataEnvironment: 'development',
  dataStudioSearch: '',
  dataStudioSidebarCollapsed: false,

  setDataStudioSection: (dataStudioSection) => set({ dataStudioSection }),
  setDataStudioMode: (dataStudioMode) => set({ dataStudioMode }),
  setDataEnvironment: (dataEnvironment) => set({ dataEnvironment }),
  setDataStudioSearch: (dataStudioSearch) => set({ dataStudioSearch }),
  toggleDataStudioSidebar: () =>
    set((state) => ({ dataStudioSidebarCollapsed: !state.dataStudioSidebarCollapsed })),
  setContractsReady: (ready) => set({ contractsReady: ready }),
  setComponentContracts: (contracts) => set({ componentContracts: contracts }),
  setActivePage: (pageId) => {
    activePageIdRef = pageId;
    set({ activePageId: pageId });
  },
  setLeftTab: (tab) => set({ leftTab: tab }),
  setStatus: (status) => set({ status }),
  setPreview: (preview) => set({ preview }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(150, zoom)) }),
  setPan: (pan) => set({ pan }),
  resetViewport: () => set({ pan: { x: 0, y: 0 }, zoom: 100 }),
  setAiOpen: (open) => set({ aiOpen: open }),
  setWorkflowTarget: (target) => set({ workflowTarget: target }),
  setMenu: (menu) => set({ menu }),
  notify: (kind, message) =>
    set({ notice: { kind, message, id: Date.now() + Math.floor(Math.random() * 1000) } }),
  setVersions: (versions) => set({ versions }),

  refreshVersions: async () => {
    const { appId } = get();
    try {
      set({ versions: await loadVersions(appId) });
    } catch {
      set({ versions: [] });
    }
  },

  refreshApps: async () => {
    try {
      set({ apps: await listApps() });
    } catch {
      set({ apps: [] });
    }
  },

  markSaved: (definition, versionId) => {
    set(() => ({
      dirty: false,
      saveError: undefined,
      savedDefinition: definition,
      status: 'Saved',
      ...(versionId === undefined ? {} : { versionId })
    }));
  },

  save: async (options = {}) => {
    const current = get();
    const token = current.saveSequence + 1;
    const definition = current.editor.definition;
    const label = options.label ?? (options.autosave ? 'Autosave' : 'Manual save');
    const usableVersionId =
      current.versionId === 'draft' || current.versionId.startsWith('local-')
        ? undefined
        : current.versionId;
    set({
      saveSequence: token,
      saving: true,
      status: options.autosave === true ? 'Autosaving…' : 'Saving…',
      saveError: undefined
    });
    try {
      const result = await saveApp(definition, current.appId, {
        label,
        ...(usableVersionId === undefined ? {} : { parentVersionId: usableVersionId }),
        ...(options.autosave === undefined ? {} : { autosave: options.autosave })
      });
      const latest = get();
      if (latest.saveSequence !== token) {
        return;
      }
      if (latest.editor.definition !== definition) {
        set({ saving: false, dirty: true, status: 'Pending changes' });
        return;
      }
      const versions = await loadVersions(result.appId);
      set({
        appId: result.appId,
        versionId: result.versionId,
        versions,
        saving: false,
        dirty: false,
        saveError: undefined,
        savedDefinition: definition,
        status: result.localOnly ? 'Saved locally' : `Saved ${result.versionId}`
      });
      get().notify('success', result.localOnly ? 'Saved locally' : `Saved ${result.versionId}`);
    } catch (error) {
      if (get().saveSequence !== token) {
        return;
      }
      const detail = messageOf(error);
      set({ saving: false, status: 'Save failed', saveError: detail });
      get().notify('error', detail);
    }
  },

  openApp: async (appId, versionId) => {
    set({ status: 'Opening…' });
    try {
      const loaded = await loadAppDefinition(appId, versionId);
      if (loaded === undefined) {
        set({ status: 'Open failed' });
        get().notify('error', 'The application definition could not be loaded');
        return false;
      }
      studioSession.replaceDefinition(loaded.definition);
      const pageId = loaded.definition.pages[0]?.id;
      if (pageId !== undefined) {
        activePageIdRef = pageId;
      }
      set((state) => ({
        editor: studioSession.getState(),
        appId: loaded.definition.appId,
        versionId: loaded.versionId,
        activePageId: pageId,
        dirty: false,
        savedDefinition: loaded.definition,
        status: 'Opened',
        versions: state.versions
      }));
      await get().refreshVersions();
      return true;
    } catch (error) {
      set({ status: 'Open failed' });
      get().notify('error', messageOf(error));
      return false;
    }
  }
}));

studioSession.subscribe((state) => {
  const previous = useStudioStore.getState().editor;
  const definitionChanged = previous.definition !== state.definition;
  useStudioStore.setState((current) => ({
    editor: state,
    ...(definitionChanged ? { dirty: true, saveError: undefined } : {}),
    ...(state.definition.pages.some((page) => page.id === current.activePageId)
      ? {}
      : { activePageId: state.definition.pages[0]?.id })
  }));
  if (!state.definition.pages.some((page) => page.id === activePageIdRef)) {
    activePageIdRef = state.definition.pages[0]?.id;
  }
});
