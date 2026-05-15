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

function numberFromDecimal(amount) {
  const numeric = Number(amount)
  return Number.isFinite(numeric) ? numeric : null
}

function operationExpectedPrice(operation) {
  const price = operation?.['x-payment-info']?.price
    ?? operation?.['x-payment']?.price
    ?? operation?.payment?.price
  const amount = price?.amount ?? price?.amountUsd ?? price?.usd
  const numeric = numberFromDecimal(amount)
  return numeric === null ? null : numeric
}

function resolveLocalRef(ref, manifest) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined
  return ref
    .slice(2)
    .split('/')
    .map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, part) => value?.[part], manifest)
}

function resolveSchema(schema, manifest, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return schema
  if (!schema.$ref) return schema
  if (seen.has(schema.$ref)) return schema
  const resolved = resolveLocalRef(schema.$ref, manifest)
  if (!resolved) return schema
  seen.add(schema.$ref)
  return resolveSchema(resolved, manifest, seen)
}

function exampleValue(schemaOrParameter, manifest) {
  if (!schemaOrParameter || typeof schemaOrParameter !== 'object') return undefined
  const schema = resolveSchema(schemaOrParameter.schema ?? schemaOrParameter, manifest)
  const value = schemaOrParameter.example
    ?? schema.const
    ?? schema.example
    ?? schema.default
    ?? (Array.isArray(schema.enum) ? schema.enum[0] : undefined)
  if (value !== undefined) return value
  if (schema.type === 'string') {
    if (schema.format === 'uri') return 'https://example.com'
    if (schema.format === 'date-time') return '2026-01-01T00:00:00.000Z'
    if (schema.format === 'date') return '2026-01-01'
    if (Number(schema.minLength) > 0) return 'example'
    return ''
  }
  if (schema.type === 'integer') return Number.isFinite(Number(schema.minimum)) ? Number(schema.minimum) : 1
  if (schema.type === 'number') return Number.isFinite(Number(schema.minimum)) ? Number(schema.minimum) : 1
  if (schema.type === 'boolean') return false
  return undefined
}

function mediaExample(media, manifest) {
  if (!media || typeof media !== 'object') return undefined
  if (media.example !== undefined) return media.example
  const examples = media.examples && typeof media.examples === 'object'
    ? Object.values(media.examples)
    : []
  const firstExample = examples.find(Boolean)
  if (firstExample?.value !== undefined) return firstExample.value
  if (firstExample?.externalValue) return undefined

  const schema = resolveSchema(media.schema, manifest)
  if (!schema || typeof schema !== 'object' || schema.type !== 'object') return undefined
  const body = {}
  const properties = schema.properties && typeof schema.properties === 'object'
    ? schema.properties
    : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required : Object.keys(properties))

  for (const [name, property] of Object.entries(properties)) {
    if (!required.has(name)) continue
    const value = exampleValue(property, manifest)
    if (value !== undefined) body[name] = value
  }

  return Object.keys(body).length ? body : undefined
}

function operationRequestBody(operation, manifest) {
  const content = operation?.requestBody?.content
  if (!content || typeof content !== 'object') return undefined
  const media = content['application/json']
    ?? content['application/*+json']
    ?? Object.entries(content).find(([type]) => /json/i.test(type))?.[1]
  return mediaExample(media, manifest)
}

function operationPaymentSignal(operation) {
  if (operation?.['x-payment-info'] || operation?.['x-payment'] || operation?.['x-x402'] || operation?.payment) return 2
  if (operation?.responses && Object.hasOwn(operation.responses, '402')) return 1
  return 0
}

function openApiProbeUrl(path, operation, baseUrl, manifest) {
  const parameters = Array.isArray(operation?.parameters) ? operation.parameters : []
  let resolvedPath = path
  const searchParams = new URLSearchParams()

  for (const parameter of parameters) {
    const value = exampleValue(parameter, manifest)
    if (value === undefined || value === '') continue
    if (parameter.in === 'path') {
      resolvedPath = resolvedPath.replaceAll(`{${parameter.name}}`, encodeURIComponent(String(value)))
    }
    else if (parameter.in === 'query') {
      searchParams.set(parameter.name, String(value))
    }
  }

  const url = /^https?:\/\//i.test(String(resolvedPath))
    ? new URL(resolvedPath)
    : new URL(String(resolvedPath).replace(/^\/+/, ''), `${baseUrl.replace(/\/?$/, '/')}`)
  for (const [name, value] of searchParams.entries()) {
    url.searchParams.set(name, value)
  }
  return url.toString()
}

function documentBaseUrl(manifest, sourceUrl = manifestUrl) {
  if (typeof manifest.service_url === 'string') return manifest.service_url
  if (typeof manifest.serviceUrl === 'string') return manifest.serviceUrl
  if (typeof manifest.baseUrl === 'string') return manifest.baseUrl
  if (typeof manifest.base_url === 'string') return manifest.base_url
  return new URL('/', sourceUrl).toString()
}

function endpointUrl(rawPath, baseUrl, sourceUrl = manifestUrl) {
  const value = String(rawPath ?? '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const base = value.startsWith('/') ? baseUrl : `${baseUrl.replace(/\/?$/, '/')}`
  return new URL(value, base || documentBaseUrl({}, sourceUrl)).toString()
}

function openApiServerBaseUrl(manifest, sourceUrl = manifestUrl) {
  const rawUrl = manifest.servers?.find(server => typeof server?.url === 'string')?.url
  if (!rawUrl) return documentBaseUrl(manifest, sourceUrl)
  return endpointUrl(rawUrl, documentBaseUrl(manifest, sourceUrl), sourceUrl)
}

function linkedDiscoveryUrl(manifest, sourceUrl = manifestUrl) {
  const rawUrl = manifest?.discovery_url
    ?? manifest?.discoveryUrl
    ?? manifest?.resources_url
    ?? manifest?.resourcesUrl
    ?? (/^(https?:\/\/|\/)/i.test(String(manifest?.openapi ?? '')) ? manifest.openapi : '')
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return ''
  return endpointUrl(rawUrl, documentBaseUrl(manifest, sourceUrl), sourceUrl)
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

  if (Array.isArray(manifest.endpoints)) {
    const baseUrl = documentBaseUrl(manifest)
    for (const endpoint of manifest.endpoints) {
      const rawPath = endpoint?.url ?? endpoint?.endpoint ?? endpoint?.path
      if (!rawPath) continue
      entries.push({
        name: endpoint.id ?? endpoint.name ?? String(rawPath).split('/').filter(Boolean).at(-1) ?? String(rawPath),
        url: endpointUrl(rawPath, baseUrl),
        method: String(endpoint.method ?? 'POST').toUpperCase(),
      })
    }
  }

  if (Array.isArray(manifest.items)) {
    const baseUrl = documentBaseUrl(manifest)
    for (const item of manifest.items) {
      if (item?.type && item.type !== 'http') continue
      const rawPath = item?.resource ?? item?.url ?? item?.endpoint ?? item?.path
      if (!rawPath) continue
      entries.push({
        name: item.metadata?.name ?? item.id ?? item.name ?? String(rawPath).split('/').filter(Boolean).at(-1) ?? String(rawPath),
        url: endpointUrl(rawPath, baseUrl),
        method: String(item.method ?? 'GET').toUpperCase(),
      })
    }
  }

  if (manifest.openapi && manifest.paths && typeof manifest.paths === 'object') {
    const baseUrl = openApiServerBaseUrl(manifest)
    const methods = ['get', 'post', 'put', 'patch', 'delete']
    const openApiEntries = []

    for (const [path, operations] of Object.entries(manifest.paths)) {
      if (!operations || typeof operations !== 'object') continue
      for (const method of methods) {
        const operation = operations[method]
        if (!operation || typeof operation !== 'object') continue
        const url = openApiProbeUrl(path, operation, baseUrl, manifest)
        openApiEntries.push({
          name: operation.operationId ?? `${method.toUpperCase()} ${path}`,
          url,
          method: method.toUpperCase(),
          expectedPriceUsd: operationExpectedPrice(operation),
          requestBody: operationRequestBody(operation, manifest),
          paymentSignal: operationPaymentSignal(operation),
        })
      }
    }

    entries.push(...openApiEntries
      .sort((a, b) => b.paymentSignal - a.paymentSignal)
      .map(({ paymentSignal, ...entry }) => entry))
  }

  const baseUrl = documentBaseUrl(manifest)
  for (const resource of manifest.resources ?? []) {
    if (typeof resource === 'string') {
      const match = resource.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i)
      if (!match) continue
      const [, method, rawPath] = match
      const url = rawPath.startsWith('http')
        ? rawPath
        : new URL(rawPath, manifest.baseUrl ?? manifestUrl).toString()
      entries.push({ name: rawPath.split('/').filter(Boolean).at(-1) ?? rawPath, url, method: method.toUpperCase() })
      continue
    }

    if (!resource || typeof resource !== 'object') continue
    const rawPath = resource.url ?? resource.endpoint ?? resource.resource ?? resource.path
    if (!rawPath) continue
    entries.push({
      name: resource.id
        ?? resource.name
        ?? resource.title
        ?? String(resource.path ?? rawPath).split('/').filter(Boolean).at(-1)
        ?? String(rawPath),
      url: endpointUrl(rawPath, baseUrl),
      method: String(resource.method ?? 'GET').toUpperCase(),
    })
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
    try {
      return JSON.parse(value)
    }
    catch {
      return null
    }
  }
}

function authenticateParams(value, scheme) {
  const header = String(value ?? '').replace(/^www-authenticate:\s*/i, '').trim()
  if (!header || !new RegExp(`^${scheme}\\s+`, 'i').test(header)) return null
  const params = {}
  const pattern = /([a-zA-Z][\w-]*)="([^"]*)"/g
  let match = pattern.exec(header)

  while (match) {
    params[match[1]] = match[2]
    match = pattern.exec(header)
  }

  return params
}

function parsePaymentAuthenticate(value) {
  const params = authenticateParams(value, 'Payment')
  if (!params) return null

  const request = parseEncodedChallenge(params.request)
  if (!request) return null

  return {
    protocol: 'mpp',
    resource: { url: '' },
    accepts: [{
      scheme: 'mpp',
      network: request.methodDetails?.network ?? params.method ?? '',
      amount: request.amount ?? '',
      asset: request.currency ?? '',
      payTo: request.recipient ?? '',
      resource: '',
      maxTimeoutSeconds: '',
      extra: {
        description: request.description ?? '',
        decimals: request.methodDetails?.decimals ?? '',
        expires: params.expires ?? '',
        id: params.id ?? '',
        intent: params.intent ?? '',
        method: params.method ?? '',
      },
    }],
  }
}

function parseX402Authenticate(value) {
  const params = authenticateParams(value, 'X402')
  if (!params) return null

  const requirements = parseEncodedChallenge(params.requirements ?? params.request)
  if (!requirements || !Array.isArray(requirements.accepts)) return null

  return {
    protocol: requirements.protocol ?? 'x402',
    ...requirements,
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

async function probeEndpoint(entry, origin = preflightOrigin) {
  const method = entry.method ?? 'POST'
  const response = await fetch(entry.url, {
    method,
    headers: {
      ...headers,
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: method === 'GET' || method === 'HEAD'
      ? undefined
      : JSON.stringify(entry.requestBody ?? {}),
  })
  const body = await readText(response)
  const headerChallenge = parseEncodedChallenge(
    response.headers.get('payment-required') ?? response.headers.get('x-payment-required'),
  )
  const authenticateChallenge = parsePaymentAuthenticate(response.headers.get('www-authenticate'))
    ?? parseX402Authenticate(response.headers.get('www-authenticate'))

  const bodyHasChallenge = Array.isArray(body.json?.accepts) || Array.isArray(body.json?.schemes)
  if (!bodyHasChallenge) {
    if (headerChallenge && typeof headerChallenge === 'object') {
      body.json = headerChallenge
    }
    else if (authenticateChallenge) {
      authenticateChallenge.resource = authenticateChallenge.resource ?? { url: entry.url }
      authenticateChallenge.resource.url = authenticateChallenge.resource.url || entry.url
      authenticateChallenge.accepts[0].resource = authenticateChallenge.accepts[0].resource || entry.url
      body.json = authenticateChallenge
    }
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
  const firstAccept = challengeAccepts(result)[0] ?? {}
  const amount = acceptAmountValue(firstAccept)
  const resourceUrl = challenge?.resource?.url ?? firstAccept.resource ?? ''
  const extraResource = firstAccept.extra?.resource ?? firstAccept.resource ?? ''

  return {
    status: result.status,
    resourceUrl,
    network: firstAccept.network ?? '',
    amount,
    price: challengePrice(firstAccept, result),
    priceUsd: challengePriceUsd(firstAccept, result),
    expectedPriceUsd: typeof result.expectedPriceUsd === 'number' ? result.expectedPriceUsd : null,
    payTo: firstAccept.payTo ?? '',
    asset: acceptAssetValue(firstAccept),
    timeout: firstAccept.maxTimeoutSeconds ?? '',
    extraResource,
  }
}

function challengeAccepts(result) {
  if (Array.isArray(result.body.json?.accepts)) return result.body.json.accepts
  if (Array.isArray(result.body.json?.schemes)) return result.body.json.schemes
  return []
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
  const rawAmount = acceptAmountValue(accept)
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') return false
  const amount = String(rawAmount)
  if (amount.includes('.')) return true
  if (accept.maxAmountRequired !== undefined || accept.maxAmount !== undefined) return false
  if (!accept.asset && (accept.token || result.headers?.['x-payment-token'])) return true
  return result.headers?.['x-payment-amount'] === amount
}

function challengePrice(accept, result) {
  const amount = acceptAmountValue(accept)
  return usesDecimalAmount(accept, result)
    ? moneyFromDecimal(amount)
    : moneyFromAtomic(amount, acceptDecimals(accept))
}

function challengePriceUsd(accept, result) {
  const amount = acceptAmountValue(accept)
  if (usesDecimalAmount(accept, result)) return numberFromDecimal(amount)
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return null
  return numeric / (10 ** acceptDecimals(accept))
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

function entryKey(entry) {
  return `${entry.method ?? 'POST'} ${entry.url}`
}

function looksLikeOperationalHealthEndpoint(result) {
  const value = `${result.name ?? ''} ${new URL(result.url).pathname}`.toLowerCase()
  return /(^|[/_\s-])(health|healthz|ready|readiness|live|liveness|status)([/_\s-]|$)/.test(value)
}

function valueList(value) {
  if (Array.isArray(value)) return value.map(displayMetadataValue)
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
  const challengesByEntry = new Map(challengeResults.map(result => [entryKey(result), result]))

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
        if (!looksLikeOperationalHealthEndpoint(result)) {
          findings.push(`P3 - ${result.name} returned ${result.status} without a payment challenge for a no-payment ${result.method ?? 'POST'} probe; document this as free/trial access or move the 402 challenge before content.`)
        }
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
    if (!result.headers?.['access-control-allow-origin']) {
      findings.push(`P1 - ${result.name} 402 challenge response does not allow the requesting origin; browser agents cannot read the payment requirements even if preflight succeeds.`)
    }
    if (summary.resourceUrl.startsWith('http://') || summary.extraResource.startsWith('http://')) {
      findings.push(`P1 - ${result.name} challenge uses a non-HTTPS resource URL: ${summary.resourceUrl || summary.extraResource}.`)
    }
    if (!summary.amount || !summary.payTo || !summary.asset) {
      findings.push(`P1 - ${result.name} challenge is missing amount, payTo, or asset metadata.`)
    }
    if (summary.expectedPriceUsd !== null && summary.priceUsd !== null) {
      const delta = Math.abs(summary.expectedPriceUsd - summary.priceUsd)
      if (delta > 0.000001) {
        findings.push(`P1 - ${result.name} documented price ${moneyFromDecimal(summary.expectedPriceUsd)} does not match live 402 challenge price ${moneyFromDecimal(summary.priceUsd)}.`)
      }
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
    const challengeResult = challengesByEntry.get(entryKey(result))
    if (!challengeResult || !hasPaymentChallenge(challengeResult)) continue
    const allowedOrigin = result.headers['access-control-allow-origin'] ?? ''
    if (!allowedOrigin) {
      findings.push(`P1 - ${result.name} CORS preflight does not allow the requesting origin; observed allow-origin: none.`)
    }
    const allowed = result.headers['access-control-allow-headers'] ?? ''
    if (allowed !== '*' && !/x-payment/i.test(allowed)) {
      const observed = result.status >= 400
        ? `HTTP ${result.status}; allow headers: ${allowed || 'none'}`
        : `allow headers: ${allowed || 'none'}`
      findings.push(`P1 - ${result.name} CORS preflight does not allow X-PAYMENT; observed ${observed}.`)
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

function formatReport(manifestResult, challengeResults, preflightResults, sourceResult = null) {
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
    ...(sourceResult ? [`Source: ${sourceResult.url}`] : []),
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

let sourceResult = null
let manifestResult = await fetchManifest(manifestUrl)
let endpoints = manifestResult.body.json ? canonicalEndpointEntries(manifestResult.body.json) : []

if (endpoints.length === 0 && manifestResult.body.json) {
  const discoveryUrl = linkedDiscoveryUrl(manifestResult.body.json, manifestResult.url)
  if (discoveryUrl) {
    const linkedResult = await fetchManifest(discoveryUrl)
    const linkedEndpoints = linkedResult.body.json ? canonicalEndpointEntries(linkedResult.body.json) : []
    if (linkedEndpoints.length > 0) {
      sourceResult = manifestResult
      manifestResult = linkedResult
      endpoints = linkedEndpoints
    }
  }
}

const challengeResults = []
const preflightResults = []

for (const entry of endpoints) {
  challengeResults.push(await probeEndpoint(entry))
  preflightResults.push(await probePreflight(entry))
}

const report = formatReport(manifestResult, challengeResults, preflightResults, sourceResult)

if (outputPath) {
  await writeFile(outputPath, `${report}\n`)
}

console.log(report)
