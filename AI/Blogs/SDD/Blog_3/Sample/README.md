# PDF Upload

A small local web app that lets a user upload **up to 5 PDF files per browser session**, each **2 MB or smaller**. Non-PDF files and files that fail basic content checks are rejected with a clear message. Accepted files are stored in the local temporary storage area `tmp/uploads/`.

Specification: [docs/specs/file-upload.md](docs/specs/file-upload.md) (SPEC-001).

## Requirements

- Node.js 20 or later (developed and tested on Node 24.14.1)
- No `npm install` needed: the project has **no third-party dependencies**.

## Run locally

```sh
npm start
```

Open http://localhost:3000, choose one or more files, and click **Upload**. Each file gets its own success (green ✓) or failure (red ✗) message.

The port (3000) and storage directory are set in `src/config.js`. No environment variables are used.

## Test

```sh
npm test
```

This runs 51 tests with Node's built-in test runner: unit tests, HTTP integration tests on an ephemeral port with a throw-away temp directory, and dependency/no-network audit tests. Test names start with the acceptance criterion they cover (e.g. `AC-7: ...`).

## Rules enforced

| Rule | Behaviour | HTTP status |
|---|---|---|
| Max 5 accepted files per browser session | 6th accepted upload refused; rejected uploads don't count | 429 |
| File name required | Missing/malformed `X-File-Name` header | 400 |
| `.pdf` extension (case-insensitive) | Others refused | 415 |
| Size ≤ 2,097,152 bytes (2 MiB) | Larger refused, also pre-checked in the page | 413 |
| Not empty; starts with `%PDF-`; `%%EOF` in last 1,024 bytes | Otherwise refused | 422 |
| Accepted | Saved as `tmp/uploads/<session-uuid>/<file-uuid>.pdf` | 201 |

## API

`POST /api/uploads`: the raw file bytes are the request body; the header `X-File-Name` holds the URI-encoded original name. The response is JSON:

```json
{ "ok": true, "message": "\"report.pdf\" uploaded successfully. You can upload 4 more files this session.",
  "uploadsRemaining": 4, "file": { "id": "<uuid>", "name": "report.pdf", "size": 1000 } }
```

## Project layout

```
src/config.js         limits, port, paths
src/validation.js     file-name, size and PDF content checks (pure functions)
src/session-store.js  in-memory session quota store   (local mock)
src/storage.js        local temp-file storage          (local mock)
src/server.js         HTTP server: upload endpoint + static page
src/index.js          entry point (npm start)
public/               upload page (HTML, JS, CSS)
test/                 node:test suites
docs/                 spec, plan, tasks, decisions (SDD)
```

## External services, mocks and limitations

- **No external or public APIs are used.** The app makes no outbound network calls and uses no API keys, accounts, secrets, or environment variables.
- **Session store: in-memory.** *Local mock — replace with production integration later.* Sessions and quotas are lost when the server restarts, so a returning browser gets a fresh quota of 5.
- **File storage: local `tmp/uploads/`.** *Local mock — replace with production integration later.* Files are never cleaned up automatically; delete `tmp/` manually when you no longer need them.
- **Content checks are basic** (signature and end-of-file marker). They do not prove a file is a well-formed or safe PDF and are not a malware scan.
- The session cookie is not marked `Secure` because local development uses plain HTTP. Add it when serving over HTTPS.
- In-memory sessions are never expired, so memory grows with the number of sessions. That is fine for local use but not for production.

See [docs/decisions/file-upload-decisions.md](docs/decisions/file-upload-decisions.md) for decisions, assumptions, and follow-up work.
