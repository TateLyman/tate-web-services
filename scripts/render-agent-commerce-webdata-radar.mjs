import { readFile, writeFile } from 'node:fs/promises'

const RUN_DATE = new Date().toISOString().slice(0, 10)
const OUTPUT_HTML = 'agent-commerce-webdata-radar.html'
const OUTPUT_JSON = 'agent-commerce-webdata-radar.json'

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

function normalizeRows(sourceName, payload) {
  return (payload.rows ?? []).map((row) => ({
    sourceName,
    number: row.number,
    title: row.title,
    url: row.url,
    category: row.category,
    priority: row.priority,
    priorityScore: Number(row.priorityScore ?? 0),
    updatedAt: row.updatedAt,
    ageHours: row.ageHours,
    networks: row.networks ?? [],
    reasons: row.reasons ?? [],
    maxPriceUsd: Number(row.maxPriceUsd ?? 0),
    summary: row.summary,
    urls: row.urls ?? [],
  }))
}

function scoreRevenue(row) {
  let score = row.priorityScore
  if (row.networks.includes('mainnet')) score += 12
  if (row.reasons.some((reason) => /settlement|checkout|trust|risk|browser/i.test(reason))) score += 12
  if (row.maxPriceUsd > 0) score += 10
  if (row.urls.length > 0) score += 6
  if (row.ageHours !== null && row.ageHours <= 72) score += 10
  return Math.min(100, score)
}

function summarize(x402, paySkills) {
  const rows = [
    ...normalizeRows('coinbase/x402', x402),
    ...normalizeRows('solana-foundation/pay-skills', paySkills),
  ].map((row) => ({
    ...row,
    revenueScore: scoreRevenue(row),
  }))

  const highIntent = rows
    .filter((row) => row.revenueScore >= 62)
    .sort((a, b) => b.revenueScore - a.revenueScore || new Date(b.updatedAt) - new Date(a.updatedAt))

  const categories = rows.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + 1
    return acc
  }, {})

  const rails = rows.reduce((acc, row) => {
    for (const network of row.networks) acc[network] = (acc[network] ?? 0) + 1
    return acc
  }, {})

  return {
    runDate: RUN_DATE,
    sources: [
      {
        name: 'coinbase/x402',
        url: x402.source,
        observedCount: x402.observedCount,
        priorityCount: x402.priorityCount,
      },
      {
        name: 'solana-foundation/pay-skills',
        url: paySkills.source,
        observedCount: paySkills.observedCount,
        priorityCount: paySkills.priorityCount,
      },
    ],
    observedCount: rows.length,
    highIntentCount: highIntent.length,
    mainnetCount: rows.filter((row) => row.networks.includes('mainnet')).length,
    pricedCount: rows.filter((row) => row.maxPriceUsd > 0).length,
    highIntent: highIntent.slice(0, 16),
    rows,
    topCategories: Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 10),
    topRails: Object.entries(rails).sort((a, b) => b[1] - a[1]).slice(0, 10),
  }
}

function money(value) {
  return value > 0 ? `$${value.toFixed(value >= 1 ? 2 : 3)}` : 'n/a'
}

function chips(values) {
  if (!values?.length) return '<span class="muted">none found</span>'
  return values.slice(0, 5).map((value) => `<span>${escapeHtml(value)}</span>`).join('')
}

function renderCard(row) {
  return `
          <article>
            <p class="card-command">${escapeHtml(row.sourceName)} / ${row.revenueScore}</p>
            <h3>${escapeHtml(row.title)}</h3>
            <p>${escapeHtml(row.summary)}</p>
            <dl class="mini-ledger">
              <div><dt>category</dt><dd>${escapeHtml(row.category)}</dd></div>
              <div><dt>rails</dt><dd>${escapeHtml(row.networks.join(', ') || 'none found')}</dd></div>
              <div><dt>price</dt><dd>${money(row.maxPriceUsd)}</dd></div>
              <div><dt>updated</dt><dd>${escapeHtml(row.updatedAt?.slice(0, 10) ?? '')}</dd></div>
            </dl>
            <div class="chip-row">${chips(row.reasons)}</div>
            <a class="console-link" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">open source signal</a>
          </article>`
}

function renderTableRow(row) {
  return `
              <tr>
                <td><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">#${row.number}</a></td>
                <td>${escapeHtml(row.title)}</td>
                <td>${escapeHtml(row.sourceName)}</td>
                <td>${escapeHtml(row.category)}</td>
                <td>${escapeHtml(row.networks.join(', ') || 'none')}</td>
                <td>${row.revenueScore}</td>
              </tr>`
}

function renderCountRows(entries) {
  return entries
    .map(([label, count]) => `
              <tr><th>${escapeHtml(label)}</th><td>${count}</td></tr>`)
    .join('')
}

function renderHtml(summary) {
  const cards = summary.highIntent.slice(0, 6).map(renderCard).join('')
  const tableRows = summary.highIntent.slice(0, 14).map(renderTableRow).join('')
  const categoryRows = renderCountRows(summary.topCategories)
  const railRows = renderCountRows(summary.topRails)

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Agent Commerce Web-Data Radar | Tate Programs</title>
    <meta name="description" content="A current web-data radar for agent-commerce, x402, pay-skills, MCP, Base, Solana, and paid API launches that need readiness evidence.">
    <link rel="canonical" href="https://tateprograms.com/agent-commerce-webdata-radar.html">
    <meta property="og:type" content="article">
    <meta property="og:title" content="Agent Commerce Web-Data Radar">
    <meta property="og:description" content="Public launch signals turned into a practical revenue and readiness map for agent-commerce teams.">
    <meta property="og:url" content="https://tateprograms.com/agent-commerce-webdata-radar.html">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Agent Commerce Web-Data Radar">
    <meta name="twitter:description" content="A current market map for paid-agent APIs, x402, pay-skills, and launch-readiness work.">
    <link rel="stylesheet" href="styles.css">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "Agent Commerce Web-Data Radar",
        "url": "https://tateprograms.com/agent-commerce-webdata-radar.html",
        "dateModified": "${summary.runDate}",
        "isBasedOn": ${JSON.stringify(summary.sources.map((source) => source.url))},
        "description": "Aggregated public web data from x402 and pay-skills launch queues, normalized into readiness and revenue-priority signals.",
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
        <a href="x402-ecosystem-radar.html">x402</a>
        <a href="pay-skills-launch-queue.html">pay-skills</a>
        <a href="agent-commerce-webdata-radar.html">web-data</a>
        <a href="outside-proof-packet.html">proof-packet</a>
        <a href="payments.html">pay</a>
      </nav>
      <a class="os-status" href="mailto:hello@tateprograms.com?subject=Agent%20commerce%20web-data%20radar">
        <span></span>
        web-data radar
      </a>
    </header>

    <main>
      <div class="shell-pathline">
        <span>tate@programs</span>
        <strong>~/radar/agent-commerce-webdata</strong>
        <em>${summary.runDate}</em>
      </div>

      <section class="console-hero console-page-hero">
        <div class="console-copy">
          <p class="console-kicker">web-data radar / ${summary.runDate}</p>
          <h1>Agent-commerce demand is visible before the buyers show up.</h1>
          <p class="console-subtitle">
            Fresh registry pull requests, paid endpoint listings, and public launch queues reveal who is shipping value-bearing APIs right now. This radar turns that public web data into a short list of teams that need external readiness evidence: discoverability, browser payment loops, price drift, metadata boundaries, caps, receipts, and failure handling.
          </p>
          <div class="console-actions">
            <a class="console-button primary" href="outside-proof-packet.html">outside proof packet</a>
            <a class="console-button secondary" href="x402-surface-check.html">surface check</a>
            <a class="console-button secondary" href="agent-readiness-monitor.html">monthly monitor</a>
            <a class="console-button ghost" href="agent-commerce-webdata-radar.json">data json</a>
          </div>
          <dl class="console-ledger">
            <div><dt>observed signals</dt><dd>${summary.observedCount}</dd></div>
            <div><dt>high intent</dt><dd>${summary.highIntentCount}</dd></div>
            <div><dt>mainnet rails</dt><dd>${summary.mainnetCount}</dd></div>
            <div><dt>priced calls</dt><dd>${summary.pricedCount}</dd></div>
          </dl>
        </div>
        <aside class="terminal-window" aria-label="agent commerce web-data terminal preview">
          <div class="terminal-topline">radar run</div>
          <pre><code>$ fuse public launch queues
sources: coinbase/x402 + pay-skills
observed: ${summary.observedCount}
high-intent: ${summary.highIntentCount}
output: agent-commerce-webdata-radar.json</code></pre>
        </aside>
      </section>

      <section class="console-section">
        <div class="console-section-head split">
          <div>
            <p class="console-kicker">revenue shortlist</p>
            <h2>Surfaces with the strongest direct proof-packet fit.</h2>
          </div>
          <a class="console-link" href="agent-commerce-sample-report.html">sample report</a>
        </div>
        <div class="proof-terminal-grid">${cards}</div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">market feed</p>
          <h2>High-intent rows from public web data.</h2>
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>PR</th>
                <th>signal</th>
                <th>source</th>
                <th>category</th>
                <th>rails</th>
                <th>score</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </section>

      <section class="console-section two-column-section">
        <article class="terminal-window">
          <div class="terminal-topline">category mix</div>
          <div class="table-shell compact"><table><tbody>${categoryRows}</tbody></table></div>
        </article>
        <article class="terminal-window">
          <div class="terminal-topline">rail mix</div>
          <div class="table-shell compact"><table><tbody>${railRows}</tbody></table></div>
        </article>
      </section>

      <section class="terminal-ticket">
        <p class="console-kicker">owner-authorized pass</p>
        <h2>Have a paid API, MCP server, or agent-commerce launch entering a registry?</h2>
        <p>
          Send the public manifest, OpenAPI file, MCP endpoint, or launch PR. Tate Programs returns a fixed-scope external proof packet with spend map, CORS/payment-header readback, discovery drift, metadata and receipt notes, and patch order.
        </p>
        <div class="console-actions">
          <a class="console-button primary" href="mailto:hello@tateprograms.com?subject=Outside%20proof%20packet">email scope</a>
          <a class="console-button secondary" href="payments.html">pricing</a>
        </div>
      </section>
    </main>
  </body>
</html>
`
}

async function main() {
  const [x402, paySkills] = await Promise.all([
    readJson('x402-ecosystem-radar.json'),
    readJson('pay-skills-launch-queue.json'),
  ])
  const summary = summarize(x402, paySkills)
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
