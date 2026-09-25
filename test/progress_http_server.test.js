import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createProgressServer} from 'rowrunner/server';

async function fixture(t) {
  const server = createProgressServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const root = `http://127.0.0.1:${server.address().port}`;
  const post = (sample, run = 'migration', headers = {}) =>
    fetch(`${root}/api/runs/${run}/progress`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...headers},
      body: JSON.stringify(sample),
    });
  return {root, post};
}

test('HTTP sink derives rates, isolates runs, and reports rejected updates', async (t) => {
  const {root, post} = await fixture(t);
  const timestamp = Date.now() - 2000;
  assert.equal((await post({timestamp, completed: 0})).status, 200);
  const latest = {timestamp: timestamp + 2000, completed: 1000};
  assert.equal((await post(latest)).status, 200);
  const snapshot = await (
    await fetch(`${root}/api/runs/migration/progress`)
  ).json();
  assert.equal(snapshot.rate, 500);
  assert.equal(snapshot.completed, 1000);
  assert.equal((await (await post(latest)).json()).reason, 'duplicate');
  assert.equal((await post({...latest, completed: 2000})).status, 409);
  assert.equal(
    (await post({timestamp: timestamp - 1000, completed: 0})).status,
    409,
  );
  assert.equal((await post({timestamp, completed: 50}, 'second')).status, 200);
  assert.equal(
    (await (await fetch(`${root}/api/runs/second/progress`)).json()).completed,
    50,
  );
  assert.equal(
    (await (await fetch(`${root}/api/runs/unknown/progress`)).json()).state,
    'waiting',
  );
});

test('HTTP input validation, body limits, and static file allowlist', async (t) => {
  const {root, post} = await fixture(t);
  const good = {timestamp: Date.now(), completed: 0};
  for (const input of [
    null,
    [],
    {...good, completed: -1},
    {...good, runId: 'wrong'},
  ]) {
    assert.equal((await post(input)).status, 400);
  }
  assert.equal(
    (await post(good, 'migration', {Origin: 'https://other.example'})).status,
    403,
  );
  assert.equal(
    (await post(good, 'migration', {'Content-Type': 'text/plain'})).status,
    415,
  );
  assert.equal((await post({...good, label: 'x'.repeat(17000)})).status, 413);
  assert.equal(
    (
      await fetch(`${root}/api/runs/migration/progress`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: '{',
      })
    ).status,
    400,
  );
  assert.equal((await fetch(`${root}/package.json`)).status, 404);
  assert.equal(
    (await fetch(`${root}/api/runs/migration/progress`, {method: 'DELETE'}))
      .status,
    405,
  );
});

test('SSE sends current sample and broadcasts accepted progress', async (t) => {
  const {root, post} = await fixture(t);
  const now = Date.now();
  await post({timestamp: now - 2000, completed: 100});
  const abort = new AbortController();
  const response = await fetch(`${root}/api/runs/migration/events`, {
    signal: abort.signal,
  });
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
  const reader = response.body.getReader();
  t.after(() => {
    abort.abort();
  });
  const decoder = new TextDecoder();
  let text = decoder.decode((await reader.read()).value);
  assert.match(text, /"completed":100/);
  await post({timestamp: now, completed: 1100});
  text = decoder.decode((await reader.read()).value);
  assert.match(text, /"completed":1100/);
  await reader.cancel();
  abort.abort();
});
