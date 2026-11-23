# ADR-0015: React Flow database designer

Status: Accepted

## Context

The specification requires a dedicated visual database designer with table nodes, relationship handles, multi-select, zoom, minimap, auto layout, and property editing. The current editor has a form-based `DatabasePanel` and a separate application page designer. No React Flow or XyFlow dependency exists in the repository.

## Decision

Stage 2 will add a dedicated React Flow-based database designer, separate from the application page designer and workflow editor. Table nodes, relationship edges, and field handles must use stable IDs from `@nova/spec`.

Canvas coordinates, viewport state, and layout preferences are UI state and must be persisted separately from the canonical schema definition.

## Rationale

React Flow matches the required graph-editing interactions. Keeping the database designer separate avoids mixing schema graph semantics with page layout or workflow semantics. Stable IDs prevent renames from corrupting relationships and bindings.

## Consequences

- A new dependency must be added deliberately in Stage 2.
- The current `DatabasePanel` remains the interim UI until the new designer passes validation and UI tests.
- Every canvas mutation must update canonical editor state through existing editor-state mechanisms.
- Invalid schemas must be blocked before migration execution.
