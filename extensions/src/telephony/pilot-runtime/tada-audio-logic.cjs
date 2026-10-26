'use strict';
const CUES = Object.freeze({
  intro: '000',
  join: '001',
  correct: '002',
  wrong: '003',
  neutral: '004',
  silence: '005',
});
const live = new Map();

const AUDIO_READ = (cue, key, timeout = 30) =>
  'read=f-/9/' + cue + '=' + key + ',,1,1,' + timeout + ',No,no,no,,,,Ok,None,,no';

const introRead = (key, joined = true) =>
  joined
    ? 'read=f-/9/000.f-/9/001.f-/9/005=' + key + ',,1,1,30,No,no,no,,,,Ok,None,,no'
    : 'read=f-/9/000.f-/9/005=' + key + ',,1,1,30,No,no,no,,,,Ok,None,,no';

function createSession(meta = {}) {
  return {
    stage: 'awaiting_game',
    joinedConfirmed: false,
    rosterPlayerId: meta.rosterPlayerId || null,
    phoneRaw: meta.phoneRaw || null,
    answered: false,
    questionEpoch: null,
    acceptingAnswers: false,
    lastDeliveredVerdictEpoch: 0,
    pendingVerdictCue: null,
    seq: 0,
    handled: new Set(),
    lastSeen: Date.now(),
  };
}

function nextKey(s) {
  return 'td' + (++s.seq);
}

function isDigit(v) {
  return typeof v === 'string' && /^[0-9]$/.test(v);
}

function syncServerState(s, serverState) {
  if (!serverState || typeof serverState !== 'object') return;
  if (serverState.rosterPlayerId) {
    s.rosterPlayerId = serverState.rosterPlayerId;
  }
  const st = serverState.state || serverState;
  if (typeof st.epoch === 'number' && st.epoch >= 1) {
    if (s.questionEpoch !== st.epoch) {
      s.questionEpoch = st.epoch;
      s.answered = Boolean(st.answeredCurrentQuestion);
    } else if (st.answeredCurrentQuestion) {
      s.answered = true;
    }
  }
  if (typeof st.acceptingAnswers === 'boolean') {
    s.acceptingAnswers = st.acceptingAnswers;
  }
  if (
    st.lastVerdict &&
    typeof st.lastVerdict.epoch === 'number' &&
    st.lastVerdict.epoch > (s.lastDeliveredVerdictEpoch || 0)
  ) {
    s.lastDeliveredVerdictEpoch = st.lastVerdict.epoch;
    s.pendingVerdictCue = st.lastVerdict.correct ? CUES.correct : CUES.wrong;
  }
}

function event(s, keyValue, current, options = {}) {
  s.lastSeen = Date.now();
  const preKeyAnswered = s.answered;

  if (options && options.serverState) {
    syncServerState(s, options.serverState);
  }

  if (!s.seq) {
    s.seq = 1;
    const joinConfirmed =
      options && typeof options.joinedConfirmed === 'boolean'
        ? options.joinedConfirmed
        : true;
    s.joinedConfirmed = joinConfirmed;
    return {
      cue: CUES.intro,
      body: introRead('td1', joinConfirmed),
      event: joinConfirmed ? 'join_audio' : 'intro_awaiting_join',
    };
  }

  // If caller was not joined on initial intro, and server now confirms join, play 001 once
  if (options && options.joinedConfirmed === true && !s.joinedConfirmed) {
    s.joinedConfirmed = true;
    return {
      cue: CUES.join,
      body: AUDIO_READ(CUES.join, 'td' + s.seq),
      event: 'join_confirmed_audio',
    };
  }

  const previous = 'td' + s.seq;
  const rawVal = current && typeof current.get === 'function' ? current.get(previous) : undefined;

  // Treat missing parameter or Yemot timeout value 'None' / '' as no digit entered
  if (!current || !current.has(previous) || rawVal === '' || rawVal === 'None') {
    if (s.pendingVerdictCue) {
      const vCue = s.pendingVerdictCue;
      s.pendingVerdictCue = null;
      return {
        cue: vCue,
        body: AUDIO_READ(vCue, previous),
        event: vCue === CUES.correct ? 'delayed_verdict_correct' : 'delayed_verdict_wrong',
      };
    }
    return {
      cue: CUES.silence,
      body: AUDIO_READ(CUES.silence, previous),
      event: 'await_input',
    };
  }

  const value = rawVal;
  if (s.handled.has(previous)) {
    return {
      cue: CUES.silence,
      body: AUDIO_READ(CUES.silence, nextKey(s)),
      event: 'replayed_key_ignored',
    };
  }
  s.handled.add(previous);

  const valid = isDigit(value) && /^[1-4]$/.test(value);
  if (!valid) {
    return {
      cue: CUES.neutral,
      body: AUDIO_READ(CUES.neutral, nextKey(s)),
      event: 'invalid_key',
    };
  }

  if (preKeyAnswered || !s.questionEpoch) {
    return {
      cue: CUES.neutral,
      body: AUDIO_READ(CUES.neutral, nextKey(s)),
      event: 'inactive_or_duplicate',
    };
  }

  const judge = typeof keyValue === 'function' ? keyValue : null;
  const outcome = judge ? judge(value, s.questionEpoch) : null;

  if (outcome && outcome.accepted) {
    s.answered = true;

    // If question is a survey, produce neutral acknowledgement only, never right/wrong
    if (outcome.isSurvey) {
      s.pendingVerdictCue = null;
      return {
        cue: CUES.neutral,
        body: AUDIO_READ(CUES.neutral, nextKey(s)),
        event: 'survey_answer',
      };
    }

    // If the game delays revealing whether the answer is right/wrong until question close,
    // play neutral acknowledgement now and deliver 002/003 once verdict is revealed.
    if (outcome.verdictPending || typeof outcome.correct !== 'boolean') {
      return {
        cue: CUES.neutral,
        body: AUDIO_READ(CUES.neutral, nextKey(s)),
        event: 'accepted_pending_verdict',
      };
    }

    s.lastDeliveredVerdictEpoch = s.questionEpoch;
    s.pendingVerdictCue = null;
    const cue = outcome.correct ? CUES.correct : CUES.wrong;
    return {
      cue,
      body: AUDIO_READ(cue, nextKey(s)),
      event: outcome.correct ? 'correct' : 'wrong',
    };
  }

  if (!s.acceptingAnswers) {
    return {
      cue: CUES.neutral,
      body: AUDIO_READ(CUES.neutral, nextKey(s)),
      event: 'inactive_or_duplicate',
    };
  }

  if (!judge) {
    return {
      cue: CUES.neutral,
      body: AUDIO_READ(CUES.neutral, nextKey(s)),
      event: 'no_authoritative_judge',
    };
  }

  return {
    cue: CUES.neutral,
    body: AUDIO_READ(CUES.neutral, nextKey(s)),
    event: 'server_rejected',
  };
}

function newQuestion(s, epoch) {
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error('bad epoch');
  if (s.questionEpoch === epoch) return false;
  s.questionEpoch = epoch;
  s.answered = false;
  s.acceptingAnswers = true;
  return true;
}

module.exports = {
  CUES,
  AUDIO_READ,
  introRead,
  createSession,
  syncServerState,
  event,
  newQuestion,
  live,
};

