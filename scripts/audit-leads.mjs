import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

const inputPath = process.argv[2] ?? 'outreach/lead-tracker.csv'
const outputPath = process.argv[3] ?? 'outreach/generated/site-audits.md'
const csvOutputPath = process.argv[4] ?? 'outreach/generated/site-audits.csv'
const userAgent = 'Mozilla/5.0 (compatible; TateProgramsWebsiteAudit/1.0; +https://tateprograms.com/)'

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

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text))
    return `"${text.replaceAll('"', '""')}"`
  return text
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstMatch(html, pattern) {
  return pattern.exec(html)?.[1]?.trim() ?? ''
}

function extractLinks(html) {
  const links = []
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = pattern.exec(html))) {
    links.push({
      href: match[1].trim(),
      text: textFromHtml(match[2]).slice(0, 90),
    })
  }
  return links
}

function countMatches(html, pattern) {
  return [...html.matchAll(pattern)].length
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function classifyIssue({ html, text, title, description, links, sizeKb }) {
  const lowerText = text.toLowerCase()
  const lowerHtml = html.toLowerCase()
  const contactLinks = links.filter(link =>
    link.href.startsWith('mailto:')
    || link.href.startsWith('tel:')
    || /contact|quote|book|schedule|estimate|call/i.test(`${link.href} ${link.text}`),
  )
  const issues = []

  if (!title || title.length < 12)
    issues.push('Add a stronger page title with business type and city/service area.')
  if (!description || description.length < 50)
    issues.push('Add a useful meta description for search previews.')
  if (contactLinks.length === 0)
    issues.push('Make the contact path obvious with call, email, quote, or booking links.')
  if (!/milwaukee|wi|wisconsin|near me|service area/i.test(text))
    issues.push('Add local service-area language near the top of the page.')
  if (!/review|testimonial|licensed|insured|years|gallery|before|after/i.test(lowerText))
    issues.push('Add proof: reviews, project photos, credentials, or before/after examples.')
  if (countMatches(html, /<img\b/gi) > 8 && !/loading=["']lazy["']/i.test(html))
    issues.push('Lazy-load noncritical images and compress large visual assets.')
  if (sizeKb > 900)
    issues.push('Reduce page weight by compressing images and removing extra scripts.')
  if (!/faq|frequently asked|questions/i.test(lowerText))
    issues.push('Add a short FAQ for timing, pricing, service area, and what happens after contact.')
  if (!/<h1\b/i.test(lowerHtml))
    issues.push('Add one clear H1 headline that explains the offer.')

  return issues.slice(0, 5)
}

async function fetchWithTimeout(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    return await fetch(url, {
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timeout)
  }
}

async function auditLead(lead) {
  const url = lead.website?.trim()
  const result = {
    business: lead.business,
    category: lead.category,
    website: url,
    contact: lead.contact,
    status: 'not_checked',
    title: '',
    description: '',
    sizeKb: 0,
    contactSignals: '',
    emails: '',
    phones: '',
    issues: [],
    error: '',
  }

  if (!url) {
    result.error = 'missing_url'
    return result
  }

  try {
    const response = await fetchWithTimeout(url)
    result.status = `${response.status} ${response.statusText}`.trim()
    const html = await response.text()
    const text = textFromHtml(html)
    const links = extractLinks(html)
    result.title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
    result.description = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
    result.sizeKb = Math.round(Buffer.byteLength(html, 'utf8') / 1024)
    result.contactSignals = unique(links
      .filter(link => /^mailto:|^tel:|contact|quote|book|schedule|estimate|call/i.test(`${link.href} ${link.text}`))
      .map(link => `${link.text || link.href} (${link.href})`)
    ).slice(0, 5).join('; ')
    result.emails = unique([...html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(match => match[0])).slice(0, 5).join('; ')
    result.phones = unique([...text.matchAll(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g)].map(match => match[0])).slice(0, 5).join('; ')
    result.issues = classifyIssue({ html, text, title: result.title, description: result.description, links, sizeKb: result.sizeKb })
  }
  catch (error) {
    result.status = 'fetch_failed'
    result.error = error instanceof Error ? error.message : String(error)
  }

  return result
}

function renderMarkdown(results) {
  const lines = [
    `# Site Audit Notes`,
    ``,
    `Generated from \`${basename(inputPath)}\` on ${new Date().toISOString()}.`,
    ``,
  ]

  for (const result of results) {
    lines.push(`## ${result.business}`)
    lines.push(``)
    lines.push(`- Category: ${result.category}`)
    lines.push(`- Website: ${result.website}`)
    lines.push(`- Fetch status: ${result.status}${result.error ? ` (${result.error})` : ''}`)
    if (result.title)
      lines.push(`- Title: ${result.title}`)
    if (result.description)
      lines.push(`- Meta description: ${result.description}`)
    if (result.sizeKb)
      lines.push(`- HTML size: ${result.sizeKb} KB`)
    if (result.contactSignals)
      lines.push(`- Contact signals: ${result.contactSignals}`)
    if (result.emails)
      lines.push(`- Emails found on page: ${result.emails}`)
    if (result.phones)
      lines.push(`- Phones found on page: ${result.phones}`)
    lines.push(``)
    lines.push(`Priority notes:`)
    if (result.issues.length) {
      for (const issue of result.issues)
        lines.push(`- ${issue}`)
    }
    else {
      lines.push(`- Manual review needed. Automated scan did not find a clear high-confidence issue.`)
    }
    lines.push(``)
  }

  return `${lines.join('\n')}\n`
}

function renderCsv(results) {
  const headers = ['business', 'category', 'website', 'status', 'title', 'sizeKb', 'contactSignals', 'issues', 'error']
  const lines = [headers.join(',')]
  for (const result of results) {
    lines.push(headers.map((header) => {
      const value = header === 'issues' ? result.issues.join(' | ') : result[header]
      return csvEscape(value)
    }).join(','))
  }
  return `${lines.join('\n')}\n`
}

const leads = parseCsv(await readFile(inputPath, 'utf8'))
const results = []

for (const lead of leads) {
  console.log(`Auditing ${lead.business}...`)
  results.push(await auditLead(lead))
}

await writeFile(outputPath, renderMarkdown(results))
await writeFile(csvOutputPath, renderCsv(results))
console.log(`Wrote ${outputPath}`)
console.log(`Wrote ${csvOutputPath}`)
