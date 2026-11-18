# NOVA Architecture

## Scope

This repository contains Phase 0 foundations and the implemented full visual builder. Phase 0 was completed and verified first. The builder now includes the drag-and-drop editor, web runtime, control plane endpoints, typed SDK, and optional AI proposal flow. Deployment/hosting, Expo/Tauri renderers, marketplace, and full Postgres/Redis integration tests remain deferred.

## System shape

```text
Editor (@nova/editor, @nova/editor-core)
  -> @nova/sdk
  -> control plane (@nova/api)
  -> validation (@nova/spec-validator) + proposal model (@nova/proposal-model)
  -> immutable AppVersion (in-memory or Prisma repository)
  -> runtime payload
  -> web runtime (@nova/web-runtime, @nova/web-runtime-app)

Optional AI provider (@nova/ai-core)
  -> structured ChangeProposal
  -> validation, risk classification, approval
  -> apply via control plane
```

The canonical input/output of the platform is a versioned `AppDefinition` owned by `@nova/spec`. Everything else either validates it, stores it, proposes changes to it, or renders it. The web runtime app loads published runtime payloads and maps them back to an editor-compatible definition via `runtimePayloadToDefinition` from `@nova/spec`.

## Package boundaries

| Package                                      | Responsibility                                                          | Status                                      |
| -------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| `@nova/errors`                               | Stable error codes and `NovaError`                                      | Implemented                                 |
| `@nova/logging`                              | Structured JSON logs and redaction                                      | Implemented                                 |
| `@nova/config`                               | Validated environment configuration                                     | Implemented                                 |
| `@nova/spec`                                 | Versioned application definition, schemas, fixtures, migrations         | Implemented; builder fields added           |
| `@nova/contracts`                            | Component/event/slot/capability contract types                          | Implemented; builder contract fields added  |
| `@nova/component-registry`                   | Immutable versioned registry and built-in web contracts                 | Implemented; full builder contracts         |
| `@nova/spec-validator`                       | Schema, reference, compatibility, and prop validation                   | Implemented                                 |
| `@nova/proposal-model`                       | Semantic change operations, risk classification, approval gate, apply   | Implemented; full builder operations        |
| `@nova/runtime-core`                         | Shared runtime model and component resolution                           | Implemented                                 |
| `@nova/web-runtime`                          | React web renderer and runtime model                                    | Implemented                                 |
| `@nova/editor-core`                          | Editor state, tree operations, and proposal helpers                     | Implemented                                 |
| `@nova/auth`                                 | Organization roles and permissions                                      | Implemented                                 |
| `@nova/tenant`                               | Organization scoping helpers                                            | Implemented                                 |
| `@nova/db`                                   | Prisma schema, client, initial migration                                | Implemented                                 |
| `@nova/queue`                                | Redis URL parsing and BullMQ queue/worker factories                     | Implemented                                 |
| `@nova/ai-core`                              | LLM adapters, proposal generation, and prompt-context redaction         | Implemented; OpenAI-compatible and fallback |
| `@nova/backend-adapters`                     | Data/auth/storage adapters and platform repositories                    | Implemented; in-memory and Prisma           |
| `@nova/api`                                  | NestJS control plane with platform, runtime, registry, and AI endpoints | Implemented                                 |
| `@nova/sdk`                                  | Typed control-plane client                                              | Implemented; full typed platform methods    |
| `@nova/worker`                               | BullMQ worker host with real system health job handling                 | Implemented                                 |
| `@nova/editor` (`apps/editor`)               | Drag-and-drop visual builder                                            | Implemented                                 |
| `@nova/web-runtime-app` (`apps/web-runtime`) | Host for published runtime payloads                                     | Implemented                                 |

## Dependency rules

```text
config, logging, errors
        ↓
spec, contracts
        ↓
component-registry, spec-validator, proposal-model, runtime-core, editor-core
        ↓
db, auth, tenant, queue, backend-adapters, ai-core
        ↓
api, worker, sdk
        ↓
apps/editor, apps/web-runtime
```

Hard rules:

1. `@nova/spec` must not depend on API, DB, auth, UI, or AI packages.
2. Runtime renderer packages depend only on spec/contracts/runtime-core.
3. The editor app communicates with the control plane through `@nova/sdk`; `@nova/editor-core` remains transport-free.
4. AI packages must not import Prisma or application write services.
5. No package may import another package's internal files; use package entrypoints.
6. No package may contain fake success responses or placeholder endpoints.
7. AI never writes definitions directly; the UI requires explicit approval before applying.

## Mutation safety

AI and editor changes use the same path:

1. Build a `ChangeProposal` containing semantic operations.
2. Validate the proposal structure.
3. Classify risk.
4. Require approval for `HIGH` and `DESTRUCTIVE` proposals.
5. Apply operations to a cloned definition.
6. Validate the resulting definition.
7. Create a new immutable version through the platform service.
8. Publish the compiled runtime payload for the selected release environment.

AI never receives write credentials and never calls the apply function directly from a provider adapter.

## Deferred work

- Expo/Tauri renderers
- Deployment and hosting services
- Marketplace services
- Full integration tests against Postgres and Redis

Deferred modules are intentionally absent rather than stubbed.
