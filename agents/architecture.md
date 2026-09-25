# Architecture

Rowrunner is a TypeScript ESM library for progress-driven Three.js scenes.
The library lives in `src/`; runnable worlds, runners, assets, and live-input
adapters belong in the minimal TypeScript project in `examples/`.

- Keep the core independent of example worlds and runners. Custom content uses
  the plugin API; do not import example assets into the published library.
- Preserve public npm export paths and progress-input compatibility unless the
  task explicitly changes the API.
- Keep confirmed telemetry separate from presentation interpolation and effects.
- Release Three.js resources, timers, and input subscriptions on disposal.
- Do not edit generated output in `dist/` or `examples/dist/`. Kenney assets and
  the generated `examples/src/assets/space-kit.js` are excluded from linting and
  formatting. Preserve their license and attribution; use the import script to
  regenerate the model data.
