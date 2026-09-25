import { fileURLToPath } from 'node:url';
import type { RequestListener } from 'node:http';
import { createServer } from 'vite';
import { createProgressServer } from 'rowrunner/server';
import { readSolanaTransactionProgress } from './src/inputs/SolanaTransactionSource.ts';

// One local Node process serves the TypeScript app and the progress/SSE API.
const server = createProgressServer();
const api = server.listeners('request')[0] as RequestListener;
const vite = await createServer({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { middlewareMode: true, hmr: { server } },
  appType: 'spa',
});
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url === '/api/public/solana/progress') {
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' }).end();
      return;
    }
    const cancellation = new AbortController();
    res.once('close', () => cancellation.abort());
    const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(8_000)]);
    void readSolanaTransactionProgress(signal).then(
      (sample) => {
        if (res.destroyed) return;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(sample));
      },
      () => {
        if (res.destroyed) return;
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: 'Solana is temporarily unavailable; retrying on the next poll.',
          }),
        );
      },
    );
    return;
  }
  if (req.url?.startsWith('/api/')) api(req, res);
  else vite.middlewares(req, res);
});
const port = Number(process.env.PORT ?? 3000);
server.listen(port, '127.0.0.1', () => console.log(`Rowrunner → http://127.0.0.1:${port}`));
async function close() {
  await vite.close();
  server.close();
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
