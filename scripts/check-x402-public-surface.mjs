import { writeFile } from 'node:fs/promises'

const manifestUrl = process.argv[2]
const outputPath = process.argv[3]
const preflightOrigin = process.env.X402_CHECK_ORIGIN ?? new URL(manifestUrl ?? 'https://example.com').origin
const probeLimit = Number(process.env.X402_CHECK_LIMIT ?? 6)

if (!manifestUrl) {
  console.error('Usage: node scripts/check-x402-public-surface.mjs <manifest-url> [output.md]')
  process.exit(1)
}

const headers = {
  'user-agent': 'TatePrograms-X402SurfaceCheck/1.0',
  accept: 'application/json',
}

function moneyFromAtomic(amount, decimals = 6) {
  if (amount === '' || amount === null || amount === undefined) return ''
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return String(amount ?? '')
  const value = numeric / (10 ** decimals)
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: value < 0.01 ? 3 : 2,
  })}`
}

function moneyFromDecimal(amount) {
  if (amount === '' || amount === null || amount === undefined) return ''
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return String(amount ?? '')
  return `$${numeric.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: numeric < 0.01 ? 3 : 2,
  })}`
}

function canonicalEndpointEntries(manifest) {
  const entries = []

  for (const [name, url] of Object.entries(manifest.x402Endpoints ?? {})) {
    if (typeof url === 'string' && url.startsWith('http')) {
      entries.push({ name, url, method: 'POST' })
    }
  }

  for (const [category, items] of Object.entries(manifest.categories ?? {})) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (typeof item?.endpoint === 'string' && item.endpoint.startsWith('http')) {
        entries.push({ name: item.id ?? item.name ?? category, url: item.endpoint, method: item.method ?? 'POST' })
      }
    }
  }

  if (manifest.openapi && manifest.paths && typeof manifest.paths === 'object') {
    const baseUrl = manifest.servers?.find(server => typeof server?.url === 'string')?.url
      ?? manifestUrl
    const methods = ['get', 'post', 'put', 'patch', 'delete']

    for (const [path, operations] of Object.entries(manifest.paths)) {
      if (!operations || typeof operations !== 'object') continue
      for (const method of methods) {
        const operation = operations[method]
        if (!operation || typeof operation !== 'object') continue
        const url = path.startsWith('http')
          ? path
          : new URL(path, baseUrl).toString()
        entries.push({
          name: operation.operationId ?? `${method.toUpperCase()} ${path}`,
          url,
          method: method.toUpperCase(),
        })
      }
    }
  }

  for (const resource of manifest.resources ?? []) {
    if (typeof resource !== 'string') continue
    const match = resource.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i)
    if (!match) continue
    const [, method, rawPath] = match
    const url = rawPath.startsWith('http')
      ? rawPath
      : new URL(rawPath, manifest.baseUrl ?? manifestUrl).toString()
    entries.push({ name: rawPath.split('/').filter(Boolean).at(-1) ?? rawPath, url, method: method.toUpperCase() })
  }

  const seen = new Set()
  return entries
    .filter(entry => {
      const key = `${entry.method}:${entry.url}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, Number.isFinite(probeLimit) && probeLimit > 0 ? probeLimit : 6)
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

function parseEncodedChallenge(value) {
  if (!value) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  }
  catch {
    return null
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
  const method = entry.method ?? 'POST'
  const response = await fetch(entry.url, {
    method,
    headers: {
      ...headers,
      'content-type': 'application/json',
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : '{}',
  })
  const body = await readText(response)
  const headerChallenge = parseEncodedChallenge(
    response.headers.get('payment-required') ?? response.headers.get('x-payment-required'),
  )

  if (headerChallenge && !body.json?.accepts?.length) {
    body.json = headerChallenge
  }

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
      'access-control-request-method': entry.method ?? 'POST',
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
  const amount = acceptAmountValue(firstAccept)
  const resourceUrl = challenge?.resource?.url ?? firstAccept.resource ?? ''
  const extraResource = firstAccept.extra?.resource ?? firstAccept.resource ?? ''

  return {
    status: result.status,
    resourceUrl,
    network: firstAccept.network ?? '',
    amount,
    price: challengePrice(firstAccept, result),
    payTo: firstAccept.payTo ?? '',
    asset: acceptAssetValue(firstAccept),
    timeout: firstAccept.maxTimeoutSeconds ?? '',
    extraResource,
  }
}

function challengeAccepts(result) {
  return Array.isArray(result.body.json?.accepts) ? result.body.json.accepts : []
}

function hasPaymentChallenge(result) {
  const challenge = result.body.json
  return challengeAccepts(result).length > 0 || Boolean(challenge?.resource || challenge?.payment || result.headers?.['www-authenticate'])
}

function acceptAmountValue(accept) {
  return accept.maxAmountRequired ?? accept.maxAmount ?? accept.amount ?? ''
}

function acceptAssetValue(accept) {
  return accept.asset ?? accept.token ?? accept.currency ?? ''
}

function acceptDecimals(accept) {
  const value = accept.decimals ?? accept.extra?.decimals ?? accept.methodDetails?.decimals
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 6
}

function usesDecimalAmount(accept, result) {
  if (accept.maxAmountRequired !== undefined || accept.maxAmount !== undefined) return false
  if (accept.amount === undefined || accept.amount === null || accept.amount === '') return false
  const amount = String(accept.amount)
  if (amount.includes('.')) return true
  if (!accept.asset && (accept.token || result.headers?.['x-payment-token'])) return true
  return result.headers?.['x-payment-amount'] === amount
}

function challengePrice(accept, result) {
  const amount = acceptAmountValue(accept)
  return usesDecimalAmount(accept, result)
    ? moneyFromDecimal(amount)
    : moneyFromAtomic(amount, acceptDecimals(accept))
}

function looksLikeStagingNetwork(network) {
  return /devnet|testnet|sepolia|local|eip155:84532|solana:EtWTRAB/i.test(String(network ?? ''))
}

function looksLikePlaceholderPayTo(payTo) {
  const value = String(payTo ?? '')
  if (!value) return false
  if (/^0x0{36,}0?1?$/i.test(value)) return true
  if (/^1{24,}$/.test(value)) return true
  return false
}

function valueList(value) {
  if (Array.isArray(value)) return value.map(String)
  if (value && typeof value === 'object') return Object.keys(value)
  if (typeof value === 'string') return [value]
  return []
}

function displayMetadataValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) {
    return value.map(displayMetadataValue).filter(item => item && item !== '-').join(', ') || '-'
  }
  if (typeof value === 'object') {
    const parts = [
      value.name,
      value.operator,
      value.url,
      value.jurisdiction,
      value.network,
    ].filter(item => item !== null && item !== undefined && item !== '').map(String)
    return parts.join(' / ') || Object.keys(value).join(', ') || '-'
  }
  return String(value)
}

function capabilityList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => item?.id ?? item?.name ?? item).filter(Boolean).map(String)
}

function findingList(manifestResult, challengeResults, preflightResults) {
  const manifest = manifestResult.body.json ?? {}
  const findings = []
  const networks = valueList(manifest.networks)
  const endpointCount = canonicalEndpointEntries(manifest).length
  const challengeNetworks = new Set()

  if (manifestResult.status < 200 || manifestResult.status >= 300) {
    findings.push(`P1 - Manifest returned HTTP ${manifestResult.status}; expected a successful JSON response.`)
  }

  if (!manifestResult.body.json) {
    findings.push(`P1 - Manifest did not return parseable JSON; content begins: ${manifestResult.body.text.slice(0, 80).replace(/\s+/g, ' ')}.`)
  }

  if (endpointCount === 0) {
    findings.push('P1 - Manifest does not expose any x402Endpoints for no-payment challenge probes.')
  }

  for (const result of challengeResults) {
    const summary = challengeSummary(result)
    if (summary.network) challengeNetworks.add(summary.network)
    const hasChallenge = hasPaymentChallenge(result)

    if (result.status !== 402) {
      if (result.status >= 200 && result.status < 300) {
        findings.push(`P3 - ${result.name} returned ${result.status} without a payment challenge for a no-payment ${result.method ?? 'POST'} probe; document this as free/trial access or move the 402 challenge before content.`)
      }
      else if (result.status === 400 || result.status === 422) {
        findings.push(`P1 - ${result.name} returned validation HTTP ${result.status} before a payment challenge for a no-payment ${result.method ?? 'POST'} probe.`)
      }
      else if (result.status === 401 || result.status === 403) {
        findings.push(`P2 - ${result.name} returned auth HTTP ${result.status} before a payment challenge for a no-payment ${result.method ?? 'POST'} probe; document the auth/free-tier order if this is intentional.`)
      }
      else {
        findings.push(`P1 - ${result.name} returned ${result.status}, not 402, for a no-payment ${result.method ?? 'POST'} probe.`)
      }
    }

    if (!hasChallenge) {
      continue
    }
    if (summary.resourceUrl.startsWith('http://') || summary.extraResource.startsWith('http://')) {
      findings.push(`P1 - ${result.name} challenge uses a non-HTTPS resource URL: ${summary.resourceUrl || summary.extraResource}.`)
    }
    if (!summary.amount || !summary.payTo || !summary.asset) {
      findings.push(`P1 - ${result.name} challenge is missing amount, payTo, or asset metadata.`)
    }
    for (const accept of challengeAccepts(result)) {
      if (looksLikePlaceholderPayTo(accept.payTo)) {
        findings.push(`P1 - ${result.name} challenge advertises placeholder-looking payTo ${accept.payTo}; production listings should not ask agents to pay placeholder recipients.`)
      }
      if (looksLikeStagingNetwork(accept.network)) {
        findings.push(`P2 - ${result.name} challenge advertises staging/test network ${accept.network}; document this as demo-only until live-value payment rails are active.`)
      }
    }
    if (!summary.resourceUrl || !summary.extraResource) {
      findings.push(`P2 - ${result.name} challenge does not repeat the resource URL in both resource.url and accepts[0].extra.resource.`)
    }
  }

  for (const result of preflightResults) {
    const allowed = result.headers['access-control-allow-headers'] ?? ''
    if (allowed !== '*' && !/x-payment/i.test(allowed)) {
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
  const findings = findingList(manifestResult, challengeResults, preflightResults)
  const challengeRows = challengeResults.map(result => {
    const summary = challengeSummary(result)
    return `| ${result.name} | ${result.method ?? 'POST'} | ${result.status} | ${summary.price || '-'} | ${summary.network || '-'} | ${summary.resourceUrl || '-'} |`
  })
  const preflightRows = preflightResults.map(result => {
    return `| ${result.name} | ${result.method ?? 'POST'} | ${result.status} | ${result.headers['access-control-allow-origin'] ?? '-'} | ${result.headers['access-control-allow-headers'] ?? '-'} | ${result.headers['access-control-allow-methods'] ?? '-'} |`
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
    `- Facilitator: ${displayMetadataValue(manifest.facilitator)}`,
    `- Networks: ${valueList(manifest.networks).join(', ') || '-'}`,
    `- Capabilities: ${capabilityList(manifest.capabilities).join(', ') || '-'}`,
    ``,
    `## No-Payment Challenge Map`,
    ``,
    `| Endpoint | Method | HTTP | Price | Network | Resource URL |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...challengeRows,
    ``,
    `## Browser Preflight Map`,
    ``,
    `| Endpoint | Method | HTTP | Allow-Origin | Allow-Headers | Allow-Methods |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...preflightRows,
    ``,
    `## Findings`,
    ``,
    ...(findings.length ? findings.map(item => `- ${item}`) : ['- No obvious launch-readiness findings from the public no-payment probes.']),
    ``,
  ].join('\n')
}

const manifestResult = await fetchManifest(manifestUrl)
const endpoints = manifestResult.body.json ? canonicalEndpointEntries(manifestResult.body.json) : []
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
