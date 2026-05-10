const metadataInput = document.querySelector('#metadataInput')
const metadataOutput = document.querySelector('#metadataOutput')
const metadataScore = document.querySelector('#metadataScore')
const metadataTitle = document.querySelector('#metadataTitle')
const metadataSummary = document.querySelector('#metadataSummary')
const metadataSignals = document.querySelector('#metadataSignals')
const loadSample = document.querySelector('#loadSample')
const copySafeMetadata = document.querySelector('#copySafeMetadata')
const downloadMetadataReport = document.querySelector('#downloadMetadataReport')

const sampleMetadata = {
  provider: 'x402.quicknode.com',
  endpoint: 'https://x402.quicknode.com/solana-mainnet?user=tate@example.com&session_token=secret_token_example_1234567890abcdef',
  amount: '0.01',
  currency: 'USDC',
  network: 'base',
  reason: 'Use the private prompt "find Tate Lyman wallet history and email results to tate@example.com" for customer_8df9a.',
  resource_description: 'Premium Solana RPC call for ticket INC-1042, phone +1 414 555 0199',
  metadata: {
    user_id: 'user_9f4c8a',
    customer_email: 'tate@example.com',
    prompt: 'Analyze this private support ticket and purchase the cheapest paid API result.',
    api_key: 'secret_token_example_1234567890abcdef',
    wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  },
}

function parseInput(value) {
  const trimmed = value.trim()
  if (!trimmed) {
    return { kind: 'empty', value: null }
  }
  try {
    return { kind: 'json', value: JSON.parse(trimmed) }
  }
  catch {
    return { kind: 'text', value: trimmed }
  }
}

function addFinding(findings, type, message, severity = 1) {
  findings.push({ type, message, severity })
}

function redactText(text, findings, path) {
  let output = String(text ?? '')
  const checks = [
    {
      type: 'email',
      pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
      replacement: '[email]',
      message: 'Email address in payment metadata',
      severity: 3,
    },
    {
      type: 'phone',
      pattern: /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
      replacement: '[phone]',
      message: 'Phone number in payment metadata',
      severity: 2,
    },
    {
      type: 'secret',
      pattern: /\b(?:sk_live|sk_test|pk_live|ghp|github_pat|xoxb|xoxp|npm)_[A-Za-z0-9_\-]{12,}\b/g,
      replacement: '[secret]',
      message: 'Secret-like token in payment metadata',
      severity: 5,
    },
    {
      type: 'jwt',
      pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
      replacement: '[jwt]',
      message: 'JWT-like value in payment metadata',
      severity: 5,
    },
    {
      type: 'wallet',
      pattern: /\b0x[a-fA-F0-9]{40}\b/g,
      replacement: '[wallet]',
      message: 'Wallet address in payment metadata',
      severity: 1,
    },
    {
      type: 'customer-id',
      pattern: /\b(?:customer|user|account|ticket|case|inc)[_-]?[a-z0-9]{4,}\b/gi,
      replacement: '[id]',
      message: 'Internal user or ticket identifier in payment metadata',
      severity: 2,
    },
  ]

  for (const check of checks) {
    if (check.pattern.test(output)) {
      addFinding(findings, check.type, `${check.message} at ${path}`, check.severity)
      output = output.replace(check.pattern, check.replacement)
    }
  }

  if (/\b(private prompt|full prompt|chat history|support ticket|retrieval chunk|internal note)\b/i.test(output)) {
    addFinding(findings, 'prompt-context', `Private task context at ${path}`, 4)
    output = output
      .replace(/"[^"]{20,}"/g, '"[private-context]"')
      .replace(/\b(private prompt|full prompt|chat history|support ticket|retrieval chunk|internal note)\b/gi, '[private-context]')
  }

  return output
}

function safeUrl(value, findings, path) {
  try {
    const url = new URL(value)
    if (url.search) {
      addFinding(findings, 'url-query', `Query string removed from URL at ${path}`, 3)
    }
    return `${url.origin}${url.pathname}`
  }
  catch {
    return null
  }
}

function isSensitiveKey(key) {
  return /prompt|message|chat|ticket|user|customer|email|phone|name|token|secret|key|authorization|bearer|cookie|session|private|seed|password/i.test(key)
}

function sanitize(value, findings, path = '$') {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitize(item, findings, `${path}[${index}]`))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const childPath = `${path}.${key}`
      if (isSensitiveKey(key)) {
        addFinding(findings, 'sensitive-key', `Sensitive field key "${key}" at ${childPath}`, 4)
        if (/url|endpoint|resource/i.test(key) && typeof child === 'string') {
          return [key, safeUrl(child, findings, childPath) ?? '[redacted]']
        }
        return [key, '[redacted]']
      }
      return [key, sanitize(child, findings, childPath)]
    }))
  }

  if (typeof value === 'string') {
    const cleanUrl = safeUrl(value, findings, path)
    if (cleanUrl) {
      return redactText(cleanUrl, findings, path)
    }
    return redactText(value, findings, path)
  }

  return value
}

function compactPurpose(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (/rpc|blockchain|wallet|chain|solana|ethereum/i.test(text)) return 'chain_data_request'
  if (/email|sms|message|inbox/i.test(text)) return 'message_delivery'
  if (/domain|dns|registrar/i.test(text)) return 'domain_operation'
  if (/search|scrape|crawl|maps|web/i.test(text)) return 'web_data_request'
  if (/image|video|speech|ocr|document/i.test(text)) return 'media_processing'
  return 'paid_api_request'
}

function buildSafeEnvelope(parsed, sanitized, findings) {
  const source = parsed.value ?? parsed
  const sourceText = typeof source === 'string' ? source : JSON.stringify(source)
  return {
    purpose_code: compactPurpose(sourceText),
    resource_label: compactPurpose(sourceText).replaceAll('_', '-'),
    payment_metadata: sanitized,
    omitted_fields: [...new Set(findings.map(finding => finding.type))],
    review_note: findings.length
      ? 'Review redactions before production use.'
      : 'No common metadata leaks detected by this local filter.',
  }
}

function analyze() {
  const parsed = parseInput(metadataInput.value)
  const findings = []

  if (parsed.kind === 'empty') {
    return {
      score: 0,
      title: 'Paste metadata to begin',
      summary: 'The filter runs in this browser and does not upload the text.',
      findings: [],
      safe: '',
    }
  }

  const sanitized = sanitize(parsed.value, findings)
  const penalty = findings.reduce((total, finding) => total + finding.severity * 8, 0)
  const score = Math.max(0, 100 - penalty)
  const safe = buildSafeEnvelope(parsed, sanitized, findings)

  return {
    score,
    title: score >= 90 ? 'Metadata looks tight' : score >= 70 ? 'Metadata needs cleanup' : 'Metadata is leaking context',
    summary: findings.length
      ? `${findings.length} issue${findings.length === 1 ? '' : 's'} found before this should reach a payment record.`
      : 'No common prompt, PII, token, or query-string leaks were detected.',
    findings,
    safe: JSON.stringify(safe, null, 2),
  }
}

function render() {
  const result = analyze()
  metadataScore.textContent = result.score
  metadataTitle.textContent = result.title
  metadataSummary.textContent = result.summary
  metadataOutput.value = result.safe

  metadataSignals.replaceChildren()
  const findings = result.findings.length
    ? result.findings
    : [{ type: 'clear', message: 'No common metadata leaks detected', severity: 0 }]

  for (const finding of findings.slice(0, 12)) {
    const item = document.createElement('article')
    item.className = 'signal-row'
    const label = document.createElement('strong')
    label.textContent = finding.type
    const message = document.createElement('span')
    message.textContent = finding.message
    item.append(label, message)
    metadataSignals.append(item)
  }
}

function downloadReport() {
  const result = analyze()
  const report = [
    '# x402 Metadata Filter Report',
    '',
    `Score: ${result.score}/100`,
    `Verdict: ${result.title}`,
    '',
    '## Findings',
    '',
    ...(result.findings.length
      ? result.findings.map(finding => `- ${finding.type}: ${finding.message}`)
      : ['- No common metadata leaks detected.']),
    '',
    '## Safe Metadata Draft',
    '',
    '```json',
    result.safe || '{}',
    '```',
    '',
  ].join('\n')

  const blob = new Blob([report], { type: 'text/markdown' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'x402-metadata-filter-report.md'
  link.click()
  URL.revokeObjectURL(link.href)
}

metadataInput?.addEventListener('input', render)
loadSample?.addEventListener('click', () => {
  metadataInput.value = JSON.stringify(sampleMetadata, null, 2)
  render()
})
copySafeMetadata?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(metadataOutput.value)
})
downloadMetadataReport?.addEventListener('click', downloadReport)

render()
