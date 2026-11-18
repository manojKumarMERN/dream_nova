# Component Contracts

Component contracts are immutable, versioned descriptions of what a component is and how it may be used. They are not renderer implementations.

## Contract fields

| Field                  | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `type`                 | Stable component identifier, e.g. `nova.button`.                           |
| `version`              | Semantic version, e.g. `1.0.0`.                                            |
| `displayName`          | Human-readable name.                                                       |
| `category`             | Palette and inspector grouping.                                            |
| `description`          | Short builder help text.                                                   |
| `icon`                 | Builder icon identifier.                                                   |
| `propsSchema`          | JSON Schema for props validation.                                          |
| `defaults`             | Default props used by tooling.                                             |
| `events`               | Named events and payload schemas.                                          |
| `slots`                | Named child regions and allowed component types.                           |
| `capabilities`         | Capability tags used by AI and compatibility checks.                       |
| `supportedTargets`     | Platforms the contract may appear on.                                      |
| `renderers`            | Renderer identifiers by target.                                            |
| `constraints`          | Parent/child and count constraints.                                        |
| `migrations`           | Prop migrations between contract versions.                                 |
| `inspector`            | Inspector groups/fields with widgets, options, help, and visibility rules. |
| `resize`               | Resize constraints: min/max size and aspect ratio.                         |
| `supportedBreakpoints` | Breakpoints exposed by the editor.                                         |

## Registry rules

1. A `(type, version)` pair is unique.
2. `get(type)` returns the latest semantic version.
3. `get(type, version)` returns an exact version.
4. Unknown contracts are validation errors.
5. Deprecated contracts remain readable until removal.
6. Built-in contracts currently support only `web`; other targets are added when renderers exist.
7. Full builder contracts are available to the editor through `fetchContracts()`.

## Built-in contracts

| Type              | Category | Purpose                        |
| ----------------- | -------- | ------------------------------ |
| `nova.stack`      | layout   | Nested child container         |
| `nova.text`       | display  | Text rendering                 |
| `nova.button`     | input    | Click interaction              |
| `nova.text-input` | input    | Form text entry                |
| `nova.form`       | data     | Form submission and field slot |

`@nova/component-registry` exposes `BUILT_IN_COMPONENT_CONTRACTS` and the full builder set as `BUILDER_COMPONENT_CONTRACTS`. The editor derives `BUILT_IN_CONTRACTS` and loads full contracts with `fetchContracts()` through `@nova/sdk`, with a local fallback. Builder categories include `layout`, `basic`, `input`, `action`, `data`, `navigation`, `feedback`, `display`, and `custom`.

## Validation behavior

`@nova/spec-validator` compiles each `propsSchema` with Ajv and reports violations as structured issues. It also checks slots, allowed parents/children, maximum children, target support, and target overrides. Builder contract metadata is validated by `@nova/contracts` schemas and consumed by the editor inspector and resize handles.

## Renderer mapping

`renderers.web` values such as `nova-web/button` map to web renderer identifiers implemented by `@nova/web-runtime`. Supported targets remain limited to `web` until other renderers exist.
