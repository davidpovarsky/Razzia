import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DOCS = path.join(ROOT, "docs/extensions/plans/ux-followup-20261119");
const ORIGIN = "https://tadazz.com";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const options = Object.fromEntries(process.argv.slice(2).map((v, i, all) => v.startsWith("--") ? [v.slice(2), all[i + 1]] : null).filter(Boolean));
const expectedRevision = options["expected-revision"];
const out = path.resolve(options.out || path.join(DOCS, "production-public-smoke"));
const proofPath = path.resolve(options["identity-proof"] || path.join(DOCS, "post-deploy-observation.json"));
const deployPath = path.resolve(options["deployment-execution"] || path.join(DOCS, "deployment-deploy-execution.json"));
const requireFromE2e = createRequire(path.join(ROOT, "packages/e2e/package.json"));
const { chromium, expect } = requireFromE2e("@playwright/test");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const requireThat = (condition, code) => { if (!condition) throw new Error(code); };
const cleanUrl = (value) => {
  try { const u = new URL(value); return u.origin + u.pathname; } catch { return String(value).slice(0, 200); }
};
const cleanError = (value) => String(value).replace(/https?:\/\/[^\s"'<>]+/gu, cleanUrl).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]").slice(0, 1600);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bounded = async (promise, ms, code) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); })]); }
  finally { clearTimeout(timer); }
};

// No browser, network navigation, or evidence directory before the deployment guard.
function verifyLiveCandidate() {
  requireThat(/^[a-f0-9]{40}$/u.test(expectedRevision || ""), "EXPECTED_REVISION_REQUIRED");
  requireThat(Number(process.versions.node.split(".")[0]) >= 24, "NODE24_REQUIRED");
  requireThat(fs.existsSync(EDGE), "ISOLATED_EDGE_EXECUTABLE_MISSING");
  const source = readJson(path.join(DOCS, "current-release-source.json"));
  const envelope = readJson(deployPath);
  requireThat(source.sourceSha === expectedRevision && source.pushed === true, "CURRENT_SOURCE_MISMATCH");
  requireThat(envelope.action === "deploy" && envelope.exit === 0 && !envelope.timedOut && !envelope.stateRequiresInspection, "DEPLOYMENT_NOT_ACCEPTED");
  const remote = JSON.parse(envelope.stdout);
  requireThat(remote.action === "deploy" && remote.exit === 0 && remote.childExit === 0 && !remote.deadlineExceeded && !remote.stateRequiresInspection && remote.sourceSha === expectedRevision, "REMOTE_DEPLOYMENT_NOT_ACCEPTED");
  const deployed = JSON.parse(remote.stdout);
  requireThat(deployed.success === true && deployed.phase === "verified" && deployed.revision === expectedRevision && !deployed.rolledBack, "DEPLOYMENT_NOT_VERIFIED");
  const live = readJson(proofPath);
  requireThat(live.passed === true && live.sourceSha === expectedRevision && live.runtimeConfigHashUnchanged === true && live.noCustomerMutation === true, "LIVE_IDENTITY_NOT_VERIFIED");
  requireThat(/^sha256:[a-f0-9]{64}$/u.test(live.image || "") && /^[a-f0-9]{64}$/u.test(live.container || ""), "LIVE_IDENTITY_INVALID");
  requireThat(deployed.image === live.image && deployed.replacementContainer === live.container, "DEPLOYED_AND_LIVE_IDENTITY_DIFFER");
  const observed = remote.observedContainers?.tadazz;
  requireThat(observed?.id === live.container && observed.image === live.image && observed.running === true, "DEPLOYMENT_CONTAINER_OBSERVATION_MISMATCH");
  const observation = live.observation;
  requireThat(observation?.passed === true && observation.container === live.container && observation.image === live.image && observation.gateway === live.gateway && observation.restartsDuringWindow === 0 && observation.endingSnapshot?.releaseIdentityVerified === true && observation.endingSnapshot?.gatewayIdentityVerified === true, "LIVE_OBSERVATION_NOT_ACCEPTED");
  const observedAt = Date.parse(observation.finishedAt);
  const ageMs = Date.now() - observedAt;
  requireThat(Number.isFinite(ageMs) && ageMs >= -30000 && ageMs <= 20 * 60 * 1000, "LIVE_OBSERVATION_STALE");
  requireThat(!fs.existsSync(out), "OUTPUT_ALREADY_EXISTS_PRESERVE_EVIDENCE");
  return {
    verified: true, sourceSha: expectedRevision, sourceRun: live.sourceRun,
    image: live.image, container: live.container, gateway: live.gateway,
    observedAt: observation.finishedAt, ageMs,
    observationFile: path.relative(ROOT, proofPath),
    observationSha256: sha256(fs.readFileSync(proofPath)),
    deploymentExecutionFile: path.relative(ROOT, deployPath),
    deploymentExecutionSha256: sha256(fs.readFileSync(deployPath)),
  };
}

const identity = verifyLiveCandidate();
fs.mkdirSync(out, { recursive: false });
const receiptPath = path.join(out, "receipt.json");
const receipt = {
  kind: "anonymous-read-only-production-browser-smoke", version: 1, status: "RUNNING",
  startedAt: new Date().toISOString(), identity, nodePid: process.pid,
  productionOrigin: ORIGIN, installedChatGptVerified: false, authenticatedStudioVerified: false,
  accountLoginPerformed: false, formsSubmitted: false, emailsSent: false, gamesCreated: false,
  customerDataRequested: false, userBrowserProfileUsed: false, cspBypassed: false,
  browser: { engine: "chromium", executable: "Microsoft Edge", headless: true, nonpersistentContexts: true },
  policy: { sameOriginPublicReadOnly: true, nonGetHeadRequestsBlocked: true, privateApiRequestsBlocked: true, serviceWorkers: "blocked", traceHarVideoRecorded: false },
  cases: [], failures: [], cleanup: { completed: false },
};
const persist = () => fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
persist();
let server, browser, timedOut = false, interrupted = false;
const started = Date.now();
const stopOwnedBrowser = async () => {
  if (!server) return;
  try { await bounded(server.close(), 8000, "OWNED_BROWSER_GRACEFUL_CLOSE_TIMEOUT"); }
  catch {
    receipt.cleanup.forcedOwnedBrowserKill = true;
    await bounded(server.kill(), 8000, "OWNED_BROWSER_KILL_TIMEOUT");
  }
  const child = server.process();
  receipt.cleanup.browserPid = child.pid;
  receipt.cleanup.browserExitCode = child.exitCode;
  receipt.cleanup.browserSignal = child.signalCode;
  receipt.cleanup.completed = child.exitCode !== null || child.signalCode !== null;
  requireThat(receipt.cleanup.completed, "OWNED_BROWSER_STILL_RUNNING");
};
const globalDeadline = setTimeout(() => {
  timedOut = true;
  receipt.failures.push({ code: "GLOBAL_120_SECOND_DEADLINE" });
  persist();
  void server?.kill().catch(() => {});
}, 120000);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  interrupted = true;
  receipt.failures.push({ code: signal });
  persist();
  void server?.kill().catch(() => {});
});

const pages = [
  { id: "home", relative: "/", heading: /Make it a\s+show\./u },
  { id: "forgot", relative: "/forgot", heading: "Reset your password." },
];
const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const assetTypes = new Set(["script", "stylesheet", "font", "image", "media"]);
const captures = new Set(["home-1440", "home-390", "forgot-390"]);

async function runCase(spec, viewport) {
  const item = {
    name: spec.id + "-" + viewport.width, route: spec.relative, viewport,
    status: "RUNNING", startedAt: new Date().toISOString(),
    pageErrors: [], consoleErrors: [], cspViolations: [], failedSameOriginRequests: [],
    sameOriginHttpErrors: [], otherHttpErrors: [], blockedRequests: [],
    loadedSameOriginAssets: [], findings: [],
  };
  receipt.cases.push(item);
  let context, page, collecting = true;
  const guarded = new WeakSet();
  const responseReads = [];
  try {
    context = await browser.newContext({
      viewport, locale: "en-GB", timezoneId: "UTC",
      bypassCSP: false, ignoreHTTPSErrors: false, serviceWorkers: "block",
      acceptDownloads: false, permissions: [],
    });
    const initial = await context.storageState();
    requireThat(initial.cookies.length === 0 && initial.origins.length === 0, "CONTEXT_NOT_FRESH");
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const type = request.resourceType();
      let reason;
      if (!["GET", "HEAD"].includes(method)) reason = "non-read-only-method";
      else if (url.origin === ORIGIN && url.pathname.startsWith("/api/") && url.pathname !== "/api/auth/mode") reason = "outside-public-api-scope";
      else if (url.origin === ORIGIN && (/^\/(?:socket\.io|oauth|mcp|manager|studio)(?:\/|$)/u.test(url.pathname))) reason = "outside-anonymous-public-scope";
      else if (type === "document" && (url.origin !== ORIGIN || !["/", "/forgot"].includes(url.pathname))) reason = "unexpected-document-navigation";
      else if (url.origin !== ORIGIN && ["xhr", "fetch"].includes(type)) reason = "cross-origin-data-request";
      if (reason) {
        guarded.add(request);
        if (collecting) item.blockedRequests.push({ method, type, url: cleanUrl(request.url()), reason });
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    await context.routeWebSocket("**/*", (socket) => {
      if (collecting) item.blockedRequests.push({ type: "websocket", url: cleanUrl(socket.url()), reason: "anonymous-smoke-does-not-open-game-sockets" });
      socket.close({ code: 1000, reason: "Read-only public smoke" });
    });
    page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(20000);
    await page.addInitScript(() => {
      window.__tadazzPublicSmokeCsp = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__tadazzPublicSmokeCsp.push({
          disposition: event.disposition, directive: event.effectiveDirective,
          blockedURI: event.blockedURI, sourceFile: event.sourceFile, lineNumber: event.lineNumber,
        });
      });
    });
    page.on("pageerror", (error) => { if (collecting) item.pageErrors.push(cleanError(error.message)); });
    page.on("console", (message) => { if (collecting && message.type() === "error") item.consoleErrors.push(cleanError(message.text())); });
    page.on("crash", () => { if (collecting) item.pageErrors.push("BROWSER_PAGE_CRASH"); });
    page.on("requestfailed", (request) => {
      if (!collecting || guarded.has(request)) return;
      if (new URL(request.url()).origin === ORIGIN) item.failedSameOriginRequests.push({
        url: cleanUrl(request.url()), type: request.resourceType(), error: cleanError(request.failure()?.errorText || ""),
      });
    });
    page.on("response", (response) => {
      if (!collecting) return;
      const request = response.request(), url = new URL(response.url()), type = request.resourceType();
      const detail = { path: url.pathname, type, status: response.status() };
      if (url.origin === ORIGIN && response.status() >= 400) item.sameOriginHttpErrors.push(detail);
      else if (url.origin !== ORIGIN && response.status() >= 400) item.otherHttpErrors.push({ url: cleanUrl(response.url()), type, status: response.status() });
      if (url.origin === ORIGIN && assetTypes.has(type) && response.status() < 400 && item.loadedSameOriginAssets.length < 160) item.loadedSameOriginAssets.push(detail);
      if (url.origin === ORIGIN && url.pathname === "/api/auth/mode") {
        responseReads.push(response.json().then((body) => { item.accountService = { status: response.status(), accountsEnabled: body.accountsEnabled === true }; })
          .catch((error) => { item.pageErrors.push("AUTH_MODE_INVALID_JSON: " + cleanError(error.message)); }));
      }
    });
    page.on("dialog", (dialog) => { item.findings.push("UNEXPECTED_DIALOG"); void dialog.dismiss(); });
    page.on("popup", (popup) => { item.findings.push("UNEXPECTED_POPUP"); void popup.close(); });

    const response = await page.goto(ORIGIN + spec.relative, { waitUntil: "domcontentloaded" });
    requireThat(response?.status() === 200, "PUBLIC_DOCUMENT_NOT_HTTP200");
    requireThat((response.headers()["content-type"] || "").includes("text/html"), "PUBLIC_DOCUMENT_NOT_HTML");
    item.document = {
      status: response.status(), path: new URL(page.url()).pathname,
      cspHeaderPresent: Boolean(response.headers()["content-security-policy"]),
      contentType: response.headers()["content-type"],
    };
    const root = page.locator('[data-tadazz-site="marketing"]');
    await expect(root).toBeVisible();
    await expect(root.getByRole("heading", { level: 1, name: spec.heading })).toBeVisible();
    await expect(root.locator("img[alt='Tadazz']").first()).toBeVisible();

    if (spec.id === "home") {
      await expect(root.getByRole("button", { name: "Explore games", exact: true })).toBeVisible();
      await expect(root.locator(".cinema-buttons").getByRole("button", { name: "Try a round", exact: true })).toBeEnabled();
      if (viewport.width === 390) {
        const toggle = root.getByRole("button", { name: "Toggle navigation", exact: true });
        await expect(toggle).toBeVisible();
        await toggle.click();
        await expect(root.getByRole("navigation", { name: "Mobile navigation", exact: true })).toBeVisible();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        item.findings.push("Mobile navigation opens and closes through the real React handler.");
      } else {
        await expect(root.getByRole("navigation", { name: "Main navigation", exact: true })).toBeVisible();
        await expect(root.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
      }
    } else {
      const form = root.locator("form.account-fields");
      const email = form.getByRole("textbox", { name: "Email address", exact: true });
      await expect(email).toBeVisible();
      await expect(email).toHaveAttribute("type", "email");
      await expect(email).toHaveClass(/tds-input/u);
      const metrics = await email.evaluate((input) => {
        const box = input.getBoundingClientRect(), style = getComputedStyle(input);
        return { width: box.width, height: box.height, left: box.left, right: box.right,
          fontFamily: style.fontFamily, borderRadius: style.borderRadius,
          associatedLabelCount: input.labels?.length || 0, required: input.required, empty: input.value === "" };
      });
      requireThat(metrics.height >= 40 && metrics.width >= 180 && metrics.associatedLabelCount >= 1 && metrics.empty, "CANONICAL_EMAIL_CONTROL_NOT_RENDERED");
      item.emailControl = metrics;
      await expect(form.getByRole("button", { name: "Send reset code", exact: true })).toBeVisible();
      await expect(form.getByRole("button", { name: "Send reset code", exact: true })).toBeEnabled();
      await expect(root.getByRole("button", { name: "Back to login", exact: true })).toBeVisible();
      await expect(form.locator("input[type='password']")).toHaveCount(0);
      await expect(form.locator("input")).toHaveCount(1);
    }

    await bounded(page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }), 8000, "FONT_OR_RENDER_SETTLE_TIMEOUT");
    await expect.poll(async () => page.locator("img").evaluateAll((images) =>
      images.filter((img) => {
        const b = img.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
      }).every((img) => img.complete && img.naturalWidth > 0)), { timeout: 8000 }).toBe(true);
    await Promise.all(responseReads);
    item.layout = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth, fonts: document.fonts.status,
      moduleEntries: [...document.querySelectorAll("script[type='module'][src]")].map((x) => new URL(x.src).pathname),
    }));
    requireThat(item.layout.documentWidth <= viewport.width + 1 && item.layout.bodyWidth <= viewport.width + 1, "HORIZONTAL_PAGE_OVERFLOW");
    requireThat(item.layout.moduleEntries.length > 0, "BUILT_MODULE_ENTRY_MISSING");
    if (spec.id === "forgot") requireThat(item.accountService?.accountsEnabled === true, "ACCOUNT_SERVICE_NOT_ENABLED");
    await delay(250);
    item.cspViolations = (await page.evaluate(() => window.__tadazzPublicSmokeCsp || [])).map((x) => ({
      ...x, blockedURI: cleanUrl(x.blockedURI), sourceFile: cleanUrl(x.sourceFile),
    }));
    requireThat(item.pageErrors.length === 0, "PRODUCTION_PAGE_ERRORS");
    requireThat(item.consoleErrors.length === 0, "PRODUCTION_CONSOLE_ERRORS");
    requireThat(item.failedSameOriginRequests.length === 0, "SAME_ORIGIN_REQUEST_FAILURE");
    requireThat(item.sameOriginHttpErrors.length === 0, "SAME_ORIGIN_HTTP_ERROR");
    requireThat(item.blockedRequests.length === 0, "READ_ONLY_SCOPE_GUARD_TRIGGERED");
    requireThat(item.cspViolations.filter((x) => x.disposition !== "report").length === 0, "ENFORCED_CSP_VIOLATION");
    requireThat(!item.findings.some((x) => x.startsWith("UNEXPECTED_")), "UNEXPECTED_PUBLIC_UI");
    if (captures.has(item.name)) {
      item.screenshot = item.name + ".png";
      await page.screenshot({ path: path.join(out, item.screenshot), fullPage: false, timeout: 10000 });
    }
    item.status = "PASS";
  } catch (error) {
    item.status = "FAIL";
    item.error = cleanError(error.stack || error.message || error);
    receipt.failures.push({ case: item.name, error: item.error });
    if (page && !page.isClosed()) {
      try {
        item.screenshot = item.name + "-failure.png";
        await page.screenshot({ path: path.join(out, item.screenshot), fullPage: false, timeout: 5000 });
      } catch { item.failureScreenshotUnavailable = true; }
    }
  } finally {
    collecting = false;
    if (context) {
      try { await bounded(context.close(), 5000, "CONTEXT_CLOSE_TIMEOUT"); item.contextClosed = true; }
      catch (error) { item.contextClosed = false; item.status = "FAIL"; receipt.failures.push({ case: item.name, error: cleanError(error.message) }); throw error; }
    }
    item.finishedAt = new Date().toISOString();
    persist();
  }
}

try {
  // A loopback-only Playwright server exposes an owned ChildProcess handle for exact cleanup.
  server = await chromium.launchServer({ executablePath: EDGE, headless: true, host: "127.0.0.1", port: 0, timeout: 20000 });
  receipt.browser.pid = server.process().pid;
  browser = await chromium.connect(server.wsEndpoint(), { timeout: 10000 });
  receipt.browser.version = browser.version();
  for (const viewport of viewports) for (const spec of pages) {
    if (timedOut || interrupted) throw new Error("RUN_INTERRUPTED");
    await runCase(spec, viewport);
  }
} catch (error) {
  receipt.failures.push({ code: "RUN_FAILURE", error: cleanError(error.stack || error.message || error) });
} finally {
  try { await stopOwnedBrowser(); }
  catch (error) { receipt.cleanup.error = cleanError(error.message); receipt.failures.push({ code: "CLEANUP_FAILURE", error: receipt.cleanup.error }); }
  clearTimeout(globalDeadline);
  receipt.finishedAt = new Date().toISOString();
  receipt.seconds = Math.round((Date.now() - started) / 10) / 100;
  receipt.status = !timedOut && !interrupted && receipt.failures.length === 0 && receipt.cases.length === 4 && receipt.cases.every((x) => x.status === "PASS" && x.contextClosed) && receipt.cleanup.completed ? "PASS" : "FAIL";
  persist();
}
console.log(JSON.stringify({ status: receipt.status, sourceSha: identity.sourceSha, cases: receipt.cases.map((x) => ({ name: x.name, status: x.status })), failures: receipt.failures.length, cleanupCompleted: receipt.cleanup.completed, receipt: path.relative(ROOT, receiptPath) }));
process.exitCode = receipt.status === "PASS" ? 0 : 1;
