import { writeFile } from 'node:fs/promises'

const CATALOG_URL = 'https://pay.sh/api/catalog'
const OUTPUT_HTML = 'pay-sh-catalog-pulse.html'
const OUTPUT_JSON = 'pay-sh-catalog-pulse.json'
const RUN_DATE = new Date().toISOString().slice(0, 10)

const headers = {
  accept: 'application/json',
  'user-agent': 'TatePrograms-PayShCatalogPulse/1.0',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function money(value) {
  if (!Number.isFinite(value)) return '$0'
  if (value === 0) return '$0'
  if (value >= 100) return `$${Math.round(value).toLocaleString()}`
  return `$${value.toFixed(value < 0.01 ? 4 : 2).replace(/0+$/, '').replace(/\.$/, '')}`
}

function riskReasons(provider) {
  const text = `${provider.title} ${provider.description} ${provider.use_case} ${provider.category}`.toLowerCase()
  const reasons = []

  if (provider.max_price_usd >= 100) reasons.push('large per-call ceiling')
  else if (provider.max_price_usd >= 10) reasons.push('meaningful per-call spend')
  if (provider.endpoint_count >= 50) reasons.push('wide endpoint surface')
  if (/email|inbox|outbound|message|sms/.test(text)) reasons.push('message-sending workflow')
  if (/phone|voice|call|webrtc|speech/.test(text)) reasons.push('voice or calling workflow')
  if (/domain|dns|registrar|subdomain/.test(text)) reasons.push('domain or DNS workflow')
  if (/crypto|wallet|token|defi|transaction|on-chain|blockchain/.test(text)) reasons.push('financial data or wallet context')
  if (/social|profile|enrichment|email address|contact|people|company|lead/.test(text)) reasons.push('personal or business-contact data')
  if (/webhook|browser|scrape|crawl|firecrawl|search|maps/.test(text)) reasons.push('untrusted web-data input')
  if (!provider.has_free_tier && provider.has_metering) reasons.push('metered without free tier')

  return reasons
}

function priorityScore(provider, reasons) {
  let score = 0
  if (provider.max_price_usd >= 100) score += 26
  else if (provider.max_price_usd >= 10) score += 18
  else if (provider.max_price_usd > 0) score += 8
  if (provider.endpoint_count >= 75) score += 18
  else if (provider.endpoint_count >= 25) score += 12
  else if (provider.endpoint_count >= 10) score += 6
  score += Math.min(36, reasons.length * 6)
  if (provider.has_metering) score += 6
  return Math.min(100, score)
}

function priorityLevel(score) {
  if (score >= 58) return 'high'
  if (score >= 34) return 'medium'
  return 'watch'
}

async function fetchCatalog() {
  const response = await fetch(CATALOG_URL, { headers })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${CATALOG_URL}`)
  }
  return response.json()
}

function summarize(catalog) {
  const providers = (catalog.providers ?? []).map(provider => {
    const reasons = riskReasons(provider)
    const score = priorityScore(provider, reasons)
    return {
      fqn: provider.fqn,
      title: provider.title,
      category: provider.category,
      description: provider.description,
      useCase: provider.use_case,
      serviceUrl: provider.service_url,
      endpointCount: provider.endpoint_count ?? 0,
      hasMetering: Boolean(provider.has_metering),
      hasFreeTier: Boolean(provider.has_free_tier),
      minPriceUsd: provider.min_price_usd ?? 0,
      maxPriceUsd: provider.max_price_usd ?? 0,
      sha: provider.sha,
      priorityScore: score,
      priorityLevel: priorityLevel(score),
      reasons,
    }
  })

  const categoryCounts = providers.reduce((acc, provider) => {
    acc[provider.category] = (acc[provider.category] ?? 0) + 1
    return acc
  }, {})

  const priced = providers.filter(provider => provider.maxPriceUsd > 0)
  const metered = providers.filter(provider => provider.hasMetering)
  const freeTier = providers.filter(provider => provider.hasFreeTier)
  const reviewPriority = providers
    .filter(provider => provider.priorityScore >= 34)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.endpointCount - a.endpointCount)

  return {
    runDate: RUN_DATE,
    generatedAt: catalog.generated_at,
    source: CATALOG_URL,
    providerCount: catalog.provider_count ?? providers.length,
    observedProviders: providers.length,
    pricedCount: priced.length,
    meteredCount: metered.length,
    freeTierCount: freeTier.length,
    categoryCounts,
    topCategories: Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, count]) => ({ category, count })),
    reviewPriority: reviewPriority.slice(0, 16),
    highestPrice: [...providers].sort((a, b) => b.maxPriceUsd - a.maxPriceUsd).slice(0, 8),
    widestSurface: [...providers].sort((a, b) => b.endpointCount - a.endpointCount).slice(0, 8),
  }
}

function renderProviderCard(provider) {
  const price = provider.minPriceUsd === provider.maxPriceUsd
    ? money(provider.maxPriceUsd)
    : `${money(provider.minPriceUsd)}-${money(provider.maxPriceUsd)}`
  const reasons = provider.reasons.length
    ? provider.reasons.slice(0, 4).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')
    : '<li>standard provider checks</li>'

  return `<article>
            <p class="card-command">${escapeHtml(provider.priorityLevel)} / ${provider.priorityScore}</p>
            <h3>${escapeHtml(provider.title)}</h3>
            <p>${escapeHtml(provider.description)}</p>
            <dl class="mini-ledger">
              <div><dt>category</dt><dd>${escapeHtml(provider.category)}</dd></div>
              <div><dt>endpoints</dt><dd>${provider.endpointCount}</dd></div>
              <div><dt>price</dt><dd>${price}</dd></div>
              <div><dt>free tier</dt><dd>${provider.hasFreeTier ? 'yes' : 'no'}</dd></div>
            </dl>
            <ul class="compact-list">${reasons}</ul>
            <a href="${escapeHtml(provider.serviceUrl)}" target="_blank" rel="noreferrer">provider endpoint</a>
          </article>`
}

function renderHtml(summary) {
  const topCategoryRows = summary.topCategories.map(row => `<tr><td>${escapeHtml(row.category)}</td><td>${row.count}</td></tr>`).join('')
  const priorityCards = summary.reviewPriority.slice(0, 8).map(renderProviderCard).join('\n')
  const highestPriceCards = summary.highestPrice.slice(0, 4).map(renderProviderCard).join('\n')
  const widestCards = summary.widestSurface.slice(0, 4).map(renderProviderCard).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pay.sh Catalog Pulse | Agent-Payment API Risk Map | Tate Programs</title>
    <meta name="description" content="A current Pay.sh catalog pulse for agent-paid APIs: provider counts, pricing surfaces, high-priority review targets, and the launch controls teams should prove before agents spend.">
    <link rel="canonical" href="https://tateprograms.com/pay-sh-catalog-pulse.html">
    <meta property="og:type" content="article">
    <meta property="og:title" content="Pay.sh Catalog Pulse">
    <meta property="og:description" content="Live Pay.sh catalog snapshot for agent-paid API launch controls, pricing surfaces, and review priorities.">
    <meta property="og:url" content="https://tateprograms.com/pay-sh-catalog-pulse.html">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Pay.sh Catalog Pulse">
    <meta name="twitter:description" content="A current snapshot of agent-paid API surfaces and launch controls.">
    <link rel="stylesheet" href="styles.css">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "Pay.sh Catalog Pulse",
        "url": "https://tateprograms.com/pay-sh-catalog-pulse.html",
        "dateModified": "${summary.runDate}",
        "isBasedOn": "${summary.source}",
        "description": "Aggregated Pay.sh catalog snapshot for agent-paid API launch-readiness review.",
        "publisher": {
          "@type": "Organization",
          "name": "Tate Programs",
          "url": "https://tateprograms.com"
        }
      }
    </script>
  </head>
  <body class="console-home terminal-os shell-page">
    <header class="os-topbar">
      <a class="os-brand" href="index.html" aria-label="Tate Programs home">
        <span class="os-mark">tp</span>
        <span>tate@programs</span>
      </a>
      <nav class="os-tabs" aria-label="Primary navigation">
        <a href="index.html#workbench">workbench</a>
        <a href="agent-stack-radar.html">radar</a>
        <a href="x402-launch-checklist.html">x402</a>
        <a href="agent-commerce-gate.html">commerce-gate</a>
        <a href="pay-sh-catalog-pulse.html">pay-pulse</a>
        <a href="agent-security-drill.html">security-drill</a>
        <a href="mcp-registry-pulse.html">mcp-pulse</a>
        <a href="payments.html">pay</a>
      </nav>
      <a class="os-status" href="mailto:hello@tateprograms.com?subject=Agent%20Commerce%20Readiness%20Review">
        <span></span>
        agent payment checks
      </a>
    </header>

    <main>
      <div class="shell-pathline">
        <span>tate@programs</span>
        <strong>~/notes/pay-sh-catalog-pulse</strong>
        <em>${escapeHtml(summary.generatedAt)}</em>
      </div>

      <section class="console-hero console-page-hero">
        <div class="console-copy">
          <p class="console-kicker">pay.sh catalog pulse / ${summary.runDate}</p>
          <h1>Agent-paid APIs need launch controls before agents start spending.</h1>
          <p class="console-subtitle">
            Pay.sh exposes a live catalog of APIs that agents can discover, price, and call. This pulse turns that machine-readable catalog into a launch-readiness map: where spend, contact data, messaging, DNS, finance, and wide endpoint surfaces need price previews, caps, receipts, metadata filtering, and provider validation.
          </p>
          <div class="console-actions">
            <a class="console-button primary" href="agent-commerce-gate.html">run commerce gate</a>
            <a class="console-button secondary" href="x402-launch-checklist.html">x402 checklist</a>
            <a class="console-button secondary" href="agent-commerce-sample-report.html">sample report</a>
            <a class="console-button ghost" href="pay-sh-catalog-pulse.json">data json</a>
            <a class="console-button ghost" href="${summary.source}" target="_blank" rel="noreferrer">source catalog</a>
          </div>
          <dl class="console-ledger">
            <div>
              <dt>providers</dt>
              <dd>${summary.providerCount}</dd>
            </div>
            <div>
              <dt>metered</dt>
              <dd>${summary.meteredCount}</dd>
            </div>
            <div>
              <dt>free tier</dt>
              <dd>${summary.freeTierCount}</dd>
            </div>
          </dl>
        </div>

        <aside class="terminal-window" aria-label="Pay.sh catalog terminal preview">
          <div class="terminal-topline">catalog pulse</div>
          <pre><code>$ fetch https://pay.sh/api/catalog
providers: ${summary.providerCount}
priced: ${summary.pricedCount}
metered: ${summary.meteredCount}
priority: ${summary.reviewPriority.length}
checks: caps, receipts, metadata
output: pay-sh-catalog-pulse.json</code></pre>
        </aside>
      </section>

      <section class="console-section">
        <div class="console-section-head split">
          <div>
            <p class="console-kicker">review priority</p>
            <h2>Provider surfaces to inspect before public agent demos.</h2>
          </div>
          <a class="console-link" href="agent-commerce-gate.html">open gate</a>
        </div>
        <div class="proof-terminal-grid">
          ${priorityCards}
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">catalog shape</p>
          <h2>Where the catalog clusters.</h2>
        </div>
        <div class="console-table-wrap">
          <table>
            <thead>
              <tr>
                <th>category</th>
                <th>providers</th>
              </tr>
            </thead>
            <tbody>
              ${topCategoryRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">spend ceiling</p>
          <h2>Highest per-call price surfaces.</h2>
        </div>
        <div class="proof-terminal-grid">
          ${highestPriceCards}
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">endpoint width</p>
          <h2>Widest endpoint surfaces.</h2>
        </div>
        <div class="proof-terminal-grid">
          ${widestCards}
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">control list</p>
          <h2>What every agent-payment demo should prove.</h2>
        </div>
        <div class="proof-terminal-grid">
          <article>
            <p class="card-command">price</p>
            <h3>Quote before action</h3>
            <p>The agent should see provider, endpoint, quoted price, network, max total, and failure state before the paid call is allowed.</p>
          </article>
          <article>
            <p class="card-command">cap</p>
            <h3>Enforce outside the prompt</h3>
            <p>Spend caps should live in wallet, server, policy middleware, or facilitator configuration, not only in natural-language instructions.</p>
          </article>
          <article>
            <p class="card-command">metadata</p>
            <h3>Filter payment metadata</h3>
            <p>Prompts, private user IDs, contact data, ticket text, and retrieval context should not leak into receipts or provider-visible metadata.</p>
          </article>
          <article>
            <p class="card-command">audit</p>
            <h3>Preserve receipts and denials</h3>
            <p>Keep payment request, decision, receipt, retry, refund, deny reason, and human approval evidence in a reviewable log.</p>
          </article>
        </div>
      </section>
    </main>

    <footer class="console-footer">
      <a href="index.html">Tate Programs</a>
      <a href="agent-commerce-gate.html">Commerce Gate</a>
      <a href="x402-launch-checklist.html">x402 Checklist</a>
      <a href="payments.html">Payments</a>
    </footer>
    <script src="terminal-console.js" type="module"></script>
  </body>
</html>
`
}

const catalog = await fetchCatalog()
const summary = summarize(catalog)
await writeFile(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`)
await writeFile(OUTPUT_HTML, renderHtml(summary))
console.log(`Wrote ${OUTPUT_HTML} and ${OUTPUT_JSON}`)
