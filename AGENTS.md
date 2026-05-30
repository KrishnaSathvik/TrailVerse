# TrailVerse (NPE-USA) — Agent Instructions

**Human-readable handbook:** [docs/TRAILVERSE-AGENT-HANDBOOK.md](docs/TRAILVERSE-AGENT-HANDBOOK.md) — full merge of all rules (read in browser or share with team).

**Primary context for Cursor agents lives in Cursor rules** — read these before exploring the whole codebase:

| Rule file | When to use |
|-----------|-------------|
| `.cursor/rules/00-trailverse-master.mdc` | Always — stack, dev, architecture, SEO basics |
| `.cursor/rules/01-frontend-pages.mdc` | Always — every route, page purpose, APIs |
| `.cursor/rules/02-backend-api.mdc` | Editing `server/` |
| `.cursor/rules/03-frontend-conventions.mdc` | Editing `next-frontend/` |
| `.cursor/rules/04-discover-and-parks.mdc` | Discover hub + park detail work |
| `.cursor/rules/05-plan-ai-mcp-and-admin.mdc` | Trailie, voice, admin CMS |
| `.cursor/rules/06-mcp-chatgpt-cloud.mdc` | **MCP on Render, ChatGPT App Directory, Claude, widgets** |
| `.cursor/rules/07-frontend-services-layer.mdc` | `src/services/` API clients |

## External AI distribution

- **ChatGPT app**: [nationalparksexplorerusa.com/chatgpt](https://www.nationalparksexplorerusa.com/chatgpt) → OpenAI Apps SDK
- **Claude MCP**: [nationalparksexplorerusa.com/mcp](https://www.nationalparksexplorerusa.com/mcp) → `https://trailverse-mcp.onrender.com/mcp`
- **Implementation**: `mcp-server/` (Python), deployed via `mcp-server/render.yaml`

## Quick start

```bash
npm run dev   # frontend :3000 + backend :5001
```

## Next.js

See `next-frontend/AGENTS.md` — this project may use Next.js APIs that differ from older versions; check `node_modules/next/dist/docs/` when unsure.
