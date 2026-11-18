import { Component, useMemo, useSyncExternalStore } from 'react';
import type { ErrorInfo, ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { RuntimeModel, RuntimeTelemetryAdapter } from '@nova/runtime-core';
import {
  createInitialRuntimeState,
  createNoopTelemetryAdapter,
  createThemeStyle
} from '@nova/runtime-core';
import { renderNode } from './renderers';
import type { WebRuntimeProps } from './types';
import { emptyRuntimeRenderContext } from './types';

const STATIC_STATE = createInitialRuntimeState();
const NOOP_SUBSCRIBE = () => () => undefined;

interface ErrorBoundaryProps {
  children: ReactNode;
  telemetry: RuntimeTelemetryAdapter;
  appId?: string | undefined;
  versionId?: string | undefined;
  requestId?: string | undefined;
}

interface ErrorBoundaryState {
  error: Error | undefined;
}

class RuntimeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(_error: Error, info: ErrorInfo): void {
    this.props.telemetry.emit({
      code: 'RUNTIME_RENDER_FAILED',
      category: 'rendering',
      level: 'error',
      message: 'Runtime render failed',
      timestamp: new Date().toISOString(),
      correlationId: this.props.requestId ?? 'runtime-render',
      ...(this.props.appId === undefined ? {} : { appId: this.props.appId }),
      ...(this.props.versionId === undefined ? {} : { versionId: this.props.versionId }),
      details: {
        hasComponentStack: typeof info.componentStack === 'string' && info.componentStack.length > 0
      }
    });
  }

  override render(): ReactNode {
    if (this.state.error !== undefined) {
      return (
        <div className="nova-runtime-error" role="alert">
          <strong>Runtime render failed</strong>
          <span>The runtime could not render this view.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WebRuntimeApp({
  model,
  engine,
  route,
  className,
  style,
  onEvent,
  telemetry,
  appId,
  versionId,
  requestId
}: WebRuntimeProps): ReactElement | null {
  const snapshot = useSyncExternalStore(
    engine?.subscribe ?? NOOP_SUBSCRIBE,
    engine?.getSnapshot ?? (() => STATIC_STATE),
    engine?.getSnapshot ?? (() => STATIC_STATE)
  );
  const activeModel = useMemo(() => {
    void snapshot;
    return engine?.getModel() ?? model;
  }, [engine, model, snapshot]);
  const runtime = useMemo(
    () =>
      engine === undefined
        ? emptyRuntimeRenderContext()
        : { messages: snapshot.messages, forms: snapshot.forms },
    [engine, snapshot]
  );

  if (activeModel === undefined) {
    return null;
  }

  const page = (() => {
    if (engine !== undefined && snapshot.route.pageId !== undefined) {
      const current = activeModel.pages.find((candidate) => candidate.id === snapshot.route.pageId);
      if (current !== undefined) {
        return current;
      }
    }
    if (route === undefined) {
      return activeModel.pages[0];
    }
    return activeModel.pages.find((candidate) => candidate.route === route) ?? activeModel.pages[0];
  })();

  if (page === undefined) {
    return null;
  }

  const eventHandler = engine?.handleEvent ?? onEvent;
  return (
    <main
      className={className ?? 'nova-runtime'}
      style={{ ...createThemeStyle(activeModel.theme), ...style }}
    >
      <RuntimeErrorBoundary
        telemetry={telemetry ?? createNoopTelemetryAdapter()}
        {...(appId === undefined ? {} : { appId })}
        {...(versionId === undefined ? {} : { versionId })}
        {...(requestId === undefined ? {} : { requestId })}
      >
        {renderNode(page.root, {
          runtime,
          ...(eventHandler === undefined ? {} : { onEvent: eventHandler })
        })}
        {runtime.messages.length === 0 ? null : (
          <div className="nova-runtime-messages" aria-live="polite">
            {runtime.messages.map((message) => (
              <div
                key={message.id}
                className={`nova-runtime-message nova-runtime-message--${message.kind}`}
              >
                {message.text}
              </div>
            ))}
          </div>
        )}
      </RuntimeErrorBoundary>
    </main>
  );
}

export interface WebRuntimeOptions extends Omit<WebRuntimeProps, 'model'> {
  root?: Element | null | undefined;
  selector?: string | undefined;
}

export class WebRuntime {
  private runtimeRoot: ReturnType<typeof createRoot> | null = null;

  constructor(
    private readonly model: RuntimeModel | undefined,
    private readonly options: WebRuntimeOptions = {}
  ) {}

  render(target?: string | Element | null): void {
    this.unmount();
    const requested = target ?? this.options.selector ?? this.options.root;
    const element =
      typeof requested === 'string' ? document.querySelector(requested) : (requested ?? null);
    if (element === null) {
      throw new Error('WebRuntime mount target was not found');
    }
    const { engine, route, className, style, onEvent } = this.options;
    this.runtimeRoot = createRoot(element);
    this.runtimeRoot.render(
      <WebRuntimeApp
        model={this.model}
        engine={engine}
        route={route}
        className={className}
        style={style}
        onEvent={onEvent}
      />
    );
  }

  unmount(): void {
    this.runtimeRoot?.unmount();
    this.runtimeRoot = null;
  }
}
