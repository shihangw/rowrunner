import {readFile, readdir} from 'node:fs/promises';
import {extname, join} from 'node:path';
import type {RequestListener} from 'node:http';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createProgressServer} from '@shihangw/rowrunner/server';

const assetDirectory = fileURLToPath(new URL('./dist/', import.meta.url));
const contentTypesByExtension = new Map([
  ['.css', 'text/css'],
  ['.html', 'text/html'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);
interface AssetPayload {
  contentType: string;
  uncompressed: Buffer;
  compressed: Buffer;
}
const assets = new Map<string, AssetPayload>();

async function addAssets(directory: string, requestPrefix = ''): Promise<void> {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const absolutePath = join(directory, entry.name);
    const requestPath = `${requestPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await addAssets(absolutePath, requestPath);
    } else if (entry.isFile()) {
      const uncompressed = await readFile(absolutePath);
      assets.set(requestPath, {
        contentType:
          contentTypesByExtension.get(extname(entry.name)) ??
          'application/octet-stream',
        uncompressed,
        compressed: gzipSync(uncompressed),
      });
    }
  }
}
await addAssets(assetDirectory);
const indexAsset = assets.get('/index.html');
if (indexAsset == null) {
  throw new Error('Build the example before starting its production server.');
}
assets.set('/', indexAsset);

const server = createProgressServer();
const progressAPI = server.listeners('request')[0] as RequestListener;
const canaryWriteToken = process.env.CANARY_WRITE_TOKEN;
server.removeAllListeners('request');
server.on('request', (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/healthz') {
    response.writeHead(200, {'Content-Type': 'text/plain'}).end('ok');
    return;
  }
  const asset = assets.get(pathname);
  if (
    asset != null &&
    (request.method === 'GET' || request.method === 'HEAD')
  ) {
    const useGzip =
      request.headers['accept-encoding']?.includes('gzip') === true &&
      asset.compressed.length < asset.uncompressed.length;
    const payload = useGzip ? asset.compressed : asset.uncompressed;
    response.writeHead(200, {
      'Content-Type': asset.contentType,
      'Content-Length': payload.length,
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'private, max-age=31536000, immutable'
        : 'private, no-cache',
      Vary: 'Accept-Encoding',
      ...(useGzip ? {'Content-Encoding': 'gzip'} : {}),
    });
    response.end(request.method === 'HEAD' ? undefined : payload);
    return;
  }
  if (
    pathname.startsWith('/api/') &&
    process.env.VITE_ENABLE_BACKEND === 'false'
  ) {
    response.writeHead(404).end();
    return;
  }
  if (request.method === 'POST' && pathname.startsWith('/api/')) {
    if (
      canaryWriteToken != null &&
      canaryWriteToken !== '' &&
      request.headers['x-rowrunner-canary-token'] !== canaryWriteToken
    ) {
      response.writeHead(401).end();
      return;
    }
  }
  progressAPI(request, response);
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, '0.0.0.0', () => {
  console.log(`Rowrunner canary listening on port ${port}`);
});

function close(): void {
  server.close();
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
