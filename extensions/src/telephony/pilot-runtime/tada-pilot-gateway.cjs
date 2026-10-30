'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { live, createSession, event } = require('./tada-audio-logic.cjs');

const secret = process.env.TADA_PILOT_SECRET;
if (!secret || secret.length < 32) throw Error('missing protected route secret');

const RAZZIA_API_URL =
  process.env.TADA_RAZZIA_API_URL || 'http://127.0.0.1:3001/api/games/pilot-phone';
const ACTIVE_INVITE_CODE = process.env.TADA_ACTIVE_INVITE_CODE || undefined;
const ACTIVE_GAME_ID = process.env.TADA_ACTIVE_GAME_ID || undefined;

const reply = (res, code, body) => {
  res.writeHead(code, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
};

async function callRazziaBackend(payload) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(RAZZIA_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tada-pilot-secret': secret,
      },
      body: JSON.stringify({
        ...payload,
        ...(ACTIVE_INVITE_CODE ? { inviteCode: ACTIVE_INVITE_CODE } : {}),
        ...(ACTIVE_GAME_ID ? { gameId: ACTIVE_GAME_ID } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  } catch {
    return { status: 0, ok: false, data: null };
  }
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    reply(res, 400, 'invalid');
    return;
  }
  if (url.pathname === '/health') {
    reply(res, 200, 'TADA_PHONE_AUDIO_V1');
    return;
  }
  if (url.pathname !== '/yemot/' + secret || !['GET', 'POST'].includes(req.method)) {
    reply(res, 404, 'Not found');
    return;
  }
  if (
    req.method === 'POST' &&
    !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')
  ) {
    reply(res, 415, 'unsupported');
    return;
  }

  const chunks = [];
  let total = 0;
  req.on('data', (ch) => {
    total += ch.length;
    if (total > 8192) {
      req.destroy();
      return;
    }
    chunks.push(ch);
  });

  req.on('end', async () => {
    try {
      const params = new URLSearchParams(url.search);
      for (const [k, v] of new URLSearchParams(Buffer.concat(chunks).toString('utf8'))) {
        params.set(k, v);
      }
      const rawId = params.get('ApiCallId') || '';
      if (!/^[\w-]{8,120}$/.test(rawId)) {
        reply(res, 200, 'hangup');
        return;
      }

      const rawPhone = params.get('ApiPhone') || params.get('apiphone') || '';
      const id = crypto.createHash('sha256').update(rawId).digest('hex');

      if (params.has('ApiHangupExtension') || params.get('hangup') === 'yes') {
        const existing = live.get(id);
        live.delete(id);
        await callRazziaBackend({
          action: 'hangup',
          callId: id.slice(0, 24),
          phone: rawPhone || existing?.phoneRaw || null,
          rosterPlayerId: existing?.rosterPlayerId || undefined,
        });
        reply(res, 200, 'hangup');
        return;
      }

      if (live.size > 500) {
        for (const [k, v] of live) {
          if (Date.now() - v.lastSeen > 7200000) live.delete(k);
        }
      }

      let s = live.get(id);
      if (!s) {
        s = createSession({ phoneRaw: rawPhone || null });
        live.set(id, s);
      } else if (rawPhone && !s.phoneRaw) {
        s.phoneRaw = rawPhone;
      }

      // 1. Poll / join authoritative Razzia server state
      const pollRes = await callRazziaBackend({
        action: 'join_or_poll',
        callId: id.slice(0, 24),
        phone: s.phoneRaw,
        rosterPlayerId: s.rosterPlayerId || undefined,
      });

      // If server explicitly rejects caller (e.g., phone_invite_only or locked), hang up cleanly
      if (
        pollRes.status === 403 &&
        pollRes.data &&
        (pollRes.data.reason === 'phone_invite_only' ||
          pollRes.data.error === 'errors:game.locked')
      ) {
        live.delete(id);
        console.log('TADA_PHONE_CALLBACK', new Date().toISOString(), 'invite_only_rejected', 'sessions', live.size);
        reply(res, 200, 'hangup');
        return;
      }

      const joinedConfirmed = Boolean(pollRes.ok && pollRes.data && pollRes.data.joined);
      const serverData = pollRes.ok ? pollRes.data : null;

      // 2. Check if caller pressed a valid 1..4 digit for the current step when question is active
      const prevKey = s.seq ? 'td' + s.seq : null;
      const enteredDigit = prevKey && params.has(prevKey) ? params.get(prevKey) : undefined;
      let answerOutcome = null;

      const allowedAnswersCount =
        serverData && serverData.state && typeof serverData.state.answersCount === 'number'
          ? serverData.state.answersCount
          : 5;

      if (
        joinedConfirmed &&
        prevKey &&
        !s.handled.has(prevKey) &&
        enteredDigit &&
        /^[1-5]$/.test(enteredDigit) &&
        Number.parseInt(enteredDigit, 10) <= allowedAnswersCount
      ) {
        const zeroIdx = Number.parseInt(enteredDigit, 10) - 1;
        const ansRes = await callRazziaBackend({
          action: 'answer',
          callId: id.slice(0, 24),
          phone: s.phoneRaw,
          rosterPlayerId: (serverData && serverData.rosterPlayerId) || s.rosterPlayerId || undefined,
          answerIndex: zeroIdx,
        });
        if (ansRes.ok && ansRes.data) {
          answerOutcome = ansRes.data;
        }
      }

      const judge = answerOutcome
        ? () => ({
            accepted: Boolean(answerOutcome.accepted),
            correct: answerOutcome.correct,
            verdictPending: Boolean(answerOutcome.verdictPending),
            isSurvey: Boolean(answerOutcome.isSurvey),
          })
        : null;

      const result = event(s, judge, params, {
        joinedConfirmed,
        serverState: answerOutcome || serverData,
      });

      console.log('TADA_PHONE_CALLBACK', new Date().toISOString(), result.event, 'sessions', live.size);
      reply(res, 200, result.body);
    } catch (e) {
      console.error('TADA_PHONE_EXCEPTION', e?.name);
      reply(res, 200, 'hangup');
    }
  });
});

if (require.main === module) {
  const port = Number(process.env.TADA_PILOT_PORT || 38991);
  server.listen(port, '127.0.0.1', () => console.log('TADA_PHONE_AUDIO_V1_RUNNING'));
}

module.exports = { server, callRazziaBackend };
