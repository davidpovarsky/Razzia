/** .tadazz authoring CLI; legacy theme-authoring.ts remains compatible. */
import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import {
  packageManifestSchema,
  packagePath,
  runtimeSnapshotSchema,
  rendererMessageSchema,
  parentMessageSchema,
} from "../src/core/packages/index"
import {
  packPackage,
  inspectPackage,
  packageSha,
} from "../src/server/packages/index"
import { createPackageFixture } from "../src/testkit/package-fixtures"
const [command, ...args] = process.argv.slice(2)
const requireArg = (i: number) => {
  if (!args[i]) {
    throw new Error(`Missing argument ${i + 1}`)
  }

  return args[i]
}

async function remote(suffix: string, init: RequestInit = {}) {
  const server = process.env.TADAZZ_PACKAGE_SERVER,
    token = process.env.TADAZZ_PACKAGE_TOKEN

  if (!server || !token) {
    throw new Error(
      "Set TADAZZ_PACKAGE_SERVER and TADAZZ_PACKAGE_TOKEN privately",
    )
  }

  const url = new URL(server)

  if (
    url.protocol !== "https:" &&
    !(
      process.env.TADAZZ_REMOTE_QA === "1" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    )
  ) {
    throw new Error("HTTPS required")
  }

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${token}`)

  if (process.env.TADAZZ_PACKAGE_WORKSPACE) {
    headers.set("X-Tadazz-Workspace", process.env.TADAZZ_PACKAGE_WORKSPACE)
  }

  const response = await fetch(`${url.origin}/api/packages${suffix}`, {
    ...init,
    headers,
    redirect: "error",
  })

  if (!response.ok) {
    throw new Error(
      `Package request failed ${response.status}: ${await response.text()}`,
    )
  }

  return response
}

const aliases = new Map([
  ["validate", "inspect"],
  ["build", "action"],
  ["rollback", "action"],
])

switch (aliases.get(command) ?? command) {
  case "scaffold": {
    const directory = path.resolve(requireArg(0))

    if (fs.existsSync(directory)) {
      throw new Error("Scaffold destination must be new")
    }

    const kind = z
      .enum(["theme", "game", "complete", "declarative"])
      .parse(args[1] ?? "complete")
    const fixture = createPackageFixture(kind, args[2] ?? "arcade")
    fs.mkdirSync(directory, { recursive: true })
    for (const [file, bytes] of fixture.files) {
      const target = path.join(directory, packagePath(file))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, bytes)
    }
    fs.writeFileSync(
      path.join(directory, "manifest.json"),
      JSON.stringify(fixture.manifest, null, 2),
    )
    console.log(
      JSON.stringify({ status: "SYNTHETIC_STARTER", directory, kind }),
    )

    break
  }

  case "fixtures": {
    const directory = path.resolve(requireArg(0))
    fs.mkdirSync(directory, { recursive: true })
    for (const [kind, style] of [
      ["theme", "arcade"],
      ["theme", "cinematic"],
      ["theme", "playful"],
      ["game", "arcade"],
      ["complete", "arcade"],
      ["declarative", "arcade"],
    ] as const) {
      const fixture = createPackageFixture(kind, style)
      inspectPackage(fixture.bytes)
      fs.writeFileSync(
        path.join(directory, `${kind}-${style}.tadazz`),
        fixture.bytes,
      )
    }
    console.log(JSON.stringify({ status: "FIXTURES_VALIDATED", directory }))

    break
  }

  case "pack": {
    const directory = fs.realpathSync(requireArg(0)),
      output = path.resolve(requireArg(1))
    const manifest = packageManifestSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
      ),
    )
    const files = new Map<string, Buffer>()
    function walk(folder: string) {
      for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, item.name)

        if (item.isSymbolicLink()) {
          throw new Error("Symlinks forbidden")
        }

        if (item.isDirectory()) {
          walk(file)
        } else if (item.isFile()) {
          const name = packagePath(
            path.relative(directory, file).split(path.sep).join("/"),
          )

          if (name !== "manifest.json") {
            files.set(name, fs.readFileSync(file))
          }
        } else {
          throw new Error("Special file forbidden")
        }
      }
    }
    walk(directory)
    manifest.files = manifest.files.map((f) => {
      const bytes = files.get(f.path)

      if (!bytes) {
        throw new Error(`Missing ${f.path}`)
      }

      return { ...f, bytes: bytes.length, sha256: packageSha(bytes) }
    })
    const bytes = packPackage(manifest, files)
    inspectPackage(bytes)
    fs.writeFileSync(output, bytes, { flag: "wx" })
    console.log(
      JSON.stringify({
        output,
        sourceDigest: packageSha(bytes),
        bytes: bytes.length,
      }),
    )

    break
  }

  case "inspect": {
    const { report } = inspectPackage(fs.readFileSync(requireArg(0)))
    console.log(JSON.stringify(report, null, 2))

    break
  }

  case "schema":
    fs.writeFileSync(
      requireArg(0),
      JSON.stringify(z.toJSONSchema(packageManifestSchema), null, 2),
    )

    break

  case "schema-runtime":
    fs.writeFileSync(
      requireArg(0),
      JSON.stringify(
        {
          snapshot: z.toJSONSchema(runtimeSnapshotSchema),
          rendererMessage: z.toJSONSchema(rendererMessageSchema),
          parentMessage: z.toJSONSchema(parentMessageSchema),
        },
        null,
        2,
      ),
    )

    break

  case "preview": {
    const id = requireArg(0)
    const receipt: unknown = await (
      await remote(`/uploads/${encodeURIComponent(id)}`)
    ).json()
    const url = new URL("/manager/config", process.env.TADAZZ_PACKAGE_SERVER)
    url.searchParams.set("packageUpload", id)

    if (process.env.TADAZZ_PACKAGE_WORKSPACE) {
      url.searchParams.set(
        "packageWorkspace",
        process.env.TADAZZ_PACKAGE_WORKSPACE,
      )
    }

    console.log(
      JSON.stringify(
        {
          receipt,
          previewUrl: url.href,
          authentication: "Open in your authenticated manager session",
        },
        null,
        2,
      ),
    )

    break
  }

  case "upload": {
    const bytes = fs.readFileSync(requireArg(0))
    inspectPackage(bytes)
    const response = await remote("/uploads", {
      method: "POST",
      body: bytes,
      headers: { "Idempotency-Key": packageSha(bytes) },
    })
    console.log(await response.text())

    break
  }

  case "list":
    console.log(await (await remote("")).text())

    break

  case "status":
    console.log(
      await (
        await remote(`/uploads/${encodeURIComponent(requireArg(0))}`)
      ).text(),
    )

    break

  case "action": {
    console.log(
      await (
        await remote(
          `/uploads/${encodeURIComponent(requireArg(0))}/${command}`,
          { method: "POST" },
        )
      ).text(),
    )

    break
  }

  case "approve": {
    const body = fs.readFileSync(requireArg(1), "utf8")
    console.log(
      await (
        await remote(`/uploads/${encodeURIComponent(requireArg(0))}/approval`, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
        })
      ).text(),
    )

    break
  }

  case "install": {
    const id = encodeURIComponent(requireArg(0))
    const receipt = (await (await remote(`/uploads/${id}`)).json()) as {
      revision: number
    }
    const body = JSON.stringify({
      expectedRevision: receipt.revision,
      selected: args.slice(1),
    })
    console.log(
      await (
        await remote(`/uploads/${id}/install`, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
        })
      ).text(),
    )

    break
  }

  case "export": {
    const response = await remote(
      `/uploads/${encodeURIComponent(requireArg(0))}/export`,
      { method: "POST" },
    )
    const bytes = Buffer.from(await response.arrayBuffer())
    inspectPackage(bytes)
    fs.writeFileSync(requireArg(1), bytes, { flag: "wx" })
    console.log("EXPORTED_PORTABLE_PACKAGE")

    break
  }

  default:
    throw new Error(
      "Commands: scaffold DIR [theme|game|complete|declarative] [arcade|cinematic|playful], fixtures DIR, pack DIR OUTPUT.tadazz, validate FILE, inspect FILE, schema OUTPUT, upload FILE, list, status ID, preview ID, build ID, approve ID REVIEW.json, install ID CONTENT_IDS..., rollback ID, export ID OUTPUT.tadazz",
    )
}
