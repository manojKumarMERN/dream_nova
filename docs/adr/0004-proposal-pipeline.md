# ADR-0004: Proposal pipeline for all mutations

Status: Accepted

## Decision

All application mutations flow through structured proposals, validation, risk classification, approval, and apply.

## Rationale

AI must never write application definitions directly. A single mutation path enables safety, auditability, and rollback.

## Consequences

The editor must generate proposals even for direct user edits. Apply logic lives only in `@nova/proposal-model`.
