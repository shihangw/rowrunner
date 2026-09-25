# Third-party scenery

Selected 3D assets from **Space Kit**, created by **Kenney**, are used by the example under
**Creative Commons Zero (CC0)**. They can be redistributed with the example.

- Source: https://kenney.nl/assets/space-kit
- Download: https://kenney.nl/media/pages/assets/space-kit/20874c75ac-1677698978/kenney_space-kit.zip
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Downloaded: 2026-09-23
- Selected models: `satelliteDish`, `satelliteDish_detailed`, `craft_cargoA`,
  `craft_cargoB`, `craft_speederA`, `hangar_smallA`, `machine_generatorLarge`,
  `machine_wireless`, `rock_crystalsLargeA`, `rock_crystalsLargeB`, `rock_largeA`,
  `rock_largeB`.

Original OBJ/MTL source files and the unmodified license are in `src/assets/`.
`../scripts/ImportKenneySpaceKit.mjs` triangulates OBJ faces, rounds positions and colors,
and embeds a subset in `src/assets/space-kit.js`. The renderer scales, rotates,
and sometimes tints these models to fit each biome. No external requests are
needed at runtime. Bookie remains the existing locally modeled character.
