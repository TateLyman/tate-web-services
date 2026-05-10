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
    '  security-drill open agent-security drill kit',
    '  x402         open x402 launch checklist',
    '  commerce-gate open agent-commerce readiness gate',
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
    'security       $149    drill report',
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
    'security drill   prompt injection, policy, audit, and review readiness',
    'x402 checklist   launch controls for payment agents',
    'commerce gate    x402, Pay.sh, and payment-agent readiness check',
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
  'security-drill': [
    'open /agent-security-drill.html',
    'browser-only drill kit for agent security launches: prompt injection, exfiltration, unsafe tool use, policy actions, audit trails, rate limits, safe demos, and human review gates.',
  ].join('\n'),
  x402: [
    'open /x402-launch-checklist.html',
    'launch checklist for x402 and Pay.sh demos: sandbox mode, spend caps, approval gates, receipts, replay protection, PII-safe payment metadata, and failure paths.',
  ].join('\n'),
  'commerce-gate': [
    'open /agent-commerce-gate.html',
    'browser-only readiness check for x402, Pay.sh, API-payment, and agent-commerce prototypes: price previews, enforceable caps, receipts, replay protection, provider validation, metadata filtering, and payment abuse controls.',
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
  'security-drill': 'agent-security-drill.html',
  x402: 'x402-launch-checklist.html',
  'commerce-gate': 'agent-commerce-gate.html',
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
