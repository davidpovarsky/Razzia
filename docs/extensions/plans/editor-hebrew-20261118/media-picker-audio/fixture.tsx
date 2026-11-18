import { createRoot } from "react-dom/client"
import { useEffect, useRef, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { I18nextProvider } from "react-i18next"
import { QuizzEditorProvider, useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { StudioEditorProvider } from "@razzia/web/features/quizz/components/studio/studio-editor-context"
import CardAudioConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/CardAudioConfig"
import { ThemeAudioOptions } from "@razzia/web/features/quizz/components/studio/theme-audio-options"
import { createDefaultQuizExtrasV2, resolveShowTheme } from "@razzia/extensions/core"
import { QUIZZ_MODES, QUESTION_TYPES } from "@razzia/common/constants"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import { ApplicationDirection } from "@razzia/web/components/ApplicationDirection"
import i18n from "@razzia/web/i18n"
import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/index.css"

const audios = []
class ControlledAudio {
  src; onended = null; onerror = null; currentTime = 13; paused = true; pauseCalls = 0; playCalls = 0
  resolvePlay; rejectPlay
  constructor(url) { this.src = url; audios.push(this) }
  play() { this.paused = false; this.playCalls++; return new Promise((resolve, reject) => { this.resolvePlay = resolve; this.rejectPlay = reject }) }
  pause() { this.paused = true; this.pauseCalls++ }
  removeAttribute(name) { if (name === "src") this.src = "" }
}
window.Audio = ControlledAudio
window.__audioHarness = { audios, i18n }
await i18n.changeLanguage("he")
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const mode = new URLSearchParams(location.search).get("mode") || "library"
const question = () => ({ type: QUESTION_TYPES.SINGLE, question: "Audio lifecycle fixture", answers: ["One", "Two"], solutions: [0], cooldown: 0, time: 20 })
const initialData = { gameMode: QUIZZ_MODES.QUIZ, subject: "Isolated audio lifecycle", questions: [question(), question()] }
function LegacyFixture() {
 const q = useQuizzEditor()
 const started = useRef(false)
 const [ready, setReady] = useState(false)
 useEffect(() => {
   if (started.current || !q.extras) return
   started.current = true
   const extras = createDefaultQuizExtrasV2("audio-proof", q.questionIds, "0".repeat(64))
   extras.defaults.motionKit = "legacy"
   delete extras.defaults.showTheme
   extras.perQuestion = Object.fromEntries(q.questionIds.map(id => [id, { audioCues: {
     showQuestion: { mode: "custom", url: "/sounds/show.mp3", volume: 0.8, loop: false },
     answersMusic: { mode: "custom", url: "/sounds/answersMusic.mp3", volume: 0.8, loop: true },
     revealResults: { mode: "custom", url: "/sounds/results.mp3", volume: 0.8, loop: false }
   } }]))
   q.setExtras(extras);setReady(true)
 }, [q.extras, q.questionIds])
 window.__audioHarness.switchCard = () => q.setCurrentIndex(q.currentIndex === 0 ? 1 : 0)
 window.__audioHarness.changeSource = () => q.setExtras(prev => ({ ...prev, perQuestion: { ...prev.perQuestion, [q.currentQuestionId]: { ...prev.perQuestion[q.currentQuestionId], audioCues: { ...prev.perQuestion[q.currentQuestionId].audioCues, showQuestion: { mode: "custom", url: "/sounds/first.mp3", volume: 0.8, loop: false } } } } }))
 return ready ? <CardAudioConfig /> : null
}
function ThemeFixture() {
 const theme = resolveShowTheme({ role: "manager" })
 const event = Object.keys(theme.definition.audioEvents)[0]
 const [value, setValue] = useState({ mediaUrl: "/sounds/show.mp3" })
 window.__audioHarness.changeSource = () => setValue({ mediaUrl: "/sounds/first.mp3" })
 return <ThemeAudioOptions theme={theme} event={event} value={value} onChange={setValue} />
}
function Fixture() {
 const [mounted, setMounted] = useState(true)
 const [open, setOpen] = useState(true)
 window.__audioHarness.close = () => setOpen(false)
 window.__audioHarness.unmount = () => setMounted(false)
 window.__audioHarness.open = () => { setMounted(true); setOpen(true) }
 return <I18nextProvider i18n={i18n}><ApplicationDirection><QueryClientProvider client={queryClient}><QuizzEditorProvider initialData={initialData}><StudioEditorProvider>
  {mounted && (mode === "legacy" ? <LegacyFixture /> : mode === "theme" ? <ThemeFixture /> : <MediaLibrary open={open} onOpenChange={setOpen} acceptType="audio" />)}
 </StudioEditorProvider></QuizzEditorProvider></QueryClientProvider></ApplicationDirection></I18nextProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
