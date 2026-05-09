import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const inputPath = process.argv[2] ?? `outreach/generated/mcp-prospects-${new Date().toISOString().slice(0, 10)}.json`
const outputDir = process.argv[3] ?? 'outreach/generated/mcp-prospect-reports'
const maxReports = Number.parseInt(process.argv[4] ?? '12', 10)

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function severity(signal) {
  if (/install|mcpServers|package path|permission|safety|server\.json|registry/i.test(signal)) {
    return 'medium'
  }
  if (/archived|disabled|many open issues/i.test(signal)) {
    return 'high'
  }
  return 'low'
}

function suggestedFix(signal) {
  if (/human-readable title/i.test(signal)) {
    return 'Add a clear title in registry metadata so directories and users see the product name instead of only a namespace.'
  }
  if (/website URL/i.test(signal)) {
    return 'Add a website or docs URL to give reviewers and users a stable place to verify setup, support, and trust details.'
  }
  if (/Short description/i.test(signal)) {
    return 'Rewrite the description around the user outcome, required accounts, and safest first use case.'
  }
  if (/Remote-only listing/i.test(signal)) {
    return 'Clarify whether this is remote-only, and show exactly how users connect or test it from a common MCP client.'
  }
  if (/mcpServers/i.test(signal)) {
    return 'Add a copyable mcpServers config block tested against the current package or remote endpoint.'
  }
  if (/server\.json|registry/i.test(signal)) {
    return 'Document server.json, registry name, package or remote metadata, and the version users should expect.'
  }
  if (/install command/i.test(signal)) {
    return 'Add one clean install command and one smoke-test command that a reviewer can run from a blank environment.'
  }
  if (/permission|safety/i.test(signal)) {
    return 'Add a tool-permissions table that states reads, writes, network calls, secrets, and approval-sensitive actions.'
  }
  if (/Glama/i.test(signal)) {
    return 'Add a Glama score or directory-readiness badge once the server passes public evaluation.'
  }
  return 'Review the public docs and registry metadata, then tighten the first-run path.'
}

function riskLabel(score) {
  if (score >= 100) return 'priority review target'
  if (score >= 85) return 'strong review target'
  return 'review manually'
}

function renderFinding(signal, index) {
  const level = severity(signal)
  return `<article class="finding ${level}">
            <span>${escapeHtml(level)}</span>
            <h3>${escapeHtml(signal)}</h3>
            <p>${escapeHtml(suggestedFix(signal))}</p>
          </article>`
}

function renderReport(lead) {
  const project = lead.title || lead.name
  const findings = lead.signals?.length ? lead.signals : ['Manual review needed before outreach.']
  const contact = lead.contactEmails?.length ? lead.contactEmails.join(', ') : lead.outreachUrl
  const repo = lead.repositoryUrl || 'No repository URL found'

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(project)} MCP Launch Mini-Report</title>
    <style>
      :root {
        --bg: #050806;
        --panel: #0b120f;
        --ink: #e7f6ec;
        --muted: #8fa599;
        --line: rgba(163, 255, 191, 0.18);
        --green: #79ff9d;
        --amber: #ffb454;
        --red: #ff665c;
        --cyan: #74d7ff;
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }
      * { box-sizing: border-box; }
      body {
        background:
          linear-gradient(rgba(121, 255, 157, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(121, 255, 157, 0.025) 1px, transparent 1px),
          var(--bg);
        background-size: 28px 28px;
        color: var(--ink);
        line-height: 1.55;
        margin: 0;
      }
      main { margin: 0 auto; max-width: 1120px; padding: 52px 22px; }
      a { color: var(--green); text-decoration: none; }
      .kicker { color: var(--green); font-size: 0.78rem; font-weight: 850; margin: 0 0 14px; text-transform: uppercase; }
      h1 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: clamp(2.4rem, 7vw, 5.2rem); letter-spacing: 0; line-height: 0.95; margin: 0 0 18px; }
      h2 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: clamp(1.55rem, 3vw, 2.35rem); margin: 0 0 12px; }
      h3 { margin: 0 0 8px; }
      p { color: var(--muted); margin-top: 0; }
      code { color: var(--cyan); }
      .hero { border-bottom: 1px solid var(--line); padding-bottom: 34px; }
      .grid { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(300px, 0.45fr); margin-top: 28px; }
      .card, .finding, .metric {
        background: rgba(11, 18, 15, 0.88);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 22px;
      }
      .metric strong { color: var(--green); display: block; font-size: 3rem; line-height: 1; }
      .facts { display: grid; gap: 10px; margin: 0; }
      .facts div { border-top: 1px solid var(--line); padding-top: 10px; }
      .facts dt { color: var(--muted); font-size: 0.72rem; font-weight: 850; text-transform: uppercase; }
      .facts dd { margin: 3px 0 0; overflow-wrap: anywhere; }
      .findings { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
      .section-block { margin-top: 42px; }
      .spaced-card { margin-top: 18px; }
      .finding span { color: var(--amber); display: block; font-size: 0.75rem; font-weight: 850; margin-bottom: 14px; text-transform: uppercase; }
      .finding.high span { color: var(--red); }
      .finding.medium span { color: var(--amber); }
      .finding.low span { color: var(--cyan); }
      .cta { align-items: center; display: flex; gap: 18px; justify-content: space-between; margin-top: 18px; }
      .button { background: var(--green); border-radius: 6px; color: #041007; display: inline-flex; font-weight: 850; padding: 12px 16px; }
      .small { color: var(--muted); font-size: 0.88rem; margin-top: 24px; }
      @media (max-width: 780px) {
        .grid, .findings { grid-template-columns: 1fr; }
        .cta { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="kicker">private MCP launch mini-report / manual review required</p>
        <h1>${escapeHtml(project)}</h1>
        <p>This is a pre-outreach draft generated from public registry and repository metadata. Confirm the findings manually before contacting the maintainer.</p>

        <div class="grid">
          <section class="card">
            <h2>Suggested angle</h2>
            <p>${escapeHtml(lead.angle)}</p>
            <dl class="facts">
              <div><dt>Registry name</dt><dd>${escapeHtml(lead.name)} ${lead.version ? `v${escapeHtml(lead.version)}` : ''}</dd></div>
              <div><dt>Repository</dt><dd>${repo.startsWith('http') ? `<a href="${escapeHtml(repo)}">${escapeHtml(repo)}</a>` : escapeHtml(repo)}</dd></div>
              <div><dt>Contact</dt><dd>${escapeHtml(contact || 'No direct contact found')}</dd></div>
              <div><dt>Last registry update</dt><dd>${escapeHtml(lead.updatedAt || 'Unknown')}</dd></div>
            </dl>
          </section>

          <aside class="metric">
            <strong>${escapeHtml(lead.score)}</strong>
            <span>${escapeHtml(riskLabel(Number(lead.score)))}</span>
          </aside>
        </div>
      </section>

      <section class="section-block">
        <p class="kicker">findings</p>
        <h2>Public launch signals to verify.</h2>
        <div class="findings">
          ${findings.slice(0, 8).map(renderFinding).join('\n          ')}
        </div>
      </section>

      <section class="card spaced-card">
        <div class="cta">
          <div>
            <p class="kicker">offer fit</p>
            <h2>$99 MCP launch review</h2>
            <p>Best positioned as a short report covering registry metadata, package or remote install path, client config, permission notes, smoke-test proof, and directory readiness.</p>
          </div>
          <a class="button" href="https://tateprograms.com/mcp-launch-review.html">Review offer</a>
        </div>
      </section>

      <p class="small">Generated locally by Tate Programs. Do not publish this report without permission from the project owner.</p>
    </main>
  </body>
</html>`
}

const prospects = JSON.parse(await readFile(inputPath, 'utf8'))
const reportLeads = prospects
  .filter(lead => lead.githubRepo && lead.outreachUrl)
  .slice(0, maxReports)

await mkdir(outputDir, { recursive: true })

for (const lead of reportLeads) {
  const filename = `${slugify(lead.githubRepo || lead.name)}.html`
  await writeFile(join(outputDir, filename), renderReport(lead))
  console.log(`Wrote ${join(outputDir, filename)}`)
}
