const fields = {
  projectName: document.querySelector('#projectName'),
  projectUrl: document.querySelector('#projectUrl'),
  primaryRail: document.querySelector('#primaryRail'),
  routeCount: document.querySelector('#routeCount'),
  launchStage: document.querySelector('#launchStage'),
  sessionCap: document.querySelector('#sessionCap'),
  currency: document.querySelector('#currency'),
  hasManifest: document.querySelector('#hasManifest'),
  hasLive402: document.querySelector('#hasLive402'),
  hasBrowserCors: document.querySelector('#hasBrowserCors'),
  hasCachePolicy: document.querySelector('#hasCachePolicy'),
  hasResourceEcho: document.querySelector('#hasResourceEcho'),
  hasSpendCap: document.querySelector('#hasSpendCap'),
  hasRecipientAllowlist: document.querySelector('#hasRecipientAllowlist'),
  hasReplayControl: document.querySelector('#hasReplayControl'),
  hasSettlementPlan: document.querySelector('#hasSettlementPlan'),
  hasMetadataFilter: document.querySelector('#hasMetadataFilter'),
  hasReceipts: document.querySelector('#hasReceipts'),
  goalText: document.querySelector('#goalText'),
}

const reviewScore = document.querySelector('#reviewScore')
const reviewTitle = document.querySelector('#reviewTitle')
const reviewSummary = document.querySelector('#reviewSummary')
const reviewSignals = document.querySelector('#reviewSignals')
const scopeOutput = document.querySelector('#scopeOutput')
const copyScope = document.querySelector('#copyScope')
const downloadScope = document.querySelector('#downloadScope')
const emailScope = document.querySelector('#emailScope')

const railLabels = {
  x402: 'x402',
  agentcore: 'AWS AgentCore Payments + x402',
  mpp: 'Machine Payments Protocol',
  'pay-sh': 'Pay.sh / gateway-402',
  'cloudflare-worker': 'Cloudflare Worker paid route',
  mixed: 'mixed rails',
}

const stageLabels = {
  prelaunch: 'prelaunch',
  'public-demo': 'public demo',
  production: 'production or paid users',
}

function numericValue(input, fallback = 0) {
  const parsed = Number.parseFloat(input?.value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function addFinding(findings, id, label, severity, fix) {
  findings.push({ id, label, severity, fix })
}

function firstLine(value, fallback) {
  const line = String(value ?? '').trim().split('\n').map(item => item.trim()).find(Boolean)
  return line || fallback
}

function buildReview() {
  const project = fields.projectName.value.trim() || 'Agent payment launch'
  const url = fields.projectUrl.value.trim() || 'not provided yet'
  const rail = fields.primaryRail.value
  const routeCount = Math.max(0, Math.round(numericValue(fields.routeCount)))
  const stage = fields.launchStage.value
  const sessionCap = numericValue(fields.sessionCap)
  const currency = fields.currency.value.trim().toUpperCase() || 'USDC'
  const goal = firstLine(fields.goalText.value, 'private launch review before real payment-agent usage')
  const findings = []

  if (!fields.hasManifest.checked) {
    addFinding(findings, 'missing-public-catalog', 'No public route catalog', 10, 'Publish or share a manifest, OpenAPI spec, PR, endpoint list, or docs URL before review.')
  }
  if (!fields.hasLive402.checked) {
    addFinding(findings, 'missing-no-payment-402', 'No no-payment 402 evidence', 14, 'Confirm paid routes return structured payment challenges before any payment header is sent.')
  }
  if (!fields.hasBrowserCors.checked) {
    addFinding(findings, 'browser-payment-cors', 'Browser payment path may be blocked', 9, 'Check OPTIONS and actual 402 responses for payment headers, exposed headers, and readable challenge bodies.')
  }
  if (!fields.hasCachePolicy.checked) {
    addFinding(findings, 'cache-policy-missing', 'Payment cache policy is not explicit', 9, 'Add or document no-store/private policy on challenges and prevent shared-cache paid responses.')
  }
  if (!fields.hasResourceEcho.checked) {
    addFinding(findings, 'resource-binding-missing', 'Resource binding is unclear', 8, 'Make challenge resource URLs exactly match the paid route and method being requested.')
  }
  if (!fields.hasSpendCap.checked || sessionCap <= 0) {
    addFinding(findings, 'spend-cap-missing', 'Spend cap is not enforceable', 16, 'Set session and per-call caps outside the prompt and deny when exceeded.')
  }
  if (sessionCap > 50 && stage !== 'production') {
    addFinding(findings, 'demo-cap-high', 'Demo spend cap is high', 6, 'Use a low demo cap until receipts and denial paths are clean.')
  }
  if (!fields.hasRecipientAllowlist.checked) {
    addFinding(findings, 'recipient-allowlist-missing', 'Recipient allowlist missing', 12, 'Allowlist recipients, networks, assets, facilitators, and any wallet/payment instrument used by the agent.')
  }
  if (!fields.hasReplayControl.checked) {
    addFinding(findings, 'replay-idempotency-missing', 'Replay and idempotency controls missing', 12, 'Bind request ids, reject duplicate payment payloads, and document retry behavior.')
  }
  if (!fields.hasSettlementPlan.checked) {
    addFinding(findings, 'settlement-plan-missing', 'Settlement/reconciliation plan missing', 10, 'Define finality assumptions, failed-payment states, refunds, and ledger reconciliation.')
  }
  if (!fields.hasMetadataFilter.checked) {
    addFinding(findings, 'metadata-filter-missing', 'Metadata filter missing', 10, 'Strip prompt text, private query strings, user ids, emails, and secret-like values from payment metadata.')
  }
  if (!fields.hasReceipts.checked) {
    addFinding(findings, 'receipt-evidence-missing', 'Receipt evidence missing', 9, 'Store receipts, denials, retries, trace ids, and refund/dispute states.')
  }

  if (rail === 'agentcore' && !fields.hasRecipientAllowlist.checked) {
    addFinding(findings, 'agentcore-payment-connection-policy', 'AgentCore payment connection policy needs review', 6, 'Map payment connections, payment instruments, funded sessions, and recipient rules before launch.')
  }
  if (rail === 'cloudflare-worker' && !fields.hasCachePolicy.checked) {
    addFinding(findings, 'worker-cache-boundary', 'Worker cache boundary needs review', 6, 'Confirm the Worker never caches paid grants and that payment challenges are explicitly private/no-store.')
  }
  if (routeCount > 10 && !fields.hasManifest.checked) {
    addFinding(findings, 'many-routes-no-catalog', 'Many routes without a catalog', 8, 'Create a route inventory so the review can sample intentionally instead of guessing.')
  }

  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + finding.severity, 0))
  const recommended = getRecommendation({ routeCount, stage, findings, rail })
  const output = renderScope({ project, url, rail, routeCount, stage, sessionCap, currency, goal, findings, score, recommended })

  return { project, url, rail, routeCount, stage, findings, score, recommended, output }
}

function getRecommendation({ routeCount, stage, findings, rail }) {
  const highRisk = findings.filter(finding => finding.severity >= 12).length
  if (stage === 'production' || routeCount > 12 || rail === 'mixed') {
    return {
      label: 'Production payment-surface review',
      price: '$299+ after scope',
      timeline: '2-4 days',
      reason: 'Multiple routes, production exposure, or mixed rails need sampling plus policy and evidence review.',
    }
  }
  if (highRisk >= 3 || routeCount > 5) {
    return {
      label: 'Route bundle launch review',
      price: '$299 after scope',
      timeline: '48-72 hours',
      reason: 'Several launch blockers or routes need a fuller route map and patch order.',
    }
  }
  return {
    label: 'Private launch review',
    price: '$149',
    timeline: '48 hours',
    reason: 'A focused single-surface pass should be enough to produce a spend map and patch order.',
  }
}

function renderScope({ project, url, rail, routeCount, stage, sessionCap, currency, goal, findings, score, recommended }) {
  const topFindings = findings.length
    ? findings
      .slice()
      .sort((a, b) => b.severity - a.severity)
      .map((finding, index) => `${index + 1}. ${finding.label}: ${finding.fix}`)
      .join('\n')
    : '1. No obvious launch blockers from the intake. Run a no-payment surface check and attach the output.'

  const included = [
    'No-payment x402/MPP/402 surface pass against public docs or sampled paid routes.',
    'Browser payment-header path check for preflight and actual 402 readability.',
    'Cache-control and Vary review for challenge responses and paid-response boundaries.',
    'Spend map covering session cap, per-call cap, recipients, networks, assets, and approval gates.',
    'Replay/idempotency, settlement, failed-payment, and receipt evidence review.',
    'Metadata boundary pass for prompts, query strings, user identifiers, and receipt fields.',
    'Ranked private patch order with public-framing notes only if mutually useful.',
  ].join('\n- ')

  return `Agent payment launch review scope

Project: ${project}
URL/docs/repo: ${url}
Primary rail: ${railLabels[rail] ?? rail}
Launch stage: ${stageLabels[stage] ?? stage}
Paid route count: ${routeCount}
Max session spend: ${sessionCap || 'not set'} ${currency}
Goal: ${goal}

Recommended scope: ${recommended.label}
Estimated price: ${recommended.price}
Expected turnaround: ${recommended.timeline}
Reason: ${recommended.reason}
Intake score: ${score}/100

Included deliverables:
- ${included}

First patch order from intake:
${topFindings}

Useful attachments:
- manifest, OpenAPI spec, or endpoint list
- public PR/listing if one exists
- output from: npx --yes x402-surface-check --strict-cache <manifest-or-endpoint>
- payment policy JSON from https://tateprograms.com/agentcore-payment-policy.html

Privacy/publication boundary:
Findings should be shared privately first. Public writeups or positive proof cards should only happen with mutual sign-off on facts and framing.
`
}

function render() {
  const review = buildReview()
  reviewScore.textContent = String(review.score)
  reviewTitle.textContent = review.recommended.label
  reviewSummary.textContent = `${review.recommended.price} / ${review.recommended.timeline}. ${review.findings.length} intake gap${review.findings.length === 1 ? '' : 's'} found.`
  scopeOutput.value = review.output

  const mailtoBody = encodeURIComponent(review.output)
  const subject = encodeURIComponent(`Agent payment launch review - ${review.project}`)
  emailScope.href = `mailto:hello@tateprograms.com?subject=${subject}&body=${mailtoBody}`

  reviewSignals.replaceChildren()
  const signals = review.findings.length
    ? review.findings.slice().sort((a, b) => b.severity - a.severity)
    : [{ id: 'ready', label: 'Core controls represented', fix: 'Attach the strict-cache surface-check output and policy JSON for review.' }]

  for (const signal of signals.slice(0, 8)) {
    const item = document.createElement('article')
    const title = document.createElement('strong')
    const body = document.createElement('span')
    title.textContent = signal.label
    body.textContent = signal.fix
    item.append(title, body)
    reviewSignals.append(item)
  }
}

function download(filename, content, type = 'text/markdown') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

for (const field of Object.values(fields)) {
  field?.addEventListener('input', render)
  field?.addEventListener('change', render)
}

copyScope?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(scopeOutput.value)
    copyScope.textContent = 'copied'
  }
  catch {
    scopeOutput.focus()
    scopeOutput.select()
    copyScope.textContent = 'selecting'
  }
  setTimeout(() => {
    copyScope.textContent = 'copy scope'
  }, 1200)
})

downloadScope?.addEventListener('click', () => {
  const slug = (fields.projectName.value || 'agent-payment-launch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  download(`${slug || 'agent-payment-launch'}-review-scope.md`, `${scopeOutput.value}\n`)
})

render()
