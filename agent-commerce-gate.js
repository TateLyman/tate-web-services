const fileInput = document.querySelector('#fileInput')
const fileSummary = document.querySelector('#fileSummary')
const pasteInput = document.querySelector('#pasteInput')
const projectName = document.querySelector('#projectName')
const projectUrl = document.querySelector('#projectUrl')
const commerceScore = document.querySelector('#commerceScore')
const commerceTitle = document.querySelector('#commerceTitle')
const commerceSummary = document.querySelector('#commerceSummary')
const commerceFixes = document.querySelector('#commerceFixes')
const commerceSignals = document.querySelector('#commerceSignals')
const copyCommerceResult = document.querySelector('#copyCommerceResult')
const downloadCommerceReport = document.querySelector('#downloadCommerceReport')
const emailCommerceResult = document.querySelector('#emailCommerceResult')
const manualInputs = [
  document.querySelector('#hasSandbox'),
  document.querySelector('#hasSpendCap'),
  document.querySelector('#hasApproval'),
  document.querySelector('#hasReceipt'),
  document.querySelector('#hasFailurePlan'),
]

const fileState = new Map()
const textFilePattern = /\.(?:json|md|txt|ya?ml|js|jsx|ts|tsx|mjs|cjs|css|html|env|toml|lock|gitignore|sol|rs|py|go)$/i
const exactTextFiles = new Set(['dockerfile', 'license', 'security', 'readme', '.gitignore'])

function shouldReadFile(file) {
  const name = file.name.toLowerCase()
  if (file.size > 900_000) {
    return false
  }
  return name.startsWith('.env') || textFilePattern.test(name) || exactTextFiles.has(name)
}

function normalizePath(file) {
  return (file.webkitRelativePath || file.name).replace(/\\/g, '/')
}

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsText(file)
  })
}

async function loadFiles(files) {
  fileState.clear()
  const readable = [...files].filter(shouldReadFile).slice(0, 180)
  await Promise.all(readable.map(async file => {
    fileState.set(normalizePath(file), await readFile(file))
  }))
  const skipped = files.length - readable.length
  fileSummary.textContent = readable.length
    ? `${readable.length} text files loaded${skipped > 0 ? `, ${skipped} skipped` : ''}.`
    : 'No text files loaded. Try selecting package.json, README, payment routes, middleware, or policy docs.'
  updateResult()
}

function parsePastedEntries(text) {
  const sectionPattern = /^---\s*([^-\n][^\n]*?)\s*---\s*$/gm
  const matches = [...text.matchAll(sectionPattern)]
  if (matches.length === 0) {
    return [['pasted-notes.txt', text]]
  }

  const entries = []
  matches.forEach((match, index) => {
    const rawName = match[1].trim()
    const next = matches[index + 1]
    const start = match.index + match[0].length
    const end = next ? next.index : text.length
    const body = text.slice(start, end).trim()
    const name = rawName.replace(/\\/g, '/').replace(/^\.?\//, '') || `pasted-${index + 1}.txt`
    if (body) {
      entries.push([name, body])
    }
  })
  return entries.length ? entries : [['pasted-notes.txt', text]]
}

function getEntries() {
  const entries = [...fileState.entries()]
    .filter(([name]) => !name.toLowerCase().includes('/node_modules/'))
    .sort((a, b) => a[0].length - b[0].length)
  const pasted = pasteInput.value.trim()
  if (pasted) {
    entries.push(...parsePastedEntries(pasted))
  }
  return entries
}

function findFile(entries, predicate) {
  return entries.find(([name]) => predicate(name.toLowerCase()))
}

function findFiles(entries, predicate) {
  return entries.filter(([name]) => predicate(name.toLowerCase()))
}

function hasFile(entries, predicate) {
  return Boolean(findFile(entries, predicate))
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

function getPackage(entries) {
  const packageFile = findFile(entries, name => name === 'package.json' || name.endsWith('/package.json'))
  return packageFile ? parseJson(packageFile[1]) : null
}

function hasDependency(pkg, names) {
  if (!pkg) {
    return false
  }
  const groups = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].filter(Boolean)
  return names.some(name => groups.some(group => Boolean(group[name])))
}

function relativeText(entries) {
  return entries.map(([name, text]) => `\n--- ${name} ---\n${text}`).join('\n')
}

function workflowText(entries) {
  return findFiles(entries, name => name.includes('.github/workflows/') && /\.(?:ya?ml)$/.test(name))
    .map(([, text]) => text)
    .join('\n')
}

function addCheck(checks, check) {
  checks.push(check)
}

function manual(id) {
  return document.querySelector(`#${id}`).checked
}

function analyze() {
  const entries = getEntries()
  if (entries.length === 0) {
    return { checks: [], entries }
  }

  const pkg = getPackage(entries)
  const allText = relativeText(entries)
  const workflows = workflowText(entries)
  const gitignore = findFile(entries, name => name === '.gitignore' || name.endsWith('/.gitignore'))?.[1] || ''
  const checks = []

  const hasX402 = /x402|paymentMiddleware|X-PAYMENT|402 Payment Required|http 402|payment required/i.test(allText)
    || hasDependency(pkg, ['x402', '@coinbase/x402', 'x402-express', 'x402-fetch'])
  const hasAgentPayment = /\b(agentic commerce|agent payments?|machine-to-machine|pay-per-use|micropayment|payment agent|agent wallet|autonomous payment|AP2|A2A)\b/i.test(allText)
  const hasPaymentProvider = hasDependency(pkg, ['stripe', '@stripe/stripe-js', 'viem', 'ethers', '@coinbase/coinbase-sdk', '@coinbase/cdp-sdk'])
    || /\b(stripe|paymentintent|checkout\.sessions|usdc|base|wallet|payTo|paymentHeader|verifyPayment|facilitator)\b/i.test(allText)
  const hasPaymentRail = hasX402 || hasAgentPayment || hasPaymentProvider
  const sandbox = manual('hasSandbox') || /\b(sandbox|testnet|dry[- ]?run|mock payment|zero[- ]?value|local facilitator|test mode|staging)\b/i.test(allText)
  const spendCap = manual('hasSpendCap') || /\b(spend cap|spending limit|budget|allowance|max(?:imum)? amount|maxSpend|maxPayment|quota|daily limit|per[- ]?request limit)\b/i.test(allText)
  const approval = manual('hasApproval') || /\b(approval|approve|confirm purchase|human[- ]?in[- ]?the[- ]?loop|manual review|checkpoint|policy gate|requires confirmation)\b/i.test(allText)
  const receipts = manual('hasReceipt') || /\b(receipt|ledger|audit log|transaction log|payment event|invoice|tx hash|transaction hash|accounting)\b/i.test(allText)
  const failurePlan = manual('hasFailurePlan') || /\b(refund|dispute|failed payment|partial payment|insufficient funds|payment failed|rollback|reversal|expired payment|retry policy)\b/i.test(allText)
  const allowlist = /\b(allowlist|whitelist|denylist|blocklist|recipient validation|payTo|payee|merchant id|address validation|sanction|ofac|trusted recipient)\b/i.test(allText)
  const replay = /\b(idempotency|idempotent|nonce|replay|timestamp|expires|ttl|dedupe|deduplicate|request id)\b/i.test(allText)
  const signature = /\b(signature|verifyPayment|constructEvent|webhook secret|stripe-signature|x-signature|hmac|jwt verify|signed payload)\b/i.test(allText)
  const rateLimit = /\b(rate limit|ratelimit|throttle|quota|usage cap|429|retry-after|cost guard)\b/i.test(allText)
  const observability = /\b(metrics|monitoring|alert|trace|span|dashboard|event log|status page|webhook event)\b/i.test(allText)
  const docs = /\b(readme|architecture|threat model|security|permissions|policy|runbook|operations)\b/i.test(allText)
  const envUsage = /\bprocess\.env\.|import\.meta\.env\.|NEXT_PUBLIC_|VITE_|STRIPE_|CDP_|COINBASE_|WALLET_|PRIVATE_KEY/i.test(allText)
  const envExample = hasFile(entries, name => /(?:^|\/)\.env\.example$/.test(name))
  const publicPrivateName = /\b(?:NEXT_PUBLIC|VITE)_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE|SERVICE|WEBHOOK|ADMIN|KEY|WALLET)\b/.test(allText)
  const hardcodedSecret = /\bsk_live_[A-Za-z0-9]{12,}\b|(?:private[_-]?key|api[_-]?key|secret|token|seed phrase)\s*[:=]\s*['"][A-Za-z0-9_\-.]{28,}['"]/i.test(allText)
  const npmTokenPublish = /\b(?:NPM_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG__AUTH|_authToken)\b|secrets\.[A-Z0-9_]*NPM[A-Z0-9_]*/i.test(workflows)
  const hasMcp = /mcpServers|@modelcontextprotocol|Model Context Protocol|tools\/list|claude mcp|codex mcp/i.test(allText)
  const mcpBoundary = !hasMcp || /\b(read-only|write access|destructive|permission|least privilege|tool scope|requires approval|user consent)\b/i.test(allText)
  const dataProvenance = /\b(data source|provenance|source url|terms|licensed data|public data|robots|retention|consent|privacy)\b/i.test(allText)

  addCheck(checks, {
    group: 'Payment rail',
    label: 'Payment or agent-commerce rail is visible',
    ok: hasPaymentRail,
    weight: 9,
    fix: 'Show the payment rail clearly: x402 middleware, payment headers, API checkout, wallet flow, or provider integration.',
  })
  addCheck(checks, {
    group: 'Payment rail',
    label: 'x402 or HTTP 402 flow is explicit when claimed',
    ok: !/x402|402|payment required/i.test(allText) || hasX402,
    weight: 7,
    fix: 'If claiming x402, include the HTTP 402 challenge, payment header, verifier/facilitator path, and expected response flow.',
  })
  addCheck(checks, {
    group: 'Payment rail',
    label: 'Sandbox, testnet, dry-run, or zero-value mode exists',
    ok: sandbox,
    weight: 8,
    fix: 'Add a sandbox, testnet, dry-run, mock-payment, or zero-value demo mode before showing autonomous payments.',
  })
  addCheck(checks, {
    group: 'Control plane',
    label: 'Autonomous spending has caps',
    ok: spendCap,
    weight: 10,
    fix: 'Add per-action, per-session, and daily spend caps before any agent can initiate payment.',
  })
  addCheck(checks, {
    group: 'Control plane',
    label: 'Human approval checkpoint exists for higher-risk payments',
    ok: approval,
    weight: 10,
    fix: 'Require explicit approval for new merchants, large amounts, recurring spend, or ambiguous agent intent.',
  })
  addCheck(checks, {
    group: 'Control plane',
    label: 'Recipient or merchant validation is documented',
    ok: allowlist,
    weight: 8,
    fix: 'Validate payees with an allowlist, trusted merchant registry, address validation, or compliance screen.',
  })
  addCheck(checks, {
    group: 'Control plane',
    label: 'Replay and duplicate payment protection exists',
    ok: replay,
    weight: 8,
    fix: 'Add idempotency keys, nonces, expirations, or request IDs to stop duplicate or replayed payments.',
  })
  addCheck(checks, {
    group: 'Auditability',
    label: 'Receipts or ledger events are written',
    ok: receipts,
    weight: 9,
    fix: 'Write a receipt or audit event for every proposed, approved, failed, and completed payment.',
  })
  addCheck(checks, {
    group: 'Auditability',
    label: 'Failure, refund, dispute, or partial-payment states are handled',
    ok: failurePlan,
    weight: 7,
    fix: 'Document and implement failed-payment, refund, dispute, partial-payment, expiration, and retry behavior.',
  })
  addCheck(checks, {
    group: 'Auditability',
    label: 'Payment status is observable',
    ok: observability,
    weight: 5,
    fix: 'Add payment status logs, metrics, alerts, traces, or a simple event dashboard.',
  })
  addCheck(checks, {
    group: 'Security',
    label: 'Payment signatures or webhooks are verified',
    ok: !hasPaymentProvider || signature,
    weight: 8,
    fix: 'Verify payment signatures, webhook signatures, signed payloads, or facilitator responses before trusting payment state.',
  })
  addCheck(checks, {
    group: 'Security',
    label: 'Rate limits and cost guardrails are present',
    ok: rateLimit,
    weight: 7,
    fix: 'Add rate limits, quotas, or usage caps so one agent loop cannot burn unlimited paid calls.',
  })
  addCheck(checks, {
    group: 'Security',
    label: 'No public env var name looks private',
    ok: !publicPrivateName,
    weight: 8,
    fix: 'Rename public frontend env vars that include SECRET, TOKEN, PRIVATE, SERVICE, WEBHOOK, ADMIN, KEY, or WALLET.',
  })
  addCheck(checks, {
    group: 'Security',
    label: 'No obvious private secret appears in uploaded text',
    ok: !hardcodedSecret,
    weight: 10,
    fix: 'Remove hardcoded API keys, private keys, wallet secrets, provider tokens, and live payment secrets, then rotate exposed values.',
  })
  addCheck(checks, {
    group: 'Security',
    label: 'Environment variables have an example file',
    ok: !envUsage || envExample,
    weight: 5,
    fix: 'Add .env.example with placeholder names for required payment, wallet, provider, and webhook variables.',
  })
  addCheck(checks, {
    group: 'Security',
    label: '.gitignore blocks local secrets',
    ok: !envUsage || (/\.env\b/.test(gitignore) && /node_modules/.test(gitignore)),
    weight: 5,
    fix: 'Add .env and node_modules to .gitignore before sharing or submitting the repo.',
  })
  addCheck(checks, {
    group: 'Agent boundary',
    label: 'MCP/tool permissions are scoped when agent tools are used',
    ok: mcpBoundary,
    weight: 8,
    fix: 'Document which agent tools can read, write, call networks, or initiate payments, and which require user consent.',
  })
  addCheck(checks, {
    group: 'Agent boundary',
    label: 'Data provenance or usage policy is visible',
    ok: dataProvenance,
    weight: 6,
    fix: 'Document data sources, retention, privacy, and usage rights for paid web/API data used by the agent.',
  })
  addCheck(checks, {
    group: 'Launch proof',
    label: 'Docs explain the payment control plane',
    ok: docs && (spendCap || approval || receipts),
    weight: 7,
    fix: 'Add README or architecture docs explaining the payment rail, spending policy, approval path, and audit evidence.',
  })
  addCheck(checks, {
    group: 'Launch proof',
    label: 'Publishing workflow avoids long-lived npm tokens',
    ok: !npmTokenPublish,
    weight: 4,
    fix: 'Avoid long-lived publish tokens in workflows; use trusted publishing/OIDC where possible.',
  })

  return { checks, entries }
}

function summarize(checks) {
  const total = checks.reduce((sum, check) => sum + check.weight, 0)
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0)
  const score = total ? Math.round((earned / total) * 100) : 0
  const missing = checks.filter(check => !check.ok).sort((a, b) => b.weight - a.weight)
  const groups = [...new Set(checks.map(check => check.group))]
    .map(group => {
      const groupChecks = checks.filter(check => check.group === group)
      const groupTotal = groupChecks.reduce((sum, check) => sum + check.weight, 0)
      const groupEarned = groupChecks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0)
      return { group, score: groupTotal ? Math.round((groupEarned / groupTotal) * 100) : 0 }
    })
  return { score, missing, groups }
}

function rating(score, entries) {
  if (entries.length === 0 && !pasteInput.value.trim()) {
    return {
      title: 'No project loaded',
      summary: 'Load files or paste project text to score the payment-agent control plane.',
    }
  }
  if (score >= 88) {
    return {
      title: 'Control plane looks credible',
      summary: 'The launch evidence covers payment rail, spending controls, auditability, and abuse limits. Tighten the demo story and external review path next.',
    }
  }
  if (score >= 72) {
    return {
      title: 'Promising, but payment trust is incomplete',
      summary: 'The prototype has useful evidence, but missing controls could block a serious demo, sponsor review, or user-facing launch.',
    }
  }
  if (score >= 48) {
    return {
      title: 'Agent-payment risks are still visible',
      summary: 'The payment loop may work, but spend caps, approval checkpoints, receipts, or security boundaries need sharper proof.',
    }
  }
  return {
    title: 'Do not put real value through this yet',
    summary: 'Start with sandbox mode, spend caps, approval checkpoints, replay protection, signature verification, and receipts.',
  }
}

function renderSignals(groups) {
  commerceSignals.replaceChildren()
  for (const item of groups) {
    const row = document.createElement('div')
    row.className = 'signal-row'
    const name = document.createElement('span')
    name.textContent = item.group
    const value = document.createElement('strong')
    value.textContent = `${item.score}%`
    row.append(name, value)
    commerceSignals.append(row)
  }
}

function reportModel() {
  const { checks, entries } = analyze()
  const summary = summarize(checks)
  const copy = rating(summary.score, entries)
  return { checks, entries, summary, copy }
}

function formatReportDate() {
  return new Date().toLocaleString(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function topRiskLine(missing) {
  if (missing.length === 0) {
    return 'No major agent-commerce control gaps were detected by this browser check.'
  }
  return missing.slice(0, 4).map(check => check.label.toLowerCase()).join(', ')
}

function resultText() {
  const { entries, summary } = reportModel()
  const title = projectName.value.trim() || 'Agent-commerce project'
  const url = projectUrl.value.trim() || 'No URL provided'
  const files = entries.length ? entries.map(([name]) => name).slice(0, 12).join(', ') : 'No files loaded'
  const fixes = summary.missing.slice(0, 8).map((check, index) => `${index + 1}. ${check.fix}`).join('\n') || 'No major agent-commerce control gaps detected by the browser check.'

  return `${title} agent commerce gate
URL: ${url}
Score: ${summary.score}/100
Files reviewed: ${files}

Priority fixes:
${fixes}

Prepared with Agent Commerce Gate by Tate Programs.`
}

function markdownReport() {
  const { checks, entries, summary, copy } = reportModel()
  const title = projectName.value.trim() || 'Agent-commerce project'
  const url = projectUrl.value.trim() || 'No URL provided'
  const files = entries.map(([name]) => name)
  const groupList = summary.groups.length
    ? summary.groups.map(group => `- ${group.group}: ${group.score}%`).join('\n')
    : '- No signal groups scored yet.'
  const fileList = files.length
    ? files.slice(0, 28).map(name => `- \`${name}\``).join('\n')
    : '- No files were loaded.'
  const extraFileNote = files.length > 28 ? `\n- ${files.length - 28} additional files reviewed.` : ''
  const fixList = summary.missing.length
    ? summary.missing.slice(0, 12).map((check, index) => `${index + 1}. ${check.fix}`).join('\n')
    : 'No major agent-commerce control gaps detected by the browser check.'
  const checkList = checks.length
    ? checks.map(check => `- [${check.ok ? 'pass' : 'fix'}] ${check.group}: ${check.label}`).join('\n')
    : '- No checks ran.'

  return `# ${title} Agent Commerce Gate Report

Generated: ${formatReportDate()}
Prepared with: Agent Commerce Gate by Tate Programs

## Verdict

Score: ${summary.score}/100
Status: ${copy.title}
Project URL: ${url}

${copy.summary}

Highest-risk areas: ${topRiskLine(summary.missing)}

## Signal Scores

${groupList}

## Priority Fix Queue

${fixList}

## Files Reviewed

${fileList}${extraFileNote}

## Full Check Log

${checkList}

## Launch Note

This report is a readiness review for agent-payment control surfaces. It is not financial, legal, tax, compliance, or security certification.
`
}

function reportFileName() {
  const base = projectName.value.trim() || 'agent-commerce-gate'
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${safe || 'agent-commerce-gate'}-gate-report.md`
}

function downloadMarkdownReport() {
  const blob = new Blob([markdownReport()], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = reportFileName()
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function updateResult() {
  const { summary, copy } = reportModel()
  commerceScore.textContent = String(summary.score)
  commerceTitle.textContent = copy.title
  commerceSummary.textContent = copy.summary
  renderSignals(summary.groups)

  commerceFixes.replaceChildren()
  const fixes = summary.missing.slice(0, 8)
  if (fixes.length === 0) {
    const item = document.createElement('li')
    item.textContent = summary.score > 0 ? 'No major agent-commerce control gaps detected by the browser check.' : 'Load files to generate the first fix queue.'
    commerceFixes.append(item)
  }
  else {
    for (const check of fixes) {
      const item = document.createElement('li')
      item.textContent = check.fix
      commerceFixes.append(item)
    }
  }

  const emailBody = encodeURIComponent(`${resultText()}\n\nI want help turning this into a safer launch packet.`)
  emailCommerceResult.href = `mailto:hello@tateprograms.com?subject=Agent%20Commerce%20Gate%20result&body=${emailBody}`
}

fileInput.addEventListener('change', event => {
  const files = event.target.files || []
  loadFiles(files).catch(() => {
    fileSummary.textContent = 'Could not read one or more files. Try selecting fewer text files.'
  })
})

pasteInput.addEventListener('input', updateResult)
projectName.addEventListener('input', updateResult)
projectUrl.addEventListener('input', updateResult)
for (const input of manualInputs) {
  input.addEventListener('input', updateResult)
}

copyCommerceResult.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultText())
    copyCommerceResult.textContent = 'Copied'
    window.setTimeout(() => {
      copyCommerceResult.textContent = 'copy result'
    }, 1600)
  }
  catch {
    copyCommerceResult.textContent = 'Select manually'
    window.setTimeout(() => {
      copyCommerceResult.textContent = 'copy result'
    }, 1600)
  }
})

downloadCommerceReport.addEventListener('click', () => {
  downloadMarkdownReport()
  downloadCommerceReport.textContent = 'downloaded'
  window.setTimeout(() => {
    downloadCommerceReport.textContent = 'download .md'
  }, 1600)
})

updateResult()
