import { mkdir, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1/servers'
const RUN_DATE = new Date().toISOString().slice(0, 10)
const DEFAULT_LIMIT = 300
const PAGE_SIZE = 100
const OUTPUT_DIR = 'outreach/generated'
const MESSAGE_DIR = `${OUTPUT_DIR}/mcp-prospect-messages`

const maxServers = Number.parseInt(process.argv[2] ?? `${DEFAULT_LIMIT}`, 10)
const githubToken = process.env.GITHUB_TOKEN

const headers = {
  'user-agent': 'TatePrograms-MCPProspectScanner/1.0',
  accept: 'application/json',
}

const githubHeaders = {
  ...headers,
  ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

async function fetchJson(url, customHeaders = headers) {
  const response = await fetch(url, { headers: customHeaders })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`)
  }
  return response.json()
}

async function fetchText(url, customHeaders = headers) {
  const response = await fetch(url, { headers: customHeaders })
  if (!response.ok) {
    return ''
  }
  return response.text()
}

async function fetchRegistryServers(limit) {
  const servers = []
  let cursor = ''

  while (servers.length < limit) {
    const url = new URL(REGISTRY_BASE)
    url.searchParams.set('limit', String(Math.min(PAGE_SIZE, limit - servers.length)))
    if (cursor) {
      url.searchParams.set('cursor', cursor)
    }

    const payload = await fetchJson(url)
    servers.push(...(payload.servers ?? []))
    cursor = payload.metadata?.nextCursor ?? ''
    if (!cursor || !payload.servers?.length) {
      break
    }
  }

  return servers
}

function getGithubRepo(repositoryUrl = '') {
  const match = repositoryUrl.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i)
  if (!match) {
    return null
  }
  return `${match[1]}/${match[2].replace(/\.git$/, '')}`
}

function decodeBase64(value) {
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  }
  catch {
    return ''
  }
}

async function fetchGithubRepoContext(repo) {
  if (!repo) {
    return null
  }

  try {
    const data = await fetchJson(`https://api.github.com/repos/${repo}`, githubHeaders)
    const readmePayload = await fetchJson(`https://api.github.com/repos/${repo}/readme`, githubHeaders).catch(() => null)
    const readme = readmePayload?.content ? decodeBase64(readmePayload.content) : ''

    return {
      fullName: data.full_name,
      htmlUrl: data.html_url,
      description: data.description ?? '',
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      pushedAt: data.pushed_at ?? '',
      defaultBranch: data.default_branch ?? '',
      hasIssues: Boolean(data.has_issues),
      archived: Boolean(data.archived),
      ownerType: data.owner?.type ?? '',
      readme,
    }
  }
  catch {
    return null
  }
}

function hasPattern(text, pattern) {
  return pattern.test(text)
}

function extractEmails(text) {
  const matches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []
  const blocked = /example\.com|domain\.com|email\.com|your-email|you@example|noreply|no-reply/i
  return [...new Set(matches)]
    .filter(email => !blocked.test(email))
    .slice(0, 3)
}

function analyzeServer(entry, repoContext) {
  const server = entry.server ?? {}
  const meta = entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {}
  const repo = getGithubRepo(server.repository?.url ?? '')
  const readme = repoContext?.readme ?? ''
  const packages = server.packages ?? []
  const remotes = server.remotes ?? []
  const description = server.description ?? ''
  const title = server.title ?? ''
  const contactEmails = extractEmails(readme)

  const signals = []
  const strengths = []

  if (!title) signals.push('Missing human-readable title')
  else strengths.push('Has title')

  if (!server.websiteUrl) signals.push('Missing website URL')
  else strengths.push('Has website URL')

  if (!repo) signals.push('No GitHub repository URL in registry metadata')
  else strengths.push('Registry points to GitHub repo')

  if (description.length < 90) signals.push('Short description')
  else strengths.push('Useful description length')

  if (!packages.length && remotes.length) signals.push('Remote-only listing; no package install path to test')
  if (packages.length && !hasPattern(JSON.stringify(packages), /version/i)) signals.push('Package install metadata may be thin')

  if (repoContext) {
    if (repoContext.archived) signals.push('GitHub repo is archived')
    if (!repoContext.hasIssues) signals.push('GitHub issues are disabled, making buyer contact/support harder')
    if (repoContext.openIssues > 12) signals.push('Many open issues may indicate support or install friction')
    if (!readme) {
      signals.push('README not available through GitHub API')
    }
    else {
      if (!hasPattern(readme, /mcpServers/i)) signals.push('README may lack copyable mcpServers config')
      if (!hasPattern(readme, /server\.json/i)) signals.push('README may not explain server.json or registry metadata')
      if (!hasPattern(readme, /npx|uvx|pipx|docker run|mcp install/i)) signals.push('README may lack a clear install command')
      if (!hasPattern(readme, /permission|security|safe|read-only|write|secret|token/i)) signals.push('README may lack permission or safety notes')
      if (!hasPattern(readme, /glama\.ai|quality score|badge/i)) signals.push('No visible Glama score/badge language in README')
      if (readme.length > 1500) strengths.push('README has enough depth to improve quickly')
    }
  }

  const updatedAt = meta.updatedAt ?? meta.publishedAt ?? ''
  const updatedMs = updatedAt ? Date.parse(updatedAt) : 0
  const daysSinceUpdate = updatedMs ? Math.round((Date.now() - updatedMs) / 86_400_000) : null
  if (daysSinceUpdate !== null && daysSinceUpdate <= 45) strengths.push(`Recently updated (${daysSinceUpdate}d)`)

  let score = 0
  if (repo && repoContext && !repoContext.archived) score += 30
  if (repoContext?.hasIssues) score += 12
  if (daysSinceUpdate !== null && daysSinceUpdate <= 45) score += 16
  if ((repoContext?.stars ?? 0) >= 5) score += 8
  if (signals.length >= 4) score += 18
  if (signals.some(signal => /mcpServers|install|permission|server\.json|Glama/i.test(signal))) score += 16
  if (!server.websiteUrl) score += 6
  if (repoContext?.ownerType === 'Organization') score += 5
  if (repoContext?.archived) score -= 40
  if (!repo) score -= 30

  const angle = chooseAngle(signals)

  return {
    score,
    name: server.name ?? '',
    title,
    version: server.version ?? '',
    description,
    registryUrl: `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(server.name ?? '')}`,
    updatedAt,
    daysSinceUpdate,
    repositoryUrl: server.repository?.url ?? '',
    githubRepo: repo,
    websiteUrl: server.websiteUrl ?? '',
    packageCount: packages.length,
    remoteCount: remotes.length,
    stars: repoContext?.stars ?? '',
    openIssues: repoContext?.openIssues ?? '',
    pushedAt: repoContext?.pushedAt ?? '',
    ownerType: repoContext?.ownerType ?? '',
    hasIssues: repoContext?.hasIssues ?? '',
    contactEmails,
    outreachUrl: contactEmails[0] ? `mailto:${contactEmails[0]}` : repoContext?.hasIssues ? `${repoContext.htmlUrl}/issues/new` : repoContext?.htmlUrl ?? server.websiteUrl ?? '',
    signals,
    strengths,
    angle,
  }
}

function chooseAngle(signals) {
  if (signals.some(signal => /mcpServers|install/i.test(signal))) {
    return 'Install docs and client config cleanup'
  }
  if (signals.some(signal => /permission|safety/i.test(signal))) {
    return 'Tool safety and permission notes'
  }
  if (signals.some(signal => /server\.json|registry/i.test(signal))) {
    return 'Registry metadata and server.json polish'
  }
  if (signals.some(signal => /Glama/i.test(signal))) {
    return 'Glama score and directory badge readiness'
  }
  return 'MCP launch-readiness review'
}

function csvEscape(value) {
  const stringValue = Array.isArray(value) ? value.join('; ') : String(value ?? '')
  return `"${stringValue.replace(/"/g, '""')}"`
}

function formatMarkdown(prospects) {
  const rows = prospects.map((lead, index) => {
    return [
      `### ${index + 1}. ${lead.title || lead.name}`,
      ``,
      `- Score: ${lead.score}`,
      `- Registry: ${lead.name} ${lead.version ? `v${lead.version}` : ''}`,
      `- Repo: ${lead.repositoryUrl || 'none found'}`,
      `- Contact: ${lead.contactEmails?.join(', ') || lead.outreachUrl || 'none found'}`,
      `- Outreach URL: ${lead.outreachUrl || 'none found'}`,
      `- Angle: ${lead.angle}`,
      `- Signals: ${lead.signals.slice(0, 6).join('; ')}`,
      `- Strengths: ${lead.strengths.slice(0, 4).join('; ')}`,
    ].join('\n')
  })

  return [
    `# MCP Prospects - ${RUN_DATE}`,
    ``,
    `Generated from the official MCP Registry API. Review each prospect manually before contacting anyone.`,
    ``,
    `Primary offer: https://tateprograms.com/mcp-launch-review.html`,
    `Free check: https://tateprograms.com/mcp-self-check.html`,
    ``,
    ...rows,
    ``,
  ].join('\n')
}

function formatPriorityEmailBatch(prospects) {
  const emailLeads = prospects.filter(lead => lead.contactEmails?.length).slice(0, 10)
  return [
    `# MCP Email Priority Batch - ${RUN_DATE}`,
    ``,
    `These are the prospects from the scan with public maintainer emails visible in repository docs. Review before sending.`,
    ``,
    ...emailLeads.map((lead, index) => [
      `## ${index + 1}. ${lead.title || lead.name}`,
      ``,
      `- To: ${lead.contactEmails.join(', ')}`,
      `- Repo: ${lead.repositoryUrl}`,
      `- Registry: ${lead.name} ${lead.version ? `v${lead.version}` : ''}`,
      `- Angle: ${lead.angle}`,
      `- Signals: ${lead.signals.slice(0, 4).join('; ')}`,
      `- Draft: outreach/generated/mcp-prospect-messages/${slugify(lead.githubRepo || lead.name)}.txt`,
      ``,
    ].join('\n')),
    ``,
  ].join('\n')
}

function formatMessage(lead) {
  const project = lead.title || lead.name
  const repoLine = lead.repositoryUrl ? `I found it from the MCP Registry and the linked repo: ${lead.repositoryUrl}` : `I found it from the MCP Registry: ${lead.name}`
  const signalBullets = lead.signals.slice(0, 3).map(signal => `- ${signal}`).join('\n')

  return [
    `To: ${lead.contactEmails?.[0] ?? lead.outreachUrl}`,
    `Subject: Quick MCP launch-readiness notes for ${project}`,
    ``,
    `Hi ${project} team,`,
    ``,
    `${repoLine}. I run Tate Programs, a small launch-review service focused on MCP packages and JS/TS release readiness.`,
    ``,
    `A few public-facing launch signals looked worth tightening:`,
    signalBullets,
    ``,
    `I built a free MCP self-check here: https://tateprograms.com/mcp-self-check.html`,
    ``,
    `If useful, I can do a fixed $99 MCP launch review and return a short prioritized report covering server.json/registry metadata, package install path, client config, permission notes, smoke-test proof, and directory readiness:`,
    `https://tateprograms.com/mcp-launch-review.html`,
    ``,
    `No pressure. If this is not relevant, ignore this and I will not follow up.`,
    ``,
    `Tate`,
    `Tate Programs`,
    `https://tateprograms.com/`,
    ``,
  ].join('\n')
}

await mkdir(OUTPUT_DIR, { recursive: true })
await mkdir(MESSAGE_DIR, { recursive: true })

const registryEntries = await fetchRegistryServers(maxServers)
const latestEntries = registryEntries.filter(entry => {
  return entry._meta?.['io.modelcontextprotocol.registry/official']?.isLatest === true
})

const repoContexts = new Map()
for (const entry of latestEntries) {
  const repo = getGithubRepo(entry.server?.repository?.url ?? '')
  if (repo && !repoContexts.has(repo)) {
    repoContexts.set(repo, await fetchGithubRepoContext(repo))
  }
}

const prospects = latestEntries
  .map(entry => analyzeServer(entry, repoContexts.get(getGithubRepo(entry.server?.repository?.url ?? ''))))
  .filter(lead => lead.score >= 40 && lead.githubRepo && lead.outreachUrl)
  .sort((a, b) => b.score - a.score)
  .filter((lead, index, leads) => leads.findIndex(other => other.githubRepo === lead.githubRepo) === index)
  .slice(0, 30)

const jsonPath = `${OUTPUT_DIR}/mcp-prospects-${RUN_DATE}.json`
const csvPath = `${OUTPUT_DIR}/mcp-prospects-${RUN_DATE}.csv`
const mdPath = `${OUTPUT_DIR}/mcp-prospects-${RUN_DATE}.md`
const emailBatchPath = `${OUTPUT_DIR}/mcp-email-priority-${RUN_DATE}.md`

const csvHeaders = [
  'score',
  'name',
  'title',
  'version',
  'githubRepo',
  'repositoryUrl',
  'websiteUrl',
  'contactEmails',
  'outreachUrl',
  'angle',
  'signals',
  'strengths',
  'updatedAt',
  'stars',
  'openIssues',
]

await writeFile(jsonPath, `${JSON.stringify(prospects, null, 2)}\n`)
await writeFile(
  csvPath,
  [
    csvHeaders.join(','),
    ...prospects.map(lead => csvHeaders.map(header => csvEscape(lead[header])).join(',')),
  ].join('\n') + '\n',
)
await writeFile(mdPath, formatMarkdown(prospects))
await writeFile(emailBatchPath, formatPriorityEmailBatch(prospects))

for (const lead of prospects.slice(0, 12)) {
  const filename = `${slugify(lead.githubRepo || lead.name)}.txt`
  await writeFile(`${MESSAGE_DIR}/${filename}`, formatMessage(lead))
}

console.log(`Fetched ${registryEntries.length} registry entries.`)
console.log(`Scored ${latestEntries.length} latest servers.`)
console.log(`Wrote ${prospects.length} prospects:`)
console.log(`- ${jsonPath}`)
console.log(`- ${csvPath}`)
console.log(`- ${mdPath}`)
console.log(`- ${emailBatchPath}`)
console.log(`- ${MESSAGE_DIR}/`)
