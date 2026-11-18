# NOVA Data Model

PostgreSQL is the system of record for platform metadata and version history. Application definitions are stored as JSONB on immutable `AppVersion` rows.

## Domains

| Domain        | Models                                      | Notes                                                      |
| ------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Identity      | `User`, `Membership`                        | Organization-scoped roles.                                 |
| Organizations | `Organization`                              | Tenant root; all tenant data references it.                |
| Applications  | `App`, `AppVersion`, `AppEnvironment`       | `AppVersion` is immutable by service convention.           |
| Registry      | `ComponentContractVersion`, `SpecMigration` | Versioned compatibility metadata.                          |
| AI            | `AiConversation`, `AiProposal`, `Approval`  | Proposals are stored before apply; approvals are explicit. |
| Releases      | `Release`, `BuildArtifact`                  | Artifacts reference storage keys, not raw files.           |
| Integrations  | `Integration`                               | `secretRef` stores a reference, never a raw secret.        |
| Audit         | `AuditLog`                                  | Actor, action, resource, request ID, and metadata.         |

## Key constraints

- `Organization.slug` is unique.
- `(Organization.id, App.slug)` is unique.
- `(App.id, AppVersion.versionNumber)` is unique.
- `(type, version)` is unique for component contracts.
- `(App.id, EnvironmentName)` is unique for app environments.
- `(App.id, EnvironmentName, releaseNumber)` is unique for releases.
- `(AiProposal.id, approverUserId)` is unique for approvals.
- Tenant-scoped indexes include `organizationId`.

## Safety properties

- Actor IDs are stored as strings on versions, proposals, releases, and audit logs so history survives user deletion.
- Optional relations use `SetNull`; required ownership relations use `Cascade` where appropriate.
- `AiProposal.operations` is JSON but is validated by `@nova/proposal-model` before apply.
- `Integration.config` must not contain secrets; spec validation rejects common secret keys.
- `Integration.secretRef` should reference an external secret manager in later phases.

## Migration

Initial migration:

```text
packages/db/prisma/migrations/20261118000000_init/migration.sql
```

Regenerate Prisma Client with:

```bash
pnpm db:generate
```
