# Remote verification commands

Run only inside the authorized disposable `/cleanup` Linux QA container with
`TADAZZ_REMOTE_QA=1`; never launch these game/browser commands on the owner's PC.
Use fresh temporary CONFIG_PATH directories created by the checked-in configs,
no published ports and no production volumes, account data or provider secrets.

```
pnpm build
pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
pnpm exec tsc --noEmit -p packages/socket/tsconfig.json
pnpm exec tsc --noEmit -p extensions/tsconfig.json
pnpm exec tsc --noEmit -p packages/e2e/tsconfig.json
pnpm exec tsc --noEmit -p extensions/tsconfig.qa.json
pnpm test --maxWorkers 2 --reporter=json --outputFile=/evidence/root-tests.json
pnpm --filter @razzia/extensions test --maxWorkers 2 --reporter=json --outputFile=/evidence/extension-tests.json
python3 /tmp/quick_validate.py .agents/skills/tadazz-theme-creator
python3 -m unittest discover -s .agents/skills/tadazz-theme-creator/tests -v
pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts schema /evidence/theme-manifest.schema.json
pnpm --filter @razzia/e2e exec playwright test --config playwright.theme-installation.config.ts
pnpm --filter @razzia/e2e exec playwright test --config playwright.cleanup-theme.config.ts
pnpm --filter @razzia/e2e exec playwright test --config playwright.billing.config.ts
pnpm exec oxlint --format=json
```

The installation test invokes the real authoring CLI's `qa` command; that starts
the authenticated `playwright.theme-preview.config.ts` matrix against the running
private fixture. It does not start a second local game or expose a public preview.

Full lint intentionally remains reported as FAIL; the focused 28-file invocation
is preserved in focused-lint.json. Separate source snapshots, build logs, final
source identity and each report distinguish historical failures from final PASS.

The actual Dockerfile was built through a private resource-limited BuildKit
builder. The candidate ran with `--network none`, no host ports and its own
throwaway config. nginx -t, health, WASM, native SQLite availability and anonymous
401 on enabled private theme/media routes passed. The candidate and builder were
stopped. No production container was restarted by this task.

BuildKit used a task-private Buildx v0.38.2 binary (official release SHA256
`46c0f334772de3cb0b341cc415caf7339fb5cfc8b8438ebcb5a10e7f23800d36`),
without installing a system plugin or changing the default builder. Its isolated
Docker-container driver used `memory=4g,cpu-quota=200000,cpu-period=100000` as
supported by the [official Docker driver documentation](https://docs.docker.com/build/builders/drivers/docker-container/).

Delivery text logs normalize trailing whitespace only; raw run logs remain in the private remote evidence directory.
