import { writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1/servers'
const RUN_DATE = new Date().toISOString().slice(0, 10)
const DEFAULT_LIMIT = 300
const PAGE_SIZE = 100
const OUTPUT_PATH = 'mcp-registry-pulse.html'
const OUTPUT_JSON_PATH = 'mcp-registry-pulse.json'

const maxServers = Number.parseInt(process.argv[2] ?? `${DEFAULT_LIMIT}`, 10)
const githubToken = process.env.GITHUB_TOKEN

const headers = {
  'user-agent': 'TatePrograms-MCPRegistryPulse/1.0',
  accept: 'application/json',
}

const githubHeaders = {
  ...headers,
  ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function percent(count, total) {
  return total ? Math.round((count / total) * 100) : 0
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

async function fetchJson(url, customHeaders = headers) {
  const response = await fetch(url, { headers: customHeaders })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`)
  }
  return response.json()
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

async function fetchGithubRepoContext(repo) {
  if (!repo) {
    return null
  }

  try {
    const [repoData, readmePayload] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${repo}`, githubHeaders),
      fetchJson(`https://api.github.com/repos/${repo}/readme`, githubHeaders).catch(() => null),
    ])

    return {
      fullName: repoData.full_name,
      htmlUrl: repoData.html_url,
      homepageUrl: repoData.homepage ?? '',
      stars: repoData.stargazers_count ?? 0,
      forks: repoData.forks_count ?? 0,
      openIssues: repoData.open_issues_count ?? 0,
      pushedAt: repoData.pushed_at ?? '',
      archived: Boolean(repoData.archived),
      hasIssues: Boolean(repoData.has_issues),
      ownerType: repoData.owner?.type ?? '',
      readme: readmePayload?.content ? decodeBase64(readmePayload.content) : '',
    }
  }
  catch {
    return null
  }
}

function extractReadmeWebsite(readme) {
  const urls = [...readme.matchAll(/https?:\/\/[^\s)"'<>]+/gi)].map(match => match[0].replace(/[.,;:]+$/, ''))
  const blocked = /github\.com|githubusercontent\.com|img\.shields\.io|glama\.ai|modelcontextprotocol\.io|npmjs\.com|oauth\.net|opensource\.org/i
  return urls.find(url => !blocked.test(url)) ?? ''
}

function readmeSignals(readme = '') {
  return {
    mcpServers: /mcpServers/i.test(readme),
    install: /npx|uvx|pipx|docker run|mcp install|claude mcp add|codex mcp add/i.test(readme),
    serverJson: /server\.json/i.test(readme),
    safety: /permission|security|safe|read-only|write|secret|token|destructive|approve/i.test(readme),
    glama: /glama\.ai|quality score|badge/i.test(readme),
    smoke: /smoke|inspector|tools\/list|test command|expected tool/i.test(readme),
  }
}

function latestMeta(entry) {
  return entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {}
}

function summarize(latestEntries, repoContexts) {
  const rows = latestEntries.map(entry => {
    const server = entry.server ?? {}
    const repo = getGithubRepo(server.repository?.url ?? '')
    const repoContext = repoContexts.get(repo) ?? null
    const readme = repoContext?.readme ?? ''
    const signals = readmeSignals(readme)
    const packages = server.packages ?? []
    const remotes = server.remotes ?? []
    const meta = latestMeta(entry)
    const updatedAt = meta.updatedAt ?? meta.publishedAt ?? ''
    const updatedMs = updatedAt ? Date.parse(updatedAt) : 0
    const daysSinceUpdate = updatedMs ? Math.round((Date.now() - updatedMs) / 86_400_000) : null
    const websiteUrl = server.websiteUrl || repoContext?.homepageUrl || extractReadmeWebsite(readme)

    return {
      name: server.name ?? '',
      title: server.title ?? '',
      description: server.description ?? '',
      websiteUrl,
      repo,
      repoContext,
      packages,
      remotes,
      signals,
      updatedAt,
      daysSinceUpdate,
    }
  })

  const repos = rows.filter(row => row.repo)
  const readableRepos = rows.filter(row => row.repoContext?.readme)
  const latestTotal = rows.length
  const readmeTotal = readableRepos.length
  const packageCount = rows.filter(row => row.packages.length).length
  const remoteCount = rows.filter(row => row.remotes.length).length
  const packageOnly = rows.filter(row => row.packages.length && !row.remotes.length).length
  const remoteOnly = rows.filter(row => row.remotes.length && !row.packages.length).length
  const both = rows.filter(row => row.remotes.length && row.packages.length).length

  return {
    rows,
    totals: {
      latestTotal,
      repos: repos.length,
      readableRepos: readmeTotal,
      packageCount,
      remoteCount,
      packageOnly,
      remoteOnly,
      both,
      noInstallPath: rows.filter(row => !row.packages.length && row.remotes.length).length,
      websiteVisible: rows.filter(row => row.websiteUrl).length,
      missingTitle: rows.filter(row => !row.title).length,
      shortDescription: rows.filter(row => row.description.length < 90).length,
      recent45: rows.filter(row => row.daysSinceUpdate !== null && row.daysSinceUpdate <= 45).length,
      orgOwned: rows.filter(row => row.repoContext?.ownerType === 'Organization').length,
      issuesEnabled: rows.filter(row => row.repoContext?.hasIssues).length,
      archived: rows.filter(row => row.repoContext?.archived).length,
      mcpServers: readableRepos.filter(row => row.signals.mcpServers).length,
      install: readableRepos.filter(row => row.signals.install).length,
      serverJson: readableRepos.filter(row => row.signals.serverJson).length,
      safety: readableRepos.filter(row => row.signals.safety).length,
      glama: readableRepos.filter(row => row.signals.glama).length,
      smoke: readableRepos.filter(row => row.signals.smoke).length,
    },
  }
}

function metricCard(label, value, subcopy) {
  return `<article class="console-card pulse-metric">
            <p class="card-command">${escapeHtml(label)}</p>
            <strong>${escapeHtml(value)}</strong>
            <p>${escapeHtml(subcopy)}</p>
          </article>`
}

function bar(label, count, total, note) {
  const width = Math.round(percent(count, total) / 5) * 5
  return `<div class="pulse-bar-row">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(count)} / ${escapeHtml(total)} ${note ? `- ${escapeHtml(note)}` : ''}</span>
            </div>
            <i class="pulse-width-${width}"></i>
          </div>`
}

function renderPage(summary, fetchedTotal) {
  const { totals } = summary
  const readmeTotal = totals.readableRepos || 1
  const latestTotal = totals.latestTotal || 1

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MCP Registry Pulse | Tate Programs</title>
    <meta name="description" content="A public snapshot of MCP Registry launch-readiness signals across current server metadata, package paths, README install docs, safety notes, and directory proof.">
    <link rel="canonical" href="https://tateprograms.com/mcp-registry-pulse.html">
    <meta property="og:type" content="article">
    <meta property="og:title" content="MCP Registry Pulse">
    <meta property="og:description" content="A public snapshot of MCP launch-readiness signals from Tate Programs.">
    <meta property="og:url" content="https://tateprograms.com/mcp-registry-pulse.html">
    <link rel="stylesheet" href="styles.css">
  </head>
  <body class="console-home terminal-os shell-page">
    <header class="os-topbar">
      <a class="os-brand" href="index.html" aria-label="Tate Programs home">
        <span class="os-mark">tp</span>
        <span>tate@programs</span>
      </a>
      <nav class="os-tabs" aria-label="Primary navigation">
        <a href="index.html#workbench">workbench</a>
        <a href="shipcheck.html">shipcheck</a>
        <a href="mcp-registry-audit.html">mcp-audit</a>
        <a href="mcp-registry-pulse.html">pulse</a>
        <a href="mcp-directory-checklist.html">checklist</a>
        <a href="case-studies.html">proof</a>
        <a href="payments.html">pay</a>
      </nav>
      <a class="os-status" href="mailto:hello@tateprograms.com?subject=MCP%20registry%20pulse">
        <span></span>
        pulse live
      </a>
    </header>

    <main>
      <div class="shell-pathline">
        <span>tate@programs</span>
        <strong>~/notes/mcp-registry-pulse</strong>
        <em>${escapeHtml(RUN_DATE)}</em>
      </div>

      <section class="console-hero console-page-hero">
        <div class="console-copy">
          <p class="console-kicker">public registry snapshot</p>
          <h1>MCP Registry Pulse.</h1>
          <p class="console-subtitle">
            A launch-readiness snapshot across current MCP Registry metadata and linked GitHub repos. This is aggregate analysis only: it shows where server launches tend to lose trust before a user ever connects a client.
          </p>
          <div class="console-actions">
            <a class="console-button primary" href="#pulse-findings">read pulse</a>
            <a class="console-button secondary" href="mcp-registry-audit.html">run free audit</a>
            <a class="console-button ghost" href="mcp-directory-checklist.html">open checklist</a>
            <a class="console-button ghost" href="mcp-launch-review.html">paid review</a>
          </div>
          <dl class="console-ledger">
            <div>
              <dt>generated</dt>
              <dd>${escapeHtml(RUN_DATE)}</dd>
            </div>
            <div>
              <dt>registry rows</dt>
              <dd>${escapeHtml(fetchedTotal)}</dd>
            </div>
            <div>
              <dt>latest servers</dt>
              <dd>${escapeHtml(totals.latestTotal)}</dd>
            </div>
          </dl>
        </div>

        <aside class="terminal-window" aria-label="MCP pulse terminal">
          <div class="terminal-topline">pulse run</div>
          <pre><code>$ node scripts/render-mcp-registry-pulse.mjs
registry entries: ${escapeHtml(fetchedTotal)}
latest servers:   ${escapeHtml(totals.latestTotal)}
github repos:     ${escapeHtml(totals.repos)}
readme sampled:   ${escapeHtml(totals.readableRepos)}
output:           mcp-registry-pulse.html
data:             mcp-registry-pulse.json</code></pre>
        </aside>
      </section>

      <section id="pulse-findings" class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">topline</p>
          <h2>The launch bar is now metadata plus first-run proof.</h2>
        </div>
        <div class="console-card-grid">
          ${metricCard('latest servers', totals.latestTotal, 'Official registry entries marked latest in the fetched window.')}
          ${metricCard('github repos', `${totals.repos} (${percent(totals.repos, latestTotal)}%)`, 'Listings with a GitHub repository URL attached.')}
          ${metricCard('website visible', `${totals.websiteVisible} (${percent(totals.websiteVisible, latestTotal)}%)`, 'Website URL visible in registry metadata, GitHub homepage, or README.')}
          ${metricCard('recent movement', `${totals.recent45} (${percent(totals.recent45, latestTotal)}%)`, 'Latest metadata updated within the last 45 days.')}
          ${metricCard('package path', `${totals.packageCount} (${percent(totals.packageCount, latestTotal)}%)`, 'Listings with package install metadata.')}
          ${metricCard('remote path', `${totals.remoteCount} (${percent(totals.remoteCount, latestTotal)}%)`, 'Listings with hosted remote server metadata.')}
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">surface gaps</p>
          <h2>Common public proof gaps in the current registry sample.</h2>
        </div>
        <div class="pulse-bars">
          ${bar('Short registry descriptions', totals.shortDescription, latestTotal, 'harder to understand quickly')}
          ${bar('Missing human-readable title', totals.missingTitle, latestTotal, 'namespace carries the listing')}
          ${bar('Remote-only with no package path', totals.noInstallPath, latestTotal, 'hosted flow must explain trust and auth clearly')}
          ${bar('README includes copyable mcpServers config', totals.mcpServers, readmeTotal, 'among readable GitHub READMEs')}
          ${bar('README mentions install or client command', totals.install, readmeTotal, 'among readable GitHub READMEs')}
          ${bar('README mentions permissions or safety', totals.safety, readmeTotal, 'among readable GitHub READMEs')}
          ${bar('README mentions server.json', totals.serverJson, readmeTotal, 'among readable GitHub READMEs')}
          ${bar('README includes smoke-test language', totals.smoke, readmeTotal, 'among readable GitHub READMEs')}
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head split">
          <div>
            <p class="console-kicker">interpretation</p>
            <h2>What this means for maintainers.</h2>
          </div>
          <a class="console-link" href="mcp-directory-checklist.html">open checklist</a>
        </div>
        <div class="proof-terminal-grid">
          <article>
            <p class="card-command">01</p>
            <h3>Remote servers need more trust copy, not less.</h3>
            <p>When there is no local package path, the public docs need to make auth, transport, permissions, data access, and support boundaries easy to inspect.</p>
          </article>
          <article>
            <p class="card-command">02</p>
            <h3>Registry metadata should mirror the README's best proof.</h3>
            <p>A strong README still loses value if the registry title, website, package path, and description do not surface the same clarity.</p>
          </article>
          <article>
            <p class="card-command">03</p>
            <h3>Directory acceptance is becoming a launch system.</h3>
            <p>The strongest submissions create a proof trail: package, registry metadata, smoke test, safety notes, score page, and curated PR context.</p>
          </article>
          <article>
            <p class="card-command">04</p>
            <h3>Small docs fixes are commercial leverage.</h3>
            <p>Clear install paths reduce support load, make buyers more comfortable, and give directory maintainers fewer reasons to skip a listing.</p>
          </article>
        </div>
      </section>

      <section class="console-section">
        <div class="console-section-head">
          <p class="console-kicker">sources and method</p>
          <h2>Public metadata, conservative scoring.</h2>
        </div>
        <div class="proof-terminal-grid">
          <article>
            <p class="card-command">registry</p>
            <h3>Official MCP Registry API</h3>
            <p>Fetched ${escapeHtml(fetchedTotal)} registry entries from the public API and kept entries whose official metadata marked them latest.</p>
            <a href="https://registry.modelcontextprotocol.io/v0.1/servers" target="_blank" rel="noreferrer">registry endpoint</a>
          </article>
          <article>
            <p class="card-command">docs</p>
            <h3>MCP Registry docs</h3>
            <p>The public registry flow uses server metadata for discovery. This pulse treats metadata clarity as part of launch readiness.</p>
            <a href="https://modelcontextprotocol.io/registry/quickstart" target="_blank" rel="noreferrer">registry quickstart</a>
          </article>
          <article>
            <p class="card-command">github</p>
            <h3>Linked GitHub repos</h3>
            <p>When a listing exposed a GitHub repo, the script read public repo metadata and README text. Private code and private docs were not inspected.</p>
            <a href="mcp-registry-pulse.json">aggregate JSON</a>
          </article>
          <article>
            <p class="card-command">shipcheck</p>
            <h3>Repeatable review path</h3>
            <p>Shipcheck turns the same launch-readiness ideas into a local scanner, GitHub Action, MCP server, and paid review workflow.</p>
            <a href="shipcheck.html">open Shipcheck</a>
          </article>
        </div>
      </section>

      <section class="console-cta">
        <div>
          <p class="console-kicker">use the pulse</p>
          <h2>Run the free audit before submitting a server.</h2>
          <p>Paste your metadata and public repo, then use the checklist or a fixed review to close the gaps.</p>
        </div>
        <a class="console-button primary" href="mcp-registry-audit.html">run free audit</a>
      </section>
    </main>

    <footer class="terminal-footer">
      <span>MCP Registry Pulse</span>
      <a href="mailto:hello@tateprograms.com">hello@tateprograms.com</a>
      <a href="mcp-registry-audit.html">registry audit</a>
      <a href="mcp-directory-checklist.html">checklist</a>
      <a href="mcp-launch-review.html">paid review</a>
      <a href="shipcheck.html">shipcheck</a>
    </footer>
  </body>
</html>`
}

function renderJson(summary, fetchedTotal) {
  return JSON.stringify({
    generatedAt: RUN_DATE,
    source: REGISTRY_BASE,
    fetchedEntries: fetchedTotal,
    latestServersAnalyzed: summary.totals.latestTotal,
    githubReposDetected: summary.totals.repos,
    readmesSampled: summary.totals.readableRepos,
    method: [
      'Fetched public MCP Registry entries.',
      'Kept entries marked latest by official registry metadata.',
      'Read linked public GitHub repo metadata and README text when available.',
      'Reported aggregate launch-readiness signals only.'
    ],
    totals: summary.totals
  }, null, 2)
}

const registryEntries = await fetchRegistryServers(maxServers)
const latestEntries = registryEntries.filter(entry => latestMeta(entry)?.isLatest === true)

const repoContexts = new Map()
for (const entry of latestEntries) {
  const repo = getGithubRepo(entry.server?.repository?.url ?? '')
  if (repo && !repoContexts.has(repo)) {
    repoContexts.set(repo, await fetchGithubRepoContext(repo))
  }
}

const summary = summarize(latestEntries, repoContexts)
await writeFile(OUTPUT_PATH, renderPage(summary, registryEntries.length))
await writeFile(OUTPUT_JSON_PATH, `${renderJson(summary, registryEntries.length)}\n`)
console.log(`Fetched ${registryEntries.length} registry entries.`)
console.log(`Analyzed ${summary.totals.latestTotal} latest servers.`)
console.log(`Wrote ${OUTPUT_PATH}.`)
console.log(`Wrote ${OUTPUT_JSON_PATH}.`)
