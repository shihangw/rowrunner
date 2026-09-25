# Developing Rowrunner

For running or integrating Rowrunner, start with the [README](README.md).
This document covers work on the library and its example application.

## Setup

Use Node.js 22.13 or newer:

```sh
npm ci
npm start
```

The demo runs at http://127.0.0.1:3000. Its startup command builds the local library
before starting Vite and the Node progress API. After changing library source
while the demo is running, run `npm run build` to refresh its compiled modules.

## Repository layout

| Directory     | Purpose                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `src/`        | Published library: progress estimation, rendering, schemas, and plugin API |
| `examples/`   | Minimal TypeScript app, Node server, worlds, runners, and assets           |
| `test/`       | Runtime and behavior tests                                                 |
| `type-tests/` | Public TypeScript API checks                                               |
| `scripts/`    | Asset import tools                                                         |
| `docs/`       | User documentation and screenshots                                         |
| `agents/`     | Focused coding, architecture, and development guidance                     |

Keep example worlds and assets outside the core library. Place related content
in its world's or runner's directory, using `<name>_world.ts`, `<name>_runner.ts`,
`<name>_geometry.js`, and `<name>_sky_shader.js` where applicable. Public package
imports such as `@shihangw/rowrunner/scene` remain independent of implementation filenames.

## Style and agent instructions

[AGENTS.md](AGENTS.md) is the short entry point to the guides in `agents/`.
The [coding style guide](agents/style_guide.md) links to Google's JavaScript and
TypeScript conventions and documents local adaptations, including descriptive
snake_case filenames and Prettier-managed formatting. See the
[architecture guide](agents/architecture.md) for library boundaries and ownership.

ESLint extends Google's `gts` preset and adds strict boolean conditions for
TypeScript. Prettier owns layout. TypeScript is
pinned to a version supported by TypeScript ESLint. Upgrade them together.
Generated build output and vendored assets are excluded from lint and formatting.
The lint commands build declarations first because type-aware rules resolve the
example's imports through the library's published entrypoints.

## Checks

```sh
npm run lint          # ESLint, no warnings
npm run lint:fix      # Apply automatic fixes, then review the diff
npm run format       # Prettier
npm run check        # Lint, formatting, types, and tests
npm run build:example
npm run check:package # Build, pack, and verify an isolated package installation
```

For narrower work, `npm test` builds the library and runs runtime and public-type
tests; `npm run typecheck` also checks the example. Follow the verification
scope in [the development guide](agents/development.md). Inspect visual changes in the running demo.

GitHub Actions runs these checks for every pull request and pushes to `main` on
Node.js 22.13 (the supported minimum) and Node.js 24. CI also builds the example
and installs the packed library in a temporary consumer project. It checks all
exported entrypoints, generated declarations, the public type contracts, and a
progress estimate before a [publish dry run](https://docs.npmjs.com/cli/commands/npm-publish).
This checks package readiness without publishing or requiring npm credentials;
registry permissions and version availability are checked only during a real release.
The dry run allows already-published versions, so PRs do not need a version bump.

## Versions and releases

Release Please opens a version pull request after releasable commits reach `main`.
Use Conventional Commit messages or squash PR titles: `fix:` increments the patch
version, `feat:` increments the minor version, and `!` with a `BREAKING CHANGE:`
footer marks a breaking change. Before 1.0, breaking changes increment the minor
version. Documentation and CI-only `chore:` commits do not open a release PR.
The version pull request updates `package.json`, `package-lock.json`, the release
manifest, and the changelog together. Review and merge it when ready; ordinary
feature PRs do not edit version numbers.

Merging the version pull request creates a tagged GitHub release. To ship it,
open **Actions → Ship → Run workflow** from `main` and enter that release tag,
for example `v0.1.1`. The workflow checks the tagged source, packs the library,
and deploys a [public static example](https://shihangw.github.io/rowrunner/)
plus a [private Cloud Run canary](docs/cloud_run_canary.md). The public example
starts on live Solana totals and calls a browser-accessible RPC directly. The
canary includes the Node progress API for custom jobs. The release
workflow deploys both from the same tag before requesting QA approval.

After checking the canary, approve the waiting **npm-release** deployment in
GitHub Actions. The workflow verifies the saved tarball and publishes that exact
candidate as npm `latest`. Rejecting the deployment leaves npm unchanged. The
`npm-release` environment must require reviewer `shihangw`; the GitHub Pages site
must use **GitHub Actions** as its build source.

Before the first ship, add an npm
[trusted publisher](https://docs.npmjs.com/trusted-publishers/) for the existing
`@shihangw/rowrunner` package: GitHub user `shihangw`, repository `rowrunner`,
workflow filename `ship.yml`, and direct `npm publish` permission. Leave its
environment field set to `npm-release`. This one-time setting enables short-lived
GitHub Actions authentication; no npm token is stored in the repository.

## Packaging

```sh
npm pack
```

The prepack hook runs lint and tests, including the library build. The tarball
contains compiled ESM, generated declarations and source maps in `dist/`, sources
in `src/`, the README, and the license. Examples and development tooling remain
in this repository. Package consumers do not need a TypeScript loader.

Update public schemas, generated-type contracts, and user documentation together
when changing the API. Do not edit generated declarations or build output.

## README screenshots

Images in `docs/images/` are captures of the actual demo, using simulated migration
progress. Capture the viewport with its HUD, keep filenames descriptive, and use
compressed images. Update the screenshot and caption together when its scene
changes. Preserve third-party [asset attribution](examples/THIRD_PARTY.md).
