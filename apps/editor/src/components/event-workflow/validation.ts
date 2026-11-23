import type { ValidationIssue } from '@nova/spec-validator';
import { validateWorkflowEventGraph } from '@nova/spec-validator';
import type { WorkflowDefinition } from '@nova/spec';

export interface WorkflowDesignerIssue extends ValidationIssue {
  nodeId?: string;
  edgeId?: string;
}

function entityIdFromPath(path: string): string | undefined {
  const match = path.match(/\.graph\.(?:nodes|edges)\[([^\]]+)\]/);
  return match?.[1];
}

export function validateWorkflowDefinition(workflow: WorkflowDefinition): WorkflowDesignerIssue[] {
  return validateWorkflowEventGraph(workflow).map((issue) => {
    const id = entityIdFromPath(issue.path);
    return {
      ...issue,
      ...(id === undefined ? {} : issue.path.includes('.nodes[') ? { nodeId: id } : { edgeId: id })
    };
  });
}

export function workflowIssueCounts(issues: readonly WorkflowDesignerIssue[]): {
  errors: number;
  warnings: number;
} {
  return {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length
  };
}
