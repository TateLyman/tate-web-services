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
- `student-launch-kit.html` - browser-only launch checker for student and hackathon projects
- `student-launch-kit.js` - local file/folder scoring logic for the student launch checker
- `student-launch-review.html` - paid student project launch polish and repo handoff review page
- `agent-security-drill.html` - browser-only agent security evidence console for prompt injection, exfiltration, policy, tool-scope, A2A, Gemini-safe integration, audit, and human-review readiness
- `agent-security-drill.js` - local file/folder scoring logic plus evidence-pack export for agent security policy and launch-proof signals
- `agent-security-evidence-2026.html` - field note about evidence packs for agent demos, A2A identity, Gemini-safe testing, and audit trails
- `agent-security-sample-report.html` - sample agent security launch report with boundary map, drill results, audit evidence, and patch order
- `agent-commerce-gate.html` - browser-only readiness checker for x402, Pay.sh, and payment-agent prototypes
- `agent-commerce-gate.js` - local file/folder scoring logic for agent-commerce control planes, including price previews, enforceable caps, provider validation, and metadata filtering
- `agent-commerce-sample-report.html` - sample 48-hour readiness report for an x402 payment-agent demo
- `x402-surface-check.html` - browser checker for x402 manifests and pasted no-payment 402 challenges
- `x402-surface-check.js` - browser scoring logic for x402 public-surface shape, resources, networks, and metadata boundaries
- `pay-sh-catalog-pulse.html` - live Pay.sh catalog pulse for agent-paid API provider counts, price surfaces, and launch-control review priorities
- `pay-sh-catalog-pulse.json` - machine-readable data backing the Pay.sh Catalog Pulse page
- `x402-metadata-filter.html` - browser-only metadata filter for x402/Pay.sh payment requests, receipts, resource URLs, prompts, PII, and secret-like fields
- `x402-metadata-filter.js` - local scoring, redaction, safe-envelope generation, copy, and report export logic for the x402 Metadata Filter
- `agentcore-payment-policy.html` - browser-only AgentCore/x402 payment policy builder for session caps, payee allowlists, approval rules, receipts, and audit evidence
- `agentcore-payment-policy.js` - local policy scoring and JSON export logic for AgentCore, x402, MPP, and Pay.sh payment demos
- `mcp-registry-audit.html` - browser-only MCP registry/server.json audit tool
- `mcp-registry-audit.js` - public metadata checks for server.json and GitHub repo launch proof
- `mcp-registry-pulse.html` - public aggregate MCP Registry launch-readiness snapshot
- `mcp-registry-pulse.json` - aggregate data backing the MCP Registry Pulse page
- `agent-stack-radar.html` - May 2026 agent-native software trend radar and service thesis
- `launch-proof-promo-flow.html` - reusable ElevenCreative Flow blueprint for proof-led launch clips, scripts, scene prompts, captions, and a fact gate
- `mcp-launch-trust-2026.html` - May 2026 MCP product-launch trust ledger for scoped credentials, audit trails, tenant boundaries, STDIO command safety, registry metadata, and buyer-facing proof
- `x402-launch-checklist.html` - agent-payment launch checklist for x402 and Pay.sh demos
- `release-readiness-2026.html` - public JS/npm/Action/MCP/payment-agent launch-readiness runbook
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
- `llms.txt` - concise machine-readable map for developer tools, service pages, and proof assets
- `.github/workflows/refresh-mcp-pulse.yml` - daily public MCP Registry Pulse refresh
- `.github/workflows/refresh-pay-sh-pulse.yml` - daily public Pay.sh Catalog Pulse refresh
- `demos/` - sample landing pages for local business outreach
- `assets/` - generated screenshots used by the portfolio
- `outreach/` - local-only lead criteria, trackers, and message templates ignored from the public repo
- `scripts/audit-leads.mjs` - local lead audit script
- `scripts/check-x402-public-surface.mjs` - local no-payment x402 surface checker for manifest, challenge, and CORS review passes
- `scripts/find-mcp-prospects.mjs` - MCP Registry prospect scanner for the paid MCP launch-review offer
- `scripts/find-pay-sh-prospects.mjs` - Pay.sh catalog prospect scanner for the agent-commerce readiness offer
- `scripts/render-mcp-registry-pulse.mjs` - public MCP Registry pulse page generator
- `scripts/render-pay-sh-catalog-pulse.mjs` - public Pay.sh catalog pulse page generator
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
- `mcp-registry-pulse.json`

The page intentionally reports aggregate launch-readiness signals, not named third-party findings.

To regenerate the public Pay.sh Catalog Pulse page:

```bash
npm run pulse:pay
```

The script reads the live Pay.sh API catalog and writes:

- `pay-sh-catalog-pulse.html`
- `pay-sh-catalog-pulse.json`

The page reports provider-level agent-payment surfaces where launch controls matter: quoted prices, caps, receipts, metadata filtering, provider validation, and audit evidence.

The AgentCore Payment Policy Builder is a static browser tool; edit `agentcore-payment-policy.html` and `agentcore-payment-policy.js` directly when updating the control model.

To run a no-payment x402 public-surface pass against a manifest:

```bash
npm run check:x402 -- https://api.example.com/.well-known/x402 output.md
X402_CHECK_ORIGIN=https://example.com npm run check:x402 -- https://api.example.com/.well-known/x402 output.md
```

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

## Pay.sh Prospect Scanner

To regenerate the private Pay.sh prospect queue:

```bash
npm run prospect:pay
```

The script reads the live Pay.sh catalog, filters already-contacted agent-commerce targets from local sent logs, and writes:

- `outreach/generated/pay-sh-prospects-YYYY-MM-DD.md`
- `outreach/generated/pay-sh-prospects-YYYY-MM-DD.csv`
- `outreach/generated/pay-sh-prospects-YYYY-MM-DD.json`
- `outreach/generated/pay-sh-email-priority-YYYY-MM-DD.md`
- `outreach/generated/pay-sh-prospect-messages/`

Review every target and public contact manually before sending anything.

## Positioning

The front-door offer is intentionally concrete:

- $99 launch risk pass
- $29+ student launch review
- $149 agent security launch review
- $149 agent commerce readiness review
- $149 launch proof media pass
- $299+ production fix sprint
- $99+ MCP launch review

The website offers stay available as secondary products:

- $150 website repair pass
- $350 one-page business site
- $49+ monthly website care

The demo pages are sample concepts, not claimed client work.
