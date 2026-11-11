import { useState } from "react"
import {
  Button,
  Card,
  Badge,
  Dialog,
  Toolbar,
  HostDisplayControls,
  HostControlBar,
  HostAudioControls,
  Menu,
  MenuItem,
} from "../index"
import { ExampleTable } from "./stories"
import {
  resolveRoomJoin,
  RoomQrCode,
  RoomJoinMetadata,
} from "../../presentation/room-join"

const exampleJoin = resolveRoomJoin({
  origin: "https://example.invalid",
  inviteCode: "246810",
  role: "spectator",
  locked: false,
})
function ExampleAudioSlot() {
  return <Button disabled>Example audio controls slot</Button>
}
export function Layouts() {
  const [message, setMessage] = useState(
    "Synthetic examples, no live operations",
  )
  return (
    <section id="layouts" aria-labelledby="layouts-title">
      <h2 id="layouts-title">Composition templates</h2>
      <p role="status">{message}</p>
      <Card>
        <Toolbar label="Example Studio page">
          <h3>Example Studio</h3>
          <Button
            variant="primary"
            onClick={() => setMessage("Example create requested")}
          >
            Create example game
          </Button>
        </Toolbar>
        <div className="catalog-layout-grid">
          {["Knowledge", "Music", "Celebration"].map((name) => (
            <Card key={name}>
              <Badge>Example game</Badge>
              <h4>{name}</h4>
              <div className="catalog-row">
                <Button
                  onClick={() => setMessage(`Example ${name} edit requested`)}
                >
                  Edit example
                </Button>
                <Menu
                  trigger={
                    <Button aria-label={`Example ${name} actions`}>More</Button>
                  }
                >
                  <MenuItem
                    onSelect={() =>
                      setMessage(`Example ${name} duplicate requested`)
                    }
                  >
                    Duplicate example
                  </MenuItem>
                </Menu>
              </div>
            </Card>
          ))}
        </div>
      </Card>
      <Card>
        <h3>Host modal / dialog table</h3>
        <Dialog
          title="Synthetic roster"
          description="Forty synthetic rows, no phone numbers or server connection."
          trigger={<Button>Open roster template</Button>}
        >
          <Toolbar label="Synthetic roster summary">
            <Badge>40 registered examples</Badge>
            <Badge>0 connected examples</Badge>
          </Toolbar>
          <ExampleTable count={40} />
        </Dialog>
      </Card>
      <Card>
        <h3>Lobby join composition</h3>
        <p>
          Explicit synthetic example. Actual live PIN, QR, lock and dial-in
          belong to the room contract and selected show renderer.
        </p>
        <Badge>Example room — unlocked</Badge>
        <p>
          PIN <strong>{exampleJoin.displayPin}</strong>
        </p>
        <p>{exampleJoin.joinUrl}</p>
        <RoomQrCode value={exampleJoin.qrUrl!} />
        <RoomJoinMetadata join={exampleJoin} />
        <HostDisplayControls
          gameId="synthetic-example"
          onOpen={() => setMessage("Example audience display requested")}
          onCopy={() => setMessage("Example audience URL copy requested")}
          onPresent={() => setMessage("Example local presentation requested")}
        />
        <p>
          Host control scopes below use synthetic slots; no audio engine or live
          room is created.
        </p>
        <HostControlBar>
          <Button disabled>Example participants</Button>
        </HostControlBar>
        <HostAudioControls
          component={ExampleAudioSlot}
          manager
          isHostPresenting={false}
        />
      </Card>
    </section>
  )
}
