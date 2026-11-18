# ADR-0006: Separate platform metadata from app definitions

Status: Accepted

## Decision

Store organization, environment, status, ownership, and release metadata in PostgreSQL, not in `AppDefinition`.

## Rationale

Specifications must be portable across organizations, environments, and deployment models.

## Consequences

DB rows reference spec versions; they do not mutate them.
