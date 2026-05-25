import { writeFile } from 'node:fs/promises'

const SOURCE_REPO = 'xpaysh/awesome-x402'
const START_DATE = process.env.AWESOME_X402_START_DATE ?? '2026-05-13'
const RUN_DATE = new Date().toISOString().slice(0, 10)
const OUTPUT_JSON = 'awesome-x402-launch-queue.json'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

const headers = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'TatePrograms-AwesomeX402Queue/1.0',
  ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
}

async function fetchJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

function ageHours(value) {
  const created = new Date(value).getTime()
  if (!Number.isFinite(created)) return null
  return Math.max(0, Math.round((Date.now() - created) / 36e5))
}

function extractUrls(text) {
  return [...String(text ?? '').matchAll(/https?:\/\/[^\s)>"']+/g)]
    .map((match) => match[0].replace(/[.,;]+$/, ''))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function extractNetworks(text) {
  const checks = [
    ['Base', /\bbase\b|eip155:8453/i],
    ['Solana', /\bsolana\b/i],
    ['USDC', /\busdc\b/i],
    ['mainnet', /\bmainnet\b/i],
    ['x402', /\bx402\b/i],
    ['MCP', /\bmcp\b/i],
    ['A2A', /\ba2a\b/i],
    ['testnet', /\btestnet\b|\bsepolia\b|\bdevnet\b/i],
  ]
  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
}

function extractAmounts(text) {
  return [...String(text ?? '').matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => Number.parseFloat(match[1]))
    .filter(Number.isFinite)
}

function inferCategory(text) {
  if (/security|risk|guard|trust|verification|pii|compliance|audit/i.test(text)) return 'trust / security'
  if (/mcp|a2a|agent|tool|worker/i.test(text)) return 'agent tool surface'
  if (/data|market|oracle|research|scrape|search|api/i.test(text)) return 'data API'
  if (/payment|settle|receipt|checkout|wallet|commerce/i.test(text)) return 'payment rail'
  return 'awesome-x402 listing'
}

function reasonsFor({ text, networks, maxPriceUsd }) {
  const reasons = []
  if (/openapi|manifest|\.well-known|llms\.txt|agent-card|mcp/i.test(text)) reasons.push('agent-discoverable surface')
  if (/cors|browser|header|x-payment|payment-signature|preflight/i.test(text)) reasons.push('browser/payment-header behavior')
  if (/security|risk|guard|trust|verification|pii|compliance|audit/i.test(text)) reasons.push('trust or risk claims')
  if (/settle|receipt|checkout|wallet|pay/i.test(text)) reasons.push('settlement or checkout workflow')
  if (/scrape|search|market|oracle|research|data/i.test(text)) reasons.push('web-data or market-data surface')
  if (networks.includes('mainnet')) reasons.push('mainnet value path')
  if (maxPriceUsd > 0) reasons.push('declared paid calls')
  return [...new Set(reasons)]
}

function priorityScore(row) {
  let score = 0
  if (row.reasons.includes('agent-discoverable surface')) score += 16
  if (row.reasons.includes('browser/payment-header behavior')) score += 14
  if (row.reasons.includes('trust or risk claims')) score += 14
  if (row.reasons.includes('settlement or checkout workflow')) score += 12
  if (row.reasons.includes('web-data or market-data surface')) score += 10
  if (row.networks.includes('mainnet')) score += 12
  if (row.networks.includes('Base')) score += 8
  if (row.networks.includes('Solana')) score += 8
  if (row.maxPriceUsd > 0) score += 8
  if (row.ageHours !== null && row.ageHours <= 48) score += 10
  return Math.min(100, score)
}

function priorityLabel(score) {
  if (score >= 58) return 'urgent'
  if (score >= 36) return 'review'
  return 'watch'
}

function summaryLine(body, title) {
  const line = String(body ?? '')
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value && !value.startsWith('#') && !value.startsWith('<!--') && !value.startsWith('- ['))
  return line || title
}

async function fetchQueue() {
  const url = new URL('https://api.github.com/search/issues')
  url.searchParams.set('q', `repo:${SOURCE_REPO} is:pr created:>=${START_DATE}`)
  url.searchParams.set('sort', 'updated')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', '100')
  return fetchJson(url)
}

function normalizeItem(item) {
  const text = `${item.title}\n${item.body ?? ''}`
  const networks = extractNetworks(text)
  const amounts = extractAmounts(text)
  const maxPriceUsd = amounts.length ? Math.max(...amounts) : 0
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
    category: inferCategory(text),
    networks,
    maxPriceUsd,
    urls: extractUrls(text).slice(0, 8),
    summary: summaryLine(item.body, item.title),
    reasons: [],
  }
  row.reasons = reasonsFor({ text, networks, maxPriceUsd })
  row.priorityScore = priorityScore(row)
  row.priority = priorityLabel(row.priorityScore)
  return row
}

async function main() {
  const payload = await fetchQueue()
  const rows = (payload.items ?? [])
    .map(normalizeItem)
    .sort((a, b) => b.priorityScore - a.priorityScore || new Date(b.updatedAt) - new Date(a.updatedAt))
  const priorityRows = rows.filter((row) => row.priorityScore >= 36)
  await writeFile(OUTPUT_JSON, `${JSON.stringify({
    runDate: RUN_DATE,
    source: `https://github.com/${SOURCE_REPO}/pulls`,
    apiSource: `https://api.github.com/search/issues?q=repo:${SOURCE_REPO}+is:pr+created:>=${START_DATE}`,
    startDate: START_DATE,
    totalCount: payload.total_count ?? rows.length,
    observedCount: rows.length,
    priorityCount: priorityRows.length,
    rows,
  }, null, 2)}\n`)
  console.log(`Wrote ${OUTPUT_JSON}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
