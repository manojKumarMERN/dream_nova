# Runtime Component Coverage

Generated from `@nova/component-registry` built-in contracts.

## Summary

| Metric                                       | Count | Status                       |
| -------------------------------------------- | ----- | ---------------------------- |
| Built-in contracts                           | 44    | PASS                         |
| Contracts with `renderers.web`               | 44    | PASS                         |
| Contracts with native renderer               | 0     | NOT TESTED / not implemented |
| Contracts with schema-backed prop validation | 44    | PASS                         |
| Contracts exercised in browser E2E           | 6     | PARTIAL                      |

All built-in contracts currently declare `supportedTargets: ['web']`. A contract with no matching renderer degrades to the shared fallback renderer and contract issues are rendered as `nova-fallback-issue` notes.

## Renderer matrix

| Contract               | Category   | Web renderer | Declared events              |
| ---------------------- | ---------- | ------------ | ---------------------------- |
| `nova.stack`           | layout     | PASS         | —                            |
| `nova.text`            | display    | PASS         | —                            |
| `nova.button`          | input      | PASS         | `click`                      |
| `nova.text-input`      | input      | PASS         | `change`                     |
| `nova.form`            | data       | PASS         | `submit`                     |
| `nova.container`       | layout     | PASS         | `mount`, `click`             |
| `nova.row`             | layout     | PASS         | `mount`, `click`             |
| `nova.column`          | layout     | PASS         | `mount`, `click`             |
| `nova.grid`            | layout     | PASS         | `mount`, `click`             |
| `nova.section`         | layout     | PASS         | `mount`, `click`, `toggle`   |
| `nova.tabs`            | layout     | PASS         | `mount`, `change`            |
| `nova.heading`         | basic      | PASS         | `mount`, `click`             |
| `nova.image`           | basic      | PASS         | `mount`, `load`              |
| `nova.icon`            | basic      | PASS         | `mount`, `click`             |
| `nova.divider`         | basic      | PASS         | `mount`, `click`             |
| `nova.card`            | basic      | PASS         | `mount`, `click`             |
| `nova.badge`           | basic      | PASS         | `mount`, `click`             |
| `nova.textarea`        | input      | PASS         | `mount`, `change`            |
| `nova.number-input`    | input      | PASS         | `mount`, `change`            |
| `nova.email-input`     | input      | PASS         | `mount`, `change`            |
| `nova.password-input`  | input      | PASS         | `mount`, `change`            |
| `nova.select`          | input      | PASS         | `mount`, `change`            |
| `nova.checkbox`        | input      | PASS         | `mount`, `change`            |
| `nova.radio-group`     | input      | PASS         | `mount`, `change`            |
| `nova.date-picker`     | input      | PASS         | `mount`, `change`            |
| `nova.file-upload`     | input      | PASS         | `mount`, `change`            |
| `nova.link`            | action     | PASS         | `mount`, `navigate`          |
| `nova.dropdown`        | action     | PASS         | `mount`, `select`            |
| `nova.menu`            | action     | PASS         | `mount`, `navigate`          |
| `nova.data-table`      | data       | PASS         | `mount`, `rowClick`, `sort`  |
| `nova.list`            | data       | PASS         | `mount`, `itemClick`         |
| `nova.chart`           | data       | PASS         | `mount`, `pointClick`        |
| `nova.statistics-card` | data       | PASS         | `mount`, `click`             |
| `nova.data-grid`       | data       | PASS         | `mount`, `cellChange`        |
| `nova.navbar`          | navigation | PASS         | `mount`, `navigate`          |
| `nova.sidebar`         | navigation | PASS         | `mount`, `navigate`          |
| `nova.breadcrumb`      | navigation | PASS         | `mount`, `navigate`          |
| `nova.pagination`      | navigation | PASS         | `mount`, `change`            |
| `nova.modal`           | feedback   | PASS         | `mount`, `open`, `close`     |
| `nova.dialog`          | feedback   | PASS         | `mount`, `confirm`, `cancel` |
| `nova.drawer`          | feedback   | PASS         | `mount`, `open`, `close`     |
| `nova.toast`           | feedback   | PASS         | `mount`, `dismiss`           |
| `nova.alert`           | feedback   | PASS         | `mount`, `dismiss`           |
| `nova.tooltip`         | feedback   | PASS         | `mount`, `show`              |

## Browser E2E coverage details

Exercised:

- `nova.stack` root layout.
- `nova.text` rendered content.
- `nova.heading` renderer removal via route interception to prove fallback behavior.
- `nova.button` click action and visibility toggling.
- `nova.text-input` change events, required validation, and form values.
- `nova.form` submit, validateForm, success navigation, and failure messaging.

Not exercised in browser E2E: the remaining 38 contracts. They have renderer declarations and schema validation coverage, but not dedicated browser interaction tests.
