import { QUESTION_LEAD_IN_SECONDS } from "@razzia/common/constants"
import type { AuthoredCard } from "../show-authoring-schema"
import type { PublicDemoMetadata } from "./public-demo-catalogue"
import type { Round } from "./public-demo-authoring"

const MEDIA_BASE = "/tadazz-show/family-mixup/media/"

/** Content provenance is kept off the presentation stage. */
export const familyMixupSources = {
  wombatPouch:
    "https://www.csiro.au/en/news/all/articles/2022/july/10-things-about-wombats",
  octopusHearts:
    "https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives",
  venusRotation: "https://science.nasa.gov/venus/venus-facts/",
  crowFaces:
    "https://www.washington.edu/news/2012/09/10/crows-react-to-threats-in-human-like-way/",
  polarBearSkin:
    "https://polarbearsinternational.org/news-media/articles/why-polar-bears-have-black-skin/",
  sharkAncestors:
    "https://www.nhm.ac.uk/discover/shark-evolution-a-450-million-year-timeline.html",
} as const

export const familyMixupSections = [
  "Let the Chaos Begin!",
  "No Way! That's Actually True?",
  "Blink and You'll Miss It",
  "The Family Logic Department",
  "Mission: Almost Impossible",
  "The Mega Finale",
] as const

export const familyMixupDemoDefinition: Omit<
  PublicDemoMetadata,
  "coverUrl" | "questionCount"
> = {
  id: "family-mixup",
  title: "The Great Family Mix-Up!",
  category: "Trivia",
  time: "50–65 min",
  desc: "48 questions, six rounds, surprising facts, funny family surveys and original visual challenges.",
  audience: ["Families"],
  themeId: "family-mixup",
  themeName: "Family Mix-Up",
  accent: "#ff7b28",
  gradient: "linear-gradient(135deg, #f7f1e8 0%, #ebe8f4 60%, #2448a7 100%)",
  visual: "confetti",
}

function quiz(
  number: number,
  question: string,
  answers: readonly string[],
  correctAnswer: number,
  timeSeconds: 20 | 25 | 30 = 20,
): Round {
  return {
    key: `family-q${String(number).padStart(2, "0")}`,
    kind: "quiz",
    questionType: "single",
    question,
    timeSeconds,
    cooldownSeconds: QUESTION_LEAD_IN_SECONDS,
    maxPoints: 1000,
    penalty: 0,
    correctAnswers: [correctAnswer],
    answers: answers.map((text) => ({ text, display: "text" as const })),
  }
}

function survey(
  number: number,
  question: string,
  answers: readonly string[],
): Round {
  return {
    key: `family-q${String(number).padStart(2, "0")}`,
    kind: "survey",
    questionType: "single",
    question,
    timeSeconds: 20,
    cooldownSeconds: QUESTION_LEAD_IN_SECONDS,
    maxPoints: 0,
    penalty: 0,
    correctAnswers: [],
    answers: answers.map((text) => ({ text, display: "text" as const })),
  }
}

/** One Round is one authored question, as in the shared public-demo authoring API. */
const familyMixupQuestions: Round[] = [
  survey(
    1,
    "The whole family is finally ready to leave the house. What happens next?",
    [
      "Someone suddenly gets hungry",
      "Someone forgot something",
      "Someone can't find their shoes",
      "Everyone actually leaves!",
    ],
  ),
  quiz(
    2,
    "You're running a race and overtake the person in second place. What place are you in?",
    ["First", "Second", "Third", "Last"],
    2,
  ),
  quiz(
    3,
    "What is this extremely zoomed-in object?",
    ["Carpet", "Broom", "Toothbrush", "Hairbrush"],
    3,
  ),
  quiz(
    4,
    "Which cup position is hiding the little golden ball?",
    ["A", "B", "C", "D"],
    3,
  ),
  quiz(
    5,
    "A family has four daughters. Each daughter has one brother. How many children are there?",
    ["4", "5", "8", "9"],
    2,
  ),
  quiz(
    6,
    "Which shadow belongs to this strangely dressed duck?",
    ["A", "B", "C", "D"],
    4,
  ),
  quiz(
    7,
    "There are 12 cupcakes on the table. You take three. How many do you have?",
    ["9", "12", "3", "None"],
    3,
  ),
  survey(8, "If your family could buy a robot, what should its first job be?", [
    "Folding laundry",
    "Making dinner",
    "Finding lost things",
    "Getting everyone out of bed",
  ]),

  quiz(
    9,
    "Which of these animals has a backward-facing pouch?",
    ["Penguin", "Rabbit", "Wombat", "Kangaroo"],
    3,
  ),
  quiz(
    10,
    "Which animal has three hearts?",
    ["Penguin", "Octopus", "Fox", "Elephant"],
    2,
  ),
  quiz(
    11,
    "On which planet does one complete rotation take longer than an entire orbit around the Sun?",
    ["Mars", "Venus", "Jupiter", "Neptune"],
    2,
    25,
  ),
  survey(12, "Which animal ability would you most like to have?", [
    "Flying like an eagle",
    "Changing colour like a chameleon",
    "Climbing like a gecko",
    "Running like a cheetah",
  ]),
  quiz(
    13,
    "What amazing thing have scientists discovered that crows can do?",
    [
      "Breathe underwater",
      "Remember individual human faces",
      "See through walls",
      "Produce electricity",
    ],
    2,
  ),
  quiz(
    14,
    "What colour is an adult polar bear's skin underneath its fur?",
    ["White", "Pink", "Grey", "Black"],
    4,
  ),
  quiz(
    15,
    "Which appeared on Earth first?",
    ["Trees", "Dinosaurs", "Flowers", "Early shark relatives"],
    4,
  ),
  survey(16, "Which of these ridiculous pets would you choose?", [
    "A tiny elephant",
    "A talking penguin",
    "A flying hamster",
    "A miniature giraffe",
  ]),

  survey(17, "Which thing are you most likely to forget?", [
    "Someone's name",
    "Where I put my phone",
    "Why I entered a room",
    "What I was about to say",
  ]),
  quiz(
    18,
    "What colour was the toaster in the breakfast scene?",
    ["Blue", "Yellow", "Red", "Green"],
    2,
  ),
  quiz(
    19,
    "How many little rubber ducks are hiding in this chaotic living room?",
    ["5", "7", "9", "11"],
    3,
    30,
  ),
  quiz(
    20,
    "Which object appeared immediately after the banana?",
    ["Umbrella", "Shoe", "Clock", "Balloon"],
    3,
  ),
  quiz(
    21,
    "Which of these four seemingly identical suitcases is different?",
    ["A", "B", "C", "D"],
    2,
  ),
  quiz(
    22,
    "Something disappeared from the table! What was it?",
    ["Keys", "Glasses", "A biscuit", "A spoon"],
    3,
  ),
  quiz(
    23,
    "Which option shows the original shape rotated, rather than flipped?",
    ["A", "B", "C", "D"],
    1,
    25,
  ),
  survey(24, "Which would you trust yourself to remember for an entire year?", [
    "A phone number",
    "A funny joke",
    "Someone's birthday",
    "Absolutely nothing",
  ]),

  survey(25, "What's the greatest argument in family history?", [
    "Who gets the front seat",
    "What to eat",
    "Who has the remote",
    "Who made the mess",
  ]),
  quiz(
    26,
    "Two mothers and two daughters go out for lunch. There are only three people. How?",
    [
      "A grandmother, mother and daughter",
      "Someone stayed home",
      "They're twins",
      "One is imaginary",
    ],
    1,
    25,
  ),
  quiz(
    27,
    "You have one match. In a dark room there's a candle, a lantern and a fireplace. What do you light first?",
    ["Candle", "Lantern", "Fireplace", "The match"],
    4,
    25,
  ),
  quiz(
    28,
    "Four boxes stand in a row: A, B, C, D. The cake is not in A, not next to A, and not in C. Where is it?",
    ["A", "B", "C", "D"],
    4,
    25,
  ),
  quiz(
    29,
    "A clock takes five seconds from its first chime to its sixth. How long from its first chime to its twelfth?",
    ["11 seconds", "10 seconds", "12 seconds", "15 seconds"],
    1,
    30,
  ),
  quiz(
    30,
    "A family has eight children. Which of these must be true?",
    [
      "Two share a birthday",
      "At least two were born on the same day of the week",
      "All were born in winter",
      "Four are twins",
    ],
    2,
    25,
  ),
  quiz(
    31,
    "Five oranges are in a basket. How can five people each get one orange while one orange stays in the basket?",
    [
      "Give the last person the basket with the orange",
      "Cut them in half",
      "Hide another orange",
      "It's impossible",
    ],
    1,
    25,
  ),
  survey(32, "Which new family law would you introduce?", [
    "Dessert before dinner",
    "No chores on Sundays",
    "Everyone gets a daily nap",
    "The person who cooks never washes up",
  ]),

  survey(
    33,
    "You're stranded on an island. Which completely ridiculous gadget would you take?",
    [
      "An unlimited popcorn machine",
      "A flying sofa",
      "A self-building house",
      "A phone that never loses battery",
    ],
  ),
  quiz(
    34,
    "Which of these four routes leads the explorer to the treasure?",
    ["A", "B", "C", "D"],
    2,
    25,
  ),
  quiz(35, "Which door did the tiny car emerge from?", ["A", "B", "C", "D"], 4),
  quiz(
    36,
    "Which shape comes next in this colourful pattern?",
    ["Square", "Triangle", "Circle", "Star"],
    1,
  ),
  quiz(
    37,
    "The red suitcase is heavier than the blue one. The green one is lighter than the blue one. The yellow one is heavier than the red one. Which is lightest?",
    ["Green", "Red", "Yellow", "Blue"],
    1,
    30,
  ),
  quiz(
    38,
    "Make your prediction! Which racer will cross the finish line first?",
    ["Racer A", "Racer B", "Racer C", "Racer D"],
    3,
  ),
  quiz(
    39,
    "Which puzzle piece fits perfectly into the missing space?",
    ["A", "B", "C", "D"],
    4,
    25,
  ),
  survey(40, "Which invention should exist immediately?", [
    "A teleportation machine",
    "A bed that makes itself",
    "A fridge that cooks dinner",
    "A button that pauses time",
  ]),

  survey(41, "Which would be the funniest family superpower?", [
    "Everyone can read each other's thoughts",
    "Everyone speaks in rhymes",
    "Everyone can only walk backwards",
    "Everyone has to sing instead of talk",
  ]),
  quiz(
    42,
    "How many times does the digit 1 appear when writing the numbers from 1 to 20?",
    ["12", "10", "11", "13"],
    1,
    25,
  ),
  quiz(
    43,
    "What mysterious object is being revealed?",
    ["Umbrella", "Microphone", "Paintbrush", "Kitchen whisk"],
    4,
  ),
  quiz(
    44,
    "What expression does this picture represent?",
    ["Man overboard", "Walking on water", "Standing tall", "Lost at sea"],
    1,
  ),
  quiz(
    45,
    "A 24-hour digital clock reads 12:21. When will it next read the same forwards and backwards?",
    ["12:22", "13:31", "14:41", "12:51"],
    2,
    25,
  ),
  quiz(
    46,
    "How many squares can you find in this 3×3 grid, including the larger squares?",
    ["9", "10", "12", "14"],
    4,
    30,
  ),
  survey(47, "What should the family champion win?", [
    "Control of the remote for a week",
    "Breakfast in bed",
    "A giant chocolate bar",
    "Immunity from washing dishes",
  ]),
  quiz(
    48,
    "Crack the code: first = triangle sides; second = twice the first; third = first minus one; fourth = second minus third.",
    ["3624", "3642", "2634", "3264"],
    1,
    30,
  ),
]

export const familyVaultClues = [
  "The first digit is the number of sides on a triangle.",
  "The second digit is twice the first.",
  "The third digit is one less than the first.",
  "The fourth digit is the second digit minus the third.",
] as const

/** Explanations appear only with the answer reveal, never during voting. */
export const familyMixupExplanations: Readonly<Record<string, string>> = {
  "family-q02":
    "You take the place of the runner in second: you are now second.",
  "family-q05":
    "All four sisters share the same brother: four plus one makes five.",
  "family-q07": "You have the three cupcakes you took.",
  "family-q09": "A wombat’s pouch opens towards its back.",
  "family-q10": "An octopus has three hearts.",
  "family-q11":
    "Venus takes about 243 Earth days to rotate once, but about 225 days to orbit the Sun.",
  "family-q13": "Crows can recognise and remember individual human faces.",
  "family-q14": "An adult polar bear has black skin beneath its fur.",
  "family-q15":
    "The lineage of early shark relatives predates the first trees.",
  "family-q26":
    "The grandmother and mother are two mothers; the mother and child are two daughters.",
  "family-q27":
    "You have to light the match before you can light anything else.",
  "family-q28":
    "A and its neighbour B are ruled out. C is ruled out too, leaving D.",
  "family-q29":
    "Six chimes contain five gaps. Twelve chimes contain eleven gaps: eleven seconds.",
  "family-q30":
    "There are seven days of the week, so eight children cannot all have different birth weekdays.",
  "family-q31":
    "The fifth person receives the basket with its orange still inside.",
  "family-q36": "The repeating group is circle, triangle, circle, square.",
  "family-q37": "From lightest to heaviest: green, blue, red, yellow.",
  "family-q42":
    "There is one 1 in 1, ten in the tens column from 10–19, and one more in 11: twelve altogether.",
  "family-q43": "It is a kitchen whisk.",
  "family-q44": "The word MAN is over the word BOARD: man overboard.",
  "family-q45":
    "13:31 is the next time whose four digits read the same in either direction.",
  "family-q46":
    "Nine small squares + four medium squares + one large square = fourteen.",
  "family-q48":
    "3 sides; double 3 is 6; one less than 3 is 2; 6 minus 2 is 4. The code is 3624.",
}

export interface FamilyQuestionMedia {
  answerImageTreatment?: "silhouette"
  view: "illustrated" | "picture-answers" | "mystery" | "visual" | "vault"
  url?: string
  alt: string
  revealUrl?: string
}

/** Resolved to native quiz.media by the shared authoring integration. */
export const familyQuestionMedia: Readonly<
  Record<string, FamilyQuestionMedia>
> = {
  "family-q03": {
    view: "mystery",
    url: MEDIA_BASE + "toothbrush-macro.png",
    alt: "An extreme close-up of clusters of coloured fibres.",
    revealUrl: MEDIA_BASE + "toothbrush-full.png",
  },
  "family-q06": {
    view: "illustrated",
    answerImageTreatment: "silhouette",
    url: MEDIA_BASE + "duck.png",
    alt: "A duck wearing a hat and oversized boots, ready to match to its silhouette.",
  },
  "family-q09": {
    view: "picture-answers",
    alt: "Four animal photographs: penguin, rabbit, wombat and kangaroo.",
  },
  "family-q10": {
    view: "picture-answers",
    alt: "Four animal photographs: penguin, octopus, fox and elephant.",
  },
  "family-q14": {
    view: "illustrated",
    url: MEDIA_BASE + "polar-bear.png",
    alt: "An adult polar bear with a thick white coat.",
  },
  "family-q19": {
    view: "visual",
    url: MEDIA_BASE + "hidden-ducks.png",
    alt: "A living room with small rubber ducks scattered among the furnishings.",
  },
  "family-q21": {
    view: "visual",
    url: MEDIA_BASE + "suitcases.png",
    alt: "Four suitcases labelled A, B, C and D. One has a different detail.",
  },
  "family-q23": {
    view: "visual",
    url: MEDIA_BASE + "rotation.png",
    alt: "An asymmetric original shape and four candidate shapes labelled A to D.",
  },
  "family-q28": {
    view: "visual",
    url: MEDIA_BASE + "cake-boxes.png",
    alt: "Four closed cake boxes in a straight row, labelled A, B, C and D from left to right.",
  },
  "family-q34": {
    view: "visual",
    url: MEDIA_BASE + "treasure-routes.png",
    alt: "Four routes labelled A to D lead towards different destinations. Follow them to find the treasure.",
  },
  "family-q36": {
    view: "visual",
    url: MEDIA_BASE + "shape-pattern.png",
    alt: "Circle, triangle, circle, square, circle, triangle, circle, then a missing shape.",
  },
  "family-q39": {
    view: "visual",
    url: MEDIA_BASE + "missing-piece.png",
    alt: "A puzzle with a missing piece. Match the empty outline to an answer piece.",
  },
  "family-q44": {
    view: "visual",
    url: MEDIA_BASE + "rebus-man-overboard.png",
    alt: "The word MAN sits above the word BOARD.",
  },
  "family-q46": {
    view: "visual",
    url: MEDIA_BASE + "square-grid.png",
    alt: "A large square divided into a three-by-three grid of equal small squares.",
  },
  "family-q48": {
    view: "vault",
    url: MEDIA_BASE + "vault-closed.png",
    alt: "A closed mechanical vault with an empty four-digit code display.",
  },
}

const familyAnswerPictures: Readonly<Record<string, readonly string[]>> = {
  "family-q06": [
    "duck-shadow-1.png",
    "duck-shadow-2.png",
    "duck-shadow-3.png",
    "duck.png",
  ],
  "family-q09": ["penguin.png", "rabbit.png", "wombat.png", "kangaroo.png"],
  "family-q10": ["penguin.png", "octopus.png", "fox.png", "elephant.png"],
  "family-q36": [
    "shape-square.png",
    "shape-triangle.png",
    "shape-circle.png",
    "shape-star.png",
  ],
  "family-q39": ["piece-a.png", "piece-b.png", "piece-c.png", "piece-d.png"],
}

export const familyMixupRounds: Round[] = familyMixupQuestions.map(
  (question) => {
    const picture = familyQuestionMedia[question.key]
    const answerPictures = familyAnswerPictures[question.key]
    return {
      ...question,
      ...(picture?.url
        ? { media: { type: "image" as const, url: picture.url } }
        : {}),
      answers: question.answers.map((answer, index) =>
        answerPictures
          ? {
              ...answer,
              display: "both" as const,
              imageUrl: MEDIA_BASE + answerPictures[index],
              alt: answer.text,
              ...(picture?.answerImageTreatment
                ? { imageTreatment: picture.answerImageTreatment }
                : {}),
            }
          : answer,
      ),
    }
  },
)

interface FamilyClip {
  file: string
  durationMs: number
  title: string
  mediaType?: "image" | "video"
}

const observations: Readonly<Record<string, FamilyClip>> = {
  "family-q04": {
    file: "cups-observe.mp4",
    durationMs: 8000,
    title: "Follow the golden ball",
  },
  "family-q18": {
    file: "breakfast-observe.mp4",
    durationMs: 8000,
    title: "Watch carefully…",
  },
  "family-q20": {
    file: "objects-observe.mp4",
    durationMs: 8000,
    title: "Remember the order",
  },
  "family-q22": {
    file: "biscuit-observe.mp4",
    durationMs: 8000,
    title: "Spot what disappears",
  },
  "family-q35": {
    file: "car-observe.mp4",
    durationMs: 8000,
    title: "Follow the tiny car",
  },
  "family-q38": {
    file: "race-observe.mp4",
    durationMs: 7000,
    title: "Watch the race",
  },
  "family-q43": {
    file: "whisk-observe.mp4",
    durationMs: 8000,
    title: "What could it be?",
  },
}
const reveals: Readonly<Record<string, FamilyClip>> = {
  "family-q03": {
    file: "toothbrush-full.png",
    durationMs: 3000,
    title: "Mystery solved",
    mediaType: "image",
  },
  "family-q38": {
    file: "race-reveal.mp4",
    durationMs: 4000,
    title: "The finish",
  },
  "family-q43": {
    file: "whisk-reveal.mp4",
    durationMs: 3000,
    title: "Mystery solved",
  },
}

function mediaCard(key: string, clip: FamilyClip): AuthoredCard {
  return {
    key,
    kind: "media",
    mediaUrl: MEDIA_BASE + clip.file,
    mediaType: clip.mediaType ?? "video",
    title: clip.title,
    stageLayout: "cinema",
    textOverlay: false,
    endBehavior: "advanceNext",
    durationMs: clip.durationMs,
    mediaEndFallbackMs: clip.durationMs + 1500,
    advance: clip.mediaType === "image" ? "auto" : "onMediaEnd",
    loop: false,
    muted: true,
  }
}

export function makeFamilyMixupCards(
  metadata: PublicDemoMetadata,
  questions: Round[],
): AuthoredCard[] {
  const cards: AuthoredCard[] = [
    {
      key: "family-opening",
      kind: "opening",
      title: metadata.title,
      subtitle: "Big laughs. Wild guesses. One family champion.",
      mediaUrl: "/tadazz-show/family-mixup/stage-bright.webp",
      mediaType: "image",
      stageLayout: "cinema",
      textOverlay: true,
      durationMs: 4000,
      advance: "auto",
    },
  ]

  questions.forEach((question, index) => {
    if (index % 8 === 0) {
      cards.push({
        key: `family-round-${Math.floor(index / 8) + 1}`,
        kind: "transition",
        title: familyMixupSections[Math.floor(index / 8)],
        description: "",
        durationMs: 2500,
        advance: "auto",
      })
    }

    const before = observations[question.key]
    if (before) cards.push(mediaCard(`${question.key}-observe`, before))
    cards.push(question)
    const after = reveals[question.key]
    if (after) cards.push(mediaCard(`${question.key}-reveal`, after))

    const completedQuestions = index + 1
    if (
      completedQuestions === 16 ||
      completedQuestions === 32 ||
      completedQuestions === 48
    ) {
      cards.push({
        key: `family-scores-${completedQuestions}`,
        kind: "leaderboard",
        title:
          completedQuestions === 48 ? "The family champion!" : "Who's on top?",
        durationMs: 6000,
        advance: "manual",
      })
    }
  })

  cards.push({
    key: "family-closing",
    kind: "closing",
    title: "Thanks for playing together!",
    subtitle: "",
    mediaUrl: "/tadazz-show/family-mixup/stage-bright.webp",
    mediaType: "image",
    stageLayout: "cinema",
    textOverlay: true,
    durationMs: 5000,
    advance: "manual",
  })
  return cards
}
