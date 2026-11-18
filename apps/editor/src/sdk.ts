import type { ComponentContract } from '@nova/contracts';
import { NovaClient } from '@nova/sdk';
import type { AppRecord, AppVersionRecord, ValidationReport } from '@nova/sdk';
import { createMinimalAppDefinition, runtimePayloadToDefinition } from '@nova/spec';
import type { AppDefinition, ComponentNode, RuntimePayloadLike } from '@nova/spec';
import {
  cloneDefinition,
  cloneNode,
  insertNodeIntoDefinition,
  removeNodesFromDefinition,
  updateNodeInDefinition
} from './tree';
import type { AppSummaryRecord, Proposal, SaveOptions, SaveResult, VersionRecord } from './types';

export const API_BASE_URL = import.meta.env.VITE_NOVA_API_URL ?? 'http://localhost:3000';

const ORG_ID = import.meta.env.VITE_NOVA_ORG_ID;
const USER_ID = import.meta.env.VITE_NOVA_USER_ID;
const USER_ROLES = import.meta.env.VITE_NOVA_USER_ROLES;

export const novaClient = new NovaClient({
  baseUrl: API_BASE_URL,
  headers: {
    ...(ORG_ID === undefined ? {} : { 'x-org-id': ORG_ID }),
    ...(USER_ID === undefined ? {} : { 'x-user-id': USER_ID }),
    ...(USER_ROLES === undefined ? {} : { 'x-user-roles': USER_ROLES })
  }
});

interface SummaryLike {
  type: string;
  version: string;
  displayName: string;
  category: string;
}

interface StoredApp {
  definition: AppDefinition;
  versions: VersionRecord[];
  versionId?: string;
}

const STORAGE_KEY = 'nova.editor.apps';

function readStore(): Record<string, StoredApp> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, StoredApp>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredApp>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    return;
  }
}

function asDefinition(value: unknown): AppDefinition | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if ('definition' in value) {
    return asDefinition((value as { definition: unknown }).definition);
  }
  const candidate = value as Partial<AppDefinition>;
  if (Array.isArray(candidate.components) && typeof candidate.appId === 'string') {
    return candidate as AppDefinition;
  }
  return undefined;
}

function isRuntimePayload(value: unknown): value is RuntimePayloadLike {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { components?: unknown; pages?: unknown; targets?: unknown };
  return (
    Array.isArray(candidate.components) &&
    Array.isArray(candidate.pages) &&
    Array.isArray(candidate.targets)
  );
}

function asProposal(value: unknown): Proposal | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as {
    id?: unknown;
    summary?: unknown;
    changes?: unknown;
    definition?: unknown;
    baseVersionId?: unknown;
    operations?: unknown;
  };
  if (
    typeof candidate.summary === 'string' &&
    typeof candidate.baseVersionId === 'string' &&
    Array.isArray(candidate.operations)
  ) {
    const operations = candidate.operations as Array<Record<string, unknown>>;
    return {
      id: `remote-${Date.now()}`,
      summary: candidate.summary,
      changes: operations.map((operation) => ({
        op: 'update' as const,
        nodeId: String(operation['nodeId'] ?? operation['sourceNodeId'] ?? 'workflow'),
        props: {}
      })),
      baseVersionId: candidate.baseVersionId,
      changeProposal: value
    };
  }
  if (typeof candidate.summary === 'string' && Array.isArray(candidate.changes)) {
    return {
      id: typeof candidate.id === 'string' ? candidate.id : `local-${Date.now()}`,
      summary: candidate.summary,
      changes: candidate.changes as Proposal['changes'],
      ...(asDefinition(candidate.definition) === undefined
        ? {}
        : { definition: asDefinition(candidate.definition) }),
      ...(typeof candidate.baseVersionId === 'string'
        ? { baseVersionId: candidate.baseVersionId }
        : {}),
      ...(candidate.operations === undefined ? {} : { changeProposal: value })
    };
  }
  const nested = asDefinition(value);
  if (nested) {
    return {
      id: `proposal-${Date.now()}`,
      summary: 'Generated proposal',
      changes: [],
      definition: nested
    };
  }
  return undefined;
}

function asVersionRecords(versions: AppVersionRecord[]): VersionRecord[] {
  return [...versions]
    .sort((left, right) => left.versionNumber - right.versionNumber)
    .map((version) => ({
      id: version.id,
      label: `v${version.versionNumber}`,
      createdAt: version.createdAt
    }));
}

function writeLocalSave(
  definition: AppDefinition,
  appId: string,
  label: string,
  versionId: string
): void {
  const store = readStore();
  const entry = store[appId] ?? { definition, versions: [] };
  entry.definition = cloneDefinition(definition);
  entry.versionId = versionId;
  entry.versions = [
    { id: versionId, label, createdAt: new Date().toISOString() },
    ...entry.versions
  ].slice(0, 30);
  store[appId] = entry;
  writeStore(store);
}

function toChangeProposal(proposal: Proposal, definition: AppDefinition): unknown | undefined {
  if (proposal.changeProposal !== undefined) {
    return proposal.changeProposal;
  }
  const baseVersionId = proposal.baseVersionId;
  if (baseVersionId === undefined || baseVersionId === '') {
    return undefined;
  }
  if (proposal.definition !== undefined) {
    return {
      baseVersionId,
      summary: proposal.summary,
      rationale: '',
      riskLevel: 'MEDIUM',
      source: 'editor',
      operations: [{ op: 'replaceDefinition', definition: proposal.definition }]
    };
  }
  const page = definition.pages[0];
  if (page === undefined) {
    return undefined;
  }
  const operations: unknown[] = proposal.changes.flatMap((change): unknown[] => {
    if (change.op === 'update') {
      return [{ op: 'updateComponent', nodeId: change.nodeId, patch: { props: change.props } }];
    }
    if (change.op === 'add') {
      return [
        {
          op: 'addComponent',
          pageId: page.id,
          parentId: change.parentId ?? page.rootNodeId,
          slot: change.slot,
          node: change.node
        }
      ];
    }
    if (change.op === 'delete') {
      return change.nodeIds.length === 1
        ? [{ op: 'removeComponent', nodeId: change.nodeIds[0] }]
        : [{ op: 'bulkDeleteComponents', nodeIds: change.nodeIds }];
    }
    return [{ op: 'updateComponent', nodeId: change.nodeId, patch: { name: change.name } }];
  });
  if (operations.length === 0) {
    return undefined;
  }
  return {
    baseVersionId,
    summary: proposal.summary,
    rationale: '',
    riskLevel: 'MEDIUM',
    source: 'editor',
    operations
  };
}

function validationDetail(result: ValidationReport): string {
  if (result.valid) {
    return 'Remote validation passed';
  }
  return result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
}

export function applyProposalChanges(definition: AppDefinition, proposal: Proposal): AppDefinition {
  if (proposal.definition) {
    return cloneDefinition(proposal.definition);
  }
  let next = cloneDefinition(definition);
  for (const change of proposal.changes) {
    if (change.op === 'update') {
      next = updateNodeInDefinition(next, change.nodeId, (node: ComponentNode) => ({
        ...node,
        props: { ...node.props, ...change.props }
      }));
    } else if (change.op === 'add') {
      next = insertNodeIntoDefinition(next, cloneNode(change.node), {
        parentId: change.parentId,
        slot: change.slot,
        index: Number.MAX_SAFE_INTEGER
      });
    } else if (change.op === 'delete') {
      next = removeNodesFromDefinition(next, change.nodeIds);
    } else if (change.op === 'rename') {
      next = updateNodeInDefinition(next, change.nodeId, (node: ComponentNode) => ({
        ...node,
        name: change.name
      }));
    }
  }
  return next;
}

export async function loadContracts(): Promise<ComponentContract[]> {
  try {
    if (typeof novaClient.listComponentContracts === 'function') {
      const contracts = await novaClient.listComponentContracts();
      if (Array.isArray(contracts) && contracts.length > 0) {
        return contracts as unknown as ComponentContract[];
      }
    }
    if (typeof novaClient.listComponents === 'function') {
      const summaries = (await novaClient.listComponents()) as unknown as SummaryLike[];
      if (Array.isArray(summaries) && summaries.length > 0) {
        return summaries.map((summary) => ({
          type: summary.type,
          version: summary.version,
          displayName: summary.displayName,
          category: summary.category,
          propsSchema: { type: 'object', properties: {} },
          defaults: {},
          events: {},
          slots: {},
          capabilities: [],
          supportedTargets: ['web'] as ComponentContract['supportedTargets'],
          renderers: {},
          constraints: {},
          migrations: []
        })) as unknown as ComponentContract[];
      }
    }
  } catch {
    return [];
  }
  return [];
}

export async function saveApp(
  definition: AppDefinition,
  appId: string,
  options: SaveOptions = {}
): Promise<SaveResult> {
  const label = options.label ?? 'Autosave';
  let targetAppId = appId;
  try {
    let remoteApp: AppRecord | undefined;
    if (typeof novaClient.getApp === 'function') {
      try {
        remoteApp = await novaClient.getApp(appId);
      } catch {
        remoteApp = undefined;
      }
    }

    if (remoteApp !== undefined) {
      if (typeof novaClient.createVersion !== 'function') {
        throw new Error('The control plane does not support version creation');
      }
      const version = await novaClient.createVersion(appId, {
        definition,
        ...(options.parentVersionId === undefined
          ? {}
          : { parentVersionId: options.parentVersionId }),
        changeSummary: label
      });
      const result: SaveResult = {
        appId,
        versionId: version.id,
        versionNumber: version.versionNumber,
        remote: true,
        localOnly: false
      };
      writeLocalSave(definition, appId, label, version.id);
      return result;
    }

    if (typeof novaClient.createApp !== 'function') {
      throw new Error('The control plane does not support app creation');
    }
    const app = await novaClient.createApp({
      orgId: ORG_ID ?? 'dev-org',
      name: definition.name,
      ...(definition.description === undefined ? {} : { description: definition.description }),
      definition
    });
    targetAppId = app.id;
    const versions =
      typeof novaClient.listVersions === 'function' ? await novaClient.listVersions(app.id) : [];
    const latest = versions[versions.length - 1];
    const result: SaveResult = {
      appId: app.id,
      ...(latest === undefined
        ? {}
        : { versionId: latest.id, versionNumber: latest.versionNumber }),
      versionId: latest?.id ?? `local-${Date.now()}`,
      remote: true,
      localOnly: false
    };
    writeLocalSave(definition, app.id, label, result.versionId);
    return result;
  } catch (error) {
    writeLocalSave(definition, targetAppId, label, `local-${Date.now()}`);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function loadVersions(appId: string): Promise<VersionRecord[]> {
  try {
    if (typeof novaClient.listVersions === 'function') {
      return asVersionRecords(await novaClient.listVersions(appId));
    }
  } catch {
    return readStore()[appId]?.versions ?? [];
  }
  return readStore()[appId]?.versions ?? [];
}

export async function listApps(): Promise<AppSummaryRecord[]> {
  try {
    const records = await novaClient.listApps(ORG_ID ?? 'dev-org');
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      slug: record.slug,
      status: record.status
    }));
  } catch {
    return Object.keys(readStore()).map((id) => ({
      id,
      name: readStore()[id]?.definition.name ?? id,
      slug: id,
      status: 'LOCAL'
    }));
  }
}

export async function loadAppDefinition(
  appId: string,
  versionId?: string
): Promise<{ definition: AppDefinition; versionId: string } | undefined> {
  const versions = await loadVersions(appId);
  const selectedVersionId = versionId ?? versions[versions.length - 1]?.id;
  if (selectedVersionId !== undefined && !selectedVersionId.startsWith('local-')) {
    try {
      const definition = await reopenVersion(appId, selectedVersionId);
      return { definition, versionId: selectedVersionId };
    } catch {
      return undefined;
    }
  }
  const definition = asDefinition(readStore()[appId]?.definition);
  return definition === undefined
    ? undefined
    : { definition, versionId: selectedVersionId ?? 'local' };
}

export async function reopenVersion(appId: string, versionId: string): Promise<AppDefinition> {
  try {
    if (versionId.startsWith('local-') && typeof novaClient.getVersion !== 'function') {
      return asDefinition(readStore()[appId]?.definition) ?? createMinimalAppDefinition();
    }
    if (typeof novaClient.getVersion === 'function') {
      const version = await novaClient.getVersion(versionId);
      const definition = asDefinition(version.definition);
      if (definition) {
        return definition;
      }
    }
  } catch {
    return asDefinition(readStore()[appId]?.definition) ?? createMinimalAppDefinition();
  }
  return asDefinition(readStore()[appId]?.definition) ?? createMinimalAppDefinition();
}

export async function validateDefinition(
  definition: AppDefinition
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (typeof novaClient.validateDefinition === 'function') {
      const result = await novaClient.validateDefinition(definition);
      return { ok: result.valid, detail: validationDetail(result) };
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
  return { ok: definition.components.length > 0, detail: 'Local structural check passed' };
}

export async function validateProposal(
  proposal: Proposal
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (typeof novaClient.validateProposal === 'function') {
      const baseVersionId = proposal.baseVersionId;
      const changeProposal = toChangeProposal(
        proposal,
        proposal.definition ?? createMinimalAppDefinition()
      );
      if (baseVersionId !== undefined && changeProposal !== undefined) {
        const result = await novaClient.validateProposal({
          baseVersionId,
          proposal: changeProposal
        });
        return { ok: result.valid, detail: validationDetail(result) };
      }
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
  return { ok: proposal.changes.length > 0, detail: 'Local proposal check passed' };
}

export async function publishApp(appId: string, versionId: string): Promise<void> {
  if (typeof novaClient.publish !== 'function') {
    return;
  }
  const isRemoteVersion =
    versionId !== '' && versionId !== 'draft' && !versionId.startsWith('local-');
  await novaClient.publish(appId, isRemoteVersion ? { versionId } : {});
}

export async function generateProposal(
  appId: string,
  instruction: string,
  selectedNodeIds: string[]
): Promise<Proposal> {
  try {
    if (typeof novaClient.generateAiProposal === 'function') {
      const result = await novaClient.generateAiProposal(appId, {
        instruction,
        selectedNodeIds
      });
      const proposal = asProposal(result);
      if (proposal) {
        return proposal;
      }
    }
  } catch {
    return buildLocalProposal(appId, instruction, selectedNodeIds);
  }
  return buildLocalProposal(appId, instruction, selectedNodeIds);
}

async function buildLocalProposal(
  appId: string,
  instruction: string,
  selectedNodeIds: string[]
): Promise<Proposal> {
  const versions = await loadVersions(appId);
  const latest = versions[versions.length - 1];
  return {
    id: `local-${Date.now()}`,
    summary: instruction || 'No instruction provided',
    changes: selectedNodeIds.map((nodeId) => ({
      op: 'update' as const,
      nodeId,
      props: { content: instruction }
    })),
    ...(latest === undefined ? {} : { baseVersionId: latest.id })
  };
}

export async function applyProposalToApp(
  appId: string,
  proposal: Proposal,
  definition: AppDefinition
): Promise<AppDefinition> {
  try {
    if (typeof novaClient.applyProposal === 'function') {
      const baseVersionId = proposal.baseVersionId;
      const changeProposal = toChangeProposal(proposal, definition);
      if (baseVersionId !== undefined && changeProposal !== undefined) {
        const result = await novaClient.applyProposal(appId, {
          baseVersionId,
          proposal: changeProposal,
          approved: true
        });
        const applied = asDefinition(result.definition);
        if (applied) {
          return applied;
        }
      }
    }
  } catch {
    return applyProposalChanges(definition, proposal);
  }
  return applyProposalChanges(definition, proposal);
}

export async function loadRuntime(slug: string): Promise<AppDefinition | undefined> {
  try {
    if (typeof novaClient.getRuntime === 'function') {
      const result = await novaClient.getRuntime(slug);
      const nested = asDefinition(result);
      if (nested) {
        return nested;
      }
      if (isRuntimePayload(result)) {
        return runtimePayloadToDefinition(result as RuntimePayloadLike);
      }
    }
  } catch {
    return undefined;
  }
  try {
    const response = await fetch(
      `/api/runtime/v1/apps/${encodeURIComponent(slug)}/releases/current`
    );
    if (!response.ok) {
      return undefined;
    }
    const result: unknown = await response.json();
    const nested = asDefinition(result);
    if (nested) {
      return nested;
    }
    return isRuntimePayload(result) ? runtimePayloadToDefinition(result) : undefined;
  } catch {
    return undefined;
  }
}
