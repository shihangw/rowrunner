import {fileURLToPath} from 'node:url';
import type {RequestListener} from 'node:http';
import {createServer} from 'vite';
import {createProgressServer} from '@shihangw/rowrunner/server';

// One local Node process serves the TypeScript app and the progress/SSE API.
process.env.VITE_ENABLE_BACKEND ??= 'true';
const server = createProgressServer();
const api = server.listeners('request')[0] as RequestListener;
const vite = await createServer({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {middlewareMode: true, hmr: {server}},
  appType: 'spa',
});
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url?.startsWith('/api/') === true) {
    if (process.env.VITE_ENABLE_BACKEND === 'false') {
      res.writeHead(404).end();
    } else {
      api(req, res);
    }
  } else {
    vite.middlewares(req, res);
  }
});
const port = Number(process.env.PORT ?? 3000);
server.listen(port, '127.0.0.1', () =>
  console.log(`Rowrunner → http://127.0.0.1:${port}`),
);
async function close() {
  await vite.close();
  server.close();
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
