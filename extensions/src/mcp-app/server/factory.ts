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
import { tadaShowV1Schema } from "@razzia/extensions/core"
import { CONTRACT_VERSION, PREVIEW_RESOURCE } from "../contracts/schemas.ts"
import {
  descriptions,
  inputs,
  mutations,
  outputs,
  scopes,
  toolNames,
  widgetTools,
} from "../contracts/tools.ts"
import type {
  Dependencies,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import type { ToolName } from "../contracts/tools.ts"
import { authorize, validateConfig } from "./authorization.ts"
import { dispatch } from "./dispatch.ts"
import { guardedConnection } from "./connection.ts"
import { failureResult } from "./results.ts"

/** Creates ONE independent SDK server per session/request, never a shared
 * singleton transport. No HTTP listener, route mount, env, account or disk access. */
export function createTadazzMcpServer(
  configInput: ServerConfig,
  dependencies: Dependencies = {},
) {
  const config = validateConfig(configInput)
  const deps = Object.freeze({ ...dependencies })
  let connection: ReturnType<typeof guardedConnection>
  const server = registeredServer(config, deps, (_name, context, handler) =>
    connection.run(context, handler),
  )
  connection = guardedConnection(server, deps, config)
  return { connect: connection.connect, close: connection.close }
}

/** Official SDK HTTP entry owns protocol-era negotiation and per-request
 * transport lifetime. The enclosing HTTP boundary authenticates before parsing;
 * this callback independently verifies live authority/scopes before dispatch.
 * Only a handler is exposed, never the underlying unguarded SDK instance. */
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
      ...(name === "preview_game" ? { resourceUri: PREVIEW_RESOURCE } : {}),
      visibility,
    }
    const settings = {
      description: descriptions[name],
      inputSchema: inputs[name],
      outputSchema: outputs[name],
      annotations: {
        readOnlyHint: !mutations.has(name),
        destructiveHint: false,
        idempotentHint: true,
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
  // Placeholder static resource contains no simulated game, credentials or user data.
  // preview_game fails closed until an accepted SB adapter is injected.
  registerAppResource(
    server,
    "tadazz-preview",
    PREVIEW_RESOURCE,
    {
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: PREVIEW_RESOURCE,
          mimeType: RESOURCE_MIME_TYPE,
          text: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
          _meta: {
            ui: {
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
              },
            },
          },
        },
      ],
    }),
  )
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
          text: "# Tadazz authored-show v1\nUse format tada-show/version 1; unique stable card keys; 1-based answer indices; empty settings; no theme/audio edits or arbitrary media URLs. Existing authored-schema refinements and preflight are authoritative. Preview is a demo with no live room. Durable account save/download and real preview adapters may be unavailable.\n",
        },
      ],
    }),
  )
  return server
}
