import { useEffect, useMemo, useState } from 'react';
import { builtInComponentRegistry } from '@nova/component-registry';
import type { ComponentContract } from '@nova/contracts';
import { BrowserNavigationAdapter, createRuntimeEngine } from '@nova/runtime-core';
import { createFormValidationAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import { WebRuntimeApp } from '@nova/web-runtime';
import {
  LuActivity,
  LuLayoutDashboard,
  LuMonitor,
  LuSmartphone,
  LuSparkles,
  LuTablet
} from 'react-icons/lu';
import { createWebRuntimeDataAccess } from './data-access';
import { loadRuntimeContracts, loadRuntimeDefinition } from './runtime';
import { BREAKPOINTS } from './types';
import type { Breakpoint } from './types';

const FALLBACK_CONTRACTS = builtInComponentRegistry.list();

export default function App() {
  const slug = new URLSearchParams(window.location.search).get('app') ?? '';
  const [definition, setDefinition] = useState<AppDefinition>(() =>
    createFormValidationAppDefinition()
  );
  const [contracts, setContracts] = useState<readonly ComponentContract[]>([]);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');
  const [status, setStatus] = useState(slug ? 'Loading…' : 'Local development fallback');
  const [lastEvent, setLastEvent] = useState('');

  useEffect(() => {
    let active = true;
    loadRuntimeContracts()
      .then((loaded) => {
        if (active) {
          setContracts(loaded);
        }
      })
      .catch(() => {
        if (active) {
          setContracts([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!slug) {
      return;
    }
    loadRuntimeDefinition(slug)
      .then((loaded) => {
        if (active) {
          setDefinition(loaded);
          setStatus(`Loaded ${slug}`);
        }
      })
      .catch(() => {
        if (active) {
          setDefinition(createFormValidationAppDefinition());
          setStatus(`Fallback for ${slug}`);
        }
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const engine = useMemo(
    () =>
      createRuntimeEngine(definition, {
        contracts: contracts.length > 0 ? contracts : FALLBACK_CONTRACTS,
        navigation: new BrowserNavigationAdapter(),
        initialPath: `${window.location.pathname}${window.location.search}`,
        dataAccess: createWebRuntimeDataAccess(definition.appId),
        onEvent: (event) => setLastEvent(`${event.event} · ${event.nodeId}`),
        onError: (error) => setStatus(`Runtime error: ${error.message}`)
      }),
    [definition, contracts]
  );

  useEffect(() => {
    engine.setBreakpoint(breakpoint);
  }, [engine, breakpoint]);

  useEffect(() => () => engine.dispose(), [engine]);

  const runtimeProps = useMemo(() => ({ engine }), [engine]);

  return (
    <div className="runtime-app">
      <header className="runtime-header">
        <div className="runtime-brand">
          <span className="runtime-mark">
            <LuSparkles aria-hidden="true" size={14} />
          </span>
          <span>NOVA Runtime</span>
        </div>
        <div className="runtime-meta">
          <LuLayoutDashboard aria-hidden="true" size={13} />
          <strong>{definition.name}</strong>
          <span>{slug || 'local'}</span>
          <span className={`runtime-status${status.startsWith('Loaded') ? ' ok' : ''}`}>
            <LuActivity aria-hidden="true" size={12} />
            {status}
          </span>
        </div>
        <div className="runtime-breakpoints" role="group" aria-label="Breakpoint">
          {BREAKPOINTS.map((value) => (
            <button
              type="button"
              key={value}
              className={breakpoint === value ? 'active' : ''}
              aria-label={`${value} viewport`}
              onClick={() => setBreakpoint(value)}
            >
              {value === 'desktop' ? (
                <LuMonitor aria-hidden="true" size={13} />
              ) : value === 'tablet' ? (
                <LuTablet aria-hidden="true" size={13} />
              ) : (
                <LuSmartphone aria-hidden="true" size={13} />
              )}
              <span>{value}</span>
            </button>
          ))}
        </div>
      </header>
      <main className="runtime-stage" data-breakpoint={breakpoint}>
        <WebRuntimeApp {...runtimeProps} />
      </main>
      <footer className="runtime-footer">
        <span>
          <LuLayoutDashboard aria-hidden="true" size={12} /> Breakpoint: {breakpoint}
        </span>
        <span>
          <LuActivity aria-hidden="true" size={12} /> Last event: {lastEvent || 'none'}
        </span>
      </footer>
    </div>
  );
}
