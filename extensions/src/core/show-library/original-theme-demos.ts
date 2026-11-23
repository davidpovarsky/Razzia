import type { AuthoredCard } from "../show-authoring-schema"
import type { OriginalThemeId } from "../show-themes/original-theme-families"
import type { PublicDemoMetadata } from "./public-demo-catalogue"
import { poll, quiz, type Round } from "./public-demo-authoring"

/** Original public content. No account data or licensed television formats. */
export const originalThemeRounds: Record<OriginalThemeId, Round[]> = {
  "royal-quiz": [
    quiz("royal-compass", "A quarter turn is how many degrees?", {
      answers: ["45", "90", "180", "360"],
      correct: 2,
    }),
    quiz("royal-vault", "A vault contains 5 rows of 6 coins. How many coins?", {
      answers: ["11", "25", "30", "36"],
      correct: 3,
    }),
    quiz("royal-word", "Which word means the opposite of 'scarce'?", {
      answers: ["Hidden", "Tiny", "Rare", "Abundant"],
      correct: 4,
    }),
    quiz("royal-balance", "Which has the same mass as 1 kilogram?", {
      answers: ["100 grams", "500 grams", "1,000 grams", "10,000 grams"],
      correct: 3,
    }),
    quiz("royal-sequence", "Complete the pattern: 5, 10, 20, 40, …", {
      answers: ["45", "50", "60", "70", "80"],
      correct: 5,
    }),
    quiz(
      "royal-crown",
      "The crown costs 36 coins. You pay half now. How many remain?",
      {
        answers: ["12", "16", "18", "24"],
        correct: 3,
      },
    ),
  ],
  "neon-arcade": [
    quiz("neon-combo", "Your combo doubles: 4, 8, 16, … What comes next?", {
      answers: ["20", "24", "32", "64"],
      correct: 3,
    }),
    quiz(
      "neon-pixels",
      "A pixel grid has 3 rows and 5 columns. How many pixels?",
      {
        answers: ["8", "15", "25"],
        correct: 2,
      },
    ),
    quiz(
      "neon-lives",
      "You start with 3 lives, gain 2 and lose 1. How many remain?",
      {
        answers: ["2", "3", "4", "5"],
        correct: 3,
      },
    ),
    quiz(
      "neon-pattern",
      "Which completes the loop: triangle, circle, square, triangle, circle, …?",
      {
        answers: ["Triangle", "Circle", "Square", "Star"],
        correct: 3,
      },
    ),
    quiz("neon-charge", "A battery is 3/4 full. Is that more than half?", {
      answers: ["Yes", "No"],
      correct: 1,
    }),
    quiz(
      "neon-bonus",
      "Five bonus gates give 12 points each. What is the total?",
      {
        answers: ["17", "48", "50", "60", "72"],
        correct: 4,
      },
    ),
  ],
  "retro-tv": [
    quiz("retro-dial", "Which device plays music from a vinyl record?", {
      answers: ["A projector", "A turntable", "A typewriter", "A telescope"],
      correct: 2,
    }),
    quiz(
      "retro-clock",
      "An analogue clock's minute hand points to 6. How many minutes past?",
      {
        answers: ["15", "20", "30", "45"],
        correct: 3,
      },
    ),
    quiz(
      "retro-ticket",
      "Three cinema tickets cost 8 tokens each. What do you pay?",
      {
        answers: ["11", "16", "24", "32"],
        correct: 3,
      },
    ),
    quiz(
      "retro-message",
      "Which object is used to type letters directly onto paper?",
      {
        answers: [
          "A typewriter",
          "A radio",
          "A record player",
          "A slide viewer",
        ],
        correct: 1,
      },
    ),
    quiz(
      "retro-reel",
      "A film starts at 7:15 and lasts 90 minutes. When does it end?",
      {
        answers: ["8:15", "8:30", "8:45", "9:15"],
        correct: 3,
      },
    ),
    quiz("retro-radio", "Which is a unit of time?", {
      answers: ["Metre", "Litre", "Kilogram", "Minute"],
      correct: 4,
    }),
  ],
  "magic-storybook": [
    poll(
      "story-visitor",
      "A visitor knocks at the Lantern Library. Who is it?",
      {
        answers: [
          "A fox with a map",
          "A moon gardener",
          "A tiny dragon",
          "A travelling inventor",
        ],
      },
    ),
    poll("story-door", "One bookshelf becomes a door. Where does it lead?", {
      answers: [
        "A forest of singing trees",
        "An island above the clouds",
        "A village inside a clock",
        "A garden beneath the sea",
      ],
    }),
    poll(
      "story-clue",
      "Our visitor finds a clue to a missing lantern. What is it?",
      {
        answers: [
          "A feather that glows",
          "A letter written in stars",
          "A compass that hums",
          "A small silver seed",
        ],
      },
    ),
    poll("story-helper", "Who helps us understand the clue?", {
      answers: [
        "A patient owl",
        "A cheerful baker",
        "A curious child",
        "A friendly cloud",
      ],
    }),
    poll("story-solution", "How can everyone bring the lost lantern home?", {
      answers: [
        "Share their brightest ideas",
        "Follow the quietest sound",
        "Build a bridge together",
        "Ask the forest for help",
      ],
    }),
    poll("story-last-page", "What belongs on the last page of our adventure?", {
      answers: [
        "A feast in the library",
        "A thank-you to every helper",
        "A new map to explore",
        "A lantern for every home",
      ],
    }),
  ],
  "crystal-future": [
    quiz(
      "future-robot",
      "A robot moves 2 steps each second. How far in 6 seconds?",
      {
        answers: ["3 steps", "8 steps", "12 steps", "16 steps"],
        correct: 3,
      },
    ),
    quiz("future-route", "Which route is shortest: 12 km, 9 km or 15 km?", {
      answers: ["12 km", "9 km", "15 km"],
      correct: 2,
    }),
    quiz("future-water", "Water freezes into which state?", {
      answers: ["Solid", "Liquid", "Gas", "Plasma"],
      correct: 1,
    }),
    quiz("future-solar", "A solar panel receives its energy from what?", {
      answers: ["Sound", "Sunlight", "Magnets", "Moon rocks"],
      correct: 2,
    }),
    quiz(
      "future-design",
      "A machine sorts items in pairs. Can 14 items make complete pairs?",
      {
        answers: ["Yes", "No"],
        correct: 1,
      },
    ),
    quiz("future-code", "The launch code is 100 minus 25 plus 5. What is it?", {
      answers: ["70", "75", "80", "85", "90"],
      correct: 3,
    }),
  ],
  "carnival-pop": [
    poll(
      "carnival-start",
      "The carnival has opened. Where are we going first?",
      {
        answers: [
          "The puzzle tent",
          "The music stage",
          "The craft table",
          "The games field",
        ],
      },
    ),
    quiz("carnival-bunting", "Which shape has three sides?", {
      answers: ["Circle", "Square", "Triangle", "Star"],
      pictures: ["circle", "square", "triangle", "star"],
      correct: 3,
    }),
    quiz(
      "carnival-tickets",
      "You have 10 tickets and spend 4. How many are left?",
      {
        answers: ["4", "5", "6", "7"],
        correct: 3,
      },
    ),
    poll("carnival-parade", "Choose a surprise for our celebration parade.", {
      answers: [
        "Giant paper flowers",
        "A marching band",
        "Dancing ribbons",
        "Colourful kites",
      ],
    }),
    quiz(
      "carnival-mix",
      "On a painter's colour wheel, red and yellow mix to make what?",
      {
        answers: ["Green", "Purple", "Blue", "Orange"],
        correct: 4,
      },
    ),
    quiz(
      "carnival-share",
      "Twelve prizes are shared equally by 3 teams. How many per team?",
      {
        answers: ["3", "4", "6", "9"],
        correct: 2,
      },
    ),
  ],
  "sports-arena": [
    quiz(
      "arena-score",
      "Your team scores 7 points, then 8. What is the total?",
      {
        answers: ["13", "14", "15", "16"],
        correct: 3,
      },
    ),
    quiz(
      "arena-relay",
      "Four runners each run 100 metres. How long is the relay?",
      {
        answers: ["100 m", "200 m", "300 m", "400 m"],
        correct: 4,
      },
    ),
    quiz(
      "arena-clock",
      "A practice lasts 2 minutes. How many seconds is that?",
      {
        answers: ["60", "90", "120", "200"],
        correct: 3,
      },
    ),
    quiz(
      "arena-team",
      "Eighteen players make 3 equal teams. How many players per team?",
      {
        answers: ["3", "5", "6", "9"],
        correct: 3,
      },
    ),
    quiz(
      "arena-finish",
      "In the same race, one runner finishes in 18 seconds and another in 21. Who is faster?",
      {
        answers: ["The 18-second runner", "The 21-second runner", "They tie"],
        correct: 1,
      },
    ),
    quiz(
      "arena-champion",
      "The scores are 14 and 17. How many points separate the teams?",
      {
        answers: ["1", "2", "3", "4", "5"],
        correct: 3,
      },
    ),
  ],
  "mystery-noir": [
    quiz("noir-code", "The safe code is twice 13, then minus 4. What is it?", {
      answers: ["18", "22", "26", "30"],
      correct: 2,
    }),
    quiz(
      "noir-alibi",
      "A note says 'three days after Tuesday'. Which day is that?",
      {
        answers: ["Thursday", "Friday", "Saturday", "Sunday"],
        correct: 2,
      },
    ),
    quiz(
      "noir-arrivals",
      "Ada arrives before Ben. Cora arrives after Ben. Who arrives last?",
      {
        answers: ["Ada", "Ben", "Cora"],
        correct: 3,
      },
    ),
    quiz(
      "noir-turn",
      "Face north. Turn right a quarter turn, then left a half turn. Where are you facing?",
      {
        answers: ["North", "East", "South", "West"],
        correct: 4,
      },
    ),
    quiz("noir-footprints", "The clue reads 4, 7, 10, 13, … What comes next?", {
      answers: ["14", "15", "16", "17", "18"],
      correct: 3,
    }),
    quiz(
      "noir-last-clue",
      "A drawer opens with a three-digit code: 2, 5, and their sum. What is it?",
      {
        answers: ["253", "255", "257", "259"],
        correct: 3,
      },
    ),
  ],
}

export const originalThemeDemoDefinitions: ReadonlyArray<
  Omit<PublicDemoMetadata, "coverUrl" | "questionCount">
> = [
  {
    id: "royal-quiz",
    title: "The Crown Challenge",
    category: "Trivia",
    time: "6–10 min",
    desc: "Six elegant challenges in logic, words and numbers. Build your score across three acts and claim your crown.",
    audience: ["Adults", "Organisations", "Families"],
    themeId: "royal-quiz",
    themeName: "Royal Quiz",
    accent: "#e9c879",
    gradient: "linear-gradient(130deg,#071323,#172d4f 60%,#8b6830)",
    visual: "crown",
  },
  {
    id: "neon-arcade",
    title: "Power-Up Circuit",
    category: "Trivia",
    time: "6–10 min",
    desc: "Six bright logic challenges with pixels, patterns and bonus gates. Three scoreboards mark your route to the finish.",
    audience: ["Children", "Families", "Schools"],
    themeId: "neon-arcade",
    themeName: "Neon Arcade",
    accent: "#66fff0",
    gradient: "linear-gradient(130deg,#10102d,#421876 60%,#ef4fa2)",
    visual: "pixels",
  },
  {
    id: "retro-tv",
    title: "The Big Rewind",
    category: "Trivia",
    time: "6–10 min",
    desc: "Turn the dial for six playful rounds about records, clocks and everyday inventions, framed like a vintage television show.",
    audience: ["Adults", "Families"],
    themeId: "retro-tv",
    themeName: "Retro TV",
    accent: "#ffd78e",
    gradient: "linear-gradient(130deg,#4c281c,#af5c2d 60%,#deb24e)",
    visual: "television",
  },
  {
    id: "magic-storybook",
    title: "The Lantern Library",
    category: "Story",
    time: "6–10 min",
    desc: "Create a gentle adventure in six audience choices. Meet a visitor, follow a clue and choose an ending together.",
    audience: ["Children", "Families", "Schools"],
    themeId: "magic-storybook",
    themeName: "Magic Storybook",
    accent: "#f2d79b",
    gradient: "linear-gradient(130deg,#102b2c,#34584a 60%,#a88950)",
    visual: "book",
  },
  {
    id: "crystal-future",
    title: "Future Makers",
    category: "Trivia",
    time: "6–10 min",
    desc: "Six clear-thinking challenges about robots, science and invention on a luminous crystal stage.",
    audience: ["Schools", "Children", "Organisations"],
    themeId: "crystal-future",
    themeName: "Crystal Future",
    accent: "#b3f3ff",
    gradient: "linear-gradient(130deg,#10283c,#315e80 60%,#8ebfd0)",
    visual: "crystal",
  },
  {
    id: "carnival-pop",
    title: "Carnival of Curiosity",
    category: "Trivia",
    time: "6–10 min",
    desc: "A joyful mix of family choices, picture questions and small puzzles. Celebrate together after every two rounds.",
    audience: ["Children", "Families"],
    themeId: "carnival-pop",
    themeName: "Carnival Pop",
    accent: "#ffe278",
    gradient: "linear-gradient(130deg,#522244,#c54272 60%,#f2a658)",
    visual: "confetti",
  },
  {
    id: "sports-arena",
    title: "Champions Together",
    category: "Trivia",
    time: "6–10 min",
    desc: "Six sporting number puzzles with a bold arena scoreboard. Count points, race the clock and celebrate real results.",
    audience: ["Schools", "Families", "Organisations"],
    themeId: "sports-arena",
    themeName: "Sports Arena",
    accent: "#b8f4ff",
    gradient: "linear-gradient(130deg,#101d3b,#234c83 50%,#a93d43)",
    visual: "arena",
  },
  {
    id: "mystery-noir",
    title: "The Midnight Case",
    category: "Trivia",
    time: "6–10 min",
    desc: "Follow six original logic clues through a theatrical mystery. Crack the final code and reveal your score.",
    audience: ["Adults", "Families", "Organisations"],
    themeId: "mystery-noir",
    themeName: "Mystery Noir",
    accent: "#e4bb84",
    gradient: "linear-gradient(130deg,#191d24,#38323b 60%,#786049)",
    visual: "clue",
  },
]

/** Native authored scenes are also consumed by the original-family solo player. */
export function makeOriginalThemeCards(
  metadata: PublicDemoMetadata,
  questions: Round[],
): AuthoredCard[] {
  const story = questions.every((card) => card.kind === "survey")
  const cards: AuthoredCard[] = [
    {
      key: "welcome",
      kind: "opening",
      title: metadata.title,
      subtitle: story
        ? "Six choices. Three chapters. One adventure together."
        : "Six rounds. Three acts. Your moment to shine.",
      durationMs: 4000,
      advance: "auto",
    },
  ]
  for (let index = 0; index < questions.length; index += 1) {
    cards.push(questions[index])

    if ((index + 1) % 2 === 0) {
      const act = (index + 1) / 2
      cards.push(
        story
          ? {
              key: `chapter-${act}-choices`,
              kind: "answerRecap",
              title: act === 3 ? "Our complete adventure" : "Our story so far",
              startQuestionKey:
                act === 3 ? questions[0].key : questions[index - 1].key,
              mode: "mostSelected",
              maxItemsPerPage: 6,
              showCounts: true,
              showPercentages: true,
              durationMs: 7000,
              advance: "manual",
            }
          : {
              key: `act-${act}-scores`,
              kind: "leaderboard",
              title: act === 3 ? "The final scores" : "The scores so far",
              durationMs: 6000,
              advance: "manual",
            },
      )

      if (index < questions.length - 1) {
        cards.push({
          key: `act-${act + 1}`,
          kind: "transition",
          title: story ? `Chapter ${act + 1}` : `Act ${act + 1}`,
          description: story
            ? "Let's see where the story goes."
            : "A fresh challenge awaits.",
          durationMs: 2500,
          advance: "auto",
        })
      }
    }
  }
  cards.push({
    key: "thank-you",
    kind: "closing",
    title: story
      ? "Every voice added a little magic"
      : "Thanks for playing together!",
    subtitle: story
      ? "Keep your adventure. Imagine the next one."
      : "Keep the laughter. Take the memories.",
    durationMs: 5000,
    advance: "manual",
  })

  return cards
}
