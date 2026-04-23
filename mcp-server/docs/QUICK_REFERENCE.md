# TrailVerse MCP — Quick Reference

Short, no-context-needed commands for everything you'll do repeatedly.

## Local

```bash
# Setup (once)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# Smoke-test all tools
python scripts/test_local.py

# Smoke-test one tool
python scripts/test_local.py plan_trip

# Point at local TrailVerse backend
TRAILVERSE_API_BASE=http://localhost:5001 python scripts/test_local.py

# Generate widget previews (open docs/preview-index.html after)
python scripts/generate_previews.py

# Run MCP server locally
python -m server.main
# → http://localhost:8000/mcp

# Expose via ngrok for ChatGPT dev mode
ngrok http 8000
```

## Health checks

```bash
curl https://trailverse-mcp.onrender.com/
curl https://trailverse-mcp.onrender.com/health

# MCP inspector against production
npx @modelcontextprotocol/inspector@latest \
  --server-url https://trailverse-mcp.onrender.com/mcp \
  --transport http
```

## ChatGPT developer mode flow

1. Settings → Apps & Connectors → Advanced → Developer Mode ON
2. Settings → Connectors → Create
3. URL: `https://trailverse-mcp.onrender.com/mcp`
4. After any code change: Connectors → TrailVerse → **Refresh**

## Test prompts

```
Plan a 3-day trip to Zion for a beginner with kids
Tell me about Bryce Canyon
Compare Zion and Bryce Canyon
Find parks in Utah with good stargazing
Upcoming ranger programs at Yellowstone
```

## Deploy

```bash
# Push to main triggers auto-deploy on Render
git push origin main

# Or manual redeploy from Render dashboard
# → Service → Manual Deploy → Deploy latest commit
```

## Files that matter most

| File | When to edit |
|---|---|
| `server/main.py` | Adding/removing a tool, changing annotations |
| `server/client.py` | Backend endpoint path changed, request body shape differs |
| `server/formatters.py` | Backend response shape differs from assumed shape |
| `widgets/*.html` | Changing widget design / what fields are shown |
| `render.yaml` | Changing env vars, plan, or region |
| `docs/SUBMISSION_CHECKLIST.md` | Preparing to submit or resubmit |
