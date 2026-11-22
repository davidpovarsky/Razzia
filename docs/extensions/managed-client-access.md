# Managed client access

An account owner can create a named play-only client, assign existing native games, and share its six-digit numeric access code. Clients enter the code at `/client` without registration. A client sees its assigned game list and opens the existing native host page. The owner manages clients from Studio.

## Ownership and native playback

Assignments reference the original owner's native quiz IDs. They do not copy games, create duplicate packages, or impersonate the owner's account. A room's host principal is the managed client; its trusted `contentOwnerId` remains the resource owner. Native sidecars, installed themes, custom assets and audio, published compositions, billing entitlements and saved results use that owner. Existing room media and sandbox capability checks still limit access to content referenced by the room.

The ordinary manager middleware rejects managed-client claims. A managed session cannot read the owner's other games, edit games, install packages, access settings/results/billing, or establish an OAuth grant. Native room operations require the exact current session, assigned quiz, client host and room. Removing an assignment blocks further control and launch of that game. Deleting the owner's original game makes its assignment unavailable. Missing selected custom themes/compositions block launch instead of silently replacing the show.

## Codes and sessions

- Codes are six ASCII digits, including leading zeros, generated cryptographically and unique in the current code index.
- The private account database stores an HMAC digest of each code and a hash of each session identifier. Plaintext codes appear only in successful create/rotate responses.
- Create requests use a durable UUID request ID. Repeating one returns `409 client-create-already-completed` with its client ID; it does not create a duplicate or disclose the code again. A lost response can be recovered through lookup followed by an explicit rotation.
- Rotating re-enables the client and immediately invalidates prior sessions. Disabling invalidates all its sessions. Owner disablement and session expiry are checked on every request and privileged socket packet.
- Code login has persisted budgets of 30 attempts per address per 15 minutes and 300 attempts globally per hour, including successful, incorrect and malformed attempts. Standard forwarding headers cannot select a new budget. The optional `TADAZZ_MANAGED_CLIENT_TRUST_PROXY=loopback` contract additionally requires `TADAZZ_MANAGED_CLIENT_PROXY_HOST=tadazz.com` and an exact, case-insensitive match to the request Host. Only that pinned public host may accept a single valid `X-Tadazz-Client-IP` from an actual loopback TCP peer. Its public ingress must overwrite the dedicated header with its real connection peer, and the Node listener must remain unpublished. Duplicate headers are detected in the actual Node `rawHeaders`; missing adapter evidence, invalid values, other preview hosts and untrusted peers fall back to the real socket peer. Without both settings the proxy shares a peer bucket.
- The 12-hour session is an HttpOnly, SameSite=Lax cookie, Secure in production. Unsafe requests and socket handshakes require the same Origin/Host. Client mode never falls back to an owner's bearer token.
- Local owner changes disconnect affected sockets immediately. A 15-second sweep also bounds idle subscriptions after an external operator or account change; every action checks current authorization independently.

## HTTP contract

Owner routes use the existing authenticated account bearer and `/api/managed-clients`:

| Method and route        | Request                      | Response                                                        |
| ----------------------- | ---------------------------- | --------------------------------------------------------------- |
| `GET /`                 | —                            | Safe client summaries and the owner's assignable game summaries |
| `POST /`                | `{name, gameIds, requestId}` | `{client, code}`; code shown once                               |
| `PATCH /:id`            | `{name? , enabled?: false}`  | `{client}`                                                      |
| `PUT /:id/games`        | `{gameIds}`                  | `{client}`                                                      |
| `POST /:id/rotate-code` | `{}`                         | `{client, code}`; old sessions revoked                          |

Client routes use `/api/client-access`, the HttpOnly cookie and `X-Tadazz-Session: managed-client`:

| Method and route             | Request       | Response                                                |
| ---------------------------- | ------------- | ------------------------------------------------------- |
| `POST /session`              | `{code}`      | Public session metadata; cookie contains authentication |
| `GET /session`               | —             | Public session metadata                                 |
| `DELETE /session`            | —             | `{status: "signed-out"}`                                |
| `GET /games`                 | —             | Assigned game summaries only                            |
| `POST /games/:quizId/launch` | `{requestId}` | `{gameId, inviteCode, hostUrl}` from the native room    |

Launch retries reuse the same live room for the same client, quiz and UUID request ID. Reusing that key for another quiz returns a conflict. Room retry identity lasts only as long as the in-memory native room, matching the existing owner launch behavior.

Socket.IO client authentication sends `{managedClient: true}`; the server reads the HttpOnly cookie, never a JavaScript-stored code/token. The frontend keeps only a non-secret per-tab client-mode marker. Explicit successful owner login retires the managed cookie. Client login clears prior owner/room media cookies, then native launch issues a room-bound media ticket.

## Narrow owner operator mode

The compiled socket entrypoint supports `node dist/index.cjs --managed-client-owner`. It reads one JSON command from standard input and writes one JSON response. It opens no HTTP or WebSocket listener and creates no fabricated owner session. Use the running deployment's established private configuration and capture stdout in a private file: create/rotate responses contain the one-time credential and must not enter shared logs, tickets, Git or automated notifications.

Supported commands are:

```json
{"operation":"create","ownerId":"OWNER_UUID","quizId":"EXISTING_NATIVE_QUIZ_ID","name":"Client name","requestId":"OPERATION_UUID"}
{"operation":"lookup","ownerId":"OWNER_UUID","quizId":"EXISTING_NATIVE_QUIZ_ID","requestId":"OPERATION_UUID"}
{"operation":"rotate","ownerId":"OWNER_UUID","quizId":"EXISTING_NATIVE_QUIZ_ID","clientId":"CLIENT_UUID"}
```

Every command verifies that the real active owner owns the exact quiz through the native catalogue. Create assigns that quiz through the same validated service used by the owner API. Lookup returns metadata only, and rotate also requires that the identified client is assigned that quiz. On an uncertain create result, look up its existing request ID; never retry with a fresh ID. If the original code was lost, rotate deliberately and disclose only the replacement to the owner.
