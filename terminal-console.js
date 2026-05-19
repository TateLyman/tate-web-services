const terminalForm = document.querySelector('#terminalForm')
const terminalInput = document.querySelector('#terminalCommand')
const terminalOutput = document.querySelector('#terminalOutput')
const commandButtons = document.querySelectorAll('[data-command]')

const commands = {
  help: {
    text: [
      'commands:',
      '  pricing  fixed entry scopes',
      '  proof    recent public signals',
      '  tools    free checks and docs',
      '  process  how a review moves',
      '  contact  private request template',
      '  clear    reset terminal',
    ].join('\n'),
  },
  pricing: {
    text: [
      'fixed scopes:',
      '  $49   x402 Launch Re-check',
      '  $149  x402 Launch Review',
      '  $299  x402 Fix Sprint',
      '',
      'larger patch work is scoped after the first evidence pass.',
    ].join('\n'),
  },
  proof: {
    text: [
      'recent signals:',
      '  402 Index      paid APIs healthy + domain verified',
      '  Agentic Market implementation checks passed',
      '  Phoenix Zero   docs updated after rail mismatch note',
      '  TaskHawk       accepted accept-leg resource finding',
      '  AgentPay       provider review queue',
      '  the402         fixed-price channel onboarding',
    ].join('\n'),
  },
  tools: {
    text: [
      'free tools:',
      '  x402-surface-check.html',
      '  x402-triage-mcp.html',
      '  pay-skills-launch-queue.html',
      '  x402-metadata-filter.html',
    ].join('\n'),
    route: 'x402-surface-check.html',
  },
  process: {
    text: [
      'review process:',
      '  1. send one public surface',
      '  2. map spend, headers, receipts, metadata, failure paths',
      '  3. return private patch order',
      '  4. re-check or patch one authorized blocker',
    ].join('\n'),
  },
  contact: {
    text: [
      'email:',
      '  hello@tateprograms.com',
      '',
      'include:',
      '  surface or repo URL',
      '  protocol or payment rail',
      '  what must work before launch',
      '  deadline',
    ].join('\n'),
    route: 'mailto:hello@tateprograms.com?subject=x402%20launch%20review%20request',
  },
}

function appendLine(text, className) {
  if (!terminalOutput) return
  const line = document.createElement('p')
  if (className) line.className = className
  line.textContent = text
  terminalOutput.append(line)
}

function appendBlock(text) {
  if (!terminalOutput) return
  const block = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = text
  block.append(code)
  terminalOutput.append(block)
}

function appendRoute(route) {
  if (!terminalOutput || !route) return
  const link = document.createElement('a')
  link.className = 'rev-terminal-link'
  link.href = route
  link.textContent = route.startsWith('mailto:') ? 'open email draft' : `open ${route}`
  terminalOutput.append(link)
}

function runCommand(rawCommand) {
  if (!terminalOutput) return
  const command = String(rawCommand || 'help').trim().toLowerCase()

  if (command === 'clear') {
    terminalOutput.replaceChildren()
    return
  }

  appendLine(`$ ${command}`)
  const result = commands[command] || {
    text: `unknown command: ${command}\nrun "help" for available commands.`,
  }
  appendBlock(result.text)
  appendRoute(result.route)
  terminalOutput.scrollTop = terminalOutput.scrollHeight
}

terminalForm?.addEventListener('submit', event => {
  event.preventDefault()
  runCommand(terminalInput?.value)
  if (terminalInput) terminalInput.value = ''
})

commandButtons.forEach(button => {
  button.addEventListener('click', () => {
    const command = button.getAttribute('data-command') || 'help'
    if (terminalInput) {
      terminalInput.value = command
      terminalInput.focus()
    }
    runCommand(command)
  })
})
