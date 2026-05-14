import { mkdir, writeFile } from 'node:fs/promises'

const SOURCE_REPO = 'solana-foundation/pay-skills'
const START_DATE = process.env.PAY_SKILLS_START_DATE ?? '2026-05-01'
const RUN_DATE = new Date().toISOString().slice(0, 10)
const OUTPUT_HTML = 'pay-skills-launch-queue.html'
const OUTPUT_JSON = 'pay-skills-launch-queue.json'
const OUTREACH_MD = `outreach/generated/pay-skills-launch-queue-${RUN_DATE}.md`
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

const headers = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'TatePrograms-PaySkillsLaunchQueue/1.0',
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

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)
}

function money(value) {
  if (!Number.isFinite(value)) return 'n/a'
  if (value === 0) return '$0'
  if (value >= 100) return `$${Math.round(value).toLocaleString()}`
  return `$${value.toFixed(value < 0.01 ? 4 : 2).replace(/0+$/, '').replace(/\.$/, '')}`
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
  url.searchParams.set('sort', 'created')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', '100')

  return fetchJson(url)
}

function extractDollarAmounts(text) {
  return [...text.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)]
    .map(match => Number.parseFloat(match[1]))
    .filter(Number.isFinite)
}

function extractEndpointCount(text) {
  const counts = []
  const patterns = [
    /(\d{1,4})\+?\s+(?:paid\s+)?(?:x402-enabled\s+)?endpoints?/gi,
    /(\d{1,4})\+?\s+(?:paid\s+)?paths?/gi,
    /(\d{1,4})\+?\s+(?:public\s+)?apis?/gi,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      counts.push(Number.parseInt(match[1], 10))
    }
  }

  const plausibleCounts = counts.filter(count => Number.isFinite(count) && count > 0 && count !== 402 && count <= 200)
  return plausibleCounts.length ? Math.max(...plausibleCounts) : 0
}

function inferCategory(text) {
  const checks = [
    ['bounty / escrow', /bounty|escrow|verifier|zk|proof|marketplace/i],
    ['identity / credit', /credit|score|reputation|fraud|counterparty|identity/i],
    ['compute / web data', /compute|scrape|crawl|fetch|web intelligence|residential|proxy|dns|ssl|latency/i],
    ['shopping / fulfillment', /shopping|voucher|gift card|order|fulfillment|catalog/i],
    ['finance / market data', /market data|crypto|exchange|arbitrage|economic|finance|wallet|defi/i],
    ['compliance / invoices', /invoice|tax|settle|refund|compliance|receipt/i],
    ['communications', /email|sms|phone|voice|call|contact center|speech/i],
    ['data API', /data|openapi|api|query|enrichment/i],
  ]

  return checks.find(([, pattern]) => pattern.test(text))?.[0] ?? 'agent-payment launch'
}

function extractNetworks(text) {
  const networks = [
    ['Solana', /solana/i],
    ['Base', /\bbase\b|eip155:8453/i],
    ['Polygon', /polygon/i],
    ['Tempo', /tempo/i],
    ['Ethereum', /ethereum/i],
    ['devnet', /devnet|sepolia/i],
    ['mainnet', /mainnet/i],
    ['MPP', /\bmpp\b/i],
    ['x402', /x402/i],
  ]

  return networks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
}

function reviewReasons({ text, endpointCount, maxPriceUsd, networks }) {
  const reasons = []

  if (endpointCount >= 50) reasons.push('wide paid API surface')
  else if (endpointCount >= 10) reasons.push('multi-endpoint paid surface')
  if (maxPriceUsd >= 10) reasons.push('meaningful per-call value movement')
  if (networks.length >= 4) reasons.push('multi-rail payment behavior')
  if (/credit|score|reputation|fraud|counterparty|wallet screening/i.test(text)) reasons.push('agent identity or risk-scoring claims')
  if (/bounty|escrow|verifier|zk|groth16|sp1|proof/i.test(text)) reasons.push('escrow, verification, or proof workflow')
  if (/residential|scrape|crawl|fetch|web intelligence|proxy|extract/i.test(text)) reasons.push('untrusted web-data ingestion')
  if (/shopping|voucher|gift card|order|fulfillment|delivery/i.test(text)) reasons.push('real purchase or fulfillment path')
  if (/invoice|tax|settle|refund|reconciliation|receipt/i.test(text)) reasons.push('settlement or accounting path')
  if (/email|sms|phone|voice|call|contact center|speech/i.test(text)) reasons.push('outbound communication or voice path')
  if (/openapi|skill\.md|mcp server|agent skill/i.test(text)) reasons.push('agent-discoverable contract')
  if (/mainnet/i.test(text)) reasons.push('mainnet value path')

  return [...new Set(reasons)]
}

function priorityScore(row) {
  let score = 0
  if (row.networks.includes('x402')) score += 10
  if (row.networks.includes('MPP')) score += 6
  if (row.networks.includes('mainnet')) score += 8
  if (row.endpointCount >= 50) score += 20
  else if (row.endpointCount >= 10) score += 12
  else if (row.endpointCount >= 3) score += 6
  if (row.maxPriceUsd >= 10) score += 16
  else if (row.maxPriceUsd > 0) score += 8
  score += Math.min(36, row.reasons.length * 6)
  if (row.ageHours !== null && row.ageHours <= 24) score += 8
  return Math.min(100, score)
}

function priorityLabel(score) {
  if (score >= 70) return 'urgent'
  if (score >= 48) return 'review'
  return 'watch'
}

function normalizeItem(item) {
  const body = item.body ?? ''
  const text = `${item.title}\n${body}`
  const amounts = extractDollarAmounts(text)
  const endpointCount = extractEndpointCount(text)
  const maxPriceUsd = amounts.length ? Math.max(...amounts) : 0
  const networks = extractNetworks(text)
  const row = {
    number: item.number,
    title: item.title,
    slug: slugify(item.title),
    url: item.html_url,
    state: item.state,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    ageHours: ageHours(item.created_at),
    author: item.user?.login ?? '',
    authorUrl: item.user?.html_url ?? '',
    category: inferCategory(text),
    endpointCount,
    priceCount: amounts.length,
    maxPriceUsd,
    networks,
    reasons: [],
    summary: body.split('\n').find(line => line.trim() && !line.trim().startsWith('#'))?.trim() ?? '',
  }

  row.reasons = reviewReasons({ text, endpointCount, maxPriceUsd, networks })
  row.priorityScore = priorityScore(row)
  row.priority = priorityLabel(row.priorityScore)
  row.outreachAngle = outreachAngle(row)
  return row
}

function outreachAngle(row) {
  if (row.reasons.includes('agent identity or risk-scoring claims')) {
    return 'spend-policy and metadata review for wallet/identity scoring claims'
  }
  if (row.reasons.includes('escrow, verification, or proof workflow')) {
    return 'private pass on escrow, verifier, and failed-payment edge cases'
  }
  if (row.reasons.includes('real purchase or fulfillment path')) {
    return 'checkout, fulfillment, receipt, and refund readiness map'
  }
  if (row.reasons.includes('untrusted web-data ingestion')) {
    return 'public-surface check for paid web-data calls, caps, and PII-safe metadata'
  }
  if (row.reasons.includes('settlement or accounting path')) {
    return 'spend map and reconciliation controls review'
  }
  return 'agent-payment launch-readiness public-surface pass'
}

function summarize(items, totalCount) {
  const rows = items.map(normalizeItem)
  const openRows = rows.filter(row => row.state === 'open')
  const priorityRows = [...rows]
    .filter(row => row.priorityScore >= 48)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.ageHours - b.ageHours)
  const newestRows = [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const todayRows = rows.filter(row => row.ageHours !== null && row.ageHours <= 24)
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
    totalCount,
    observedCount: rows.length,
    openCount: openRows.length,
    submittedLast24h: todayRows.length,
    priorityCount: priorityRows.length,
    categoryCounts,
    networkCounts,
    topCategories: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    topNetworks: Object.entries(networkCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    priorityRows: priorityRows.slice(0, 14),
    newestRows: newestRows.slice(0, 12),
    rows,
  }
}

function renderQueueCard(row) {
  const reasons = row.reasons.length
    ? row.reasons.slice(0, 5).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')
    : '<li>standard agent-payment launch checks</li>'
  const networks = row.networks.length ? row.networks.join(', ') : 'not declared'
  const age = row.ageHours === null ? 'unknown' : `${row.ageHours}h`

  return `<article>
            <p class="card-command">${escapeHtml(row.priority)} / ${row.priorityScore}</p>
            <h3>${escapeHtml(row.title)}</h3>
            <p>${escapeHtml(row.summary || row.outreachAngle)}</p>
            <dl class="mini-ledger">
              <div><dt>category</dt><dd>${escapeHtml(row.category)}</dd></div>
              <div><dt>endpoints</dt><dd>${row.endpointCount || 'n/a'}</dd></div>
              <div><dt>max price</dt><dd>${money(row.maxPriceUsd)}</dd></div>
              <div><dt>age</dt><dd>${escapeHtml(age)}</dd></div>
            </dl>
            <p class="mini-copy">Networks: ${escapeHtml(networks)}</p>
            <ul class="compact-list">${reasons}</ul>
            <a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">PR #${row.number} by @${escapeHtml(row.author)}</a>
          </article>`
}

function renderRows(rows) {
  return rows.map(row => `<tr>
              <td><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">#${row.number}</a></td>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.category)}</td>
              <td>${row.endpointCount || 'n/a'}</td>
              <td>${money(row.maxPriceUsd)}</td>
              <td>${escapeHtml(row.networks.join(', ') || 'not declared')}</td>
              <td>${escapeHtml(row.priority)}</td>
            </tr>`).join('\n')
}

function renderHtml(summary) {
  const priorityCards = summary.priorityRows.slice(0, 8).map(renderQueueCard).join('\n')
  const newestRows = renderRows(summary.newestRows)
  const categoryRows = summary.topCategories.map(([category, count]) => `<tr><td>${escapeHtml(category)}</td><td>${count}</td></tr>`).join('')
  const networkRows = summary.topNetworks.map(([network, count]) => `<tr><td>${escapeHtml(network)}</td><td>${count}</td></tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pay-Skills Launch Queue | x402 Agent-Payment Watchlist | Tate Programs</title>
    <meta name="description" content="A current watchlist of fresh pay-skills registry pull requests, x402 agent-payment launch surfaces, risk signals, and review priorities.">
    <link rel="canonical" href="https://tateprograms.com/pay-skills-launch-queue.html">
    <meta property="og:type" content="article">
    <meta property="og:title" content="Pay-Skills Launch Queue">
    <meta property="og:description" content="Fresh x402 and agent-payment surfaces from the public pay-skills registry queue, summarized into launch-control priorities.">
    <meta property="og:url" content="https://tateprograms.com/pay-skills-launch-queue.html">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Pay-Skills Launch Queue">
    <meta name="twitter:description" content="Current watchlist for x402 agent-payment launch surfaces and review priorities.">
    <link rel="stylesheet" href="styles.css">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "Pay-Skills Launch Queue",
        "url": "https://tateprograms.com/pay-skills-launch-queue.html",
        "dateModified": "${summary.runDate}",
        "isBasedOn": "${summary.source}",
        "description": "Aggregated public pull-request queue for pay-skills agent-payment launch surfaces.",
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
        <a href="agent-commerce-gate.html">commerce-gate</a>
        <a href="pay-sh-catalog-pulse.html">pay-pulse</a>
        <a href="pay-skills-launch-queue.html">queue</a>
        <a href="agent-security-drill.html">security-drill</a>
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
        <strong>~/notes/pay-skills-launch-queue</strong>
        <em>${summary.runDate}</em>
      </div>

      <section class="console-hero console-page-hero">
        <div class="console-copy">
          <p class="console-kicker">pay-skills launch queue / ${summary.runDate}</p>
          <h1>New agent-payment services are entering the registry faster than their launch controls can mature.</h1>
          <p class="console-subtitle">
            This watchlist reads the public pay-skills pull-request queue and turns fresh x402, MPP, Solana, Base, compute, commerce, wallet, and data-api launches into a practical review map. The point is simple: before autonomous agents spend, teams need visible caps, receipts, replay handling, metadata boundaries, and failure paths.
          </p>
          <div class="console-actions">
            <a class="console-button primary" href="agent-commerce-gate.html">run commerce gate</a>
            <a class="console-button secondary" href="x402-surface-check.html">check x402 surface</a>
            <a class="console-button secondary" href="x402-attack-map-2026.html">attack map</a>
            <a class="console-button secondary" href="agent-commerce-sample-report.html">sample report</a>
            <a class="console-button ghost" href="pay-skills-launch-queue.json">data json</a>
            <a class="console-button ghost" href="${summary.source}" target="_blank" rel="noreferrer">source queue</a>
          </div>
          <dl class="console-ledger">
            <div>
              <dt>fresh PRs</dt>
              <dd>${summary.totalCount}</dd>
            </div>
            <div>
              <dt>last 24h</dt>
              <dd>${summary.submittedLast24h}</dd>
            </div>
            <div>
              <dt>review priority</dt>
              <dd>${summary.priorityCount}</dd>
            </div>
          </dl>
        </div>

        <aside class="terminal-window" aria-label="Pay-skills launch queue terminal preview">
          <div class="terminal-topline">queue scan</div>
          <pre><code>$ scan solana-foundation/pay-skills
since: ${summary.startDate}
observed: ${summary.observedCount}
open: ${summary.openCount}
signals: x402, MPP, mainnet, caps
output: pay-skills-launch-queue.json</code></pre>
        </aside>
      </section>

      <section class="console-section">
        <div class="console-section-head split">
          <div>
            <p class="console-kicker">priority surfaces</p>
            <h2>Fresh registry entries that deserve a launch-control pass.</h2>
          </div>
          <a class="console-link" href="agent-commerce-sample-report.html">view deliverable</a>
        </div>
        <div class="proof-terminal-grid">
          ${priorityCards}
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">newest public submissions</p>
          <h2>The queue is the live trend feed.</h2>
          <p>These are not vulnerability findings. They are public launch surfaces that signal where payment-agent teams will need proof before buyers trust real agent spend.</p>
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>PR</th>
                <th>Launch surface</th>
                <th>category</th>
                <th>endpoints</th>
                <th>max price</th>
                <th>rails</th>
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
        <p class="console-kicker">paid scope</p>
        <h2>Need a private launch-control pass before the public queue gets attention?</h2>
        <p>
          Send one manifest, OpenAPI file, direct paid endpoint, pay-skills PR, or no-payment 402 challenge. The fixed $149 review returns a spend map, public-surface gaps, metadata risks, replay/failure notes, and a patch order. Owner-authorized surfaces only.
        </p>
        <div class="console-actions">
          <a class="console-button primary" href="mailto:hello@tateprograms.com?subject=Agent-payment%20launch%20queue%20review">email scope</a>
          <a class="console-button secondary" href="x402-attack-map-2026.html">attack map</a>
          <a class="console-button secondary" href="payments.html">pricing</a>
        </div>
      </section>
    </main>
  </body>
</html>
`
}

function renderOutreach(summary) {
  const lines = [
    `# Pay-Skills Launch Queue Leads - ${summary.runDate}`,
    '',
    'Use this as a research queue, not an auto-send list. Contact only when there is a public contact path and a specific helpful note.',
    '',
  ]

  for (const row of summary.priorityRows.slice(0, 12)) {
    lines.push(`## ${row.title}`)
    lines.push('')
    lines.push(`- PR: ${row.url}`)
    lines.push(`- Author: @${row.author} (${row.authorUrl})`)
    lines.push(`- Category: ${row.category}`)
    lines.push(`- Score: ${row.priorityScore} (${row.priority})`)
    lines.push(`- Signals: ${row.reasons.join('; ') || 'standard agent-payment launch checks'}`)
    lines.push(`- Angle: ${row.outreachAngle}`)
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const payload = await fetchQueue()
  const summary = summarize(payload.items ?? [], payload.total_count ?? 0)

  await Promise.all([
    writeFile(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(OUTPUT_HTML, renderHtml(summary)),
    mkdir('outreach/generated', { recursive: true }).then(() => writeFile(OUTREACH_MD, renderOutreach(summary))),
  ])

  console.log(`Wrote ${OUTPUT_HTML}, ${OUTPUT_JSON}, and ${OUTREACH_MD}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
