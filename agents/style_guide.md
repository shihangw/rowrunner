# Coding style

Use the [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
for JavaScript and the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
for TypeScript. Read the relevant section when making a style decision that the
local tools do not cover. These links are the upstream references; this file
records the repository's conventions and deliberate adaptations.

- Use two-space indentation, semicolons, single-quoted strings, and trailing
  commas. Aim for 80-column lines. Prettier owns formatting, including wrapping
  imports and spacing inside braces; do not hand-format around it.
- Use braces for control flow and one variable declaration per statement.
- Prefer `const`; use `let` only for reassignment. Do not use `var`.
- Prefer named ESM exports, strict equality, object shorthand, and rest/spread
  syntax. Framework configuration files may use required default exports.
- Use descriptive lowerCamelCase names for variables and functions, PascalCase
  for types and classes, and CONSTANT_CASE for module-level immutable constants.
  Avoid abbreviations except established math coordinates and loop indices.
- Use descriptive `snake_case` implementation filenames, such as
  `progress_sink.ts`, `scene_renderer.ts`, and `example_http_server.ts`. Test
  files use `<name>.test.js`; declaration files use `<name>.d.ts`. Keep existing
  kebab-case world/runner directories, conventional tool filenames such as
  `eslint.config.js`, and standard documents such as `README.md` and `AGENTS.md`.
  Preserve upstream asset filenames.
- Keep explicit `.js` extensions in library-relative imports for Node ESM.
  The Vite/tsx example may import `.ts` entrypoints. Use `import type` for types.
- Keep strict TypeScript. Use `unknown` and narrow it instead of adding `any`.
  Infer public data shapes from Zod schemas and validate external input at its
  boundary. Avoid redundant JSDoc type annotations in TypeScript.
- Document public behavior, units, ownership, and non-obvious decisions. Comments
  should explain intent rather than repeat the code.

`eslint.config.js` enforces language and correctness rules with ESLint and
TypeScript ESLint. `.prettierrc.json` controls layout. This is a Google-based
project style, not a claim of exact compliance with every upstream convention.
Do not disable rules globally to get a change through. Fix the issue or use a
narrow suppression with a concrete explanation.
