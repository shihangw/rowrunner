import {rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// A removed source file must not survive in a locally packed dist directory.
await rm(fileURLToPath(new URL('../dist/', import.meta.url)), {
  recursive: true,
  force: true,
});
