import { z } from "zod"

const posterPath =
  /^(?:\/media\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|gif)|\/tadazz-show\/(?:family-mixup\/poster\.webp|gallery\/[a-z0-9-]+-backdrop\.png|originals\/[a-z0-9-]+\/poster\.png|v4\/show-stage\.webp))$/u

/** Game covers can use account media or the bundled catalogue artwork. */
export const gamePosterUrlSchema = z
  .string()
  .max(2048)
  .refine((url) => posterPath.exec(url)?.[0] === url)
