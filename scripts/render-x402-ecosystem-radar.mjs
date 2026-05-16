import { writeFile } from 'node:fs/promises'

const SOURCE_REPO = 'coinbase/x402'
const START_DATE = process.env.X402_ECOSYSTEM_START_DATE ?? '2026-05-01'
const RUN_DATE = new Date().toISOString().slice(0, 10)
const OUTPUT_HTML = 'x402-ecosystem-radar.html'
const OUTPUT_JSON = 'x402-ecosystem-radar.json'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

const headers = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'TatePrograms-X402EcosystemRadar/1.0',
  ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function ageHours(dateValue) {
  const created = new Date(dateValue).getTime()
  if (!Number.isFinite(created)) return null
  return Math.max(0, Math.round((Date.now() - created) / 36e5))
}

async function fetchJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`)
  }
  return response.json()
}

async function fetchQueue() {
  const url = new URL('https://api.github.com/search/issues')
  url.searchParams.set('q', `repo:${SOURCE_REPO} is:pr created:>=${START_DATE}`)
  url.searchParams.set('sort', 'updated')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', '100')
  return fetchJson(url)
}

async function fetchFiles(number) {
  const url = `https://api.github.com/repos/${SOURCE_REPO}/pulls/${number}/files?per_page=100`
  try {
    return await fetchJson(url)
  }
  catch {
    return []
  }
}

function extractUrls(text) {
  return [...text.matchAll(/https?:\/\/[^\s)>"']+/g)]
    .map(match => match[0].replace(/[.,;]+$/, ''))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function extractNetworks(text) {
  const checks = [
    ['Base', /\bbase\b|eip155:8453/i],
    ['Base Sepolia', /base sepolia|eip155:84532/i],
    ['Solana', /\bsolana\b/i],
    ['Tempo', /\btempo\b/i],
    ['MPP', /\bmpp\b/i],
    ['USDC', /\busdc\b/i],
    ['EURC', /\beurc\b/i],
    ['mainnet', /\bmainnet\b/i],
    ['testnet', /\btestnet\b|\bsepolia\b|\bdevnet\b/i],
  ]
  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
}

function extractAmounts(text) {
  return [...text.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)]
    .map(match => Number.parseFloat(match[1]))
    .filter(Number.isFinite)
}

function inferCategory(text, files) {
  const fileText = files.map(file => file.filename).join('\n')
  const combined = `${text}\n${fileText}`
  if (/ecosystem\/partners-data|Services\/Endpoints|partner/i.test(combined)) return 'ecosystem listing'
  if (/docs|documentation|guide|mdx|markdown/i.test(combined)) return 'docs / discovery'
  if (/facilitator|middleware|verify|settle|payment/i.test(combined)) return 'protocol implementation'
  if (/example|demo|starter|template/i.test(combined)) return 'example app'
  if (/mcp|agent|openapi|manifest|\.well-known/i.test(combined)) return 'agent discovery'
  return 'x402 repo activity'
}

function reviewReasons({ text, files, networks, maxPriceUsd }) {
  const fileText = files.map(file => file.filename).join('\n')
  const combined = `${text}\n${fileText}`
  const reasons = []

  if (/ecosystem\/partners-data|Services\/Endpoints|provider|partner/i.test(combined)) reasons.push('public ecosystem listing')
  if (/mcp|agent|tool|openapi|manifest|\.well-known|discovery/i.test(combined)) reasons.push('agent-discoverable surface')
  if (/settle|settlement|invoice|quote|merchant|checkout|cross-border|eurc/i.test(combined)) reasons.push('settlement or checkout workflow')
  if (/security|audit|risk|fraud|oracle|compliance|esg/i.test(combined)) reasons.push('trust or risk claims')
  if (/cors|browser|header|x-payment|payment-signature/i.test(combined)) reasons.push('browser/payment-header behavior')
  if (networks.includes('mainnet')) reasons.push('mainnet value path')
  if (networks.includes('MPP') || networks.includes('Tempo')) reasons.push('multi-protocol payment path')
  if (maxPriceUsd > 0) reasons.push('declared paid calls')

  return [...new Set(reasons)]
}

function priorityScore(row) {
  let score = 0
  if (row.category === 'ecosystem listing') score += 24
  if (row.category === 'protocol implementation') score += 14
  if (row.reasons.includes('agent-discoverable surface')) score += 12
  if (row.reasons.includes('settlement or checkout workflow')) score += 12
  if (row.reasons.includes('trust or risk claims')) score += 10
  if (row.reasons.includes('browser/payment-header behavior')) score += 8
  if (row.networks.includes('mainnet')) score += 12
  if (row.networks.includes('Base')) score += 8
  if (row.networks.includes('Solana')) score += 8
  if (row.maxPriceUsd > 0) score += 8
  if (row.ageHours !== null && row.ageHours <= 48) score += 8
  return Math.min(100, score)
}

function priorityLabel(score) {
  if (score >= 60) return 'urgent'
  if (score >= 38) return 'review'
  return 'watch'
}

function summaryLine(body, title) {
  const line = String(body ?? '')
    .split('\n')
    .map(value => value.trim())
    .find(value => value && !value.startsWith('#') && !value.startsWith('<!--') && !value.startsWith('- ['))
  return line || title
}

function normalizeItem(item, files) {
  const body = item.body ?? ''
  const text = `${item.title}\n${body}`
  const networks = extractNetworks(text)
  const amounts = extractAmounts(text)
  const maxPriceUsd = amounts.length ? Math.max(...amounts) : 0
  const category = inferCategory(text, files)
  const urls = extractUrls(text)
  const row = {
    number: item.number,
    title: item.title,
    url: item.html_url,
    state: item.state,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    ageHours: ageHours(item.created_at),
    author: item.user?.login ?? '',
    authorUrl: item.user?.html_url ?? '',
    category,
    networks,
    maxPriceUsd,
    urls: urls.slice(0, 8),
    files: files.map(file => file.filename),
    ecosystemFiles: files.filter(file => /ecosystem\/partners-data/i.test(file.filename)).map(file => file.filename),
    summary: summaryLine(body, item.title),
    reasons: [],
  }
  row.reasons = reviewReasons({ text, files, networks, maxPriceUsd })
  row.priorityScore = priorityScore(row)
  row.priority = priorityLabel(row.priorityScore)
  return row
}

async function summarize(payload) {
  const items = payload.items ?? []
  const enriched = await Promise.all(items.map(async item => normalizeItem(item, await fetchFiles(item.number))))
  const rows = enriched.sort((a, b) => b.priorityScore - a.priorityScore || new Date(b.updatedAt) - new Date(a.updatedAt))
  const openRows = rows.filter(row => row.state === 'open')
  const todayRows = rows.filter(row => row.ageHours !== null && row.ageHours <= 24)
  const priorityRows = rows.filter(row => row.priorityScore >= 38)
  const newestRows = [...rows].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 16)
  const ecosystemRows = rows.filter(row => row.category === 'ecosystem listing')

  const categoryCounts = rows.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + 1
    return acc
  }, {})
  const networkCounts = rows.reduce((acc, row) => {
    for (const network of row.networks) {
      acc[network] = (acc[network] ?? 0) + 1
    }
    return acc
  }, {})

  return {
    runDate: RUN_DATE,
    source: `https://github.com/${SOURCE_REPO}/pulls`,
    apiSource: `https://api.github.com/search/issues?q=repo:${SOURCE_REPO}+is:pr+created:>=${START_DATE}`,
    startDate: START_DATE,
    totalCount: payload.total_count ?? rows.length,
    observedCount: rows.length,
    openCount: openRows.length,
    submittedLast24h: todayRows.length,
    ecosystemListingCount: ecosystemRows.length,
    priorityCount: priorityRows.length,
    categoryCounts,
    networkCounts,
    topCategories: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    topNetworks: Object.entries(networkCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    priorityRows: priorityRows.slice(0, 12),
    newestRows,
    rows,
  }
}

function money(value) {
  if (!Number.isFinite(value) || value <= 0) return 'n/a'
  if (value >= 100) return `$${Math.round(value).toLocaleString()}`
  return `$${value.toFixed(value < 0.01 ? 4 : 2).replace(/0+$/, '').replace(/\.$/, '')}`
}

function renderCard(row) {
  const reasons = row.reasons.length
    ? row.reasons.slice(0, 5).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')
    : '<li>standard x402 ecosystem review</li>'
  const rails = row.networks.length ? row.networks.join(', ') : 'not declared'
  const age = row.ageHours === null ? 'unknown' : `${row.ageHours}h`
  const firstUrl = row.urls[0]

  return `<article>
            <p class="card-command">${escapeHtml(row.priority)} / ${row.priorityScore}</p>
            <h3>${escapeHtml(row.title)}</h3>
            <p>${escapeHtml(row.summary)}</p>
            <dl class="mini-ledger">
              <div><dt>category</dt><dd>${escapeHtml(row.category)}</dd></div>
              <div><dt>rails</dt><dd>${escapeHtml(rails)}</dd></div>
              <div><dt>max price</dt><dd>${money(row.maxPriceUsd)}</dd></div>
              <div><dt>age</dt><dd>${escapeHtml(age)}</dd></div>
            </dl>
            <ul class="compact-list">${reasons}</ul>
            <p class="mini-copy">${firstUrl ? `Primary URL: ${escapeHtml(firstUrl)}` : 'Primary URL: not declared'}</p>
            <a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">PR #${row.number} by @${escapeHtml(row.author)}</a>
          </article>`
}

function renderRows(rows) {
  return rows.map(row => `<tr>
              <td><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">#${row.number}</a></td>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.category)}</td>
              <td>${escapeHtml(row.networks.join(', ') || 'not declared')}</td>
              <td>${money(row.maxPriceUsd)}</td>
              <td>${escapeHtml(row.priority)}</td>
            </tr>`).join('\n')
}

function renderHtml(summary) {
  const priorityCards = summary.priorityRows.slice(0, 8).map(renderCard).join('\n')
  const newestRows = renderRows(summary.newestRows)
  const categoryRows = summary.topCategories.map(([category, count]) => `<tr><td>${escapeHtml(category)}</td><td>${count}</td></tr>`).join('')
  const networkRows = summary.topNetworks.map(([network, count]) => `<tr><td>${escapeHtml(network)}</td><td>${count}</td></tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>x402 Ecosystem Radar | Coinbase x402 Launch Watchlist | Tate Programs</title>
    <meta name="description" content="A current Coinbase x402 ecosystem radar for fresh partners, MCP payment endpoints, discovery metadata, mainnet rails, and launch-readiness review priorities.">
    <link rel="canonical" href="https://tateprograms.com/x402-ecosystem-radar.html">
    <meta property="og:type" content="article">
    <meta property="og:title" content="x402 Ecosystem Radar">
    <meta property="og:description" content="Fresh Coinbase x402 ecosystem pull requests summarized into launch-control review priorities.">
    <meta property="og:url" content="https://tateprograms.com/x402-ecosystem-radar.html">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="x402 Ecosystem Radar">
    <meta name="twitter:description" content="Current watchlist for Coinbase x402 ecosystem launches and review priorities.">
    <link rel="stylesheet" href="styles.css">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "x402 Ecosystem Radar",
        "url": "https://tateprograms.com/x402-ecosystem-radar.html",
        "dateModified": "${summary.runDate}",
        "isBasedOn": "${summary.source}",
        "description": "Aggregated public pull-request radar for Coinbase x402 ecosystem launch surfaces.",
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
        <a href="x402-attack-map-2026.html">attack-map</a>
        <a href="x402-ecosystem-radar.html">ecosystem</a>
        <a href="pay-skills-launch-queue.html">queue</a>
        <a href="payments.html">pay</a>
      </nav>
      <a class="os-status" href="mailto:hello@tateprograms.com?subject=x402%20launch%20review">
        <span></span>
        x402 checks
      </a>
    </header>

    <main>
      <div class="shell-pathline">
        <span>tate@programs</span>
        <strong>~/radar/coinbase-x402</strong>
        <em>${summary.runDate}</em>
      </div>

      <section class="console-hero console-page-hero">
        <div class="console-copy">
          <p class="console-kicker">coinbase x402 ecosystem / ${summary.runDate}</p>
          <h1>The x402 ecosystem page is becoming a live market map for agent-paid APIs.</h1>
          <p class="console-subtitle">
            This radar reads public Coinbase x402 pull requests and separates partner listings, MCP payment endpoints, mainnet rails, discovery metadata, and browser/payment-header launch signals. The useful question is not whether a launch mentions x402. It is whether agents can discover the paid surface, understand the cap, receive a proper 402, and reconcile the receipt.
          </p>
          <div class="console-actions">
            <a class="console-button primary" href="x402-surface-check.html">run surface check</a>
            <a class="console-button secondary" href="agent-payment-launch-review.html">launch review</a>
            <a class="console-button secondary" href="pay-skills-launch-queue.html">pay-skills queue</a>
            <a class="console-button ghost" href="x402-ecosystem-radar.json">data json</a>
            <a class="console-button ghost" href="${summary.source}" target="_blank" rel="noreferrer">source PRs</a>
          </div>
          <dl class="console-ledger">
            <div>
              <dt>tracked PRs</dt>
              <dd>${summary.observedCount}</dd>
            </div>
            <div>
              <dt>ecosystem listings</dt>
              <dd>${summary.ecosystemListingCount}</dd>
            </div>
            <div>
              <dt>review priority</dt>
              <dd>${summary.priorityCount}</dd>
            </div>
          </dl>
        </div>

        <aside class="terminal-window" aria-label="x402 ecosystem radar terminal preview">
          <div class="terminal-topline">ecosystem scan</div>
          <pre><code>$ scan coinbase/x402
since: ${summary.startDate}
observed: ${summary.observedCount}
open: ${summary.openCount}
signals: MCP, Base, Solana, discovery
output: x402-ecosystem-radar.json</code></pre>
        </aside>
      </section>

      <section class="console-section">
        <div class="console-section-head split">
          <div>
            <p class="console-kicker">priority surfaces</p>
            <h2>Fresh ecosystem entries that deserve launch-control evidence.</h2>
          </div>
          <a class="console-link" href="agent-commerce-sample-report.html">view sample report</a>
        </div>
        <div class="proof-terminal-grid">
          ${priorityCards}
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">latest movement</p>
          <h2>Current pull requests are the trend feed.</h2>
          <p>Rows are public launch or implementation signals, not vulnerability findings. Use them to choose where a no-payment proof pass would add the most trust.</p>
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>PR</th>
                <th>surface</th>
                <th>category</th>
                <th>rails</th>
                <th>max price</th>
                <th>priority</th>
              </tr>
            </thead>
            <tbody>
              ${newestRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="console-section two-column-section">
        <article class="terminal-window">
          <div class="terminal-topline">category mix</div>
          <div class="table-shell compact">
            <table>
              <tbody>${categoryRows}</tbody>
            </table>
          </div>
        </article>
        <article class="terminal-window">
          <div class="terminal-topline">rail signals</div>
          <div class="table-shell compact">
            <table>
              <tbody>${networkRows}</tbody>
            </table>
          </div>
        </article>
      </section>

      <section class="terminal-ticket">
        <p class="console-kicker">private pass</p>
        <h2>Launching into the x402 ecosystem queue?</h2>
        <p>
          Send a manifest, MCP endpoint, OpenAPI file, ecosystem PR, or no-payment 402 response. The fixed-scope review returns a spend map, discovery gaps, browser/payment-header notes, metadata risks, replay/failure checks, and patch order. Owner-authorized surfaces only.
        </p>
        <div class="console-actions">
          <a class="console-button primary" href="mailto:hello@tateprograms.com?subject=x402%20ecosystem%20launch%20review">email scope</a>
          <a class="console-button secondary" href="x402-attack-map-2026.html">attack map</a>
          <a class="console-button secondary" href="payments.html">pricing</a>
        </div>
      </section>
    </main>
  </body>
</html>
`
}

async function main() {
  const payload = await fetchQueue()
  const summary = await summarize(payload)

  await Promise.all([
    writeFile(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(OUTPUT_HTML, renderHtml(summary)),
  ])

  console.log(`Wrote ${OUTPUT_HTML} and ${OUTPUT_JSON}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
