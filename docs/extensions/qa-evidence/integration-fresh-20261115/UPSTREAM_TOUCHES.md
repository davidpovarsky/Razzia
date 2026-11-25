# Manager-approved integration dependency seams
Before editing, root manager authorizes ONLY:
- pnpm-workspace.yaml packages: add exact extensions/src/mcp-app member.
- pnpm-lock.yaml: add that importer and missing packages/snapshots from accepted private60d lock; preserve all existing root resolutions/entries.
- Dockerfile dependency-manifest COPY: include nested MCP package.json before frozen root install.
Actual baseline8a43 parentTC passed;47e has38 missing SDK/cascading diagnostics without nested graph,0 MCP diagnostics with cached graph, plus independent Phone cleanup type issue.
No parent source/test exclusion, type shim, SDK patch, guard/baseline change, root dependency upgrade or production deployment.
All42 new package records copied from accepted private lock, versions/integrities retained. Three shared snapshot Node type edges differ between locks: retain ROOT26.6.5 for cors/ws/engine.io, private importer still directly pins22.10.0. Actual new graph TC/SDK tests required, not assumed identical runtime validation.
Validation planned: lock semantic preservation, standard frozen offline workspace installer with normal manifest set (including Docker COPY), parent TypeScript and private SDK checks under real installed graph. No test pass or complete fresh install claimed by this edit.

Before SHA256:
{
  "pnpm-workspace.yaml": "0ece424c7aa68f6f205e61720de504a31e513b0dbb00e4b8fe0d9e0f51031502",
  "pnpm-lock.yaml": "f2e3f2183bc308e7e113a23f2ae901d98aade9a173c6b16019d014072684b9a0",
  "Dockerfile": "d8dbdb1db58a82ac471977535db4daa8ec27ac8d7ece2f12cf167519923ef73f"
}
