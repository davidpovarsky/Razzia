import {
  McpServer,
  createMcpHandler,
  type ServerContext,
  type CallToolResult,
} from "@modelcontextprotocol/server"
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server"
import { z } from "zod"
import { FULL_SHOW_RESOURCE_V3 } from "../contracts/full-show-frame.ts"
import { tadaShowV1Schema } from "@razzia/extensions/core"
import { CONTRACT_VERSION, PREVIEW_RESOURCE } from "../contracts/schemas.ts"
import {
  descriptions,
  destructiveTools,
  inputs,
  mutations,
  outputs,
  scopes,
  toolNames,
  widgetTools,
  type ToolName,
} from "../contracts/tools.ts"
import type {
  Dependencies,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"

import { authorize, validateConfig } from "./authorization.ts"
import { dispatch } from "./dispatch.ts"
import { guardedConnection } from "./connection.ts"
import { failureResult } from "./results.ts"
import { preparePreviewUiResource } from "./preview-resource.ts"

// Creates ONE independent SDK server per session/request, never a shared
// singleton transport. No HTTP listener, route mount, env, account or disk access.
export function createTadazzMcpServer(
  configInput: ServerConfig,
  dependencies: Dependencies = {},
) {
  const config = validateConfig(configInput)
  const deps = Object.freeze({ ...dependencies })
  let connection: ReturnType<typeof guardedConnection> | undefined = undefined

  function requireGuardedConnection(): ReturnType<typeof guardedConnection> {
    if (connection === undefined) {
      throw new Error("Local state connection was read before initialization")
    }

    return connection
  }

  const server = registeredServer(config, deps, (_name, context, handler) =>
    requireGuardedConnection().run(context, handler),
  )
  connection = guardedConnection(server, deps, config)

  return {
    connect: requireGuardedConnection().connect,
    close: requireGuardedConnection().close,
  }
}

// Official SDK HTTP entry owns protocol-era negotiation and per-request
// transport lifetime. The enclosing HTTP boundary authenticates before parsing;
// this callback independently verifies live authority/scopes before dispatch.
// Only a handler is exposed, never the underlying unguarded SDK instance.
export function createTadazzMcpHttpHandler(
  configInput: ServerConfig,
  dependencies: Dependencies,
) {
  const config = validateConfig(configInput)
  const deps = Object.freeze({ ...dependencies })

  return createMcpHandler(
    () =>
      registeredServer(config, deps, async (name, _context, handler) => {
        try {
          const principal = await authorize(name, undefined, deps, config)

          return await handler(principal)
        } catch (error) {
          return failureResult(name, error, config)
        }
      }),
    { legacy: "stateless", responseMode: "json", maxRequestBodySize: 65_536 },
  )
}

function registeredServer(
  config: ServerConfig,
  deps: Dependencies,
  run: (
    name: ToolName,
    context: ServerContext,
    handler: (principal: VerifiedPrincipal) => Promise<CallToolResult>,
  ) => Promise<CallToolResult>,
) {
  const previewResource = deps.previewUiResource
    ? preparePreviewUiResource(deps.previewUiResource)
    : undefined
  const fullShowResource = deps.fullShowUiResourceV3
    ? preparePreviewUiResource(deps.fullShowUiResourceV3)
    : undefined
  const server = new McpServer(
    { name: "tadazz", version: CONTRACT_VERSION },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
      },
      maxToolInputElements: 100,
    },
  )
  for (const name of toolNames) {
    const visibility: Array<"model" | "app"> = widgetTools.has(name)
      ? ["model", "app"]
      : ["model"]
    const ui = {
      ...(name === "preview_game" && previewResource
        ? { resourceUri: PREVIEW_RESOURCE }
        : {}),
      ...(name === "preview_show" && fullShowResource
        ? { resourceUri: FULL_SHOW_RESOURCE_V3 }
        : {}),
      visibility,
    }
    const settings = {
      description: descriptions[name],
      inputSchema: inputs[name],
      outputSchema: outputs[name],
      annotations: {
        readOnlyHint: !mutations.has(name),
        destructiveHint: destructiveTools.has(name),
        idempotentHint:
          name !== "update_game_title" || Boolean(deps.semanticDrafts),
        openWorldHint: false,
      },
      _meta: {
        ui,
        securitySchemes: [{ type: "oauth2", scopes: [...scopes[name]] }],
      },
    }
    // Helpers normalize standard/compatibility UI metadata; only preview links a resource.
    registerAppTool(
      server,
      name,
      settings,
      async (args: unknown, context: ServerContext) =>
        run(name, context, (principal) =>
          dispatch(name, args, principal, deps, config),
        ),
    )
  }

  // No placeholder executable/UI resource is advertised without G's real static
  // artifact. Candidate data does not manufacture an artifact or its rights.
  if (previewResource) {
    registerAppResource(
      server,
      "tadazz-preview",
      PREVIEW_RESOURCE,
      {
        mimeType: RESOURCE_MIME_TYPE,
        _meta: {
          ui: {
            csp: previewResource.csp,
          },
        },
      },
      async () => ({
        contents: [
          {
            uri: PREVIEW_RESOURCE,
            mimeType: RESOURCE_MIME_TYPE,
            text: previewResource.read(),
            _meta: {
              ui: {
                csp: previewResource.csp,
              },
            },
          },
        ],
      }),
    )
  }

  if (fullShowResource) {
    registerAppResource(
      server,
      "tadazz-full-show-v3",
      FULL_SHOW_RESOURCE_V3,
      {
        mimeType: RESOURCE_MIME_TYPE,
        _meta: { ui: { csp: fullShowResource.csp } },
      },
      () =>
        Promise.resolve({
          contents: [
            {
              uri: FULL_SHOW_RESOURCE_V3,
              mimeType: RESOURCE_MIME_TYPE,
              text: fullShowResource.read(),
              _meta: { ui: { csp: fullShowResource.csp } },
            },
          ],
        }),
    )
  }

  server.registerResource(
    "tadazz-authoring-schema",
    "tadazz://authoring/v1/schema.json",
    { mimeType: "application/schema+json" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/schema+json",
          text: JSON.stringify({
            ...z.toJSONSchema(tadaShowV1Schema, { unrepresentable: "any" }),
            $id: "tadazz://authoring/v1/schema.json",
            $comment:
              "Generated from approved source8a43c99 tadaShowV1Schema. Source refinements and narrower MCP policy always execute; schema is guidance only. MVP: empty settings,50 cards,25 questions,32768 UTF8 bytes.",
          }),
        },
      ],
    }),
  )
  server.registerResource(
    "tadazz-authoring-guide",
    "tadazz://authoring/v1/guide.md",
    { mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: "# Tadazz authored-show v1\nUse format tada-show/version 1; unique stable card keys; 1-based answer indices; empty settings; no arbitrary media URLs or raw theme/audio overrides. Use apply_game_edit for bounded native theme/audio/background/picture edits and list_editing_assets for exact authorized asset references. Existing authored-schema refinements and preflight are authoritative. Preview is a demo with no live room. Durable account save/download and real preview adapters may be unavailable.\n",
        },
      ],
    }),
  )

  return server
}
