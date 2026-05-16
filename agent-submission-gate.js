const fileInput = document.querySelector('#fileInput')
const fileSummary = document.querySelector('#fileSummary')
const pasteInput = document.querySelector('#pasteInput')
const projectName = document.querySelector('#projectName')
const projectUrl = document.querySelector('#projectUrl')
const eventFocus = document.querySelector('#eventFocus')
const submissionScore = document.querySelector('#submissionScore')
const submissionTitle = document.querySelector('#submissionTitle')
const submissionSummary = document.querySelector('#submissionSummary')
const submissionFixes = document.querySelector('#submissionFixes')
const signalList = document.querySelector('#signalList')
const copySubmissionResult = document.querySelector('#copySubmissionResult')
const downloadSubmissionReport = document.querySelector('#downloadSubmissionReport')
const emailSubmissionResult = document.querySelector('#emailSubmissionResult')

const manualInputs = [
  document.querySelector('#hasDemoUrl'),
  document.querySelector('#hasVideo'),
  document.querySelector('#hasEligibility'),
  document.querySelector('#hasJudgeCopy'),
  document.querySelector('#hasEvalProof'),
  document.querySelector('#hasSafeMode'),
]

const fileState = new Map()
const textFilePattern = /\.(?:json|md|txt|ya?ml|js|jsx|ts|tsx|mjs|cjs|css|html|toml|lock|gitignore)$/i
const exactTextFiles = new Set(['dockerfile', 'license', 'security', 'readme', '.gitignore', 'agents.md', 'claude.md'])

function shouldReadFile(file) {
  const name = file.name.toLowerCase()
  if (file.size > 900_000) {
    return false
  }
  return textFilePattern.test(name) || exactTextFiles.has(name)
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
    : 'No text files loaded. Try a repo folder, README, package.json, OpenAPI, server.json, policy file, or submission copy.'
  updateResult()
}

function parsePastedEntries(text) {
  const sectionPattern = /^---\s*([^-\n][^\n]*?)\s*---\s*$/gm
  const matches = [...text.matchAll(sectionPattern)]
  if (matches.length === 0) {
    return [['pasted-submission.txt', text]]
  }
  const entries = []
  matches.forEach((match, index) => {
    const next = matches[index + 1]
    const start = match.index + match[0].length
    const end = next ? next.index : text.length
    const name = match[1].trim().replace(/\\/g, '/').replace(/^\.?\//, '') || `pasted-${index + 1}.txt`
    const body = text.slice(start, end).trim()
    if (body) {
      entries.push([name, body])
    }
  })
  return entries.length ? entries : [['pasted-submission.txt', text]]
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

function parseJson(text) {
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

function findFile(entries, predicate) {
  return entries.find(([name]) => predicate(name.toLowerCase()))
}

function findFiles(entries, predicate) {
  return entries.filter(([name]) => predicate(name.toLowerCase()))
}

function getReadme(entries) {
  return findFile(entries, name => name === 'readme.md' || name.endsWith('/readme.md'))?.[1] || ''
}

function getPackage(entries) {
  const file = findFile(entries, name => name === 'package.json' || name.endsWith('/package.json'))
  return file ? parseJson(file[1]) : null
}

function hasFile(entries, predicate) {
  return Boolean(findFile(entries, predicate))
}

function allText(entries) {
  return entries.map(([name, text]) => `\n--- ${name} ---\n${text}`).join('\n')
}

function hasDependency(pkg, names) {
  if (!pkg) {
    return false
  }
  const groups = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].filter(Boolean)
  return names.some(name => groups.some(group => Boolean(group[name])))
}

function dependencyVersions(pkg) {
  if (!pkg) {
    return []
  }
  return [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]
    .filter(Boolean)
    .flatMap(group => Object.entries(group))
}

function hasLooseDependencies(pkg) {
  return dependencyVersions(pkg).some(([, version]) => {
    const normalized = String(version).trim().toLowerCase()
    return normalized === '*' || normalized === 'latest' || normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('git+')
  })
}

function addCheck(checks, check) {
  checks.push(check)
}

function addSignal(signals, label, ok) {
  if (ok) {
    signals.push(label)
  }
}

function analyze() {
  const entries = getEntries()
  if (entries.length === 0) {
    return { checks: [], signals: [], entries }
  }

  const pkg = getPackage(entries)
  const readme = getReadme(entries)
  const text = allText(entries)
  const checks = []
  const signals = []
  const scripts = pkg?.scripts || {}
  const workflows = findFiles(entries, name => name.includes('.github/workflows/') && /\.(?:ya?ml)$/.test(name))
    .map(([, body]) => body)
    .join('\n')
  const hasCi = workflows.length > 0
  const hasBuild = Boolean(scripts.build)
  const hasTest = Boolean(scripts.test)
  const hasLockfile = hasFile(entries, name => /(?:^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(name))
  const hasLicense = Boolean(pkg?.license) || hasFile(entries, name => /(?:^|\/)(license|license\.md|license\.txt)$/i.test(name))
  const hasServerJson = hasFile(entries, name => name === 'server.json' || name.endsWith('/server.json'))
  const hasOpenApi = /openapi["']?\s*:\s*["']?3\.|swagger["']?\s*:\s*["']?2\.|paths\s*:\s*\{/i.test(text)
  const hasMcp = hasServerJson || hasDependency(pkg, ['@modelcontextprotocol/sdk']) || /\bMCP\b|model context protocol|tools\/list|server\.json/i.test(text)
  const hasPayments = /\bx402\b|pay\.sh|payai|payment required|X-PAYMENT|PAYMENT-REQUIRED|wallet|usdc|spend cap|budget/i.test(text)
  const hasBrowserAgent = hasDependency(pkg, ['playwright', 'puppeteer']) || /\bplaywright\b|\bpuppeteer\b|browser automation|computer use|screenshot/i.test(text)
  const hasEval = /\beval(?:s|uation)?\b|benchmark|test case|golden|fixture|scorecard|rubric|before\/after|acceptance/i.test(text)
  const hasAudit = /\baudit\b|trace|receipt|event log|ledger|observability|telemetry|span|run id|request id/i.test(text)
  const hasPolicy = /\bpolicy\b|allowlist|denylist|permission|scope|human review|approval|rate limit|quota|cap\b|guardrail/i.test(text)
  const hasDemo = /demo|screenshot|video|walkthrough|hosted|deployed|pages|vercel|netlify|render\.com/i.test(text)
  const hasSubmissionCopy = /problem|user|why|built|architecture|impact|what it does|how it works/i.test(readme + '\n' + pasteInput.value)
  const hasEligibilityNote = /eligib|rules|age|resident|team|terms|deadline|submission/i.test(text)
  const riskyEnv = /\b(?:api[_-]?key|secret|token|private[_-]?key|mnemonic|seed)\s*[:=]\s*['"][A-Za-z0-9_\-.]{24,}['"]/i.test(text)
  const publicSecretName = /\b(?:NEXT_PUBLIC|VITE)_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE|ADMIN|WEBHOOK|KEY)\b/i.test(text)
  const userProjectUrl = projectUrl.value.trim()
  const focus = eventFocus.value

  addSignal(signals, 'MCP/tool surface', hasMcp)
  addSignal(signals, 'x402/payment surface', hasPayments)
  addSignal(signals, 'browser execution', hasBrowserAgent)
  addSignal(signals, 'OpenAPI or machine-readable routes', hasOpenApi)
  addSignal(signals, 'evaluation evidence', hasEval)
  addSignal(signals, 'audit or receipt trail', hasAudit)
  addSignal(signals, 'policy/permission controls', hasPolicy)
  addSignal(signals, 'demo media path', hasDemo || document.querySelector('#hasDemoUrl').checked || document.querySelector('#hasVideo').checked)

  addCheck(checks, {
    group: 'Submission proof',
    label: 'README or submission draft explains the problem, user, and outcome',
    ok: readme.length >= 500 && hasSubmissionCopy || document.querySelector('#hasJudgeCopy').checked,
    weight: 10,
    fix: 'Write a judge-facing first screen: problem, user, why an agent is needed, what works now, and what the demo proves.',
  })
  addCheck(checks, {
    group: 'Submission proof',
    label: 'Demo URL, screenshots, or hosted walkthrough are present',
    ok: Boolean(userProjectUrl) || hasDemo || document.querySelector('#hasDemoUrl').checked,
    weight: 10,
    fix: 'Add a public demo, screenshots, or a short hosted walkthrough so reviewers do not have to infer the product from code.',
  })
  addCheck(checks, {
    group: 'Submission proof',
    label: 'Short demo video or recording plan is ready',
    ok: document.querySelector('#hasVideo').checked || /(?:loom|youtube|youtu\.be|demo video|walkthrough video|recording|mp4)/i.test(text),
    weight: 8,
    fix: 'Record a 60-120 second walkthrough: problem, live action, evidence panel, and one risk boundary.',
  })
  addCheck(checks, {
    group: 'Eligibility',
    label: 'Event rules and eligibility are truthfully checked',
    ok: document.querySelector('#hasEligibility').checked || hasEligibilityNote,
    weight: 9,
    fix: 'Add a private pre-submit note with event URL, deadline, team members, age/residency rules, and prize eligibility. Do not guess.',
  })
  addCheck(checks, {
    group: 'Build trail',
    label: 'Build and test commands are repeatable',
    ok: Boolean(pkg) && hasBuild && hasTest || hasCi,
    weight: 9,
    fix: 'Add npm scripts or CI showing how to install, build, test, and run the demo from a clean checkout.',
  })
  addCheck(checks, {
    group: 'Build trail',
    label: 'Dependency and ownership metadata are present',
    ok: Boolean(pkg) && hasLockfile && hasLicense,
    weight: 6,
    fix: 'Commit the lockfile and add license/ownership metadata before submitting or sharing the repo.',
  })
  addCheck(checks, {
    group: 'Build trail',
    label: 'Dependency versions are pinned enough to replay',
    ok: Boolean(pkg) && !hasLooseDependencies(pkg),
    weight: 5,
    fix: 'Replace latest, wildcard, URL, or git dependency versions with pinned semver ranges before a judge or buyer reruns the project.',
  })
  addCheck(checks, {
    group: 'Agent surface',
    label: 'Tool/API surface is machine-readable',
    ok: hasMcp || hasOpenApi || /AGENTS\.md|llms\.txt|tool manifest|schema/i.test(text),
    weight: 9,
    fix: 'Expose the agent surface through MCP metadata, OpenAPI, a tool manifest, AGENTS.md, or clear schema docs.',
  })
  addCheck(checks, {
    group: 'Agent surface',
    label: 'Permissions and risky actions are bounded',
    ok: hasPolicy || document.querySelector('#hasSafeMode').checked,
    weight: 10,
    fix: 'Document tool scopes, destructive-action gates, rate limits, human review, and what the demo is not allowed to do.',
  })
  addCheck(checks, {
    group: 'Agent surface',
    label: 'Eval, test log, or before/after evidence exists',
    ok: hasEval || document.querySelector('#hasEvalProof').checked,
    weight: 9,
    fix: 'Add a small eval table or test log showing tasks, expected behavior, actual behavior, and known misses.',
  })
  addCheck(checks, {
    group: 'Agent surface',
    label: 'Audit trail or receipt evidence is visible',
    ok: hasAudit,
    weight: 7,
    fix: 'Show request ids, tool calls, decisions, receipts, or event logs so the agent behavior can be inspected after the demo.',
  })
  addCheck(checks, {
    group: 'Payment/control',
    label: 'Payment or paid-API builds have spend controls',
    ok: !hasPayments || /\b(sandbox|testnet|dry run|spend cap|budget|approval|receipt|replay|idempotency|allowlist|metadata filter)\b/i.test(text),
    weight: hasPayments || focus === 'payments' ? 10 : 4,
    fix: 'For x402, Pay.sh, wallet, or paid API demos, add sandbox mode, caps, approvals, receipts, replay/idempotency, and metadata filtering.',
  })
  addCheck(checks, {
    group: 'Secrets',
    label: 'No obvious secret values are pasted into public files',
    ok: !riskyEnv && !publicSecretName,
    weight: 10,
    fix: 'Remove hardcoded tokens, private keys, webhook secrets, and public env names that imply browser-exposed secrets.',
  })
  addCheck(checks, {
    group: 'Focus fit',
    label: 'Project matches the selected submission focus',
    ok: focus === 'general'
      || focus === 'mcp' && hasMcp
      || focus === 'payments' && hasPayments
      || focus === 'browser' && hasBrowserAgent
      || focus === 'data' && /\b(data|dataset|crawler|scraper|retrieval|search|api|source|provenance)\b/i.test(text)
      || focus === 'enterprise' && /\b(workflow|approval|ticket|crm|erp|governance|compliance|operations)\b/i.test(text)
      || focus === 'security' && (hasPolicy || /\b(security|prompt injection|exfiltration|sandbox|policy|audit)\b/i.test(text)),
    weight: 8,
    fix: 'Align the submission copy with the selected track: make the track-specific proof obvious in the first paragraph and demo.',
  })

  return { checks, signals, entries }
}

function scoreChecks(checks) {
  const total = checks.reduce((sum, check) => sum + check.weight, 0)
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0)
  return total ? Math.round((earned / total) * 100) : 0
}

function verdict(score) {
  if (score >= 86) {
    return 'Submission-ready after a final rules check.'
  }
  if (score >= 70) {
    return 'Close, but fix the visible proof gaps first.'
  }
  if (score >= 50) {
    return 'Promising build, weak submission trail.'
  }
  return 'Not ready to submit yet.'
}

function topFixes(checks) {
  return checks
    .filter(check => !check.ok)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 7)
}

function buildReport(analysis, score) {
  const name = projectName.value.trim() || 'Untitled agent submission'
  const url = projectUrl.value.trim() || 'No URL provided'
  const focus = eventFocus.options[eventFocus.selectedIndex].text
  const fixes = topFixes(analysis.checks)
  const passed = analysis.checks.filter(check => check.ok)

  return [
    `Agent Submission Gate report`,
    `Project: ${name}`,
    `URL: ${url}`,
    `Focus: ${focus}`,
    `Score: ${score}/100`,
    `Verdict: ${verdict(score)}`,
    '',
    'Next fixes:',
    ...(fixes.length ? fixes.map((check, index) => `${index + 1}. [${check.group}] ${check.fix}`) : ['1. No major gaps detected by this browser-only pass.']),
    '',
    'Passed signals:',
    ...(passed.length ? passed.map(check => `- [${check.group}] ${check.label}`) : ['- None yet.']),
    '',
    'Detected surface:',
    ...(analysis.signals.length ? analysis.signals.map(signal => `- ${signal}`) : ['- No agent-specific surface detected yet.']),
  ].join('\n')
}

function renderList(parent, items, renderItem) {
  parent.replaceChildren()
  if (items.length === 0) {
    const li = document.createElement('li')
    li.textContent = 'No items yet.'
    parent.append(li)
    return
  }
  items.forEach(item => {
    const li = document.createElement('li')
    li.textContent = renderItem(item)
    parent.append(li)
  })
}

function updateResult() {
  const analysis = analyze()
  if (analysis.entries.length === 0) {
    submissionScore.textContent = '0'
    submissionTitle.textContent = 'Load a project to score the submission.'
    submissionSummary.textContent = 'Upload files or paste the README/submission draft to generate a deadline-focused fix order.'
    renderList(submissionFixes, [], item => item)
    renderList(signalList, [], item => item)
    emailSubmissionResult.href = 'mailto:hello@tateprograms.com?subject=Agent%20Submission%20Gate%20result'
    return
  }

  const score = scoreChecks(analysis.checks)
  const fixes = topFixes(analysis.checks)
  const report = buildReport(analysis, score)
  submissionScore.textContent = String(score)
  submissionTitle.textContent = verdict(score)
  submissionSummary.textContent = fixes.length
    ? `Loaded ${analysis.entries.length} text input${analysis.entries.length === 1 ? '' : 's'}. Fix ${fixes[0].group.toLowerCase()} first.`
    : `Loaded ${analysis.entries.length} text input${analysis.entries.length === 1 ? '' : 's'}. The visible submission trail is strong.`
  renderList(submissionFixes, fixes, check => `[${check.group}] ${check.fix}`)
  renderList(signalList, analysis.signals, signal => signal)
  emailSubmissionResult.href = `mailto:hello@tateprograms.com?subject=Agent%20Submission%20Gate%20result&body=${encodeURIComponent(report)}`
}

async function copyReport() {
  const analysis = analyze()
  const report = buildReport(analysis, scoreChecks(analysis.checks))
  await navigator.clipboard.writeText(report)
  copySubmissionResult.textContent = 'copied'
  window.setTimeout(() => {
    copySubmissionResult.textContent = 'copy result'
  }, 1400)
}

function downloadReport() {
  const analysis = analyze()
  const report = buildReport(analysis, scoreChecks(analysis.checks))
  const blob = new Blob([report], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const slug = (projectName.value.trim() || 'agent-submission').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent-submission'
  link.href = url
  link.download = `${slug}-submission-gate.txt`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

fileInput.addEventListener('change', event => {
  loadFiles(event.target.files).catch(error => {
    fileSummary.textContent = `Could not read files: ${error.message}`
  })
})

pasteInput.addEventListener('input', updateResult)
projectName.addEventListener('input', updateResult)
projectUrl.addEventListener('input', updateResult)
eventFocus.addEventListener('change', updateResult)
manualInputs.forEach(input => input.addEventListener('change', updateResult))
copySubmissionResult.addEventListener('click', copyReport)
downloadSubmissionReport.addEventListener('click', downloadReport)
updateResult()
