# Tate Lyman Web Services

Static portfolio and service storefront for selling AI-built app rescue, production cleanup, website fixes, and small automations.

## Local preview

Open `index.html` directly in a browser, or run:

```bash
npx serve .
```

## Files

- `index.html` - main sales-facing portfolio page
- `ai-app-rescue.html` - AI-built app rescue and production cleanup sales page
- `repair-pass.html` - fixed-scope website repair pass sales page
- `example-report.html` - sample repair-pass checklist deliverable
- `maintenance.html` - recurring website care plan page
- `overflow.html` - agency overflow production landing page
- `audit.html` - free website audit lead magnet
- `audit.js` - browser-only audit scoring logic
- `styles.css` - main site styles
- `demos/` - sample landing pages for local business outreach
- `assets/` - generated screenshots used by the portfolio
- `outreach/` - lead criteria and message templates
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

- $99 AI app risk check
- $299+ AI app rescue sprint
- $500+ MCP or agent connector

The website offers stay available as secondary products:

- $150 website repair pass
- $350 one-page business site
- $49+ monthly website care

The demo pages are sample concepts, not claimed client work.
