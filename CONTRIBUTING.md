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
imports such as `rowrunner/scene` remain independent of implementation filenames.

## Style and agent instructions

[AGENTS.md](AGENTS.md) is the short entry point to the guides in `agents/`.
The [coding style guide](agents/style_guide.md) links to Google's JavaScript and
TypeScript conventions and documents local adaptations, including descriptive
snake_case filenames and Prettier-managed formatting. See the
[architecture guide](agents/architecture.md) for library boundaries and ownership.

ESLint owns language and correctness rules; Prettier owns layout. TypeScript is
pinned to a version supported by TypeScript ESLint. Upgrade them together.
Generated build output and vendored assets are excluded from lint and formatting.

## Checks

```sh
npm run lint          # ESLint, no warnings
npm run lint:fix      # Apply automatic fixes, then review the diff
npm run format       # Prettier
npm run check        # Lint, formatting, types, and tests
npm run build:example
```

For narrower work, `npm test` builds the library and runs runtime and public-type
tests; `npm run typecheck` also checks the example. Follow the verification
scope in [the development guide](agents/development.md). Inspect visual changes in the running demo.

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
