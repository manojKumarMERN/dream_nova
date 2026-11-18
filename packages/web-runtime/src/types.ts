import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type {
  RuntimeEngine,
  RuntimeFormState,
  RuntimeMessage,
  RuntimeModel,
  RuntimeNode,
  RuntimeTelemetryAdapter
} from '@nova/runtime-core';

export interface RuntimeEvent {
  nodeId: string;
  event: string;
  payload: unknown;
}

export type RuntimeEventHandler = (event: RuntimeEvent) => void;

export interface RuntimeRenderContext {
  messages: RuntimeMessage[];
  forms: Record<string, RuntimeFormState>;
}

export function emptyRuntimeRenderContext(): RuntimeRenderContext {
  return { messages: [], forms: {} };
}

export interface RuntimeRendererProps {
  node: RuntimeNode;
  onEvent?: RuntimeEventHandler | undefined;
  children?: ReactNode;
  slots: Record<string, ReactNode[]>;
  runtime?: RuntimeRenderContext | undefined;
}

export type RuntimeRenderer = (props: RuntimeRendererProps) => ReactElement | null;

export interface RenderNodeOptions {
  onEvent?: RuntimeEventHandler | undefined;
  runtime?: RuntimeRenderContext | undefined;
}

export interface WebRuntimeProps {
  model?: RuntimeModel | undefined;
  engine?: RuntimeEngine | undefined;
  route?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  onEvent?: RuntimeEventHandler | undefined;
  telemetry?: RuntimeTelemetryAdapter | undefined;
  appId?: string | undefined;
  versionId?: string | undefined;
  requestId?: string | undefined;
}
