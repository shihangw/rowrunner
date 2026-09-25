import type {ServerResponse, Server} from 'node:http';
import type {SinkOptions} from './progress_data_types.js';
export interface ServerOptions {
  assets?: Map<string, [string | URL, string]>;
  sinkOptions?: SinkOptions;
}
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {ProgressSink, ProgressSampleSchema} from './progress_sink.js';
import {parseInput} from './input_validation.js';

export function createProgressServer({
  assets = new Map(),
  sinkOptions = {},
}: ServerOptions = {}): Server {
  const progressSinksByRunID = new Map<string, ProgressSink>();
  const eventListenersByRunID = new Map<string, Set<ServerResponse>>();
  const sendJSONResponse = (
    response: ServerResponse,
    status: number,
    data: unknown,
  ) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(data));
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      // This sink is a local development service. Do not accept browser writes from other origins.
      if (
        request.headers.origin != null &&
        request.headers.origin !== '' &&
        request.headers.origin !== `http://${request.headers.host}`
      ) {
        return sendJSONResponse(response, 403, {error: 'Origin rejected'});
      }
      const route =
        /^\/api\/runs\/([a-zA-Z0-9_-]{1,80})\/(progress|events)$/.exec(
          url.pathname,
        );
      if (route != null) {
        const [, runId, resource] = route;
        if (resource === 'events' && request.method === 'GET') {
          if (
            [...eventListenersByRunID.values()].reduce(
              (sum, set) => sum + set.size,
              0,
            ) >= 100
          ) {
            return sendJSONResponse(response, 503, {
              error: 'Too many listeners',
            });
          }
          response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          response.write(': connected\n\n');
          if (!eventListenersByRunID.has(runId)) {
            eventListenersByRunID.set(runId, new Set());
          }
          eventListenersByRunID.get(runId)!.add(response);
          const latest = progressSinksByRunID.get(runId)?.latest;
          if (latest != null) {
            response.write(`data: ${JSON.stringify(latest)}\n\n`);
          }
          const heartbeat = setInterval(
            () => response.write(': heartbeat\n\n'),
            15000,
          );
          request.on('close', () => {
            clearInterval(heartbeat);
            eventListenersByRunID.get(runId)?.delete(response);
            if ((eventListenersByRunID.get(runId)?.size ?? 0) === 0) {
              eventListenersByRunID.delete(runId);
            }
          });
          return;
        }
        if (resource === 'progress' && request.method === 'GET') {
          return sendJSONResponse(
            response,
            200,
            progressSinksByRunID.get(runId)?.snapshot() ?? {state: 'waiting'},
          );
        }
        if (resource === 'progress' && request.method === 'POST') {
          if (
            request.headers['content-type']?.startsWith('application/json') !==
            true
          ) {
            return sendJSONResponse(response, 415, {
              error: 'Use application/json',
            });
          }
          let body = '';
          let bodyByteCount = 0;
          for await (const chunk of request) {
            bodyByteCount += chunk.length;
            if (bodyByteCount > 16384) {
              sendJSONResponse(response, 413, {error: 'Body exceeds 16 KiB'});
              return;
            }
            body += chunk;
          }
          const requestPayload: unknown = JSON.parse(body);
          if (
            requestPayload == null ||
            typeof requestPayload !== 'object' ||
            Array.isArray(requestPayload)
          ) {
            return sendJSONResponse(response, 400, {
              error: 'Expected a progress object',
            });
          }
          if (
            'runId' in requestPayload &&
            requestPayload.runId !== undefined &&
            requestPayload.runId !== runId
          ) {
            return sendJSONResponse(response, 400, {
              error: 'runId conflicts with URL',
            });
          }
          if (
            !progressSinksByRunID.has(runId) &&
            progressSinksByRunID.size >= 100
          ) {
            return sendJSONResponse(response, 409, {
              error: 'Run limit reached; restart the local server',
            });
          }
          const progressSink =
            progressSinksByRunID.get(runId) ?? new ProgressSink(sinkOptions);
          const result = progressSink.push(
            parseInput(ProgressSampleSchema, {...requestPayload, runId}),
          );
          if (result.accepted) {
            progressSinksByRunID.set(runId, progressSink);
            for (const client of eventListenersByRunID.get(runId) ?? []) {
              if (!client.write(`data: ${JSON.stringify(result.sample)}\n\n`)) {
                client.end();
              }
            }
          }
          return sendJSONResponse(
            response,
            result.accepted || result.reason === 'duplicate' ? 200 : 409,
            result,
          );
        }
        return sendJSONResponse(response, 405, {error: 'Method not allowed'});
      }
      const asset = assets.get(url.pathname);
      if (asset != null && request.method === 'GET') {
        const data = await readFile(asset[0]);
        response.writeHead(200, {
          'Content-Type': `${asset[1]}; charset=utf-8`,
          'Cache-Control': 'no-cache',
        });
        return response.end(data);
      }
      sendJSONResponse(response, 404, {error: 'Not found'});
    } catch (error) {
      if (!response.headersSent) {
        sendJSONResponse(
          response,
          error instanceof SyntaxError || error instanceof TypeError
            ? 400
            : 500,
          {
            error:
              error instanceof SyntaxError
                ? 'Invalid JSON'
                : error instanceof TypeError
                  ? error.message
                  : 'Internal server error',
          },
        );
      } else {
        response.end();
      }
    }
  });
  return server;
}
