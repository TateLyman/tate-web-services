import { readFile, writeFile } from 'node:fs/promises'

const RUN_DATE = new Date().toISOString().slice(0, 10)
const SOURCE_JSON = 'agent-commerce-webdata-radar.json'
const OUTPUT_JSON = 'webdata-unlocked-revenue-agent.json'
const OUTPUT_HTML = 'webdata-unlocked-revenue-agent.html'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function classifyAction(row) {
  const text = `${row.title} ${row.summary} ${(row.reasons ?? []).join(' ')}`.toLowerCase()
  if (/cors|browser|payment-signature|headers|preflight/.test(text)) return 'browser-payment loop'
  if (/manifest|well-known|discovery|openapi|registry|listing/.test(text)) return 'discovery proof'
  if (/receipt|settlement|reconciliation|ledger|invoice/.test(text)) return 'settlement evidence'
  if (/metadata|leak|secret|privacy|token/.test(text)) return 'metadata boundary'
  return 'outside proof packet'
}

function formatMoney(value) {
  const amount = Number(value ?? 0)
  if (!amount) return 'not priced'
  return `$${amount.toFixed(amount >= 1 ? 2 : 3)}`
}

function buildSignal(row, index) {
  return {
    rank: index + 1,
    title: row.title,
    source: row.sourceName,
    url: row.url,
    category: row.category,
    action: classifyAction(row),
    revenueScore: row.revenueScore,
    price: formatMoney(row.maxPriceUsd),
    rails: row.networks ?? [],
    reasons: row.reasons ?? [],
    updatedAt: row.updatedAt,
  }
}

function summarize(radar) {
  const signals = (radar.highIntent ?? []).slice(0, 24).map(buildSignal)
  const actionCounts = signals.reduce((acc, signal) => {
    acc[signal.action] = (acc[signal.action] ?? 0) + 1
    return acc
  }, {})
  const buyerSegments = [
    {
      name: 'paid API teams',
      fit: signals.filter((signal) => /priced|payment|proof|discovery/i.test(`${signal.action} ${signal.reasons.join(' ')}`)).length,
    },
    {
      name: 'agent-commerce directories',
      fit: signals.filter((signal) => /registry|listing|discovery|queue/i.test(signal.reasons.join(' '))).length,
    },
    {
      name: 'payment infrastructure teams',
      fit: signals.filter((signal) => /settlement|receipt|browser|cors|rail/i.test(`${signal.action} ${signal.reasons.join(' ')}`)).length,
    },
  ].sort((a, b) => b.fit - a.fit)

  return {
    runDate: RUN_DATE,
    product: 'WebData Unlocked Revenue Agent',
    source: SOURCE_JSON,
    brightDataReady: {
      status: 'adapter-ready',
      needed: ['Bright Data API token or MCP credentials', 'SERP/Web Unlocker credits from the hackathon account'],
      use: 'replace GitHub-only queue reads with live public web fetches, SERP discovery, and rendered-page extraction during hackathon demo',
    },
    counts: {
      observedSignals: radar.observedCount,
      highIntent: radar.highIntentCount,
      mainnetRails: radar.mainnetCount,
      pricedCalls: radar.pricedCount,
      selectedSignals: signals.length,
    },
    buyerSegments,
    actionCounts,
    signals,
  }
}

function renderSignal(signal) {
  return `
          <article>
            <p class="card-command">rank ${signal.rank} / ${escapeHtml(signal.source)} / score ${signal.revenueScore}</p>
            <h3>${escapeHtml(signal.title)}</h3>
            <dl class="mini-ledger">
              <div><dt>action</dt><dd>${escapeHtml(signal.action)}</dd></div>
              <div><dt>price</dt><dd>${escapeHtml(signal.price)}</dd></div>
              <div><dt>rails</dt><dd>${escapeHtml(signal.rails.join(', ') || 'none found')}</dd></div>
              <div><dt>updated</dt><dd>${escapeHtml(signal.updatedAt?.slice(0, 10) ?? '')}</dd></div>
            </dl>
            <div class="chip-row">${signal.reasons.slice(0, 4).map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>
            <a class="console-link" href="${escapeHtml(signal.url)}" target="_blank" rel="noreferrer">inspect signal</a>
          </article>`
}

function renderRows(entries) {
  return Object.entries(entries)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `
              <tr><th>${escapeHtml(label)}</th><td>${count}</td></tr>`)
    .join('')
}

function renderSegments(segments) {
  return segments
    .map((segment) => `
              <tr><th>${escapeHtml(segment.name)}</th><td>${segment.fit}</td></tr>`)
    .join('')
}

function renderHtml(summary) {
  const signals = summary.signals.slice(0, 9).map(renderSignal).join('')
  const actionRows = renderRows(summary.actionCounts)
  const segmentRows = renderSegments(summary.buyerSegments)
  const payload = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'WebData Unlocked Revenue Agent',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://tateprograms.com/webdata-unlocked-revenue-agent.html',
    dateModified: summary.runDate,
    creator: {
      '@type': 'Organization',
      name: 'Tate Programs',
      url: 'https://tateprograms.com',
    },
    description:
      'Live web-data workbench that turns public agent-commerce launch signals into revenue-prioritized proof-packet opportunities.',
  })

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>WebData Unlocked Revenue Agent | Tate Programs</title>
    <meta name="description" content="A live web-data revenue workbench that turns public agent-commerce launch signals into ranked proof-packet opportunities.">
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
    <link rel="canonical" href="https://tateprograms.com/webdata-unlocked-revenue-agent.html">
    <meta property="og:type" content="article">
    <meta property="og:title" content="WebData Unlocked Revenue Agent">
    <meta property="og:description" content="Public web data converted into direct revenue actions for paid API and agent-commerce launches.">
    <meta property="og:url" content="https://tateprograms.com/webdata-unlocked-revenue-agent.html">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="WebData Unlocked Revenue Agent">
    <meta name="twitter:description" content="A live web-data revenue workbench for paid API and agent-commerce launches.">
    <link rel="stylesheet" href="styles.css">
    <script type="application/ld+json">${payload}</script>
  </head>
  <body class="console-home terminal-os shell-page">
    <header class="os-topbar">
      <a class="os-brand" href="index.html" aria-label="Tate Programs home">
        <span class="os-mark">tp</span>
        <span>tate@programs</span>
      </a>
      <nav class="os-tabs" aria-label="Primary navigation">
        <a href="index.html#workbench">workbench</a>
        <a href="agent-commerce-webdata-radar.html">web-data</a>
        <a href="webdata-unlocked-revenue-agent.html">unlocked</a>
        <a href="outside-proof-packet.html">proof-packet</a>
        <a href="payments.html">pay</a>
      </nav>
      <a class="os-status" href="mailto:hello@tateprograms.com?subject=WebData%20Unlocked%20Revenue%20Agent">
        <span></span>
        live signal desk
      </a>
    </header>

    <main>
      <div class="shell-pathline">
        <span>tate@programs</span>
        <strong>~/revenue/webdata-unlocked</strong>
        <em>${summary.runDate}</em>
      </div>

      <section class="console-hero console-page-hero">
        <div class="console-copy">
          <p class="console-kicker">web data unlocked / revenue workbench</p>
          <h1>Find the launches that can pay for proof before they know they need it.</h1>
          <p class="console-subtitle">
            Public launch queues, registry pull requests, paid endpoint manifests, and agent-commerce listings expose the same pattern: teams ship value-bearing APIs before buyer trust is ready. This workbench ranks those signals by rail, price, freshness, and proof-packet fit.
          </p>
          <div class="console-actions">
            <a class="console-button primary" href="outside-proof-packet.html">sell proof packet</a>
            <a class="console-button secondary" href="agent-commerce-webdata-radar.html">source radar</a>
            <a class="console-button ghost" href="webdata-unlocked-revenue-agent.json">agent json</a>
          </div>
          <dl class="console-ledger">
            <div><dt>observed</dt><dd>${summary.counts.observedSignals}</dd></div>
            <div><dt>high intent</dt><dd>${summary.counts.highIntent}</dd></div>
            <div><dt>mainnet</dt><dd>${summary.counts.mainnetRails}</dd></div>
            <div><dt>priced</dt><dd>${summary.counts.pricedCalls}</dd></div>
          </dl>
        </div>
        <aside class="terminal-window" aria-label="web data revenue agent terminal">
          <div class="terminal-topline">agent run</div>
          <pre><code>$ load live public web data
$ score launch surfaces
$ group by buyer-ready action
$ emit proof-packet queue

selected: ${summary.counts.selectedSignals}
bright-data: adapter-ready</code></pre>
        </aside>
      </section>

      <section class="console-section">
        <div class="console-section-head split">
          <div>
            <p class="console-kicker">ranked actions</p>
            <h2>The current web-data queue points to concrete revenue moves.</h2>
          </div>
          <a class="console-link" href="agent-commerce-sample-report.html">sample proof artifact</a>
        </div>
        <div class="proof-terminal-grid">${signals}</div>
      </section>

      <section class="console-section two-column-section">
        <article class="terminal-window">
          <div class="terminal-topline">buyer segment fit</div>
          <div class="table-shell compact"><table><tbody>${segmentRows}</tbody></table></div>
        </article>
        <article class="terminal-window">
          <div class="terminal-topline">next action mix</div>
          <div class="table-shell compact"><table><tbody>${actionRows}</tbody></table></div>
        </article>
      </section>

      <section class="terminal-ticket">
        <p class="console-kicker">submission path</p>
        <h2>Bright Data turns this from a queue reader into a live web-data agent.</h2>
        <p>
          The adapter is ready for Bright Data MCP, SERP, Web Unlocker, or Scraping Browser credentials. With credits attached, the same workflow can refresh launch signals from rendered pages, search results, directory listings, and public docs instead of relying on GitHub queues alone.
        </p>
        <div class="console-actions">
          <a class="console-button primary" href="mailto:hello@tateprograms.com?subject=Web%20data%20revenue%20agent%20scope">request a pass</a>
          <a class="console-button secondary" href="webdata-unlocked-revenue-agent.json">inspect output</a>
        </div>
      </section>
    </main>
  </body>
</html>
`
}

async function main() {
  const radar = await readJson(SOURCE_JSON)
  const summary = summarize(radar)
  await Promise.all([
    writeFile(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(OUTPUT_HTML, renderHtml(summary)),
  ])
  console.log(`Wrote ${OUTPUT_HTML} and ${OUTPUT_JSON}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
