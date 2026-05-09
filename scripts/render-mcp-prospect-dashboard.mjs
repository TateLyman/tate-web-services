import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const runDate = new Date().toISOString().slice(0, 10)
const inputPath = process.argv[2] ?? `outreach/generated/mcp-prospects-${runDate}.json`
const outputPath = process.argv[3] ?? `outreach/generated/mcp-prospect-dashboard-${runDate}.html`

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

function encodeMailbox(value) {
  return value.split(',').map(part => encodeURIComponent(part.trim())).join(',')
}

async function readDraft(slug) {
  const draftPath = `outreach/generated/mcp-prospect-messages/${slug}.txt`
  try {
    return await readFile(draftPath, 'utf8')
  }
  catch {
    return ''
  }
}

function parseDraft(lead, draft) {
  const project = lead.title || lead.name
  const fallbackTo = lead.contactEmails?.[0] ?? ''
  const fallbackSubject = `Quick MCP launch-readiness notes for ${project}`
  const fallbackBody = [
    `Hi ${project} team,`,
    ``,
    `I found ${project} through the MCP Registry and noticed a few public launch-readiness items worth tightening.`,
    ``,
    `I built a free MCP self-check here: https://tateprograms.com/mcp-self-check.html`,
    ``,
    `If useful, I can do a fixed $99 MCP launch review: https://tateprograms.com/mcp-launch-review.html`,
    ``,
    `Tate`,
    `Tate Programs`,
  ].join('\n')

  if (!draft) {
    return {
      to: fallbackTo,
      subject: fallbackSubject,
      body: fallbackBody,
    }
  }

  const lines = draft.split(/\r?\n/)
  const to = lines.find(line => line.startsWith('To: '))?.slice(4).trim() || fallbackTo
  const subject = lines.find(line => line.startsWith('Subject: '))?.slice(9).trim() || fallbackSubject
  const bodyStart = lines.findIndex((line, index) => index > 1 && !line.trim())
  const body = bodyStart >= 0 ? lines.slice(bodyStart + 1).join('\n').trim() : fallbackBody

  return { to, subject, body }
}

function composeHref({ to, subject, body }) {
  if (!to || !to.includes('@')) {
    return ''
  }
  return `mailto:${encodeMailbox(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function scoreClass(score) {
  if (score >= 100) return 'hot'
  if (score >= 85) return 'warm'
  return 'watch'
}

function renderSignals(signals = []) {
  return signals
    .slice(0, 6)
    .map(signal => `<li>${escapeHtml(signal)}</li>`)
    .join('\n              ')
}

async function renderLead(lead, index) {
  const slug = slugify(lead.githubRepo || lead.name)
  const draft = parseDraft(lead, await readDraft(slug))
  const compose = composeHref(draft)
  const project = lead.title || lead.name
  const reportPath = `mcp-prospect-reports/${slug}.html`
  const messagePath = `mcp-prospect-messages/${slug}.txt`
  const primaryContact = lead.contactEmails?.length ? lead.contactEmails.join(', ') : 'GitHub issue or repo contact'
  const actionLinks = [
    compose ? `<a class="button primary" href="${escapeHtml(compose)}">compose</a>` : '',
    `<a class="button" href="${escapeHtml(reportPath)}">private report</a>`,
    `<a class="button" href="${escapeHtml(messagePath)}">draft</a>`,
    lead.outreachUrl && !lead.contactEmails?.length ? `<a class="button" href="${escapeHtml(lead.outreachUrl)}">github contact</a>` : '',
  ].filter(Boolean).join('\n                ')

  return `<article class="lead ${scoreClass(Number(lead.score))}">
            <div class="lead-rank">${index + 1}</div>
            <div class="lead-body">
              <div class="lead-topline">
                <p>${escapeHtml(lead.angle)}</p>
                <strong>${escapeHtml(lead.score)}</strong>
              </div>
              <h2>${escapeHtml(project)}</h2>
              <dl class="facts">
                <div><dt>contact</dt><dd>${escapeHtml(primaryContact)}</dd></div>
                <div><dt>registry</dt><dd>${escapeHtml(lead.name)} ${lead.version ? `v${escapeHtml(lead.version)}` : ''}</dd></div>
                <div><dt>repo</dt><dd>${lead.repositoryUrl ? `<a href="${escapeHtml(lead.repositoryUrl)}">${escapeHtml(lead.githubRepo || lead.repositoryUrl)}</a>` : 'none'}</dd></div>
              </dl>
              <ul class="signals">
                ${renderSignals(lead.signals)}
              </ul>
              <div class="actions">
                ${actionLinks}
              </div>
            </div>
          </article>`
}

async function renderDashboard(prospects) {
  const emailReady = prospects.filter(lead => lead.contactEmails?.length).length
  const hot = prospects.filter(lead => Number(lead.score) >= 100).length
  const cards = await Promise.all(prospects.map(renderLead))

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MCP Prospect Dashboard ${runDate}</title>
    <style>
      :root {
        --bg: #050806;
        --panel: #0b120f;
        --ink: #e7f6ec;
        --muted: #8fa599;
        --line: rgba(163, 255, 191, 0.18);
        --green: #79ff9d;
        --amber: #ffb454;
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
        line-height: 1.5;
        margin: 0;
      }
      main { margin: 0 auto; max-width: 1180px; padding: 52px 22px; }
      a { color: var(--green); text-decoration: none; }
      .kicker { color: var(--green); font-size: 0.78rem; font-weight: 850; margin: 0 0 12px; text-transform: uppercase; }
      h1 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: clamp(2.4rem, 6vw, 5rem); letter-spacing: 0; line-height: 0.96; margin: 0 0 16px; }
      h2 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: clamp(1.35rem, 3vw, 2rem); letter-spacing: 0; line-height: 1.05; margin: 6px 0 16px; }
      p { color: var(--muted); margin-top: 0; }
      .hero { border-bottom: 1px solid var(--line); margin-bottom: 24px; padding-bottom: 28px; }
      .metrics { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 26px; }
      .metric, .lead {
        background: rgba(11, 18, 15, 0.88);
        border: 1px solid var(--line);
        border-radius: 8px;
      }
      .metric { padding: 18px; }
      .metric strong { color: var(--green); display: block; font-size: 2.2rem; line-height: 1; }
      .lead-list { display: grid; gap: 14px; }
      .lead { display: grid; gap: 16px; grid-template-columns: 48px 1fr; padding: 18px; }
      .lead.hot { border-color: rgba(121, 255, 157, 0.42); }
      .lead.warm { border-color: rgba(255, 180, 84, 0.34); }
      .lead-rank { color: var(--green); font-size: 1.2rem; font-weight: 850; }
      .lead-topline { align-items: center; display: flex; gap: 14px; justify-content: space-between; }
      .lead-topline p { color: var(--cyan); font-size: 0.78rem; font-weight: 850; margin: 0; text-transform: uppercase; }
      .lead-topline strong { color: var(--green); font-size: 2rem; line-height: 1; }
      .facts { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 0 16px; }
      .facts div { border-top: 1px solid var(--line); padding-top: 8px; }
      .facts dt { color: var(--muted); font-size: 0.7rem; font-weight: 850; text-transform: uppercase; }
      .facts dd { margin: 3px 0 0; overflow-wrap: anywhere; }
      .signals { color: var(--muted); display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 0 18px; padding-left: 18px; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .button {
        border: 1px solid var(--line);
        border-radius: 6px;
        color: var(--ink);
        display: inline-flex;
        font-weight: 850;
        padding: 10px 12px;
      }
      .button.primary { background: var(--green); border-color: var(--green); color: #041007; }
      .note { color: var(--muted); font-size: 0.88rem; margin-top: 24px; }
      @media (max-width: 780px) {
        .metrics, .facts, .signals { grid-template-columns: 1fr; }
        .lead { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="kicker">local revenue queue / ${escapeHtml(runDate)}</p>
        <h1>MCP launch-review prospects.</h1>
        <p>Review each lead manually, then use the compose links for targeted outreach. Reports and drafts are local-only.</p>
        <div class="metrics">
          <div class="metric"><strong>${prospects.length}</strong><span>ranked prospects</span></div>
          <div class="metric"><strong>${emailReady}</strong><span>direct public emails</span></div>
          <div class="metric"><strong>${hot}</strong><span>100+ score targets</span></div>
        </div>
      </section>

      <section class="lead-list">
        ${cards.join('\n        ')}
      </section>

      <p class="note">Do not send bulk mail. Open each repo/report first, verify the finding, then send only if the note is specific and accurate.</p>
    </main>
  </body>
</html>`
}

const prospects = JSON.parse(await readFile(inputPath, 'utf8'))
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, await renderDashboard(prospects))
console.log(`Wrote ${outputPath}`)
