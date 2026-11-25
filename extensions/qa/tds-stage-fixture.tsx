import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/i18n"
import "@razzia/web/index.css"
import { createRoot } from "react-dom/client"
import { useState } from "react"
import { STATUS } from "@razzia/common/types/game/status"
import { resolveShowTheme, RAZZIA_THEME_ID } from "../src/core"
import {
  useRoomJoin,
  RoomJoinMetadata,
  RoomQrCode,
} from "../src/presentation/room-join"
import {
  ShowViewportFrame,
  ViewportBackdropLayer,
} from "../src/presentation/show-themes/viewport"
import { Button, PlatformScope } from "../src/platform-ui"

function Decoration() {
  return (
    <div
      data-testid="decoration"
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(transparent, rgb(0 0 0 / 0.05))",
      }}
    />
  )
}
function Join({ pin, manager }: { pin: string; manager: boolean }) {
  const join = useRoomJoin({
    inviteCode: pin,
    managerLocked: manager ? false : undefined,
    directory: { dialNumber: "TEST-NO-CALLS", phoneE164: "+10000000000" },
  })

  return (
    <>
      <output data-testid="join-contract">{JSON.stringify(join)}</output>
      <RoomJoinMetadata join={join} />
      {join.qrUrl && <RoomQrCode size={256} value={join.qrUrl} />}
    </>
  )
}
function Fixture() {
  const [pin, setPin] = useState("246810"),
    [mounted, setMounted] = useState(true)
  const [manager, setManager] = useState(false),
    [original, setOriginal] = useState(false)
  const theme = resolveShowTheme({
    role: "manager",
    selection: original
      ? { id: RAZZIA_THEME_ID, version: "1.0.0", overrides: {} }
      : undefined,
  })

  return (
    <ShowViewportFrame
      theme={theme}
      envelope={null}
      statusName={STATUS.SHOW_ROOM}
      data-testid="fixture-viewport"
      className="relative isolate flex h-dvh max-h-dvh w-full flex-col overflow-hidden"
    >
      <PlatformScope
        context="platform.host"
        style={{ position: "relative", zIndex: 20 }}
      >
        <Button onClick={() => setPin(pin === "246810" ? "135790" : "246810")}>
          Switch room
        </Button>
        <Button onClick={() => setMounted(!mounted)}>Toggle join mount</Button>
        <Button onClick={() => setManager(!manager)}>Toggle manager</Button>
        <Button onClick={() => setOriginal(!original)}>
          Toggle original theme
        </Button>
      </PlatformScope>
      <main style={{ flex: 1, position: "relative", zIndex: 10 }}>
        {mounted && <Join pin={pin} manager={manager} />}
      </main>
      <ViewportBackdropLayer component={Decoration} />
      <footer
        data-testid="fixture-footer"
        style={{ position: "relative", zIndex: 20 }}
      >
        Synthetic host footer
      </footer>
    </ShowViewportFrame>
  )
}
const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Missing fixture root")
}

createRoot(rootElement).render(<Fixture />)
