# Runtime Testing

## Commands

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

`pnpm test:e2e` starts the API, editor, and standalone runtime through `pnpm start_nova`, waits for ports `3000`, `5173`, and `5174`, runs Chromium tests, then terminates the stack.

## Test layers

| Layer       | Location                                                         | Covers                                                                                                           |
| ----------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unit        | `packages/runtime-core/test/runtime-engine.spec.ts`              | Expressions, actions, policy, telemetry redaction, disposal, contracts                                           |
| Unit        | `packages/web-runtime/test`, `apps/web-runtime/src/App.test.tsx` | Renderers and public loader behavior                                                                             |
| Integration | `apps/api/test/platform.spec.ts`                                 | Public/preview/private/draft endpoint behavior                                                                   |
| Browser     | `e2e/tests/editor-preview.spec.ts`                               | Editor open, preview, toggle, form validation/success                                                            |
| Browser     | `e2e/tests/public-runtime.spec.ts`                               | Access rules, public rendering, fallback, navigation, validation, responsive breakpoint, draft/private rejection |

## Known environment limits

- Docker is not available in this environment, so Postgres/Redis-backed integration coverage is NOT TESTED.
- Playwright Chromium is installed and E2E currently passes locally with the in-memory repository.
- Vite chunk-size warnings during full build are non-failing.

## Browser E2E result

Current standalone result: 4/4 Playwright tests passed.
