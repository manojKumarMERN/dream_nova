import type { ChangeProposal, ProposalOperation, RiskLevel } from './proposal-operations';

export function classifyProposalRisk(operations: readonly ProposalOperation[]): RiskLevel {
  if (operations.some((operation) => operation.op === 'removePage')) {
    return 'DESTRUCTIVE';
  }

  if (
    operations.some(
      (operation) => operation.op === 'bulkDeleteComponents' || operation.op === 'replaceDefinition'
    )
  ) {
    return 'DESTRUCTIVE';
  }

  if (
    operations.some(
      (operation) => operation.op === 'removeComponent' || operation.op === 'removeWorkflow'
    )
  ) {
    return 'HIGH';
  }

  if (
    operations.some(
      (operation) =>
        operation.op === 'addPage' ||
        operation.op === 'updateTheme' ||
        operation.op === 'updateWorkflow' ||
        operation.op === 'bulkUpdateComponents'
    )
  ) {
    return 'MEDIUM';
  }

  return 'LOW';
}

export function requiresApproval(proposal: ChangeProposal): boolean {
  const effectiveRisk = classifyProposalRisk(proposal.operations);
  return effectiveRisk === 'HIGH' || effectiveRisk === 'DESTRUCTIVE';
}
