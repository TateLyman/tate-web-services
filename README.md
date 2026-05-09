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
- `terminal-console.js` - interactive command handling for the terminal-style homepage
- `case-studies.html` - public proof-of-work page for Shipcheck, MCP, LaunchQuest, and related assets
- `launch-review.html` - launch review and production cleanup sales page
- `launch-exposure-check.html` - same-day exposure check page for fast-built apps
- `launch-readiness-check.html` - free interactive launch safety checker for fast-built apps
- `launch-checker.js` - browser-only scoring logic for the app self-check
- `mcp-self-check.html` - free interactive MCP server launch-readiness checker
- `mcp-checker.js` - browser-only scoring logic for the MCP launch self-check
- `mcp-registry-audit.html` - browser-only MCP registry/server.json audit tool
- `mcp-registry-audit.js` - public metadata checks for server.json and GitHub repo launch proof
- `mcp-registry-pulse.html` - public aggregate MCP Registry launch-readiness snapshot
- `mcp-launch-review.html` - fixed-scope paid MCP launch check page
- `mcp-directory-launch.html` - fixed-scope MCP directory listing launch pass
- `mcp-directory-checklist.html` - public MCP directory launch checklist resource
- `mcp-launch-sample.html` - sample MCP launch check report
- `launch-exposure-sample.html` - sample exposure-check deliverable
- `repair-pass.html` - fixed-scope website repair pass sales page
- `example-report.html` - sample repair-pass checklist deliverable
- `maintenance.html` - recurring website care plan page
- `overflow.html` - agency overflow production landing page
- `audit.html` - free website audit lead magnet
- `audit.js` - browser-only audit scoring logic
- `styles.css` - main site styles
- `robots.txt` - crawler policy with sitemap reference
- `sitemap.xml` - public crawl map for the main proof and service pages
- `.github/workflows/refresh-mcp-pulse.yml` - daily public MCP Registry Pulse refresh
- `demos/` - sample landing pages for local business outreach
- `assets/` - generated screenshots used by the portfolio
- `outreach/` - local-only lead criteria, trackers, and message templates ignored from the public repo
- `scripts/audit-leads.mjs` - local lead audit script
- `scripts/find-mcp-prospects.mjs` - MCP Registry prospect scanner for the paid MCP launch-review offer
- `scripts/render-mcp-registry-pulse.mjs` - public MCP Registry pulse page generator
- `scripts/render-mcp-prospect-dashboard.mjs` - local dashboard renderer for MCP prospect review and compose links
- `scripts/render-mcp-prospect-reports.mjs` - local private mini-report renderer for MCP prospects

## Lead Audit Script

```bash
npm run audit:leads
```

The script reads `outreach/lead-tracker.csv` and writes:

- `outreach/generated/site-audits.md`
- `outreach/generated/site-audits.csv`

## MCP Prospect Scanner

To regenerate the public MCP Registry Pulse page:

```bash
npm run pulse:mcp
```

The script reads the live official MCP Registry API plus linked public GitHub metadata and writes:

- `mcp-registry-pulse.html`

The page intentionally reports aggregate launch-readiness signals, not named third-party findings.

```bash
npm run prospect:mcp
```

The script reads the live official MCP Registry API, checks linked GitHub repositories when available, and writes:

- `outreach/generated/mcp-prospects-YYYY-MM-DD.md`
- `outreach/generated/mcp-prospects-YYYY-MM-DD.csv`
- `outreach/generated/mcp-prospects-YYYY-MM-DD.json`
- `outreach/generated/mcp-prospect-messages/`

Review each lead manually before contacting anyone.

To render private mini-reports for the current MCP prospect batch:

```bash
npm run reports:mcp
```

Reports are written under `outreach/generated/mcp-prospect-reports/` and are ignored by git.

To render a local prospect dashboard with report, draft, and compose links:

```bash
npm run dashboard:mcp
```

The dashboard is written to `outreach/generated/mcp-prospect-dashboard-YYYY-MM-DD.html` and is ignored by git.

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
