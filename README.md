# Tate Lyman Web Services

Static portfolio and service storefront for selling fast website fixes, one-page business sites, and small automations.

## Local preview

Open `index.html` directly in a browser, or run:

```bash
npx serve .
```

## Files

- `index.html` - main sales-facing portfolio page
- `repair-pass.html` - fixed-scope website repair pass sales page
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

The offer is intentionally concrete:

- $150 website repair pass
- $350 one-page business site
- $250+ automation or dashboard

The demo pages are sample concepts, not claimed client work.
