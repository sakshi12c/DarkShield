import { apiDelete, apiGet, apiPost } from "./lib/api";
import "./index.css";

type ScanType = "url" | "screenshot";
type StoredScanType = ScanType | "text";
type Severity = "Low" | "Medium" | "High";

interface PatternDetail { category: string; severity: Severity; evidence: string; recommendation: string }
interface ScanRecord { id: string; target_url: string | null; scan_type: StoredScanType; severity: Severity; risk_score: number; patterns_found: number; pattern_details: PatternDetail[]; notes: string | null; created_at: string }
interface Stats { total_scans: number; high_risk_sites: number; most_common_pattern: string; total_reports: number; last_scan_at: string | null }

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("DarkShield root not found");
const root = app;

let scanType: ScanType = "url";
let scans: ScanRecord[] = [];
let latestScan: ScanRecord | null = null;
let quizIndex = 0;
let quizScore = 0;
let quizAnswer: number | null = null;
let quizFinished = false;
const checkedDecisionItems = new Set<number>();

const decisionItems = [
  { title: "The final total still makes sense", detail: "Delivery, handling and convenience fees are visible before payment." },
  { title: "Nothing extra was selected for me", detail: "Insurance, memberships and add-ons are opt-in—not quietly pre-checked." },
  { title: "I can leave without being punished", detail: "Declining an offer does not use guilt, shame or confusing wording." },
  { title: "The discount survives a second look", detail: "The original price and sale claim feel credible beyond the countdown." },
  { title: "Returns are easy to find", detail: "Refund windows, exclusions and cancellation steps are clear before purchase." },
];

const quizQuestions = [
  { prompt: "A checkout timer resets every time you refresh. What should you suspect?", options: ["A real warehouse deadline", "Fake urgency", "A secure payment step", "A delivery estimate"], answer: 1 },
  { prompt: "Which is a healthy alternative to a pre-selected add-on?", options: ["A clear opt-in checkbox", "A hidden fee", "A forced signup", "A guilt-filled decline button"], answer: 0 },
  { prompt: "What is drip pricing?", options: ["A loyalty reward", "A discount that grows", "Costs revealed late in checkout", "A product comparison"], answer: 2 },
];

const presets = [
  ["Amazon India", "https://amazon.in", "preset-amazon-btn"],
  ["Flipkart", "https://flipkart.com", "preset-flipkart-btn"],
  ["Myntra", "https://myntra.com", "preset-myntra-btn"],
  ["Meesho", "https://meesho.com", "preset-meesho-btn"],
];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function severityClass(severity: Severity) { return `risk-${severity.toLowerCase()}`; }
function toast(message: string, kind: "success" | "error" = "success") {
  const node = document.createElement("div");
  node.className = `toast toast-${kind}`;
  node.textContent = message;
  node.setAttribute("data-testid", "toast-message");
  document.body.append(node);
  window.setTimeout(() => node.remove(), 3200);
}

function shell() {
  root.innerHTML = `
    <header class="site-header" data-testid="site-header"><div class="shell header-inner">
      <a class="brand" data-testid="nav-brand-logo" href="#top"><span class="brand-mark">DS</span><span><strong>DarkShield</strong><small>SHOP WITH CLEAR EYES</small></span></a>
      <nav class="desktop-nav" data-testid="desktop-navigation"><a data-testid="nav-scanner-link" href="#scanner">Scan a store</a><a data-testid="nav-records-link" href="#records">Saved checks</a><a data-testid="nav-quiz-link" href="#quiz">Spot the trick</a><a data-testid="nav-checklist-link" href="#checklist">Before you buy</a></nav>
      <span class="system-pill" data-testid="nav-status-pill"><i></i> ready when you are</span><a data-testid="nav-scan-cta" class="button button-primary header-cta" href="#scanner">Check a page →</a>
    </div></header>
    <main id="top" class="shell page-main">
      <section class="hero" data-testid="hero-section"><div class="hero-copy"><p class="eyebrow" data-testid="hero-eyebrow"><i></i> TAKE BACK THE CHECKOUT</p><h1 data-testid="hero-title">A second opinion <em>before you buy.</em></h1><p class="hero-description" data-testid="hero-description">Paste a shopping link. DarkShield points out urgency, hidden fees and other pressure tactics—without telling you what to choose.</p><div class="hero-actions"><a class="button button-primary" data-testid="hero-primary-action" href="#scanner">Check a store →</a><a class="text-action" data-testid="hero-checklist-action" href="#checklist">Open buyer checklist</a></div><div class="hero-stats" data-testid="hero-stat-row"><span data-testid="hero-stat-patterns"><b>06</b> pressure signals</span><span data-testid="hero-stat-mode"><b>02</b> ways to check</span><span data-testid="hero-stat-storage"><b>0</b> sign-ups</span></div></div><div class="radar-card browser-card" data-testid="hero-radar-card"><div class="browser-bar"><span class="browser-dots"><i></i><i></i><i></i></span><span data-testid="hero-radar-label">checkout.example</span><span data-testid="hero-radar-live" class="live-label"><i></i> reviewing</span></div><div class="browser-body"><div class="product-placeholder"><span>SALE</span><strong>Everyday headphones</strong><small>₹4,999</small></div><div class="pressure-stack"><span class="pressure-tag pressure-red">Only 2 left</span><span class="pressure-tag pressure-yellow">Timer resets in 09:42</span><span class="pressure-tag pressure-blue">Fee appears at checkout</span></div><div class="browser-verdict"><span>DarkShield noticed</span><strong>3 pressure signals</strong><small>Slow down and check the final total.</small></div></div><div class="radar-metrics"><div data-testid="hero-radar-metric-one"><b id="stat-scans">0</b><small>pages checked</small></div><div data-testid="hero-radar-metric-two"><b id="stat-high">0</b><small>needed caution</small></div><div data-testid="hero-radar-metric-three"><b>6</b><small>signals watched</small></div></div></div></section>
      <section id="scanner" class="section scroll-target" data-testid="scanner-section"><div class="section-heading"><div><p class="eyebrow" data-testid="scanner-eyebrow">01 / CHECK A PAGE</p><h2 data-testid="scanner-title">Drop in a shopping link.</h2></div><p data-testid="scanner-helper">Choose a URL or screenshot. You will get plain-language signals, not a wall of technical details.</p></div><div class="scanner-card" data-testid="scanner-card"><div class="mode-tabs"><button class="mode-tab active" data-testid="tab-url-mode" data-mode="url">⌕ Shopping link</button><button class="mode-tab" data-testid="tab-screenshot-mode" data-mode="screenshot">▣ Checkout screenshot</button></div><form id="scanner-form" data-testid="scanner-form"><label id="scanner-label" data-testid="scanner-input-label" for="scanner-input">SHOPPING PAGE</label><div class="scanner-row"><input id="scanner-input" data-testid="hero-url-input" type="url" placeholder="https://store.com/product" required><button data-testid="hero-scan-submit-btn" class="button button-primary" type="submit">Check this page <span>→</span></button></div><div id="screenshot-options" class="upload-row hidden"><span><b>Add the words visible in your screenshot</b><em>This version reads the text you enter, while the image helps you keep the context.</em></span><label class="file-button" data-testid="screenshot-upload-label">▣ Choose JPG / PNG<input data-testid="screenshot-file-input" type="file" accept="image/png,image/jpeg"></label></div></form><div class="preset-wrap"><p data-testid="preset-label">TRY A FAMILIAR STORE</p><div class="preset-list">${presets.map(([label, url, id]) => `<button data-testid="${id}" class="preset button button-outline" data-url="${url}"><i></i>${label}</button>`).join("")}</div></div></div></section>
      <section id="results" class="section scroll-target" data-testid="results-section"><div class="section-heading"><div><p class="eyebrow" data-testid="results-eyebrow">02 / WHAT WE NOTICED</p><h2 data-testid="results-section-title">The pressure, made visible.</h2></div><span class="linked-status" data-testid="results-query-state"><i></i> YOUR CHECKS ARE SAVED</span></div><div id="results-content"></div></section>
      <section id="records" class="section scroll-target" data-testid="records-section"><div class="section-heading"><div><p class="eyebrow" data-testid="records-eyebrow">03 / SAVED CHECKS</p><h2 data-testid="records-title">Come back to the evidence.</h2></div><p data-testid="records-helper">Compare pages you checked earlier and see which pressure signals appeared most often.</p></div><div class="records-card" data-testid="records-table"><div class="record-controls"><input id="records-search" data-testid="records-search-input" placeholder="⌕  Search stores or signals"><select id="records-filter" data-testid="records-filter-severity"><option value="all">Any caution level</option><option value="High">High caution</option><option value="Medium">Medium caution</option><option value="Low">Low caution</option></select></div><div id="records-list"></div></div></section>
      <section id="quiz" class="section quiz-layout scroll-target" data-testid="quiz-section"><div class="quiz-copy"><p class="eyebrow" data-testid="quiz-section-eyebrow">04 / SPOT THE TRICK</p><h2 data-testid="quiz-section-title">Make the tactics obvious.</h2><p data-testid="quiz-section-copy">Pressure works when it feels normal. Three quick scenarios help you recognise it before your next checkout.</p><ul data-testid="quiz-benefit-list"><li>✓ Feedback after every choice</li><li>✓ Real shopping scenarios</li><li>✓ No jargon or lectures</li></ul></div><div class="quiz-card" data-testid="quiz-card"><div class="quiz-top"><p data-testid="quiz-eyebrow">60-SECOND CHALLENGE</p><span id="quiz-progress" data-testid="quiz-progress">1 / 3</span></div><h3 data-testid="quiz-title">Would this make you pause?</h3><div id="quiz-content"></div></div></section>
      <section id="checklist" class="section checklist-layout scroll-target" data-testid="checklist-section"><div class="checklist-intro"><p class="eyebrow" data-testid="checklist-eyebrow">05 / BEFORE YOU BUY</p><h2 data-testid="checklist-title">Five checks. One calmer decision.</h2><p data-testid="checklist-copy">Use this at the final payment screen. DarkShield does not decide for you—it gives you a moment to make sure the page has earned your trust.</p><div class="checklist-score" data-testid="checklist-score-card"><span id="checklist-count">0 / 5</span><div><strong id="checklist-status">Take a breath</strong><small id="checklist-status-copy">Nothing is checked yet.</small></div></div></div><div class="checklist-card" data-testid="buyer-checklist"><div id="checklist-items"></div><div class="checklist-footer"><button id="checklist-reset" data-testid="checklist-reset-button" class="text-action">Reset checklist</button><span data-testid="checklist-private-note">This checklist stays in your browser.</span></div></div></section>
    </main><footer class="site-footer" data-testid="site-footer"><div class="shell footer-inner"><div><strong data-testid="footer-credits">DS / DarkShield</strong><small data-testid="footer-description">A clearer pause before the purchase.</small></div><span data-testid="footer-status-pill" class="live-label"><i></i> READY TO CHECK</span><span data-testid="footer-purpose">Built for thoughtful shopping</span></div></footer>`;
}

function renderResults(scan: ScanRecord | null) {
  const target = document.querySelector<HTMLDivElement>("#results-content");
  if (!target) return;
  if (!scan) { target.innerHTML = `<div class="empty-card" data-testid="results-empty-state"><span class="empty-number">01</span><strong data-testid="results-empty-title">Your first check starts above.</strong><p data-testid="results-empty-copy">Add a shopping page and DarkShield will separate ordinary selling from copy that deserves a second look.</p></div>`; return; }
  const meterColor = scan.severity === "High" ? "#fb7185" : scan.severity === "Medium" ? "#fbbf24" : "#34d399";
  target.innerHTML = `<div class="results-card" data-testid="results-dashboard"><div class="results-head"><div><span class="result-kicker" data-testid="results-live-badge">MOST RECENT CHECK</span><span class="result-meta" data-testid="results-scan-type">${escapeHtml(scan.scan_type)} / ${formatDate(scan.created_at)}</span><h3 data-testid="results-heading">${scan.patterns_found ? "This page is applying pressure." : "Nothing obvious jumped out."}</h3><p data-testid="results-target">${escapeHtml(scan.target_url || "Screenshot text")}</p></div><button data-testid="results-export-pdf-btn" id="print-report" class="button button-outline">Save a copy</button></div><div class="results-grid"><div class="meter-wrap" data-testid="results-risk-meter"><div class="meter" style="--meter:${scan.risk_score}%;--meter-color:${meterColor}"><div><b data-testid="results-risk-score">${scan.risk_score}</b><small>CAUTION SCORE</small></div></div><span class="risk-badge ${severityClass(scan.severity)}" data-testid="results-severity-badge">${scan.severity} caution</span><small data-testid="results-patterns-count">${scan.patterns_found} signal${scan.patterns_found === 1 ? "" : "s"} noticed</small></div><div class="pattern-column"><div class="pattern-heading"><span><b data-testid="results-patterns-label">WHAT TO LOOK AT</b><small data-testid="results-patterns-helper">The exact words that may be nudging your decision.</small></span><span class="live-label" data-testid="results-engine-status"><i></i> CHECK COMPLETE</span></div>${scan.pattern_details.length ? scan.pattern_details.map((pattern) => `<article class="pattern-item" data-testid="results-pattern-item"><div><strong data-testid="results-pattern-category">${escapeHtml(pattern.category)}</strong><span class="risk-badge ${severityClass(pattern.severity)}">${pattern.severity}</span></div><p data-testid="results-pattern-evidence">“${escapeHtml(pattern.evidence)}”</p><small data-testid="results-pattern-recommendation">${escapeHtml(pattern.recommendation)}</small></article>`).join("") : `<div class="no-patterns" data-testid="results-no-patterns">No familiar pressure phrases appeared in this check. Still compare the final price, returns and selected extras before paying.</div>`}</div></div></div>`;
  document.querySelector<HTMLButtonElement>("#print-report")?.addEventListener("click", () => { window.print(); toast("Print-ready audit report opened"); });
}

function renderRecords() {
  const list = document.querySelector<HTMLDivElement>("#records-list");
  const search = document.querySelector<HTMLInputElement>("#records-search")?.value.toLowerCase() ?? "";
  const filter = document.querySelector<HTMLSelectElement>("#records-filter")?.value ?? "all";
  if (!list) return;
  const filtered = scans.filter((scan) => `${scan.target_url ?? ""} ${scan.pattern_details.map((pattern) => pattern.category).join(" ")}`.toLowerCase().includes(search) && (filter === "all" || scan.severity === filter));
  if (!filtered.length) { list.innerHTML = `<div class="empty-card compact" data-testid="records-empty-state"><strong data-testid="records-empty-title">No saved checks yet</strong><p data-testid="records-empty-copy">A page appears here after you check it.</p></div>`; return; }
  list.innerHTML = filtered.map((scan) => `<article class="record-row" data-testid="records-row"><div class="record-main"><strong data-testid="records-row-url">${escapeHtml(scan.target_url || "Screenshot check")}</strong><span class="risk-badge ${severityClass(scan.severity)}">${scan.severity} caution</span><small data-testid="records-row-meta">${formatDate(scan.created_at)} · ${scan.patterns_found} signals · ${scan.risk_score} score</small></div><div class="record-actions"><button data-testid="records-inspect-btn" class="button button-outline inspect" data-id="${scan.id}">See signals</button><button data-testid="records-delete-btn" class="icon-button delete" data-id="${scan.id}" aria-label="Delete saved check">×</button></div><div class="inspection hidden" id="inspect-${scan.id}" data-testid="records-inspection-panel">${scan.pattern_details.length ? scan.pattern_details.map((pattern) => `<span data-testid="records-inspection-item"><b>${escapeHtml(pattern.category)}</b><small>${escapeHtml(pattern.evidence)}</small></span>`).join("") : `<small data-testid="records-inspection-empty">No familiar pressure signals were found.</small>`}</div></article>`).join("");
  list.querySelectorAll<HTMLButtonElement>(".inspect").forEach((button) => button.addEventListener("click", () => document.querySelector(`#inspect-${button.dataset.id}`)?.classList.toggle("hidden")));
  list.querySelectorAll<HTMLButtonElement>(".delete").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.id; if (!id) return; void apiDelete<void>(`/scans/${id}`).then(() => { scans = scans.filter((scan) => scan.id !== id); if (latestScan?.id === id) { latestScan = scans[0] ?? null; renderResults(latestScan); } renderRecords(); updateStats(); toast("Audit record deleted"); }).catch(() => toast("That record could not be deleted", "error")); }));
}

function updateStats() { const scansNode = document.querySelector("#stat-scans"); const highNode = document.querySelector("#stat-high"); if (scansNode) scansNode.textContent = String(scans.length); if (highNode) highNode.textContent = String(scans.filter((scan) => scan.severity === "High").length); }
async function loadData() { try { scans = await apiGet<ScanRecord[]>("/scans"); latestScan = scans[0] ?? null; renderResults(latestScan); renderRecords(); updateStats(); } catch { renderResults(null); renderRecords(); } try { const stats = await apiGet<Stats>("/stats"); document.querySelector("#stat-scans")!.textContent = String(stats.total_scans); document.querySelector("#stat-high")!.textContent = String(stats.high_risk_sites); } catch { /* static shell remains useful when the API is paused */ } }

function renderQuiz() {
  const target = document.querySelector<HTMLDivElement>("#quiz-content"); const progress = document.querySelector("#quiz-progress"); if (!target || !progress) return;
  if (quizFinished) { progress.textContent = "COMPLETE"; target.innerHTML = `<div class="quiz-result" data-testid="quiz-score-badge"><b data-testid="quiz-score-title">${quizScore}/${quizQuestions.length} correct</b><p data-testid="quiz-score-copy">${quizScore === quizQuestions.length ? "Sharp eyes. You’re ready to audit your next checkout." : "You’re building the right instincts. A second look is always worth it."}</p><button id="quiz-restart" data-testid="quiz-restart-btn" class="button button-outline">Try again</button></div>`; document.querySelector("#quiz-restart")?.addEventListener("click", () => { quizIndex = 0; quizScore = 0; quizAnswer = null; quizFinished = false; renderQuiz(); }); return; }
  const question = quizQuestions[quizIndex]; progress.textContent = `${quizIndex + 1} / ${quizQuestions.length}`; target.innerHTML = `<p class="quiz-question" data-testid="quiz-question">${question.prompt}</p><div class="quiz-options">${question.options.map((option, index) => `<button data-testid="quiz-option-btn" class="quiz-option ${quizAnswer === index ? "selected" : ""} ${quizAnswer !== null && index === question.answer ? "correct" : ""}" data-answer="${index}">${String.fromCharCode(65 + index)} <span>${option}</span></button>`).join("")}</div><div class="quiz-footer"><small data-testid="quiz-hint">Choose an answer to continue</small><button id="quiz-next" data-testid="quiz-next-btn" class="button button-primary" ${quizAnswer === null ? "disabled" : ""}>${quizIndex === quizQuestions.length - 1 ? "See score" : "Next question"} →</button></div>`;
  target.querySelectorAll<HTMLButtonElement>(".quiz-option").forEach((button) => button.addEventListener("click", () => { if (quizAnswer === null) { quizAnswer = Number(button.dataset.answer); renderQuiz(); } }));
  target.querySelector("#quiz-next")?.addEventListener("click", () => { if (quizAnswer === null) return; quizScore += quizAnswer === question.answer ? 1 : 0; if (quizIndex === quizQuestions.length - 1) quizFinished = true; else { quizIndex += 1; quizAnswer = null; } renderQuiz(); });
}

function renderChecklist() {
  const target = document.querySelector<HTMLDivElement>("#checklist-items");
  const count = document.querySelector("#checklist-count");
  const status = document.querySelector("#checklist-status");
  const copy = document.querySelector("#checklist-status-copy");
  if (!target || !count || !status || !copy) return;
  target.innerHTML = decisionItems.map((item, index) => `<button class="checklist-item ${checkedDecisionItems.has(index) ? "checked" : ""}" data-testid="checklist-item" data-index="${index}" aria-pressed="${checkedDecisionItems.has(index)}"><span class="checkmark">${checkedDecisionItems.has(index) ? "✓" : ""}</span><span><strong>${item.title}</strong><small>${item.detail}</small></span></button>`).join("");
  count.textContent = `${checkedDecisionItems.size} / ${decisionItems.length}`;
  if (checkedDecisionItems.size === decisionItems.length) { status.textContent = "The page has earned a closer look"; copy.textContent = "You checked the details. The final choice is yours."; }
  else if (checkedDecisionItems.size >= 3) { status.textContent = "Almost there"; copy.textContent = "A couple of details still deserve your attention."; }
  else { status.textContent = "Take a breath"; copy.textContent = checkedDecisionItems.size ? "Keep checking before you pay." : "Nothing is checked yet."; }
  target.querySelectorAll<HTMLButtonElement>(".checklist-item").forEach((button) => button.addEventListener("click", () => { const index = Number(button.dataset.index); if (checkedDecisionItems.has(index)) checkedDecisionItems.delete(index); else checkedDecisionItems.add(index); renderChecklist(); }));
}

function wireEvents() {
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => button.addEventListener("click", () => { scanType = button.dataset.mode as ScanType; document.querySelectorAll("[data-mode]").forEach((tab) => tab.classList.toggle("active", tab === button)); const input = document.querySelector<HTMLInputElement>("#scanner-input"); const label = document.querySelector("#scanner-label"); const upload = document.querySelector("#screenshot-options"); if (scanType === "url") { input?.setAttribute("type", "url"); input?.setAttribute("placeholder", "https://store.com/product"); input?.setAttribute("required", "true"); if (label) label.textContent = "SHOPPING PAGE"; upload?.classList.add("hidden"); } else { input?.setAttribute("type", "text"); input?.setAttribute("required", "true"); input?.setAttribute("placeholder", "Type the words visible in the screenshot…"); if (label) label.textContent = "WORDS IN THE SCREENSHOT"; upload?.classList.remove("hidden"); } }));
  document.querySelectorAll<HTMLButtonElement>("[data-url]").forEach((button) => button.addEventListener("click", () => { scanType = "url"; const input = document.querySelector<HTMLInputElement>("#scanner-input"); if (input) input.value = button.dataset.url ?? ""; document.querySelector("#scanner")?.scrollIntoView({ behavior: "smooth" }); }));
  document.querySelector<HTMLFormElement>("#scanner-form")?.addEventListener("submit", (event) => { event.preventDefault(); const input = document.querySelector<HTMLInputElement>("#scanner-input"); const value = input?.value.trim() ?? ""; if (!value) { toast(scanType === "url" ? "Add a shopping link first" : "Add the words visible in the screenshot", "error"); return; } const submit = document.querySelector<HTMLButtonElement>("[data-testid=hero-scan-submit-btn]"); if (submit) { submit.disabled = true; submit.textContent = "Checking…"; } void apiPost<ScanRecord>("/scans", { scan_type: scanType, target_url: scanType === "url" ? value : undefined, raw_text: scanType === "url" ? undefined : value }).then((scan) => { latestScan = scan; scans = [scan, ...scans]; renderResults(scan); renderRecords(); updateStats(); toast("Page checked — here is what stood out"); document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }); }).catch(() => toast("This page could not be checked. Try the link again.", "error")).finally(() => { if (submit) { submit.disabled = false; submit.innerHTML = "Check this page <span>→</span>"; } }); });
  document.querySelector<HTMLInputElement>("#records-search")?.addEventListener("input", renderRecords); document.querySelector<HTMLSelectElement>("#records-filter")?.addEventListener("change", renderRecords);
  document.querySelector<HTMLInputElement>("[data-testid=screenshot-file-input]")?.addEventListener("change", (event) => { const input = event.target as HTMLInputElement; const label = document.querySelector("[data-testid=screenshot-upload-label]"); if (label && input.files?.[0]) label.childNodes[0].textContent = `▣ ${input.files[0].name}`; });
  document.querySelector("#checklist-reset")?.addEventListener("click", () => { checkedDecisionItems.clear(); renderChecklist(); });
}

shell(); wireEvents(); renderQuiz(); renderChecklist(); void loadData();