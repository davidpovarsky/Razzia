import { z } from "zod"

// Existing native games include UUID and legacy nanoid identifiers. Ownership
// is established by looking up the exact identifier in the owner's catalogue.
export const managedClientGameId = z.string().min(1).max(256)

const gameIds = z
  .array(managedClientGameId)
  .max(100)
  .refine((values) => new Set(values).size === values.length)
const name = z.string().trim().min(1).max(120)

export const createManagedClientValidator = z.strictObject({
  name,
  gameIds,
  requestId: z.uuid(),
})

export const updateManagedClientValidator = z
  .strictObject({ name: name.optional(), enabled: z.literal(false).optional() })
  .refine((value) => value.name !== undefined || value.enabled !== undefined)

export const assignManagedClientGamesValidator = z.strictObject({ gameIds })

export const managedClientLoginValidator = z.strictObject({
  code: z.string().regex(/^[0-9]{6}$/u),
})

export const managedClientLaunchValidator = z.strictObject({
  requestId: z.uuid(),
})
