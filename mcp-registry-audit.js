const registryJson = document.querySelector('#registryJson')
const repoUrl = document.querySelector('#repoUrl')
const runAuditButton = document.querySelector('#runAudit')
const loadSampleButton = document.querySelector('#loadSample')
const clearAuditButton = document.querySelector('#clearAudit')
const scoreValue = document.querySelector('#scoreValue')
const scoreTitle = document.querySelector('#scoreTitle')
const scoreSummary = document.querySelector('#scoreSummary')
const findingList = document.querySelector('#findingList')
const auditFacts = document.querySelector('#auditFacts')
const copyButton = document.querySelector('#copyResults')
const emailLink = document.querySelector('#emailResults')

let lastReportText = ''

const sampleServer = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  name: 'io.github.example/weather-mcp',
  title: 'Weather MCP',
  description: 'Weather forecast tools for MCP clients.',
  version: '1.0.0',
  repository: {
    url: 'https://github.com/example/weather-mcp',
    source: 'github',
  },
  packages: [
    {
      registryType: 'npm',
      identifier: '@example/weather-mcp',
      version: 'latest',
      transport: {
        type: 'stdio',
      },
    },
  ],
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function repoSlug(value = '') {
  const match = value.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i)
  if (!match) {
    return ''
  }
  return `${match[1]}/${match[2].replace(/\.git$/, '')}`
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
    },
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function fetchRepoContext(repo) {
  if (!repo) {
    return null
  }

  const context = {
    repo,
    readme: '',
    packageJson: null,
    serverJson: null,
    files: [],
    metadata: null,
    errors: [],
  }

  try {
    context.metadata = await fetchJson(`https://api.github.com/repos/${repo}`)
  }
  catch (error) {
    context.errors.push(`Could not fetch GitHub repo metadata: ${error.message}`)
    return context
  }

  try {
    const root = await fetchJson(`https://api.github.com/repos/${repo}/contents`)
    context.files = Array.isArray(root) ? root.map(file => file.name) : []
  }
  catch (error) {
    context.errors.push(`Could not read repo root files: ${error.message}`)
  }

  try {
    const readmePayload = await fetchJson(`https://api.github.com/repos/${repo}/readme`)
    context.readme = readmePayload.content ? decodeBase64(readmePayload.content) : ''
  }
  catch (error) {
    context.errors.push(`Could not read README: ${error.message}`)
  }

  for (const filename of ['package.json', 'server.json']) {
    try {
      const payload = await fetchJson(`https://api.github.com/repos/${repo}/contents/${filename}`)
      const text = payload.content ? decodeBase64(payload.content) : ''
      context[filename === 'package.json' ? 'packageJson' : 'serverJson'] = JSON.parse(text)
    }
    catch {
      context[filename === 'package.json' ? 'packageJson' : 'serverJson'] = null
    }
  }

  return context
}

function parseServerJson() {
  const raw = registryJson.value.trim()
  if (!raw) {
    throw new Error('Paste server.json or a Registry API entry first.')
  }

  const parsed = JSON.parse(raw)
  return parsed.server ?? parsed
}

function hasPattern(text, pattern) {
  return pattern.test(text || '')
}

function analyze(server, repoContext) {
  const findings = []
  const facts = []

  function add(level, title, detail, fix) {
    const penalty = level === 'high' ? 16 : level === 'medium' ? 9 : 4
    findings.push({ level, title, detail, fix, penalty })
  }

  if (!server.name) {
    add('high', 'Missing server name', 'The registry entry needs a stable unique server name.', 'Add a namespace-qualified name that matches the package ownership path.')
  }
  if (!server.title) {
    add('medium', 'Missing human-readable title', 'Directories and clients may show only the namespace string.', 'Add a concise title that matches the product or server name.')
  }
  if (!server.description || server.description.length < 80) {
    add('medium', 'Description is too thin', 'Short descriptions make directory listings harder to trust and search.', 'Explain the user outcome, required account, and safest first workflow.')
  }
  if (!server.version) {
    add('high', 'Missing server version', 'Registry submissions need a version trail users and reviewers can reproduce.', 'Set a concrete version and keep it aligned with release notes or package versions.')
  }
  if (!server.websiteUrl) {
    add('low', 'Registry websiteUrl is blank', 'The repo may have a homepage, but the registry metadata does not expose it.', 'Add the product, docs, or setup URL to the registry metadata.')
  }
  if (!server.repository?.url && !repoContext?.repo) {
    add('medium', 'Repository URL is missing', 'Reviewers have no stable source location to inspect.', 'Add the GitHub repository URL in server metadata.')
  }

  const packages = Array.isArray(server.packages) ? server.packages : []
  const remotes = Array.isArray(server.remotes) ? server.remotes : []
  if (!packages.length && !remotes.length) {
    add('high', 'No package or remote target', 'The metadata does not say how a client should install or connect.', 'Add a packages entry, a remotes entry, or both.')
  }

  for (const [index, remote] of remotes.entries()) {
    if (!remote.type) {
      add('medium', `Remote ${index + 1} has no transport type`, 'Clients need to know whether the endpoint is streamable HTTP or SSE.', 'Set remotes[].type to streamable-http or sse.')
    }
    if (remote.type === 'sse') {
      add('low', `Remote ${index + 1} uses SSE`, 'SSE can work, but streamable HTTP is the newer recommended path for remote servers.', 'Support streamable HTTP when possible, or document why SSE is required.')
    }
    if (!/^https:\/\//i.test(remote.url || '')) {
      add('medium', `Remote ${index + 1} is not HTTPS`, 'Public remote servers should use HTTPS endpoints.', 'Use a stable https:// MCP endpoint.')
    }
  }

  for (const [index, pkg] of packages.entries()) {
    if (!pkg.registryType) {
      add('medium', `Package ${index + 1} has no registryType`, 'The registry needs to know which package ecosystem owns this install path.', 'Set registryType such as npm, pypi, docker, nuget, mcpb, github, or gitlab.')
    }
    if (!pkg.identifier) {
      add('high', `Package ${index + 1} has no identifier`, 'Users and clients cannot resolve the package without a package identifier.', 'Add the exact package name or artifact identifier.')
    }
    if (!pkg.version || pkg.version === 'latest') {
      add('medium', `Package ${index + 1} version is not pinned`, 'Floating versions make smoke-test results hard to reproduce.', 'Pin the exact package version that was tested.')
    }
    if (!pkg.transport?.type) {
      add('medium', `Package ${index + 1} has no transport type`, 'A package install needs the transport the host should launch.', 'Set packages[].transport.type, usually stdio for local packages.')
    }
  }

  if (repoContext) {
    const files = new Set(repoContext.files)
    const readme = repoContext.readme
    facts.push(`GitHub repo: ${repoContext.repo}`)
    if (repoContext.metadata?.homepage) {
      facts.push(`GitHub homepage: ${repoContext.metadata.homepage}`)
    }
    if (repoContext.metadata?.stargazers_count !== undefined) {
      facts.push(`Stars: ${repoContext.metadata.stargazers_count}`)
    }

    if (!files.has('server.json')) {
      add('medium', 'Repo root has no server.json', 'A visible server.json makes registry metadata easier to review and reproduce.', 'Commit server.json or document where the registry metadata is generated from.')
    }
    if (!hasPattern(readme, /mcpServers/i)) {
      add('medium', 'README lacks copyable mcpServers config', 'Many users still need a concrete client config block.', 'Add a tested mcpServers example for a common MCP client.')
    }
    if (!hasPattern(readme, /npx|uvx|pipx|docker run|npm install|mcp install|claude mcp add|smithery/i)) {
      add('medium', 'README lacks a clear install or connect command', 'Users should not infer the first-run command.', 'Add one install/connect command and one expected success result.')
    }
    if (!hasPattern(readme, /server\.json/i)) {
      add('low', 'README does not explain server.json', 'The registry metadata path is not obvious from the README.', 'Mention server.json, the registry name, and how version updates are handled.')
    }
    if (!hasPattern(readme, /permission|security|safe|read-only|write|secret|token|api key|oauth|auth/i)) {
      add('medium', 'Permission and secret notes are thin', 'Users need to know what tools can read, write, call over the network, or require secrets.', 'Add a tool-permission table or short security section.')
    }
    if (!hasPattern(readme, /smoke test|inspector|tool list|tools\/list|expected output|verify/i)) {
      add('low', 'No visible smoke-test trail', 'Reviewers cannot quickly see what a successful connection should return.', 'Document the command/client used and the expected tool-list result.')
    }
    if (!hasPattern(readme, /glama\.ai|quality score|badge|directory/i)) {
      add('low', 'No visible directory proof badge', 'Directory proof is useful when users compare unfamiliar MCP servers.', 'Add Glama or directory-readiness proof after the server is evaluated.')
    }
    if (!files.has('SECURITY.md') && !hasPattern(readme, /security/i)) {
      add('low', 'No visible security policy', 'Security contact and vulnerability handling are unclear.', 'Add SECURITY.md or a short vulnerability-reporting note.')
    }

    const npmPackage = packages.find(pkg => pkg.registryType === 'npm')
    if (npmPackage && repoContext.packageJson) {
      if (repoContext.packageJson.mcpName !== server.name) {
        add(
          'high',
          'npm mcpName does not match server name',
          `package.json has ${repoContext.packageJson.mcpName || 'no mcpName'}, while server.json uses ${server.name || 'no name'}.`,
          'Set package.json mcpName to exactly match server.json name before publishing.',
        )
      }
    }
  }
  else {
    facts.push('No GitHub repo checked')
  }

  for (const error of repoContext?.errors ?? []) {
    add('low', 'Public repo check was incomplete', error, 'Retry later or paste the relevant README/package metadata manually.')
  }

  const penalty = findings.reduce((total, finding) => total + finding.penalty, 0)
  const score = Math.max(0, Math.min(100, 100 - penalty))
  return {
    score,
    findings: findings.sort((a, b) => b.penalty - a.penalty),
    facts,
  }
}

function ratingFor(score) {
  if (score >= 84) {
    return {
      title: 'Registry-ready with minor proof gaps',
      summary: 'The public metadata has the major pieces. Manual review should focus on smoke-test proof and client-specific edge cases.',
    }
  }
  if (score >= 64) {
    return {
      title: 'Close, but listing polish is still needed',
      summary: 'The server may work, but the metadata or README still leaves avoidable reviewer/user friction.',
    }
  }
  return {
    title: 'Launch blockers likely',
    summary: 'The public metadata is missing enough detail that first users or directory reviewers may fail before the server gets a fair try.',
  }
}

function findingText(finding, index) {
  return `${index + 1}. [${finding.level.toUpperCase()}] ${finding.title}
   Evidence: ${finding.detail}
   Fix: ${finding.fix}`
}

function buildReportText(server, report) {
  const findingLines = report.findings.length
    ? report.findings.map(findingText).join('\n\n')
    : 'No major public metadata risks found by this browser audit.'

  return `MCP registry audit
Server: ${server.title || server.name || 'Untitled MCP server'}
Name: ${server.name || 'missing'}
Version: ${server.version || 'missing'}
Score: ${report.score}/100

Facts:
${report.facts.map(fact => `- ${fact}`).join('\n') || '- No repo facts checked'}

Priority findings:
${findingLines}

Generated with Tate Programs MCP Registry Audit:
https://tateprograms.com/mcp-registry-audit.html`
}

function renderFindings(report) {
  findingList.replaceChildren()
  if (!report.findings.length) {
    const item = document.createElement('li')
    item.textContent = 'No major public metadata risks found by this browser audit.'
    findingList.append(item)
    return
  }

  for (const finding of report.findings.slice(0, 8)) {
    const item = document.createElement('li')
    const label = document.createElement('strong')
    label.textContent = `${finding.level}: ${finding.title}`
    const detail = document.createElement('span')
    detail.textContent = ` ${finding.fix}`
    item.append(label, detail)
    findingList.append(item)
  }
}

function renderFacts(report) {
  auditFacts.replaceChildren()
  auditFacts.hidden = !report.facts.length
  for (const fact of report.facts.slice(0, 5)) {
    const item = document.createElement('div')
    item.textContent = fact
    auditFacts.append(item)
  }
}

async function runAudit() {
  runAuditButton.textContent = 'checking...'
  runAuditButton.disabled = true
  try {
    const server = parseServerJson()
    const repo = repoSlug(repoUrl.value.trim() || server.repository?.url || '')
    const repoContext = await fetchRepoContext(repo)
    const report = analyze(server, repoContext)
    const rating = ratingFor(report.score)
    scoreValue.textContent = String(report.score)
    scoreTitle.textContent = rating.title
    scoreSummary.textContent = rating.summary
    renderFindings(report)
    renderFacts(report)
    lastReportText = buildReportText(server, report)
    emailLink.href = `mailto:hello@tateprograms.com?subject=MCP%20registry%20audit%20result&body=${encodeURIComponent(`${lastReportText}\n\nI want help reviewing or fixing these MCP launch risks.`)}`
  }
  catch (error) {
    scoreValue.textContent = '0'
    scoreTitle.textContent = 'Audit could not run'
    scoreSummary.textContent = error.message
    findingList.replaceChildren()
    const item = document.createElement('li')
    item.textContent = 'Check that the pasted metadata is valid JSON.'
    findingList.append(item)
    auditFacts.hidden = true
    lastReportText = ''
  }
  finally {
    runAuditButton.textContent = 'run audit'
    runAuditButton.disabled = false
  }
}

loadSampleButton.addEventListener('click', () => {
  registryJson.value = JSON.stringify(sampleServer, null, 2)
  repoUrl.value = ''
  registryJson.focus()
})

clearAuditButton.addEventListener('click', () => {
  registryJson.value = ''
  repoUrl.value = ''
  scoreValue.textContent = '0'
  scoreTitle.textContent = 'Audit not run yet'
  scoreSummary.textContent = 'Paste server metadata and a GitHub repo, then run the audit. Everything runs in the browser against public metadata.'
  findingList.replaceChildren()
  const item = document.createElement('li')
  item.textContent = 'Run the audit to generate a prioritized registry-readiness report.'
  findingList.append(item)
  auditFacts.hidden = true
  lastReportText = ''
})

runAuditButton.addEventListener('click', runAudit)

copyButton.addEventListener('click', async () => {
  if (!lastReportText) {
    copyButton.textContent = 'Run audit first'
    window.setTimeout(() => {
      copyButton.textContent = 'copy report'
    }, 1600)
    return
  }
  try {
    await navigator.clipboard.writeText(lastReportText)
    copyButton.textContent = 'copied'
  }
  catch {
    copyButton.textContent = 'copy failed'
  }
  window.setTimeout(() => {
    copyButton.textContent = 'copy report'
  }, 1600)
})
