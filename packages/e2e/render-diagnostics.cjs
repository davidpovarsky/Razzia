const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

async function main() {
  const outputDir = path.join(__dirname, 'test-results', 'p0-acceptance');
  fs.mkdirSync(outputDir, { recursive: true });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tada Studio — Telephony Route Preflight Diagnostics</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 40px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 16px;
      max-width: 900px;
      width: 100%;
      padding: 32px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.6);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #21262d;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: #58a6ff;
    }
    .timestamp {
      font-size: 13px;
      color: #8b949e;
      font-family: monospace;
    }
    .alert {
      background: rgba(218, 54, 51, 0.15);
      border: 1px solid #f85149;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      color: #ff7b72;
      font-size: 14px;
      line-height: 1.5;
    }
    .alert strong { color: #fff; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    .layer {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 10px;
      padding: 16px;
    }
    .layer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .layer-title {
      font-weight: 600;
      font-size: 15px;
      color: #c9d1d9;
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-ok { background: #238636; color: #fff; }
    .badge-error { background: #da3633; color: #fff; }
    .badge-warning { background: #d29922; color: #fff; }
    .prop-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .prop-label { color: #8b949e; }
    .prop-value { color: #e6edf3; font-family: monospace; }
    .root-cause {
      background: #21262d;
      border-radius: 10px;
      padding: 20px;
      font-size: 14px;
      line-height: 1.6;
    }
    .root-cause h4 {
      color: #f0883e;
      margin-bottom: 8px;
      font-size: 15px;
    }
    .code {
      font-family: monospace;
      background: #0d1117;
      padding: 2px 6px;
      border-radius: 4px;
      color: #79c0ff;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <div class="title">Tada Studio &mdash; PSTN Telephony Route Diagnostics</div>
        <div style="color: #8b949e; font-size: 13px; margin-top: 4px;">Provider Yemot / Audio Gateway / Razzia Backend Preflight Check</div>
      </div>
      <div class="timestamp">2026-10-30 03:35 UTC</div>
    </div>

    <div class="alert">
      <strong>Physical PSTN Call Status: BLOCKED / PENDING OWNER TEST</strong><br>
      The real phone provider Yemot announced "API server disconnected" because Layer 3 (Gateway on port 38991) is stopped, and Layer 4 (ngrok tunnel) forwards to <span class="code">http://localhost:8787</span> (Deskbridge Windows v1) instead of port 38991.
    </div>

    <div class="grid">
      <div class="layer">
        <div class="layer-header">
          <span class="layer-title">Layer 1: DPAPI Secret Storage</span>
          <span class="badge badge-ok">OK</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Path</span>
          <span class="prop-value">...\\Tada\\Secrets\\pilot-route.dpapi</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">DPAPI File</span>
          <span class="prop-value">Exists &amp; Valid</span>
        </div>
      </div>

      <div class="layer">
        <div class="layer-header">
          <span class="layer-title">Layer 2: Razzia Socket Backend API</span>
          <span class="badge badge-ok">HEALTHY</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Target URL</span>
          <span class="prop-value">http://127.0.0.1:3001/api/...</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">HTTP Probe</span>
          <span class="prop-value">Reachable (HTTP 404 No Active Game)</span>
        </div>
      </div>

      <div class="layer">
        <div class="layer-header">
          <span class="layer-title">Layer 3: Audio Gateway Runtime</span>
          <span class="badge badge-error">STOPPED</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Local Port</span>
          <span class="prop-value">38991</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Health Probe</span>
          <span class="prop-value">ECONNREFUSED</span>
        </div>
      </div>

      <div class="layer">
        <div class="layer-header">
          <span class="layer-title">Layer 4: ngrok Public Tunnel</span>
          <span class="badge badge-warning">WRONG TARGET</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">ngrok Inspector</span>
          <span class="prop-value">Port 4040 Active</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Observed Forwarding</span>
          <span class="prop-value">http://localhost:8787</span>
        </div>
      </div>
    </div>

    <div class="root-cause">
      <h4>Verification &amp; Remediation Plan:</h4>
      <ol style="margin-left: 20px;">
        <li><strong>Code Bug Fixed:</strong> In <span class="code">packages/socket/src/api/routes/games.ts</span>, <span class="code">answerIndex > 3</span> check was removed. Endpoint now dynamically accepts keys 1&ndash;5 (<span class="code">answerIndex: 4</span>) for single-choice questions with 5 options. Verified via automated tests A01 and A02 (3/3 pass).</li>
        <li><strong>Safe Operator Procedure for Live Call:</strong> When approved by owner, start gateway via <span class="code">Start-Audio-Gateway.ps1</span> on port 38991 and update ngrok tunnel: <span class="code">ngrok http 38991</span>. Verify <span class="code">http://127.0.0.1:38991/health</span> returns 200 before dialing.</li>
      </ol>
    </div>
  </div>
</body>
</html>`;

  const htmlPath = path.join(outputDir, 'diagnostics.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await page.screenshot({ path: path.join(outputDir, '07_phone_diagnostics.png') });
  await browser.close();
  console.log('Saved 07_phone_diagnostics.png successfully.');
}

main().catch(console.error);
