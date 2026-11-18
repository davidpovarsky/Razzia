import { createRoot } from "react-dom/client"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import HostPlayersModal from "@razzia/web/features/game/components/HostPlayersModal"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { ApplicationDirection } from "@razzia/web/components/ApplicationDirection"
import { PlatformControlsProvider } from "@razzia/extensions/presentation/platform-controls"
import Button from "@razzia/web/components/Button"
import i18n from "@razzia/web/i18n"
import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/index.css"

// Actual application component/styles; synthetic presence and intercepted HTTP only.
const presence = {
  v: 1, gameId: "roster-proof", seq: 1, phoneInviteOnly: false,
  registeredTotal: 3, connectedNow: 1, disconnectedNow: 1, notJoinedNow: 1,
  players: [
    { rosterPlayerId: "example-a", clientId: "example-a", displayName: "משתתפת לדוגמה", phoneE164: "+12025550101", source: "phone", status: "connected", points: 100, answeredCurrentQuestion: true },
    { rosterPlayerId: "example-b", clientId: "example-b", displayName: "משתתף מנותק", phoneE164: null, source: "web", status: "disconnected", points: 40, answeredCurrentQuestion: false },
    { rosterPlayerId: "example-c", displayName: "מוזמנת לדוגמה", phoneE164: "+12025550103", source: "phone", status: "not_joined", points: 0, answeredCurrentQuestion: false },
  ],
}
useManagerStore.setState({ gameId: "roster-proof", hostPresence: presence })
window.__rosterProof = { i18n, presence, setPresence: (next) => useManagerStore.setState({ hostPresence: next }) }
await i18n.changeLanguage("he")
function Fixture() {
 const [open, setOpen] = useState(true)
 return <I18nextProvider i18n={i18n}><ApplicationDirection><PlatformControlsProvider Button={Button}>
   <button data-testid="host-bottom-players-btn" onClick={() => setOpen(true)}>Open fixture</button>
   <HostPlayersModal open={open} onOpenChange={setOpen} />
 </PlatformControlsProvider></ApplicationDirection></I18nextProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
