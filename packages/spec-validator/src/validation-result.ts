export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
