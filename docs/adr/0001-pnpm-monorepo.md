# ADR-0001: pnpm monorepo with Turborepo

Status: Accepted

## Decision

Use a pnpm workspace with Turborepo for builds, typechecks, and linting.

## Rationale

- Fast dependency installation with strict workspace links.
- Explicit package boundaries.
- Cached task execution.
- Clear path to independent app and package builds.

## Consequences

All packages must declare direct dependencies; undeclared imports are treated as defects.
