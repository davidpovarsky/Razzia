// extensions/src/core/show-themes/classic.manifest.json
var classic_manifest_default = {
  manifestVersion: 1,
  id: "tadazz-classic",
  version: "1.0.0",
  nameKey: "extensions:themes.classicName",
  descriptionKey: "extensions:themes.classicDescription",
  category: "show",
  kind: "code-backed",
  rendererApiVersion: 1,
  rendererId: "tadazz-classic-stage",
  posterAssetId: "classic-poster",
  provenance: "Current source-controlled Goldy/TADAZZ native v4 adapter and canonical motion specifications. No motion keyframes changed by theme extraction.",
  capabilities: {
    playModes: ["quiz", "survey"],
    questionTypes: ["single", "multi", "estimation"],
    roles: ["manager", "player", "spectator"],
    minAnswers: 2,
    maxAnswers: 64,
    reducedMotion: "same-theme-static",
    animationPresets: [
      "company-opening",
      "grand-opening",
      "representative-directory",
      "phone-instructions",
      "connection-readiness",
      "round-one",
      "story-progress",
      "tie-break",
      "story-assembly",
      "story-live",
      "round-two",
      "grand-finale",
      "top-pick",
      "round-recap",
      "interlude",
      "z-wipe"
    ]
  },
  tokens: {
    background: "#08011a",
    foreground: "#fff7e6",
    accent: "#ff9900",
    fontId: "goldy-canonical",
    stageAspect: "16:9",
    imageSizing: "square-cover",
    palette: {
      night: "#08001d",
      purple: "#34056f",
      violet: "#8b20f4",
      pink: "#ef48df",
      blue: "#00baff",
      royal: "#2e70ff",
      lime: "#e5ff37",
      gold: "#ffbe53",
      cream: "#fff5db",
      ink: "#130423"
    },
    effects: "goldy-canonical-v4",
    contrast: "light-on-dark-with-selected-outline"
  },
  slots: {
    firstPaint: {
      defaultVariantId: "tadazz-classic.firstPaint.default",
      variants: [
        {
          id: "tadazz-classic.firstPaint.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-shell",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.firstPaint"
        }
      ],
      customMedia: "none"
    },
    opening: {
      defaultVariantId: "tadazz-classic.opening.default",
      variants: [
        {
          id: "tadazz-classic.opening.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-opening",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.opening",
          mediaAssetId: "classic-opening-video",
          overlayAssetId: "classic-opening-lottie"
        }
      ],
      customMedia: "none"
    },
    lobby: {
      defaultVariantId: "tadazz-classic.lobby.default",
      variants: [
        {
          id: "tadazz-classic.lobby.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-lobby",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.lobby"
        }
      ],
      customMedia: "none"
    },
    question: {
      defaultVariantId: "tadazz-classic.question.default",
      variants: [
        {
          id: "tadazz-classic.question.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-question",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.question"
        }
      ],
      customMedia: "background"
    },
    answerCards: {
      defaultVariantId: "tadazz-classic.answerCards.default",
      variants: [
        {
          id: "tadazz-classic.answerCards.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-cards",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.answerCards"
        }
      ],
      customMedia: "background"
    },
    voting: {
      defaultVariantId: "tadazz-classic.voting.default",
      variants: [
        {
          id: "tadazz-classic.voting.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-voting",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.voting"
        }
      ],
      customMedia: "background"
    },
    timer: {
      defaultVariantId: "tadazz-classic.timer.default",
      variants: [
        {
          id: "tadazz-classic.timer.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-timer",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.timer"
        }
      ],
      customMedia: "none"
    },
    voteLock: {
      defaultVariantId: "tadazz-classic.voteLock.default",
      variants: [
        {
          id: "tadazz-classic.voteLock.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-lock",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.voteLock"
        }
      ],
      customMedia: "none"
    },
    resultsReveal: {
      defaultVariantId: "tadazz-classic.resultsReveal.default",
      variants: [
        {
          id: "tadazz-classic.resultsReveal.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-results",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.resultsReveal"
        }
      ],
      customMedia: "background"
    },
    leaderboard: {
      defaultVariantId: "tadazz-classic.leaderboard.default",
      variants: [
        {
          id: "tadazz-classic.leaderboard.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-leaderboard",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.leaderboard"
        }
      ],
      customMedia: "none"
    },
    rankUpdate: {
      defaultVariantId: "tadazz-classic.rankUpdate.default",
      variants: [
        {
          id: "tadazz-classic.rankUpdate.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-rank",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.rankUpdate"
        }
      ],
      customMedia: "none"
    },
    zzTransition: {
      defaultVariantId: "tadazz-classic.zzTransition.default",
      variants: [
        {
          id: "tadazz-classic.zzTransition.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-zz",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.zzTransition"
        }
      ],
      customMedia: "none"
    },
    interlude: {
      defaultVariantId: "tadazz-classic.interlude.default",
      variants: [
        {
          id: "tadazz-classic.interlude.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-interlude",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.interlude"
        }
      ],
      customMedia: "background"
    },
    closing: {
      defaultVariantId: "tadazz-classic.closing.default",
      variants: [
        {
          id: "tadazz-classic.closing.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-closing",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.closing"
        }
      ],
      customMedia: "none"
    },
    personalResult: {
      defaultVariantId: "tadazz-classic.personalResult.default",
      variants: [
        {
          id: "tadazz-classic.personalResult.default",
          labelKey: "extensions:themes.default",
          rendererId: "classic-personal-result",
          backgroundAssetId: "classic-backdrop",
          logoAssetId: "classic-logo",
          animationId: "classic.personalResult"
        }
      ],
      customMedia: "none"
    }
  },
  audioEvents: {
    opening: {
      defaultVariantId: "tadazz-classic.audio.opening.default",
      variants: [
        {
          id: "tadazz-classic.audio.opening.default",
          labelKey: "extensions:themes.default",
          inheritPlatform: true,
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: true
    },
    lobby: {
      defaultVariantId: "tadazz-classic.audio.lobby.default",
      variants: [
        {
          id: "tadazz-classic.audio.lobby.default",
          labelKey: "extensions:themes.default",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.lobby.accent",
          labelKey: "extensions:themes.default",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"],
          assetId: "classic-confirm"
        }
      ],
      customMedia: true
    },
    showQuestion: {
      defaultVariantId: "tadazz-classic.audio.showQuestion.default",
      variants: [
        {
          id: "tadazz-classic.audio.showQuestion.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-transition",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.showQuestion.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: true
    },
    answersMusic: {
      defaultVariantId: "tadazz-classic.audio.answersMusic.default",
      variants: [
        {
          id: "tadazz-classic.audio.answersMusic.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-voting",
          silent: false,
          volume: 0.35,
          loop: true,
          priority: 60,
          fadeMs: 0,
          restart: "epoch",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.answersMusic.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.35,
          loop: true,
          priority: 60,
          fadeMs: 0,
          restart: "epoch",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: true
    },
    answerSelected: {
      defaultVariantId: "tadazz-classic.audio.answerSelected.default",
      variants: [
        {
          id: "tadazz-classic.audio.answerSelected.default",
          labelKey: "extensions:themes.default",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["player"]
        }
      ],
      customMedia: false
    },
    answerSubmitted: {
      defaultVariantId: "tadazz-classic.audio.answerSubmitted.default",
      variants: [
        {
          id: "tadazz-classic.audio.answerSubmitted.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-confirm",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["player"]
        },
        {
          id: "tadazz-classic.audio.answerSubmitted.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["player"]
        }
      ],
      customMedia: false
    },
    timerWarning: {
      defaultVariantId: "tadazz-classic.audio.timerWarning.default",
      variants: [
        {
          id: "tadazz-classic.audio.timerWarning.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-tick",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.timerWarning.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.timerWarning.urgent",
          labelKey: "extensions:themes.default",
          assetId: "classic-urgent",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.timerWarning.final",
          labelKey: "extensions:themes.default",
          assetId: "classic-final",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: false
    },
    timerExpired: {
      defaultVariantId: "tadazz-classic.audio.timerExpired.default",
      variants: [
        {
          id: "tadazz-classic.audio.timerExpired.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-timer",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 90,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.timerExpired.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 90,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: false
    },
    voteLocked: {
      defaultVariantId: "tadazz-classic.audio.voteLocked.default",
      variants: [
        {
          id: "tadazz-classic.audio.voteLocked.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-reveal",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.voteLocked.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: false
    },
    revealResults: {
      defaultVariantId: "tadazz-classic.audio.revealResults.default",
      variants: [
        {
          id: "tadazz-classic.audio.revealResults.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-reveal",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.revealResults.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.revealResults.accent",
          labelKey: "extensions:themes.default",
          assetId: "classic-confirm",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.revealResults.music",
          labelKey: "extensions:themes.default",
          assetId: "classic-results-music",
          silent: false,
          volume: 0.7,
          loop: true,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.revealResults.fallback",
          labelKey: "extensions:themes.default",
          assetId: "classic-results-fallback",
          silent: false,
          volume: 0.7,
          loop: true,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.revealResults.story-mixer",
          labelKey: "extensions:themes.default",
          assetId: "classic-story-mixer",
          silent: false,
          volume: 0.62,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.revealResults.story-reveal",
          labelKey: "extensions:themes.default",
          assetId: "classic-story-reveal",
          silent: false,
          volume: 0.62,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: true
    },
    leaderboard: {
      defaultVariantId: "tadazz-classic.audio.leaderboard.default",
      variants: [
        {
          id: "tadazz-classic.audio.leaderboard.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-leaderboard",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.leaderboard.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: true
    },
    zzTransition: {
      defaultVariantId: "tadazz-classic.audio.zzTransition.default",
      variants: [
        {
          id: "tadazz-classic.audio.zzTransition.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-transition",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.zzTransition.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: true
    },
    podium1: {
      defaultVariantId: "tadazz-classic.audio.podium1.default",
      variants: [
        {
          id: "tadazz-classic.audio.podium1.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-first",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.podium1.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: false
    },
    podium2: {
      defaultVariantId: "tadazz-classic.audio.podium2.default",
      variants: [
        {
          id: "tadazz-classic.audio.podium2.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-second",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.podium2.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: false
    },
    podium3: {
      defaultVariantId: "tadazz-classic.audio.podium3.default",
      variants: [
        {
          id: "tadazz-classic.audio.podium3.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-third",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.podium3.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: false
    },
    closing: {
      defaultVariantId: "tadazz-classic.audio.closing.default",
      variants: [
        {
          id: "tadazz-classic.audio.closing.default",
          labelKey: "extensions:themes.default",
          assetId: "classic-first",
          silent: false,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        },
        {
          id: "tadazz-classic.audio.closing.silent",
          labelKey: "extensions:themes.silent",
          silent: true,
          volume: 0.7,
          loop: false,
          priority: 60,
          fadeMs: 0,
          restart: "event",
          roles: ["manager", "spectator"]
        }
      ],
      customMedia: true
    }
  },
  choreographyCues: {
    "timer-ended": {
      event: "timerExpired",
      variantId: "tadazz-classic.audio.timerExpired.default"
    },
    "vote-locked": {
      event: "voteLocked",
      variantId: "tadazz-classic.audio.voteLocked.default"
    },
    "countdown-ended": {
      event: "voteLocked",
      variantId: "tadazz-classic.audio.voteLocked.default"
    },
    "survey-reveal": {
      event: "revealResults",
      variantId: "tadazz-classic.audio.revealResults.default"
    },
    "top-pick-reveal": {
      event: "revealResults",
      variantId: "tadazz-classic.audio.revealResults.accent"
    },
    "timer-tick": {
      event: "timerWarning",
      variantId: "tadazz-classic.audio.timerWarning.default"
    },
    "timer-urgent": {
      event: "timerWarning",
      variantId: "tadazz-classic.audio.timerWarning.urgent"
    },
    "timer-final": {
      event: "timerWarning",
      variantId: "tadazz-classic.audio.timerWarning.final"
    },
    "story-begin": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "wipe-covered": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "company-ident": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "tadazz-welcome": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "opening-portal": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "opening-logo": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "directory-loaded": {
      event: "lobby",
      variantId: "tadazz-classic.audio.lobby.accent"
    },
    "phone-ready": {
      event: "lobby",
      variantId: "tadazz-classic.audio.lobby.accent"
    },
    "readiness-grid": {
      event: "lobby",
      variantId: "tadazz-classic.audio.lobby.accent"
    },
    "round-launch": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "story-progress-update": {
      event: "lobby",
      variantId: "tadazz-classic.audio.lobby.accent"
    },
    "story-assembled": {
      event: "revealResults",
      variantId: "tadazz-classic.audio.revealResults.default"
    },
    "story-live-hold": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "finale-impact": {
      event: "closing",
      variantId: "tadazz-classic.audio.closing.default"
    },
    "curtains-closed": {
      event: "zzTransition",
      variantId: "tadazz-classic.audio.zzTransition.default"
    },
    "story-mixer-track": {
      event: "revealResults",
      variantId: "tadazz-classic.audio.revealResults.story-mixer"
    },
    "story-reveal-track": {
      event: "revealResults",
      variantId: "tadazz-classic.audio.revealResults.story-reveal"
    }
  },
  assets: [
    {
      id: "classic-backdrop",
      url: "/tadazz-show/motion/backdrop.webp",
      kind: "image",
      sha256: "a76a50432f43313d29e78f625302a256e7e7b71db322612c4b66ee3aef0cf37e",
      bytes: 94502,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "critical"
    },
    {
      id: "classic-logo",
      url: "/tadazz-show/v4/tadazz-brand-logo.png",
      kind: "image",
      sha256: "e50aaf5f62f60a83b5a84ea1d55a8068c2e754df5c917681da553771756ebabd",
      bytes: 1976726,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "critical"
    },
    {
      id: "classic-poster",
      url: "/tadazz-show/v4/show-stage.webp",
      kind: "image",
      sha256: "9f3d1fe8d4458e98441303e728bba996b9a314295bbf5108f581c229f6db2d20",
      bytes: 261066,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-opening-video",
      url: "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4",
      kind: "video",
      sha256: "74e5f1d1114053ea55805af1d4b327eedab8092ef5ac088321220251175d4fac",
      bytes: 5028530,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-opening-lottie",
      url: "/tadazz-show/opening/TADAZZ-Opening-4-5s.json",
      kind: "lottie",
      sha256: "48037458d5aedef5055d6ca85f167b8fc079aa91e109b540eb81c554fa266f78",
      bytes: 1212173,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-transition",
      url: "/sounds/tadazz-silky-transition-20261108.mp3",
      kind: "audio",
      sha256: "4c3c0a5b880c5a1eae787c3895fae6a4cab4b4b7538eadb3b0b66955ce87e104",
      bytes: 18476,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-reveal",
      url: "/sounds/tadazz-reveal-bright-20261108.mp3",
      kind: "audio",
      sha256: "f264ded0b6135806df49240840de23054d936c0bf0c3c0b26c6efb2d4d234823",
      bytes: 28255,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-confirm",
      url: "/sounds/tadazz-confirm-20261108.mp3",
      kind: "audio",
      sha256: "2d9152323b9061b99512b8876da2d26dac250ce17c3c7f132c62a6fbcba7da94",
      bytes: 8193,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-voting",
      url: "/sounds/answersMusic.mp3",
      kind: "audio",
      sha256: "d1ebc0f3046aa0916ba5f2604df4f1f8f4087402d4d237ce75fa21f0a1de3cc6",
      bytes: 1246763,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-timer",
      url: "/sounds/tadazz-timer-end-368edc1d9522.mp3",
      kind: "audio",
      sha256: "368edc1d95220e8255c853850f02b447a128c06b59e1a8756fb02b6b9f4ab8e4",
      bytes: 25974,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-tick",
      url: "/sounds/tadazz-timer-tick-20261108.mp3",
      kind: "audio",
      sha256: "efcd6b041fc7f13e565e30a6ee878965d5caab7d29aa6ad86b657dbf3444c275",
      bytes: 5058,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-urgent",
      url: "/sounds/tadazz-timer-urgent-20261108.mp3",
      kind: "audio",
      sha256: "dcb2f17e811e0107cd324b541fecdd1334fd2dd19b8a9f8fed7feb0302960047",
      bytes: 5685,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-final",
      url: "/sounds/tadazz-timer-final-20261108.mp3",
      kind: "audio",
      sha256: "623deeb6e312c17f6feeb4d2fad8482d4c967055f7a5df975a84f8962e03630e",
      bytes: 9447,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-leaderboard",
      url: "/sounds/snearRoll.mp3",
      kind: "audio",
      sha256: "0928c8cf6063808a14e674a04aa370a29941c802c41c4e31e471e00ca3701212",
      bytes: 390765,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-first",
      url: "/sounds/first.mp3",
      kind: "audio",
      sha256: "9fcd09708b798984a0d2ad7edb46efaad5cc4bda7123ee06133fa99c476f6e90",
      bytes: 164093,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-second",
      url: "/sounds/second.mp3",
      kind: "audio",
      sha256: "75e490e301325354d62fb2f44876a90999e3da322e064961876fe9973a9f1cdb",
      bytes: 77750,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-third",
      url: "/sounds/three.mp3",
      kind: "audio",
      sha256: "374b3a93f05832dd1544e645d69413b82272fdf8f88416ffc23c3a30686ea997",
      bytes: 61238,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-story-mixer",
      url: "/tadazz-show/story/672dd07f229b8c36.mp3",
      kind: "audio",
      sha256: "672dd07f229b8c36f9c56484975fad7e28bedff9623fea049d2ca475022e84f8",
      bytes: 1222052,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-story-reveal",
      url: "/tadazz-show/story/9db4acdc6c4e411c.mp3",
      kind: "audio",
      sha256: "9db4acdc6c4e411ced75f9c85b31b136a775a9ea43543f867a2976da1f1fd36b",
      bytes: 91052,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-results-music",
      url: "/tadazz-show/music/cutie-patootie.mp3",
      kind: "audio",
      sha256: "1c3cafcf431726d25105ed8346271a9e69e35bdb09d40e418c55d46b6272f80c",
      bytes: 784914,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-results-fallback",
      url: "/tadazz-show/music/epic-main-menu.mp3",
      kind: "audio",
      sha256: "36377deb75d643232d583e509126919ec8feeb14a16dee734b1a9cbc778adf36",
      bytes: 839514,
      provenance: "Existing source-controlled TADAZZ/Razzia asset; original attribution retained in repository. Re-review rights before redistributing a new customer package.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-0f3c7d29e913",
      url: "/tadazz-show/motion/logo.webp",
      kind: "image",
      sha256: "4a925b8950ac3ba4ba878b849b88d1ce8dd44cf91d4e444547826251b1b1b672",
      bytes: 151654,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-d6997d876b26",
      url: "/tadazz-show/second-library/creating-worlds-intro.png",
      kind: "image",
      sha256: "2a9b5838016d41442079a2c3c533df6c1565a5e3f4ed40c1c8a4175640b7bbfd",
      bytes: 2410686,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-b47f49feae9c",
      url: "/tadazz-show/second-library/curtain-left.png",
      kind: "image",
      sha256: "429ab6d5f360406bb22be1f4a833359543fd09f1f415583a20f0a319968df060",
      bytes: 1132717,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-cfc4eaa014dd",
      url: "/tadazz-show/second-library/curtain-right.png",
      kind: "image",
      sha256: "9a46bb396bbbb104f0b398f0f9b52c38e6915d7013b010a8830404f85cf408fa",
      bytes: 1132143,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-7af6b5041525",
      url: "/tadazz-show/second-library/teaser-screen-source.jpg",
      kind: "image",
      sha256: "eaef71e6f2b59595eca49a5fb72df70e45f47a80351ea4d35e03d91f28851c17",
      bytes: 266631,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-a5b34d556931",
      url: "/tadazz-show/story/7ff12046cb1aac7b.png",
      kind: "image",
      sha256: "7ff12046cb1aac7be6fbdd3131bc8e5854a96f34b5560446f3183170731de037",
      bytes: 412633,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-5ebee0b89664",
      url: "/tadazz-show/story/84acdb923677d591.webp",
      kind: "image",
      sha256: "84acdb923677d591d7641d8452eb185aad360b4b990d6e0879905ad0494dbdc6",
      bytes: 134540,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-86afffeb48f1",
      url: "/tadazz-show/story/b789ffb48c74e55d.webp",
      kind: "image",
      sha256: "b789ffb48c74e55dad7cee0275c9e1ad32edc19b45e9ef7c84a99d979f30f748",
      bytes: 60174,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-8baa3c35f436",
      url: "/tadazz-show/story/fef87578b7d57eae.webp",
      kind: "image",
      sha256: "fef87578b7d57eae4b94709ff8fa909ed566a3336c84b7b041b795cba3007371",
      bytes: 178706,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-adapter-a27be4883ee9",
      url: "/tadazz-show/v4/question-bg.webp",
      kind: "image",
      sha256: "2f6912d851d8600e08d9a47d58e73dd40144fe30a908b82d10b3ba4036554321",
      bytes: 87904,
      provenance: "Existing source-controlled canonical Classic adapter asset. Preserve repository attribution; re-review rights before redistribution.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-banana",
      url: "/tadazz-show/great-guessoff/banana.webp",
      kind: "image",
      sha256: "e44f8561d297021b8a94dc39d3c439fa0aaee59f190e2fbf754b4d992eec3097",
      bytes: 14294,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-strawberry",
      url: "/tadazz-show/great-guessoff/strawberry.webp",
      kind: "image",
      sha256: "e83e15aea67e1a93091a9536b336fe26ed79518819f92b07302e05b0e99e9574",
      bytes: 56568,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-raspberry",
      url: "/tadazz-show/great-guessoff/raspberry.webp",
      kind: "image",
      sha256: "27f7d9f54361b86dd573c53d5752f33c1df7f8b528df1f2f30a542e614ef78ca",
      bytes: 60670,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-cherry",
      url: "/tadazz-show/great-guessoff/cherry.webp",
      kind: "image",
      sha256: "4650312d662191d34760e42ed1fb0be2174995a69759511a17653bcdc3fa69cc",
      bytes: 36770,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-organiser",
      url: "/tadazz-show/great-guessoff/organiser.webp",
      kind: "image",
      sha256: "e44111b0850900cb3b3a8b18505ebf818f1449a5b7e94c320d4bb7a37d10f03e",
      bytes: 35640,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-entertainer",
      url: "/tadazz-show/great-guessoff/entertainer.webp",
      kind: "image",
      sha256: "fd0481ec67574c24ccd148686a4b4fe93bbd979b6a56c6fc943f6375d53772db",
      bytes: 36614,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-photographer",
      url: "/tadazz-show/great-guessoff/photographer.webp",
      kind: "image",
      sha256: "76e319d433c653bf998a1de812f39b8e37d15a88fefbc10005d7a13f6ee835a9",
      bytes: 32198,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    },
    {
      id: "classic-guessoff-snack-hunter",
      url: "/tadazz-show/great-guessoff/snack-hunter.webp",
      kind: "image",
      sha256: "88d90d5463b4e399f133b1a9d618a115ed7c22cb8f409b05dc87977e04b80f41",
      bytes: 41866,
      provenance: "Existing source-controlled Great Guess-off public sample illustration. Bound to the public preview to match the already published interactive game.",
      rights: "repository-existing",
      preload: "slot"
    }
  ],
  adapterAssets: {
    questionBackdrop: "classic-adapter-a27be4883ee9",
    showBackdrop: "classic-poster",
    brandLogo: "classic-logo"
  }
};

// extensions/src/core/show-themes/original-theme-assets.json
var original_theme_assets_default = [
  {
    family: "royal-quiz",
    name: "backdrop",
    id: "royal-quiz-backdrop",
    url: "/tadazz-show/originals/royal-quiz/backdrop.png",
    kind: "image",
    sha256: "de6b0789fab788d78dae61ea44f490b35500099ee592b5929fcae074ad588f68",
    bytes: 809860,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/royal-quiz-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "royal-quiz",
    name: "poster",
    id: "royal-quiz-poster",
    url: "/tadazz-show/originals/royal-quiz/poster.png",
    kind: "image",
    sha256: "ac56aa628bfc0c9526732030462830ecf3f27b9628d8c6a58c605f1f0022cf50",
    bytes: 665028,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/royal-quiz-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  },
  {
    family: "neon-arcade",
    name: "backdrop",
    id: "neon-arcade-backdrop",
    url: "/tadazz-show/originals/neon-arcade/backdrop.png",
    kind: "image",
    sha256: "c77b05374b4aa4ce71ee9d458439291a22628e101ca03df97db18095a5dfaf15",
    bytes: 606339,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/neon-arcade-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "neon-arcade",
    name: "poster",
    id: "neon-arcade-poster",
    url: "/tadazz-show/originals/neon-arcade/poster.png",
    kind: "image",
    sha256: "baac844166e47c092bb5c8e475b2fbb926ae62436bbd94089ef9f842e7ff8122",
    bytes: 530669,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/neon-arcade-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  },
  {
    family: "retro-tv",
    name: "backdrop",
    id: "retro-tv-backdrop",
    url: "/tadazz-show/originals/retro-tv/backdrop.png",
    kind: "image",
    sha256: "6ca77ceb52622fe770026ffc88eb512018f2198960c94a3c264a94ad1d5549f5",
    bytes: 456962,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/retro-tv-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "retro-tv",
    name: "poster",
    id: "retro-tv-poster",
    url: "/tadazz-show/originals/retro-tv/poster.png",
    kind: "image",
    sha256: "560caceca5814a2efa9b5d892cf1774c6d13bf7a130417fce1fc8e6e56ddc8f9",
    bytes: 405065,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/retro-tv-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  },
  {
    family: "magic-storybook",
    name: "backdrop",
    id: "magic-storybook-backdrop",
    url: "/tadazz-show/originals/magic-storybook/backdrop.png",
    kind: "image",
    sha256: "4d804e6222a6a42cd945dd7e0bc771570964b085cc366d88af79bf2c15bbd22f",
    bytes: 566857,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/magic-storybook-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "magic-storybook",
    name: "poster",
    id: "magic-storybook-poster",
    url: "/tadazz-show/originals/magic-storybook/poster.png",
    kind: "image",
    sha256: "f5b8a2ad2e6142df5bd350de40058ee152b932ad32f14cbe9b447397a3467ffd",
    bytes: 481791,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/magic-storybook-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  },
  {
    family: "crystal-future",
    name: "backdrop",
    id: "crystal-future-backdrop",
    url: "/tadazz-show/originals/crystal-future/backdrop.png",
    kind: "image",
    sha256: "e3144117a6605907a8cc875dcff0bdcc10143fe82153cf58eff99feaf94429f0",
    bytes: 775296,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/crystal-future-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "crystal-future",
    name: "poster",
    id: "crystal-future-poster",
    url: "/tadazz-show/originals/crystal-future/poster.png",
    kind: "image",
    sha256: "1e0ce70c91b9447e4a6ca99f3bf70857173e02e8806a8f0e601c84d36f78b355",
    bytes: 690468,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/crystal-future-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  },
  {
    family: "carnival-pop",
    name: "backdrop",
    id: "carnival-pop-backdrop",
    url: "/tadazz-show/originals/carnival-pop/backdrop.png",
    kind: "image",
    sha256: "df0bb818ea6cfdec8f1d83bdee246bd003679c7b6ed8da4afa2bc6881520f815",
    bytes: 525426,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/carnival-pop-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "carnival-pop",
    name: "poster",
    id: "carnival-pop-poster",
    url: "/tadazz-show/originals/carnival-pop/poster.png",
    kind: "image",
    sha256: "aca9637b25090608db243562d612994e40b08a0e8b8ee796ba612b3c248d0afd",
    bytes: 478743,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/carnival-pop-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  },
  {
    family: "sports-arena",
    name: "backdrop",
    id: "sports-arena-backdrop",
    url: "/tadazz-show/originals/sports-arena/backdrop.png",
    kind: "image",
    sha256: "605ad7762d48b407707e1d94be94f2fdac047356ce89ebbd3d0d325221733e1c",
    bytes: 609856,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/sports-arena-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "sports-arena",
    name: "poster",
    id: "sports-arena-poster",
    url: "/tadazz-show/originals/sports-arena/poster.png",
    kind: "image",
    sha256: "8e7b85d816656f3cf2df917ce58c3b04c9449f99f6769af3abde5234545394c8",
    bytes: 543216,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/sports-arena-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  },
  {
    family: "mystery-noir",
    name: "backdrop",
    id: "mystery-noir-backdrop",
    url: "/tadazz-show/originals/mystery-noir/backdrop.png",
    kind: "image",
    sha256: "ac36a7fd5537a4c5c50c9782d548b98dfe73886796bd5571de97568057dd43b5",
    bytes: 588421,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/mystery-noir-backdrop.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "critical"
  },
  {
    family: "mystery-noir",
    name: "poster",
    id: "mystery-noir-poster",
    url: "/tadazz-show/originals/mystery-noir/poster.png",
    kind: "image",
    sha256: "032346a08b2970f6ae60bb34d711ad7070e91c7885d7ed1eaa9f4fdeb16b2f7e",
    bytes: 525537,
    provenance: "Original Tadazz geometric artwork; source extensions/site-assets/originals/mystery-noir-poster.svg; rendered offline from source on isolated Linux.",
    rights: "owner-authorized",
    preload: "slot"
  }
];

// extensions/src/core/show-themes/original-audio-assets.json
var original_audio_assets_default = [
  {
    family: "royal-quiz",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/voting-bed.wav",
    bytes: 4032044,
    sha256: "56dd2eaa69186e3430580f4f6e6127348cd91a2f2bcfcb19083da23b7d5b2029",
    durationSeconds: 22.857143,
    peak: 0.224149
  },
  {
    family: "royal-quiz",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/transition.wav",
    bytes: 132344,
    sha256: "6084c8956d384409c5f1589e1f2d384a8bd68abf89235191dbe3ddb42b29ecd5",
    durationSeconds: 0.75,
    peak: 0.313079
  },
  {
    family: "royal-quiz",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/confirm.wav",
    bytes: 60020,
    sha256: "27c9381a3fab0072aebbc41851080649da2babc4bc1f7bef649171a5a3dc8ced",
    durationSeconds: 0.34,
    peak: 0.262662
  },
  {
    family: "royal-quiz",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/tick.wav",
    bytes: 21212,
    sha256: "1d31b72174afa03c125b27a6e29f68dd51506a1e425b9c1702d07a3cd3b69cab",
    durationSeconds: 0.12,
    peak: 0.150506
  },
  {
    family: "royal-quiz",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/urgent.wav",
    bytes: 28268,
    sha256: "18fa66452c713fce66a2508fac434c37198bd95515a011d27a1a7d17e17b644b",
    durationSeconds: 0.16,
    peak: 0.147378
  },
  {
    family: "royal-quiz",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/final.wav",
    bytes: 40616,
    sha256: "f9ae91e68b1dd4c145792134bc539e87b6515a3eb334052051dbb17707546767",
    durationSeconds: 0.23,
    peak: 0.152049
  },
  {
    family: "royal-quiz",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/timer-end.wav",
    bytes: 149984,
    sha256: "1bd840e813495ae4b0117e409b42c4483903ec30e9bc878a458a82537b209131",
    durationSeconds: 0.85,
    peak: 0.260829
  },
  {
    family: "royal-quiz",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/lock.wav",
    bytes: 88244,
    sha256: "9b2c15a8a2ac8035de01e1221738d6644ca4635dd077382cfcb877dd8a3dfd97",
    durationSeconds: 0.5,
    peak: 0.258712
  },
  {
    family: "royal-quiz",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/reveal.wav",
    bytes: 291104,
    sha256: "00d81a0031aace27927bb6ce166a494def7961a38aa0dfc5a496366165d3d17f",
    durationSeconds: 1.65,
    peak: 0.313767
  },
  {
    family: "royal-quiz",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/leaderboard.wav",
    bytes: 458684,
    sha256: "99630ea453519e5c755c18faa677a8ba5572d503513325f5742761b4ec6ec57d",
    durationSeconds: 2.6,
    peak: 0.487343
  },
  {
    family: "royal-quiz",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/podium.wav",
    bytes: 670364,
    sha256: "bb386f56bb426537c6321096ed1f81435f0749bea1515c1eddb69fb04f2b2d32",
    durationSeconds: 3.8,
    peak: 0.374551
  },
  {
    family: "royal-quiz",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/royal-quiz/closing.wav",
    bytes: 846764,
    sha256: "f1b6a07691cef91513781da209315487b11f28edafb8d5516de4105488726a5c",
    durationSeconds: 4.8,
    peak: 0.384094
  },
  {
    family: "neon-arcade",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/voting-bed.wav",
    bytes: 3024044,
    sha256: "5065e072b6f140131f0b8bf3fea3fc3d62bb47d1af6889fb6c6301da0d271022",
    durationSeconds: 17.142857,
    peak: 0.247764
  },
  {
    family: "neon-arcade",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/transition.wav",
    bytes: 132344,
    sha256: "676846cf3ad90240bc938651d6884881281c2f40d491f11f135072abb99d8dd1",
    durationSeconds: 0.75,
    peak: 0.323532
  },
  {
    family: "neon-arcade",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/confirm.wav",
    bytes: 60020,
    sha256: "14516c75d63229cc57e6450286a576df3022ff95ecc758b5d592e3220884ee29",
    durationSeconds: 0.34,
    peak: 0.209299
  },
  {
    family: "neon-arcade",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/tick.wav",
    bytes: 21212,
    sha256: "6062bf7714866bfdd6f8d95d08de15a57f4cf64739b041ea70327acf26b7f85e",
    durationSeconds: 0.12,
    peak: 0.126083
  },
  {
    family: "neon-arcade",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/urgent.wav",
    bytes: 28268,
    sha256: "cf5d78ddda62c2e1cb8d3c0ead51b98fa18b16182e2137a6f21da6438937b24e",
    durationSeconds: 0.16,
    peak: 0.13038
  },
  {
    family: "neon-arcade",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/final.wav",
    bytes: 40616,
    sha256: "4c1ead6756e7d52be621b997c1f759cb3f1f966659f9c9b6c53ca9799b6ad0b4",
    durationSeconds: 0.23,
    peak: 0.132262
  },
  {
    family: "neon-arcade",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/timer-end.wav",
    bytes: 149984,
    sha256: "19b3afd3e784c331a0a15bef9f83beb86ea8a2830ef72c1a239d573982104954",
    durationSeconds: 0.85,
    peak: 0.241493
  },
  {
    family: "neon-arcade",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/lock.wav",
    bytes: 88244,
    sha256: "1196455d3e76f55119d770b0b2c24cb12cdaac3292082183cb0f84da45992bee",
    durationSeconds: 0.5,
    peak: 0.246563
  },
  {
    family: "neon-arcade",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/reveal.wav",
    bytes: 291104,
    sha256: "d3bcc98ed85dd1b0babe8a60a9046651368ba3ca264526d55655d8c428ccaac9",
    durationSeconds: 1.65,
    peak: 0.345605
  },
  {
    family: "neon-arcade",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/leaderboard.wav",
    bytes: 458684,
    sha256: "42dc45f04a23a81f1fa57b5593507a40e08dd8a54588ecb6ec45ee734d2163b1",
    durationSeconds: 2.6,
    peak: 0.407422
  },
  {
    family: "neon-arcade",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/podium.wav",
    bytes: 670364,
    sha256: "1651c3ccd893d69eba37fc23ea320bbb75856008124b8f8a46dde364db80eeaa",
    durationSeconds: 3.8,
    peak: 0.406609
  },
  {
    family: "neon-arcade",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/neon-arcade/closing.wav",
    bytes: 846764,
    sha256: "c18ddd684e77174f2ccc825708db7fb3506bb8485b17ceb0cdfb11e747120f7e",
    durationSeconds: 4.8,
    peak: 0.339157
  },
  {
    family: "retro-tv",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/voting-bed.wav",
    bytes: 3386924,
    sha256: "82ca6fc5bcec14199fb56bbe8147af801f3392014b9e86f1f3256395ff5e8b39",
    durationSeconds: 19.2,
    peak: 0.256594
  },
  {
    family: "retro-tv",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/transition.wav",
    bytes: 132344,
    sha256: "f1dc9a2bb0c5a8dec7010cf99c966f1fa9289d9a7220280a79266b18d6570f2f",
    durationSeconds: 0.75,
    peak: 0.368807
  },
  {
    family: "retro-tv",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/confirm.wav",
    bytes: 60020,
    sha256: "4f3cdcb1e00d49eb7cf2b020ac280a65d1e7cd7e2684e951dc35e6620b860b70",
    durationSeconds: 0.34,
    peak: 0.284196
  },
  {
    family: "retro-tv",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/tick.wav",
    bytes: 21212,
    sha256: "1430b8c2268a9476e466c7c9519258db334f530f16af4aa33e0c4fb3f3827184",
    durationSeconds: 0.12,
    peak: 0.151175
  },
  {
    family: "retro-tv",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/urgent.wav",
    bytes: 28268,
    sha256: "0ab54808d3c36e18e7fb35b875536e5df37dc60717e86f05adce115766e0d931",
    durationSeconds: 0.16,
    peak: 0.161908
  },
  {
    family: "retro-tv",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/final.wav",
    bytes: 40616,
    sha256: "310e4d5ee5c177531a0775c83acbe377e3796f0453784335a622bafcdf7dc16d",
    durationSeconds: 0.23,
    peak: 0.16702
  },
  {
    family: "retro-tv",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/timer-end.wav",
    bytes: 149984,
    sha256: "0a4e5c7b73ce3671f863c60cc9cbc872ba0a6e67f327efc6a2554d3d0a3dbbe9",
    durationSeconds: 0.85,
    peak: 0.295336
  },
  {
    family: "retro-tv",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/lock.wav",
    bytes: 88244,
    sha256: "e769c135f9ee803582304facd4e423bcb98d3f04aa9ef6e70224068ff173cabf",
    durationSeconds: 0.5,
    peak: 0.277539
  },
  {
    family: "retro-tv",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/reveal.wav",
    bytes: 291104,
    sha256: "32fe780121a18bdfd9ea3f8b68abf5a40b58ecad08f85d7dea2e509ab8cd5cb2",
    durationSeconds: 1.65,
    peak: 0.31983
  },
  {
    family: "retro-tv",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/leaderboard.wav",
    bytes: 458684,
    sha256: "b219a97d59c19712b09890d4c763e9afd1648b5b468d7a09f82fcba00b9010d9",
    durationSeconds: 2.6,
    peak: 0.524451
  },
  {
    family: "retro-tv",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/podium.wav",
    bytes: 670364,
    sha256: "00bc2d651b11ee8f48fad477c298381b9af534b8b68a5a4a38517d314b45269f",
    durationSeconds: 3.8,
    peak: 0.352899
  },
  {
    family: "retro-tv",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/retro-tv/closing.wav",
    bytes: 846764,
    sha256: "3d8823b633c9a21bad6d94177ea8207f8ea78d7f00cc6ca2d6da7911e4abaaee",
    durationSeconds: 4.8,
    peak: 0.352899
  },
  {
    family: "magic-storybook",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/voting-bed.wav",
    bytes: 4704044,
    sha256: "7eed15bb7b0870973e5b8c8624328b5a69de5842839e70bf450f7743a0b08c45",
    durationSeconds: 26.666667,
    peak: 0.204854
  },
  {
    family: "magic-storybook",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/transition.wav",
    bytes: 132344,
    sha256: "60cd8041bba4e9486625612f6141799ecb4a45da29b029de5daee6ed8ca68f79",
    durationSeconds: 0.75,
    peak: 0.29349
  },
  {
    family: "magic-storybook",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/confirm.wav",
    bytes: 60020,
    sha256: "8d4da399ca5d0a684301b8615828eb1d7d3dd6d92d0ef06217e7b3429287d40a",
    durationSeconds: 0.34,
    peak: 0.276956
  },
  {
    family: "magic-storybook",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/tick.wav",
    bytes: 21212,
    sha256: "debe2efa90bc1ee78eb2341bd05472815ded39a4977bf8f4eb4696b26727abac",
    durationSeconds: 0.12,
    peak: 0.15685
  },
  {
    family: "magic-storybook",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/urgent.wav",
    bytes: 28268,
    sha256: "b7d8fc05f906d1252a4240df8a6e3692d21dc804459240bf2e74b031b2a798a5",
    durationSeconds: 0.16,
    peak: 0.15781
  },
  {
    family: "magic-storybook",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/final.wav",
    bytes: 40616,
    sha256: "997321f3f18f0ccb986db0803f67a76cc81426161210712feed285ff20f23e73",
    durationSeconds: 0.23,
    peak: 0.158591
  },
  {
    family: "magic-storybook",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/timer-end.wav",
    bytes: 149984,
    sha256: "b928d99f1d49922e03f40b52399e4b373bca311bf31f4c3bf2ea41f54e6686f2",
    durationSeconds: 0.85,
    peak: 0.238323
  },
  {
    family: "magic-storybook",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/lock.wav",
    bytes: 88244,
    sha256: "29d2c91aa2b88e6614dea8bb849d94c4e89aa4f68523275df9fa6d6d1208756d",
    durationSeconds: 0.5,
    peak: 0.266663
  },
  {
    family: "magic-storybook",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/reveal.wav",
    bytes: 291104,
    sha256: "493b512bf5e0fc752d8b114eafa81e69353a18611ebfc6a52db57e496497e114",
    durationSeconds: 1.65,
    peak: 0.318278
  },
  {
    family: "magic-storybook",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/leaderboard.wav",
    bytes: 458684,
    sha256: "864a44711a1d3a8af4fa1a5614f79204d587b4e642b00564ac73902b707f032f",
    durationSeconds: 2.6,
    peak: 0.374829
  },
  {
    family: "magic-storybook",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/podium.wav",
    bytes: 670364,
    sha256: "f3a2306433768f52271f8829a6c8923480c0fb3bec25c0c0a1defb2b675b8d5f",
    durationSeconds: 3.8,
    peak: 0.365663
  },
  {
    family: "magic-storybook",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/magic-storybook/closing.wav",
    bytes: 846764,
    sha256: "38c8a0efe1bb911194867cae4161e884fbb49dc2222ef9f62cfbcee53f17f13b",
    durationSeconds: 4.8,
    peak: 0.275922
  },
  {
    family: "crystal-future",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/voting-bed.wav",
    bytes: 4233644,
    sha256: "1218a114752cb3dfdc758942ec3725747f3b952a1654feb4fee04ebc87e3f97a",
    durationSeconds: 24,
    peak: 0.227153
  },
  {
    family: "crystal-future",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/transition.wav",
    bytes: 132344,
    sha256: "4be02a7bce643025f003119bc118c308727627da1c19134a69794b0739f2e8d4",
    durationSeconds: 0.75,
    peak: 0.324908
  },
  {
    family: "crystal-future",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/confirm.wav",
    bytes: 60020,
    sha256: "2441858b03752c84b5e029aebf15775b6e709d0fa8501d0650fa56fc939cb648",
    durationSeconds: 0.34,
    peak: 0.240076
  },
  {
    family: "crystal-future",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/tick.wav",
    bytes: 21212,
    sha256: "96e7c8edbe37cc557e9eed9a6046436afe6601e901b40a44280397d94ea4efa2",
    durationSeconds: 0.12,
    peak: 0.157091
  },
  {
    family: "crystal-future",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/urgent.wav",
    bytes: 28268,
    sha256: "d6981597679528c3dfbc6cbe8bfbccf6d032bc61212622655630e932d9d5b0a0",
    durationSeconds: 0.16,
    peak: 0.157602
  },
  {
    family: "crystal-future",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/final.wav",
    bytes: 40616,
    sha256: "fb7f0d8a1676139f979c88674ec103073b3e2a78ff1940ffeaf94031894d9c2f",
    durationSeconds: 0.23,
    peak: 0.160181
  },
  {
    family: "crystal-future",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/timer-end.wav",
    bytes: 149984,
    sha256: "4cfab8e521061f271101c0ce76668e4b4838a66b25986143a27e39e08e1405a0",
    durationSeconds: 0.85,
    peak: 0.253643
  },
  {
    family: "crystal-future",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/lock.wav",
    bytes: 88244,
    sha256: "7693cf82cc39d4d652c52e7978c46aee40c60db6497145da4746284842e0ad3f",
    durationSeconds: 0.5,
    peak: 0.267907
  },
  {
    family: "crystal-future",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/reveal.wav",
    bytes: 291104,
    sha256: "bd19b4c17e3d27b66797dc026d9b37034104cbc011e6fc6f228e3477475f39c8",
    durationSeconds: 1.65,
    peak: 0.314771
  },
  {
    family: "crystal-future",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/leaderboard.wav",
    bytes: 458684,
    sha256: "b03d7cbea0b1b6035e87350734b69ed9a09635a496c946783aea53de46ecb4fc",
    durationSeconds: 2.6,
    peak: 0.414544
  },
  {
    family: "crystal-future",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/podium.wav",
    bytes: 670364,
    sha256: "2b203d8743beaaf2a16cface35fdf0ea75766c55297bdc566143353f871dc3d5",
    durationSeconds: 3.8,
    peak: 0.37468
  },
  {
    family: "crystal-future",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/crystal-future/closing.wav",
    bytes: 846764,
    sha256: "5322ed3ecedd9bb5686a15eac37406a0b28aeba997e85f060563344eeba18641",
    durationSeconds: 4.8,
    peak: 0.355505
  },
  {
    family: "carnival-pop",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/voting-bed.wav",
    bytes: 3136044,
    sha256: "47c4e2ef2f880bf7499a9b8fc0d5e130369de161d0c2588c4ee2290aeeca4f1e",
    durationSeconds: 17.777778,
    peak: 0.250489
  },
  {
    family: "carnival-pop",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/transition.wav",
    bytes: 132344,
    sha256: "05311c1b871c3b98846c6e97e1f3014ee0060d828a909f74a791c76261a4e1a2",
    durationSeconds: 0.75,
    peak: 0.336353
  },
  {
    family: "carnival-pop",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/confirm.wav",
    bytes: 60020,
    sha256: "859504a36618071c1bc335e29e9379fcbe6856dcf01bd6039be429b2f34f0fc2",
    durationSeconds: 0.34,
    peak: 0.291397
  },
  {
    family: "carnival-pop",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/tick.wav",
    bytes: 21212,
    sha256: "3041466c7977dcdad62af136822243e4347b5a736ba21e0c41e355007ebf6281",
    durationSeconds: 0.12,
    peak: 0.176991
  },
  {
    family: "carnival-pop",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/urgent.wav",
    bytes: 28268,
    sha256: "aeb01d3a385ed79e8825b4c3ea791d36c9e37f497d8a2427ea710de64b240c7c",
    durationSeconds: 0.16,
    peak: 0.176841
  },
  {
    family: "carnival-pop",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/final.wav",
    bytes: 40616,
    sha256: "0c1a3d726d44096405c42ac861a7110d171f28d02c025f966787bdae312d0c9e",
    durationSeconds: 0.23,
    peak: 0.177259
  },
  {
    family: "carnival-pop",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/timer-end.wav",
    bytes: 149984,
    sha256: "4df52cc3f6105adcd089619a8132aa6be0b1253c8a0750723329f59d8e01e474",
    durationSeconds: 0.85,
    peak: 0.217129
  },
  {
    family: "carnival-pop",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/lock.wav",
    bytes: 88244,
    sha256: "2be59a52363c80a7b4795129f65c77311e9ec50f2d97ded95c4c250e98076ea6",
    durationSeconds: 0.5,
    peak: 0.266171
  },
  {
    family: "carnival-pop",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/reveal.wav",
    bytes: 291104,
    sha256: "d342ddae4fd735f27afcd015c954e6c30f09a94f23f2f437cd8a12774b52f3c2",
    durationSeconds: 1.65,
    peak: 0.299781
  },
  {
    family: "carnival-pop",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/leaderboard.wav",
    bytes: 458684,
    sha256: "70b34c5f032fe18ef9275d258316e5da0cb23027d5b997778b7e4c4be44b01d2",
    durationSeconds: 2.6,
    peak: 0.386184
  },
  {
    family: "carnival-pop",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/podium.wav",
    bytes: 670364,
    sha256: "2a58b01a2a2ad8d77d4e957a6fb37567704929213b606a562982da392f88aa6d",
    durationSeconds: 3.8,
    peak: 0.359088
  },
  {
    family: "carnival-pop",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/carnival-pop/closing.wav",
    bytes: 846764,
    sha256: "3d1cd6b7a0ae9b108ef93cb82cbd7fae95b2d68e16ba9845703fc01d7d23b0f2",
    durationSeconds: 4.8,
    peak: 0.298582
  },
  {
    family: "sports-arena",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/voting-bed.wav",
    bytes: 2919768,
    sha256: "671791c6ff070aff2272b6d2890af594f2fead79ad520e53de2703599621b277",
    durationSeconds: 16.551724,
    peak: 0.240362
  },
  {
    family: "sports-arena",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/transition.wav",
    bytes: 132344,
    sha256: "2924f6d13472fe399c45e75365c607d49517540fd7b070d2791e0e67ef45f0d3",
    durationSeconds: 0.75,
    peak: 0.375371
  },
  {
    family: "sports-arena",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/confirm.wav",
    bytes: 60020,
    sha256: "a39a03e221a8676e81ad61ac015b92160e2d15f7fb7249fc8a5ed63e65e5b5e9",
    durationSeconds: 0.34,
    peak: 0.285683
  },
  {
    family: "sports-arena",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/tick.wav",
    bytes: 21212,
    sha256: "d81e0887d3158b385c5c7d9f7ff0f2961e1a747d7b941c7ebd0070f5c5ad200b",
    durationSeconds: 0.12,
    peak: 0.154234
  },
  {
    family: "sports-arena",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/urgent.wav",
    bytes: 28268,
    sha256: "a197783811b277f219ee974efb3730063c1bb233714d990b0a42172d2897bd1f",
    durationSeconds: 0.16,
    peak: 0.162991
  },
  {
    family: "sports-arena",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/final.wav",
    bytes: 40616,
    sha256: "518c9bd0ab2c37724b5e0930a29bffae0ac1ceae447e2f209f8600e85874c134",
    durationSeconds: 0.23,
    peak: 0.158644
  },
  {
    family: "sports-arena",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/timer-end.wav",
    bytes: 149984,
    sha256: "93efcb32e53dd4ca1a847d5974f37a816bc5cc7eecf2ec588e8668fb43c8d594",
    durationSeconds: 0.85,
    peak: 0.260308
  },
  {
    family: "sports-arena",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/lock.wav",
    bytes: 88244,
    sha256: "3b6fe417bfdb4788a294e6d7173c4cd396d619e40bee74f00907caf6f7828bc7",
    durationSeconds: 0.5,
    peak: 0.277323
  },
  {
    family: "sports-arena",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/reveal.wav",
    bytes: 291104,
    sha256: "f8ca5669177c94261f6f72a5558d37e07cb7140e8c4e479ea29a2b64b0d02d9c",
    durationSeconds: 1.65,
    peak: 0.39648
  },
  {
    family: "sports-arena",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/leaderboard.wav",
    bytes: 458684,
    sha256: "2cb7fcc5ae7d3bf54a17f822abcd6592ffaef274b687c420218abd43213930f9",
    durationSeconds: 2.6,
    peak: 0.435596
  },
  {
    family: "sports-arena",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/podium.wav",
    bytes: 670364,
    sha256: "c3b76eee4b6d8122742f218fd7953ab1f9976465dde171d52a767643472e6374",
    durationSeconds: 3.8,
    peak: 0.382125
  },
  {
    family: "sports-arena",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/sports-arena/closing.wav",
    bytes: 846764,
    sha256: "69f2b22ff06d133b18c0f0fc084e73beb0deabc35b180d0e1eff81574fa0daa8",
    durationSeconds: 4.8,
    peak: 0.329197
  },
  {
    family: "mystery-noir",
    name: "voting-bed",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/voting-bed.wav",
    bytes: 4838444,
    sha256: "5ee3f05bab720a670bed53a2d5c0d88994314cf7891fc237f52c4f0f27efc00a",
    durationSeconds: 27.428571,
    peak: 0.177902
  },
  {
    family: "mystery-noir",
    name: "transition",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/transition.wav",
    bytes: 132344,
    sha256: "a84a419f17db1dcd0c3dbfc6606796eff76d3c819e4445aae0f80cc5bb72e8fe",
    durationSeconds: 0.75,
    peak: 0.308374
  },
  {
    family: "mystery-noir",
    name: "confirm",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/confirm.wav",
    bytes: 60020,
    sha256: "646240679dcbc5326b8585a8354a49825002cf8b04c3d635a7cbd219f12a0a42",
    durationSeconds: 0.34,
    peak: 0.25098
  },
  {
    family: "mystery-noir",
    name: "tick",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/tick.wav",
    bytes: 21212,
    sha256: "6fb0d5e6d2b15c41ea1406010d4d93a8b33d888b62f1bb6d6a7fa847ff414748",
    durationSeconds: 0.12,
    peak: 0.153618
  },
  {
    family: "mystery-noir",
    name: "urgent",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/urgent.wav",
    bytes: 28268,
    sha256: "229aecd00ccbbd9bac81c871d81b55e84469913170633cf9e04c3cbc23d930eb",
    durationSeconds: 0.16,
    peak: 0.154101
  },
  {
    family: "mystery-noir",
    name: "final",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/final.wav",
    bytes: 40616,
    sha256: "cce4012fe25d8cd32804f3510c09d935f6dcf7685b82cb35dc2f314335ad15fd",
    durationSeconds: 0.23,
    peak: 0.154587
  },
  {
    family: "mystery-noir",
    name: "timer-end",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/timer-end.wav",
    bytes: 149984,
    sha256: "c8c8473bb217cf455abd0da2505904089df62d93c6a001d5e85db4fe4f79770b",
    durationSeconds: 0.85,
    peak: 0.218722
  },
  {
    family: "mystery-noir",
    name: "lock",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/lock.wav",
    bytes: 88244,
    sha256: "85293bf50992a0b995ec45a9b7b12e6e94089437691648529cf8765648910293",
    durationSeconds: 0.5,
    peak: 0.24138
  },
  {
    family: "mystery-noir",
    name: "reveal",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/reveal.wav",
    bytes: 291104,
    sha256: "e7e81e415c5c5803c5e62c340588580f3144c76ff100df25c09691fe2aa3a84f",
    durationSeconds: 1.65,
    peak: 0.27639
  },
  {
    family: "mystery-noir",
    name: "leaderboard",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/leaderboard.wav",
    bytes: 458684,
    sha256: "04924998782cec6ad5ac09bd68631f82ae67f1e0b9d26041dff9a7f566cdfa11",
    durationSeconds: 2.6,
    peak: 0.327112
  },
  {
    family: "mystery-noir",
    name: "podium",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/podium.wav",
    bytes: 670364,
    sha256: "9ca81fa686721d12de1ac44442cc5c62843e7ec5dea33c76903c992e6620b6f7",
    durationSeconds: 3.8,
    peak: 0.329486
  },
  {
    family: "mystery-noir",
    name: "closing",
    kind: "audio",
    url: "/tadazz-show/originals/mystery-noir/closing.wav",
    bytes: 846764,
    sha256: "a5c9519a0533964f24c17d83a7e35952957c67e1778f7f281520e6fc3059d228",
    durationSeconds: 4.8,
    peak: 0.267116
  }
];

// extensions/src/core/show-themes/definition.ts
import { z as z4 } from "zod";

// extensions/src/core/packages/protocol.ts
import { z as z3 } from "zod";

// extensions/src/core/packages/manifest.ts
import { z as z2 } from "zod";

// extensions/src/core/show-themes/selection.ts
import { z } from "zod";
var SHOW_THEME_SLOTS = [
  "firstPaint",
  "opening",
  "lobby",
  "question",
  "answerCards",
  "voting",
  "timer",
  "voteLock",
  "resultsReveal",
  "leaderboard",
  "rankUpdate",
  "zzTransition",
  "interlude",
  "closing",
  "personalResult"
];
var SHOW_THEME_AUDIO_EVENTS = [
  "opening",
  "lobby",
  "showQuestion",
  "answersMusic",
  "answerSelected",
  "answerSubmitted",
  "timerWarning",
  "timerExpired",
  "voteLocked",
  "revealResults",
  "leaderboard",
  "zzTransition",
  "podium1",
  "podium2",
  "podium3",
  "closing"
];
var SHOW_THEME_ROLES = ["manager", "player", "spectator"];
var themeIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/u);
var themeVersionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u);
var identifier = z.string().min(1).max(160).regex(/^[a-zA-Z0-9._-]+$/u);
function isSafeThemeAssetUrl(value) {
  if (value.length > 2048 || /[\\\s\u0000-\u001f]/u.test(value)) {
    return false;
  }
  if (/^\/(media|sounds|tadazz-show)\/[A-Za-z0-9_@./-]+$/u.test(value)) {
    return value.split("/").slice(1).every((part) => part !== "" && part !== "." && part !== "..");
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash;
  } catch {
    return false;
  }
}
var themeAssetUrlSchema = z.string().refine(isSafeThemeAssetUrl, "Invalid theme asset URL");
var visualSelection = z.strictObject({
  variantId: identifier.optional(),
  mediaUrl: themeAssetUrlSchema.optional(),
  fit: z.enum(["cover", "contain"]).optional()
});
var audioSelection = z.strictObject({
  variantId: identifier.optional(),
  mediaUrl: themeAssetUrlSchema.optional(),
  muted: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional()
});
var slotSelections = z.partialRecord(
  z.enum(SHOW_THEME_SLOTS),
  visualSelection
);
var audioSelections = z.partialRecord(
  z.enum(SHOW_THEME_AUDIO_EVENTS),
  audioSelection
);
var roleSelection = z.strictObject({
  slots: slotSelections.optional(),
  audio: audioSelections.optional()
});
var themeOverridesSchema = z.strictObject({
  slots: slotSelections.optional(),
  audio: audioSelections.optional(),
  roles: z.partialRecord(z.enum(SHOW_THEME_ROLES), roleSelection).optional()
});
var scopeSnapshot = z.strictObject({
  themeId: themeIdSchema,
  themeVersion: themeVersionSchema,
  overrides: themeOverridesSchema
});
var scopedThemeOverridesSchema = scopeSnapshot.extend({
  history: z.array(scopeSnapshot).max(32).optional()
});
var showThemeSelectionSchema = z.strictObject({
  id: themeIdSchema,
  version: themeVersionSchema,
  overrides: themeOverridesSchema.default({}),
  legacyPolicy: z.enum(["preserve-saved", "theme-defaults"]).optional()
});

// extensions/src/core/packages/paths.ts
function packagePath(input) {
  const path = input.normalize("NFC");
  if (path !== input || path.length > 240 || /[\\\x00-\x1f\x7f:%?#<>"|*]/u.test(path) || path.startsWith("/") || path.split("/").some(
    (part) => !part || part === "." || part === ".." || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)
  )) {
    throw new Error("PACKAGE_PATH");
  }
  return path;
}
var packagePathKey = (input) => packagePath(input).toUpperCase().toLowerCase().normalize("NFC");

// extensions/src/core/packages/manifest.ts
var packageDigestSchema = z2.string().regex(/^[a-f0-9]{64}$/u);
var packagePathSchema = z2.string().refine((p) => {
  try {
    return packagePath(p) === p;
  } catch {
    return false;
  }
}, "Invalid portable path");
var PACKAGE_LIMITS = Object.freeze({
  archiveBytes: 18e7,
  expandedBytes: 25e7,
  fileBytes: 1e8,
  sourceBytes: 1e6,
  files: 2048,
  ratio: 100,
  manifestBytes: 5e5,
  games: 32,
  themes: 8
});
var packageContentSchema = z2.strictObject({
  kind: z2.enum(["declarative-theme", "sandboxed-react-theme", "game"]),
  id: themeIdSchema,
  path: packagePathSchema,
  themeRef: z2.string().max(160).regex(/^[a-z0-9][a-z0-9-]*@\d+\.\d+\.\d+$/u).optional(),
  demo: z2.boolean().default(false)
});
var packageFileSchema = z2.strictObject({
  path: packagePathSchema,
  kind: z2.enum([
    "descriptor",
    "source",
    "style",
    "image",
    "video",
    "audio",
    "lottie",
    "font"
  ]),
  bytes: z2.number().int().positive().max(PACKAGE_LIMITS.fileBytes),
  sha256: packageDigestSchema,
  rights: z2.enum(["licensed", "owner-authorized"]),
  provenance: z2.string().trim().min(1).max(1e3),
  exportable: z2.boolean()
});
var packageManifestSchema = z2.strictObject({
  format: z2.literal("tadazz-package"),
  formatVersion: z2.literal(1),
  id: themeIdSchema,
  version: themeVersionSchema.max(32),
  displayName: z2.string().trim().min(1).max(120),
  author: z2.string().trim().min(1).max(160),
  requires: z2.strictObject({
    packageApi: z2.literal(1),
    runtimeApi: z2.literal(1)
  }),
  contents: z2.array(packageContentSchema).min(1).max(40),
  files: z2.array(packageFileSchema).min(1).max(PACKAGE_LIMITS.files - 1)
}).superRefine((value, ctx) => {
  const files = new Map(value.files.map((f) => [packagePathKey(f.path), f]));
  const identities = /* @__PURE__ */ new Set();
  const issue = (message) => ctx.addIssue({ code: "custom", message });
  if (files.size !== value.files.length || files.has("manifest.json")) {
    issue("Duplicate inventory path");
  }
  if (value.files.reduce((n, f) => n + f.bytes, 0) > PACKAGE_LIMITS.expandedBytes) {
    issue("Expanded budget");
  }
  for (const content of value.contents) {
    if (identities.has(content.id)) {
      issue("Duplicate content identity");
    }
    identities.add(content.id);
    if (files.get(packagePathKey(content.path))?.kind !== "descriptor") {
      issue("Missing content descriptor");
    }
    if (content.kind !== "game" && content.themeRef) {
      issue("Only games reference themes");
    }
    if (content.themeRef && !value.contents.some(
      (c) => c.kind !== "game" && `${c.id}@${value.version}` === content.themeRef
    )) {
      issue("Unresolved bundled theme dependency");
    }
  }
  if (value.contents.filter((c) => c.kind === "game").length > PACKAGE_LIMITS.games || value.contents.filter((c) => c.kind !== "game").length > PACKAGE_LIMITS.themes) {
    issue("Content budget");
  }
});

// extensions/src/core/packages/protocol.ts
var RUNTIME_PHASES = [
  "opening",
  "lobby",
  "question",
  "answerCards",
  "voting",
  "voteLocked",
  "results",
  "leaderboard",
  "interlude",
  "closing",
  "personalResult"
];
var text = z3.string().max(1e3);
var sandboxDefinitionSchema = z3.strictObject({
  runtimeApi: z3.literal(1),
  entry: z3.string().max(240),
  slots: z3.record(z3.enum(RUNTIME_PHASES), z3.enum(["implemented", "classic"])),
  roles: z3.array(z3.enum(["manager", "player", "spectator"])).min(1).max(3),
  assetPaths: z3.array(z3.string().max(240)).max(256).optional()
});
var runtimePinSchema = z3.strictObject({
  packageId: z3.string().max(64),
  version: z3.string().max(32),
  sourceDigest: packageDigestSchema,
  buildDigest: packageDigestSchema
});
var runtimeSnapshotSchema = z3.strictObject({
  roomId: text,
  questionId: text,
  epoch: z3.number().int().nonnegative(),
  sequence: z3.number().int().nonnegative(),
  role: z3.enum(["manager", "player", "spectator"]),
  phase: z3.enum(RUNTIME_PHASES),
  locale: z3.string().max(16),
  reducedMotion: z3.boolean(),
  title: text,
  question: text,
  // Additive public presentation metadata. Older packages/snapshots may omit it.
  questionNumber: z3.number().int().positive().optional(),
  questionCount: z3.number().int().nonnegative().nullable().optional(),
  cardKind: z3.string().max(80).optional(),
  cardTitle: text.optional(),
  finalLeaderboard: z3.boolean().optional(),
  phaseElapsedMs: z3.number().min(0).max(864e5).optional(),
  revealStage: z3.enum(["pending", "audience", "correct"]).optional(),
  questionImage: z3.string().max(7e6).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u).optional(),
  backgroundImage: z3.string().max(7e6).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u).optional(),
  joinCode: z3.string().regex(/^(?:[0-9]{6})?$/u).optional(),
  joinUrl: z3.string().max(2048).regex(/^https?:\/\/[^\s?#]+\/game$/u).optional(),
  joinPhoneNumber: z3.string().max(100).optional(),
  lobbyInstructions: z3.array(z3.string().max(500)).max(8).optional(),
  roster: z3.array(
    z3.strictObject({
      id: z3.string().max(100),
      label: z3.string().max(160),
      connected: z3.boolean()
    })
  ).max(2e3).optional(),
  answers: z3.array(
    z3.strictObject({
      id: z3.string().max(64),
      label: text,
      image: z3.string().max(7e6).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u).optional(),
      percent: z3.number().min(0).max(100).optional(),
      correct: z3.boolean().optional(),
      votes: z3.number().int().nonnegative().optional()
    })
  ).max(64),
  leaders: z3.array(
    z3.strictObject({
      label: text,
      score: z3.number(),
      rank: z3.number().int().positive()
    })
  ).max(100),
  personalResult: z3.strictObject({
    correct: z3.boolean(),
    points: z3.number(),
    rank: z3.number().int().nonnegative()
  }).nullable(),
  serverTime: z3.number(),
  deadline: z3.number().nullable(),
  remainingMs: z3.number().min(0).max(864e5),
  paused: z3.boolean(),
  canAnswer: z3.boolean(),
  labels: z3.strictObject({ submit: text, waiting: text, results: text })
});
var envelope = {
  v: z3.literal(1),
  channel: z3.string().regex(/^[a-f0-9]{64}$/u),
  roomId: text,
  questionId: text,
  role: z3.enum(["manager", "player", "spectator"]),
  sequence: z3.number().int().positive(),
  epoch: z3.number().int().nonnegative()
};
var rendererMessageSchema = z3.discriminatedUnion("type", [
  z3.strictObject({
    ...envelope,
    type: z3.literal("READY"),
    runtimeApi: z3.literal(1)
  }),
  z3.strictObject({ ...envelope, type: z3.literal("RENDER_HEALTH") }),
  // Separate from READY so a new SDK still handshakes with an older host.
  z3.strictObject({
    ...envelope,
    type: z3.literal("RUNTIME_CAPABILITIES"),
    snapshotMetadataVersion: z3.union([z3.literal(1), z3.literal(2)])
  }),
  z3.strictObject({
    ...envelope,
    type: z3.literal("ANSWER_INTENT"),
    questionId: text,
    optionIds: z3.array(z3.string().max(64)).min(1).max(64)
  }),
  z3.strictObject({
    ...envelope,
    type: z3.literal("AUDIO_CUE_REQUEST"),
    cueId: z3.string().max(64)
  }),
  z3.strictObject({
    ...envelope,
    type: z3.literal("RUNTIME_ERROR"),
    code: z3.enum(["RENDER_FAILED", "UNSUPPORTED_SLOT"])
  })
]);
var parentMessageSchema = z3.discriminatedUnion("type", [
  z3.strictObject({
    ...envelope,
    type: z3.literal("BOOTSTRAP"),
    snapshot: runtimeSnapshotSchema,
    assetMap: z3.record(z3.string().max(240), z3.string().max(2048))
  }),
  z3.strictObject({
    ...envelope,
    type: z3.literal("STATE_SNAPSHOT"),
    snapshot: runtimeSnapshotSchema
  }),
  z3.strictObject({ ...envelope, type: z3.literal("DISPOSE") })
]);

// extensions/src/core/show-themes/original-theme-families.ts
var ORIGINAL_THEME_IDS = [
  "royal-quiz",
  "neon-arcade",
  "retro-tv",
  "magic-storybook",
  "crystal-future",
  "carnival-pop",
  "sports-arena",
  "mystery-noir"
];
function isOriginalThemeId(value) {
  return ORIGINAL_THEME_IDS.includes(value);
}
var ORIGINAL_SLOT_RENDERERS = [
  "original-shell",
  "original-opening",
  "original-lobby",
  "original-question",
  "original-cards",
  "original-voting",
  "original-timer",
  "original-lock",
  "original-results",
  "original-leaderboard",
  "original-rank",
  "original-transition",
  "original-interlude",
  "original-closing",
  "original-personal-result"
];
var ORIGINAL_THEME_STYLES = [
  {
    id: "royal-quiz",
    background: "#080f25",
    panel: "#192a4c",
    accent: "#eecb77",
    secondary: "#87bce4",
    foreground: "#fff8e8",
    names: [
      "Royal Quiz",
      "Quiz royal",
      "K\xF6nigliches Quiz",
      "Concurso real",
      "Quiz reale",
      "\u30ED\u30A4\u30E4\u30EB\u30AF\u30A4\u30BA",
      "Kraliyet Bilgi Yar\u0131\u015Fmas\u0131",
      "\u0110\u1ED1 vui ho\xE0ng gia",
      "\u05D7\u05D9\u05D3\u05D5\u05DF \u05DE\u05DC\u05DB\u05D5\u05EA\u05D9"
    ],
    descriptions: [
      "A midnight theatre with golden answer rails, a central clock and a ceremonial podium.",
      "Un th\xE9\xE2tre de minuit, des r\xE9ponses dor\xE9es, une horloge centrale et un podium de c\xE9r\xE9monie.",
      "Ein Mitternachtstheater mit goldenen Antwortleisten, zentraler Uhr und feierlichem Podium.",
      "Un teatro nocturno con respuestas doradas, reloj central y podio ceremonial.",
      "Un teatro notturno con risposte dorate, orologio centrale e podio da cerimonia.",
      "\u91D1\u8272\u306E\u56DE\u7B54\u30EC\u30FC\u30EB\u3001\u4E2D\u592E\u306E\u6642\u8A08\u3001\u83EF\u3084\u304B\u306A\u8868\u5F70\u53F0\u3092\u5099\u3048\u305F\u591C\u306E\u5287\u5834\u3002",
      "Alt\u0131n yan\u0131t \u015Feritleri, merkezi saat ve t\xF6ren k\xFCrs\xFCs\xFCyle bir gece tiyatrosu.",
      "S\xE2n kh\u1EA5u \u0111\xEAm v\u1EDBi khung tr\u1EA3 l\u1EDDi \xE1nh v\xE0ng, \u0111\u1ED3ng h\u1ED3 trung t\xE2m v\xE0 b\u1EE5c vinh danh.",
      "\u05D1\u05DE\u05D4 \u05D1\u05DB\u05D7\u05D5\u05DC \u05E2\u05DE\u05D5\u05E7, \u05DE\u05E1\u05D2\u05E8\u05D5\u05EA \u05EA\u05E9\u05D5\u05D1\u05D4 \u05DE\u05D5\u05D6\u05D4\u05D1\u05D5\u05EA, \u05E9\u05E2\u05D5\u05DF \u05DE\u05E8\u05DB\u05D6\u05D9 \u05D5\u05E4\u05D5\u05D3\u05D9\u05D5\u05DD \u05D7\u05D2\u05D9\u05D2\u05D9."
    ]
  },
  {
    id: "neon-arcade",
    background: "#090c24",
    panel: "#16123a",
    accent: "#67f5e0",
    secondary: "#f582df",
    foreground: "#f2fffd",
    names: [
      "Neon Arcade",
      "Arcade n\xE9on",
      "Neon-Arcade",
      "Arcade ne\xF3n",
      "Arcade neon",
      "\u30CD\u30AA\u30F3\u30A2\u30FC\u30B1\u30FC\u30C9",
      "Neon Atari",
      "Arcade neon",
      "\u05D0\u05E8\u05E7\u05D9\u05D9\u05D3 \u05E0\u05D9\u05D0\u05D5\u05DF"
    ],
    descriptions: [
      "An arcade cabinet with luminous lanes, pixel displays and precise electronic reveals.",
      "Une borne d\u2019arcade aux pistes lumineuses, affichages pixel et r\xE9v\xE9lations \xE9lectroniques.",
      "Ein Arcade-Automat mit leuchtenden Bahnen, Pixelanzeigen und elektronischen Enth\xFCllungen.",
      "Una m\xE1quina arcade con carriles luminosos, pantallas de p\xEDxeles y revelaciones electr\xF3nicas.",
      "Un cabinato arcade con corsie luminose, display a pixel e rivelazioni elettroniche.",
      "\u5149\u308B\u30EC\u30FC\u30F3\u3001\u30D4\u30AF\u30BB\u30EB\u8868\u793A\u3001\u96FB\u5B50\u7684\u306A\u6F14\u51FA\u3092\u5099\u3048\u305F\u30A2\u30FC\u30B1\u30FC\u30C9\u7B50\u4F53\u3002",
      "I\u015F\u0131kl\u0131 yollar, piksel ekranlar ve elektronik a\xE7\u0131l\u0131\u015Flarla bir atari kabini.",
      "M\xE1y arcade v\u1EDBi l\xE0n s\xE1ng, m\xE0n h\xECnh \u0111i\u1EC3m \u1EA3nh v\xE0 hi\u1EC7u \u1EE9ng c\xF4ng b\u1ED1 \u0111i\u1EC7n t\u1EED.",
      "\u05D0\u05E8\u05D5\u05DF \u05D0\u05E8\u05E7\u05D9\u05D9\u05D3 \u05E2\u05DD \u05DE\u05E1\u05DC\u05D5\u05DC\u05D9\u05DD \u05DE\u05D5\u05D0\u05E8\u05D9\u05DD, \u05EA\u05E6\u05D5\u05D2\u05D5\u05EA \u05E4\u05D9\u05E7\u05E1\u05DC \u05D5\u05D7\u05E9\u05D9\u05E4\u05D5\u05EA \u05D0\u05DC\u05E7\u05D8\u05E8\u05D5\u05E0\u05D9\u05D5\u05EA \u05DE\u05D3\u05D5\u05D9\u05E7\u05D5\u05EA."
    ]
  },
  {
    id: "retro-tv",
    background: "#29241f",
    panel: "#483125",
    accent: "#ffd78a",
    secondary: "#91c4b0",
    foreground: "#fff3d8",
    names: [
      "Retro TV",
      "T\xE9l\xE9 r\xE9tro",
      "Retro-TV",
      "Televisi\xF3n retro",
      "TV r\xE9tro",
      "\u30EC\u30C8\u30ED\u30C6\u30EC\u30D3",
      "Retro TV",
      "Truy\u1EC1n h\xECnh c\u1ED5 \u0111i\u1EC3n",
      "\u05D8\u05DC\u05D5\u05D5\u05D9\u05D6\u05D9\u05D9\u05EA \u05E8\u05D8\u05E8\u05D5"
    ],
    descriptions: [
      "A warm television set with rounded picture tubes, mechanical answer flaps and studio lights.",
      "Un t\xE9l\xE9viseur chaleureux, des \xE9crans arrondis, des volets m\xE9caniques et des lumi\xE8res de studio.",
      "Ein warmer Fernseher mit runden Bildr\xF6hren, mechanischen Antworttafeln und Studiolichtern.",
      "Un televisor c\xE1lido con pantallas redondeadas, paneles mec\xE1nicos y luces de estudio.",
      "Un televisore caldo con schermi arrotondati, pannelli meccanici e luci da studio.",
      "\u4E38\u3044\u30D6\u30E9\u30A6\u30F3\u7BA1\u3001\u6A5F\u68B0\u5F0F\u306E\u56DE\u7B54\u30D1\u30CD\u30EB\u3001\u30B9\u30BF\u30B8\u30AA\u7167\u660E\u304C\u6E29\u304B\u304F\u5F69\u308B\u30C6\u30EC\u30D3\u3002",
      "Yuvarlak ekranlar, mekanik yan\u0131t panolar\u0131 ve st\xFCdyo \u0131\u015F\u0131klar\u0131yla s\u0131cak bir televizyon.",
      "Tivi t\xF4ng \u1EA5m v\u1EDBi m\xE0n h\xECnh bo tr\xF2n, b\u1EA3ng l\u1EADt c\xE2u tr\u1EA3 l\u1EDDi v\xE0 \u0111\xE8n tr\u01B0\u1EDDng quay.",
      "\u05D0\u05D5\u05DC\u05E4\u05DF \u05D7\u05DE\u05D9\u05DD \u05E2\u05DD \u05DE\u05E1\u05DB\u05D9 \u05D8\u05DC\u05D5\u05D5\u05D9\u05D6\u05D9\u05D4 \u05DE\u05E2\u05D5\u05D2\u05DC\u05D9\u05DD, \u05DC\u05D5\u05D7\u05D5\u05EA \u05EA\u05E9\u05D5\u05D1\u05D4 \u05DE\u05EA\u05D4\u05E4\u05DB\u05D9\u05DD \u05D5\u05EA\u05D0\u05D5\u05E8\u05EA \u05D0\u05D5\u05DC\u05E4\u05DF."
    ]
  },
  {
    id: "magic-storybook",
    background: "#102d2a",
    panel: "#244b40",
    accent: "#f4d58d",
    secondary: "#bbd9c7",
    foreground: "#fff6de",
    names: [
      "Magic Storybook",
      "Livre enchant\xE9",
      "Zauberhaftes M\xE4rchenbuch",
      "Libro encantado",
      "Libro incantato",
      "\u9B54\u6CD5\u306E\u7D75\u672C",
      "Sihirli Masal Kitab\u0131",
      "S\xE1ch truy\u1EC7n k\u1EF3 di\u1EC7u",
      "\u05E1\u05E4\u05E8 \u05D4\u05E1\u05D9\u05E4\u05D5\u05E8\u05D9\u05DD \u05D4\u05E7\u05E1\u05D5\u05DD"
    ],
    descriptions: [
      "An open illustrated book with chapter ribbons, parchment choices and gentle page turns.",
      "Un livre illustr\xE9 ouvert, des rubans de chapitre, des choix sur parchemin et des pages douces.",
      "Ein offenes Bilderbuch mit Kapitelb\xE4ndern, Pergamentantworten und sanften Seitenwechseln.",
      "Un libro ilustrado abierto con cintas de cap\xEDtulo, opciones de pergamino y p\xE1ginas suaves.",
      "Un libro illustrato aperto con nastri dei capitoli, scelte su pergamena e pagine delicate.",
      "\u7AE0\u306E\u30EA\u30DC\u30F3\u3001\u7F8A\u76AE\u7D19\u306E\u9078\u629E\u80A2\u3001\u3084\u3055\u3057\u3044\u30DA\u30FC\u30B8\u3081\u304F\u308A\u306E\u3042\u308B\u958B\u3044\u305F\u7D75\u672C\u3002",
      "B\xF6l\xFCm kurdeleleri, par\u015F\xF6men se\xE7enekleri ve yumu\u015Fak sayfa ge\xE7i\u015Fleriyle a\xE7\u0131k bir masal kitab\u0131.",
      "S\xE1ch minh h\u1ECDa m\u1EDF v\u1EDBi d\u1EA3i ch\u01B0\u01A1ng, l\u1EF1a ch\u1ECDn tr\xEAn gi\u1EA5y c\u1ED5 v\xE0 trang l\u1EADt nh\u1EB9 nh\xE0ng.",
      "\u05E1\u05E4\u05E8 \u05DE\u05D0\u05D5\u05D9\u05E8 \u05E4\u05EA\u05D5\u05D7 \u05E2\u05DD \u05E1\u05E8\u05D8\u05D9 \u05E4\u05E8\u05E7\u05D9\u05DD, \u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05E2\u05DC \u05D3\u05E4\u05D9 \u05E7\u05DC\u05E3 \u05D5\u05DE\u05E2\u05D1\u05E8\u05D9 \u05E2\u05DE\u05D5\u05D3\u05D9\u05DD \u05E2\u05D3\u05D9\u05E0\u05D9\u05DD."
    ]
  },
  {
    id: "crystal-future",
    background: "#0a2238",
    panel: "#21465d",
    accent: "#9beaf4",
    secondary: "#c7baf6",
    foreground: "#f4fcff",
    names: [
      "Crystal Future",
      "Futur de cristal",
      "Kristallzukunft",
      "Futuro de cristal",
      "Futuro di cristallo",
      "\u30AF\u30EA\u30B9\u30BF\u30EB\u30D5\u30E5\u30FC\u30C1\u30E3\u30FC",
      "Kristal Gelecek",
      "T\u01B0\u01A1ng lai pha l\xEA",
      "\u05E2\u05EA\u05D9\u05D3 \u05E7\u05E8\u05D9\u05E1\u05D8\u05DC\u05D9"
    ],
    descriptions: [
      "A quiet observatory of floating glass panels, orbital timing and luminous ranked columns.",
      "Un observatoire calme, des panneaux de verre flottants, une horloge orbitale et des colonnes lumineuses.",
      "Ein ruhiges Observatorium mit schwebenden Glastafeln, orbitaler Uhr und leuchtenden Rangs\xE4ulen.",
      "Un observatorio sereno con paneles de cristal, reloj orbital y columnas luminosas de clasificaci\xF3n.",
      "Un osservatorio calmo con pannelli di vetro, orologio orbitale e colonne luminose della classifica.",
      "\u6D6E\u304B\u3076\u30AC\u30E9\u30B9\u30D1\u30CD\u30EB\u3001\u8ECC\u9053\u6642\u8A08\u3001\u5149\u308B\u30E9\u30F3\u30AD\u30F3\u30B0\u67F1\u304C\u4E26\u3076\u9759\u304B\u306A\u89B3\u6E2C\u6240\u3002",
      "Y\xFCzen cam paneller, y\xF6r\xFCngesel saat ve \u0131\u015F\u0131kl\u0131 s\u0131ralama s\xFCtunlar\u0131yla sakin bir g\xF6zlemevi.",
      "\u0110\xE0i quan s\xE1t y\xEAn t\u0129nh v\u1EDBi b\u1EA3ng k\xEDnh n\u1ED5i, \u0111\u1ED3ng h\u1ED3 qu\u1EF9 \u0111\u1EA1o v\xE0 c\u1ED9t x\u1EBFp h\u1EA1ng ph\xE1t s\xE1ng.",
      "\u05DE\u05E6\u05E4\u05D4 \u05E9\u05E7\u05D8 \u05E2\u05DD \u05DC\u05D5\u05D7\u05D5\u05EA \u05D6\u05DB\u05D5\u05DB\u05D9\u05EA \u05DE\u05E8\u05D7\u05E4\u05D9\u05DD, \u05E9\u05E2\u05D5\u05DF \u05DE\u05E1\u05DC\u05D5\u05DC\u05D9 \u05D5\u05E2\u05DE\u05D5\u05D3\u05D5\u05EA \u05D3\u05D9\u05E8\u05D5\u05D2 \u05DE\u05D5\u05D0\u05E8\u05D5\u05EA."
    ]
  },
  {
    id: "carnival-pop",
    background: "#321d43",
    panel: "#61355a",
    accent: "#ffe392",
    secondary: "#7fe2d0",
    foreground: "#fff9ec",
    names: [
      "Carnival Pop",
      "Carnaval pop",
      "Karneval Pop",
      "Carnaval pop",
      "Carnevale pop",
      "\u30AB\u30FC\u30CB\u30D0\u30EB\u30DD\u30C3\u30D7",
      "Renkli Karnaval",
      "L\u1EC5 h\u1ED9i s\u1EAFc m\xE0u",
      "\u05E7\u05E8\u05E0\u05D1\u05DC \u05E6\u05D1\u05E2\u05D5\u05E0\u05D9"
    ],
    descriptions: [
      "A joyful fairground with ticket-shaped answers, striped marquees and playful rosette awards.",
      "Une f\xEAte joyeuse avec des r\xE9ponses en tickets, des chapiteaux ray\xE9s et des cocardes color\xE9es.",
      "Ein fr\xF6hlicher Jahrmarkt mit Ticket-Antworten, gestreiften Zelten und bunten Auszeichnungen.",
      "Una feria alegre con respuestas en forma de entrada, carpas a rayas y premios de roseta.",
      "Una fiera allegra con risposte a biglietto, tendoni a righe e premi a coccarda.",
      "\u30C1\u30B1\u30C3\u30C8\u578B\u306E\u56DE\u7B54\u3001\u30B9\u30C8\u30E9\u30A4\u30D7\u306E\u5929\u5E55\u3001\u697D\u3057\u3044\u30ED\u30BC\u30C3\u30C8\u8CDE\u304C\u3042\u308B\u304A\u796D\u308A\u5E83\u5834\u3002",
      "Bilet bi\xE7imli yan\u0131tlar, \xE7izgili \xE7ad\u0131rlar ve rozet \xF6d\xFClleriyle ne\u015Feli bir panay\u0131r.",
      "H\u1ED9i ch\u1EE3 vui nh\u1ED9n v\u1EDBi c\xE2u tr\u1EA3 l\u1EDDi h\xECnh v\xE9, l\u1EC1u s\u1ECDc v\xE0 ph\u1EA7n th\u01B0\u1EDFng hoa h\u1ED3ng.",
      "\u05D9\u05E8\u05D9\u05D3 \u05E9\u05DE\u05D7 \u05E2\u05DD \u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05D1\u05E6\u05D5\u05E8\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05DD, \u05D0\u05D5\u05D4\u05DC\u05D9\u05DD \u05DE\u05E4\u05D5\u05E1\u05E4\u05E1\u05D9\u05DD \u05D5\u05E2\u05D9\u05D8\u05D5\u05E8\u05D9 \u05D6\u05DB\u05D9\u05D9\u05D4 \u05E6\u05D1\u05E2\u05D5\u05E0\u05D9\u05D9\u05DD."
    ]
  },
  {
    id: "sports-arena",
    background: "#0d192c",
    panel: "#1c3651",
    accent: "#a8e5ee",
    secondary: "#ffb29a",
    foreground: "#f5fbff",
    names: [
      "Sports Arena",
      "Ar\xE8ne sportive",
      "Sportarena",
      "Arena deportiva",
      "Arena sportiva",
      "\u30B9\u30DD\u30FC\u30C4\u30A2\u30EA\u30FC\u30CA",
      "Spor Arenas\u0131",
      "\u0110\u1EA5u tr\u01B0\u1EDDng th\u1EC3 thao",
      "\u05D6\u05D9\u05E8\u05EA \u05D4\u05D0\u05DC\u05D5\u05E4\u05D9\u05DD"
    ],
    descriptions: [
      "A broadcast arena with a scoreboard rail, opposing answer banks and championship podiums.",
      "Une ar\xE8ne t\xE9l\xE9vis\xE9e avec tableau de scores, r\xE9ponses face \xE0 face et podiums de championnat.",
      "Eine TV-Arena mit Ergebnisleiste, gegen\xFCberliegenden Antwortb\xE4nken und Siegerpodesten.",
      "Una arena televisiva con marcador, bancos de respuestas enfrentados y podios de campeonato.",
      "Un\u2019arena televisiva con tabellone, banchi di risposte contrapposti e podi da campionato.",
      "\u30B9\u30B3\u30A2\u30DC\u30FC\u30C9\u3001\u5411\u304B\u3044\u5408\u3046\u56DE\u7B54\u30D0\u30F3\u30AF\u3001\u512A\u52DD\u8868\u5F70\u53F0\u3092\u5099\u3048\u305F\u653E\u9001\u30A2\u30EA\u30FC\u30CA\u3002",
      "Skor \u015Feridi, kar\u015F\u0131l\u0131kl\u0131 yan\u0131t alanlar\u0131 ve \u015Fampiyonluk k\xFCrs\xFCleriyle bir yay\u0131n arenas\u0131.",
      "\u0110\u1EA5u tr\u01B0\u1EDDng truy\u1EC1n h\xECnh v\u1EDBi thanh \u0111i\u1EC3m, hai d\xE3y tr\u1EA3 l\u1EDDi \u0111\u1ED1i di\u1EC7n v\xE0 b\u1EE5c v\xF4 \u0111\u1ECBch.",
      "\u05D6\u05D9\u05E8\u05EA \u05E9\u05D9\u05D3\u05D5\u05E8 \u05E2\u05DD \u05DC\u05D5\u05D7 \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA, \u05D8\u05D5\u05E8\u05D9 \u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05DE\u05E9\u05E0\u05D9 \u05D4\u05E6\u05D3\u05D3\u05D9\u05DD \u05D5\u05E4\u05D5\u05D3\u05D9\u05D5\u05DD \u05D0\u05DC\u05D9\u05E4\u05D5\u05EA."
    ]
  },
  {
    id: "mystery-noir",
    background: "#191d24",
    panel: "#30323b",
    accent: "#e3bc85",
    secondary: "#aebfd1",
    foreground: "#fff6e8",
    names: [
      "Mystery Noir",
      "Myst\xE8re noir",
      "Noir-R\xE4tsel",
      "Misterio noir",
      "Mistero noir",
      "\u30DF\u30B9\u30C6\u30EA\u30FC\u30CE\u30EF\u30FC\u30EB",
      "Kara Gizem",
      "B\xED \u1EA9n noir",
      "\u05EA\u05E2\u05DC\u05D5\u05DE\u05D4 \u05D1\u05D0\u05D5\u05E8 \u05E2\u05DE\u05D5\u05DD"
    ],
    descriptions: [
      "A cinematic case board with brass dossier tabs, evidence cards and a restrained spotlight reveal.",
      "Un tableau d\u2019enqu\xEAte avec onglets en laiton, cartes d\u2019indices et r\xE9v\xE9lations sous projecteur.",
      "Eine filmische Ermittlungswand mit Messingregistern, Beweiskarten und gezielten Lichtenth\xFCllungen.",
      "Un tablero de investigaci\xF3n con pesta\xF1as de lat\xF3n, pistas y revelaciones bajo un foco.",
      "Una bacheca investigativa con schede in ottone, indizi e rivelazioni sotto un riflettore.",
      "\u771F\u936E\u306E\u30D5\u30A1\u30A4\u30EB\u30BF\u30D6\u3001\u8A3C\u62E0\u30AB\u30FC\u30C9\u3001\u63A7\u3048\u3081\u306A\u30B9\u30DD\u30C3\u30C8\u30E9\u30A4\u30C8\u6F14\u51FA\u306E\u3042\u308B\u635C\u67FB\u30DC\u30FC\u30C9\u3002",
      "Pirin\xE7 dosya sekmeleri, kan\u0131t kartlar\u0131 ve \xF6l\xE7\xFCl\xFC spot \u0131\u015F\u0131\u011F\u0131yla sinematik bir soru\u015Fturma panosu.",
      "B\u1EA3ng \u0111i\u1EC1u tra \u0111i\u1EC7n \u1EA3nh v\u1EDBi nh\xE3n \u0111\u1ED3ng, th\u1EBB ch\u1EE9ng c\u1EE9 v\xE0 m\xE0n c\xF4ng b\u1ED1 d\u01B0\u1EDBi \xE1nh \u0111\xE8n d\u1ECBu.",
      "\u05DC\u05D5\u05D7 \u05D7\u05E7\u05D9\u05E8\u05D4 \u05E7\u05D5\u05DC\u05E0\u05D5\u05E2\u05D9 \u05E2\u05DD \u05DC\u05E9\u05D5\u05E0\u05D9\u05D5\u05EA \u05E0\u05D7\u05D5\u05E9\u05EA, \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 \u05E8\u05DE\u05D6\u05D9\u05DD \u05D5\u05D7\u05E9\u05D9\u05E4\u05D5\u05EA \u05D1\u05D0\u05D5\u05E8 \u05DE\u05DE\u05D5\u05E7\u05D3."
    ]
  }
];

// extensions/src/core/show-themes/definition.ts
var TRUSTED_THEME_RENDERERS = [
  "tadazz-classic-stage",
  "razzia-native-stage",
  "tadazz-sandbox-stage",
  "tadazz-original-stage"
];
var TRUSTED_SLOT_RENDERERS = [
  "classic-shell",
  "classic-opening",
  "classic-lobby",
  "classic-question",
  "classic-cards",
  "classic-voting",
  "classic-timer",
  "classic-lock",
  "classic-results",
  "classic-leaderboard",
  "classic-rank",
  "classic-zz",
  "classic-interlude",
  "classic-closing",
  "classic-personal-result"
];
var id = z4.string().min(1).max(160).regex(/^[a-zA-Z0-9._-]+$/u);
var variant = z4.strictObject({
  id,
  labelKey: z4.string().min(1).max(160),
  rendererId: z4.enum([...TRUSTED_SLOT_RENDERERS, ...ORIGINAL_SLOT_RENDERERS]),
  backgroundAssetId: id.optional(),
  logoAssetId: id.optional(),
  mediaAssetId: id.optional(),
  overlayAssetId: id.optional(),
  animationId: id.optional()
});
var slot = z4.strictObject({
  defaultVariantId: id,
  variants: z4.array(variant).min(1).max(32),
  customMedia: z4.enum(["none", "background", "foreground"]).default("none")
});
var audioVariant = z4.strictObject({
  id,
  labelKey: z4.string().min(1).max(160),
  assetId: id.optional(),
  inheritPlatform: z4.boolean().optional(),
  silent: z4.boolean(),
  volume: z4.number().min(0).max(1),
  loop: z4.boolean(),
  priority: z4.number().int().min(0).max(100),
  fadeMs: z4.number().int().min(0).max(5e3),
  restart: z4.enum(["epoch", "event", "continuous"]),
  roles: z4.array(z4.enum(SHOW_THEME_ROLES)).min(1).max(3)
});
var audioEvent = z4.strictObject({
  defaultVariantId: id,
  variants: z4.array(audioVariant).min(1).max(32),
  customMedia: z4.boolean()
});
var asset = z4.strictObject({
  id,
  url: themeAssetUrlSchema,
  kind: z4.enum(["image", "video", "lottie", "audio"]),
  sha256: z4.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z4.number().int().positive().max(1e8),
  provenance: z4.string().min(1).max(1e3),
  rights: z4.enum(["repository-existing", "licensed", "owner-authorized"]),
  preload: z4.enum(["critical", "slot"])
});
var color = z4.string().regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/u);
var SHOW_THEME_LOCALES = [
  "en",
  "fr",
  "de",
  "es",
  "it",
  "ja",
  "tr",
  "vi",
  "he"
];
var localizedLabels = z4.record(
  z4.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/u),
  z4.string().min(1).max(1e3)
).refine((value) => Object.keys(value).length <= 1200);
var localizations = z4.strictObject({
  en: localizedLabels,
  fr: localizedLabels,
  de: localizedLabels,
  es: localizedLabels,
  it: localizedLabels,
  ja: localizedLabels,
  tr: localizedLabels,
  vi: localizedLabels,
  he: localizedLabels.optional()
});
var showThemeDefinitionSchema = z4.strictObject({
  manifestVersion: z4.literal(1),
  id: themeIdSchema,
  version: themeVersionSchema,
  nameKey: z4.string().min(1).max(160),
  descriptionKey: z4.string().min(1).max(160),
  localizations: localizations.optional(),
  category: z4.literal("show"),
  kind: z4.enum(["declarative", "code-backed", "sandboxed-react"]),
  sandbox: sandboxDefinitionSchema.optional(),
  runtime: runtimePinSchema.optional(),
  rendererApiVersion: z4.literal(1),
  rendererId: z4.enum(TRUSTED_THEME_RENDERERS),
  posterAssetId: id,
  provenance: z4.string().min(1).max(1e3),
  adapterAssets: z4.strictObject({
    questionBackdrop: id,
    showBackdrop: id,
    brandLogo: id
  }),
  capabilities: z4.strictObject({
    playModes: z4.array(z4.enum(["quiz", "survey"])).min(1),
    questionTypes: z4.array(z4.enum(["single", "multi", "estimation"])).min(1),
    roles: z4.array(z4.enum(SHOW_THEME_ROLES)).min(1).max(3),
    minAnswers: z4.number().int().min(2),
    maxAnswers: z4.number().int().min(5).max(64),
    reducedMotion: z4.literal("same-theme-static"),
    animationPresets: z4.array(id).min(1).max(32)
  }),
  tokens: z4.strictObject({
    background: color,
    foreground: color,
    accent: color,
    fontId: z4.enum(["rubik", "goldy-canonical"]),
    stageAspect: z4.literal("16:9"),
    imageSizing: z4.enum(["square-contain", "square-cover"]),
    palette: z4.strictObject({
      night: color,
      purple: color,
      violet: color,
      pink: color,
      blue: color,
      royal: color,
      lime: color,
      gold: color,
      cream: color,
      ink: color
    }),
    effects: z4.enum(["goldy-canonical-v4", "original-theme-v1"]),
    contrast: z4.literal("light-on-dark-with-selected-outline")
  }),
  slots: z4.record(z4.enum(SHOW_THEME_SLOTS), slot),
  audioEvents: z4.record(z4.enum(SHOW_THEME_AUDIO_EVENTS), audioEvent),
  choreographyCues: z4.record(
    id,
    z4.strictObject({
      event: z4.enum(SHOW_THEME_AUDIO_EVENTS),
      variantId: id
    })
  ).refine((value) => Object.keys(value).length <= 64),
  assets: z4.array(asset).min(1).max(256)
}).superRefine((theme, ctx) => {
  if (theme.rendererId === "tadazz-original-stage" && (!isOriginalThemeId(theme.id) || theme.version !== "1.0.0" || theme.kind !== "code-backed")) {
    ctx.addIssue({
      code: "custom",
      message: "Original Tadazz renderers are finite compiled first-party families",
      path: ["rendererId"]
    });
  }
  if (theme.kind === "sandboxed-react" !== (theme.rendererId === "tadazz-sandbox-stage") || theme.kind === "sandboxed-react" !== Boolean(theme.sandbox) || theme.runtime && !theme.sandbox) {
    ctx.addIssue({
      code: "custom",
      message: "Sandbox descriptor/renderer mismatch",
      path: ["sandbox"]
    });
  }
  if (theme.rendererId === "razzia-native-stage" && (theme.id !== "razzia-original" || theme.version !== "1.0.0" || theme.kind !== "code-backed")) {
    ctx.addIssue({
      code: "custom",
      message: "Native Razzia renderer is a compiled bundled family",
      path: ["rendererId"]
    });
  }
  if (new TextEncoder().encode(JSON.stringify(theme)).byteLength > 1e5) {
    ctx.addIssue({
      code: "custom",
      message: "Theme metadata exceeds runtime budget",
      path: []
    });
  }
  if (theme.localizations) {
    const keys = [
      theme.nameKey,
      theme.descriptionKey,
      ...Object.values(theme.slots).flatMap(
        (slotDefinition) => slotDefinition.variants.map((choice) => choice.labelKey)
      ),
      ...Object.values(theme.audioEvents).flatMap(
        (event) => event.variants.map((choice) => choice.labelKey)
      )
    ];
    for (const locale of SHOW_THEME_LOCALES) {
      const labels = theme.localizations[locale];
      if (!labels) {
        continue;
      }
      for (const key of keys) {
        if (!labels[key]) {
          ctx.addIssue({
            code: "custom",
            message: "Missing localized theme label",
            path: ["localizations", locale, key]
          });
        }
      }
    }
  }
  const assetIds = new Set(theme.assets.map((a) => a.id));
  const variantIds = /* @__PURE__ */ new Set();
  for (const item of theme.assets) {
    const extension = new URL(item.url, "https://theme.invalid").pathname.split(".").at(-1)?.toLowerCase();
    const allowed = {
      image: ["png", "jpg", "jpeg", "webp", "gif", "avif"],
      video: ["mp4", "webm"],
      audio: ["mp3", "wav", "ogg", "m4a"],
      lottie: ["json", "lottie"]
    };
    if (!extension || !allowed[item.kind].includes(extension)) {
      ctx.addIssue({
        code: "custom",
        message: "Asset kind does not match extension",
        path: ["assets", item.id]
      });
    }
  }
  for (const [name, cue] of Object.entries(theme.choreographyCues)) {
    if (!theme.audioEvents[cue.event].variants.some(
      (choice) => choice.id === cue.variantId
    )) {
      ctx.addIssue({
        code: "custom",
        message: "Choreography cue references an unapproved event variant",
        path: ["choreographyCues", name]
      });
    }
  }
  if (assetIds.size !== theme.assets.length) {
    ctx.addIssue({
      code: "custom",
      message: "Duplicate asset ID",
      path: ["assets"]
    });
  }
  if (!assetIds.has(theme.posterAssetId)) {
    ctx.addIssue({
      code: "custom",
      message: "Missing poster asset",
      path: ["posterAssetId"]
    });
  }
  for (const ref of Object.values(theme.adapterAssets)) {
    if (!assetIds.has(ref)) {
      ctx.addIssue({
        code: "custom",
        message: "Missing adapter asset",
        path: ["adapterAssets"]
      });
    }
  }
  const groups = [
    ["slots", theme.slots],
    ["audioEvents", theme.audioEvents]
  ];
  for (const [group, entries] of groups) {
    for (const [key, entry] of Object.entries(entries)) {
      if (!entry.variants.some((v) => v.id === entry.defaultVariantId)) {
        ctx.addIssue({
          code: "custom",
          message: "Missing default variant",
          path: [group, key]
        });
      }
      for (const choice of entry.variants) {
        if ("rendererId" in choice) {
          const slotIndex = SHOW_THEME_SLOTS.indexOf(
            key
          );
          const slotRenderers = theme.rendererId === "tadazz-original-stage" ? ORIGINAL_SLOT_RENDERERS : TRUSTED_SLOT_RENDERERS;
          if (choice.rendererId !== slotRenderers[slotIndex]) {
            ctx.addIssue({
              code: "custom",
              message: "Renderer does not support this slot",
              path: [group, key]
            });
          }
          for (const ref of [choice.backgroundAssetId, choice.logoAssetId]) {
            if (ref && theme.assets.find(
              (referencedAsset) => referencedAsset.id === ref
            )?.kind !== "image") {
              ctx.addIssue({
                code: "custom",
                message: "Backdrop/logo must reference an image",
                path: [group, key]
              });
            }
          }
          if (choice.overlayAssetId && theme.assets.find(
            (referencedAsset) => referencedAsset.id === choice.overlayAssetId
          )?.kind !== "lottie") {
            ctx.addIssue({
              code: "custom",
              message: "Overlay must reference Lottie",
              path: [group, key]
            });
          }
          if (key === "opening" && choice.mediaAssetId && theme.assets.find(
            (referencedAsset) => referencedAsset.id === choice.mediaAssetId
          )?.kind !== "video") {
            ctx.addIssue({
              code: "custom",
              message: "Opening media must reference video",
              path: [group, key]
            });
          }
        }
        if (!choice.id.startsWith(`${theme.id}.`) || variantIds.has(choice.id)) {
          ctx.addIssue({
            code: "custom",
            message: "Duplicate or cross-theme variant",
            path: [group, key]
          });
        }
        variantIds.add(choice.id);
        const refs = "rendererId" in choice ? [
          choice.backgroundAssetId,
          choice.logoAssetId,
          choice.mediaAssetId,
          choice.overlayAssetId
        ] : [choice.assetId];
        if (refs.some((ref) => ref !== void 0 && !assetIds.has(ref))) {
          ctx.addIssue({
            code: "custom",
            message: "Missing asset reference",
            path: [group, key]
          });
        }
        if ("silent" in choice && (choice.inheritPlatform ? choice.silent || choice.assetId !== void 0 : choice.silent === (choice.assetId !== void 0))) {
          ctx.addIssue({
            code: "custom",
            message: "Audio must inherit the platform, be silent or reference one asset",
            path: [group, key]
          });
        }
        if ("silent" in choice && choice.assetId && theme.assets.find((item) => item.id === choice.assetId)?.kind !== "audio") {
          ctx.addIssue({
            code: "custom",
            message: "Audio variant must reference audio",
            path: [group, key]
          });
        }
      }
    }
  }
});

// extensions/src/core/show-themes/original-themes.ts
var defaultLabels = [
  "Show sound",
  "Son du spectacle",
  "Showklang",
  "Sonido del espect\xE1culo",
  "Suono dello spettacolo",
  "\u30B7\u30E7\u30FC\u306E\u30B5\u30A6\u30F3\u30C9",
  "G\xF6steri sesi",
  "\xC2m thanh ch\u01B0\u01A1ng tr\xECnh",
  "\u05E6\u05DC\u05D9\u05DC\u05D9 \u05D4\u05DE\u05D5\u05E4\u05E2"
];
var silentLabels = [
  "Silent",
  "Silencieux",
  "Stumm",
  "Silencio",
  "Silenzioso",
  "\u7121\u97F3",
  "Sessiz",
  "Im l\u1EB7ng",
  "\u05DC\u05DC\u05D0 \u05E7\u05D5\u05DC"
];
var visualLabels = [
  "Original design",
  "Cr\xE9ation originale",
  "Eigenst\xE4ndiges Design",
  "Dise\xF1o original",
  "Design originale",
  "\u30AA\u30EA\u30B8\u30CA\u30EB\u30C7\u30B6\u30A4\u30F3",
  "\xD6zg\xFCn tasar\u0131m",
  "Thi\u1EBFt k\u1EBF nguy\xEAn b\u1EA3n",
  "\u05E2\u05D9\u05E6\u05D5\u05D1 \u05DE\u05E7\u05D5\u05E8\u05D9"
];
var eventSound = {
  opening: null,
  lobby: null,
  showQuestion: "transition",
  answersMusic: "voting-bed",
  answerSelected: null,
  answerSubmitted: "confirm",
  timerWarning: "tick",
  timerExpired: "timer-end",
  voteLocked: "lock",
  revealResults: "reveal",
  leaderboard: "leaderboard",
  zzTransition: null,
  podium1: "podium",
  podium2: "leaderboard",
  podium3: "reveal",
  closing: "closing"
};
function makeOriginalTheme(style) {
  const theme = showThemeDefinitionSchema.parse(classic_manifest_default);
  const rename = (value) => value.replace(/^tadazz-classic\./u, `${style.id}.`);
  theme.id = style.id;
  theme.version = "1.0.0";
  theme.kind = "code-backed";
  theme.rendererId = "tadazz-original-stage";
  theme.nameKey = `originals:${style.id}.name`;
  theme.descriptionKey = `originals:${style.id}.description`;
  theme.provenance = "Original first-party Tadazz React composition, vector artwork and instrumental synthesis authored for the approved eight-theme collection, 22 November 2026. Shared game state, timing, controls and audio playback remain platform-owned.";
  theme.localizations = showThemeDefinitionSchema.shape.localizations.parse(
    Object.fromEntries(
      SHOW_THEME_LOCALES.map((locale, index) => [
        locale,
        {
          [theme.nameKey]: style.names[index],
          [theme.descriptionKey]: style.descriptions[index],
          "originals:default": defaultLabels[index],
          "originals:silent": silentLabels[index],
          "originals:design": visualLabels[index]
        }
      ])
    )
  );
  theme.tokens = {
    ...theme.tokens,
    background: style.background,
    foreground: style.foreground,
    accent: style.accent,
    fontId: "rubik",
    imageSizing: "square-contain",
    effects: "original-theme-v1",
    palette: {
      night: style.background,
      purple: style.panel,
      violet: style.panel,
      pink: style.secondary,
      blue: style.secondary,
      royal: style.panel,
      lime: style.accent,
      gold: style.accent,
      cream: style.foreground,
      ink: style.background
    }
  };
  theme.capabilities.maxAnswers = 5;
  theme.assets = theme.assets.filter(
    (asset2) => [
      "classic-logo",
      "classic-opening-video",
      "classic-opening-lottie"
    ].includes(asset2.id)
  );
  theme.assets.push(
    ...original_theme_assets_default.filter((asset2) => asset2.family === style.id).map((asset2) => ({
      id: `${style.id}.${asset2.name}`,
      url: asset2.url,
      kind: "image",
      sha256: asset2.sha256,
      bytes: asset2.bytes,
      rights: "owner-authorized",
      provenance: "Original vector geometry authored for this Tadazz family. Reproducible SVG sources and offline Linux rasterization: extensions/qa/original-themes/generate-artwork.ts; no external artwork or fonts downloaded.",
      preload: asset2.name === "backdrop" ? "critical" : "slot"
    }))
  );
  theme.assets.push(
    ...original_audio_assets_default.filter((asset2) => asset2.family === style.id).map((asset2) => ({
      id: `${style.id}.sound.${asset2.name}`,
      url: asset2.url,
      kind: "audio",
      sha256: asset2.sha256,
      bytes: asset2.bytes,
      rights: "owner-authorized",
      provenance: "Original deterministic instrumental synthesis; no samples, speech or third-party recordings. Source: extensions/qa/original-themes/generate-audio.py. Generated on the authorized Linux worker; not a claim of human listening approval.",
      preload: "slot"
    }))
  );
  theme.posterAssetId = `${style.id}.poster`;
  theme.adapterAssets = {
    questionBackdrop: `${style.id}.backdrop`,
    showBackdrop: `${style.id}.backdrop`,
    brandLogo: "classic-logo"
  };
  for (const [index, slotId] of SHOW_THEME_SLOTS.entries()) {
    const slot2 = theme.slots[slotId];
    slot2.defaultVariantId = `${style.id}.${slotId}.default`;
    slot2.variants = [
      {
        id: slot2.defaultVariantId,
        labelKey: "originals:design",
        rendererId: ORIGINAL_SLOT_RENDERERS[index],
        backgroundAssetId: `${style.id}.backdrop`,
        animationId: `${style.id}.${slotId}`,
        ...slotId === "opening" ? {
          logoAssetId: "classic-logo",
          mediaAssetId: "classic-opening-video",
          overlayAssetId: "classic-opening-lottie"
        } : {}
      }
    ];
  }
  for (const [eventId, event] of Object.entries(theme.audioEvents)) {
    const id2 = eventId;
    event.defaultVariantId = rename(event.defaultVariantId);
    for (const variant2 of event.variants) {
      const suffix = variant2.id.split(".").at(-1);
      variant2.id = rename(variant2.id);
      variant2.labelKey = variant2.silent ? "originals:silent" : "originals:default";
      if (id2 === "opening") {
        if (variant2.silent) {
          delete variant2.inheritPlatform;
        } else {
          variant2.inheritPlatform = true;
        }
        delete variant2.assetId;
        continue;
      }
      delete variant2.inheritPlatform;
      let sound = eventSound[id2];
      if (id2 === "lobby" && suffix === "accent") {
        sound = "confirm";
      }
      if (id2 === "timerWarning" && suffix === "urgent") {
        sound = "urgent";
      }
      if (id2 === "timerWarning" && suffix === "final") {
        sound = "final";
      }
      if (id2 === "revealResults") {
        if (suffix === "accent") {
          sound = "reveal";
        }
        if (["music", "fallback", "story-mixer"].includes(suffix ?? "")) {
          sound = "voting-bed";
        }
      }
      if (variant2.silent || !sound) {
        variant2.silent = true;
        variant2.labelKey = "originals:silent";
        delete variant2.assetId;
      } else {
        variant2.assetId = `${style.id}.sound.${sound}`;
        variant2.silent = false;
        const cueVolume = id2 === "timerWarning" ? 0.36 : 0.6;
        variant2.volume = sound === "voting-bed" ? 0.28 : cueVolume;
      }
    }
  }
  for (const cue of Object.values(theme.choreographyCues)) {
    cue.variantId = rename(cue.variantId);
  }
  return showThemeDefinitionSchema.parse(theme);
}
var bundledOriginalThemes = Object.freeze(
  ORIGINAL_THEME_STYLES.map(makeOriginalTheme)
);
export {
  bundledOriginalThemes
};
