import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const inputPath = process.argv[2] ?? 'outreach/generated/site-audits.csv'
const outputDir = process.argv[3] ?? 'outreach/private-reports'

function parseCsvLine(line) {
  const cells = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    }
    else if (char === '"') {
      quoted = !quoted
    }
    else if (char === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    }
    else {
      cell += char
    }
  }
  cells.push(cell)
  return cells
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  const headers = parseCsvLine(lines.shift() ?? '')
  return lines.map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function issueList(value) {
  return String(value ?? '')
    .split('|')
    .map(item => item.trim())
    .filter(Boolean)
}

function offerFor(row) {
  const issues = row.issues.toLowerCase()
  if (issues.includes('page weight') || Number(row.sizeKb) > 900)
    return 'Website repair pass focused on speed, image cleanup, FAQ/proof placement, and contact flow.'
  if (issues.includes('meta description') || issues.includes('page title'))
    return 'Website repair pass focused on title/meta cleanup, local SEO basics, and clearer contact flow.'
  return 'Website repair pass focused on mobile clarity, contact path, proof, and FAQ structure.'
}

function renderReport(row) {
  const issues = issueList(row.issues)
  const offer = offerFor(row)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(row.business)} Website Audit</title>
    <style>
      :root {
        --ink: #17201c;
        --muted: #5b675f;
        --paper: #f8f5ef;
        --surface: #ffffff;
        --line: #d8dfd6;
        --accent: #0d6e57;
        --accent-2: #d94f30;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body { background: var(--paper); color: var(--ink); margin: 0; line-height: 1.5; }
      main { margin: 0 auto; max-width: 980px; padding: 48px 22px; }
      .eyebrow { color: var(--accent); font-size: 0.78rem; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
      h1 { font-size: clamp(2.3rem, 6vw, 4.8rem); letter-spacing: 0; line-height: 0.98; margin: 8px 0 18px; }
      h2 { font-size: 1.45rem; margin: 0 0 12px; }
      p { color: var(--muted); }
      .grid { display: grid; gap: 16px; grid-template-columns: 1fr 0.55fr; margin-top: 28px; }
      .card { background: var(--surface); border: 1px solid rgba(23, 32, 28, 0.1); border-radius: 8px; padding: 22px; }
      .metric { background: #17201c; border-radius: 8px; color: white; padding: 22px; }
      .metric strong { display: block; font-size: 2rem; }
      ol { color: var(--muted); padding-left: 22px; }
      li + li { margin-top: 10px; }
      .button { background: var(--accent-2); border-radius: 8px; color: white; display: inline-flex; font-weight: 850; margin-top: 8px; padding: 12px 16px; text-decoration: none; }
      .small { font-size: 0.88rem; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Private website audit draft</p>
      <h1>${escapeHtml(row.business)}</h1>
      <p>This is a short pre-sale audit note for manual review before outreach. Confirm each item on the live site before sending.</p>

      <div class="grid">
        <section class="card">
          <h2>Priority Fixes</h2>
          <ol>
            ${(issues.length ? issues : ['Manual review needed before outreach.']).map(issue => `<li>${escapeHtml(issue)}</li>`).join('\n            ')}
          </ol>
        </section>

        <aside class="metric">
          <strong>${escapeHtml(row.sizeKb || '0')} KB</strong>
          <span>HTML size before images and subresources</span>
        </aside>
      </div>

      <section class="card" style="margin-top:16px">
        <h2>Suggested Offer</h2>
        <p>${escapeHtml(offer)}</p>
        <a class="button" href="mailto:hello@tateprograms.com?subject=Website%20repair%20pass">Use $150 repair pass</a>
      </section>

      <section class="card" style="margin-top:16px">
        <h2>Scan Facts</h2>
        <p><strong>Website:</strong> ${escapeHtml(row.website)}</p>
        <p><strong>Fetch status:</strong> ${escapeHtml(row.status)}</p>
        <p><strong>Title:</strong> ${escapeHtml(row.title || 'Not found')}</p>
        <p><strong>Contact signals:</strong> ${escapeHtml(row.contactSignals || 'Not found by automated scan')}</p>
        ${row.error ? `<p><strong>Error:</strong> ${escapeHtml(row.error)}</p>` : ''}
      </section>

      <p class="small">Generated locally by Tate Lyman's lead audit script. Do not publish this report without permission.</p>
    </main>
  </body>
</html>`
}

const rows = parseCsv(await readFile(inputPath, 'utf8'))
await mkdir(outputDir, { recursive: true })

for (const row of rows) {
  if (row.status === 'fetch_failed')
    continue
  const filename = `${slugify(row.business)}.html`
  await writeFile(join(outputDir, filename), renderReport(row))
  console.log(`Wrote ${join(outputDir, filename)}`)
}
