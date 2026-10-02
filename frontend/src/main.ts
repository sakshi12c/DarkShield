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
let quizAnswers: Array<number | null> = [];
const checkedDecisionItems = new Set<number>();

const decisionItems = [
  { title: "The final total still makes sense", detail: "Delivery, handling and convenience fees are visible before payment." },
  { title: "Nothing extra was selected for me", detail: "Insurance, memberships and add-ons are opt-in—not quietly pre-checked." },
  { title: "I can leave without being punished", detail: "Declining an offer does not use guilt, shame or confusing wording." },
  { title: "The discount survives a second look", detail: "The original price and sale claim feel credible beyond the countdown." },
  { title: "Returns are easy to find", detail: "Refund windows, exclusions and cancellation steps are clear before purchase." },
];

const quizQuestions = [
  { prompt: "A checkout timer resets every time you refresh. What should you suspect?", options: ["A real warehouse deadline", "Fake urgency", "A secure payment step", "A delivery estimate"], answer: 1, explanation: "A genuine deadline should not restart when the page reloads. A resetting timer is designed to rush the decision." },
  { prompt: "Which is a healthy alternative to a pre-selected add-on?", options: ["A clear opt-in checkbox", "A hidden fee", "A forced signup", "A guilt-filled decline button"], answer: 0, explanation: "A clear, unchecked opt-in lets the shopper choose freely instead of quietly adding something to the order." },
  { prompt: "What is drip pricing?", options: ["A loyalty reward", "A discount that grows", "Costs revealed late in checkout", "A product comparison"], answer: 2, explanation: "Drip pricing reveals mandatory costs step by step, making the first advertised price look lower than the final total." },
  { prompt: "A decline button says ‘No thanks, I prefer paying full price.’ What tactic is this?", options: ["Confirm shaming", "Price matching", "Product bundling", "Social proof"], answer: 0, explanation: "Confirm shaming uses guilt or embarrassment to make a neutral refusal feel like a bad personal choice." },
  { prompt: "A site requires account creation before showing delivery charges. What should make you pause?", options: ["The product photos", "The search bar", "Forced action hiding key information", "The order number"], answer: 2, explanation: "Important purchase information should be visible before you surrender data or create an account." },
];

const presets = [
  ["Amazon India", "https://amazon.in", "preset-amazon-btn"],
  ["Flipkart", "https://flipkart.com", "preset-flipkart-btn"],
  ["Myntra", "https://myntra.com", "preset-myntra-btn"],
  ["Meesho", "https://meesho.com", "preset-meesho-btn"],
];

const heroSignals = [
  { title: "Artificial scarcity", copy: "A stock warning can create urgency before you have compared the product.", label: "Only 2 left" },
  { title: "Resetting urgency", copy: "A countdown that restarts is pressure theatre, not a real deadline.", label: "Timer resets in 09:42" },
  { title: "Late price reveal", copy: "A fee shown only at checkout makes the first price feel cheaper than it really is.", label: "Fee appears at checkout" },
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

function setHeroSignal(index: number) {
  const signal = heroSignals[index];
  if (!signal) return;
  document.querySelectorAll<HTMLButtonElement>("[data-signal]").forEach((button) => button.classList.toggle("active", Number(button.dataset.signal) === index));
  const kicker = document.querySelector("#demo-signal-kicker");
  const title = document.querySelector("#demo-signal-title");
  const copy = document.querySelector("#demo-signal-copy");
  if (kicker) kicker.textContent = `Signal 0${index + 1} / 03`;
  if (title) title.textContent = signal.title;
  if (copy) copy.textContent = signal.copy;
  document.querySelector("[data-testid=hero-signal-explanation]")?.classList.remove("signal-flash");
  window.requestAnimationFrame(() => document.querySelector("[data-testid=hero-signal-explanation]")?.classList.add("signal-flash"));
}

function wirePatternFocus() {
  const patterns = document.querySelectorAll<HTMLElement>(".pattern-item");
  const focusPattern = (pattern: HTMLElement) => {
    const willFocus = !pattern.classList.contains("focused");
    patterns.forEach((item) => item.classList.remove("focused"));
    if (willFocus) pattern.classList.add("focused");
  };
  patterns.forEach((pattern) => {
    pattern.addEventListener("click", () => focusPattern(pattern));
    pattern.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusPattern(pattern); } });
  });
}

function wireExperience() {
  document.querySelectorAll<HTMLButtonElement>("[data-signal]").forEach((button) => button.addEventListener("click", () => setHeroSignal(Number(button.dataset.signal))));
  document.querySelectorAll<HTMLButtonElement>(".case-node").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.target}`)?.scrollIntoView({ behavior: "smooth" })));

  const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("is-visible");
  }), { threshold: 0.12 });
  document.querySelectorAll(".reveal-block").forEach((element) => revealObserver.observe(element));

  const stageObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const stage = (entry.target as HTMLElement).dataset.stage;
    document.querySelectorAll<HTMLButtonElement>(".case-node").forEach((node) => node.classList.toggle("active", node.dataset.target === stage));
    document.querySelectorAll<HTMLAnchorElement>(".desktop-nav a").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${stage}`));
  }), { rootMargin: "-35% 0px -55%", threshold: 0 });
  document.querySelectorAll<HTMLElement>("[data-stage]").forEach((section) => stageObserver.observe(section));

  const progress = document.querySelector<HTMLElement>("#scroll-progress");
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const percentage = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
    if (progress) progress.style.width = `${percentage}%`;
  };
  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();

  const orb = document.querySelector<HTMLElement>("#cursor-orb");
  window.addEventListener("pointermove", (event) => {
    if (!orb) return;
    orb.style.setProperty("--cursor-x", `${event.clientX}px`);
    orb.style.setProperty("--cursor-y", `${event.clientY}px`);
  }, { passive: true });

  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.innerWidth < 900) return;
      const bounds = card.getBoundingClientRect();
      const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 5;
      const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -5;
      card.style.setProperty("--tilt-x", `${rotateX}deg`);
      card.style.setProperty("--tilt-y", `${rotateY}deg`);
      card.classList.add("tilting");
    });
    card.addEventListener("pointerleave", () => card.classList.remove("tilting"));
  });
}

function shell() {
  root.innerHTML = `
    <div class="cursor-orb" id="cursor-orb" aria-hidden="true"></div>
    <aside class="case-rail" data-testid="investigation-rail" aria-label="Investigation stages">
      <span>YOUR CHECK</span>
      <button class="case-node active" data-target="scanner" data-testid="stage-scanner-button"><b>01</b><small>Page</small></button>
      <button class="case-node" data-target="results" data-testid="stage-results-button"><b>02</b><small>Signals</small></button>
      <button class="case-node" data-target="records" data-testid="stage-records-button"><b>03</b><small>Saved</small></button>
      <button class="case-node" data-target="quiz" data-testid="stage-quiz-button"><b>04</b><small>Practice</small></button>
      <button class="case-node" data-target="checklist" data-testid="stage-checklist-button"><b>05</b><small>Decide</small></button>
    </aside>
    <header class="site-header" data-testid="site-header"><div class="scroll-progress" aria-hidden="true"><span id="scroll-progress"></span></div><div class="shell header-inner">
      <a class="brand" data-testid="nav-brand-logo" href="#top"><img src="/logo.svg" alt="DarkShield logo" class="brand-mark" /><span><strong>DarkShield</strong><small>SHOP WITH CLEAR EYES</small></span></a>
      <nav class="desktop-nav" data-testid="desktop-navigation"><a data-testid="nav-scanner-link" href="#scanner">Scan a store</a><a data-testid="nav-records-link" href="#records">Saved checks</a><a data-testid="nav-quiz-link" href="#quiz">Spot the trick</a><a data-testid="nav-checklist-link" href="#checklist">Before you buy</a></nav>
      <span class="system-pill" data-testid="nav-status-pill"><i></i> ready when you are</span><a data-testid="nav-scan-cta" class="button button-primary header-cta" href="#scanner">Check a page →</a>
    </div></header>
    <main id="top" class="shell page-main">
      <section class="hero reveal-block is-visible" data-testid="hero-section"><div class="hero-copy"><p class="eyebrow" data-testid="hero-eyebrow"><i></i> TAKE BACK THE CHECKOUT</p><h1 data-testid="hero-title">A second opinion <em>before you buy.</em></h1><p class="hero-description" data-testid="hero-description">Paste a shopping link. DarkShield points out urgency, hidden fees and other pressure tactics—without telling you what to choose.</p><div class="hero-actions"><a class="button button-primary magnetic" data-testid="hero-primary-action" href="#scanner">Start an investigation →</a><a class="text-action" data-testid="hero-checklist-action" href="#checklist">Open buyer checklist</a></div><div class="hero-stats" data-testid="hero-stat-row"><span data-testid="hero-stat-patterns"><b>06</b> pressure signals</span><span data-testid="hero-stat-mode"><b>02</b> ways to check</span><span data-testid="hero-stat-storage"><b>0</b> sign-ups</span></div></div><div class="radar-card browser-card tilt-card" data-tilt data-testid="hero-radar-card"><div class="browser-bar"><span class="browser-dots"><i></i><i></i><i></i></span><span data-testid="hero-radar-label">checkout.example</span><span data-testid="hero-radar-live" class="live-label"><i></i> tap a signal</span></div><div class="browser-body"><div class="product-placeholder"><span>SALE</span><strong>Everyday headphones</strong><small>₹4,999</small></div><div class="pressure-stack" data-testid="hero-signal-buttons">${heroSignals.map((signal, index) => `<button class="pressure-tag ${["pressure-red", "pressure-yellow", "pressure-blue"][index]} ${index === 0 ? "active" : ""}" data-signal="${index}" data-testid="hero-signal-${index}-button">${signal.label}</button>`).join("")}</div><div class="browser-verdict" data-testid="hero-signal-explanation"><span id="demo-signal-kicker">Signal 01 / 03</span><strong id="demo-signal-title">${heroSignals[0].title}</strong><small id="demo-signal-copy">${heroSignals[0].copy}</small></div></div><div class="radar-metrics"><div data-testid="hero-radar-metric-one"><b id="stat-scans">0</b><small>pages checked</small></div><div data-testid="hero-radar-metric-two"><b id="stat-high">0</b><small>needed caution</small></div><div data-testid="hero-radar-metric-three"><b>6</b><small>signals watched</small></div></div></div></section>
      <section id="scanner" data-stage="scanner" class="section scroll-target reveal-block" data-testid="scanner-section"><div class="section-heading"><div><p class="eyebrow" data-testid="scanner-eyebrow">01 / CHECK A PAGE</p><h2 data-testid="scanner-title">Drop in a shopping link.</h2></div><p data-testid="scanner-helper">Choose a URL or screenshot. You will get plain-language signals, not a wall of technical details.</p></div><div class="scanner-card tilt-card" data-tilt data-testid="scanner-card"><div class="scan-beam" aria-hidden="true"></div><div class="mode-tabs"><button class="mode-tab active" data-testid="tab-url-mode" data-mode="url">⌕ Shopping link</button><button class="mode-tab" data-testid="tab-screenshot-mode" data-mode="screenshot">▣ Checkout screenshot</button></div><form id="scanner-form" data-testid="scanner-form"><label id="scanner-label" data-testid="scanner-input-label" for="scanner-input">SHOPPING PAGE</label><div class="scanner-row"><input id="scanner-input" data-testid="hero-url-input" type="url" placeholder="https://store.com/product" required><button data-testid="hero-scan-submit-btn" class="button button-primary magnetic" type="submit">Check this page <span>→</span></button></div><div id="screenshot-options" class="upload-row hidden"><span><b>Add the words visible in your screenshot</b><em>This version reads the text you enter, while the image helps you keep the context.</em></span><label class="file-button" data-testid="screenshot-upload-label">▣ Choose JPG / PNG<input data-testid="screenshot-file-input" type="file" accept="image/png,image/jpeg"></label></div></form><div class="preset-wrap"><p data-testid="preset-label">OR LOAD A SAMPLE CASE</p><div class="preset-list">${presets.map(([label, url, id]) => `<button data-testid="${id}" class="preset button button-outline" data-url="${url}"><i></i>${label}</button>`).join("")}</div></div></div></section>
      <section id="results" data-stage="results" class="section scroll-target reveal-block" data-testid="results-section"><div class="section-heading"><div><p class="eyebrow" data-testid="results-eyebrow">02 / WHAT WE NOTICED</p><h2 data-testid="results-section-title">The pressure, made visible.</h2></div><span class="linked-status" data-testid="results-query-state"><i></i> YOUR CHECKS ARE SAVED</span></div><div id="results-content"></div></section>
      <section id="records" data-stage="records" class="section scroll-target reveal-block" data-testid="records-section"><div class="section-heading"><div><p class="eyebrow" data-testid="records-eyebrow">03 / SAVED CHECKS</p><h2 data-testid="records-title">Come back to the evidence.</h2></div><p data-testid="records-helper">Your five newest checks stay here. Older records remain safely stored in the database.</p></div><div class="records-card" data-testid="records-table"><div class="record-controls"><input id="records-search" data-testid="records-search-input" placeholder="⌕  Search the latest five"><select id="records-filter" data-testid="records-filter-severity"><option value="all">Any caution level</option><option value="High">High caution</option><option value="Medium">Medium caution</option><option value="Low">Low caution</option></select></div><div id="records-list"></div></div></section>
      <section id="quiz" data-stage="quiz" class="section quiz-layout scroll-target reveal-block" data-testid="quiz-section"><div class="quiz-copy"><p class="eyebrow" data-testid="quiz-section-eyebrow">04 / SPOT THE TRICK</p><h2 data-testid="quiz-section-title">Make the tactics obvious.</h2><p data-testid="quiz-section-copy">Pressure works when it feels normal. Five quick scenarios help you recognise it before your next checkout.</p><ul data-testid="quiz-benefit-list"><li>✓ Five real shopping scenarios</li><li>✓ Complete answer review at the end</li><li>✓ Clear corrections and explanations</li></ul></div><div class="quiz-card tilt-card" data-tilt data-testid="quiz-card"><div class="quiz-top"><p data-testid="quiz-eyebrow">5-QUESTION CHALLENGE</p><span id="quiz-progress" data-testid="quiz-progress">1 / 5</span></div><h3 data-testid="quiz-title">Would this make you pause?</h3><div id="quiz-content"></div></div></section>
      <section id="checklist" data-stage="checklist" class="section checklist-layout scroll-target reveal-block" data-testid="checklist-section"><div class="checklist-intro"><p class="eyebrow" data-testid="checklist-eyebrow">05 / BEFORE YOU BUY</p><h2 data-testid="checklist-title">Five checks. One calmer decision.</h2><p data-testid="checklist-copy">Use this at the final payment screen. DarkShield does not decide for you—it gives you a moment to make sure the page has earned your trust.</p><div class="checklist-score" data-testid="checklist-score-card"><span id="checklist-count">0 / 5</span><div><strong id="checklist-status">Take a breath</strong><small id="checklist-status-copy">Nothing is checked yet.</small></div></div></div><div class="checklist-card" data-testid="buyer-checklist"><div id="checklist-items"></div><div class="checklist-footer"><button id="checklist-reset" data-testid="checklist-reset-button" class="text-action">Reset checklist</button><span data-testid="checklist-private-note">This checklist stays in your browser.</span></div></div></section>
    </main><footer class="site-footer" data-testid="site-footer"><div class="shell footer-inner"><div><strong data-testid="footer-credits">DS / DarkShield</strong><small data-testid="footer-description">A clearer pause before the purchase.</small></div><span data-testid="footer-status-pill" class="live-label"><i></i> READY TO CHECK</span><span data-testid="footer-purpose">Built for thoughtful shopping</span></div></footer>`;
}

function renderResults(scan: ScanRecord | null) {
  const target = document.querySelector<HTMLDivElement>("#results-content");
  if (!target) return;
  if (!scan) { target.innerHTML = `<div class="empty-card" data-testid="results-empty-state"><span class="empty-number">01</span><strong data-testid="results-empty-title">Your first check starts above.</strong><p data-testid="results-empty-copy">Add a shopping page and DarkShield will separate ordinary selling from copy that deserves a second look.</p></div>`; return; }
  const meterColor = scan.severity === "High" ? "#fb7185" : scan.severity === "Medium" ? "#fbbf24" : "#34d399";
  target.innerHTML = `<div class="results-card evidence-case" data-testid="results-dashboard"><div class="case-stamp">CASE / ${scan.id.slice(0, 6).toUpperCase()}</div><div class="results-head"><div><span class="result-kicker" data-testid="results-live-badge">MOST RECENT CHECK</span><span class="result-meta" data-testid="results-scan-type">${escapeHtml(scan.scan_type)} / ${formatDate(scan.created_at)}</span><h3 data-testid="results-heading">${scan.patterns_found ? "This page is applying pressure." : "Nothing obvious jumped out."}</h3><p data-testid="results-target">${escapeHtml(scan.target_url || "Screenshot text")}</p></div><button data-testid="results-export-pdf-btn" id="print-report" class="button button-outline magnetic">Save a copy</button></div><div class="results-grid"><div class="meter-wrap" data-testid="results-risk-meter"><div class="meter" style="--meter:${scan.risk_score}%;--meter-color:${meterColor}"><div><b data-testid="results-risk-score">${scan.risk_score}</b><small>CAUTION SCORE</small></div></div><span class="risk-badge ${severityClass(scan.severity)}" data-testid="results-severity-badge">${scan.severity} caution</span><small data-testid="results-patterns-count">${scan.patterns_found} signal${scan.patterns_found === 1 ? "" : "s"} noticed</small></div><div class="pattern-column"><div class="pattern-heading"><span><b data-testid="results-patterns-label">OPEN THE EVIDENCE</b><small data-testid="results-patterns-helper">Select a signal to pull it forward.</small></span><span class="live-label" data-testid="results-engine-status"><i></i> CHECK COMPLETE</span></div>${scan.pattern_details.length ? scan.pattern_details.map((pattern, index) => `<article class="pattern-item ${index === 0 ? "focused" : ""}" tabindex="0" role="button" data-testid="results-pattern-item"><div><strong data-testid="results-pattern-category"><span class="pattern-index">0${index + 1}</span>${escapeHtml(pattern.category)}</strong><span class="risk-badge ${severityClass(pattern.severity)}">${pattern.severity}</span></div><p data-testid="results-pattern-evidence">“${escapeHtml(pattern.evidence)}”</p><small data-testid="results-pattern-recommendation">${escapeHtml(pattern.recommendation)}</small></article>`).join("") : `<div class="no-patterns" data-testid="results-no-patterns">No familiar pressure phrases appeared in this check. Still compare the final price, returns and selected extras before paying.</div>`}</div></div></div>`;
   document.querySelector<HTMLButtonElement>("#print-report")?.addEventListener("click", () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentW = pageW - margin * 2;

    const sevColor = (sev: string) =>
      sev === "High" ? [219, 68, 83] : sev === "Medium" ? [217, 142, 16] : [38, 140, 106];
    const sevTint = (sev: string) =>
      sev === "High" ? [253, 237, 238] : sev === "Medium" ? [253, 244, 227] : [232, 247, 240];

    // Header band
    doc.setFillColor(23, 32, 36);
    doc.rect(0, 0, pageW, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("DarkShield Report", margin, 19);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`Generated ${formatDate(new Date().toISOString())}`, pageW - margin, 19, { align: "right" });

    let y = 42;
    doc.setTextColor(23, 32, 36);
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("Target:", margin, y);
    doc.setFont(undefined, "normal");
    doc.text(scan.target_url || "Screenshot check", margin + 20, y);
    y += 7;
    doc.setFont(undefined, "bold");
    doc.text("Type / Date:", margin, y);
    doc.setFont(undefined, "normal");
    doc.text(`${scan.scan_type} · ${formatDate(scan.created_at)}`, margin + 28, y);
    y += 12;

    // Severity + score summary card
    const [sr, sg, sb] = sevColor(scan.severity);
    const [tr, tg, tb] = sevTint(scan.severity);
    doc.setFillColor(tr, tg, tb);
    doc.roundedRect(margin, y, contentW, 26, 3, 3, "F");
    doc.setDrawColor(sr, sg, sb);
    doc.roundedRect(margin, y, contentW, 26, 3, 3, "S");
    doc.setTextColor(sr, sg, sb);
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(`${scan.severity.toUpperCase()} CAUTION`, margin + 8, y + 11);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`Risk score ${scan.risk_score}/100   ·   ${scan.patterns_found} pattern${scan.patterns_found === 1 ? "" : "s"} found`, margin + 8, y + 19);

    // Score bar
    const barX = pageW - margin - 60;
    doc.setFillColor(225, 228, 224);
    doc.roundedRect(barX, y + 15, 52, 4, 2, 2, "F");
    doc.setFillColor(sr, sg, sb);
    doc.roundedRect(barX, y + 15, Math.max(4, (52 * scan.risk_score) / 100), 4, 2, 2, "F");

    y += 38;
    doc.setTextColor(23, 32, 36);
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("Detected Patterns", margin, y);
    y += 8;

    if (scan.pattern_details.length) {
      scan.pattern_details.forEach((p, i) => {
        const [pr, pg, pb] = sevColor(p.severity);
        const [ptr, ptg, ptb] = sevTint(p.severity);
        doc.setFontSize(9);
        const evidence = doc.splitTextToSize(`Evidence: "${p.evidence}"`, contentW - 14);
        const rec = doc.splitTextToSize(`Tip: ${p.recommendation}`, contentW - 14);
        const cardH = 16 + evidence.length * 5 + rec.length * 5;

        if (y + cardH > 275) { doc.addPage(); y = 20; }

        doc.setFillColor(ptr, ptg, ptb);
        doc.roundedRect(margin, y, contentW, cardH, 2, 2, "F");
        doc.setFillColor(pr, pg, pb);
        doc.rect(margin, y, 3, cardH, "F");

        doc.setTextColor(23, 32, 36);
        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.text(`${i + 1}. ${p.category}`, margin + 8, y + 8);
        doc.setTextColor(pr, pg, pb);
        doc.setFontSize(8);
        doc.text(p.severity.toUpperCase(), pageW - margin - 6, y + 8, { align: "right" });

        doc.setTextColor(80, 90, 95);
        doc.setFont(undefined, "normal");
        doc.setFontSize(9);
        doc.text(evidence, margin + 8, y + 15);
        doc.text(rec, margin + 8, y + 15 + evidence.length * 5);

        y += cardH + 6;
      });
    } else {
      doc.setFillColor(232, 247, 240);
      doc.roundedRect(margin, y, contentW, 16, 2, 2, "F");
      doc.setTextColor(38, 140, 106);
      doc.setFontSize(9);
      doc.text("No familiar pressure phrases appeared in this check.", margin + 8, y + 10);
    }

    doc.save(`darkshield-report-${Date.now()}.pdf`);
    toast("PDF downloaded");
  });
  wirePatternFocus();
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
  list.querySelectorAll<HTMLButtonElement>(".delete").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.id; if (!id) return; void apiDelete<void>(`/scans/${id}`).then(async () => { scans = await apiGet<ScanRecord[]>("/scans"); if (latestScan?.id === id) { latestScan = scans[0] ?? null; renderResults(latestScan); } renderRecords(); updateStats(); toast("Saved check deleted"); }).catch(() => toast("That record could not be deleted", "error")); }));
}

function updateStats() { const scansNode = document.querySelector("#stat-scans"); const highNode = document.querySelector("#stat-high"); if (scansNode) scansNode.textContent = String(scans.length); if (highNode) highNode.textContent = String(scans.filter((scan) => scan.severity === "High").length); }
async function loadData() { try { scans = await apiGet<ScanRecord[]>("/scans"); latestScan = scans[0] ?? null; renderResults(latestScan); renderRecords(); updateStats(); } catch { renderResults(null); renderRecords(); } try { const stats = await apiGet<Stats>("/stats"); document.querySelector("#stat-scans")!.textContent = String(stats.total_scans); document.querySelector("#stat-high")!.textContent = String(stats.high_risk_sites); } catch { /* static shell remains useful when the API is paused */ } }

function renderQuiz() {
  const target = document.querySelector<HTMLDivElement>("#quiz-content"); const progress = document.querySelector("#quiz-progress"); if (!target || !progress) return;
  if (quizFinished) {
    progress.textContent = "REVIEW";
    target.innerHTML = `<div class="quiz-result" data-testid="quiz-score-badge"><div class="score-orbit"><b data-testid="quiz-score-title">${quizScore}/${quizQuestions.length}</b><small>CORRECT</small></div><div><strong data-testid="quiz-result-heading">${quizScore === quizQuestions.length ? "Perfect. You spotted every tactic." : quizScore >= 3 ? "Good instincts. Review the misses." : "A useful first pass. Here is what to watch."}</strong><p data-testid="quiz-score-copy">Every answer is explained below so the correction is useful—not just a score.</p></div></div><div class="answer-review" data-testid="quiz-answer-review">${quizQuestions.map((question, index) => { const selected = quizAnswers[index]; const correct = selected === question.answer; const selectedText = selected === null || selected === undefined ? "No answer" : question.options[selected]; return `<article class="review-item ${correct ? "review-correct" : "review-wrong"}" data-testid="quiz-review-item"><div class="review-status"><span>${correct ? "✓" : "×"}</span><small>${correct ? "CORRECT" : "NEEDS REVIEW"}</small></div><div class="review-copy"><h4>${index + 1}. ${escapeHtml(question.prompt)}</h4><p data-testid="quiz-your-answer"><b>Your answer:</b> ${escapeHtml(selectedText)}</p>${correct ? "" : `<p data-testid="quiz-correct-answer"><b>Correct answer:</b> ${escapeHtml(question.options[question.answer])}</p>`}<small data-testid="quiz-answer-explanation">${escapeHtml(question.explanation)}</small></div></article>`; }).join("")}</div><button id="quiz-restart" data-testid="quiz-restart-btn" class="button button-outline review-restart">Try all five again</button>`;
    document.querySelector("#quiz-restart")?.addEventListener("click", () => { quizIndex = 0; quizScore = 0; quizAnswer = null; quizAnswers = []; quizFinished = false; renderQuiz(); });
    return;
  }
  const question = quizQuestions[quizIndex]; progress.textContent = `${quizIndex + 1} / ${quizQuestions.length}`; target.innerHTML = `<p class="quiz-question" data-testid="quiz-question">${question.prompt}</p><div class="quiz-options">${question.options.map((option, index) => `<button data-testid="quiz-option-btn" class="quiz-option ${quizAnswer === index ? "selected" : ""}" data-answer="${index}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span class="option-copy">${option}</span></button>`).join("")}</div><div class="quiz-footer"><small data-testid="quiz-hint">Choose one answer to continue</small><button id="quiz-next" data-testid="quiz-next-btn" class="button button-primary" ${quizAnswer === null ? "disabled" : ""}>${quizIndex === quizQuestions.length - 1 ? "Review my answers" : "Next question"} →</button></div>`;
  target.querySelectorAll<HTMLButtonElement>(".quiz-option").forEach((button) => button.addEventListener("click", () => { if (quizAnswer === null) { quizAnswer = Number(button.dataset.answer); renderQuiz(); } }));
  target.querySelector("#quiz-next")?.addEventListener("click", () => { if (quizAnswer === null) return; quizAnswers[quizIndex] = quizAnswer; quizScore = quizAnswers.reduce<number>((score, answer, index) => score + (answer === quizQuestions[index]?.answer ? 1 : 0), 0); if (quizIndex === quizQuestions.length - 1) quizFinished = true; else { quizIndex += 1; quizAnswer = null; } renderQuiz(); });
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
  document.querySelector<HTMLFormElement>("#scanner-form")?.addEventListener("submit", (event) => { event.preventDefault(); const input = document.querySelector<HTMLInputElement>("#scanner-input"); const value = input?.value.trim() ?? ""; if (!value) { toast(scanType === "url" ? "Add a shopping link first" : "Add the words visible in the screenshot", "error"); return; } const submit = document.querySelector<HTMLButtonElement>("[data-testid=hero-scan-submit-btn]"); const scannerCard = document.querySelector("[data-testid=scanner-card]"); scannerCard?.classList.add("scanning"); if (submit) { submit.disabled = true; submit.textContent = "Following the signals…"; } void apiPost<ScanRecord>("/scans", { scan_type: scanType, target_url: scanType === "url" ? value : undefined, raw_text: scanType === "url" ? undefined : value }).then((scan) => { latestScan = scan; scans = [scan, ...scans].slice(0, 5); renderResults(scan); renderRecords(); updateStats(); toast("Page checked — open the evidence"); window.setTimeout(() => document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }), 300); }).catch(() => toast("This page could not be checked. Try the link again.", "error")).finally(() => { scannerCard?.classList.remove("scanning"); if (submit) { submit.disabled = false; submit.innerHTML = "Check this page <span>→</span>"; } }); });
  document.querySelector<HTMLInputElement>("#records-search")?.addEventListener("input", renderRecords); document.querySelector<HTMLSelectElement>("#records-filter")?.addEventListener("change", renderRecords);
  document.querySelector<HTMLInputElement>("[data-testid=screenshot-file-input]")?.addEventListener("change", (event) => { const input = event.target as HTMLInputElement; const label = document.querySelector("[data-testid=screenshot-upload-label]"); if (label && input.files?.[0]) label.childNodes[0].textContent = `▣ ${input.files[0].name}`; });
  document.querySelector("#checklist-reset")?.addEventListener("click", () => { checkedDecisionItems.clear(); renderChecklist(); });
}

shell(); wireEvents(); wireExperience(); renderQuiz(); renderChecklist(); void loadData();
