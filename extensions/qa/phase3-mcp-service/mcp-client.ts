import { createRequire } from "node:module"
import type {
  Client as McpClient,
  StreamableHTTPClientTransport as McpStreamableHTTPClientTransport,
} from "../../src/mcp-app/node_modules/@modelcontextprotocol/client/dist/index.d.mts"

const requireFromMcpApp = createRequire(
  new URL("../../src/mcp-app/package.json", import.meta.url),
)

const { Client, StreamableHTTPClientTransport } = requireFromMcpApp(
  "@modelcontextprotocol/client",
) as {
  Client: typeof McpClient
  StreamableHTTPClientTransport: typeof McpStreamableHTTPClientTransport
}

export { Client, StreamableHTTPClientTransport }
