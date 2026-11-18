import type { AppSummaryRecord, VersionRecord } from '../types';
import { Icon } from './Icons';

interface ToolbarProps {
  appName: string;
  appId: string;
  versionId: string;
  versions: readonly VersionRecord[];
  apps: readonly AppSummaryRecord[];
  status: string;
  dirty: boolean;
  saving: boolean;
  aiOpen: boolean;
  preview: boolean;
  onTogglePreview: () => void;
  onSave: () => void;
  onValidate: () => void;
  onPublish: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleAi: () => void;
  onReopen: (versionId: string) => void;
  onOpenApp: (appId: string) => void;
  onAddPage: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="app-toolbar">
      <div className="toolbar-brand">
        <span className="brand-mark">N</span>
        <span className="brand-name">NOVA</span>
        <span className="brand-divider" />
        <span className="brand-product">Visual Builder</span>
      </div>
      <div className="toolbar-project">
        <label className="app-picker" title="Open an application">
          <select
            aria-label="Open application"
            value=""
            onChange={(event) => {
              if (event.target.value) {
                props.onOpenApp(event.target.value);
              }
            }}
          >
            <option value="">Open app…</option>
            {props.apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name} · {app.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <span className="project-name">{props.appName}</span>
        <span className="project-id">{props.appId.slice(0, 8)}</span>
        <span className={`project-status${props.dirty ? ' dirty' : ''}`}>
          {props.saving ? 'Saving…' : props.dirty ? 'Unsaved changes' : props.status}
        </span>
      </div>
      <div className="toolbar-actions">
        <button type="button" aria-label="Undo" title="Undo" onClick={props.onUndo}>
          <Icon name="undo" size={15} />
        </button>
        <button type="button" aria-label="Redo" title="Redo" onClick={props.onRedo}>
          <Icon name="redo" size={15} />
        </button>
        <span className="toolbar-separator" />
        <button type="button" onClick={props.onAddPage}>
          <Icon name="plus" size={15} /> Page
        </button>
        <button type="button" onClick={props.onValidate}>
          <Icon name="check" size={15} /> Validate
        </button>
        <button type="button" onClick={props.onSave} disabled={props.saving}>
          <Icon name="save" size={15} /> Save
        </button>
        <button
          type="button"
          className={props.preview ? 'active' : ''}
          aria-label="Toggle preview"
          onClick={props.onTogglePreview}
        >
          <Icon name={props.preview ? 'edit' : 'play'} size={15} />
          <span>{props.preview ? 'Design' : 'Preview'}</span>
        </button>
        <label className="version-picker" title="Reopen a saved version">
          <Icon name="history" size={15} />
          <select
            aria-label="Saved versions"
            value=""
            onChange={(event) => {
              if (event.target.value) {
                props.onReopen(event.target.value);
              }
            }}
          >
            <option value="">Versions ({props.versions.length})</option>
            {props.versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label} · {new Date(version.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button-accent" onClick={props.onPublish}>
          <Icon name="upload" size={15} /> Publish
        </button>
        <button type="button" className={props.aiOpen ? 'active' : ''} onClick={props.onToggleAi}>
          <Icon name="sparkles" size={15} /> AI
        </button>
      </div>
      <span className="toolbar-version" title="Current version">
        {props.versionId}
      </span>
    </header>
  );
}
