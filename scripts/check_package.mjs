// Verify the packed artifact outside the workspace, so local files cannot mask
// missing exports, declarations, or runtime dependencies.
import {strict as assert} from 'node:assert';
import {execFileSync} from 'node:child_process';
import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryDirectory = fileURLToPath(new URL('../', import.meta.url));
const npmCliPath = process.env.npm_execpath;
assert.ok(npmCliPath, 'Run this check with npm run check:package');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'rowrunner-package-'));

function runNpm(argumentsList, cwd, captureOutput = false) {
  return execFileSync(process.execPath, [npmCliPath, ...argumentsList], {
    cwd,
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

try {
  const packageManifest = JSON.parse(
    await readFile(join(repositoryDirectory, 'package.json'), 'utf8'),
  );
  const lockfile = JSON.parse(
    await readFile(join(repositoryDirectory, 'package-lock.json'), 'utf8'),
  );
  // CI runs the lint/test prepack checks through npm run check already.
  const [packedPackage] = JSON.parse(
    runNpm(
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporaryDirectory,
      ],
      repositoryDirectory,
      true,
    ),
  );
  const packedPaths = new Set(packedPackage.files.map((file) => file.path));
  for (const entrypoint of Object.values(packageManifest.exports)) {
    for (const target of [entrypoint.import, entrypoint.types]) {
      assert.ok(
        packedPaths.has(target.replace(/^\.\//, '')),
        `Missing ${target}`,
      );
    }
  }
  const tarballPath = join(temporaryDirectory, packedPackage.filename);
  await writeFile(
    join(temporaryDirectory, 'package.json'),
    JSON.stringify({
      name: 'rowrunner-package-check',
      private: true,
      type: 'module',
    }),
  );
  runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarballPath,
      `typescript@${lockfile.packages['node_modules/typescript'].version}`,
      `@types/node@${lockfile.packages['node_modules/@types/node'].version}`,
    ],
    temporaryDirectory,
  );
  await copyFile(
    join(repositoryDirectory, 'type-tests/public_api_contracts.ts'),
    join(temporaryDirectory, 'public_api_contracts.ts'),
  );
  const typeConfiguration = JSON.parse(
    await readFile(
      join(repositoryDirectory, 'type-tests/tsconfig.json'),
      'utf8',
    ),
  );
  typeConfiguration.compilerOptions.skipLibCheck = false;
  await writeFile(
    join(temporaryDirectory, 'tsconfig.json'),
    JSON.stringify(typeConfiguration),
  );
  execFileSync(
    process.execPath,
    [
      join(temporaryDirectory, 'node_modules/typescript/bin/tsc'),
      '-p',
      temporaryDirectory,
    ],
    {stdio: 'inherit'},
  );
  const entrypoints = Object.keys(packageManifest.exports).map(
    (subpath) =>
      packageManifest.name + (subpath === '.' ? '' : subpath.slice(1)),
  );
  await writeFile(
    join(temporaryDirectory, 'smoke.mjs'),
    `import {strict as assert} from 'node:assert';
const entrypoints = ${JSON.stringify(entrypoints)};
for (const entrypoint of entrypoints) await import(entrypoint);
const {ProgressSink} = await import(${JSON.stringify(packageManifest.name)});
const sink = new ProgressSink();
const now = Date.now();
sink.push({runId: 'package-check', completed: 1000, timestamp: now - 2000});
sink.push({runId: 'package-check', completed: 2000, timestamp: now});
assert.equal(sink.snapshot().rate, 500);
console.log('Packed exports, declarations, and progress estimator passed.');
`,
  );
  execFileSync(process.execPath, [join(temporaryDirectory, 'smoke.mjs')], {
    cwd: temporaryDirectory,
    stdio: 'inherit',
  });
  // --force skips registry version collisions: PRs need not bump the version.
  // --dry-run is always set, so this command cannot upload or overwrite a release.
  runNpm(
    [
      'publish',
      tarballPath,
      '--dry-run',
      '--force',
      '--ignore-scripts',
      '--access',
      'public',
    ],
    temporaryDirectory,
  );
} finally {
  await rm(temporaryDirectory, {recursive: true, force: true});
}
