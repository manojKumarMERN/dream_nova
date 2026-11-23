# ADR-0020: Data Studio information architecture

Status: Accepted; partially implemented

## Context

The editor previously exposed a single `Data` tab with form-based model editing, migration plan/apply, bindings, and data actions. The specification requires a dedicated Data Studio with overview, designer, tables, relationships, records, SQL editor, data sources, connectors, migrations, permissions, and logs.

## Decision

The editor Data tab now hosts a first-class Data Studio with this navigation model:

- Overview
- Database Designer
- Tables
- Relationships
- Records
- Query Builder
- SQL Editor
- Data Sources
- Connectors
- Migrations
- Permissions
- Logs

The visual designer, records browser, query builder, migration view, and permissions matrix edit or inspect the same canonical schema and scoped data through existing SDK/API routes. Data Studio state is UI-only; `@nova/spec` remains the canonical schema source. Simple and Advanced modes change navigation and affordances without duplicating app state.

Query Builder stores structured `DataQueryGroup`/`DataQueryCondition` definitions in `definition.queries`; it does not execute raw SQL. SQL Editor, Connectors, and Logs render explicit unavailable states until their backend contracts exist.

## Rationale

A single Data Studio prevents disconnected tools from drifting. It gives non-technical users a visual path and professional developers an advanced path without creating competing schema stores.

## Consequences

- Stage 2 and Stage 5 share navigation and schema-refresh behavior.
- Unimplemented sections remain clearly unavailable rather than rendered as fake screens.
- Destructive migration application requires explicit `APPLY DESTRUCTIVE MIGRATION` confirmation.
- Data Sources currently supports only Nova-managed source names; it does not accept secrets or external connection details.
- The permissions matrix edits canonical model permissions, but server-side enforcement remains the authority and field/record-level policies are not implemented.
- UI tests cover navigation, unavailable states, environment-scoped records, saved structured queries, migration confirmation, and Nova-managed source creation.
