export {};
// Run alongside the demo, then select Live input → migration in the browser.
const endpoint = process.env.SINK_URL ?? 'http://127.0.0.1:3000/api/runs/migration/progress';
let completed = 0;
let previous = Date.now();
const started = previous;
async function send() {
  const now = Date.now();
  const rate = 500 + 350 * Math.sin((now - started) / 12000);
  completed = Math.min(250000, completed + Math.round((rate * (now - previous)) / 1000));
  previous = now;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      completed,
      targetTotal: 250000,
      timestamp: now,
      label: 'Customer migration',
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  console.log(`${completed} rows sent`);
}
await send();
while (completed < 250000) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await send();
}
