# Runtime Authentication and Access

## Endpoints

| Endpoint                                              | Actor required        | Access rule                                                  | Status                                                                 |
| ----------------------------------------------------- | --------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /api/runtime/v1/apps/:appSlug/releases/current`  | Yes                   | Tenant-scoped current published runtime                      | PARTIAL: protected endpoint retained; browser client no longer uses it |
| `GET /api/runtime/v1/preview/:appSlug?versionId=...`  | Yes, explicit headers | Tenant-scoped; drafts and saved versions allowed             | PASS                                                                   |
| `GET /api/runtime/v1/public/:appSlug?environment=...` | No                    | Published release plus `runtimeAccess.publicAccess === true` | PASS                                                                   |

## Actor headers

Preview calls require all of:

- `x-org-id`
- `x-user-id`

In development, normal platform endpoints fall back to configured actor defaults, but the preview endpoint does not: missing headers produce `401`, wrong-org access produces `404`, and correct-org access produces `200`.

## Public access

Public access is an explicit flag on the canonical app definition and compiled runtime payload:

```ts
runtimeAccess?: { publicAccess?: boolean }
```

Rules:

- Private published app: `403 FORBIDDEN`.
- Draft app with no published release: `404 NOT_FOUND`.
- Unknown slug across all organizations: `404 NOT_FOUND`.
- Public payloads never include editor-only draft definitions.

## Signed preview links

Not implemented. The current design intentionally avoids signed-link complexity because server-side signing, expiry, revocation, replay protection, and secret management are not present.

If introduced later, signed links must enforce all of the following server-side:

- Cryptographic signature using a server-held secret.
- App and version scope.
- Expiry and one-time or replay-protected use.
- Revocation.
- No frontend-held signing secret.

Classification: PARTIAL / deferred.

## Browser fixes found by E2E

- `NovaClient` now binds global `fetch` to `globalThis`; an unbound fetch caused `Illegal invocation` in Chromium.
- API CORS now allows the editor (`http://localhost:5173`) and standalone runtime (`http://localhost:5174`) origins plus actor headers.
- Editor preview no longer clears selection on runtime interactions, and its runtime engine is no longer recreated when a toast is pushed.
