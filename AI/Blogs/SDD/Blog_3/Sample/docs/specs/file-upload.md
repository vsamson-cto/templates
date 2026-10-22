# Specification: PDF File Upload

| Field | Value |
|---|---|
| Specification ID | SPEC-001 |
| Status | Approved for implementation (assumptions recorded below; see Human decision points) |
| Created | 2026-10-22 |
| Last revised | 2026-10-22 (SEC-2 wording; limit message names the file) |
| Plan | [../plans/file-upload-plan.md](../plans/file-upload-plan.md) |
| Tasks | [../tasks/file-upload-tasks.md](../tasks/file-upload-tasks.md) |

## Problem

Users need to give the application PDF documents. Without controls, users could upload unlimited files, oversized files, or files that are not really PDFs, which wastes storage and creates security risk.

## Goal

Provide a browser-based upload feature that accepts up to 5 valid PDF files per browser session, each 2 MB or smaller, stores accepted files in the application's local temporary storage area, and tells the user clearly whether each upload succeeded or failed and why.

## Users

- **End user**: a person using a web browser who wants to upload PDF files.
- **Operator/developer**: a person running the application locally who inspects stored files.

## In scope

- A web page with a file picker and upload button.
- An HTTP endpoint that receives one file per request.
- Validation: file extension, file size, and basic PDF content checks.
- A per-browser-session limit of 5 accepted files.
- Storing accepted files in the local temporary storage directory `tmp/uploads/`.
- Clear success and failure messages for every upload attempt.

## Out of scope

- User accounts, login, or authentication providers.
- Cloud or production storage; databases.
- Listing, downloading, previewing, renaming, or deleting uploaded files.
- Virus/malware scanning or deep PDF structure validation (e.g. parsing objects, detecting encrypted or JavaScript-bearing PDFs).
- Automatic cleanup or expiry of stored files.
- Persisting session state across server restarts.
- Drag-and-drop, upload progress bars, resumable uploads.

## Business rules

- **BR-1** A browser session is identified by a server-issued session cookie. A session ends when the browser discards the cookie (browser close) or the server restarts.
- **BR-2** A session may have at most **5 accepted** files. Rejected uploads do **not** count toward the limit. *(Assumption — see HD-2.)*
- **BR-3** A file must be **≤ 2 MB**, where 2 MB = **2,097,152 bytes** (2 × 1024 × 1024). A file of exactly 2,097,152 bytes is accepted. *(Assumption — see HD-1.)*
- **BR-4** A file must have a `.pdf` extension (case-insensitive).
- **BR-5** A file must pass basic content checks:
  - **BR-5a** it is not empty;
  - **BR-5b** its first 5 bytes are the PDF signature `%PDF-`;
  - **BR-5c** it contains the end-of-file marker `%%EOF` within its last 1,024 bytes.
- **BR-6** Checks are applied in this order, and the first failure is reported: session limit → filename present → extension → size → empty → signature → EOF marker.
- **BR-7** Every upload attempt returns a human-readable message stating success or the specific reason for failure.

## Security, privacy, and data-handling constraints

- **SEC-1** Client-supplied file names are never used to build file-system paths. Stored files get server-generated random names (`<uuid>.pdf`) inside a per-session subdirectory.
- **SEC-2** The server never buffers more than 2,097,152 bytes of a request body. When it rejects a request before the whole body is read (size, extension, name, or session limit), it reads and discards the rest of the body, up to 8 MiB in total, so that browsers can display the response. Requests that declare or send more than 8 MiB get the rejection and the connection is closed. The upload page also checks `file.size` before sending, so oversized files always get the size message in the browser. *(Revised 2026-10-22 during TASK-5: closing the connection immediately made Chrome report a network error instead of the 413 message. No acceptance criterion changed; see decisions record D-6.)*
- **SEC-3** Session IDs are cryptographically random; the cookie is `HttpOnly`, `SameSite=Strict`, `Path=/`, with no `Max-Age`/`Expires` (a browser-session cookie).
- **SEC-4** The session-limit check and reservation are atomic within the process, so concurrent requests cannot exceed 5 accepted files.
- **SEC-5** File names shown in the UI are rendered as text, never as HTML.
- **SEC-6** Uploaded content is never sent to any external service. The application makes no outbound network calls.
- **SEC-7** No API keys, secrets, tokens, or environment variables are used.
- **SEC-8** Responses include `X-Content-Type-Options: nosniff`; HTML is served with a restrictive `Content-Security-Policy` (`default-src 'self'`).

## Public API or local mock approach

- No external or public API is needed. Everything runs locally with Node.js built-in modules.
- **Session store**: in-memory map in the server process. *Local mock — replace with production integration later.*
- **File storage**: local file system under `tmp/uploads/`. *Local mock — replace with production integration later.*

### HTTP interface

`POST /api/uploads`
- Request body: the raw file bytes (not multipart).
- Header `X-File-Name`: the original file name, URI-encoded (`encodeURIComponent`).
- Response: JSON `{ ok: boolean, message: string, uploadsRemaining: number, file?: { id, name, size } }`.

| Outcome | Status |
|---|---|
| Accepted | 201 |
| Missing/invalid file name | 400 |
| File too large | 413 |
| Not a `.pdf` extension | 415 |
| Empty file / failed content check | 422 |
| Session limit reached | 429 |

`GET /` serves the upload page.

## Acceptance criteria

- **AC-1** Uploading a valid PDF (starts with `%PDF-`, contains `%%EOF` in its last 1,024 bytes, `.pdf` extension, ≤ 2,097,152 bytes) returns **201**, `ok: true`, a message containing the file name, and `uploadsRemaining` decreased by 1; exactly one file with that content exists under `tmp/uploads/<sessionId>/`.
- **AC-2** A valid PDF of exactly 2,097,152 bytes is accepted (201). A file of 2,097,153 bytes is rejected with **413**, a message stating the 2 MB limit, and nothing is stored.
- **AC-3** A file whose name does not end in `.pdf` (case-insensitive; e.g. `notes.txt`, `image.png`) is rejected with **415** and a message saying only PDF files are allowed; nothing is stored. `REPORT.PDF` is accepted when its content is valid.
- **AC-4** A `.pdf` file that does not begin with `%PDF-` is rejected with **422** and a message saying the file is not a valid PDF; nothing is stored.
- **AC-5** A `.pdf` file that begins with `%PDF-` but lacks `%%EOF` in its last 1,024 bytes is rejected with **422** and a message saying the file appears incomplete or corrupted; nothing is stored.
- **AC-6** An empty (0-byte) `.pdf` file is rejected with **422** and a message saying the file is empty; nothing is stored.
- **AC-7** In one session, the first 5 valid uploads succeed; the 6th valid upload is rejected with **429** and a message stating the 5-file limit; only 5 files are stored for that session.
- **AC-8** Rejected uploads do not consume quota: after 1 rejected and 5 valid uploads in one session, all 5 valid uploads succeed.
- **AC-9** A different session (no cookie or a different cookie) has its own independent 5-file quota.
- **AC-10** 6 concurrent valid uploads in one session result in exactly 5 acceptances and 1 rejection (429).
- **AC-11** A request with a missing `X-File-Name` header is rejected with **400**. A file name containing path segments (e.g. `../../evil.pdf`) never causes a file to be written outside `tmp/uploads/<sessionId>/`; stored file names are server-generated.
- **AC-12** A request whose declared `Content-Length` exceeds 2,097,152 bytes is rejected with **413** without storing anything.
- **AC-13** The first response to a client without a session cookie sets a cookie `sid` with `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Max-Age`/`Expires`.
- **AC-14** `GET /` returns 200 HTML containing a file input that accepts PDFs, an upload button, and a message region with `aria-live`; the page script shows the server's message for each file, styled distinctly for success and failure, using text (not HTML) rendering.
- **AC-15** The project has no third-party dependencies, makes no outbound network calls, and reads no environment variables, API keys, or secrets.

## Evidence required

- `npm test` output showing all tests passing, with tests named after the ACs they cover.
- For AC-14: automated check of the served HTML plus a manual or browser-automated check of the UI messages.
- For AC-15: `package.json` showing no dependencies and a source search for `process.env`, `fetch(` on the server, and outbound `http.request`.

## Human decision points

- **HD-1** "2 MB" is interpreted as 2,097,152 bytes (binary MB). If the business means 2,000,000 bytes, change `MAX_FILE_BYTES` in `src/config.js` and the AC-2 tests.
- **HD-2** Rejected uploads do not count toward the 5-file limit. Confirm this is intended.
- **HD-3** "Basic content checks" is interpreted as BR-5 (non-empty, `%PDF-` signature, `%%EOF` trailer). Confirm whether deeper checks (e.g. malware scanning, rejecting encrypted PDFs) are needed before production.
- **HD-4** "Browser session" is a server-issued session cookie stored in memory. Confirm before production that a persistent session store and a retention/cleanup policy for `tmp/uploads/` are needed.
