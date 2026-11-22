import type { GameSettings } from "@razzia/common/types/game"

export const EVENTS = {
  GAME: {
    STATUS: "game:status",
    SUCCESS_JOIN: "game:successJoin",
    TOTAL_PLAYERS: "game:totalPlayers",
    ERROR_MESSAGE: "game:errorMessage",
    START_COOLDOWN: "game:startCooldown",
    COOLDOWN: "game:cooldown",
    RESET: "game:reset",
    UPDATE_QUESTION: "game:updateQuestion",
    PLAYER_ANSWER: "game:playerAnswer",
  },
  PLAYER: {
    SUCCESS_RECONNECT: "player:successReconnect",
    UPDATE_LEADERBOARD: "player:updateLeaderboard",
    LOGIN: "player:login",
    RECONNECT: "player:reconnect",
    LEAVE: "player:leave",
    SELECTED_ANSWER: "player:selectedAnswer",
  },
  MANAGER: {
    SUCCESS_RECONNECT: "manager:successReconnect",
    STATUS_UPDATE: "manager:statusUpdate",
    NEW_PLAYER: "manager:newPlayer",
    REMOVE_PLAYER: "manager:removePlayer",
    PLAYER_KICKED: "manager:playerKicked",
    PLAYER_UPDATED: "manager:playerUpdated",
    RECONNECT: "manager:reconnect",
    LEAVE: "manager:leave",
    KICK_PLAYER: "manager:kickPlayer",
    START_GAME: "manager:startGame",
    ADVANCE: "manager:advance",
    AUTO_ADVANCE: "manager:autoAdvance",
    SET_LOCK: "manager:setLock",
    LOCK_UPDATED: "manager:lockUpdated",
    HOST_PRESENCE: "manager:hostPresence",
  },
  SPECTATOR: {
    JOIN: "spectator:join",
    LEAVE: "spectator:leave",
    SUCCESS_JOIN: "spectator:successJoin",
  },
  EXTENSIONS: {
    STATE: "extensions:state",
    COMMAND: "extensions:command",
  },
} as const

export const SESSION_ROLES = {
  PLAYER: "player",
  MANAGER: "manager",
  SPECTATOR: "spectator",
} as const

export const NO_TIME_LIMIT = -1

/** System-owned question reading time before answers and voting open together. */
export const QUESTION_LEAD_IN_SECONDS = 2

export const QUESTION_LEAD_IN_MS = QUESTION_LEAD_IN_SECONDS * 1000

export const AUTO_ADVANCE_DELAY = { MIN: 3, MAX: 600 } as const

export const createDefaultGameSettings = (): GameSettings => ({
  generatedUsernames: false,
  answersOnly: false,
  phoneInviteOnly: false,
  endOnAllAnswered: false,
  autoAdvance: {
    enable: false,
    responsesDelay: 10,
    leaderboardDelay: 5,
  },
})

export const MAX_POINTS = 1000

export const MIN_ANSWERS = 2

export const MAX_ANSWERS = 5

export const QUIZZ_MODES = {
  QUIZ: "quiz",
  SURVEY: "survey",
} as const

export const QUESTION_TYPES = {
  SINGLE: "single",
  MULTI: "multi",
  ESTIMATION: "estimation",
} as const

export const ESTIMATION_INPUT_MODES = {
  SLIDER: "slider",
  INPUT: "input",
} as const

export const SCORING_MODES = {
  STRICT: "strict",
  BALANCED: "balanced",
  LENIENT: "lenient",
} as const

export const MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
} as const

export const MEDIA_URL_PREFIX = "/media/"

export const MAX_MEDIA_SIZE = 100 * 1024 * 1024

export const ACCEPTED_MEDIA_TYPES = {
  "image/png": { ext: ".png", type: MEDIA_TYPES.IMAGE },
  "image/jpeg": { ext: ".jpg", type: MEDIA_TYPES.IMAGE },
  "image/webp": { ext: ".webp", type: MEDIA_TYPES.IMAGE },
  "image/gif": { ext: ".gif", type: MEDIA_TYPES.IMAGE },
  "audio/mpeg": { ext: ".mp3", type: MEDIA_TYPES.AUDIO },
  "audio/ogg": { ext: ".ogg", type: MEDIA_TYPES.AUDIO },
  "audio/wav": { ext: ".wav", type: MEDIA_TYPES.AUDIO },
  "video/mp4": { ext: ".mp4", type: MEDIA_TYPES.VIDEO },
  "video/webm": { ext: ".webm", type: MEDIA_TYPES.VIDEO },
} as const

/** Bundled 512px illustration materialized into owner media only on first seed. */
export const EXAMPLE_QUIZZ_IMAGE = {
  name: "tadazz-example-cloud-796dfd8f3dcc.png",
  publicPath: "tadazz-show/gallery/picture-cloud.png",
  sha256: "796dfd8f3dcc5dff7a1f596c01d2eaf62a7c41b5b118f3286fcce9aad0a1e65f",
  bytes: 20139,
} as const

export const EXAMPLE_QUIZZ = {
  gameMode: QUIZZ_MODES.QUIZ,
  subject: "Example Quizz",
  questions: [
    {
      question: "What is good answer ?",
      answers: ["No", "Good answer", "No", "No"],
      solutions: [1],
      cooldown: QUESTION_LEAD_IN_SECONDS,
      time: 15,
    },
    {
      question: "What is good answer with image ?",
      answers: ["No", "No", "No", "Good answer"],
      media: {
        type: MEDIA_TYPES.IMAGE,
        url: `${MEDIA_URL_PREFIX}${EXAMPLE_QUIZZ_IMAGE.name}`,
      },
      solutions: [3],
      cooldown: QUESTION_LEAD_IN_SECONDS,
      time: 20,
    },
    {
      question: "What is good answer with two answers ?",
      answers: ["Good answer", "No"],
      media: {
        type: MEDIA_TYPES.IMAGE,
        url: `${MEDIA_URL_PREFIX}${EXAMPLE_QUIZZ_IMAGE.name}`,
      },
      solutions: [0],
      cooldown: QUESTION_LEAD_IN_SECONDS,
      time: 20,
    },
    {
      question: "Which of these are primary colors ?",
      answers: ["Red", "Green", "Blue", "Yellow"],
      solutions: [0, 2, 3],
      cooldown: QUESTION_LEAD_IN_SECONDS,
      time: 20,
    },
  ],
} as const
