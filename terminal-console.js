const terminalForm = document.querySelector('#terminalForm')
const terminalInput = document.querySelector('#terminalCommand')
const terminalOutput = document.querySelector('#terminalOutput')
const commandButtons = document.querySelectorAll('[data-command]')

const commands = {
  help: [
    'available commands:',
    '  services     list paid scopes',
    '  proof        show public artifacts',
    '  mcp-audit    open browser registry audit',
    '  shipcheck    open Shipcheck page',
    '  pricing      show fixed entry prices',
    '  contact      prepare email ticket',
    '  pay          open payment links',
    '  clear        clear terminal output',
  ].join('\n'),
  services: [
    'NAME                  PRICE    DELIVERABLE',
    'launch-risk-pass      $99      memo, evidence, fix order',
    'production-sprint     $299+    repair pass for one blocker',
    'mcp-launch-review     $99      registry/client/package report',
    'shipcheck             free     scanner, action, MCP server',
  ].join('\n'),
  proof: [
    'PUBLIC ARTIFACTS',
    'shipcheck-cli          https://www.npmjs.com/package/shipcheck-cli',
    'shipcheck-mcp          https://www.npmjs.com/package/shipcheck-mcp',
    'Shipcheck Action       GitHub Marketplace',
    'MCP Registry Audit     /mcp-registry-audit.html',
    'case files             /case-studies.html',
  ].join('\n'),
  pricing: [
    'FIXED ENTRY PRICES',
    '$99      launch risk pass',
    '$99      MCP launch review',
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
  shipcheck: [
    'open /shipcheck.html',
    'scanner for repo launch readiness, CI output, and MCP access.',
  ].join('\n'),
}

const routes = {
  'mcp-audit': 'mcp-registry-audit.html',
  shipcheck: 'shipcheck.html',
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
