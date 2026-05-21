const API_URL = "https://the402.tateprograms.com/api/ucp/readiness";

const form = document.querySelector("#ucpCheckForm");
const urlInput = document.querySelector("#merchantUrl");
const sampleButton = document.querySelector("#loadSampleMerchant");
const copyButton = document.querySelector("#copyUcpReport");
const scoreEl = document.querySelector("#ucpScore");
const titleEl = document.querySelector("#ucpTitle");
const summaryEl = document.querySelector("#ucpSummary");
const signalListEl = document.querySelector("#ucpSignals");
const checkListEl = document.querySelector("#ucpChecks");
const outputEl = document.querySelector("#ucpOutput");

let latestReport = null;

function setLoading() {
  scoreEl.textContent = "--";
  titleEl.textContent = "Checking public surfaces";
  summaryEl.textContent = "Fetching the homepage, UCP profile, agent docs, robots, and sitemap without logging in or touching checkout.";
  signalListEl.innerHTML = "";
  checkListEl.innerHTML = "";
  outputEl.value = "";
}

function classifyScore(score) {
  if (score >= 75) return "Strong public discovery surface";
  if (score >= 50) return "Partial agent-commerce readiness";
  if (score >= 30) return "Discovery gaps found";
  return "Thin public readiness surface";
}

function renderSignals(report) {
  const findings = report.findings || [];
  signalListEl.innerHTML = findings.map(finding => `<div class="signal-row">${escapeHtml(finding)}</div>`).join("");

  const checks = report.checks || [];
  checkListEl.innerHTML = checks.map(check => {
    const status = check.ok ? "pass" : "check";
    const signals = (check.signals || []).join(", ") || "no matching signal";
    return `
      <article>
        <p class="card-command">${escapeHtml(check.id)}</p>
        <h3>${escapeHtml(String(check.status))} ${status}</h3>
        <p>${escapeHtml(signals)}</p>
        <code>${escapeHtml(check.final_url || check.url)}</code>
      </article>
    `;
  }).join("");
}

function renderReport(report) {
  latestReport = report;
  const score = Number(report.score || 0);
  scoreEl.textContent = String(score);
  titleEl.textContent = classifyScore(score);
  summaryEl.textContent = `${report.input?.origin || "Storefront"} returned ${report.checks?.length || 0} public discovery checks. This does not mutate cart, checkout, payment, or order state.`;
  renderSignals(report);
  outputEl.value = buildMarkdownReport(report);
}

function renderError(error, title = "Check failed") {
  latestReport = null;
  scoreEl.textContent = "0";
  titleEl.textContent = title;
  summaryEl.textContent = error.message || "The public URL could not be checked.";
  signalListEl.innerHTML = `<div class="signal-row">Use a public HTTPS merchant, product, storefront, or demo URL.</div>`;
  checkListEl.innerHTML = "";
  outputEl.value = "";
}

function buildMarkdownReport(report) {
  const lines = [
    "# Universal Cart / UCP Readiness Snapshot",
    "",
    `URL: ${report.input?.url || ""}`,
    `Checked: ${report.checked_at || ""}`,
    `Score: ${report.score || 0}/100`,
    "",
    "## Findings",
    ...(report.findings || []).map(finding => `- ${finding}`),
    "",
    "## Public Checks",
    ...(report.checks || []).map(check => `- ${check.id}: ${check.status} ${check.ok ? "ok" : "needs review"} (${(check.signals || []).join(", ") || "no signal"})`),
    "",
    "## Paid Scope",
    `- ${report.paid_scope?.readiness_map || "$750 for one authorized commerce surface"}`,
    `- ${report.paid_scope?.launch_sprint || "$2,500+ for white-label rollout support"}`,
    `- ${report.paid_scope?.url || "https://tateprograms.com/universal-cart-readiness.html"}`,
    "",
    report.scope || "Public no-payment discovery only."
  ];
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) {
    renderError(new Error("Enter a public merchant or storefront URL."));
    return;
  }

  setLoading();
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
    const body = await response.json();
    if (!response.ok || body.ok === false) {
      throw new Error(body.error || body.next_step || `HTTP ${response.status}`);
    }
    renderReport(body);
  } catch (error) {
    renderError(error);
  }
});

sampleButton?.addEventListener("click", () => {
  urlInput.value = "https://www.allbirds.com/";
});

copyButton?.addEventListener("click", async () => {
  if (!outputEl.value) return;
  await navigator.clipboard.writeText(outputEl.value);
  copyButton.textContent = "copied";
  setTimeout(() => {
    copyButton.textContent = "copy report";
  }, 1200);
});

renderError(new Error("Enter a public merchant URL to begin."), "No URL loaded");
