# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A cyberpunk-themed tech blog system with WebGL visual effects, SQLite persistence, and JWT authentication. Provides a same-origin reader site and author workspace, with an optional legacy JWT administration service.

**Tech Stack**: React 19 + Vite 8 + Tailwind CSS 4 + Express 5 + SQLite3 + Three.js/OGL

## Development Commands

```bash
# Install dependencies
npm install

# Development (runs Vite dev server + public API server concurrently)
npm run dev
# Frontend: http://localhost:9099
# Backend API: http://localhost:9098

# Admin server (separate terminal)
npm run admin
# Admin panel: http://localhost:3033/admin

# Production build
npm run build

# Production server
npm start

# Initialize admin user (first-time setup)
node scripts/init-admin.js
```

## Architecture

### Same-Origin Application and Legacy Compatibility

`server/index.js` (9098) serves the reader site, `/login`, `/setup`, `/studio/*`, public APIs and protected author APIs. Browser administration uses revocable HttpOnly Cookie sessions, CSRF and same-origin validation. Vite (9099) proxies requests during development; production needs one Web port.

`server/index-admin.js` (3033) and `npm run admin` remain optional legacy JWT compatibility. Compose enables this service only through `--profile legacy-admin`, bound to host loopback. Default Compose services are public and daily backup.

The machine publishing API `/api/v1` requires scoped integration keys and `PUBLISHING_API_ENABLED=true` (default false). Its browser management UI is `/studio/integrations`. Shared article writes belong in `server/services/articleService.js`: save only changes working copies; publish promotes the public snapshot atomically. Modern writes require revision-based `If-Match`.

Migration, setup and rollback: `docs/author-workspace-migration.md`; operations: `docs/operations.md`; publishing contract: `docs/api/publishing-v1.openapi.yaml`.

### Data Layer

**SQLite Database** (`server/data/blog.db`)
- WAL mode enabled for better concurrency
- Foreign key constraints enforced
- FTS5 virtual table for full-text search
- Schema in `server/db/index.js` with automatic initialization

**Tables**:
- `users` - JWT authentication (bcrypt hashed passwords)
- `articles` - Blog posts with slug-based routing
- `categories`, `tags`, `article_tags` - Taxonomy
- `comments` - Threaded comments with moderation status
- `articles_fts` - Full-text search index (FTS5)

**Data Access Objects** (DAO pattern):
- `server/db/articleDAO.js` - Article queries with pagination/search
- `server/db/otherDAO.js` - Categories, tags, comments, users

**File Storage**:
- Uploads: `server/data/uploads/` (Sharp compression, max 1200px width)
- Settings: `server/data/settings.json`
- Backups: Auto-created as `<file>.bak.<timestamp>`

### Frontend Structure

**Component Hierarchy**:
```
<App> (src/App.jsx)
├── Background layers (z-0 to z-2)
│   ├── <PixelSnow /> - Three.js shader-based particle system
│   ├── <SideRays /> - OGL corner light rays
│   └── CSS grid overlay
├── <SplashCursor /> - WebGL2 fluid simulation (z-50)
├── <Header /> - Sticky nav with backdrop blur
├── <Hero /> - Full-screen landing section
├── <ArticleList /> - Paginated blog feed
├── <ArticleDetail /> - Individual post view
├── <CommentSection /> - Threaded comments
└── <Footer />
```

**Key Patterns**:
- React Router handles reader and author routes with deployment basename support
- All WebGL components wrapped in `ErrorBoundary`
- `IntersectionObserver` pauses off-screen WebGL effects
- Settings context (`SettingsContext.jsx`) provides site-wide config

**API Integration** (`src/utils/api.js`):
- `getApiUrl(path)` - Handles base path for sub-path deployments
- Vite dev proxy: `/api/*` → `http://localhost:9098`

### Authentication Flow

1. For an empty database, generate a local token with `node scripts/create-setup-token.js` and complete `/setup`; existing accounts are preserved and anonymous registration is disabled.
2. Browser login uses `POST /api/session/login`; the opaque session Cookie is HttpOnly. `/api/session/me` provides the in-memory CSRF token; mutations send `X-CSRF-Token` and a trusted origin.
3. `/api/studio/*` requires an administrator session. `/api/v1/*` accepts only integration Bearer credentials, with separate read/write/publish/media scopes and ownership checks.
4. Legacy `/api/auth/login` and Bearer writes remain gated by `LEGACY_JWT_ENABLED`. Password changes revoke all sessions and invalidate old JWT versions. Browser logout revokes only the current session.

### WebGL Background Effects

All effects use `IntersectionObserver` to pause when not visible:

1. **PixelSnow** (Three.js) - `src/components/background/PixelSnow.jsx`
   - Custom GLSL fragment shader with DDA ray marching
   - Renders 3D grid cells as pixel blocks (square/circle/snowflake shapes)
   - ~160 lines of shader code

2. **SideRays** (OGL) - Corner-emitted colored light beams
   - Sine wave animation, saturation/tilt controls

3. **SplashCursor** (WebGL2) - Mouse-driven fluid simulation
   - Full 2D Navier-Stokes pipeline: advection → pressure solve → vorticity
   - Rainbow HSV color rotation, ~1090 lines

All effects fail gracefully if WebGL unavailable - wrapped in error boundaries.

## Testing & Verification

**Database queries**: Run SQLite CLI to inspect data:
```bash
sqlite3 server/data/blog.db
# .schema articles
# SELECT * FROM articles LIMIT 5;
# SELECT * FROM articles_fts WHERE articles_fts MATCH 'react';
```

**API testing**: Use curl or Postman:
```bash
# Get articles with pagination
curl "http://localhost:9098/api/articles?page=1&per_page=10"

# Login
curl -X POST http://localhost:9098/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Create article (needs token)
curl -X POST http://localhost:9098/api/articles \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"..."}'
```

**Logs**: Winston writes to `server/logs/`:
- `combined.log` - All logs
- `error.log` - Errors only
```bash
tail -f server/logs/combined.log
```

## Deployment

**Sub-path deployment support**: Set `VITE_BASE_PATH` for sites like `example.com/blog/`:

```bash
# In deploy.config or .env
VITE_BASE_PATH=/blog/

# Build with base path
VITE_BASE_PATH=/blog/ npm run build

# Nginx configuration
location /blog/ {
  proxy_pass http://127.0.0.1:9098;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
}
```

**Deployment script** (`deploy.sh`):
- Parses `deploy.config` for server credentials
- Builds with `VITE_BASE_PATH`
- Rsync to remote server
- Creates systemd service
- Implements blue-green releases with rollback
- Preserves `shared/data/` directory across deploys

**Systemd service**:
```ini
[Service]
WorkingDirectory=/opt/myResume/current
ExecStart=/usr/bin/node /opt/myResume/current/server/index.js
Environment=NODE_ENV=production
Environment=PUBLIC_PORT=9098
Environment=VITE_BASE_PATH=/myResume/
```

## Code Patterns

**Error handling**: All async routes use try-catch → `next(error)` → `errorHandler` middleware

**Database transactions**: Use `db.transaction()` for multi-step writes:
```javascript
const insertArticle = db.transaction((article, tagIds) => {
  const result = db.prepare('INSERT INTO articles ...').run(article)
  for (const tagId of tagIds) {
    db.prepare('INSERT INTO article_tags ...').run(result.lastInsertRowid, tagId)
  }
})
```

**Image uploads**: Multer parses multipart, Sharp compresses:
```javascript
sharp(buffer)
  .resize(1200, null, { withoutEnlargement: true })
  .jpeg({ quality: 80 })
  .toFile(outputPath)
```

**Pagination response format**:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 10,
    "total": 100,
    "total_pages": 10,
    "has_next": true,
    "has_prev": false
  }
}
```

**Full-text search**: Use FTS5 MATCH operator with bm25 ranking:
```sql
SELECT articles.*, bm25(articles_fts) as rank
FROM articles JOIN articles_fts ON articles.rowid = articles_fts.rowid
WHERE articles_fts MATCH ?
ORDER BY rank
```

## Important Notes

- Admin panel (`admin/index.html`) is pure vanilla JS - no build step, no framework
- SQLite snapshots use `scripts/backup-db.js`; Compose runs a daily backup worker. Snapshots exclude uploads and settings, so full-site recovery also needs their matching copies.
- SQLite WAL files (`blog.db-wal`, `blog.db-shm`) should not be deleted while server runs
- JWT_SECRET must be set in production (generates random default in dev)
- First administrator creation requires a local one-time setup token or trusted local init-admin CLI; never enable anonymous first-user creation
- WebGL effects gracefully degrade on unsupported browsers
- Never commit `server/data/` directory - contains user data and credentials
