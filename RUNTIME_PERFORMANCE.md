# Runtime Performance

## Guardrails implemented

- Expression cost limits: length, tokens, depth, evaluation steps, interpolation depth, and result length.
- Action cost limits: per-event action count, nested action depth, and serialized nested action size.
- Component contract and validation issues are computed when the runtime model is created, not on each render.
- Runtime engines expose `dispose()` and `isDisposed()`; browser apps dispose engines on unmount or definition change.
- Telemetry is adapter-based and defaults to a no-op; console telemetry is opt-in.
- Editor preview avoids recreating its engine when toast state changes.

## Bundle status

- The standalone runtime is a Vite SPA with no renderer-level code splitting or `React.lazy` boundaries.
- Full build currently emits non-failing Vite chunk-size warnings.
- Renderer registry is eagerly loaded.

## Measurement status

| Area                                 | Status             |
| ------------------------------------ | ------------------ |
| Expression/action quota enforcement  | PASS (unit tested) |
| Engine disposal and listener cleanup | PASS (unit tested) |
| Render-time profiling                | NOT TESTED         |
| Large-definition benchmark           | NOT TESTED         |
| Startup/bundle budget enforcement    | NOT TESTED         |
| Code splitting for renderers         | NOT IMPLEMENTED    |

No performance numbers are claimed in this phase. If budgets are introduced in a later phase, they should include cold start time, interaction latency for a large definition, memory growth after repeated engine disposal, and built asset size ceilings.
