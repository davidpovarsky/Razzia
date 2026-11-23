# Local Windows commands

All scripts run from this repository without changing the machine-wide Node 22 installation.

- Run server: `powershell -ExecutionPolicy Bypass -File .\scripts\local\Start-Razzia.ps1`
- Run baseline checks: `powershell -ExecutionPolicy Bypass -File .\scripts\local\Verify-Razzia.ps1`
- Browser manager: http://localhost:3000/manager
- Browser player: http://localhost:3000/
- Socket API: http://localhost:3001/api/health

Never commit .env or config/. Keep E2E fixture data separate. Stop development servers before running E2E tests (both use ports 3000/3001). Do not expose ports on public network.
