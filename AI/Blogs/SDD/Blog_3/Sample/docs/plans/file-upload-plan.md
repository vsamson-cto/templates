# Plan: PDF File Upload

- **Linked specification:** [SPEC-001 — ../specs/file-upload.md](../specs/file-upload.md)
- **Tasks:** [../tasks/file-upload-tasks.md](../tasks/file-upload-tasks.md)
- **Status:** Complete — ready for implementation

## Implementation approach

A small Node.js HTTP server with a static HTML page, built in layers so each layer can be tested on its own:

1. **`src/config.js`**: constants (`MAX_FILE_BYTES = 2097152`, `MAX_FILES_PER_SESSION = 5`, `EOF_SEARCH_BYTES = 1024`, default upload directory).
2. **`src/validation.js`**: pure functions with no I/O. `validateFileName(name)` and `validateContent(buffer)` return `{ ok: true }` or `{ ok: false, status, message }`. They implement BR-4 and BR-5 in BR-6 order.
3. **`src/session-store.js`**: in-memory session store (*Local mock — replace with production integration later*). It creates sessions with random IDs, reports remaining quota, and offers a synchronous `reserve()` / `release()` / `commit()` so concurrent requests cannot exceed the limit (SEC-4).
4. **`src/storage.js`**: local temporary file storage (*Local mock — replace with production integration later*). `saveFile(sessionId, buffer)` writes `tmp/uploads/<sessionId>/<uuid>.pdf` using the `wx` flag, so it never overwrites anything. The path is built only from server-generated values (SEC-1).
5. **`src/server.js`**: `createApp({ uploadDir })` returns an `http.Server`.
   - `GET /` → `public/index.html`; `GET /app.js`, `GET /styles.css` → static assets (allowlist only).
   - `POST /api/uploads` → session cookie handling → quota pre-check → filename/extension check → `Content-Length` check → bounded body read → content validation → reserve slot → save → commit → JSON response. Early rejections drain the remaining body (bounded by `MAX_DRAIN_BYTES`) before responding.
6. **`src/index.js`**: entry point that listens on port 3000.
7. **`public/`**: `index.html`, `app.js`, `styles.css`. The page uploads selected files one at a time with `fetch` (raw body + `X-File-Name` header) and renders each server message via `textContent` in an `aria-live` region.

### Why a raw body instead of multipart

Parsing `multipart/form-data` safely needs either a third-party dependency or a hand-written parser, which is error-prone. Sending one file per request as the raw body with the name in a header is simple, uses only built-ins, and makes the size limit easy to enforce while streaming.

## Public APIs, open-source libraries, or local mocks

| Capability | Choice | Notes |
|---|---|---|
| HTTP server | Node.js `node:http` (built-in) | No dependency |
| Random IDs | `node:crypto` `randomUUID()` (built-in) | Session IDs and stored file names |
| Storage | Local file system `tmp/uploads/` | *Local mock — replace with production integration later.* |
| Session store | In-memory `Map` | *Local mock — replace with production integration later.* |
| Tests | `node:test`, `node:assert` (built-in) | No dependency |
| External APIs | **None** | No outbound calls |

## Technical constraints

- Node.js ≥ 20 (uses `node:test`, global `fetch` in tests).
- No third-party dependencies, environment variables, secrets, or external services.
- Single-process server; session state is lost on restart (documented limitation).
- Buffered body up to 2 MB per request is acceptable memory-wise for a local app.

## Security and privacy considerations

- Path traversal: client file names are never used in paths (SEC-1); tested with `../../evil.pdf`.
- Resource exhaustion: at most 2 MiB buffered per request; early rejections discard (not buffer) up to 8 MiB so browsers can read the error, then close the connection beyond that (SEC-2). The page pre-checks `file.size` for the 2 MB limit.
- Race conditions: synchronous slot reservation before any `await` (SEC-4); tested with 6 concurrent uploads.
- XSS: UI uses `textContent`; CSP `default-src 'self'` (SEC-5, SEC-8).
- Session cookie: `HttpOnly; SameSite=Strict; Path=/` (SEC-3). `Secure` is not set because local development uses plain HTTP; production must add it.
- Content checks are signature/trailer only; they do not prove a PDF is safe (HD-3).

## Dependencies

- Runtime: none beyond Node.js.
- Development: none beyond Node.js.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Spoofed PDF that passes basic checks | Documented as out of scope; recommended malware scanning before production (HD-3) |
| Unbounded growth of in-memory sessions and `tmp/uploads/` | Documented limitation and follow-up work; local use only |
| Server restart resets quotas | Documented (BR-1, HD-4) |
| "2 MB" interpretation mismatch | Single constant, flagged as HD-1 |
| Client disconnects mid-upload | Body read promise rejects; slot not reserved until after full validation |

## Review / approval points

- Before production: HD-1 to HD-4 in the spec; security review of the cookie (`Secure`), storage location, and retention.
- Adding any dependency requires human approval (CLAUDE.md).
