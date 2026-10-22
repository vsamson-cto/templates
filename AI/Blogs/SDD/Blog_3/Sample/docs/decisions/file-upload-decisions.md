# Decisions: PDF File Upload (SPEC-001)

Status: Recorded 2026-10-22. Items marked **Needs human confirmation** are assumptions made so work could proceed. Each is easy to change.

## Decisions

### D-1 Zero third-party dependencies (Node.js built-ins only)
- **Decision:** Use `node:http`, `node:fs`, `node:crypto`, and `node:test` only.
- **Why:** The repository was empty, and the requirement forbids credentials and services. Built-ins avoid supply-chain risk and avoid a "new dependency" approval.
- **Trade-off:** No framework conveniences (routing, multipart parsing). Hand-written code is kept small and covered by tests.

### D-2 Raw request body + `X-File-Name` header instead of multipart
- **Decision:** One file per request, sent as the raw body, with the URI-encoded name in a header.
- **Why:** Safe multipart parsing needs a dependency or a fragile hand-written parser. A raw body makes size capping simple.
- **Trade-off:** Not a classic HTML form post, so the page needs JavaScript. Non-browser clients must follow the same convention.

### D-3 "2 MB" = 2,097,152 bytes. **Needs human confirmation (HD-1)**
- One constant: `MAX_FILE_BYTES` in `src/config.js` (mirrored in `public/app.js`). If 2,000,000 is meant, change both and the AC-2 tests.

### D-4 Rejected uploads do not count toward the 5-file limit. **Needs human confirmation (HD-2)**
- The quota counts accepted files only. Slots are reserved synchronously before the file write, so concurrent uploads cannot exceed 5 (tested by AC-10).

### D-5 "Basic content checks" = non-empty, `%PDF-` signature, `%%EOF` in the last 1,024 bytes. **Needs human confirmation (HD-3)**
- Chosen as the simplest checks that reject renamed non-PDFs and truncated files. They are not a malware scan or a full PDF parse.
- The browser-supplied `Content-Type` is ignored because it is client-controlled; the content signature is checked instead.

### D-6 Drain the body on early rejection (revised SEC-2)
- **Context:** In the TASK-5 browser check, the server sent 413 and closed the connection while Chrome was still uploading a 3 MB file. Chrome reported a network error, so the user saw "could not be sent" instead of the size message.
- **Decision:**
  - When rejecting before the body is fully read, the server reads and discards the rest of the body, up to 8 MiB total (`MAX_DRAIN_BYTES`), then responds. Beyond that it responds and closes the connection.
  - The page also pre-checks `file.size` so oversized files of any size get the size message without being sent.
- **Trade-off:** A rejected client may make the server read up to 8 MiB it will throw away (never buffered). In the browser, a file that is both oversized and has a wrong extension (or arrives at the limit) shows the size message rather than the extension or limit message.

### D-7 Session = server-issued cookie, in-memory store. **Needs human confirmation (HD-4)**
- The `sid` cookie is a random UUID with `HttpOnly; SameSite=Strict; Path=/` and no expiry (it ends when the browser closes). Unknown or forged IDs get a new session.
- **Local mock — replace with production integration later.** State is lost on restart, and sessions never expire.

### D-8 Storage path built only from server-generated UUIDs
- Files are saved as `tmp/uploads/<session-uuid>/<file-uuid>.pdf` with the `wx` flag. The client name is only echoed in messages, rendered as text in the UI.
- **Local mock — replace with production integration later.**

### D-9 Limit message names the refused file
- This was added after the browser check: with several files selected, "you have reached the limit" alone did not say which file was refused.

## Public APIs / mocks used

| Item | Type | Notes |
|---|---|---|
| External APIs | None | No outbound calls; nothing leaves the machine |
| Session store | Local mock (in-memory) | Local mock — replace with production integration later |
| File storage | Local mock (`tmp/uploads/`) | Local mock — replace with production integration later |

## Follow-up work (not done, by design or scope)

1. Confirm HD-1 to HD-4 with the product owner.
2. Retention and cleanup policy for `tmp/uploads/`, plus session expiry and eviction for the in-memory store.
3. Persistent session store and production storage before any deployment.
4. Add `Secure` to the cookie when served over HTTPS.
5. Consider malware scanning and stricter PDF validation (e.g. rejecting encrypted or JavaScript-bearing PDFs) if files are processed downstream.
6. Rate limiting per IP. The current limit is per cookie, and a client can clear cookies to get a new quota.
