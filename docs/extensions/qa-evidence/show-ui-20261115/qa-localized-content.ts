import type { PreviewLocale } from "../../../../extensions/src/presentation/show-library-preview/i18n"
export const localizedFixtureText = {
  en: {
    question: "Which colour do you prefer?",
    choices: ["Blue", "Green", "Orange", "Purple", "Pink"],
  },
  fr: {
    question: "Quelle couleur préférez-vous ?",
    choices: ["Bleu", "Vert", "Orange", "Violet", "Rose"],
  },
  de: {
    question: "Welche Farbe bevorzugen Sie?",
    choices: ["Blau", "Grün", "Orange", "Violett", "Rosa"],
  },
  es: {
    question: "¿Qué color prefieres?",
    choices: ["Azul", "Verde", "Naranja", "Morado", "Rosa"],
  },
  it: {
    question: "Quale colore preferisci?",
    choices: ["Blu", "Verde", "Arancione", "Viola", "Rosa"],
  },
  ja: {
    question: "どの色が好きですか？",
    choices: ["青", "緑", "オレンジ", "紫", "ピンク"],
  },
  tr: {
    question: "Hangi rengi tercih edersiniz?",
    choices: ["Mavi", "Yeşil", "Turuncu", "Mor", "Pembe"],
  },
  vi: {
    question: "Bạn thích màu nào?",
    choices: ["Xanh dương", "Xanh lá", "Cam", "Tím", "Hồng"],
  },
} satisfies Record<PreviewLocale, { question: string; choices: string[] }>
