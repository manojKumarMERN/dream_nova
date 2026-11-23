import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { DataModelDefinition } from '@nova/spec';
import { collapsedFieldId, sourceHandleId, targetHandleId } from './model';
import { FieldTypeShape } from './pro-features/FieldTypeShape';
import { Icon } from '../Icons';

export interface TableNodeData extends Record<string, unknown> {
  model: DataModelDefinition;
  selected: boolean;
  collapsed: boolean;
  selectedFieldId?: string;
  onSelectField: (modelId: string, fieldId: string) => void;
  onToggleCollapse: (modelId: string) => void;
}

export type TableFlowNode = Node<TableNodeData, 'dataModel'>;

export const TableNode = memo(function TableNode({ data }: NodeProps<TableFlowNode>) {
  const name = data.model.displayName ?? data.model.name;
  return (
    <div
      className={`designer-table ${data.selected ? 'selected' : ''}`}
      data-collapsed={data.collapsed}
      data-model-id={data.model.id}
    >
      <div className="designer-table-header">
        <button
          aria-label={`${data.collapsed ? 'Expand' : 'Collapse'} ${name}`}
          className="designer-collapse"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleCollapse(data.model.id);
          }}
          type="button"
        >
          <Icon name={data.collapsed ? 'chevron-right' : 'chevron-down'} size={12} />
        </button>
        <span className="designer-table-name">{name}</span>
        <span className="designer-table-count">{data.model.fields.length}</span>
        {data.collapsed ? (
          <>
            <Handle
              className="designer-handle designer-handle-target"
              id={targetHandleId(collapsedFieldId(data.model.id))}
              isConnectable={false}
              position={Position.Left}
              type="target"
            />
            <Handle
              className="designer-handle designer-handle-source"
              id={sourceHandleId(collapsedFieldId(data.model.id))}
              isConnectable={false}
              position={Position.Right}
              type="source"
            />
          </>
        ) : null}
      </div>
      {data.collapsed ? null : (
        <div className="designer-table-fields">
          {data.model.fields.map((field) => (
            <div
              className={`designer-table-field ${data.selectedFieldId === field.id ? 'selected' : ''}`}
              key={field.id}
              onClick={(event) => {
                event.stopPropagation();
                data.onSelectField(data.model.id, field.id);
              }}
            >
              <Handle
                className="designer-handle designer-handle-target"
                id={targetHandleId(field.id)}
                position={Position.Left}
                type="target"
              />
              <FieldTypeShape type={field.type} />
              <span className="designer-field-type">{field.type}</span>
              <span className="designer-field-name">{field.name}</span>
              {field.required === true ? <span className="designer-field-flag">req</span> : null}
              {field.unique === true ? <span className="designer-field-flag">uniq</span> : null}
              <Handle
                className="designer-handle designer-handle-source"
                id={sourceHandleId(field.id)}
                position={Position.Right}
                type="source"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
