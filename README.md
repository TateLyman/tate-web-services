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
- `case-studies.html` - public proof-of-work page for x402 launch checks, Shipcheck, MCP, LaunchQuest, and related assets
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
- `agent-payment-launch-review.html` - paid private-review intake and scope builder for x402, MPP, Pay.sh, Cloudflare Worker, and AgentCore Payments launches
- `agent-payment-launch-review.js` - local scope, score, deliverable, and email-body generation logic for the agent payment launch review
- `x402-surface-check.html` - browser checker and CLI landing page for x402 manifests, OpenAPI specs, Streamable HTTP MCP `tools/list` catalogs, linked `discovery_url` catalogs, string and nested `discovery` links, `routes[]` catalogs, `resources[]` catalogs, endpoint-bearing `tools` maps, string-valued endpoint maps, raw resource URL strings, item catalogs, direct paid endpoints, pasted no-payment 402 challenges, `schemes[]` challenge arrays, declared-price drift, cache-control posture, accept-leg resource binding, timeout/expiry metadata, optional strict-cache findings, optional strict-proof payment-identifier and signed offer/receipt checks, credential-like public registry URL params with redacted output, contextual guide links, browser origin/payment-header preflight blockers, MPP payment headers, x402 V2 requirements headers, MCP tool-name array handling, health/status routes, and legacy decimal x402 v1 challenges
- `x402-fix-sprint.html` - paid private re-check and small authorized implementation sprint for one x402 launch blocker
- `services.json` - machine-readable paid service catalog for agent marketplaces and crawlers
- `https://the402.tateprograms.com/api/triage` - deployed public no-payment x402 triage endpoint for agent marketplace listing
- `https://the402.tateprograms.com/api/x402/triage` - live $0.01 x402 paid triage endpoint on Solana mainnet USDC
- `https://the402.tateprograms.com/api/x402/index-watch` - live $0.01 x402 paid 402 Index health-watch endpoint for provider/domain/service queries
- `x402-surface-check.js` - browser scoring logic for x402 public-surface shape, resources, networks, placeholder payees, staging rails, and metadata boundaries
- `x402-attack-map-2026.html` - May 2026 field note mapping x402 and MPP attack classes to launch controls for finality, settlement binding, replay, cache hygiene, discovery steering, AgentCore payment policy, and measured failure evidence
- `cloudflare-x402-worker.html` - Cloudflare Worker launch guide for x402 and MPP-style payment gates with browser-readable 402, `X-PAYMENT` preflight, no-store/private cache policy, Vary headers, and no grant before verification
- `pay-sh-catalog-pulse.html` - live Pay.sh catalog pulse for agent-paid API provider counts, price surfaces, and launch-control review priorities
- `pay-sh-catalog-pulse.json` - machine-readable data backing the Pay.sh Catalog Pulse page
- `pay-skills-launch-queue.html` - live pay-skills registry PR watchlist for x402, MPP, Solana, Base, compute, commerce, wallet, and data-api launch surfaces
- `pay-skills-launch-queue.json` - machine-readable data backing the Pay-Skills Launch Queue page
- `x402-ecosystem-radar.html` - live Coinbase x402 PR radar for partner listings, MCP payment endpoints, mainnet rails, discovery metadata, and launch-control review priorities
- `x402-ecosystem-radar.json` - machine-readable data backing the x402 Ecosystem Radar page
- `x402-metadata-filter.html` - browser-only metadata filter for x402/Pay.sh payment requests, receipts, resource URLs, prompts, PII, and secret-like fields
- `x402-metadata-filter.js` - local scoring, redaction, safe-envelope generation, copy, and report export logic for the x402 Metadata Filter
- `agentcore-payment-policy.html` - browser-only AgentCore/x402 payment policy builder for Coinbase/Stripe payment connections, session caps, payee allowlists, approval rules, receipts, and audit evidence
- `agentcore-payment-policy.js` - local policy scoring and JSON export logic for AgentCore, x402, MPP, and Pay.sh payment demos
- `mcp-registry-audit.html` - browser-only MCP registry/server.json audit tool
- `mcp-registry-audit.js` - public metadata checks for server.json and GitHub repo launch proof
- `mcp-registry-pulse.html` - public aggregate MCP Registry launch-readiness snapshot
- `mcp-registry-pulse.json` - aggregate data backing the MCP Registry Pulse page
- `agent-stack-radar.html` - May 2026 agent-native software trend radar and service thesis
- `launch-proof-promo-flow.html` - reusable ElevenCreative Flow blueprint for proof-led launch clips, scripts, scene prompts, captions, and a fact gate
- `mcp-launch-trust-2026.html` - May 2026 MCP product-launch trust ledger for scoped credentials, audit trails, tenant boundaries, STDIO command safety, registry metadata, and buyer-facing proof
- `x402-launch-checklist.html` - agent-payment launch checklist for x402 and Pay.sh demos
- `x402-batch-settlement-checklist.html` - batch-settled x402 launch checklist for escrow, vouchers, channel storage, deposit caps, claim cadence, refunds, and reconciliation evidence
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
- `services.json` - fixed-scope service catalog with inputs, deliverables, prices, proof, and payment links
- `https://the402.tateprograms.com/.well-known/agent-card.json` - AgentCard for the public x402 triage endpoint
- `.github/workflows/refresh-mcp-pulse.yml` - daily public MCP Registry Pulse refresh
- `.github/workflows/refresh-pay-sh-pulse.yml` - daily public Pay.sh Catalog Pulse refresh
- `.github/workflows/refresh-pay-skills-queue.yml` - daily public pay-skills registry queue refresh
- `demos/` - sample landing pages for local business outreach
- `assets/` - generated screenshots used by the portfolio
- `outreach/` - local-only lead criteria, trackers, and message templates ignored from the public repo
- `scripts/audit-leads.mjs` - local lead audit script
- `scripts/check-x402-public-surface.mjs` - local no-payment x402 surface checker for manifest, challenge, and CORS review passes
- `scripts/find-mcp-prospects.mjs` - MCP Registry prospect scanner for the paid MCP launch-review offer
- `scripts/find-pay-sh-prospects.mjs` - Pay.sh catalog prospect scanner for the agent-commerce readiness offer
- `scripts/render-mcp-registry-pulse.mjs` - public MCP Registry pulse page generator
- `scripts/render-pay-sh-catalog-pulse.mjs` - public Pay.sh catalog pulse page generator
- `scripts/render-pay-skills-launch-queue.mjs` - public pay-skills launch queue generator and local lead queue writer
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

To regenerate the public Pay-Skills Launch Queue page:

```bash
npm run pulse:pay-skills
```

The script reads the public `solana-foundation/pay-skills` pull-request queue and writes:

- `pay-skills-launch-queue.html`
- `pay-skills-launch-queue.json`
- `outreach/generated/pay-skills-launch-queue-YYYY-MM-DD.md`

The page reports current agent-payment launch surfaces from registry submissions; the local outreach file is only a research queue.

To regenerate the public x402 Ecosystem Radar page:

```bash
npm run pulse:x402-ecosystem
```

The script reads public `coinbase/x402` pull requests and writes:

- `x402-ecosystem-radar.html`
- `x402-ecosystem-radar.json`

The page reports current Coinbase x402 partner listings, MCP/payment endpoint claims, discovery metadata, rail signals, and review-priority launch controls.

The AgentCore Payment Policy Builder is a static browser tool; edit `agentcore-payment-policy.html` and `agentcore-payment-policy.js` directly when updating the control model.

The Agent Payment Launch Review scope builder is a static browser tool; edit `agent-payment-launch-review.html` and `agent-payment-launch-review.js` directly when updating the paid-review intake model.

To run a no-payment x402 public-surface pass against a manifest, OpenAPI spec, or direct paid endpoint:

```bash
npx --yes x402-surface-check https://api.example.com/.well-known/x402.json
npx --yes x402-surface-check https://api.example.com/openapi.json report.md
npx --yes x402-surface-check --endpoint --method POST https://x402.rpc.ankr.com/eth
npm run check:x402 -- https://api.example.com/.well-known/x402 output.md
X402_CHECK_ORIGIN=https://example.com npm run check:x402 -- https://api.example.com/.well-known/x402 output.md
```

Related implementation starter:

- `https://github.com/TateLyman/x402-cache-safe-worker` - Cloudflare Worker starter for cache-safe x402-style payment gates with CORS, `no-store, private`, resource echo, and smoke tests.

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
- $149+ agent payment launch review
- $149 agent commerce readiness review
- $149 launch proof media pass
- $299+ production fix sprint
- $99+ MCP launch review

The website offers stay available as secondary products:

- $150 website repair pass
- $350 one-page business site
- $49+ monthly website care

The demo pages are sample concepts, not claimed client work.
