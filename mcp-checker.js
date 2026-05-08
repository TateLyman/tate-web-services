const form = document.querySelector('#mcpCheckForm')
const scoreValue = document.querySelector('#scoreValue')
const scoreTitle = document.querySelector('#scoreTitle')
const scoreSummary = document.querySelector('#scoreSummary')
const fixList = document.querySelector('#fixList')
const copyButton = document.querySelector('#copyResults')
const emailLink = document.querySelector('#emailResults')
const packageName = document.querySelector('#packageName')
const repoUrl = document.querySelector('#repoUrl')
const targetRegistry = document.querySelector('#targetRegistry')

function getCheckState() {
  const checks = [...form.querySelectorAll('input[type="checkbox"][data-fix]')]
  const checked = checks.filter(input => input.checked)
  const missing = checks.filter(input => !input.checked)
  const score = checked.reduce((total, input) => total + Number(input.value), 0)
  const risks = missing.map(input => input.dataset.fix).filter(Boolean).slice(0, 7)
  return { score, risks }
}

function getRating(score) {
  if (score >= 88) {
    return {
      title: 'Ready for directory review',
      summary: 'The package has the core launch signals covered. A manual pass should focus on smoke-test proof and registry-specific edge cases.',
    }
  }
  if (score >= 68) {
    return {
      title: 'Close, but not directory-clean yet',
      summary: 'The server probably works locally, but missing metadata or install proof can slow registry and directory acceptance.',
    }
  }
  if (score >= 36) {
    return {
      title: 'Launch blockers likely',
      summary: 'A user or directory reviewer is likely to hit confusing install steps, missing registry metadata, or unclear tool permissions.',
    }
  }
  return {
    title: 'MCP launch check not started',
    summary: 'Mark the checks that are already true. Missing items become the prioritized MCP launch-risk list.',
  }
}

function buildResultText() {
  const { score, risks } = getCheckState()
  const name = packageName.value.trim() || 'MCP server package'
  const url = repoUrl.value.trim() || 'No repo/package URL provided'
  const registry = targetRegistry.value.trim() || 'No target registry provided'
  const riskText = risks.length
    ? risks.map((risk, index) => `${index + 1}. ${risk}`).join('\n')
    : 'No urgent risks selected by the MCP self-check.'

  return `${name} MCP launch self-check
Repo/package: ${url}
Target registry/directory: ${registry}
Launch score: ${score}/100

Priority risks:
${riskText}

Prepared with the Tate Programs free MCP launch self-check.`
}

function updateCheck() {
  const { score, risks } = getCheckState()
  const rating = getRating(score)
  scoreValue.textContent = String(score)
  scoreTitle.textContent = rating.title
  scoreSummary.textContent = rating.summary

  fixList.replaceChildren()
  if (risks.length === 0) {
    const item = document.createElement('li')
    item.textContent = score > 0
      ? 'No urgent risks selected. The next step is a clean install smoke test and registry-specific review.'
      : 'Fill out the check to generate a prioritized MCP launch-risk list.'
    fixList.append(item)
  }
  else {
    for (const risk of risks) {
      const item = document.createElement('li')
      item.textContent = risk
      fixList.append(item)
    }
  }

  const body = encodeURIComponent(`${buildResultText()}\n\nI want help reviewing or fixing these MCP launch risks.`)
  emailLink.href = `mailto:hello@tateprograms.com?subject=MCP%20launch%20self-check%20result&body=${body}`
}

form.addEventListener('input', updateCheck)

copyButton.addEventListener('click', async () => {
  const text = buildResultText()
  try {
    await navigator.clipboard.writeText(text)
    copyButton.textContent = 'Copied'
    window.setTimeout(() => {
      copyButton.textContent = 'Copy result'
    }, 1600)
  }
  catch {
    copyButton.textContent = 'Select text manually'
    window.setTimeout(() => {
      copyButton.textContent = 'Copy result'
    }, 1600)
  }
})

updateCheck()
