const fileInput = document.querySelector('#fileInput')
const fileSummary = document.querySelector('#fileSummary')
const pasteInput = document.querySelector('#pasteInput')
const projectName = document.querySelector('#projectName')
const projectUrl = document.querySelector('#projectUrl')
const launchScore = document.querySelector('#launchScore')
const launchTitle = document.querySelector('#launchTitle')
const launchSummary = document.querySelector('#launchSummary')
const launchFixes = document.querySelector('#launchFixes')
const signalList = document.querySelector('#signalList')
const copyLaunchResult = document.querySelector('#copyLaunchResult')
const emailLaunchResult = document.querySelector('#emailLaunchResult')
const manualInputs = [
  document.querySelector('#hasDemoUrl'),
  document.querySelector('#hasVideo'),
  document.querySelector('#hasReflection'),
  document.querySelector('#hasContact'),
]

const fileState = new Map()

const textFilePattern = /\.(?:json|md|txt|ya?ml|js|jsx|ts|tsx|mjs|cjs|css|html|env|toml|lock|gitignore)$/i
const exactTextFiles = new Set(['dockerfile', 'license', 'security', 'readme', '.gitignore'])

function shouldReadFile(file) {
  const name = file.name.toLowerCase()
  if (file.size > 900_000) {
    return false
  }
  return name.startsWith('.env') || textFilePattern.test(name) || exactTextFiles.has(name)
}

function normalizePath(file) {
  return (file.webkitRelativePath || file.name).replace(/\\/g, '/')
}

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      resolve(String(reader.result || ''))
    })
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsText(file)
  })
}

async function loadFiles(files) {
  fileState.clear()
  const readable = [...files].filter(shouldReadFile).slice(0, 160)
  await Promise.all(readable.map(async file => {
    const relativePath = normalizePath(file)
    const text = await readFile(file)
    fileState.set(relativePath, text)
  }))
  const skipped = files.length - readable.length
  fileSummary.textContent = readable.length
    ? `${readable.length} text files loaded${skipped > 0 ? `, ${skipped} skipped` : ''}.`
    : 'No text files loaded. Try selecting a project folder, package.json, README, workflows, or server.json.'
  updateResult()
}

function getEntries() {
  const entries = [...fileState.entries()]
    .filter(([name]) => !name.toLowerCase().includes('/node_modules/'))
    .sort((a, b) => a[0].length - b[0].length)
  const pasted = pasteInput.value.trim()
  if (pasted) {
    entries.push(['pasted-notes.txt', pasted])
  }
  return entries
}

function findFile(entries, predicate) {
  return entries.find(([name]) => predicate(name.toLowerCase()))
}

function findFiles(entries, predicate) {
  return entries.filter(([name]) => predicate(name.toLowerCase()))
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

function getPackage(entries) {
  const packageFile = findFile(entries, name => name === 'package.json' || name.endsWith('/package.json'))
  return packageFile ? parseJson(packageFile[1]) : null
}

function getServerJson(entries) {
  const serverFile = findFile(entries, name => name === 'server.json' || name.endsWith('/server.json'))
  return serverFile ? parseJson(serverFile[1]) : null
}

function hasFile(entries, predicate) {
  return Boolean(findFile(entries, predicate))
}

function hasDependency(pkg, names) {
  if (!pkg) {
    return false
  }
  const groups = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].filter(Boolean)
  return names.some(name => groups.some(group => Boolean(group[name])))
}

function dependencyVersions(pkg) {
  if (!pkg) {
    return []
  }
  return [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]
    .filter(Boolean)
    .flatMap(group => Object.entries(group))
}

function hasLooseDependencies(pkg) {
  return dependencyVersions(pkg).some(([, version]) => {
    const normalized = String(version).trim().toLowerCase()
    return normalized === '*' || normalized === 'latest' || normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('git+')
  })
}

function relativeText(entries) {
  return entries.map(([name, text]) => `\n--- ${name} ---\n${text}`).join('\n')
}

function workflowText(entries) {
  return findFiles(entries, name => name.includes('.github/workflows/') && /\.(?:ya?ml)$/.test(name))
    .map(([, text]) => text)
    .join('\n')
}

function getReadme(entries) {
  const readmeFile = findFile(entries, name => name === 'readme.md' || name.endsWith('/readme.md'))
  return readmeFile?.[1] || ''
}

function addCheck(checks, check) {
  checks.push(check)
}

function analyze() {
  const entries = getEntries()
  if (entries.length === 0) {
    return { checks: [], entries }
  }

  const pkg = getPackage(entries)
  const server = getServerJson(entries)
  const readme = getReadme(entries)
  const allText = relativeText(entries)
  const workflows = workflowText(entries)
  const checks = []

  const scripts = pkg?.scripts || {}
  const hasBuild = Boolean(scripts.build)
  const hasTest = Boolean(scripts.test)
  const isMcp = Boolean(
    server
    || pkg?.mcpName
    || hasDependency(pkg, ['@modelcontextprotocol/sdk', '@modelcontextprotocol/server'])
    || /(?:^|[-_])mcp(?:$|[-_])/i.test(pkg?.name || '')
  )
  const hasPublishWorkflow = /\b(?:npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish)\b|JS-DevTools\/npm-publish/i.test(workflows)
  const usesPublishToken = /\b(?:NPM_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG__AUTH|_authToken)\b|secrets\.[A-Z0-9_]*NPM[A-Z0-9_]*/i.test(workflows)
  const hasOidc = /id-token\s*:\s*write/i.test(workflows)
  const hasCi = findFiles(entries, name => name.includes('.github/workflows/') && /\.(?:ya?ml)$/.test(name)).length > 0
  const hasLockfile = hasFile(entries, name => /(?:^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(name))
  const gitignore = findFile(entries, name => name === '.gitignore' || name.endsWith('/.gitignore'))?.[1] || ''
  const hasLicense = Boolean(pkg?.license) || hasFile(entries, name => /(?:^|\/)(license|license\.md|license\.txt)$/i.test(name))
  const envExample = hasFile(entries, name => /(?:^|\/)\.env\.example$/.test(name))
  const envUsage = /\bprocess\.env\.|import\.meta\.env\.|NEXT_PUBLIC_|VITE_|SUPABASE_|STRIPE_/i.test(allText)
  const publicSecretName = /\b(?:NEXT_PUBLIC|VITE)_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE|SERVICE|WEBHOOK|ADMIN|KEY)\b/.test(allText)
  const hardcodedSecret = /\bsk_live_[A-Za-z0-9]{12,}\b|(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-.]{28,}['"]/i.test(allText)
  const usesStripe = hasDependency(pkg, ['stripe']) || /stripe\.webhooks|checkout\.sessions|Stripe\(/i.test(allText)
  const verifiesStripe = /constructEvent|stripe-signature|webhookSecret|STRIPE_WEBHOOK_SECRET/i.test(allText)
  const usesSupabase = hasDependency(pkg, ['@supabase/supabase-js']) || /supabase/i.test(allText)
  const hasSupabaseBoundary = /row level security|\brls\b|create policy|alter table .* enable row level security|supabase\/migrations/i.test(allText)
  const usesFirebase = hasDependency(pkg, ['firebase', 'firebase-admin']) || /initializeApp\(|firestore|firebase/i.test(allText)
  const hasFirebaseRules = hasFile(entries, name => /(?:^|\/)(firestore\.rules|storage\.rules)$/.test(name))
  const paidApi = hasDependency(pkg, ['openai', '@anthropic-ai/sdk', '@google/generative-ai', 'stripe']) || /\b(openai|anthropic|gemini|stripe)\b/i.test(allText)
  const hasCostGuardrail = /\b(rate limit|ratelimit|quota|throttle|budget|max tokens|usage cap|cost guard|retry-after)\b/i.test(allText)

  addCheck(checks, {
    group: 'Project identity',
    label: 'package.json is present and readable',
    ok: Boolean(pkg),
    weight: 8,
    fix: 'Add a root package.json with name, version, scripts, dependencies, repository, license, and package manager metadata.',
  })
  addCheck(checks, {
    group: 'Project identity',
    label: 'README has real launch context',
    ok: readme.length >= 450 && /\b(install|usage|demo|run|setup|verification|deploy)\b/i.test(readme),
    weight: 9,
    fix: 'Expand README with what the project does, who it helps, setup steps, run commands, demo link, and verification notes.',
  })
  addCheck(checks, {
    group: 'Project identity',
    label: 'License or ownership terms are visible',
    ok: hasLicense,
    weight: 5,
    fix: 'Add a license field or LICENSE file so users and judges know how the project can be reused.',
  })
  addCheck(checks, {
    group: 'Project identity',
    label: 'Repository/demo URL is ready',
    ok: Boolean(projectUrl.value.trim()) || /https:\/\/github\.com\/|https?:\/\/[^\s]+/i.test(readme),
    weight: 5,
    fix: 'Add a public repo URL and live demo or screenshot link before submitting or pitching the project.',
  })
  addCheck(checks, {
    group: 'Build trail',
    label: 'Build and test scripts exist',
    ok: Boolean(pkg) && hasBuild && hasTest,
    weight: 8,
    fix: 'Add repeatable build and test scripts so reviewers can verify the project without guessing commands.',
  })
  addCheck(checks, {
    group: 'Build trail',
    label: 'Dependency lockfile is committed',
    ok: hasLockfile,
    weight: 6,
    fix: 'Commit the lockfile for the package manager used by the project.',
  })
  addCheck(checks, {
    group: 'Build trail',
    label: 'Dependency versions avoid latest, URLs, and wildcards',
    ok: Boolean(pkg) && !hasLooseDependencies(pkg),
    weight: 6,
    fix: 'Replace loose dependency versions such as latest, *, direct URLs, and git dependencies with reviewed semver ranges.',
  })
  addCheck(checks, {
    group: 'Build trail',
    label: 'CI or workflow proof exists',
    ok: hasCi,
    weight: 6,
    fix: 'Add a simple GitHub Actions workflow that installs dependencies and runs build/test.',
  })
  addCheck(checks, {
    group: 'Safety',
    label: '.gitignore keeps local secrets out',
    ok: /\.env\b/.test(gitignore) && /node_modules/.test(gitignore),
    weight: 7,
    fix: 'Add .env and node_modules to .gitignore before sharing the repo.',
  })
  addCheck(checks, {
    group: 'Safety',
    label: 'Environment variables have an example file',
    ok: !envUsage || envExample,
    weight: 6,
    fix: 'Add .env.example with placeholder names for required environment variables.',
  })
  addCheck(checks, {
    group: 'Safety',
    label: 'No public env var name looks private',
    ok: !publicSecretName,
    weight: 8,
    fix: 'Rename public frontend env vars that include SECRET, TOKEN, PRIVATE, SERVICE, WEBHOOK, ADMIN, or KEY.',
  })
  addCheck(checks, {
    group: 'Safety',
    label: 'No obvious private secret appears in uploaded text',
    ok: !hardcodedSecret,
    weight: 10,
    fix: 'Remove hardcoded API keys, tokens, Stripe secret keys, or provider secrets from the repo and rotate any exposed value.',
  })
  addCheck(checks, {
    group: 'Safety',
    label: 'Stripe webhooks verify signatures when Stripe is used',
    ok: !usesStripe || verifiesStripe,
    weight: 7,
    fix: 'Verify Stripe webhooks with constructEvent and the Stripe signature header before trusting payment events.',
  })
  addCheck(checks, {
    group: 'Safety',
    label: 'Database access boundary is documented',
    ok: (!usesSupabase || hasSupabaseBoundary) && (!usesFirebase || hasFirebaseRules),
    weight: 8,
    fix: 'Add Supabase RLS policy evidence or Firebase rules before claiming the app is ready for real user data.',
  })
  addCheck(checks, {
    group: 'Safety',
    label: 'Paid API usage has cost controls',
    ok: !paidApi || hasCostGuardrail,
    weight: 6,
    fix: 'Document or implement rate limits, quotas, throttling, token caps, or usage budgets for paid APIs.',
  })
  addCheck(checks, {
    group: 'Publishing',
    label: 'npm publishing does not depend on a long-lived token',
    ok: !hasPublishWorkflow || (!usesPublishToken && hasOidc),
    weight: hasPublishWorkflow ? 8 : 3,
    fix: 'If publishing from GitHub Actions, use npm Trusted Publisher/OIDC with id-token: write and remove publish-scope npm tokens.',
  })

  if (isMcp) {
    const npmPackage = server?.packages?.find(item => item.registryType === 'npm')
    addCheck(checks, {
      group: 'MCP',
      label: 'MCP package identity is aligned',
      ok: Boolean(pkg?.mcpName && server?.name && pkg.mcpName === server.name),
      weight: 8,
      fix: 'Align package.json mcpName with server.json name before registry submission.',
    })
    addCheck(checks, {
      group: 'MCP',
      label: 'server.json version matches package.json',
      ok: Boolean(pkg?.version && server?.version === pkg.version && npmPackage?.version === pkg.version),
      weight: 8,
      fix: 'Set server.json version and packages[].version to the exact package.json version.',
    })
    addCheck(checks, {
      group: 'MCP',
      label: 'README has MCP install and smoke-test proof',
      ok: /mcpServers|npx|claude\s+mcp\s+add/i.test(readme) && /smoke|inspector|tools\/list|verification|verify/i.test(readme),
      weight: 8,
      fix: 'Add a copyable MCP client config and a smoke-test command or expected tool-list proof.',
    })
    addCheck(checks, {
      group: 'MCP',
      label: 'Tool safety notes are visible',
      ok: /\b(read-only|authorized|permission|destructive|idempotent|security|least privilege)\b/i.test(allText),
      weight: 6,
      fix: 'Document whether tools read, write, call networks, touch files, or need user permission.',
    })
  }

  addCheck(checks, {
    group: 'Demo proof',
    label: 'Live demo or screenshots are ready',
    ok: document.querySelector('#hasDemoUrl').checked,
    weight: 6,
    fix: 'Prepare a live demo URL or screenshots so judges and buyers can inspect the result quickly.',
  })
  addCheck(checks, {
    group: 'Demo proof',
    label: 'Short demo video is ready',
    ok: document.querySelector('#hasVideo').checked,
    weight: 5,
    fix: 'Record a sub-3-minute walkthrough showing the core flow and the launch check output.',
  })
  addCheck(checks, {
    group: 'Demo proof',
    label: 'Learning/reflection note is ready',
    ok: document.querySelector('#hasReflection').checked || /\b(learned|challenge|reflection|next steps)\b/i.test(readme),
    weight: 4,
    fix: 'Add a short reflection covering what was hard, what changed, and what you would improve next.',
  })
  addCheck(checks, {
    group: 'Demo proof',
    label: 'Contact path is visible',
    ok: document.querySelector('#hasContact').checked || /\b(mailto:|contact|email|github\.com\/[^/\s]+)\b/i.test(readme),
    weight: 3,
    fix: 'Add a contact path for questions, review, or collaboration.',
  })

  return { checks, entries }
}

function summarize(checks) {
  const total = checks.reduce((sum, check) => sum + check.weight, 0)
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0)
  const score = total ? Math.round((earned / total) * 100) : 0
  const missing = checks.filter(check => !check.ok).sort((a, b) => b.weight - a.weight)
  const groups = [...new Set(checks.map(check => check.group))]
    .map(group => {
      const groupChecks = checks.filter(check => check.group === group)
      const groupTotal = groupChecks.reduce((sum, check) => sum + check.weight, 0)
      const groupEarned = groupChecks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0)
      return {
        group,
        score: groupTotal ? Math.round((groupEarned / groupTotal) * 100) : 0,
      }
    })

  return { score, missing, groups }
}

function rating(score, entries) {
  if (entries.length === 0 && !pasteInput.value.trim()) {
    return {
      title: 'No project loaded',
      summary: 'Load files or paste project text to generate a launch-readiness score.',
    }
  }
  if (score >= 88) {
    return {
      title: 'Launch packet is strong',
      summary: 'The project has the main public handoff signals covered. Focus now on demo clarity and one memorable story.',
    }
  }
  if (score >= 70) {
    return {
      title: 'Close, but a few gaps can cost trust',
      summary: 'The project is presentable, but the fix queue still contains items judges, maintainers, or users may notice.',
    }
  }
  if (score >= 45) {
    return {
      title: 'Useful build, weak launch trail',
      summary: 'The code may work, but the public evidence around setup, safety, or demo proof needs tightening.',
    }
  }
  return {
    title: 'Launch blockers likely',
    summary: 'Start with README, runnable scripts, secret hygiene, and demo proof before sharing this widely.',
  }
}

function renderSignals(groups) {
  signalList.replaceChildren()
  for (const item of groups) {
    const row = document.createElement('div')
    row.className = 'signal-row'
    const name = document.createElement('span')
    name.textContent = item.group
    const value = document.createElement('strong')
    value.textContent = `${item.score}%`
    row.append(name, value)
    signalList.append(row)
  }
}

function resultText() {
  const { checks, entries } = analyze()
  const { score, missing } = summarize(checks)
  const title = projectName.value.trim() || 'Student project'
  const url = projectUrl.value.trim() || 'No URL provided'
  const files = entries.length ? entries.map(([name]) => name).slice(0, 12).join(', ') : 'No files loaded'
  const fixes = missing.slice(0, 8).map((check, index) => `${index + 1}. ${check.fix}`).join('\n') || 'No major launch gaps detected by the browser check.'

  return `${title} launch check
URL: ${url}
Score: ${score}/100
Files reviewed: ${files}

Priority fixes:
${fixes}

Prepared with Student Launch Kit by Tate Programs.`
}

function updateResult() {
  const { checks, entries } = analyze()
  const summary = summarize(checks)
  const copy = rating(summary.score, entries)
  launchScore.textContent = String(summary.score)
  launchTitle.textContent = copy.title
  launchSummary.textContent = copy.summary
  renderSignals(summary.groups)

  launchFixes.replaceChildren()
  const fixes = summary.missing.slice(0, 8)
  if (fixes.length === 0) {
    const item = document.createElement('li')
    item.textContent = summary.score > 0 ? 'No major launch gaps detected by the browser check.' : 'Load files to generate the first fix queue.'
    launchFixes.append(item)
  }
  else {
    for (const check of fixes) {
      const item = document.createElement('li')
      item.textContent = check.fix
      launchFixes.append(item)
    }
  }

  const emailBody = encodeURIComponent(`${resultText()}\n\nI want help turning this into a cleaner launch packet.`)
  emailLaunchResult.href = `mailto:hello@tateprograms.com?subject=Student%20launch%20check%20result&body=${emailBody}`
}

fileInput.addEventListener('change', event => {
  const files = event.target.files || []
  loadFiles(files).catch(() => {
    fileSummary.textContent = 'Could not read one or more files. Try selecting fewer text files.'
  })
})

pasteInput.addEventListener('input', updateResult)
projectName.addEventListener('input', updateResult)
projectUrl.addEventListener('input', updateResult)
for (const input of manualInputs) {
  input.addEventListener('input', updateResult)
}

copyLaunchResult.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultText())
    copyLaunchResult.textContent = 'Copied'
    window.setTimeout(() => {
      copyLaunchResult.textContent = 'copy result'
    }, 1600)
  }
  catch {
    copyLaunchResult.textContent = 'Select text manually'
    window.setTimeout(() => {
      copyLaunchResult.textContent = 'copy result'
    }, 1600)
  }
})

updateResult()
