const manifestUrl = document.querySelector('#manifestUrl')
const manifestJson = document.querySelector('#manifestJson')
const challengeJson = document.querySelector('#challengeJson')
const challengeHeader = document.querySelector('#challengeHeader')
const directEndpointMode = document.querySelector('#directEndpointMode')
const endpointMethod = document.querySelector('#endpointMethod')
const fetchManifest = document.querySelector('#fetchManifest')
const probeEndpoints = document.querySelector('#probeEndpoints')
const surfaceScore = document.querySelector('#surfaceScore')
const surfaceTitle = document.querySelector('#surfaceTitle')
const surfaceSummary = document.querySelector('#surfaceSummary')
const surfaceSignals = document.querySelector('#surfaceSignals')
const surfaceFixes = document.querySelector('#surfaceFixes')
const copySurfaceResult = document.querySelector('#copySurfaceResult')
const downloadSurfaceReport = document.querySelector('#downloadSurfaceReport')
const emailSurfaceResult = document.querySelector('#emailSurfaceResult')
const manualInputs = [
  document.querySelector('#hasHttpsResource'),
  document.querySelector('#hasBrowserPaymentHeader'),
  document.querySelector('#hasDocumentedNetwork'),
  document.querySelector('#hasMetadataPolicy'),
  document.querySelector('#hasFailureLanguage'),
]

const probeState = {
  manifestStatus: null,
  endpointResults: [],
}

function parseJson(text) {
  const clean = text.trim()
  if (!clean) return null
  try {
    return JSON.parse(clean)
  }
  catch {
    return null
  }
}

function valueList(value) {
  if (Array.isArray(value)) return value.map(String)
  if (value && typeof value === 'object') return Object.keys(value)
  if (typeof value === 'string') return [value]
  return []
}

function capabilityList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => item?.id ?? item?.name ?? item).filter(Boolean).map(String)
}

function endpointEntries(manifest) {
  const base = manifest?.baseUrl || manifestUrl.value.trim() || window.location.origin
  const entries = []
  const directUrl = manifestUrl.value.trim()

  if (directEndpointMode.checked && /^https?:\/\//i.test(directUrl)) {
    entries.push({
      name: new URL(directUrl).pathname.split('/').filter(Boolean).at(-1) ?? directUrl,
      url: directUrl,
      method: endpointMethod.value || 'POST',
    })
  }

  entries.push(...Object.entries(manifest?.x402Endpoints ?? {})
    .filter(([, url]) => typeof url === 'string' && /^https?:\/\//i.test(url))
    .map(([name, url]) => ({ name, url, method: 'POST' })))

  for (const [category, items] of Object.entries(manifest?.categories ?? {})) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (typeof item?.endpoint === 'string' && /^https?:\/\//i.test(item.endpoint)) {
        entries.push({ name: item.id ?? item.name ?? category, url: item.endpoint, method: item.method ?? 'POST' })
      }
    }
  }

  if (manifest?.openapi && manifest.paths && typeof manifest.paths === 'object') {
    const serverBase = manifest.servers?.find(server => typeof server?.url === 'string')?.url ?? base
    const methods = ['get', 'post', 'put', 'patch', 'delete']

    for (const [path, operations] of Object.entries(manifest.paths)) {
      if (!operations || typeof operations !== 'object') continue
      for (const method of methods) {
        const operation = operations[method]
        if (!operation || typeof operation !== 'object') continue
        const url = path.startsWith('http')
          ? path
          : new URL(path, serverBase).toString()
        entries.push({
          name: operation.operationId ?? `${method.toUpperCase()} ${path}`,
          url,
          method: method.toUpperCase(),
        })
      }
    }
  }

  for (const resource of manifest?.resources ?? []) {
    if (typeof resource !== 'string') continue
    const match = resource.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i)
    if (!match) continue
    const [, method, rawPath] = match
    const url = rawPath.startsWith('http')
      ? rawPath
      : new URL(rawPath, base).toString()
    entries.push({ name: rawPath.split('/').filter(Boolean).at(-1) ?? rawPath, url, method: method.toUpperCase() })
  }

  const seen = new Set()
  return entries.filter(entry => {
    const key = `${entry.method}:${entry.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 6)
}

function challengeList() {
  const headerChallenge = parsePaymentAuthenticate(challengeHeader.value.trim())
  const parsed = parseJson(challengeJson.value)
  const entries = []
  if (headerChallenge) entries.push(headerChallenge)
  if (!parsed) return entries
  if (Array.isArray(parsed)) entries.push(...parsed.filter(Boolean))
  else if (Array.isArray(parsed.results)) entries.push(...parsed.results.filter(Boolean))
  else if (Array.isArray(parsed.challenges)) entries.push(...parsed.challenges.filter(Boolean))
  else entries.push(parsed)
  return entries
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

function challengeSummary(challenge) {
  const firstAccept = challenge?.accepts?.[0] ?? {}
  const amount = firstAccept.amount ?? firstAccept.maxAmountRequired ?? firstAccept.maxAmount ?? ''
  const resourceUrl = challenge?.resource?.url ?? firstAccept.resource ?? ''
  const extraResource = firstAccept.extra?.resource ?? firstAccept.resource ?? ''
  return {
    protocol: challenge?.protocol ?? (firstAccept.scheme === 'mpp' ? 'mpp' : 'x402'),
    resourceUrl,
    network: firstAccept.network ?? '',
    amount,
    price: moneyFromAtomic(amount),
    payTo: firstAccept.payTo ?? '',
    asset: firstAccept.asset ?? '',
    timeout: firstAccept.maxTimeoutSeconds ?? '',
    extraResource,
  }
}

function challengeAccepts(challenges) {
  return challenges.flatMap(challenge => Array.isArray(challenge?.accepts) ? challenge.accepts : [])
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

function addCheck(checks, check) {
  checks.push(check)
}

function manual(id) {
  return document.querySelector(`#${id}`).checked
}

function sameHost(urls) {
  const hosts = urls
    .filter(Boolean)
    .map(url => {
      try {
        return new URL(url).host
      }
      catch {
        return ''
      }
    })
    .filter(Boolean)
  return hosts.length <= 1 || new Set(hosts).size === 1
}

function analyze() {
  const manifest = parseJson(manifestJson.value)
  const directEndpoint = directEndpointMode.checked
  const challenges = challengeList()
  const entries = endpointEntries(manifest)
  const challengeSummaries = challenges.map(challengeSummary)
  const accepts = challengeAccepts(challenges)
  const challengeNetworks = new Set(challengeSummaries.map(item => item.network).filter(Boolean))
  const resourceUrls = challengeSummaries.flatMap(item => [item.resourceUrl, item.extraResource]).filter(Boolean)
  const hasManifest = Boolean(manifest)
  const hasChallenge = challenges.length > 0
  const checks = []

  if (!hasManifest && !hasChallenge && probeState.endpointResults.length === 0 && !directEndpoint) {
    return { checks, manifest, entries, challenges, challengeSummaries }
  }

  const manifestStatusOk = directEndpoint || !probeState.manifestStatus || (probeState.manifestStatus >= 200 && probeState.manifestStatus < 300)
  const networkNames = valueList(manifest?.networks)
  const manifestHasAgent = Boolean(manifest?.agent?.name && manifest?.agent?.wallet)
  const manifestHasEndpoints = entries.length > 0
  const manifestHasNetworks = networkNames.length > 0
  const manifestHasCapabilities = capabilityList(manifest?.capabilities).length > 0 || Object.keys(manifest?.categories ?? {}).length > 0
  const allChallengesAre402 = probeState.endpointResults.length === 0
    ? hasChallenge
    : probeState.endpointResults.every(result => result.status === 402)
  const allPricesPresent = challengeSummaries.length > 0
    && challengeSummaries.every(item => item.amount && item.payTo && item.asset && item.network)
  const noPlaceholderPayTo = accepts.length === 0
    || accepts.every(item => !looksLikePlaceholderPayTo(item.payTo))
  const noStagingNetwork = accepts.length === 0
    || accepts.every(item => !looksLikeStagingNetwork(item.network))
  const httpsResources = manual('hasHttpsResource') || (resourceUrls.length > 0 && resourceUrls.every(url => /^https:\/\//i.test(url)))
  const resourceRepeated = challengeSummaries.length > 0
    && challengeSummaries.every(item => item.resourceUrl && item.extraResource)
  const resourceHostStable = sameHost(resourceUrls)
  const networkMatch = manual('hasDocumentedNetwork')
    || !manifestHasNetworks
    || challengeNetworks.size === 0
    || networkNames.some(network => [...challengeNetworks].some(challengeNetwork => challengeNetwork.includes(network) || network.includes(challengeNetwork)))
  const browserHeader = manual('hasBrowserPaymentHeader')
    || probeState.endpointResults.some(result => result.allowHeaders === '*' || /x-payment/i.test(result.allowHeaders ?? ''))
  const reviewText = `${manifestJson.value}\n${challengeJson.value}\n${challengeHeader.value}\n${JSON.stringify(challenges)}`
  const hasMetadataPolicy = manual('hasMetadataPolicy')
    || /metadata|resource|description|memo|redact|filter|minimi[sz]e|pii|private/i.test(reviewText)
  const hasFailureLanguage = manual('hasFailureLanguage')
    || /failed|expired|duplicate|dispute|refund|settle|reconcile|idempot/i.test(reviewText)
  const noSingularConflict = !(manifest?.x402Endpoint && manifest?.x402Endpoints)
  const probeBlocked = probeState.endpointResults.some(result => result.error)

  addCheck(checks, {
    group: 'Manifest',
    label: 'Manifest JSON is present and parseable',
    ok: directEndpoint || hasManifest,
    weight: 8,
    fix: 'Publish a parseable x402 manifest at the documented URL.',
  })
  addCheck(checks, {
    group: 'Manifest',
    label: 'Fetched manifest returned a successful HTTP status',
    ok: manifestStatusOk,
    weight: 6,
    fix: 'Return a 2xx JSON response from the documented x402 manifest URL.',
  })
  addCheck(checks, {
    group: 'Manifest',
    label: 'Agent name and wallet are visible',
    ok: directEndpoint || !hasManifest || manifestHasAgent,
    weight: 8,
    fix: 'Add agent.name and agent.wallet so clients know who receives payment.',
  })
  addCheck(checks, {
    group: 'Manifest',
    label: 'Machine-readable endpoint map exists',
    ok: !hasManifest || manifestHasEndpoints,
    weight: 10,
    fix: 'Expose x402Endpoints with named HTTPS URLs for each paid action.',
  })
  addCheck(checks, {
    group: 'Manifest',
    label: 'Networks and capabilities are documented',
    ok: directEndpoint || !hasManifest || (manifestHasNetworks && manifestHasCapabilities),
    weight: 8,
    fix: 'List supported networks and capability IDs so integrators can bind intent to payment.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'No-payment request returns a 402 challenge shape',
    ok: allChallengesAre402,
    weight: 10,
    fix: 'For no-payment POSTs, return a structured 402 challenge instead of a generic error.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'Amount, asset, network, and payTo are present',
    ok: !hasChallenge || allPricesPresent,
    weight: 12,
    fix: 'Include amount, asset, network, and payTo before a client can approve or sign.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'No placeholder payment recipients are advertised',
    ok: !hasChallenge || noPlaceholderPayTo,
    weight: 10,
    fix: 'Replace zero-address, system-program, or placeholder payTo values before presenting the endpoint as production-ready.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'Payment networks are production rails',
    ok: !hasChallenge || noStagingNetwork,
    weight: 7,
    fix: 'If the endpoint is still testnet, label it demo-only. If it is production, return live-value networks and production payTo recipients.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'Resource URLs are HTTPS',
    ok: !hasChallenge || httpsResources,
    weight: 10,
    fix: 'Canonicalize every resource URL to HTTPS in resource.url and accepts[0].extra.resource.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'Resource URL is repeated consistently',
    ok: !hasChallenge || resourceRepeated,
    weight: 6,
    fix: 'Repeat the paid resource in both resource.url and accepts[0].extra.resource for wallet and facilitator logs.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'Resource hosts are stable',
    ok: !hasChallenge || resourceHostStable,
    weight: 5,
    fix: 'Avoid mixing public docs, API, and gateway hosts inside one payment challenge unless the trust boundary is explained.',
  })
  addCheck(checks, {
    group: 'Challenge',
    label: 'Manifest networks match observed challenges',
    ok: networkMatch,
    weight: 8,
    fix: 'Separate live x402 networks from other auth or API-key networks, or return matching challenges for each supported rail.',
  })
  addCheck(checks, {
    group: 'Browser',
    label: 'Browser payment header path is available when needed',
    ok: browserHeader || !manifestHasEndpoints,
    weight: 7,
    fix: 'If browser clients are expected, allow the required payment header in CORS and document the client path.',
  })
  addCheck(checks, {
    group: 'Browser',
    label: 'Browser probe was not blocked by CORS',
    ok: !probeBlocked,
    weight: 4,
    fix: 'If live browser demos matter, configure CORS for the documented origin and headers. If not, document server-side usage only.',
  })
  addCheck(checks, {
    group: 'Scope',
    label: 'No ambiguous singular/plural endpoint conflict',
    ok: !hasManifest || noSingularConflict,
    weight: 4,
    fix: 'If both x402Endpoint and x402Endpoints are present, document which one clients should prefer.',
  })
  addCheck(checks, {
    group: 'Scope',
    label: 'Payment metadata policy is visible',
    ok: hasMetadataPolicy,
    weight: 8,
    fix: 'Document what metadata leaves the app, and filter private prompts, user content, internal IDs, and secrets.',
  })
  addCheck(checks, {
    group: 'Scope',
    label: 'Failure and duplicate-payment behavior is documented',
    ok: hasFailureLanguage,
    weight: 8,
    fix: 'Document expired, failed, duplicate, disputed, and partial payment handling before launch.',
  })

  return { checks, manifest, entries, challenges, challengeSummaries }
}

function scoreChecks(checks) {
  const possible = checks.reduce((sum, check) => sum + check.weight, 0)
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0)
  return possible ? Math.round((earned / possible) * 100) : 0
}

function grade(score) {
  if (score >= 86) return ['Launch-surface ready', 'The public x402 shape is close. Keep the evidence tight and make the paid path explicit.']
  if (score >= 70) return ['Needs a short patch pass', 'The surface is credible, but a few payment or browser details could block real users.']
  if (score >= 45) return ['Not ready for public spend', 'The core shape is visible, but the launch trust story still has material holes.']
  return ['No reliable x402 surface yet', 'Add a manifest, structured 402 challenge, price fields, and metadata boundaries before launch.']
}

function signalMarkup(checks) {
  return checks.map(check => `
    <div class="signal-item ${check.ok ? 'ok' : 'warn'}">
      <span>${check.ok ? 'pass' : 'fix'}</span>
      <strong>${check.group}</strong>
      <p>${check.label}</p>
    </div>
  `).join('')
}

function reportMarkdown(result) {
  const score = scoreChecks(result.checks)
  const [title, summary] = grade(score)
  const manifest = result.manifest
  const fixes = result.checks.filter(check => !check.ok)
  const challengeRows = result.challengeSummaries.map((item, index) => {
    return `| ${index + 1} | ${item.protocol || '-'} | ${item.price || '-'} | ${item.network || '-'} | ${item.payTo || '-'} | ${item.resourceUrl || '-'} |`
  })

  return [
    `# x402 Surface Check`,
    ``,
    `Score: ${score}/100`,
    `Result: ${title}`,
    ``,
    summary,
    ``,
    `## Manifest`,
    ``,
    `- Agent: ${manifest?.agent?.name ?? '-'}`,
    `- Wallet: ${manifest?.agent?.wallet ?? '-'}`,
    `- Networks: ${valueList(manifest?.networks).join(', ') || '-'}`,
    `- Endpoints: ${result.entries.map(entry => `${entry.name} ${entry.url}`).join('; ') || '-'}`,
    ``,
    `## Challenge Map`,
    ``,
    `| # | Protocol | Price | Network | Pay To | Resource URL |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...(challengeRows.length ? challengeRows : ['| - | - | - | - | - | - |']),
    ``,
    `## Patch Queue`,
    ``,
    ...(fixes.length ? fixes.map(check => `- ${check.group}: ${check.fix}`) : ['- No obvious patch items from the supplied public surface.']),
    ``,
    `Scope: browser-side manifest and challenge review. No payment headers, no paid calls.`,
  ].join('\n')
}

function updateResult() {
  const result = analyze()
  const score = scoreChecks(result.checks)
  const [title, summary] = grade(score)
  const fixes = result.checks.filter(check => !check.ok)

  surfaceScore.textContent = score
  surfaceTitle.textContent = result.checks.length ? title : 'No surface loaded'
  surfaceSummary.textContent = result.checks.length ? summary : 'Paste a manifest or fetch a public manifest to start.'
  surfaceSignals.innerHTML = result.checks.length
    ? signalMarkup(result.checks)
    : '<div class="signal-item warn"><span>wait</span><strong>Input</strong><p>Paste or fetch a manifest to start.</p></div>'
  surfaceFixes.innerHTML = fixes.length
    ? fixes.slice(0, 8).map(check => `<li>${check.fix}</li>`).join('')
    : '<li>No obvious patch items from the supplied public surface.</li>'

  const report = reportMarkdown(result)
  emailSurfaceResult.href = `mailto:hello@tateprograms.com?subject=${encodeURIComponent('x402 Surface Check result')}&body=${encodeURIComponent(report.slice(0, 1800))}`
}

async function readJsonResponse(response) {
  const text = await response.text()
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  }
  catch {
    throw new Error(`Response was not JSON. HTTP ${response.status}`)
  }
}

function parseEncodedChallenge(value) {
  if (!value) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
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

function parsePaymentAuthenticate(value) {
  const header = value.replace(/^www-authenticate:\s*/i, '').trim()
  if (!header || !/^Payment\s+/i.test(header)) return null
  const params = {}
  const pattern = /([a-zA-Z][\w-]*)="([^"]*)"/g
  let match = pattern.exec(header)

  while (match) {
    params[match[1]] = match[2]
    match = pattern.exec(header)
  }

  const request = parseEncodedChallenge(params.request)
  if (!request) return null

  const resource = manifestUrl.value.trim()
  return {
    protocol: 'mpp',
    resource: { url: resource },
    accepts: [{
      scheme: 'mpp',
      network: request.methodDetails?.network ?? request.network ?? '',
      amount: request.amount ?? '',
      asset: request.currency ?? request.asset ?? '',
      payTo: request.recipient ?? request.payTo ?? '',
      resource,
      maxTimeoutSeconds: '',
      extra: {
        description: request.description ?? '',
        expires: params.expires ?? '',
        id: params.id ?? '',
        intent: params.intent ?? '',
        method: params.method ?? '',
      },
    }],
  }
}

async function fetchPublicManifest() {
  const url = manifestUrl.value.trim()
  if (!url) return
  fetchManifest.disabled = true
  fetchManifest.textContent = 'fetching...'
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    probeState.manifestStatus = response.status
    manifestJson.value = await readJsonResponse(response)
  }
  catch (error) {
    surfaceSummary.textContent = `Browser fetch failed: ${error.message}. Paste the manifest JSON instead.`
  }
  finally {
    fetchManifest.disabled = false
    fetchManifest.textContent = 'fetch manifest'
    updateResult()
  }
}

async function tryNoPaymentProbes() {
  const manifest = parseJson(manifestJson.value)
  const entries = endpointEntries(manifest)
  if (entries.length === 0) return

  probeEndpoints.disabled = true
  probeEndpoints.textContent = 'probing...'
  probeState.endpointResults = []

  const challenges = []
  for (const entry of entries.slice(0, 6)) {
    try {
      const method = entry.method ?? 'POST'
      const response = await fetch(entry.url, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: method === 'GET' || method === 'HEAD' ? undefined : '{}',
      })
      const text = await response.text()
      let json = null
      try {
        json = JSON.parse(text)
      }
      catch {
        json = null
      }
      const headerChallenge = parseEncodedChallenge(
        response.headers.get('payment-required') ?? response.headers.get('x-payment-required'),
      )
      const paymentChallenge = parsePaymentAuthenticate(response.headers.get('www-authenticate') ?? '')
      if (!json?.accepts?.length) {
        if (headerChallenge) {
          json = headerChallenge
        }
        else if (paymentChallenge) {
          paymentChallenge.resource.url = entry.url
          paymentChallenge.accepts[0].resource = entry.url
          json = paymentChallenge
        }
      }
      probeState.endpointResults.push({
        ...entry,
        status: response.status,
        allowHeaders: response.headers.get('access-control-allow-headers') ?? '',
      })
      if (json) challenges.push(json)
    }
    catch (error) {
      probeState.endpointResults.push({ ...entry, error: error.message })
    }
  }

  if (challenges.length) {
    challengeJson.value = JSON.stringify(challenges.length === 1 ? challenges[0] : challenges, null, 2)
  }

  probeEndpoints.disabled = false
  probeEndpoints.textContent = 'try no-payment probes'
  updateResult()
}

async function copyResult() {
  await navigator.clipboard.writeText(reportMarkdown(analyze()))
  copySurfaceResult.textContent = 'copied'
  window.setTimeout(() => {
    copySurfaceResult.textContent = 'copy result'
  }, 1400)
}

function downloadReport() {
  const blob = new Blob([reportMarkdown(analyze())], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'x402-surface-check.md'
  link.click()
  URL.revokeObjectURL(url)
}

fetchManifest.addEventListener('click', fetchPublicManifest)
probeEndpoints.addEventListener('click', tryNoPaymentProbes)
copySurfaceResult.addEventListener('click', copyResult)
downloadSurfaceReport.addEventListener('click', downloadReport)
manifestJson.addEventListener('input', updateResult)
challengeJson.addEventListener('input', updateResult)
challengeHeader.addEventListener('input', updateResult)
manifestUrl.addEventListener('input', updateResult)
directEndpointMode.addEventListener('change', updateResult)
endpointMethod.addEventListener('change', updateResult)
manualInputs.forEach(input => input.addEventListener('change', updateResult))
updateResult()
