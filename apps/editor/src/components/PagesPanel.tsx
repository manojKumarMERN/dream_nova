import { useState } from 'react';
import type { DragEvent } from 'react';
import { isLocked, locateNode } from '../tree';
import type { EditorState } from '../types';
import { Icon } from './Icons';

interface PagesPanelProps {
  state: EditorState;
  activePageId: string | undefined;
  onSelectPage: (pageId: string) => void;
  onAddPage: (name?: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onRemovePage: (pageId: string) => void;
}

export function PagesPanel(props: PagesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commitRename = (pageId: string) => {
    if (draft.trim().length > 0) {
      props.onRenamePage(pageId, draft.trim());
    }
    setEditingId(null);
  };

  const startDrag = (event: DragEvent<HTMLDivElement>, name: string) => {
    event.dataTransfer.setData('application/x-nova-page', name);
    event.dataTransfer.setData('text/plain', name);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <section className="panel-section pages-panel" aria-label="Page tree">
      <header className="panel-header">
        <span>Pages</span>
        <span className="panel-count">{props.state.definition.pages.length}</span>
      </header>
      <div className="pages-list">
        {props.state.definition.pages.map((page) => {
          const root = locateNode(props.state.definition, page.rootNodeId)?.node;
          const locked = root !== undefined && isLocked(props.state.definition, root);
          return (
            <div
              className={`page-row${props.activePageId === page.id ? ' active' : ''}`}
              key={page.id}
              draggable={editingId !== page.id}
              onDragStart={(event) => startDrag(event, page.name)}
              onClick={() => props.onSelectPage(page.id)}
              onDoubleClick={() => {
                setEditingId(page.id);
                setDraft(page.name);
              }}
            >
              <Icon name="layers" size={14} />
              {editingId === page.id ? (
                <input
                  aria-label="Rename page"
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => commitRename(page.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitRename(page.id);
                    }
                    if (event.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <span className="page-name">
                  {page.name} {locked ? '· locked' : ''}
                </span>
              )}
              <span className="page-route">{page.route}</span>
              <button
                type="button"
                aria-label={`Remove ${page.name}`}
                disabled={props.state.definition.pages.length < 2}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onRemovePage(page.id);
                }}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="pages-actions">
        <button type="button" onClick={() => props.onAddPage()}>
          <Icon name="plus" size={13} /> New page
        </button>
      </div>
      <div className="panel-hint">
        Drag a page onto the canvas to create it. Double-click to rename.
      </div>
    </section>
  );
}
