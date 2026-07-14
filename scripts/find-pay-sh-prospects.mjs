import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'

const CATALOG_URL = 'https://pay.sh/api/catalog'
const RUN_DATE = new Date().toISOString().slice(0, 10)
const OUTPUT_DIR = 'outreach/generated'
const MESSAGE_DIR = `${OUTPUT_DIR}/pay-sh-prospect-messages`
const SENT_LOG_PREFIX = 'agent-commerce-targets-'
const SUPPRESSION_PATH = 'outreach/contact-suppression.csv'

const headers = {
  accept: 'application/json',
  'user-agent': 'TatePrograms-PayShProspectScanner/1.0',
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function normalizeKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function addContactedKey(contacted, value) {
  const key = normalizeKey(value)
  if (key) contacted.add(key)
}

function addContactedTokens(contacted, value) {
  for (const token of String(value ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 6) contacted.add(token)
  }
}

function csvEscape(value) {
  const stringValue = Array.isArray(value) ? value.join('; ') : String(value ?? '')
  return `"${stringValue.replace(/"/g, '""')}"`
}

function money(value) {
  if (!Number.isFinite(value)) return '$0'
  if (value === 0) return '$0'
  if (value >= 100) return `$${Math.round(value).toLocaleString()}`
  return `$${value.toFixed(value < 0.01 ? 4 : 2).replace(/0+$/, '').replace(/\.$/, '')}`
}

function priceRange(provider) {
  const min = provider.min_price_usd ?? 0
  const max = provider.max_price_usd ?? 0
  return min === max ? money(max) : `${money(min)}-${money(max)}`
}

async function fetchCatalog() {
  const response = await fetch(CATALOG_URL, { headers })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${CATALOG_URL}`)
  }
  return response.json()
}

async function loadSuppressedEmails() {
  try {
    const text = await readFile(SUPPRESSION_PATH, 'utf8')
    return new Set(text
      .split(/\r?\n/)
      .slice(1)
      .map(line => line.split(',')[0]?.trim().toLowerCase())
      .filter(Boolean))
  }
  catch {
    return new Set()
  }
}

async function loadExistingOutreach() {
  const contacted = new Set()

  try {
    const files = await readdir(OUTPUT_DIR)
    const sentLogs = files.filter(file => file.startsWith(SENT_LOG_PREFIX) && file.endsWith('.md'))
    for (const file of sentLogs) {
      const text = await readFile(`${OUTPUT_DIR}/${file}`, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('| 20')) continue
        const cells = line.split('|').map(cell => cell.trim()).filter(Boolean)
        const recipient = cells[1]?.replaceAll('`', '').toLowerCase()
        const target = cells[2]?.toLowerCase()
        if (recipient) {
          addContactedKey(contacted, recipient)
          const domain = recipient.split('@')[1]
          addContactedKey(contacted, domain)
          addContactedTokens(contacted, domain)
        }
        if (target) {
          addContactedKey(contacted, target)
          addContactedTokens(contacted, target)
        }
      }
    }
  }
  catch {
    return contacted
  }

  return contacted
}

function providerText(provider) {
  return [
    provider.fqn,
    provider.title,
    provider.description,
    provider.use_case,
    provider.category,
  ].join(' ').toLowerCase()
}

function riskReasons(provider) {
  const text = providerText(provider)
  const reasons = []

  if ((provider.max_price_usd ?? 0) >= 100) reasons.push('large per-call spend ceiling')
  else if ((provider.max_price_usd ?? 0) >= 10) reasons.push('meaningful per-call spend')
  if ((provider.endpoint_count ?? 0) >= 75) reasons.push('very wide endpoint surface')
  else if ((provider.endpoint_count ?? 0) >= 25) reasons.push('wide endpoint surface')
  if (/email|inbox|outbound|message|sms|notification/.test(text)) reasons.push('message-sending or inbox workflow')
  if (/phone|voice|call|webrtc|speech/.test(text)) reasons.push('voice or calling workflow')
  if (/\bdns\b|registrar|subdomain|tld|domain registration|register[^.]{0,40}domain|manage[^.]{0,40}domain/.test(text)) reasons.push('domain, registrar, or DNS workflow')
  if (/crypto|wallet|token|defi|transaction|on-chain|blockchain|rpc/.test(text)) reasons.push('financial data, wallet, or chain context')
  if (/social|profile|enrichment|email address|contact|people|company|lead|property/.test(text)) reasons.push('personal or business-contact data')
  if (/webhook|browser|scrape|crawl|firecrawl|search|maps|reddit|google/.test(text)) reasons.push('untrusted web-data input')
  if (!provider.has_free_tier && provider.has_metering) reasons.push('metered calls without a free tier')

  return reasons
}

function scoreProvider(provider, reasons) {
  let score = 0
  const maxPrice = provider.max_price_usd ?? 0
  const endpoints = provider.endpoint_count ?? 0

  if (maxPrice >= 100) score += 28
  else if (maxPrice >= 10) score += 20
  else if (maxPrice > 0) score += 9
  if (endpoints >= 100) score += 22
  else if (endpoints >= 75) score += 18
  else if (endpoints >= 25) score += 12
  else if (endpoints >= 10) score += 6
  if (provider.has_metering) score += 8
  if (!provider.has_free_tier) score += 6
  score += Math.min(42, reasons.length * 7)

  return Math.min(100, score)
}

function chooseAngle(provider, reasons) {
  const text = providerText(provider)
  if (/email|inbox|sms|message/.test(text)) return 'Messaging spend, metadata, and abuse-control review'
  if (/\bdns\b|registrar|subdomain|domain registration|register[^.]{0,40}domain|manage[^.]{0,40}domain/.test(text)) return 'High-ceiling domain and DNS payment review'
  if (/crypto|wallet|defi|blockchain|rpc/.test(text)) return 'Wallet, RPC, and financial-data payment review'
  if (/enrichment|contact|people|company|social|profile/.test(text)) return 'Contact-data and enrichment payment review'
  if (/browser|scrape|crawl|search|maps/.test(text)) return 'Untrusted web-data and paid-call review'
  if (reasons.some(reason => /wide endpoint/.test(reason))) return 'Wide API surface launch-control review'
  return 'Agent-paid API launch-readiness review'
}

function contactHint(provider) {
  try {
    const url = new URL(provider.service_url)
    const host = url.hostname.replace(/^x402\.api\./, '').replace(/^api\./, '')
    return `https://${host}`
  }
  catch {
    return provider.service_url ?? ''
  }
}

function analyzeProvider(provider, contacted, suppressedEmails) {
  const reasons = riskReasons(provider)
  const score = scoreProvider(provider, reasons)
  const titleKey = normalizeKey(provider.title)
  const fqnKey = normalizeKey(provider.fqn)
  const serviceKey = (() => {
    try {
      return normalizeKey(new URL(provider.service_url).hostname)
    }
    catch {
      return ''
    }
  })()
  const contactedKeys = [...contacted].map(normalizeKey).filter(Boolean)
  const alreadyContacted = contactedKeys.some(item => {
    return item && (
      titleKey.includes(item) ||
      fqnKey.includes(item) ||
      serviceKey.includes(item) ||
      item.includes(titleKey)
    )
  })

  return {
    score,
    fqn: provider.fqn,
    title: provider.title,
    category: provider.category,
    description: provider.description,
    useCase: provider.use_case,
    serviceUrl: provider.service_url,
    contactHint: contactHint(provider),
    endpointCount: provider.endpoint_count ?? 0,
    hasMetering: Boolean(provider.has_metering),
    hasFreeTier: Boolean(provider.has_free_tier),
    minPriceUsd: provider.min_price_usd ?? 0,
    maxPriceUsd: provider.max_price_usd ?? 0,
    priceRange: priceRange(provider),
    reasons,
    angle: chooseAngle(provider, reasons),
    alreadyContacted,
    suppressed: [...suppressedEmails].some(email => providerText(provider).includes(email.split('@')[1] ?? email)),
  }
}

function formatMarkdown(prospects, catalog) {
  const rows = prospects.map((lead, index) => [
    `### ${index + 1}. ${lead.title}`,
    ``,
    `- Score: ${lead.score}`,
    `- FQN: ${lead.fqn}`,
    `- Category: ${lead.category}`,
    `- Price: ${lead.priceRange}`,
    `- Endpoints: ${lead.endpointCount}`,
    `- Free tier: ${lead.hasFreeTier ? 'yes' : 'no'}`,
    `- Metered: ${lead.hasMetering ? 'yes' : 'no'}`,
    `- Service: ${lead.serviceUrl}`,
    `- Contact hint: ${lead.contactHint}`,
    `- Angle: ${lead.angle}`,
    `- Reasons: ${lead.reasons.join('; ')}`,
  ].join('\n'))

  return [
    `# Pay.sh Prospects - ${RUN_DATE}`,
    ``,
    `Generated from ${CATALOG_URL}. Review each prospect manually before contacting anyone.`,
    ``,
    `Catalog generated at: ${catalog.generated_at}`,
    `Providers: ${catalog.provider_count ?? prospects.length}`,
    ``,
    `Primary proof link: https://tateprograms.com/pay-sh-catalog-pulse.html`,
    `Offer link: https://tateprograms.com/agent-commerce-gate.html`,
    `Sample report: https://tateprograms.com/agent-commerce-sample-report.html`,
    ``,
    ...rows,
    ``,
  ].join('\n')
}

function formatEmailPriority(prospects) {
  return [
    `# Pay.sh Outreach Priority - ${RUN_DATE}`,
    ``,
    `These are not auto-send contacts. Find the current public contact for each target, check for prior contact, then send only if the fit is real.`,
    ``,
    ...prospects.slice(0, 12).map((lead, index) => [
      `## ${index + 1}. ${lead.title}`,
      ``,
      `- Contact hint: ${lead.contactHint}`,
      `- Service URL: ${lead.serviceUrl}`,
      `- Score: ${lead.score}`,
      `- Angle: ${lead.angle}`,
      `- Why: ${lead.reasons.slice(0, 4).join('; ')}`,
      `- Draft: outreach/generated/pay-sh-prospect-messages/${slugify(lead.fqn || lead.title)}.txt`,
      ``,
    ].join('\n')),
    ``,
  ].join('\n')
}

function formatMessage(lead) {
  const priorityReasons = lead.reasons.slice(0, 4).map(reason => `- ${reason}`).join('\n')

  return [
    `To: REVIEW_PUBLIC_CONTACT_FOR_${slugify(lead.title).toUpperCase()}`,
    `Subject: Pay.sh launch-readiness notes for ${lead.title}`,
    ``,
    `Hi ${lead.title} team,`,
    ``,
    `I was mapping the Pay.sh catalog for agent-payment launch controls and ${lead.title} stood out as a high-priority surface.`,
    ``,
    `The public catalog signals I would review before a wider launch are:`,
    priorityReasons,
    ``,
    `I published the current Pay.sh catalog pulse here:`,
    `https://tateprograms.com/pay-sh-catalog-pulse.html`,
    ``,
    `The useful review angle is not "is ${lead.title} broken." It is whether builders can prove quoted price before action, enforceable spend caps outside the prompt, receipts/denials, provider validation, retry handling, and metadata filtering before agents spend through a public demo.`,
    ``,
    `If useful, I can run a focused readiness pass and send back a short report with the spend map, likely control gaps, and patch order.`,
    ``,
    `Best,`,
    `Tate Lyman`,
    `Tate Programs`,
    `https://tateprograms.com`,
    `hello@tateprograms.com`,
    ``,
  ].join('\n')
}

const catalog = await fetchCatalog()
const suppressedEmails = await loadSuppressedEmails()
const contacted = await loadExistingOutreach()

await mkdir(OUTPUT_DIR, { recursive: true })
const allowDraftGeneration = process.env.TATE_MANUAL_OUTREACH_APPROVED === '1'
if (allowDraftGeneration) {
  await mkdir(MESSAGE_DIR, { recursive: true })
}

const prospects = (catalog.providers ?? [])
  .map(provider => analyzeProvider(provider, contacted, suppressedEmails))
  .filter(lead => lead.score >= 34 && !lead.alreadyContacted && !lead.suppressed)
  .sort((a, b) => b.score - a.score || b.endpointCount - a.endpointCount)
  .slice(0, 24)

const jsonPath = `${OUTPUT_DIR}/pay-sh-prospects-${RUN_DATE}.json`
const csvPath = `${OUTPUT_DIR}/pay-sh-prospects-${RUN_DATE}.csv`
const mdPath = `${OUTPUT_DIR}/pay-sh-prospects-${RUN_DATE}.md`
const emailPath = `${OUTPUT_DIR}/pay-sh-email-priority-${RUN_DATE}.md`

const csvHeaders = [
  'score',
  'title',
  'fqn',
  'category',
  'priceRange',
  'endpointCount',
  'hasFreeTier',
  'hasMetering',
  'serviceUrl',
  'contactHint',
  'angle',
  'reasons',
]

await writeFile(jsonPath, `${JSON.stringify(prospects, null, 2)}\n`)
await writeFile(
  csvPath,
  [
    csvHeaders.join(','),
    ...prospects.map(lead => csvHeaders.map(header => csvEscape(lead[header])).join(',')),
  ].join('\n') + '\n',
)
await writeFile(mdPath, formatMarkdown(prospects, catalog))
if (allowDraftGeneration) {
  await writeFile(emailPath, formatEmailPriority(prospects))

  for (const lead of prospects.slice(0, 12)) {
    await writeFile(`${MESSAGE_DIR}/${slugify(lead.fqn || lead.title)}.txt`, formatMessage(lead))
  }
}

console.log(`Fetched ${catalog.provider_count ?? catalog.providers?.length ?? 0} Pay.sh providers.`)
console.log(`Wrote ${prospects.length} prospects:`)
console.log(`- ${jsonPath}`)
console.log(`- ${csvPath}`)
console.log(`- ${mdPath}`)
if (allowDraftGeneration) {
  console.log(`- ${emailPath}`)
  console.log(`- ${MESSAGE_DIR}/`)
} else {
  console.log('Outbound drafts paused; research reports only.')
}
