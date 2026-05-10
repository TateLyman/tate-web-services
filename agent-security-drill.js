const fileInput = document.querySelector('#fileInput')
const fileSummary = document.querySelector('#fileSummary')
const pasteInput = document.querySelector('#pasteInput')
const projectName = document.querySelector('#projectName')
const projectUrl = document.querySelector('#projectUrl')
const securityScore = document.querySelector('#securityScore')
const securityTitle = document.querySelector('#securityTitle')
const securitySummary = document.querySelector('#securitySummary')
const securityFixes = document.querySelector('#securityFixes')
const securitySignals = document.querySelector('#securitySignals')
const copySecurityResult = document.querySelector('#copySecurityResult')
const downloadSecurityReport = document.querySelector('#downloadSecurityReport')
const emailSecurityResult = document.querySelector('#emailSecurityResult')
const copyDrillPack = document.querySelector('#copyDrillPack')
const drillPackText = document.querySelector('#drillPackText')

const fileState = new Map()
const textFilePattern = /\.(?:json|md|txt|ya?ml|js|jsx|ts|tsx|mjs|cjs|css|html|env|toml|lock|gitignore|rs|py|go|rb|java|cs|sql)$/i
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
  const readable = [...files].filter(shouldReadFile).slice(0, 220)
  await Promise.all(readable.map(async file => {
    fileState.set(normalizePath(file), await readFile(file))
  }))
  const skipped = files.length - readable.length
  fileSummary.textContent = readable.length
    ? `${readable.length} text files loaded${skipped > 0 ? `, ${skipped} skipped` : ''}.`
    : 'No text files loaded. Try selecting README, policy YAML, middleware, tests, or docs.'
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

function hasManual(id) {
  return Boolean(document.querySelector(`#${id}`)?.checked)
}

function findFiles(entries, predicate) {
  return entries.filter(([name]) => predicate(name.toLowerCase()))
}

function hasFile(entries, predicate) {
  return Boolean(entries.find(([name]) => predicate(name.toLowerCase())))
}

function combinedText(entries) {
  return entries.map(([name, text]) => `\n--- ${name} ---\n${text}`).join('\n')
}

function addCheck(checks, check) {
  checks.push(check)
}

function analyze() {
  const entries = getEntries()
  if (entries.length === 0) {
    return { checks: [], entries }
  }

  const allText = combinedText(entries)
  const policyFiles = findFiles(entries, name => /policy|guardrail|lobster|firewall|rules|security|prompt|dpi/.test(name))
  const testFiles = findFiles(entries, name => /test|spec|eval|red.?team|attack|fixture|drill/.test(name))
  const docsFiles = findFiles(entries, name => /readme|security|threat|runbook|architecture|docs|policy/.test(name))

  const hasLobsterTrap = /lobster\s*trap|_lobstertrap|contains_injection_patterns|intent_category|declared_intent/i.test(allText)
  const hasOpenAiProxy = /\/v1\/chat\/completions|openai-compatible|chat completions|model inference|proxy/i.test(allText)
  const hasPolicy = hasManual('hasPolicy')
    || policyFiles.length > 0
    || /\b(ingress_rules|egress_rules|policy_name|default_action|ALLOW|DENY|HUMAN_REVIEW|QUARANTINE|RATE_LIMIT)\b/i.test(allText)
  const promptInjection = hasManual('hasInjectionTests')
    || /\b(prompt injection|ignore previous|system prompt|jailbreak|instruction override|contains_injection_patterns)\b/i.test(allText)
  const exfiltration = /\b(exfiltration|pastebin|upload secrets|send.*secrets|leak|credential_access|contains_credentials)\b/i.test(allText)
  const pii = /\b(PII|personal data|ssn|credit card|contains_pii|privacy|redact|scrub|sanitize)\b/i.test(allText)
  const toolScopes = hasManual('hasToolScopes')
    || /\b(read-only|write access|destructive|tool scope|least privilege|permission|filesystem|network policy|allowed_domains|denied_paths|allowed_read_paths|allowed_write_paths)\b/i.test(allText)
  const humanReview = hasManual('hasHumanReview')
    || /\b(human review|HUMAN_REVIEW|approval|approve|checkpoint|manual review|requires confirmation)\b/i.test(allText)
  const audit = hasManual('hasAuditLog')
    || /\b(audit log|request_id|trace|span|event log|verdict|matched rule|inspection report|deny reason|decision log)\b/i.test(allText)
  const rateLimits = hasManual('hasRateLimits')
    || /\b(rate limit|RATE_LIMIT|quota|throttle|requests_per_minute|requests_per_hour|burst_threshold|429)\b/i.test(allText)
  const safeDemo = hasManual('hasSafeDemo')
    || /\b(dry-run|sandbox|mock|fixture|demo mode|test mode|staging|fake key|example.invalid|localhost|no real account)\b/i.test(allText)
  const declaredIntent = /\b(declared_intent|declared_paths|detected intent|intent mismatch|declared-versus-detected|mismatches)\b/i.test(allText)
  const egress = /\b(egress|model output|output inspection|response inspection|blocked output|contains_urls|phishing|malware|exfiltration)\b/i.test(allText)
  const networkPolicy = /\b(network policy|allowed_domains|denied_domains|allowlist|denylist|blocklist|trusted domain|egress_policy)\b/i.test(allText)
  const filesystemPolicy = /\b(filesystem|denied_paths|allowed_read_paths|allowed_write_paths|\.env|\/etc\/|\*\*\/\.ssh|sensitive_paths)\b/i.test(allText)
  const secretsHandling = /\b(secret|token|api key|credential|private key|redact|scrub|vault|dotenv|env example)\b/i.test(allText)
  const envExample = hasFile(entries, name => /(?:^|\/)\.env\.example$/.test(name))
  const publicPrivateName = /\b(?:NEXT_PUBLIC|VITE)_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE|SERVICE|WEBHOOK|ADMIN|KEY)\b/.test(allText)
  const hardcodedSecret = /\bsk_live_[A-Za-z0-9]{12,}\b|(?:private[_-]?key|api[_-]?key|secret|token|seed phrase)\s*[:=]\s*['"][A-Za-z0-9_\-.]{28,}['"]/i.test(allText)
  const docs = docsFiles.length > 0 && /\b(policy|permissions|security|threat|audit|runbook|guardrail|demo)\b/i.test(allText)
  const ci = hasFile(entries, name => name.includes('.github/workflows/'))
    || /\b(github actions|ci|npm test|pnpm test|make test|go test|pytest|vitest)\b/i.test(allText)
  const tests = testFiles.length > 0 || /\b(test|spec|fixture|eval|red.?team|attack suite|drill pack)\b/i.test(allText)

  const checks = []
  addCheck(checks, {
    group: 'Policy',
    label: 'Policy layer is visible',
    ok: hasPolicy,
    weight: 10,
    fix: 'Add a policy file or middleware layer that maps detected risk to actions such as DENY, LOG, HUMAN_REVIEW, or RATE_LIMIT.',
  })
  addCheck(checks, {
    group: 'Policy',
    label: 'Policy has deny and review actions',
    ok: /\bDENY\b/i.test(allText) && (humanReview || /\bHUMAN_REVIEW\b/i.test(allText)),
    weight: 8,
    fix: 'Add at least one DENY rule and one human-review path for ambiguous or high-risk actions.',
  })
  addCheck(checks, {
    group: 'Threats',
    label: 'Prompt injection drills are present',
    ok: promptInjection,
    weight: 9,
    fix: 'Add prompt-injection drills such as system-prompt extraction, instruction override, and hidden-payload attacks.',
  })
  addCheck(checks, {
    group: 'Threats',
    label: 'Exfiltration drills are present',
    ok: exfiltration,
    weight: 9,
    fix: 'Add drills for credential leakage, paste/upload attempts, private file reads, and off-domain data transfer.',
  })
  addCheck(checks, {
    group: 'Threats',
    label: 'PII and credential handling is addressed',
    ok: pii || secretsHandling,
    weight: 8,
    fix: 'Document how prompts, outputs, logs, receipts, and metadata avoid exposing PII, credentials, or private files.',
  })
  addCheck(checks, {
    group: 'Tools',
    label: 'Tool scopes are explicit',
    ok: toolScopes,
    weight: 10,
    fix: 'Define read, write, network, filesystem, payment, and destructive tool boundaries in code or docs.',
  })
  addCheck(checks, {
    group: 'Tools',
    label: 'Network egress policy exists',
    ok: networkPolicy,
    weight: 6,
    fix: 'Add allowed and denied domains for agent/network activity, especially if the agent can browse or call APIs.',
  })
  addCheck(checks, {
    group: 'Tools',
    label: 'Filesystem policy exists',
    ok: filesystemPolicy,
    weight: 6,
    fix: 'Add denied paths for secrets and sensitive directories, plus narrow allowed read/write paths for agent workspaces.',
  })
  addCheck(checks, {
    group: 'Runtime',
    label: 'Human review can stop risky work',
    ok: humanReview,
    weight: 8,
    fix: 'Route destructive actions, private-data access, unusual spend, and off-domain transfer through human review.',
  })
  addCheck(checks, {
    group: 'Runtime',
    label: 'Rate limits or quotas exist',
    ok: rateLimits,
    weight: 6,
    fix: 'Add request, action, or spend throttles so a failed policy cannot turn into an uncontrolled loop.',
  })
  addCheck(checks, {
    group: 'Runtime',
    label: 'Safe demo mode exists',
    ok: safeDemo,
    weight: 7,
    fix: 'Provide a demo mode using fixtures, localhost, dummy accounts, or dry-run actions before touching real systems.',
  })
  addCheck(checks, {
    group: 'Audit',
    label: 'Audit trail records decisions',
    ok: audit,
    weight: 10,
    fix: 'Log request ID, matched rule, verdict, action, tool call, and review result for every meaningful step.',
  })
  addCheck(checks, {
    group: 'Audit',
    label: 'Declared intent can be compared with detected behavior',
    ok: declaredIntent || hasLobsterTrap,
    weight: 6,
    fix: 'Record what the agent claimed it would do and what the policy layer detected, then flag mismatches.',
  })
  addCheck(checks, {
    group: 'Audit',
    label: 'Output inspection is covered',
    ok: egress || hasLobsterTrap,
    weight: 6,
    fix: 'Inspect model outputs for secret leakage, phishing links, harmful instructions, or undeclared data transfer.',
  })
  addCheck(checks, {
    group: 'Launch',
    label: 'Security docs are present',
    ok: docs,
    weight: 7,
    fix: 'Add a short security runbook covering threat model, policy actions, tool scopes, logs, and demo limitations.',
  })
  addCheck(checks, {
    group: 'Launch',
    label: 'Tests or eval fixtures exist',
    ok: tests,
    weight: 6,
    fix: 'Add repeatable tests for benign prompts, injection attempts, exfiltration, unsafe tools, and expected denies.',
  })
  addCheck(checks, {
    group: 'Launch',
    label: 'CI or repeatable test command is visible',
    ok: ci,
    weight: 4,
    fix: 'Add a CI workflow or documented test command so reviewers can rerun the policy checks.',
  })
  addCheck(checks, {
    group: 'Launch',
    label: 'Lobster Trap or proxy-compatible path is clear',
    ok: hasLobsterTrap || hasOpenAiProxy || !/lobster|dpi|proxy/i.test(allText),
    weight: 4,
    fix: 'If claiming Lobster Trap-style protection, show the OpenAI-compatible proxy path and where policies run.',
  })
  addCheck(checks, {
    group: 'Secrets',
    label: 'Environment examples avoid public secret names',
    ok: !publicPrivateName,
    weight: 5,
    fix: 'Remove public-prefixed secret names such as NEXT_PUBLIC_*SECRET or VITE_*TOKEN from docs and examples.',
  })
  addCheck(checks, {
    group: 'Secrets',
    label: 'No obvious hardcoded secrets detected',
    ok: !hardcodedSecret,
    weight: 5,
    fix: 'Remove hardcoded API keys, tokens, private keys, and seed phrases from source, docs, and fixtures.',
  })
  addCheck(checks, {
    group: 'Secrets',
    label: 'Environment template exists when env vars are used',
    ok: !/\bprocess\.env\.|import\.meta\.env\.|dotenv|\.env\b/i.test(allText) || envExample,
    weight: 3,
    fix: 'Add .env.example with placeholder values for required configuration.',
  })

  return { checks, entries }
}

function scoreChecks(checks) {
  const total = checks.reduce((sum, check) => sum + check.weight, 0)
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0)
  return total ? Math.round((earned / total) * 100) : 0
}

function verdict(score) {
  if (score >= 88) return ['Security-ready', 'The control plane has strong public proof. Do one final demo run and preserve the audit trail.']
  if (score >= 72) return ['Close, but patch first', 'The project has credible controls, but a few gaps could block a security-minded reviewer.']
  if (score >= 50) return ['Prototype risk', 'The demo has useful pieces but needs policy, audit, and tool-boundary work before public trust.']
  return ['Not ready for trust review', 'The project needs visible policy, drills, audit, and safe-demo evidence before it should be promoted.']
}

function renderSignals(checks) {
  securitySignals.replaceChildren()
  const groups = new Map()
  for (const check of checks) {
    if (!groups.has(check.group)) groups.set(check.group, [])
    groups.get(check.group).push(check)
  }

  for (const [group, groupChecks] of groups) {
    const passed = groupChecks.filter(check => check.ok).length
    const item = document.createElement('div')
    item.className = 'signal-row'
    item.innerHTML = `<strong>${group}</strong><span>${passed}/${groupChecks.length} signals</span>`
    securitySignals.append(item)
  }
}

function renderFixes(checks) {
  securityFixes.replaceChildren()
  const misses = checks
    .filter(check => !check.ok)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 7)

  if (misses.length === 0) {
    const item = document.createElement('li')
    item.textContent = 'No critical drill gaps found. Re-run with the final demo repo and preserve evidence.'
    securityFixes.append(item)
    return
  }

  for (const check of misses) {
    const item = document.createElement('li')
    item.innerHTML = `<strong>${check.label}</strong><span>${check.fix}</span>`
    securityFixes.append(item)
  }
}

function projectLabel() {
  return projectName.value.trim() || 'Agent security project'
}

function buildReport(score, checks) {
  const [title, summary] = verdict(score)
  const passed = checks.filter(check => check.ok)
  const misses = checks.filter(check => !check.ok).sort((a, b) => b.weight - a.weight)

  return [
    `# Agent Security Drill Report: ${projectLabel()}`,
    '',
    `Score: ${score}/100`,
    `Verdict: ${title}`,
    '',
    summary,
    '',
    projectUrl.value.trim() ? `Project URL: ${projectUrl.value.trim()}` : '',
    '',
    '## Passed signals',
    ...passed.map(check => `- ${check.group}: ${check.label}`),
    '',
    '## Fix queue',
    ...(misses.length ? misses.map(check => `- ${check.group}: ${check.fix}`) : ['- No critical drill gaps found.']),
    '',
    '## Manual drill pack',
    drillPackText.textContent.trim(),
    '',
    'Generated locally by Agent Security Drill Kit: https://tateprograms.com/agent-security-drill.html',
  ].filter(Boolean).join('\n')
}

function updateResult() {
  const { checks, entries } = analyze()
  if (entries.length === 0) {
    securityScore.textContent = '0'
    securityTitle.textContent = 'No project loaded'
    securitySummary.textContent = 'Load files or paste project text to score the agent-security control plane.'
    securitySignals.replaceChildren()
    securityFixes.replaceChildren()
    const item = document.createElement('li')
    item.textContent = 'Load files to generate the first fix queue.'
    securityFixes.append(item)
    return
  }

  const score = scoreChecks(checks)
  const [title, summary] = verdict(score)
  securityScore.textContent = String(score)
  securityTitle.textContent = title
  securitySummary.textContent = summary
  renderSignals(checks)
  renderFixes(checks)

  const report = buildReport(score, checks)
  const subject = encodeURIComponent(`Agent Security Drill result: ${projectLabel()}`)
  const body = encodeURIComponent(report.slice(0, 1800))
  emailSecurityResult.href = `mailto:hello@tateprograms.com?subject=${subject}&body=${body}`
}

async function copyText(text, button, label = 'copied') {
  await navigator.clipboard.writeText(text)
  const original = button.textContent
  button.textContent = label
  setTimeout(() => {
    button.textContent = original
  }, 1500)
}

fileInput?.addEventListener('change', event => {
  loadFiles(event.target.files || [])
})

pasteInput?.addEventListener('input', updateResult)
projectName?.addEventListener('input', updateResult)
projectUrl?.addEventListener('input', updateResult)

for (const input of document.querySelectorAll('.check-row input')) {
  input.addEventListener('change', updateResult)
}

copySecurityResult?.addEventListener('click', async () => {
  const { checks, entries } = analyze()
  if (entries.length === 0) return
  await copyText(buildReport(scoreChecks(checks), checks), copySecurityResult)
})

downloadSecurityReport?.addEventListener('click', () => {
  const { checks, entries } = analyze()
  if (entries.length === 0) return
  const report = buildReport(scoreChecks(checks), checks)
  const blob = new Blob([report], { type: 'text/markdown' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${projectLabel().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'agent-security'}-drill-report.md`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
})

copyDrillPack?.addEventListener('click', async () => {
  await copyText(drillPackText.textContent.trim(), copyDrillPack)
})

updateResult()
