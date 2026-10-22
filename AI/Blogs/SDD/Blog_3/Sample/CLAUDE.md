# CLAUDE.md — Working Agreement

This project follows **Specs-Driven Development (SDD)**: Specify → Plan → Tasks → Implement → Validate → Document.

## Project facts

- Runtime: Node.js ≥ 20 (developed on Node 24). ES modules (`"type": "module"`).
- **Zero third-party runtime or dev dependencies.** Use Node built-ins only (`node:http`, `node:fs`, `node:crypto`, `node:test`, `node:assert`).
- Run: `npm start` → http://localhost:3000
- Test: `npm test` (runs `node --test`)

## Layout

- `docs/specs/` — specifications (source of truth for requirements)
- `docs/plans/` — implementation plans linked to a spec
- `docs/tasks/` — task lists with status and evidence
- `docs/decisions/` — decision records, assumptions, trade-offs
- `src/` — server code; `public/` — browser UI; `test/` — automated tests
- `tmp/uploads/` — local temporary storage for accepted uploads (git-ignored)

## SDD rules for AI assistants

1. Read the spec, plan, and task list before changing code. Implement one task at a time.
2. Never invent requirements, business rules, evidence, or test results. Record real command output as evidence.
3. Do not add features that are not in the specification. If a requirement changes, update the spec first.
4. Every acceptance criterion must map to at least one automated test or an explicit "Needs Human Review" item.
5. Keep spec, plan, tasks, code, tests, and docs consistent in the same change.
6. Commit per task using conventional commits that reference IDs, e.g.
   `feat(upload): add PDF and file-size validation [SPEC-001/TASK-1]`.
7. Do not claim completion unless `npm test` passes; if it fails, diagnose, fix, and rerun.

## Security and external-service rules

- No API keys, tokens, secrets, environment variables, paid services, cloud providers, or sign-up-required services.
- Prefer local, in-memory, or temporary-file implementations. Anything standing in for a production system must be labelled in code and docs:
  **"Local mock — replace with production integration later."**
- Never send uploaded file contents or personal data to external services.
- Treat all client input (file names, headers, bodies) as untrusted. Never use client-supplied names in file-system paths.
- Ask the human before: adding a dependency, changing an approved acceptance criterion, destructive actions, or security-sensitive decisions.
