# Tate Programs Web Services

Static portfolio and service storefront for selling launch reviews, production cleanup, website fixes, and small automations.

Live site: https://tateprograms.com/

## Local preview

Open `index.html` directly in a browser, or run:

```bash
npx serve .
```

## Files

- `index.html` - main sales-facing portfolio page
- `case-studies.html` - public proof-of-work page for Shipcheck, MCP, LaunchQuest, and related assets
- `ai-app-rescue.html` - launch review and production cleanup sales page
- `vibe-leak-check.html` - same-day exposure check page for fast-built apps
- `vibe-self-check.html` - free interactive launch safety checker for fast-built apps
- `vibe-checker.js` - browser-only scoring logic for the app self-check
- `mcp-self-check.html` - free interactive MCP server launch-readiness checker
- `mcp-checker.js` - browser-only scoring logic for the MCP launch self-check
- `mcp-launch-review.html` - fixed-scope paid MCP launch check page
- `mcp-launch-sample.html` - sample MCP launch check report
- `vibe-exposure-sample.html` - sample exposure-check deliverable
- `repair-pass.html` - fixed-scope website repair pass sales page
- `example-report.html` - sample repair-pass checklist deliverable
- `maintenance.html` - recurring website care plan page
- `overflow.html` - agency overflow production landing page
- `audit.html` - free website audit lead magnet
- `audit.js` - browser-only audit scoring logic
- `styles.css` - main site styles
- `demos/` - sample landing pages for local business outreach
- `assets/` - generated screenshots used by the portfolio
- `outreach/` - local-only lead criteria, trackers, and message templates ignored from the public repo
- `scripts/audit-leads.mjs` - local lead audit script

## Lead Audit Script

```bash
npm run audit:leads
```

The script reads `outreach/lead-tracker.csv` and writes:

- `outreach/generated/site-audits.md`
- `outreach/generated/site-audits.csv`

## Positioning

The front-door offer is intentionally concrete:

- $99 launch risk pass
- $299+ production fix sprint
- $99+ MCP launch review

The website offers stay available as secondary products:

- $150 website repair pass
- $350 one-page business site
- $49+ monthly website care

The demo pages are sample concepts, not claimed client work.
