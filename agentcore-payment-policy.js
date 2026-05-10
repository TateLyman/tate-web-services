const fields = {
  projectName: document.querySelector('#projectName'),
  paymentRail: document.querySelector('#paymentRail'),
  sessionCap: document.querySelector('#sessionCap'),
  perCallCap: document.querySelector('#perCallCap'),
  currency: document.querySelector('#currency'),
  expiryMinutes: document.querySelector('#expiryMinutes'),
  networks: document.querySelector('#networks'),
  recipients: document.querySelector('#recipients'),
  purposeCodes: document.querySelector('#purposeCodes'),
  dryRun: document.querySelector('#dryRun'),
  humanApproval: document.querySelector('#humanApproval'),
  recipientValidation: document.querySelector('#recipientValidation'),
  metadataFilter: document.querySelector('#metadataFilter'),
  receipts: document.querySelector('#receipts'),
  replayProtection: document.querySelector('#replayProtection'),
  separateWallet: document.querySelector('#separateWallet'),
  observeSpend: document.querySelector('#observeSpend'),
}

const policyScore = document.querySelector('#policyScore')
const policyTitle = document.querySelector('#policyTitle')
const policySummary = document.querySelector('#policySummary')
const policySignals = document.querySelector('#policySignals')
const policyOutput = document.querySelector('#policyOutput')
const copyPolicy = document.querySelector('#copyPolicy')
const downloadPolicy = document.querySelector('#downloadPolicy')

function splitList(value) {
  return String(value ?? '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function numberValue(input, fallback = 0) {
  const value = Number.parseFloat(input?.value)
  return Number.isFinite(value) ? value : fallback
}

function addGap(gaps, id, label, severity, fix) {
  gaps.push({ id, label, severity, fix })
}

function buildPolicy() {
  const project = fields.projectName.value.trim() || 'Untitled payment-agent project'
  const rail = fields.paymentRail.value
  const sessionCap = numberValue(fields.sessionCap)
  const perCallCap = numberValue(fields.perCallCap)
  const expiryMinutes = Math.max(1, Math.round(numberValue(fields.expiryMinutes, 30)))
  const currency = fields.currency.value.trim().toUpperCase() || 'USDC'
  const networks = splitList(fields.networks.value)
  const recipients = splitList(fields.recipients.value)
  const purposeCodes = splitList(fields.purposeCodes.value)
  const gaps = []

  if (sessionCap <= 0) {
    addGap(gaps, 'session-cap-missing', 'No session cap', 18, 'Set a small maxSpendAmount for every payment session.')
  }
  else if (sessionCap > 25) {
    addGap(gaps, 'session-cap-high', 'Session cap is high for a demo', 8, 'Use a low demo cap until there is a production risk review.')
  }

  if (perCallCap <= 0) {
    addGap(gaps, 'call-cap-missing', 'No per-call cap', 16, 'Set a max per paid endpoint call.')
  }
  else if (sessionCap > 0 && perCallCap > sessionCap) {
    addGap(gaps, 'call-cap-over-session', 'Per-call cap exceeds session cap', 14, 'Keep per-call limit lower than or equal to the session cap.')
  }
  else if (perCallCap > 2) {
    addGap(gaps, 'call-cap-high', 'Per-call cap is high for first launch', 8, 'Start with a smaller paid-call ceiling and raise it after logs are clean.')
  }

  if (expiryMinutes > 60) {
    addGap(gaps, 'session-expiry-long', 'Payment sessions last over an hour', 6, 'Use short-lived sessions for early demos.')
  }
  if (!networks.length) {
    addGap(gaps, 'network-allowlist-missing', 'No network allowlist', 12, 'List allowed networks explicitly.')
  }
  if (!recipients.length) {
    addGap(gaps, 'recipient-allowlist-missing', 'No recipient allowlist', 18, 'Deny unknown recipients by default.')
  }
  if (!purposeCodes.length) {
    addGap(gaps, 'purpose-codes-missing', 'No purpose codes', 6, 'Use compact purpose codes instead of freeform prompts in payment metadata.')
  }

  const controlChecks = [
    ['dryRun', 'dry-run-default', 'No dry-run default', 12, 'Keep demos in sandbox, testnet, or zero-value mode until manually promoted.'],
    ['humanApproval', 'human-approval-missing', 'No approval gate', 14, 'Require approval for new recipients, high amounts, and production mode.'],
    ['recipientValidation', 'provider-validation-missing', 'Provider validation missing', 14, 'Validate recipient, network, asset, challenge, and facilitator response before paying.'],
    ['metadataFilter', 'metadata-filter-missing', 'Metadata filter missing', 12, 'Redact prompts, PII, query tokens, and internal ids before receipts or facilitators see them.'],
    ['receipts', 'receipt-log-missing', 'Receipt logging missing', 10, 'Store receipts, denials, retries, and refund states.'],
    ['replayProtection', 'replay-protection-missing', 'Replay protection missing', 10, 'Reject duplicate request ids, expired sessions, and reused payment payloads.'],
    ['separateWallet', 'wallet-isolation-missing', 'No isolated demo wallet', 5, 'Use a dedicated low-balance wallet or payment instrument for early demos.'],
    ['observeSpend', 'observability-missing', 'Spend observability missing', 10, 'Emit logs, metrics, and trace ids for each payment decision.'],
  ]

  for (const [field, id, label, severity, fix] of controlChecks) {
    if (!fields[field].checked) addGap(gaps, id, label, severity, fix)
  }

  const score = Math.max(0, 100 - gaps.reduce((total, gap) => total + gap.severity, 0))
  const policy = {
    policy_name: `${project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'payment-agent'}-payment-policy`,
    project,
    rail,
    mode: fields.dryRun.checked ? 'dry_run_first' : 'production_risk_review_required',
    payment_session: {
      maxSpendAmount: sessionCap,
      maxPerCallAmount: perCallCap,
      currency,
      expiresInMinutes: expiryMinutes,
      denyWhenLimitExceeded: true,
      denyWhenExpired: true,
    },
    allowlists: {
      networks,
      recipients,
      purposeCodes,
    },
    approval_rules: [
      {
        when: 'amount > maxPerCallAmount',
        action: fields.humanApproval.checked ? 'require_human_approval' : 'deny_until_approval_gate_exists',
      },
      {
        when: 'recipient not in allowlists.recipients',
        action: 'deny',
      },
      {
        when: 'network not in allowlists.networks',
        action: 'deny',
      },
      {
        when: 'mode changes from dry_run_first to production',
        action: 'require_manual_promotion',
      },
    ],
    x402_controls: {
      validatePaymentPayload: fields.recipientValidation.checked,
      validateFacilitatorResponse: fields.recipientValidation.checked,
      requireExactAssetAndNetworkMatch: true,
      requireReplayProtection: fields.replayProtection.checked,
      requireReceiptForEveryDecision: fields.receipts.checked,
    },
    metadata_policy: {
      allowOnlyPurposeCodes: fields.metadataFilter.checked,
      redactPromptText: fields.metadataFilter.checked,
      redactPiiAndQueryTokens: fields.metadataFilter.checked,
      allowedFields: ['purpose_code', 'resource_label', 'price_quote_id', 'request_id'],
    },
    wallet_policy: {
      useDedicatedLowBalanceInstrument: fields.separateWallet.checked,
      rotateOnExposure: true,
      neverExposePrivateKeysToBrowser: true,
    },
    observability: {
      emitDecisionLogs: fields.observeSpend.checked,
      includeTraceId: fields.observeSpend.checked,
      recordDeniedAttempts: fields.observeSpend.checked,
      recordRefundAndDisputeState: fields.receipts.checked,
    },
    launch_gaps: gaps,
    next_patch_order: gaps
      .slice()
      .sort((a, b) => b.severity - a.severity)
      .map(gap => gap.fix),
  }

  return { score, gaps, policy }
}

function render() {
  const result = buildPolicy()
  policyScore.textContent = result.score
  policyTitle.textContent = result.score >= 90
    ? 'Policy is launch-shaped'
    : result.score >= 70
      ? 'Policy needs a few gates'
      : 'Policy needs hard spend controls'
  policySummary.textContent = result.gaps.length
    ? `${result.gaps.length} launch gap${result.gaps.length === 1 ? '' : 's'} before this should spend outside a demo.`
    : 'No obvious payment-policy gaps in this local pass.'
  policyOutput.value = JSON.stringify(result.policy, null, 2)

  policySignals.replaceChildren()
  const signals = result.gaps.length
    ? result.gaps
    : [{ id: 'clear', label: 'Core payment controls are represented', severity: 0, fix: 'Keep evidence linked to the repo and demo.' }]

  for (const signal of signals) {
    const item = document.createElement('article')
    const title = document.createElement('strong')
    const body = document.createElement('span')
    title.textContent = signal.label
    body.textContent = signal.fix
    item.append(title, body)
    policySignals.append(item)
  }
}

function download(filename, content, type = 'application/json') {
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

copyPolicy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(policyOutput.value)
    copyPolicy.textContent = 'copied'
  }
  catch {
    policyOutput.focus()
    policyOutput.select()
    copyPolicy.textContent = 'selecting'
  }
  setTimeout(() => {
    copyPolicy.textContent = 'copy policy'
  }, 1200)
})

downloadPolicy?.addEventListener('click', () => {
  download('agentcore-payment-policy.json', `${policyOutput.value}\n`)
})

render()
