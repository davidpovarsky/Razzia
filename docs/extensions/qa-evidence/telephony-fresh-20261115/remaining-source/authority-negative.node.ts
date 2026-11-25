import assert from "node:assert/strict"
import { after, test } from "node:test"
import { randomBytes, randomUUID } from "node:crypto"
import { readdirSync } from "node:fs"
import type NativeGame from "@razzia/socket/services/game"
import type { RealGameFacade } from "../../../../../extensions/src/server/phone-lifecycle-v2/game-facade"
import type { RequestBoundServiceVerifier } from "../../../../../extensions/src/telephony/pilot-runtime/service-auth-v2/request-bound-verifier"
import {
  account,
  auth,
  close,
  getAccountDb,
  nativeGame,
  owner,
  participant,
  provision,
  record,
  registration,
  remember,
  registry,
  room,
  rootUnchanged,
  SESSION_ROLES,
  signFixtureClaims,
  snapshot,
  trackFactory,
  UnmountedPhoneAuthority,
} from "./actual-auth-backend"

after(close)

test("R-AUTH-01 invalid manager proofs/profile/account state cannot initialize authority", async () => {
  const r = await room(),
    before = readdirSync(r.root)
  const foreign = await owner(),
    unverified = await room(await owner(false))
  const unverifiedBefore = readdirSync(unverified.root)
  const player = await auth.mintToken(r.subject.user.id, SESSION_ROLES.PLAYER)
  remember(player.token)
  const ticket = remember(
    await auth.mintJoinTicket(r.subject.user.id, r.game.gameId, "Phone"),
  )
  const noSid = await signFixtureClaims({ ...r.subject.claims, sid: undefined })
  const expired = await signFixtureClaims({
    ...r.subject.claims,
    exp: Math.floor(Date.now() / 1000) - 1,
  })
  const unknownSid = await signFixtureClaims({
    ...r.subject.claims,
    sid: randomUUID(),
  })
  const cases = [
    ["missing", ""],
    ["malformed", "not-a-jwt"],
    ["player-role", player.token],
    ["join-ticket-purpose", ticket],
    ["missing-sid", noSid],
    ["expired-jwt", expired],
    ["unknown-sid", unknownSid],
    ["foreign-owner", foreign.token],
  ] as const
  for (const [, token] of cases) {
    await assert.rejects(r.factory.initializeAuthority(token, r.game.gameId))
    rootUnchanged(r, before)
  }
  await assert.rejects(
    unverified.factory.initializeAuthority(
      unverified.subject.token,
      unverified.game.gameId,
    ),
  )
  rootUnchanged(unverified, unverifiedBefore)
  getAccountDb()
    .prepare("UPDATE accounts SET disabled=1 WHERE id=?")
    .run(r.subject.user.id)
  try {
    await assert.rejects(
      r.factory.initializeAuthority(r.subject.token, r.game.gameId),
    )
  } finally {
    getAccountDb()
      .prepare("UPDATE accounts SET disabled=0 WHERE id=?")
      .run(r.subject.user.id)
  }
  rootUnchanged(r, before)
  const configured = process.env.JWT_SECRET
  try {
    process.env.JWT_SECRET = randomBytes(32).toString("hex")
    await assert.rejects(
      r.factory.initializeAuthority(r.subject.token, r.game.gameId),
    )
  } finally {
    process.env.JWT_SECRET = configured
  }
  const accountMode = process.env.TADAZZ_ACCOUNTS_ENABLED
  try {
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
    await assert.rejects(
      r.factory.initializeAuthority(r.subject.token, r.game.gameId),
    )
  } finally {
    process.env.TADAZZ_ACCOUNTS_ENABLED = accountMode
  }
  rootUnchanged(r, before)
  await r.factory.initializeAuthority(r.subject.token, r.game.gameId)
  record({
    case: "R-AUTH-01",
    managerProofDenials: cases.length,
    unverifiedOwnedGameDenied: true,
    disabledAccountDenied: true,
    secretProfileMismatchDenied: true,
    accountModeOffDenied: true,
    noAuthorityInitializationOnDenial: true,
    positiveControlReady: true,
  })
})

test("R-AUTH-02 service scope/capability and copied/released provenance deny before lifecycle access", async () => {
  const r = await room(),
    p = await provision(r),
    input = registration()
  const variants = [
    { ...p.address, owner: randomUUID() },
    { ...p.address, game: randomUUID() },
    { ...p.address, provider: "synthetic-other" },
    { ...p.address, service: randomUUID() },
    { ...p.address, version: 2 },
    { ...p.address, version: 0 },
  ]
  for (const address of variants) {
    await assert.rejects(r.factory.register(address, p.credential, input))
    assert.deepEqual(r.counters, { lifecycleRoots: 0, nativeJoin: 0 })
  }
  for (const capability of [
    "",
    "invalid",
    remember(randomBytes(32).toString("hex")),
  ]) {
    await assert.rejects(r.factory.register(p.address, capability, input))
    assert.deepEqual(r.counters, { lifecycleRoots: 0, nativeJoin: 0 })
  }
  // Inspect the real factory's private proof objects only in this fixture;
  // no fake verifier or new production accessor is introduced.
  const internals = r.factory as unknown as {
    verifier: RequestBoundServiceVerifier
    facades: WeakMap<NativeGame, RealGameFacade>
  }
  const context = internals.verifier.begin(
    p.address,
    p.credential,
    "register",
    (game) => internals.facades.get(game),
  )
  assert.equal(internals.verifier.verifyCurrent(context, "register"), true)
  assert.equal(
    internals.verifier.verifyCurrent({ ...context }, "register"),
    false,
  )
  internals.verifier.release(context)
  assert.equal(internals.verifier.verifyCurrent(context, "register"), false)
  assert.deepEqual(r.counters, { lifecycleRoots: 0, nativeJoin: 0 })
  const joined = await r.factory.register(p.address, p.credential, input)
  assert.equal(joined.ok, true)
  const before = snapshot(r)
  for (const address of variants) {
    await assert.rejects(r.factory.register(address, p.credential, input))
    assert.equal(snapshot(r), before)
  }
  assert.deepEqual(r.counters, { lifecycleRoots: 1, nativeJoin: 1 })
  record({
    case: "R-AUTH-02",
    wrongScopeVersionsDenied: variants.length,
    wrongCapabilitiesDenied: 3,
    copiedAndReleasedContextsDenied: 2,
    zeroLifecycleAccessBeforeControl: true,
    repeatedDenialsPreservedVictim: true,
    actualCounters: r.counters,
  })
})

test("R-AUTH-03 actual session revocation and password reset fence cached receipts; fresh owner can revoke", async () => {
  for (const mode of ["session-revoke", "password-reset"] as const) {
    const r = await room(),
      p = await participant(r),
      before = snapshot(r)
    const alternative = await auth.mintToken(
      r.subject.user.id,
      SESSION_ROLES.MANAGER,
    )
    remember(alternative.token)
    if (mode === "session-revoke")
      account.revokeAccountSession(r.subject.claims.sid!)
    else {
      const nextPassword = remember(randomBytes(24).toString("hex"))
      assert.equal(
        await account.resetPassword(
          r.subject.user.email,
          account.issueCode(r.subject.user.id, "reset"),
          nextPassword,
        ),
        true,
      )
      assert.equal(
        (await account.authenticate(r.subject.user.email, nextPassword))?.id,
        r.subject.user.id,
      )
      await assert.rejects(auth.verifyToken(alternative.token))
    }
    await assert.rejects(auth.verifyToken(r.subject.token))
    await assert.rejects(r.factory.register(p.address, p.credential, p.input))
    await assert.rejects(
      r.factory.operate(p.address, p.credential, p.operation),
    )
    assert.equal(snapshot(r), before)
    assert.deepEqual(r.counters, { lifecycleRoots: 1, nativeJoin: 1 })
    const fresh =
      mode === "session-revoke"
        ? alternative
        : await auth.mintToken(r.subject.user.id, SESSION_ROLES.MANAGER)
    remember(fresh.token)
    assert.ok((await auth.verifyToken(fresh.token)).sid)
    const revoked = await r.factory.revoke(
      fresh.token,
      {
        game: p.address.game,
        provider: p.address.provider,
        service: p.address.service,
      },
      { requestId: randomUUID(), expectedVersion: 1 },
    )
    assert.equal(revoked.receipt.state, "REVOKED")
    assert.equal(revoked.receipt.version, 2)
    assert.equal("credential" in revoked, false)
    assert.equal(snapshot(r), before)
    await assert.rejects(
      r.factory.operate(p.address, p.credential, p.operation),
    )
    record({
      case: "R-AUTH-03",
      mode,
      staleManagerDenied: true,
      cachedRegisterAndPollDenied: true,
      separateSessionDistinguished: true,
      freshOwnerRevocation: true,
      noNativeCompensation: true,
      actualCounters: r.counters,
    })
  }
})

test("R-AUTH-04 removed/reincarnated Game and new factory never recover old service/executor", async () => {
  const r = await room(),
    p = await participant(r),
    oldId = r.game.gameId
  assert.equal(registry.removeGame(oldId), true)
  await assert.rejects(r.factory.operate(p.address, p.credential, p.operation))
  const reincarnated = await nativeGame(r.subject)
  // Explicit hostile recovery fixture: a genuine new Game heap under the old ID.
  Object.defineProperty(reincarnated, "gameId", { value: oldId })
  registry.addGame(reincarnated)
  const before = JSON.stringify({
    old: r.game.players,
    replacement: reincarnated.players,
  })
  await assert.rejects(r.factory.operate(p.address, p.credential, p.operation))
  let newLifecycleAccess = 0
  const restarted = new UnmountedPhoneAuthority({
    authorityRoot: r.root,
    allowedProviders: ["synthetic-provider"],
    nativeAdoption: true,
    lifecycleRoot: () => {
      newLifecycleAccess++
      throw new Error("Unexpected restarted lifecycle access")
    },
  })
  trackFactory(restarted)
  await assert.rejects(
    restarted.activate(p.address, p.credential, {
      requestId: randomUUID(),
      expectedVersion: 1,
    }),
  )
  await assert.rejects(restarted.register(p.address, p.credential, p.input))
  await restarted.initializeAuthority(r.subject.token, oldId)
  const next = await restarted.issue(r.subject.token, {
    ...r.issue,
    requestId: randomUUID(),
  })
  assert.equal(next.receipt.ok, false)
  assert.equal("credential" in next, false)
  assert.equal(newLifecycleAccess, 0)
  assert.equal(
    JSON.stringify({ old: r.game.players, replacement: reincarnated.players }),
    before,
  )
  assert.deepEqual(r.counters, { lifecycleRoots: 1, nativeJoin: 1 })
  record({
    case: "R-AUTH-04",
    missingGameDenied: true,
    sameIdNewObjectDenied: true,
    restartedFactoryDeniedOldCredentials: true,
    noAutomaticAuthorityOverwrite: true,
    newLifecycleAccess,
    replacementPlayers: reincarnated.players.length,
  })
})

test("R-AUTH-05 actual service expiry and shortened persisted session expiry deny before native access", async () => {
  const service = await room(),
    p = await provision(service, 3000)
  const input = registration(),
    lease = service.reader.readCurrent(p.address)
  assert.ok(lease)
  await new Promise((done) =>
    setTimeout(done, Math.max(0, lease.expiresAt - Date.now()) + 30),
  )
  await assert.rejects(service.factory.register(p.address, p.credential, input))
  await assert.rejects(
    service.factory.activate(p.address, p.credential, {
      requestId: randomUUID(),
      expectedVersion: 1,
    }),
  )
  assert.deepEqual(service.counters, { lifecycleRoots: 0, nativeJoin: 0 })
  assert.deepEqual(service.reader.readCurrent(p.address), lease)
  const session = await room(),
    current = await provision(session)
  getAccountDb()
    .prepare("UPDATE sessions SET expires_at=? WHERE id=?")
    .run(Date.now() - 1, session.subject.claims.sid!)
  await assert.rejects(
    session.factory.register(
      current.address,
      current.credential,
      registration(),
    ),
  )
  await assert.rejects(auth.verifyToken(session.subject.token))
  assert.deepEqual(session.counters, { lifecycleRoots: 0, nativeJoin: 0 })
  record({
    case: "R-AUTH-05",
    wallClockLeaseExpired: true,
    activationAfterExpiryDenied: true,
    shortenedRealSessionExpiryDenied: true,
    noLifecycleOrNativeAccess: true,
  })
})
