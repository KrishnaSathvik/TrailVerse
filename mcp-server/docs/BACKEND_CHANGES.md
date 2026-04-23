# Backend changes needed on the TrailVerse Express server

**One-time change to the main TrailVerse repo before the MCP app can launch.**

All ChatGPT traffic to the MCP server flows through a single Render IP. At
scale, every user's request counts against the same IP bucket, so the default
anonymous rate limit (60 req / 15 min) would self-DOS within minutes.

The fix: shared-secret header that the MCP server attaches and the Express
backend recognizes to bypass the anonymous rate limit. The key lives only on
two servers you control; both are read-only data paths so the blast radius of
a leak is capped (and the MCP server adds its own in-process limiter as
defense-in-depth).

## Step 1 — Generate a key

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
# or: openssl rand -base64 48
```

Save it somewhere you can paste twice (Render dashboard for both services).

## Step 2 — Add an Express middleware

Create `server/middleware/mcpBypass.js` in the TrailVerse repo:

```javascript
// server/middleware/mcpBypass.js
// Marks requests from the trusted MCP server so downstream rate limiters
// can let them through. Runs early in the middleware chain.

const HEADER = "x-trailverse-mcp-key";

module.exports = function mcpBypass(req, res, next) {
  const presented = req.headers[HEADER];
  const expected = process.env.MCP_BYPASS_KEY;

  if (expected && presented && presented === expected) {
    req.isTrustedMcp = true;
    req.skipAnonymousRateLimit = true;
  }
  next();
};
```

Register it in your main `app.js` / `server.js`, **before** your rate limiter:

```javascript
const mcpBypass = require("./middleware/mcpBypass");

// ... other app.use() calls

app.use(mcpBypass);  // must come BEFORE the rate limiter

// your existing rate limiter, slightly modified:
app.use("/api/", (req, res, next) => {
  if (req.skipAnonymousRateLimit) return next();
  return anonymousRateLimiter(req, res, next);
});
```

If you're using `express-rate-limit`, use its `skip` option instead:

```javascript
const rateLimit = require("express-rate-limit");

const anonymousLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skip: (req) => Boolean(req.skipAnonymousRateLimit),
  message: { error: "Too many requests" },
});
```

## Step 3 — Set the env var on Render

In the Render dashboard for the **trailverse** service (your main Express
backend, not the MCP server):

1. Environment → Add Environment Variable
2. Key: `MCP_BYPASS_KEY`
3. Value: (paste the secret from Step 1)
4. Save → service redeploys automatically

Do the same for the **trailverse-mcp** service with the **same** value.

## Step 4 — Verify it works

After both services redeploy:

```bash
# Without the key → still rate-limited (expected)
curl -s -o /dev/null -w "%{http_code}\n" \
  https://trailverse.onrender.com/api/parks/search?state=UT

# With the key → should succeed
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-TrailVerse-MCP-Key: YOUR_KEY_HERE" \
  https://trailverse.onrender.com/api/parks/search?state=UT
```

You should see 200 on the second call regardless of how many times you run
it in a row.

## Step 5 — Audit: what should NOT bypass?

The bypass sets `req.skipAnonymousRateLimit` only. It deliberately does NOT
grant authentication, admin access, or any user identity. Audit downstream
middleware to ensure the flag is only consumed by rate limiters:

```bash
# In the TrailVerse repo:
grep -rn "skipAnonymousRateLimit\|isTrustedMcp" server/
```

Every hit should be in rate-limit-related code only. If you see it checked
anywhere else (auth, ACL, billing), that's a bug — the bypass key should
NEVER grant data access beyond what's already public.

## Security notes

- **Read-only scope.** The MCP server only calls public read endpoints and
  the anonymous AI chat endpoint. None of these create, update, or delete
  data, so a leaked key is a rate-limit bypass, not a data-exfiltration
  vector.
- **Observability.** Consider adding `req.isTrustedMcp` to your access logs
  so you can spot anomalies (sudden 10x spike in trusted requests = key
  leak or MCP misconfig).
- **Rotation.** To rotate: generate a new key, update Render env on **both**
  services at the same time, redeploy. No downtime if Render restarts them
  in parallel; a few seconds of 429s if sequential.
- **Defense-in-depth.** The MCP server also enforces its own in-process
  rate limit (`MCP_PLAN_TRIP_LIMIT`, `MCP_READ_LIMIT`) so a leaked key
  can't amplify an attacker's throughput beyond the MCP server's single
  process. Tune these via env vars if traffic patterns demand.

## What if you don't do this?

Without the bypass, the launch will fail within minutes of any public traffic:

1. ChatGPT forwards 4+ user requests in 15 min → MCP server forwards 4 requests
2. Backend's anonymous limiter starts returning 429s
3. All subsequent MCP calls fail
4. Users see broken widgets; ChatGPT's quality signals drop; OpenAI deprioritizes the app in discovery

This is the one pre-launch change you cannot skip.
