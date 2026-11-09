# Repository Guidelines

## Project Structure & Module Organization

Bolg uses React/Vite, Express, and SQLite. `src/components/` groups UI by feature, including the author workspace in `studio/`; contexts and utilities live beside it. `server/routes/`, `server/middleware/`, `server/services/`, and `server/db/` separate HTTP, authorization, business logic, and storage. `admin/` contains the legacy interface. Assets belong in `public/` or `assets/`; Vite outputs `dist/`. Use `scripts/` for operations, `docs/` for guides, and `openspec/` for specifications.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `cp .env.example .env`: create local configuration before starting services.
- `npm run dev`: start Vite on port 9099 and the public API on 9098.
- `npm run admin`: run optional legacy administration on 3033; prefer `/studio`.
- `npm run build`: generate production frontend assets in `dist/`.
- `npm start`: run the public Express server.
- `node scripts/create-setup-token.js`: create a one-time empty-database token; finish at `/setup`.
- `node scripts/init-admin.js`: alternative local administrator initialization.

## Coding Style & Naming Conventions

Use JavaScript ES modules, two-space indentation, single quotes, and the surrounding semicolon style; application source generally omits semicolons. Add concise Chinese purpose comments to new or modified functions, including callbacks. Name React components in PascalCase, hooks with a `use` prefix, and functions and variables in camelCase. Keep route handlers, database operations, and UI concerns in their existing directories. No lint or formatting command is currently configured.

## Testing Guidelines

`npm test` runs Node acceptance tests in `tests/*.test.js`, using disposable databases and upload directories. Run `npm run build` first and install Chromium with `npm exec -- playwright install chromium`. Browser coverage includes author workflows, management, publishing, reader interactions, and `/blog/` deployments. Add behavior-focused regressions for changed APIs or interactions. No coverage threshold is configured. Record commands, results, and untested limitations.

## Commit & Pull Request Guidelines

Use focused commits with short, action-oriented Chinese summaries, following recent history. PRs explain the problem, resulting behavior, verification results, and configuration changes. Link issues and include screenshots for visible changes.

## Security & Agent Instructions

Keep `.env`, credentials, SQLite databases, uploads, and generated output out of commits. Browser management uses revocable Cookie sessions and CSRF; `/api/v1` uses scoped integration keys and is disabled by default. Article saves update working copies; only explicit publishing changes public snapshots. See `docs/author-workspace-migration.md` before migrations or rollback. Use a strong `JWT_SECRET`; retire legacy JWT after callers migrate. Prefer CodeGraph when `.codegraph/` exists; use text search for configuration or missing results.
