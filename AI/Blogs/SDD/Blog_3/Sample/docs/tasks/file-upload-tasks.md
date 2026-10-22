# Tasks: PDF File Upload

- **Specification:** [SPEC-001](../specs/file-upload.md)
- **Plan:** [file-upload-plan.md](../plans/file-upload-plan.md)

---

## TASK-1 — Project scaffold and file validation

- **Description:** Create `package.json` (no dependencies), `.gitignore`, `src/config.js`, and `src/validation.js` with pure filename and content validation.
- **Acceptance criteria:** BR-3, BR-4, BR-5, BR-6 are enforced by `validateFileName` and `validateContent`; this covers the validation logic of AC-2 to AC-6 and the filename part of AC-11.
- **Files expected to change:** `package.json`, `.gitignore`, `src/config.js`, `src/validation.js`, `test/validation.test.js`
- **Tests required:** unit tests for a valid PDF; the exact 2,097,152-byte boundary; 2,097,153 bytes; `.txt`/`.png`/no extension; uppercase `.PDF`; empty; bad signature; missing `%%EOF`; `%%EOF` outside the last 1,024 bytes; missing name.
- **Status:** Done
- **Evidence required:** `npm test` output for `test/validation.test.js`.
- **Evidence recorded:** `npm test` → `tests 12, pass 12, fail 0` (all in `test/validation.test.js`). Note: the first run failed because `node --test test/` is not a valid directory argument on Node 24; the script now uses the glob `"test/**/*.test.js"`.

## TASK-2 — In-memory session store with 5-file quota

- **Description:** `src/session-store.js`: create/get sessions, `remaining()`, synchronous `reserve()`, `commit()`, `release()`. Labelled as a local mock.
- **Acceptance criteria:** at most 5 committed + reserved slots per session; release frees a slot; sessions are independent; IDs are random UUIDs.
- **Files expected to change:** `src/session-store.js`, `test/session-store.test.js`
- **Tests required:** quota exhaustion, release, independence, unknown ID handling.
- **Status:** Done
- **Evidence required:** `npm test` output.
- **Evidence recorded:** `npm test` → `tests 19, pass 19, fail 0` (7 new in `test/session-store.test.js`).

## TASK-3 — Local temporary file storage

- **Description:** `src/storage.js` `createStorage(rootDir).saveFile(sessionId, buffer)` writes `<root>/<sessionId>/<uuid>.pdf` with the `wx` flag. Labelled as a local mock.
- **Acceptance criteria:** file written with identical bytes; name is server-generated; the path stays inside root; rejects a non-UUID session ID.
- **Files expected to change:** `src/storage.js`, `test/storage.test.js`
- **Tests required:** write/read-back, path containment, invalid session ID.
- **Status:** Done
- **Evidence required:** `npm test` output.
- **Evidence recorded:** `npm test` → `tests 22, pass 22, fail 0` (3 new in `test/storage.test.js`).

## TASK-4 — Upload HTTP endpoint and session cookie

- **Description:** `src/server.js` `createApp()` with `POST /api/uploads`, session cookie, early `Content-Length` rejection, streaming cap, JSON responses, and security headers. `src/index.js` entry point.
- **Acceptance criteria:** AC-1 to AC-13 over real HTTP.
- **Files expected to change:** `src/server.js`, `src/index.js`, `test/server.test.js`, `test/helpers.js`
- **Tests required:** integration tests per AC using an ephemeral port and a temp upload directory.
- **Status:** Done
- **Evidence required:** `npm test` output.
- **Evidence recorded:** `npm test` → `tests 41, pass 41, fail 0` (19 new in `test/server.test.js`); repeated 3 more times with 41/41 passing each time to check timing-sensitive tests (AC-10, AC-12, SEC-2) for flakiness.

## TASK-5 — Browser upload page

- **Description:** `public/index.html`, `public/app.js`, `public/styles.css`; static routes in the server.
- **Acceptance criteria:** AC-14.
- **Files expected to change:** `public/*`, `src/server.js`, `test/ui.test.js`
- **Tests required:** served HTML has the input/button/aria-live region; `app.js` served with the JS content type; unknown static paths return 404; the script uses `textContent` and not `innerHTML`. Manual/browser check of messages.
- **Status:** Done
- **Evidence required:** `npm test` output plus a browser check record.
- **Evidence recorded:**
  - `npm test` → `tests 47, pass 47, fail 0` (3 in `test/ui.test.js`; 3 server tests added for the drain fix below).
  - **Browser check (Chrome via Claude in Chrome, http://localhost:3000, 2026-10-22).**
    - **Run 1 found a defect:** `big.pdf` (3,000,000 bytes) showed *"could not be sent. Check your connection"* instead of the size message. The server sent 413 with `Connection: close` while Chrome was still uploading, and Chrome reported a network error.
    - **Fix:** bounded body drain on early rejection (`discardBody`, `MAX_DRAIN_BYTES` = 8 MiB) plus a `file.size` pre-check in `public/app.js`. SEC-2 wording was updated in the spec.
    - **Run 2 (after fix), files `valid.pdf`, `notes.txt`, `fake.pdf`, `big.pdf`:** success message (green) for `valid.pdf` with "4 more files"; red failure messages "not a PDF. Only .pdf files are allowed", "not a valid PDF file", and "larger than the 2 MB limit".
    - **Run 2, then `valid2`–`valid6.pdf`:** 4 successes, then a limit message for the 6th file. Exactly 5 files on disk under `tmp/uploads/<uuid>/<uuid>.pdf`.
    - **Run 3:** the limit message was changed to name the refused file, and the server was restarted. In a fresh session, 6 valid PDFs gave 5 successes and then *"Upload failed: "valid6.pdf" was not uploaded because you have reached the limit of 5 PDF files for this session."*
    - Screenshots were captured locally (Chrome screenshot temp folder) and are not committed.
  - Also fixed: the test script now passes `--test-timeout=30000` so a hanging test fails instead of blocking.

## TASK-6 — Validation and documentation

- **Description:** Full test run, AC checklist, AC-15 audit, README, decisions record.
- **Acceptance criteria:** every AC has a status and evidence; docs are consistent.
- **Files expected to change:** `README.md`, `docs/decisions/file-upload-decisions.md`, this file, `test/no-external.test.js`
- **Tests required:** AC-15 audit test (no dependencies, no `process.env`, no outbound requests in `src/`).
- **Status:** Done
- **Evidence required:** full `npm test` output; AC checklist below.
- **Evidence recorded:** `npm test` → `tests 51, suites 0, pass 51, fail 0, cancelled 0, skipped 0` (4 new in `test/no-external.test.js`).

---

## Final validation (2026-10-22)

**Command:** `npm test` (Node v24.14.1, Windows 11) → **51 tests, 51 pass, 0 fail**, ~0.38 s. The full suite was also run 4 consecutive times after the TASK-5 drain fix, passing 47/47 each time (before the 4 audit tests were added).

| AC | Status | Evidence | Gap |
|---|---|---|---|
| AC-1 valid PDF accepted and stored | Pass | `server.test.js` "AC-1: valid PDF is accepted, stored, and reported" (checks 201, message, remaining=4, bytes on disk); `storage.test.js` AC-1; browser run 2 | — |
| AC-2 2,097,152 accepted / 2,097,153 → 413 | Pass | `server.test.js` two AC-2 tests; `validation.test.js` AC-2 boundary tests | 2 MB interpretation needs confirmation (HD-1) |
| AC-3 non-.pdf → 415; `.PDF` accepted | Pass | `server.test.js` AC-3; `validation.test.js` AC-3 ×3; browser run 2 (`notes.txt`) | — |
| AC-4 bad signature → 422 | Pass | `server.test.js` AC-4; `validation.test.js` AC-4; browser run 2 (`fake.pdf`) | — |
| AC-5 missing `%%EOF` → 422 | Pass | `server.test.js` AC-5; `validation.test.js` AC-5 ×3 (incl. window boundary) | — |
| AC-6 empty → 422 | Pass | `server.test.js` AC-6; `validation.test.js` AC-6 | — |
| AC-7 6th upload → 429, 5 stored | Pass | `server.test.js` AC-7 (also checks the file is named in the message); `session-store.test.js` AC-7; browser runs 2 and 3 | — |
| AC-8 rejections don't consume quota | Pass | `server.test.js` AC-8; `session-store.test.js` AC-8 | Rule needs confirmation (HD-2) |
| AC-9 independent sessions | Pass | `server.test.js` AC-9 ×2 (new session; forged cookie) | — |
| AC-10 concurrency → exactly 5 | Pass | `server.test.js` AC-10 (6 parallel uploads → [201×5, 429]); `session-store.test.js` AC-10 | Single-process only |
| AC-11 missing name → 400; traversal contained | Pass | `server.test.js` AC-11 ×3; `storage.test.js` AC-11 ×2; `validation.test.js` AC-11 | — |
| AC-12 over-limit Content-Length → 413, nothing stored | Pass | `server.test.js` "AC-12: ... client can read it" (3 MB body), "AC-12/SEC-2: ... over the drain cap"; SEC-2 chunked tests ×2 | — |
| AC-13 cookie attributes | Pass | `server.test.js` AC-13 (HttpOnly, SameSite=Strict, Path=/, no Max-Age/Expires; reuse) | No `Secure` flag (HTTP only locally) |
| AC-14 upload page and messages | Pass | `ui.test.js` AC-14 ×3; browser runs 1–3 in TASK-5 evidence | Visual styling checked by one browser (Chrome) only |
| AC-15 no deps, no network, no env/secrets | Pass | `no-external.test.js` AC-15 ×4; `package.json` has no dependency fields | — |

### Spec/code mismatches
- None open. SEC-2 was revised during TASK-5 (see decisions D-6) to match the bounded-drain behaviour; no acceptance criterion changed.

### Risks
- **Security:**
  - Content checks are signature-only (HD-3).
  - The quota is per cookie, so clearing cookies gives a new quota.
  - There is no rate limiting.
  - The cookie has no `Secure` flag.
- **Privacy:** Files stay on local disk indefinitely, with no retention policy.
- **Performance:** Up to 2 MiB is buffered per in-flight upload, and up to 8 MiB is discarded per early rejection. The in-memory session map is unbounded.
- **Maintainability:** `MAX_FILE_BYTES` is duplicated in `src/config.js` and `public/app.js` (asserted by `ui.test.js`).

### Credential audit
No API keys, secrets, tokens, environment variables, paid services, accounts, or credential-dependent services were introduced (AC-15 tests; manual review of `src/`, `public/`, `package.json`).
