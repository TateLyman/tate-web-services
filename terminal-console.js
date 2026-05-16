const terminalForm = document.querySelector('#terminalForm')
const terminalInput = document.querySelector('#terminalCommand')
const terminalOutput = document.querySelector('#terminalOutput')
const commandButtons = document.querySelectorAll('[data-command]')

const commands = {
  help: [
    'available commands:',
    '  services     list paid scopes',
    '  proof        show public artifacts',
    '  directory    open MCP directory launch pass',
    '  checklist    open MCP directory checklist',
    '  pulse        open MCP registry pulse',
    '  radar        open agent stack radar',
    '  promo-flow   open launch proof promo flow',
    '  payment-review open private agent-payment launch review scope',
    '  mcp-trust    open MCP launch trust ledger',
    '  security-drill open agent-security drill kit',
    '  security-report open sample security review report',
    '  x402         open x402 launch checklist',
    '  x402-batch   open x402 batch settlement checklist',
    '  x402-cors    open browser-readable 402 CORS fix',
    '  x402-worker  open Cloudflare x402 Worker guide',
    '  x402-attack-map open x402 attack-control field note',
    '  commerce-gate open agent-commerce readiness gate',
    '  pay-pulse    open Pay.sh catalog pulse',
    '  pay-skills   open pay-skills launch queue',
    '  metadata-filter open x402 metadata filter',
    '  agentcore-policy open AgentCore payment policy builder',
    '  commerce-report open sample readiness report',
    '  mcp-audit    open browser registry audit',
    '  shipcheck    open Shipcheck page',
    '  readiness    open 2026 release runbook',
    '  student-kit  open student launch checker',
    '  student-review open paid student review',
    '  pricing      show fixed entry prices',
    '  contact      prepare email ticket',
    '  pay          open payment links',
    '  clear        clear terminal output',
  ].join('\n'),
  services: [
    'NAME           PRICE   DELIVERABLE',
    'risk-pass      $99     memo + fix order',
    'mcp-dir        $149    listing pass',
    'fix-sprint     $299+   blocker repair',
    'mcp-review     $99     launch report',
    'pay-review     $149+   private spend map',
    'security       $149    drill report',
    'media-pass     $149    scripts + scene map',
    'shipcheck      free    scanner + action',
    'student-kit    free    browser launch checker',
    'student-pass   $29+    student launch review',
  ].join('\n'),
  proof: [
    'PUBLIC ARTIFACTS',
    'shipcheck-cli    npm package',
    'shipcheck-mcp    npm / registry / Glama',
    'mcpservers.org   approved listing',
    'awesome PR       open + green checks',
    'Shipcheck Action GitHub Marketplace',
    'student kit     browser-only launch checker',
    'student review  paid launch polish scope',
    'registry pulse   public MCP launch snapshot',
    'agent radar      May 2026 map for agent-native software surfaces',
    'payment review  private x402, MPP, AgentCore, and Worker scope builder',
    'promo flow       proof-led short-video template blueprint',
    'mcp trust        buyer-proof ledger for current MCP launches',
    'security drill   prompt injection, policy, audit, and review readiness',
    'security report  sample boundary map and patch order',
    'x402 checklist   launch controls for payment agents',
    'x402 batch       escrow, vouchers, channels, and claim cadence',
    'x402 cors      browser-readable 402 challenge fix',
    'x402 worker    Cloudflare Worker payment-gate starter',
    'x402 attack map finality, replay, cache, and discovery controls',
    'commerce gate    x402, Pay.sh, and payment-agent readiness check',
    'pay.sh pulse     live agent-paid API catalog map',
    'pay-skills queue fresh registry PRs for x402 launch surfaces',
    'metadata filter  x402 payment metadata cleanup',
    'agent policy     AgentCore/x402 spend policy builder',
    'commerce report  sample spend map and patch order',
    'case files       /case-studies.html',
    'checklist        /mcp-directory-checklist.html',
    'readiness        /release-readiness-2026.html',
  ].join('\n'),
  pricing: [
    'FIXED ENTRY PRICES',
    '$99      launch risk pass',
    '$29+     student launch review',
    '$99      MCP launch review',
    '$149     MCP directory launch pass',
    '$149     agent security launch review',
    '$149     agent commerce readiness review',
    '$149+    agent payment launch review',
    '$149     launch proof media pass',
    '$299+    production fix sprint',
    '$150+    follow-up patch pass',
    '',
    'scope is confirmed before larger work.',
  ].join('\n'),
  contact: [
    'opening ticket template:',
    'mailto:hello@tateprograms.com?subject=Launch review request',
    '',
    'include:',
    '- repo or live app link',
    '- stack',
    '- first user flow that must work',
    '- deadline or launch window',
  ].join('\n'),
  pay: [
    'payment links:',
    '  /payments.html',
    '  https://paypal.me/glidelocal',
    '',
    'pay after scope is clear unless using the fixed $99 MCP review.',
  ].join('\n'),
  'mcp-audit': [
    'open /mcp-registry-audit.html',
    'browser tool checks server.json, public GitHub repo, README proof, package ownership, and directory signals.',
  ].join('\n'),
  directory: [
    'open /mcp-directory-launch.html',
    'fixed pass for npm package metadata, server.json, Glama score readiness, README install path, and directory submission notes.',
  ].join('\n'),
  checklist: [
    'open /mcp-directory-checklist.html',
    'public May 2026 checklist for package identity, server.json, install docs, tool behavior notes, registry proof, and directory PRs.',
  ].join('\n'),
  pulse: [
    'open /mcp-registry-pulse.html',
    'public aggregate snapshot of MCP Registry launch-readiness signals: metadata, package paths, README proof, safety notes, and smoke-test language.',
  ].join('\n'),
  radar: [
    'open /agent-stack-radar.html',
    'May 2026 radar for agent-native software trends: MCP, x402, Pay.sh, live web data, browser automation, coding agents, and machine-readable docs.',
  ].join('\n'),
  'promo-flow': [
    'open /launch-proof-promo-flow.html',
    'reusable flow blueprint for turning launch proof into short product clips, social scripts, scene prompts, captions, and a fact gate.',
  ].join('\n'),
  'payment-review': [
    'open /agent-payment-launch-review.html',
    'private-first review scope for x402, MPP, Pay.sh, Cloudflare Worker, and AgentCore Payments launches: no-payment surface pass, cache/CORS, replay/idempotency, metadata boundary, receipt evidence, and patch order.',
  ].join('\n'),
  'mcp-trust': [
    'open /mcp-launch-trust-2026.html',
    'May 2026 ledger for MCP product launches: scoped credentials, audit trails, tenant boundaries, STDIO command safety, registry metadata, and buyer-facing proof.',
  ].join('\n'),
  'security-drill': [
    'open /agent-security-drill.html',
    'browser-only drill kit for agent security launches: prompt injection, exfiltration, unsafe tool use, policy actions, audit trails, rate limits, safe demos, and human review gates.',
  ].join('\n'),
  'security-report': [
    'open /agent-security-sample-report.html',
    'fictional launch review sample for an agent demo: boundary map, drill results, policy gaps, audit evidence, and patch order.',
  ].join('\n'),
  x402: [
    'open /x402-launch-checklist.html',
    'launch checklist for x402 and Pay.sh demos: sandbox mode, spend caps, approval gates, receipts, replay protection, PII-safe payment metadata, and failure paths.',
  ].join('\n'),
  'x402-batch': [
    'open /x402-batch-settlement-checklist.html',
    'May 2026 field guide for x402 batch settlement launches: escrow, signed vouchers, channel storage, deposit caps, claim cadence, refunds, and reconciliation evidence.',
  ].join('\n'),
  'x402-cors': [
    'open /x402-cors-fix.html',
    'field guide for browser-readable x402: OPTIONS preflight, actual 402 CORS, exposed payment headers, middleware order, and resource echo.',
  ].join('\n'),
  'x402-worker': [
    'open /cloudflare-x402-worker.html',
    'Cloudflare Worker launch guide for x402 and MPP-style gates: readable 402, X-PAYMENT preflight, no-store/private cache policy, Vary, and no grant before verification.',
  ].join('\n'),
  'x402-attack-map': [
    'open /x402-attack-map-2026.html',
    'May 2026 field note mapping x402 and MPP attack classes to launch controls: finality, facilitator binding, replay protection, cache hygiene, metadata boundaries, and discovery steering.',
  ].join('\n'),
  'commerce-gate': [
    'open /agent-commerce-gate.html',
    'browser-only readiness check for x402, Pay.sh, API-payment, and agent-commerce prototypes: price previews, enforceable caps, receipts, replay protection, provider validation, metadata filtering, and payment abuse controls.',
  ].join('\n'),
  'pay-pulse': [
    'open /pay-sh-catalog-pulse.html',
    'live Pay.sh catalog pulse for agent-paid API providers: provider counts, pricing surfaces, metered APIs, free-tier coverage, and review-priority surfaces for launch controls.',
  ].join('\n'),
  'pay-skills': [
    'open /pay-skills-launch-queue.html',
    'public watchlist for fresh pay-skills registry PRs: x402, MPP, Solana, Base, compute, commerce, wallet, and data-api launch surfaces that need spend controls and proof.',
  ].join('\n'),
  'metadata-filter': [
    'open /x402-metadata-filter.html',
    'browser-only filter for x402 and Pay.sh payment metadata: prompts, user identifiers, emails, phones, query tokens, wallet context, and secret-like receipt fields.',
  ].join('\n'),
  'agentcore-policy': [
    'open /agentcore-payment-policy.html',
    'browser-only policy builder for AgentCore Payments, x402, MPP, and Pay.sh demos: session spend caps, per-call limits, recipient allowlists, approval rules, metadata boundaries, receipts, replay protection, and audit evidence.',
  ].join('\n'),
  'commerce-report': [
    'open /agent-commerce-sample-report.html',
    'fictional 48-hour review sample for an x402 payment-agent demo: spend map, control gaps, launch evidence, and patch order.',
  ].join('\n'),
  shipcheck: [
    'open /shipcheck.html',
    'scanner for repo launch readiness, CI output, MCP metadata, and STDIO execution-boundary notes.',
  ].join('\n'),
  readiness: [
    'open /release-readiness-2026.html',
    'public runbook for JS, npm, GitHub Action, MCP, and payment-agent launch checks.',
  ].join('\n'),
  'student-kit': [
    'open /student-launch-kit.html',
    'browser-only launch preflight for student projects, hackathon submissions, and public handoff proof.',
  ].join('\n'),
  'student-review': [
    'open /student-launch-review.html',
    'fixed-scope review for student projects: README handoff, demo proof, submission copy, CI signal, and public-code cleanup.',
  ].join('\n'),
}

const routes = {
  'mcp-audit': 'mcp-registry-audit.html',
  directory: 'mcp-directory-launch.html',
  checklist: 'mcp-directory-checklist.html',
  pulse: 'mcp-registry-pulse.html',
  radar: 'agent-stack-radar.html',
  'promo-flow': 'launch-proof-promo-flow.html',
  'payment-review': 'agent-payment-launch-review.html',
  'mcp-trust': 'mcp-launch-trust-2026.html',
  'security-drill': 'agent-security-drill.html',
  'security-report': 'agent-security-sample-report.html',
  x402: 'x402-launch-checklist.html',
  'x402-batch': 'x402-batch-settlement-checklist.html',
  'x402-cors': 'x402-cors-fix.html',
  'x402-worker': 'cloudflare-x402-worker.html',
  'x402-attack-map': 'x402-attack-map-2026.html',
  'commerce-gate': 'agent-commerce-gate.html',
  'pay-pulse': 'pay-sh-catalog-pulse.html',
  'pay-skills': 'pay-skills-launch-queue.html',
  'metadata-filter': 'x402-metadata-filter.html',
  'agentcore-policy': 'agentcore-payment-policy.html',
  'commerce-report': 'agent-commerce-sample-report.html',
  shipcheck: 'shipcheck.html',
  readiness: 'release-readiness-2026.html',
  'student-kit': 'student-launch-kit.html',
  'student-review': 'student-launch-review.html',
  pay: 'payments.html',
}

function appendPrompt(command) {
  const line = document.createElement('p')
  const prompt = document.createElement('span')
  prompt.className = 'prompt'
  prompt.textContent = 'tate@programs:~$'
  line.append(prompt, ` ${command}`)
  terminalOutput.append(line)
}

function appendBlock(text) {
  const block = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = text
  block.append(code)
  terminalOutput.append(block)
}

function appendNote(text) {
  const note = document.createElement('p')
  note.className = 'dim'
  note.textContent = text
  terminalOutput.append(note)
}

function runCommand(rawCommand) {
  const command = rawCommand.trim().toLowerCase()
  if (!command) {
    return
  }

  if (command === 'clear') {
    terminalOutput.replaceChildren()
    appendNote('scrollback cleared. type help for commands.')
    return
  }

  appendPrompt(command)

  if (!commands[command]) {
    appendBlock(`command not found: ${command}\ntry: help`)
  }
  else {
    appendBlock(commands[command])
    if (routes[command]) {
      const link = document.createElement('a')
      link.className = 'terminal-open-link'
      link.href = routes[command]
      link.textContent = `open ${routes[command]}`
      terminalOutput.append(link)
    }
  }

  terminalOutput.scrollTop = terminalOutput.scrollHeight
}

terminalForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  runCommand(terminalInput.value)
  terminalInput.value = ''
})

for (const button of commandButtons) {
  button.addEventListener('click', () => {
    const command = button.dataset.command ?? ''
    terminalInput.value = command
    runCommand(command)
    terminalInput.focus()
  })
}
