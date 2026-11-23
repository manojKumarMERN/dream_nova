import { useState } from 'react';
import { Icon } from '../Icons';
import type { IconName } from '../Icons';
import {
  listGuidedActions,
  type GuidedActionCategory,
  type GuidedActionContext,
  type GuidedActionId
} from './guided-authoring';
import { EVENT_NODE_TEMPLATES } from './model';
import type { EventNodeTemplate } from './model';
import { listGuidedTemplates, type GuidedWorkflowTemplateId } from './workflow-templates';

export const EVENT_NODE_DRAG_TYPE = 'application/nova-event-node';
export const GUIDED_ACTION_DRAG_TYPE = 'application/nova-guided-action';

const TEMPLATE_ICONS: Record<EventNodeTemplate['type'], IconName> = {
  rise: 'rocket',
  listen: 'bell',
  riseListen: 'workflow'
};

const CATEGORY_ORDER: readonly GuidedActionCategory[] = [
  'Events',
  'UI Actions',
  'Data Actions',
  'Logic',
  'Outcomes'
];

interface WorkflowNodeLibraryProps {
  context: GuidedActionContext;
  onAdd: (type: EventNodeTemplate['type']) => void;
  onAddGuided: (id: GuidedActionId) => void;
  onApplyTemplate: (id: GuidedWorkflowTemplateId) => void;
}

export function WorkflowNodeLibrary({
  context,
  onAdd,
  onAddGuided,
  onApplyTemplate
}: WorkflowNodeLibraryProps) {
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLowerCase();
  const matches = (value: string) => value.toLowerCase().includes(normalized);
  const actions = listGuidedActions(context).filter(
    (action) =>
      normalized.length === 0 ||
      matches(action.label) ||
      matches(action.description) ||
      matches(action.category) ||
      matches(action.requires)
  );
  const templates = listGuidedTemplates(context).filter(
    (template) =>
      normalized.length === 0 ||
      matches(template.label) ||
      matches(template.description) ||
      matches(template.requires)
  );
  const rawTemplates = EVENT_NODE_TEMPLATES.filter(
    (template) =>
      normalized.length === 0 || matches(template.title) || matches(template.description)
  );

  return (
    <aside className="event-workflow-library" aria-label="Event node library">
      <div className="event-workflow-panel-title">
        <Icon name="box" size={14} />
        <span>Guided workflow library</span>
      </div>
      <label className="event-workflow-search">
        <Icon name="search" size={14} />
        <input
          aria-label="Search event nodes"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search actions and templates"
          value={search}
        />
      </label>
      <div className="event-workflow-library-list">
        {actions.length === 0 && templates.length === 0 && rawTemplates.length === 0 ? (
          <p className="event-workflow-empty-hint">No event nodes match “{search}”.</p>
        ) : null}

        <section className="event-workflow-library-section">
          <h4>Guided actions</h4>
          {CATEGORY_ORDER.map((category) => {
            const categoryActions = actions.filter((action) => action.category === category);
            if (categoryActions.length === 0) {
              return null;
            }
            return (
              <div className="event-workflow-library-category" key={category}>
                <h5>{category}</h5>
                {categoryActions.map((action) => (
                  <article
                    className={`event-workflow-library-item ${action.available ? '' : 'unavailable'}`}
                    draggable={action.available}
                    key={action.id}
                    onDragStart={(event) => {
                      if (!action.available) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.setData(GUIDED_ACTION_DRAG_TYPE, action.id);
                      event.dataTransfer.setData('text/plain', action.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    title={action.available ? action.description : action.reason}
                  >
                    <div className="event-workflow-library-icon" aria-hidden="true">
                      <Icon name={action.icon} size={16} />
                    </div>
                    <div className="event-workflow-library-copy">
                      <strong>{action.label}</strong>
                      <p>{action.available ? action.description : action.reason}</p>
                    </div>
                    <button
                      aria-label={`Add ${action.label}`}
                      disabled={!action.available}
                      onClick={() => onAddGuided(action.id)}
                      title={action.available ? `Add ${action.label}` : action.reason}
                      type="button"
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </article>
                ))}
              </div>
            );
          })}
        </section>

        {templates.length > 0 ? (
          <section className="event-workflow-library-section">
            <h4>Guided templates</h4>
            {templates.map((template) => (
              <article
                className={`event-workflow-library-item template ${template.available ? '' : 'unavailable'}`}
                key={template.id}
                title={template.requires}
              >
                <div className="event-workflow-library-icon" aria-hidden="true">
                  <Icon name={template.icon} size={16} />
                </div>
                <div className="event-workflow-library-copy">
                  <strong>{template.label}</strong>
                  <p>{template.available ? template.description : template.requires}</p>
                </div>
                <button
                  aria-label={`Apply ${template.label}`}
                  disabled={!template.available}
                  onClick={() => onApplyTemplate(template.id)}
                  title={template.available ? `Apply ${template.label}` : template.requires}
                  type="button"
                >
                  <Icon name="wand" size={14} />
                </button>
              </article>
            ))}
          </section>
        ) : null}

        {rawTemplates.length > 0 ? (
          <section className="event-workflow-library-section">
            <h4>Advanced event types</h4>
            {rawTemplates.map((template) => (
              <article
                className={`event-workflow-library-item type-${template.type}`}
                draggable
                key={template.type}
                onDragStart={(event) => {
                  event.dataTransfer.setData(EVENT_NODE_DRAG_TYPE, template.type);
                  event.dataTransfer.setData('text/plain', template.type);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <div className="event-workflow-library-icon" aria-hidden="true">
                  <Icon name={TEMPLATE_ICONS[template.type]} size={16} />
                </div>
                <div className="event-workflow-library-copy">
                  <strong>{template.title}</strong>
                  <p>{template.description}</p>
                </div>
                <button
                  aria-label={`Add ${template.title}`}
                  onClick={() => onAdd(template.type)}
                  title={`Add ${template.title}`}
                  type="button"
                >
                  <Icon name="plus" size={14} />
                </button>
              </article>
            ))}
          </section>
        ) : null}
      </div>
      <div className="event-workflow-library-help">
        <Icon name="help" size={13} />
        <span>
          Drag a guided action onto the canvas or use Add. Templates replace the current graph only
          after confirmation. Connect green, red or amber outputs to define outcomes.
        </span>
      </div>
    </aside>
  );
}
