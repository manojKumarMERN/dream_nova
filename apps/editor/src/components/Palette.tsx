import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { categoryGroups } from '../contracts';
import type { InspectorContract } from '../types';
import { Icon } from './Icons';
import type { IconName } from './Icons';

interface PaletteProps {
  contracts: readonly InspectorContract[];
  onAdd: (type: string) => void;
  loading?: boolean;
}

export function Palette({ contracts, onAdd, loading = false }: PaletteProps) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered =
      normalized.length === 0
        ? contracts
        : contracts.filter((contract) =>
            [contract.displayName, contract.type, contract.category, contract.description ?? '']
              .join(' ')
              .toLowerCase()
              .includes(normalized)
          );
    return categoryGroups(filtered);
  }, [contracts, query]);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, contract: InspectorContract) => {
    event.dataTransfer.setData('application/x-nova-component', contract.type);
    event.dataTransfer.setData('text/plain', contract.type);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <section className="panel-section palette" aria-label="Component library">
      <header className="panel-header">
        <span>Components</span>
        <span className="panel-count">{contracts.length}</span>
      </header>
      <div className="palette-search">
        <Icon name="search" size={14} />
        <input
          aria-label="Search components"
          placeholder="Search components"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="palette-list">
        {loading ? <div className="panel-empty">Loading contracts…</div> : null}
        {!loading && groups.length === 0 ? (
          <div className="panel-empty">No components match “{query}”.</div>
        ) : null}
        {groups.map((group) => (
          <div className="palette-group" key={group.category}>
            <div className="palette-group-title">{group.category}</div>
            {group.contracts.map((contract) => (
              <button
                type="button"
                className="palette-item"
                key={`${contract.type}@${contract.version}`}
                draggable
                onDragStart={(event) => handleDragStart(event, contract)}
                onClick={() => onAdd(contract.type)}
                title={`${contract.displayName} · ${contract.type}@${contract.version}`}
                data-testid={`palette-${contract.type}`}
              >
                <span className="palette-item-icon">
                  <Icon name={(contract.icon as unknown as IconName) ?? 'box'} size={15} />
                </span>
                <span className="palette-item-body">
                  <span className="palette-item-name">{contract.displayName}</span>
                  <span className="palette-item-type">{contract.type}</span>
                </span>
                <span className="palette-item-add">
                  <Icon name="plus" size={14} />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
