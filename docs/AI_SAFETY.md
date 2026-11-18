# AI Safety

## Non-negotiable rules

1. AI never directly overwrites application definitions.
2. AI output must be a structured `ChangeProposal`.
3. Proposals are validated before persistence and before apply.
4. Invalid references and incompatible components are detected.
5. `HIGH` and `DESTRUCTIVE` proposals require explicit approval.
6. Every applied change creates audit history and a new immutable version.
7. API secrets, credentials, and raw secret material are never included in prompts.
8. AI-generated code is never executed on the platform server.
9. AI is optional and proposal-only; the UI requires explicit approval before applying.

## Implemented controls

### Structured proposals

`@nova/proposal-model` defines semantic operations:

- `addComponent`
- `updateComponent`
- `removeComponent`
- `moveComponent`
- `resizeComponent`
- `updateBreakpointOverrides`
- `updateBinding`
- `updateWorkflow`
- `removeWorkflow`
- `updateTheme`
- `addPage`
- `removePage`
- `bulkUpdateComponents`
- `bulkDeleteComponents`
- `duplicateComponent`
- `setComponentHidden`
- `replaceDefinition`

Proposals cannot contain arbitrary code or shell commands.

### Validation before apply

`applyProposal` does the following:

1. Validates the proposal schema.
2. Classifies risk from operations, not from the AI's declared risk.
3. Requires `approved: true` for high/destructive changes.
4. Validates the base definition.
5. Applies operations to a cloned definition.
6. Runs full spec validation on the result.
7. Throws `NovaError` if validation fails.

### Approval policy

| Operation                                                                                          | Risk        |
| -------------------------------------------------------------------------------------------------- | ----------- |
| `addComponent`, `updateComponent`, `moveComponent`, `resizeComponent`, `updateBreakpointOverrides` | LOW         |
| `updateBinding`, `duplicateComponent`, `setComponentHidden`                                        | LOW         |
| `updateTheme`, `addPage`, `updateWorkflow`, `bulkUpdateComponents`                                 | MEDIUM      |
| `removeComponent`, `removeWorkflow`                                                                | HIGH        |
| `removePage`, `bulkDeleteComponents`, `replaceDefinition`                                          | DESTRUCTIVE |

Approval is required for `HIGH` and `DESTRUCTIVE`. The API enforces actor permissions; `VIEWER` cannot apply proposals.

### Prompt redaction

`generateRedactedPromptContext()` exposes only:

- app ID
- app name
- targets
- page count
- component types
- integration provider keys

It excludes props, bindings, integration config, secret references, and platform metadata.

### Optional AI generation

`createProposalGenerator()` uses `OpenAiCompatibleLlmProvider` when configured and falls back to `TemplateProposalGenerator`. Providers return structured proposals only; they never receive write credentials and never apply changes directly.

### Audit and rollback

The platform service persists proposals, creates new immutable versions from applied changes, and writes audit logs. The database schema includes `AuditLog`, `AiProposal`, `Approval`, and immutable `AppVersion` models. A rollback service remains deferred.

## Deferred controls

- Rollback service
- Prompt injection defenses and tool allowlists
- Full audit query API
