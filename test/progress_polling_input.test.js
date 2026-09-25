import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {ProgressSink} from '@shihangw/rowrunner';
import {startProgressPolling} from '../examples/src/inputs/progress_polling_input.ts';
import {readSolanaTransactionProgress} from '../examples/src/inputs/solana_transaction_source.ts';

const sample = (sequence = 0) => ({
  runId: 'solana-mainnet',
  completed: 100000 + sequence * 5000,
  timestamp: 1800000000000 + sequence * 2000,
  targetTotal: null,
  unit: 'transactions',
});

test('polling starts immediately, updates at 2 seconds and stops cleanly', async (t) => {
  t.mock.timers.enable({apis: ['setInterval', 'setTimeout']});
  const sink = new ProgressSink();
  let requestCount = 0;
  const stop = startProgressPolling({
    async readSample() {
      return sample(requestCount++);
    },
    onSample(value) {
      sink.push(value, value.timestamp);
    },
    onError(error) {
      assert.fail(String(error));
    },
  });
  t.after(stop);
  await setImmediate();
  assert.equal(requestCount, 1);
  assert.equal(sink.snapshot(sample().timestamp).state, 'warming');
  t.mock.timers.tick(1999);
  await setImmediate();
  assert.equal(requestCount, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(requestCount, 2);
  assert.equal(sink.snapshot(sample(1).timestamp).rate, 2500);
  stop();
  stop();
  t.mock.timers.tick(30000);
  await setImmediate();
  assert.equal(requestCount, 2);
});

test('slow requests do not overlap and results after switching sources are discarded', async (t) => {
  t.mock.timers.enable({apis: ['setInterval', 'setTimeout']});
  let requestCount = 0;
  let resolveRequest;
  let requestSignal;
  const received = [];
  const stop = startProgressPolling({
    timeoutMilliseconds: 30000,
    readSample(signal) {
      requestCount++;
      requestSignal = signal;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
    onSample(value) {
      received.push(value);
    },
    onError(error) {
      assert.fail(String(error));
    },
  });
  t.after(stop);
  t.mock.timers.tick(20000);
  assert.equal(requestCount, 1);
  stop();
  assert.equal(requestSignal.aborted, true);
  resolveRequest(sample());
  await setImmediate();
  assert.deepEqual(received, []);
  t.mock.timers.tick(20000);
  assert.equal(requestCount, 1);
});

test('timeouts and malformed samples retry without publishing synthetic progress', async (t) => {
  t.mock.timers.enable({apis: ['setInterval', 'setTimeout']});
  let requestCount = 0;
  const received = [];
  const errors = [];
  const stop = startProgressPolling({
    readSample(signal) {
      requestCount++;
      if (requestCount === 1) {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      }
      return Promise.resolve(
        requestCount === 2 ? {...sample(), completed: 'invalid'} : sample(),
      );
    },
    onSample(value) {
      received.push(value);
    },
    onError(error) {
      errors.push(error);
    },
  });
  t.after(stop);
  t.mock.timers.tick(8000);
  await setImmediate();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /timed out/);
  assert.equal(received.length, 0);
  t.mock.timers.tick(2000);
  await setImmediate();
  assert.equal(errors.length, 2);
  assert.equal(received.length, 0);
  t.mock.timers.tick(2000);
  await setImmediate();
  assert.equal(received.length, 1);
  assert.equal(requestCount, 3);
});

test('Solana adapter reads finalized totals and rejects failed or malformed RPC responses', async () => {
  const signal = new AbortController().signal;
  const before = Date.now();
  const progress = await readSolanaTransactionProgress(
    signal,
    async (url, options) => {
      assert.equal(url, 'https://api.mainnet.solana.com');
      assert.equal(options.signal, signal);
      assert.deepEqual(JSON.parse(options.body), {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransactionCount',
        params: [{commitment: 'finalized'}],
      });
      return Response.json({jsonrpc: '2.0', id: 1, result: 552190465552});
    },
  );
  assert.equal(progress.completed, 552190465552);
  assert.equal(progress.targetTotal, null);
  assert.equal(progress.unit, 'transactions');
  assert.ok(progress.timestamp >= before && progress.timestamp <= Date.now());
  for (const response of [
    Response.json({}, {status: 429}),
    Response.json({jsonrpc: '2.0', id: 1, error: {message: 'unavailable'}}),
    Response.json({jsonrpc: '2.0', id: 1, result: Number.MAX_SAFE_INTEGER + 1}),
    Response.json({jsonrpc: '2.0', id: 1, result: '1000'}),
  ]) {
    await assert.rejects(
      readSolanaTransactionProgress(signal, async () => response),
    );
  }
});
