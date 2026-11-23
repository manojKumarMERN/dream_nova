import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Icon } from '../../Icons';

export interface DesignerGroupData extends Record<string, unknown> {
  name: string;
  modelCount: number;
}

export type GroupFlowNode = Node<DesignerGroupData, 'designerGroup'>;

export function groupNodeId(groupId: string): string {
  return `group:${groupId}`;
}

export const GroupNode = memo(function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  return (
    <div className="designer-group-node">
      <div className="designer-group-title">
        <Icon name="layers" size={12} /> {data.name}
      </div>
      <div className="designer-group-count">{data.modelCount} tables</div>
    </div>
  );
});
