import type { TadaShowV1 } from "../show-authoring-schema"
import { quiz, poll, type Round } from "./public-demo-authoring"
import {
  originalThemeDemoDefinitions,
  originalThemeRounds,
  makeOriginalThemeCards,
} from "./original-theme-demos"
import { isOriginalThemeId } from "../show-themes/original-theme-families"

/** Original, public examples. This catalogue never reads a customer's account. */
export interface PublicDemoMetadata {
  id: string
  title: string
  category: "Trivia" | "Survey" | "Story"
  time: string
  desc: string
  audience: readonly string[]
  themeId: string
  themeName: string
  accent: string
  gradient: string
  visual: string
  questionCount: number
  coverUrl: string
}

export interface PublicDemo {
  metadata: PublicDemoMetadata
  show: TadaShowV1
}

const rounds: Record<string, Round[]> = {
  ...originalThemeRounds,
  "great-guessoff": [
    poll(
      "family-fun",
      "What causes the biggest delay when the whole family is going out?",
      {
        answers: [
          "Getting everyone ready",
          "Finding missing things",
          "Last-minute changes",
          "Actually getting out the door",
        ],
      },
    ),
    quiz("picture-trivia", "Which of these is actually a berry?", {
      answers: ["Banana", "Strawberry", "Raspberry", "Cherry"],
      correct: 1,
      pictures: ["banana", "strawberry", "raspberry", "cherry"].map(
        (name) => `/tadazz-show/great-guessoff/${name}.webp`,
      ),
    }),
    poll(
      "at-work",
      "What's the real reason a five-minute meeting turns into half an hour?",
      {
        answers: [
          "Just one more thing…",
          "Technical problems",
          "Off-topic conversations",
          "Someone arriving late",
        ],
      },
    ),
    quiz("quick-trivia", "How many hearts does an octopus have?", {
      answers: ["One", "Two", "Three", "Four"],
      correct: 3,
    }),
    poll("party-personality", "Which one are YOU at a party?", {
      answers: [
        "The Organiser",
        "The Entertainer",
        "The Photographer",
        "The Snack Hunter",
      ],
      pictures: [
        "organiser",
        "entertainer",
        "photographer",
        "snack-hunter",
      ].map((name) => `/tadazz-show/great-guessoff/${name}.webp`),
    }),
  ],
  crowd: [
    poll("perfect-evening", "You have a completely free evening. What wins?", {
      answers: [
        "A great film",
        "Dinner with friends",
        "A new adventure",
        "Peace and quiet",
      ],
    }),
    poll("secret-superpower", "Which everyday superpower would you choose?", {
      answers: [
        "Never lose your keys",
        "Always find a parking space",
        "Finish the washing instantly",
        "Remember every name",
      ],
    }),
    poll("weekend-plan", "The group has one day together. What should we do?", {
      answers: [
        "Explore somewhere new",
        "Cook a huge meal",
        "Play games all afternoon",
        "Walk and talk",
      ],
    }),
    poll("group-chat", "What is your group-chat personality?", {
      answers: [
        "The planner",
        "The joke supplier",
        "The quick responder",
        "The quiet reader",
      ],
    }),
    poll("small-delight", "Which tiny thing improves your day the most?", {
      answers: [
        "A favourite song",
        "A message from a friend",
        "A delicious snack",
        "Finishing a tricky task",
      ],
    }),
    poll("time-travel", "Which moment would you most like to visit?", {
      answers: [
        "A favourite childhood day",
        "A spectacular future city",
        "An amazing concert",
        "A family celebration",
      ],
    }),
    poll("choose-challenge", "Which challenge would this room enjoy most?", {
      answers: [
        "A team puzzle",
        "A creative invention",
        "A quick-fire quiz",
        "A storytelling challenge",
      ],
    }),
    poll("one-more-round", "We have time for one more thing. You choose!", {
      answers: [
        "One last quiz round",
        "A photo together",
        "A heartfelt thank-you",
        "A victory dance",
      ],
    }),
  ],
  quiz: [
    quiz(
      "wordplay",
      "Which word is a palindrome: the same forwards and backwards?",
      { answers: ["Planet", "Level", "Window", "Silver"], correct: 2 },
    ),
    quiz("number-pattern", "Complete the pattern: 3, 6, 12, 24, …", {
      answers: ["30", "36", "48", "60"],
      correct: 3,
    }),
    quiz("music", "How many strings does a standard violin have?", {
      answers: ["Three", "Four", "Five", "Six"],
      correct: 2,
    }),
    quiz("world", "Which ocean lies between the Americas and Europe?", {
      answers: ["Pacific", "Indian", "Atlantic", "Arctic"],
      correct: 3,
    }),
    quiz("mental-maths", "What is 25% of 240?", {
      answers: ["40", "50", "60", "80"],
      correct: 3,
    }),
    quiz(
      "art",
      "Which pair are complementary colours on a traditional painter's colour wheel?",
      {
        answers: [
          "Red and orange",
          "Blue and green",
          "Yellow and orange",
          "Blue and orange",
        ],
        correct: 4,
      },
    ),
    quiz(
      "calendar-logic",
      "If yesterday was Monday, what day is the day after tomorrow?",
      { answers: ["Wednesday", "Thursday", "Friday", "Saturday"], correct: 2 },
    ),
    quiz("final-code", "AZ, BY, CX, DW… What comes next?", {
      answers: ["EU", "EV", "FU", "EX"],
      correct: 2,
    }),
  ],
  story: [
    poll("hero", "Our story needs a hero. Who will it be?", {
      answers: [
        "A curious inventor",
        "A brave little fox",
        "A friendly cloud",
        "A very polite dragon",
      ],
    }),
    poll("world", "Where does our adventure begin?", {
      answers: [
        "A library in the trees",
        "A village made of boats",
        "A garden on the moon",
        "A castle inside a teapot",
      ],
    }),
    poll("mission", "What important thing has gone missing?", {
      answers: [
        "The town's laughter",
        "A map of secret doors",
        "The colours of the rainbow",
        "A tiny silver bell",
      ],
    }),
    poll("tool", "Our hero can bring one extraordinary tool. Which one?", {
      answers: [
        "A pencil that draws doors",
        "Boots that bounce over rivers",
        "A compass that finds friends",
        "A lantern that tells jokes",
      ],
    }),
    poll("obstacle", "What surprising obstacle appears?", {
      answers: [
        "A bridge that only likes rhymes",
        "A maze of giant flowers",
        "A sleepy mountain",
        "A storm of flying socks",
      ],
    }),
    poll("helper", "Who arrives to help our hero?", {
      answers: [
        "A wise old tortoise",
        "A team of tiny robots",
        "A singing squirrel",
        "A child with a brilliant idea",
      ],
    }),
    poll("solution", "How does everyone solve the problem together?", {
      answers: [
        "They listen carefully",
        "They build something new",
        "They share their best ideas",
        "They try again as a team",
      ],
    }),
    poll("ending", "How should our story end?", {
      answers: [
        "A feast under the stars",
        "A new adventure begins",
        "A surprise thank-you party",
        "Everyone gets a special gift",
      ],
    }),
  ],
  picture: [
    quiz("three-sides", "Which picture has exactly three sides?", {
      answers: ["Triangle", "Circle", "Square", "Star"],
      correct: 1,
      pictures: ["triangle", "circle", "square", "star"],
    }),
    quiz(
      "rainy-day",
      "Which picture shows something you would use in the rain?",
      {
        answers: ["Sun", "Umbrella", "Balloon", "Leaf"],
        correct: 2,
        pictures: ["sun", "umbrella", "balloon", "leaf"],
      },
    ),
    quiz(
      "space-trip",
      "Which picture shows a vehicle designed to travel into space?",
      {
        answers: ["Sailboat", "Bicycle", "Rocket", "Train"],
        correct: 3,
        pictures: ["boat", "bicycle", "rocket", "train"],
      },
    ),
    quiz("plant-part", "Which picture is part of a plant?", {
      answers: ["Star", "Balloon", "Cloud", "Leaf"],
      correct: 4,
      pictures: ["star", "balloon", "cloud", "leaf"],
    }),
    quiz("wheels", "Which vehicle usually has two wheels?", {
      answers: ["Train", "Bicycle", "Sailboat", "Rocket"],
      correct: 2,
      pictures: ["train", "bicycle", "boat", "rocket"],
    }),
    quiz("round-shape", "Which shape has no corners?", {
      answers: ["Square", "Star", "Circle", "Triangle"],
      correct: 3,
      pictures: ["square", "star", "circle", "triangle"],
    }),
    quiz("weather", "Which picture can bring rain?", {
      answers: ["Cloud", "Bicycle", "Star", "Balloon"],
      correct: 1,
      pictures: ["cloud", "bicycle", "star", "balloon"],
    }),
    quiz("sailing", "Which vehicle moves using a sail and the wind?", {
      answers: ["Rocket", "Train", "Bicycle", "Sailboat"],
      correct: 4,
      pictures: ["rocket", "train", "bicycle", "boat"],
    }),
  ],
  truth: [
    quiz("square", "Every square is also a rectangle. Fact or fiction?", {
      answers: ["Fact", "Fiction"],
      correct: 1,
    }),
    quiz(
      "kilogram",
      "One kilogram equals one hundred grams. Fact or fiction?",
      { answers: ["Fact", "Fiction"], correct: 2 },
    ),
    quiz("sun", "The Sun is a star. Fact or fiction?", {
      answers: ["Fact", "Fiction"],
      correct: 1,
    }),
    quiz(
      "sound",
      "Sound can travel through a complete vacuum. Fact or fiction?",
      { answers: ["Fact", "Fiction"], correct: 2 },
    ),
    quiz("ice", "Ice is water in its solid state. Fact or fiction?", {
      answers: ["Fact", "Fiction"],
      correct: 1,
    }),
    quiz("octagon", "An octagon has six sides. Fact or fiction?", {
      answers: ["Fact", "Fiction"],
      correct: 2,
    }),
    quiz(
      "orbit",
      "Earth takes roughly one year to orbit the Sun. Fact or fiction?",
      { answers: ["Fact", "Fiction"], correct: 1 },
    ),
    quiz("negative", "Minus five is greater than minus two. Fact or fiction?", {
      answers: ["Fact", "Fiction"],
      correct: 2,
    }),
  ],
  finale: [
    quiz("opening-code", "The final starts now: what is 7 × 8?", {
      answers: ["48", "54", "56", "64"],
      correct: 3,
    }),
    quiz(
      "double",
      "A team has 18 points and doubles its score. How many points now?",
      { answers: ["20", "28", "36", "38"], correct: 3 },
    ),
    quiz("word", "Which word can follow both 'rain' and 'cross'?", {
      answers: ["Light", "Bow", "Shine", "Coat"],
      correct: 2,
    }),
    quiz("shape", "Which regular shape has five sides?", {
      answers: ["Triangle", "Pentagon", "Hexagon", "Octagon"],
      correct: 2,
    }),
    quiz("letters", "Which letter appears exactly twice in TEAMWORK?", {
      answers: ["T", "E", "M", "None of them"],
      correct: 4,
    }),
    quiz("sequence", "Find the missing number: 1, 4, 9, 16, …", {
      answers: ["20", "24", "25", "32"],
      correct: 3,
    }),
    quiz("finish", "Which is the same as three quarters?", {
      answers: ["25%", "50%", "60%", "75%"],
      correct: 4,
    }),
    quiz(
      "champion",
      "Final answer: what is the sum of the numbers from 1 to 5?",
      { answers: ["10", "12", "15", "20"], correct: 3 },
    ),
  ],
  family: [
    poll("family-day", "The whole family has a free day. What is the plan?", {
      answers: [
        "A picnic adventure",
        "A baking challenge",
        "A games marathon",
        "A trip somewhere new",
      ],
    }),
    quiz("riddle", "I have hands but cannot clap. What am I?", {
      answers: ["A clock", "A chair", "A cloud", "A book"],
      correct: 1,
    }),
    poll("superpower", "Which family superpower would be most useful?", {
      answers: [
        "Finding everything instantly",
        "Making dinner appear",
        "Tidying with a click",
        "Being on time together",
      ],
    }),
    quiz(
      "shared-snack",
      "Four people share 12 biscuits equally. How many does each person get?",
      { answers: ["Two", "Three", "Four", "Six"], correct: 2 },
    ),
    poll("family-role", "Which role would you take on a family adventure?", {
      answers: [
        "Map reader",
        "Snack keeper",
        "Photographer",
        "Chief entertainer",
      ],
    }),
    quiz(
      "rainbow",
      "Which of these is not traditionally named as a rainbow colour?",
      { answers: ["Red", "Green", "Brown", "Violet"], correct: 3 },
    ),
    poll("happy-memory", "What makes the best family memory?", {
      answers: [
        "A shared laugh",
        "Trying something new",
        "A lovely meal",
        "Helping each other",
      ],
    }),
    quiz("riddle-finale", "What gets wetter as it dries you?", {
      answers: ["A sponge", "A towel", "An umbrella", "A raincoat"],
      correct: 2,
    }),
  ],
  classroom: [
    quiz("maths", "What is 8 × 6?", {
      answers: ["42", "46", "48", "56"],
      correct: 3,
    }),
    quiz("language", "Which word is an adjective?", {
      answers: ["Jump", "Quickly", "Bright", "Pencil"],
      correct: 3,
    }),
    quiz("science", "What do plants absorb through their roots?", {
      answers: ["Sunlight", "Water", "Clouds", "Moonlight"],
      correct: 2,
    }),
    quiz("geometry", "How many degrees are there in a right angle?", {
      answers: ["45", "90", "180", "360"],
      correct: 2,
    }),
    quiz("fractions", "Which fraction is equal to one half?", {
      answers: ["2/4", "1/4", "3/4", "4/4"],
      correct: 1,
    }),
    quiz("science-sky", "Which object orbits Earth?", {
      answers: ["The Sun", "Mars", "The Moon", "Venus"],
      correct: 3,
    }),
    quiz("time", "How many minutes are there in an hour and a half?", {
      answers: ["60", "75", "90", "120"],
      correct: 3,
    }),
    poll("reflection", "Which discovery would you like to explore next?", {
      answers: [
        "Space and planets",
        "Animals and nature",
        "Numbers and puzzles",
        "Stories and imagination",
      ],
    }),
  ],
  team: [
    poll("team-strength", "Which strength would you bring to a new project?", {
      answers: [
        "Clear planning",
        "Fresh ideas",
        "Careful attention",
        "Keeping everyone connected",
      ],
    }),
    quiz(
      "project-maths",
      "A project has 20 tasks and 15 are complete. What percentage is finished?",
      { answers: ["25%", "50%", "75%", "90%"], correct: 3 },
    ),
    poll("kick-off", "What helps you most when a team starts something new?", {
      answers: [
        "A clear shared goal",
        "Time to ask questions",
        "Knowing everyone's role",
        "Seeing an example",
      ],
    }),
    quiz("puzzle", "Which comes next: 2, 5, 8, 11, …?", {
      answers: ["12", "13", "14", "15"],
      correct: 3,
    }),
    poll(
      "celebrate",
      "How would you most like the team to celebrate a success?",
      {
        answers: [
          "A shared lunch",
          "Personal thank-you notes",
          "A fun team challenge",
          "Time to reflect together",
        ],
      },
    ),
    quiz(
      "time-zone-free",
      "A meeting starts at 10:15 and lasts 45 minutes. When does it finish?",
      { answers: ["10:45", "11:00", "11:15", "11:30"], correct: 2 },
    ),
    poll("next-step", "What would make our next collaboration even better?", {
      answers: [
        "Clearer priorities",
        "More space for ideas",
        "Faster feedback",
        "More shared learning",
      ],
    }),
    poll("team-word", "Choose one word for the team we want to be.", {
      answers: ["Curious", "Supportive", "Resourceful", "Bold"],
    }),
  ],
}

type Definition = Omit<PublicDemoMetadata, "coverUrl" | "questionCount">
const definitions: Definition[] = [
  {
    id: "great-guessoff",
    title: "The Great Guess-off",
    category: "Trivia",
    time: "5–8 min",
    desc: "Five playful survey and trivia rounds, picture choices, a leaderboard and a grand winner reveal. Free interactive sample.",
    audience: ["Families", "Adults"],
    themeId: "tadazz-classic",
    themeName: "Tadazz Classic",
    accent: "#e5ff37",
    gradient: "linear-gradient(125deg,#20044e,#6834b7 50%,#d536b6)",
    visual: "z",
  },
  {
    id: "crowd",
    title: "The Crowd Decides",
    category: "Survey",
    time: "8–15 min",
    desc: "Eight lively conversation starters. Compare choices, discover surprising connections and let your real audience decide.",
    audience: ["Adults", "Organisations"],
    themeId: "tadazz-electric-social",
    themeName: "Electric Social",
    accent: "#57e9ff",
    gradient: "linear-gradient(135deg,#18133c,#702d9a 56%,#dc658c)",
    visual: "orb",
  },
  {
    id: "quiz",
    title: "The Big Quiz",
    category: "Trivia",
    time: "10–20 min",
    desc: "A sophisticated quiz night of wordplay, music, numbers and general knowledge, with a gold-lit final scoreboard.",
    audience: ["Adults", "Organisations"],
    themeId: "tadazz-midnight-club",
    themeName: "Midnight Club",
    accent: "#e8be69",
    gradient: "linear-gradient(135deg,#071827,#143a58 60%,#81603f)",
    visual: "z",
  },
  {
    id: "story",
    title: "Story Sparks",
    category: "Story",
    time: "10–20 min",
    desc: "Build an imaginative adventure together: choose a hero, a magical place and a joyful ending. Every voice adds an idea.",
    audience: ["Children", "Families", "Schools"],
    themeId: "tadazz-storybook-grove",
    themeName: "Storybook Grove",
    accent: "#f4c983",
    gradient: "linear-gradient(135deg,#12372b,#3a6553 60%,#a4825a)",
    visual: "rings",
  },
  {
    id: "picture",
    title: "Picture Perfect",
    category: "Trivia",
    time: "8–15 min",
    desc: "Bright original illustrations turn shapes, weather and everyday discoveries into eight accessible picture rounds.",
    audience: ["Children", "Families", "Schools"],
    themeId: "tadazz-colour-pop",
    themeName: "Colour Pop",
    accent: "#ffaf8d",
    gradient: "linear-gradient(135deg,#132563,#3d4ba6 55%,#ba607a)",
    visual: "cards",
  },
  {
    id: "truth",
    title: "Fact or Fiction",
    category: "Trivia",
    time: "8–15 min",
    desc: "Eight clear fact-or-fiction challenges across science, shapes and numbers. Commit to an answer, then discover the truth.",
    audience: ["Schools", "Families"],
    themeId: "tadazz-curiosity-lab",
    themeName: "Curiosity Lab",
    accent: "#c5ef88",
    gradient: "linear-gradient(135deg,#093b3e,#17645d 60%,#58773d)",
    visual: "glyph",
  },
  {
    id: "finale",
    title: "The Grand Finale",
    category: "Trivia",
    time: "8–15 min",
    desc: "A celebratory final showdown: eight quick challenges, a polished gold stage and a winner moment worth sharing.",
    audience: ["Adults", "Organisations", "Families"],
    themeId: "tadazz-golden-hour",
    themeName: "Golden Hour",
    accent: "#f5c96b",
    gradient: "linear-gradient(135deg,#2c1738,#65404e 55%,#a87b45)",
    visual: "z",
  },
  {
    id: "family",
    title: "Family Fiesta",
    category: "Survey",
    time: "10–20 min",
    desc: "Warm conversation, easy riddles and cheerful quiz rounds for a family evening where every generation can join in.",
    audience: ["Families", "Children"],
    themeId: "tadazz-family-fiesta",
    themeName: "Family Fiesta",
    accent: "#ffbf91",
    gradient: "linear-gradient(135deg,#3d2435,#774957 55%,#b8755c)",
    visual: "rings",
  },
  {
    id: "classroom",
    title: "Classroom Quest",
    category: "Trivia",
    time: "10–20 min",
    desc: "A ready-to-play classroom adventure mixing maths, language, science and a final reflection. Designed for ages 8–12.",
    audience: ["Schools", "Children"],
    themeId: "tadazz-discovery-lab",
    themeName: "Discovery Lab",
    accent: "#8bdced",
    gradient: "linear-gradient(135deg,#102e58,#245a83 60%,#518e9e)",
    visual: "glyph",
  },
  {
    id: "team",
    title: "Team Together",
    category: "Survey",
    time: "10–20 min",
    desc: "Bring colleagues together with thoughtful icebreakers, light team puzzles and useful reflection on how you work best.",
    audience: ["Organisations", "Adults"],
    themeId: "tadazz-team-together",
    themeName: "Team Together",
    accent: "#ffad98",
    gradient: "linear-gradient(135deg,#102e35,#27616a 60%,#7b7471)",
    visual: "orb",
  },
  ...originalThemeDemoDefinitions,
]

export const publicDemoCatalogue: readonly PublicDemoMetadata[] = Object.freeze(
  definitions.map((item) => {
    let coverUrl = `/tadazz-show/gallery/${item.id}-backdrop.png`

    if (isOriginalThemeId(item.themeId)) {
      coverUrl = `/tadazz-show/originals/${item.themeId}/poster.png`
    } else if (item.id === "great-guessoff") {
      coverUrl = "/tadazz-show/v4/show-stage.webp"
    }

    return Object.freeze({
      ...item,
      audience: Object.freeze([...item.audience]),
      questionCount: rounds[item.id].length,
      coverUrl,
    })
  }),
)

function makeShow(metadata: PublicDemoMetadata): TadaShowV1 {
  const questions = structuredClone(rounds[metadata.id])

  if (metadata.id === "great-guessoff") {
    for (const question of questions) {
      question.timeSeconds = 20
    }
  }

  const allSurvey = questions.every((card) => card.kind === "survey")

  return {
    format: "tada-show",
    version: 1,
    title: metadata.title,
    baseGameMode: allSurvey ? "survey" : "quiz",
    settings: [],
    defaults: {
      showTheme: { id: metadata.themeId, version: "1.0.0", overrides: {} },
    },
    cards: isOriginalThemeId(metadata.themeId)
      ? makeOriginalThemeCards(metadata, questions)
      : [
          {
            key: "welcome",
            kind: "opening",
            title: metadata.title,
            subtitle:
              metadata.id === "story"
                ? "One room. Eight choices. A story made together."
                : "Choose your answer. Share the moment.",
            durationMs: 4000,
            advance: "auto",
          },
          ...questions.slice(0, 4),
          {
            key: "halfway",
            kind: "transition",
            title:
              metadata.id === "story"
                ? "The adventure continues"
                : "Keep the momentum",
            description:
              metadata.id === "story"
                ? "Our hero needs your imagination for the next chapter."
                : "There is still time for a surprise.",
            durationMs: 2500,
            advance: "auto",
          },
          ...questions.slice(4),
          ...(allSurvey
            ? [
                {
                  key: "our-choices",
                  kind: "answerRecap" as const,
                  title:
                    metadata.id === "story"
                      ? "Our story choices"
                      : "The room has spoken",
                  mode: "mostSelected" as const,
                  maxItemsPerPage: 4,
                  showCounts: true,
                  showPercentages: true,
                  durationMs: 10000,
                  advance: "manual" as const,
                },
              ]
            : [
                {
                  key: "final-scores",
                  kind: "leaderboard" as const,
                  title: "Your moment to shine",
                  durationMs: 6000,
                  advance: "manual" as const,
                },
              ]),
          {
            key: "thank-you",
            kind: "closing",
            title:
              metadata.id === "story"
                ? "Every great story starts together"
                : "Thanks for playing together!",
            subtitle: "Keep the laughter. Take the memories.",
            durationMs: 5000,
            advance: "manual",
          },
        ],
  }
}

/** Every caller receives a fresh game so editing never mutates the public master. */
export function getPublicDemo(id: string): PublicDemo | undefined {
  const metadata = publicDemoCatalogue.find((item) => item.id === id)

  return metadata ? { metadata, show: makeShow(metadata) } : undefined
}
