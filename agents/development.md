# Development and verification

See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup, commands, repository layout,
packaging, and screenshot maintenance.

- Run checks relevant to the change. For changes spanning library behavior or
  shared tooling, run `npm run check` and `npm run build:example`.
- Add focused tests for behavior changes, not tests that restate formatting rules.
- Inspect rendering changes in the browser.
- TypeScript is pinned to the version supported by TypeScript ESLint. Upgrade
  these tools together and verify compatibility rather than bypass peer checks.
- Keep the README focused on use cases and getting started. Put detailed user
  APIs in `docs/` and development guidance in `agents/` or `CONTRIBUTING.md`.
- Keep `AGENTS.md` as a short index. Add focused guidance files here and link them
  from the index rather than expanding it into a manual.
