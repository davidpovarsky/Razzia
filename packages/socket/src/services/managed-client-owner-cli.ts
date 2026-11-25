import { z } from "zod"
import {
  createManagedClientValidator,
  managedClientGameId,
} from "@razzia/common/validators/managed-clients"
import { ManagedClientOwnerService } from "./managed-client-owner"
import { ManagedClientFailure } from "./managed-clients"

const base = z.object({ ownerId: z.uuid(), quizId: managedClientGameId })
const commandSchema = z.discriminatedUnion("operation", [
  base
    .extend({
      operation: z.literal("create"),
      name: createManagedClientValidator.shape.name,
      requestId: z.uuid(),
    })
    .strict(),
  base.extend({ operation: z.literal("lookup"), requestId: z.uuid() }).strict(),
  base.extend({ operation: z.literal("rotate"), clientId: z.uuid() }).strict(),
])

/** Explicit host-operator mode. It never invents a user session or opens a listener. */
export async function executeManagedClientOwnerCommand(input: unknown) {
  const parsed = commandSchema.safeParse(input)

  if (!parsed.success) {
    throw new ManagedClientFailure("client-invalid-request", 400)
  }

  const command = parsed.data
  const service = new ManagedClientOwnerService()
  await service.requireOwnedGame(command.ownerId, command.quizId)

  if (command.operation === "create") {
    return service.create(command.ownerId, {
      name: command.name,
      gameIds: [command.quizId],
      requestId: command.requestId,
    })
  }

  const client =
    command.operation === "lookup"
      ? service.findCreation(command.ownerId, command.requestId)
      : service.get(command.ownerId, command.clientId)

  if (client && !client.gameIds.includes(command.quizId)) {
    throw new ManagedClientFailure("client-game-unavailable", 404)
  }

  return command.operation === "lookup"
    ? { client }
    : service.rotate(command.ownerId, command.clientId)
}

export async function runManagedClientOwnerCli(): Promise<void> {
  let input = ""

  try {
    process.stdin.setEncoding("utf8")

    for await (const chunk of process.stdin) {
      input += String(chunk)

      if (Buffer.byteLength(input, "utf8") > 16_384) {
        throw new ManagedClientFailure("client-invalid-request", 400)
      }
    }

    const result = await executeManagedClientOwnerCommand(
      JSON.parse(input) as unknown,
    )
    // The caller must capture this single response privately: create/rotate
    // intentionally disclose the credential once and never write it to storage.
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
  } catch (error) {
    const failure = error instanceof ManagedClientFailure ? error : null
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        error: failure?.code ?? "client-invalid-request",
        ...failure?.details,
      })}\n`,
    )
    process.exitCode = 1
  }
}
