import { writeFile } from 'node:fs/promises'

const manifestUrl = process.argv[2]
const outputPath = process.argv[3]
const preflightOrigin = process.env.X402_CHECK_ORIGIN ?? new URL(manifestUrl ?? 'https://example.com').origin

if (!manifestUrl) {
  console.error('Usage: node scripts/check-x402-public-surface.mjs <manifest-url> [output.md]')
  process.exit(1)
}

const headers = {
  'user-agent': 'TatePrograms-X402SurfaceCheck/1.0',
  accept: 'application/json',
}

function moneyFromAtomic(amount, decimals = 6) {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return String(amount ?? '')
  const value = numeric / (10 ** decimals)
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: value < 0.01 ? 3 : 2,
  })}`
}

function canonicalEndpointEntries(manifest) {
  const entries = []

  for (const [name, url] of Object.entries(manifest.x402Endpoints ?? {})) {
    if (typeof url === 'string' && url.startsWith('http')) {
      entries.push({ name, url })
    }
  }

  return entries
}

async function readText(response) {
  const text = await response.text()
  try {
    return { text, json: JSON.parse(text) }
  }
  catch {
    return { text, json: null }
  }
}

async function fetchManifest(url) {
  const response = await fetch(url, { headers })
  const body = await readText(response)

  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    url: response.url,
    body,
  }
}

async function probeEndpoint(entry) {
  const response = await fetch(entry.url, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/json',
    },
    body: '{}',
  })
  const body = await readText(response)

  return {
    ...entry,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  }
}

async function probePreflight(entry, origin = preflightOrigin) {
  const response = await fetch(entry.url, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-payment',
    },
  })

  return {
    ...entry,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  }
}

function challengeSummary(result) {
  const challenge = result.body.json
  const firstAccept = challenge?.accepts?.[0] ?? {}

  return {
    status: result.status,
    resourceUrl: challenge?.resource?.url ?? '',
    network: firstAccept.network ?? '',
    amount: firstAccept.amount ?? '',
    price: moneyFromAtomic(firstAccept.amount),
    payTo: firstAccept.payTo ?? '',
    asset: firstAccept.asset ?? '',
    timeout: firstAccept.maxTimeoutSeconds ?? '',
    extraResource: firstAccept.extra?.resource ?? '',
  }
}

function findingList(manifest, challengeResults, preflightResults) {
  const findings = []
  const networks = manifest.networks ?? []
  const challengeNetworks = new Set()

  for (const result of challengeResults) {
    const summary = challengeSummary(result)
    if (summary.network) challengeNetworks.add(summary.network)

    if (result.status !== 402) {
      findings.push(`P1 - ${result.name} returned ${result.status}, not 402, for a no-payment POST probe.`)
    }
    if (summary.resourceUrl.startsWith('http://') || summary.extraResource.startsWith('http://')) {
      findings.push(`P1 - ${result.name} challenge uses a non-HTTPS resource URL: ${summary.resourceUrl || summary.extraResource}.`)
    }
    if (!summary.amount || !summary.payTo || !summary.asset) {
      findings.push(`P1 - ${result.name} challenge is missing amount, payTo, or asset metadata.`)
    }
    if (!summary.resourceUrl || !summary.extraResource) {
      findings.push(`P2 - ${result.name} challenge does not repeat the resource URL in both resource.url and accepts[0].extra.resource.`)
    }
  }

  for (const result of preflightResults) {
    const allowed = result.headers['access-control-allow-headers'] ?? ''
    if (!/x-payment/i.test(allowed)) {
      findings.push(`P1 - ${result.name} CORS preflight does not allow X-PAYMENT; observed allow headers: ${allowed || 'none'}.`)
    }
    const methods = result.headers['access-control-allow-methods'] ?? ''
    if (/delete|put|patch/i.test(methods)) {
      findings.push(`P2 - ${result.name} CORS allow-methods is broader than the POST-only public x402 contract: ${methods}.`)
    }
  }

  if (networks.length > 1 && challengeNetworks.size === 1) {
    findings.push(`P2 - Manifest lists ${networks.length} networks, while observed 402 challenges exposed one network: ${[...challengeNetworks].join(', ')}.`)
  }

  if (manifest.x402Endpoint && manifest.x402Endpoints) {
    findings.push(`P3 - Manifest includes both x402Endpoint (${manifest.x402Endpoint}) and x402Endpoints; clarify which path clients should prefer.`)
  }

  return findings
}

function formatReport(manifestResult, challengeResults, preflightResults) {
  const manifest = manifestResult.body.json ?? {}
  const findings = findingList(manifest, challengeResults, preflightResults)
  const challengeRows = challengeResults.map(result => {
    const summary = challengeSummary(result)
    return `| ${result.name} | ${result.status} | ${summary.price} | ${summary.network || '-'} | ${summary.resourceUrl || '-'} |`
  })
  const preflightRows = preflightResults.map(result => {
    return `| ${result.name} | ${result.status} | ${result.headers['access-control-allow-origin'] ?? '-'} | ${result.headers['access-control-allow-headers'] ?? '-'} | ${result.headers['access-control-allow-methods'] ?? '-'} |`
  })

  return [
    `# x402 Public Surface Check`,
    ``,
    `Manifest: ${manifestResult.url}`,
    `Checked: ${new Date().toISOString()}`,
    `Scope: manifest, no-payment POST probes, and browser-style CORS preflight. No payment headers or paid calls.`,
    `Preflight origin: ${preflightOrigin}`,
    ``,
    `## Manifest`,
    ``,
    `- Status: ${manifestResult.status}`,
    `- Agent: ${manifest.agent?.name ?? '-'}`,
    `- Wallet: ${manifest.agent?.wallet ?? '-'}`,
    `- Facilitator: ${manifest.facilitator ?? '-'}`,
    `- Networks: ${(manifest.networks ?? []).join(', ') || '-'}`,
    `- Capabilities: ${(manifest.capabilities ?? []).map(item => item.id).join(', ') || '-'}`,
    ``,
    `## No-Payment Challenge Map`,
    ``,
    `| Endpoint | HTTP | Price | Network | Resource URL |`,
    `| --- | --- | --- | --- | --- |`,
    ...challengeRows,
    ``,
    `## Browser Preflight Map`,
    ``,
    `| Endpoint | HTTP | Allow-Origin | Allow-Headers | Allow-Methods |`,
    `| --- | --- | --- | --- | --- |`,
    ...preflightRows,
    ``,
    `## Findings`,
    ``,
    ...(findings.length ? findings.map(item => `- ${item}`) : ['- No obvious launch-readiness findings from the public no-payment probes.']),
    ``,
  ].join('\n')
}

const manifestResult = await fetchManifest(manifestUrl)
if (!manifestResult.body.json) {
  throw new Error(`Manifest did not return JSON: ${manifestUrl}`)
}

const endpoints = canonicalEndpointEntries(manifestResult.body.json)
const challengeResults = []
const preflightResults = []

for (const entry of endpoints) {
  challengeResults.push(await probeEndpoint(entry))
  preflightResults.push(await probePreflight(entry))
}

const report = formatReport(manifestResult, challengeResults, preflightResults)

if (outputPath) {
  await writeFile(outputPath, `${report}\n`)
}

console.log(report)
