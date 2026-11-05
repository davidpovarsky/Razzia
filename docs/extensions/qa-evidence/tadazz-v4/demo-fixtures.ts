/** SOURCE-ONLY demo values. Never import this module from production! */
import type { TadazzV4Data } from "../src/types"
const prefix = "/tadazz-show/v4/cards/"
export const referenceFixture: TadazzV4Data = {
  question: "Pick a secondary character.",
  number: 4,
  round: 1,
  totalQuestions: 10,
  answers: [
    {title:"Pirate",imageUrl:prefix+"pirate.svg"},
    {title:"Shadchan",imageUrl:prefix+"shadchan.svg"},
    {title:"Faithful Dog",imageUrl:prefix+"dog.svg"},
    {title:"Therapist",imageUrl:prefix+"therapist.svg"},
    {title:"Lamplighter",imageUrl:prefix+"lamplighter.svg"},
  ],
  counts:[24,12,42,14,8],
  seconds:9,
  winners: [
    {title:"Pirate",imageUrl:prefix+"pirate.svg"},
    {title:"Shadchan",imageUrl:prefix+"shadchan.svg"},
    {title:"Faithful Dog",imageUrl:prefix+"dog.svg"},
    {title:"Therapist",imageUrl:prefix+"therapist.svg"},
    {title:"Lamplighter",imageUrl:prefix+"lamplighter.svg"},
  ],
  teams: [
    {name:"Team Sapphire",score:980,icon:"S"},
    {name:"Team Lightning",score:920,icon:"L"},
    {name:"Team Spotlight",score:860,icon:"P"},
    {name:"Team Aurora",score:790,icon:"A"},
  ],
  selectedIndex:2,
  questionImage:prefix+"pirate.svg",
  questionImageText:"Who would you take on the adventure?",
  questionOptions:["The navigator","The storyteller","The detective","The inventor"],
  title:"ROUND TWO",
}
