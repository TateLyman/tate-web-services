# PayToll Provider Packet: Tate Programs x402 Readiness APIs

Prepared: 2026-05-19

## Provider

- Provider: Tate Programs
- Site: https://tateprograms.com
- Contact: hello@tateprograms.com
- Service catalog: https://tateprograms.com/services.json
- Agent card: https://the402.tateprograms.com/.well-known/agent-card.json
- Settlement: USDC on Base mainnet (`eip155:8453`)
- Payout wallet: `0x7bc5e304ca289823dec021012d6bb361ddf6b368`

## Requested Listings

### x402 Launch Triage

- Public x402 endpoint: `https://the402.tateprograms.com/api/x402/triage`
- Proxy upstream endpoint: `https://the402.tateprograms.com/api/provider/triage`
- Method: `POST`
- Suggested marketplace price: `$0.01` per call
- Purpose: no-payment launch-surface triage for public x402, MPP, Pay.sh, AgentCore-style, and paid API surfaces.
- Input: JSON body with `url`, optional `method`, optional `origin`.
- Output: status/header summary, x402 challenge shape, cache/CORS/resource notes, attack-control findings, and ranked fix notes.

### x402 Index Watch

- Public x402 endpoint: `https://the402.tateprograms.com/api/x402/index-watch`
- Proxy upstream endpoint: `https://the402.tateprograms.com/api/provider/index-watch`
- Method: `POST`
- Suggested marketplace price: `$0.01` per call
- Purpose: 402 Index provider/domain/service health and payment-validity watch.
- Input: JSON body with `q`, optional `protocol`, optional `health`, optional `limit`.
- Output: 402 Index source summary, health/payment/domain counts, service rows, and launch-risk findings.

## Public x402 Challenge Readback

Probe:

```bash
curl -i -X POST https://the402.tateprograms.com/api/x402/triage
curl -i -X POST https://the402.tateprograms.com/api/x402/index-watch
```

Observed for both public x402 endpoints:

- HTTP status: `402`
- `cache-control: no-store`
- `access-control-allow-origin: https://tateprograms.com`
- `access-control-expose-headers: payment-required,x-payment-response`
- `payment-required` header present
- `x402Version: 2`
- `scheme: exact`
- `network: eip155:8453`
- USDC asset: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Amount: `10000` micro-USDC (`$0.01`)
- `payTo: 0x7bc5e304ca289823dec021012d6bb361ddf6b368`

Resource bindings:

- Triage resource: `https://the402.tateprograms.com/api/x402/triage`
- Index Watch resource: `https://the402.tateprograms.com/api/x402/index-watch`

## Proxy Upstream Boundary

The proxy upstream routes are for marketplaces that collect payment from the buyer first, then forward the request with a private upstream auth header.

Required private auth header:

```text
X-Tate-Provider-Token
```

No-auth probe:

```bash
curl -i -X POST https://the402.tateprograms.com/api/provider/triage \
  -H 'content-type: application/json' \
  --data '{"url":"https://example.com"}'

curl -i -X POST https://the402.tateprograms.com/api/provider/index-watch \
  -H 'content-type: application/json' \
  --data '{"q":"example.com"}'
```

Observed for both proxy upstream endpoints without the private header:

- HTTP status: `401`
- Body: `{"error":"missing_provider_proxy_token"}`
- `cache-control: no-store`
- CORS allow headers include `x-tate-provider-token`

This proves the proxy upstream does not expose a public free bypass and does not force buyers into a second public x402 challenge. A marketplace reviewer can verify the public boundary without seeing the private token.

## Paste-Ready Listing Copy

Tate Programs x402 Launch Triage: a `$0.01` Base USDC API for no-payment launch-surface triage of public x402, MPP, Pay.sh, AgentCore-style, and paid API endpoints. It returns challenge/resource mapping, cache/CORS/header notes, and ranked launch-risk findings. Public x402 endpoint: `https://the402.tateprograms.com/api/x402/triage`. Proxy upstream for marketplace-collected payment: `https://the402.tateprograms.com/api/provider/triage`.

Tate Programs x402 Index Watch: a `$0.01` Base USDC API for 402 Index provider/domain/service health and payment-validity watch. It returns source summary, health/payment/domain counts, service rows, and launch-risk findings. Public x402 endpoint: `https://the402.tateprograms.com/api/x402/index-watch`. Proxy upstream for marketplace-collected payment: `https://the402.tateprograms.com/api/provider/index-watch`.

## Private Fields

- Do not publish the private upstream auth token.
- Do not require a second x402 challenge after marketplace payment if routing through the proxy upstream endpoints.
- If PayToll prefers direct x402 instead of proxy settlement, use the public x402 endpoints and Base payout wallet above.
