import {ProgressSink, RateSmoother, ProgressSampleSchema} from 'rowrunner';
import {RoadScene, CompletionCelebration} from 'rowrunner/scene';
import {
  worlds as exampleWorlds,
  runners as exampleRunners,
} from './example_configuration.ts';
import type {SceneOptions} from 'rowrunner/scene';
import {CameraModeSchema, RoadEffectSchema} from 'rowrunner/schemas';
import type {ProgressSample, ProgressSnapshot} from 'rowrunner';
import {ProgressHistory} from './progress_history.ts';
import {startProgressPolling} from './inputs/progress_polling_input.ts';

export function startDashboard(
  sceneOptions: SceneOptions,
  celebrationOptions: {message: string},
) {
  const elementWithID = <T extends HTMLElement = HTMLElement>(
    id: string,
  ): T => {
    const node = document.getElementById(id);
    if (node == null) {
      throw new Error(`Missing element: ${id}`);
    }
    return node as T;
  };
  const countFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  });
  let progressSink = new ProgressSink();
  const rateSmoother = new RateSmoother();
  const gaugeReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let needleFlutterStrength = 0;
  const completionCelebration = new CompletionCelebration(
    document.querySelector<HTMLElement>('.viewport')!,
    celebrationOptions,
  );
  const progressHistory = new ProgressHistory();
  let renderedChartVersion = -1;
  function acceptSample(sample: ProgressSample, now = Date.now()) {
    progressHistory.add(progressSink.push(sample, now));
  }
  let roadScene: RoadScene | undefined;
  let selectedWorldID: string;
  let selectedRunnerID: string;
  try {
    roadScene = new RoadScene(
      elementWithID<HTMLCanvasElement>('road'),
      sceneOptions,
    );
  } catch (error) {
    elementWithID('scene-error').hidden = false;
    elementWithID('scene-error').textContent = String(error);
  }
  const worlds =
    roadScene?.scenes ??
    exampleWorlds.map((p) => ({
      ...p,
      name: p.name ?? p.id,
      description: p.description ?? '',
    }));
  const availableRunners =
    roadScene?.protagonists ??
    exampleRunners.map((p) => ({
      ...p,
      name: p.name ?? p.id,
      description: p.description ?? '',
    }));
  selectedWorldID = roadScene?.scenePreset ?? worlds[0].id;
  selectedRunnerID = roadScene?.protagonist ?? availableRunners[0].id;

  function updateContentSelection() {
    const world = worlds.find((p) => p.id === selectedWorldID)!;
    const mascot = availableRunners.find((p) => p.id === selectedRunnerID)!;
    elementWithID('world-name').textContent = world.name;
    elementWithID<HTMLCanvasElement>('road').setAttribute(
      'aria-label',
      `${mascot.description} Flying through ${world.name}. ${world.description}`,
    );
    document.querySelector<HTMLElement>('.viewport')!.dataset.world =
      selectedWorldID;
    for (const button of document.querySelectorAll<HTMLElement>(
      '[data-scene], [data-mascot]',
    )) {
      const selected =
        button.dataset.scene != null && button.dataset.scene !== ''
          ? button.dataset.scene === selectedWorldID
          : button.dataset.mascot === selectedRunnerID;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }
  for (const [kind, presets] of [
    ['scene', worlds],
    ['mascot', availableRunners],
  ] as const) {
    for (const preset of presets) {
      const button = document.createElement('button');
      button.className = 'preset-choice';
      button.dataset[kind] = preset.id;
      button.title = preset.description;
      const icon = document.createElement('span');
      icon.className = `preset-icon icon-${preset.id}`;
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent =
        (
          {bookie: '◎', courier: '◇', 'paper-plane': '➤'} as Record<
            string,
            string
          >
        )[preset.id] ?? '';
      const label = document.createElement('span');
      label.textContent = preset.name;
      button.append(icon, label);
      button.onclick = () => {
        if (kind === 'scene') {
          roadScene?.setScene(preset.id);
          selectedWorldID = preset.id;
        } else {
          roadScene?.setProtagonist(preset.id);
          selectedRunnerID = preset.id;
        }
        updateContentSelection();
        elementWithID('announcement').textContent =
          `${selectedRunnerID} in ${worlds.find((p) => p.id === selectedWorldID)!.name}`;
      };
      elementWithID(`${kind}-presets`).append(button);
    }
  }
  updateContentSelection();
  elementWithID<HTMLSelectElement>('camera-mode').value =
    roadScene?.cameraMode ?? sceneOptions.camera ?? 'cinematic';
  elementWithID('auto-biomes').setAttribute(
    'aria-pressed',
    String(roadScene?.autoBiomes ?? false),
  );
  elementWithID('auto-biomes').textContent =
    roadScene?.autoBiomes === true ? 'Auto journey on' : 'Hold this biome';
  elementWithID<HTMLSelectElement>('road-effect').value =
    roadScene?.roadEffect ?? sceneOptions.roadEffect ?? 'none';
  elementWithID<HTMLSelectElement>('road-effect').onchange = () =>
    roadScene?.setRoadEffect(
      RoadEffectSchema.parse(
        elementWithID<HTMLSelectElement>('road-effect').value,
      ),
    );
  elementWithID<HTMLSelectElement>('camera-mode').onchange = () =>
    roadScene?.setCamera(
      CameraModeSchema.parse(
        elementWithID<HTMLSelectElement>('camera-mode').value,
      ),
    );
  elementWithID('auto-biomes').onclick = () => {
    const enabled =
      elementWithID('auto-biomes').getAttribute('aria-pressed') !== 'true';
    roadScene?.setAutoBiomes(enabled);
    elementWithID('auto-biomes').setAttribute('aria-pressed', String(enabled));
    elementWithID('auto-biomes').textContent = enabled
      ? 'Auto journey on'
      : 'Hold this biome';
  };

  let inputMode = 'demo';
  let progressEventSource: EventSource | null = null;
  let stopProgressPolling: (() => void) | undefined;
  let demoProcessingRate = 500;
  let demoCompletedCount = 0;
  let isDemoPaused = false;
  let isSignalLost = false;
  let isDemoCompleted = false;
  let lastDemoTimestamp = Date.now();
  let demoRunNumber = 1;
  let lastDashboardUpdateTime = 0;
  let previousProgressState = '';
  const progressStateLabels = {
    waiting: 'Waiting',
    warming: 'Warming up',
    running: 'Live',
    paused: 'Paused',
    stalled: 'Idle',
    stale: 'Delayed',
    completed: 'Complete',
    failed: 'Failed',
  };

  function publishDemoProgress(currentTimestamp: number) {
    const elapsedSeconds = (currentTimestamp - lastDemoTimestamp) / 1000;
    lastDemoTimestamp = currentTimestamp;
    if (!isDemoPaused && !isDemoCompleted) {
      demoCompletedCount = Math.min(
        250000,
        demoCompletedCount + Math.round(demoProcessingRate * elapsedSeconds),
      );
    }
    if (!isSignalLost) {
      acceptSample(
        {
          runId: `demo-${demoRunNumber}`,
          completed: demoCompletedCount,
          targetTotal: 250000,
          timestamp: currentTimestamp,
          status: isDemoCompleted
            ? 'completed'
            : isDemoPaused
              ? 'paused'
              : 'running',
          label: 'Customer migration',
          unit: 'rows',
        },
        currentTimestamp,
      );
    }
  }
  publishDemoProgress(Date.now());
  setInterval(() => {
    if (inputMode === 'demo') {
      publishDemoProgress(Date.now());
    }
  }, 2000);

  function resetProgressDisplay() {
    progressSink = new ProgressSink();
    rateSmoother.reset();
    needleFlutterStrength = 0;
    progressHistory.reset();
    completionCelebration.reset();
  }
  function setProgressInputMode(next: 'demo' | 'live') {
    stopProgressPolling?.();
    stopProgressPolling = undefined;
    if (progressEventSource != null) {
      progressEventSource.close();
      progressEventSource = null;
    }
    inputMode = next;
    resetProgressDisplay();
    const isSolanaInput =
      next === 'live' &&
      elementWithID<HTMLSelectElement>('live-source').value === 'solana';
    elementWithID('demo-controls').hidden = next !== 'demo';
    elementWithID('live-controls').hidden = next !== 'live';
    elementWithID('solana-controls').hidden = !isSolanaInput;
    elementWithID('connect-form').hidden = isSolanaInput;
    elementWithID('sink-instructions').hidden = isSolanaInput;
    elementWithID('progress-heading').textContent = isSolanaInput
      ? 'NETWORK TOTAL'
      : 'COMPLETED';
    elementWithID('demo-mode').classList.toggle('selected', next === 'demo');
    elementWithID('live-mode').classList.toggle('selected', next === 'live');
    if (next === 'demo') {
      lastDemoTimestamp = Date.now();
      publishDemoProgress(lastDemoTimestamp);
      elementWithID('connection').textContent = 'LOCAL DEMO';
    } else if (!isSolanaInput) {
      connectToProgressEvents();
    } else {
      elementWithID('solana-connection').textContent = 'Connecting…';
      stopProgressPolling = startProgressPolling({
        intervalMilliseconds: 2_000,
        async readSample(signal) {
          const response = await fetch('/api/public/solana/progress', {
            signal,
            cache: 'no-store',
          });
          if (!response.ok) {
            throw new Error(
              `Progress request returned HTTP ${response.status}`,
            );
          }
          return ProgressSampleSchema.parse(await response.json());
        },
        onSample(sample) {
          acceptSample(sample);
          elementWithID('solana-connection').textContent =
            'Connected · polling every 2s';
        },
        onError() {
          elementWithID('solana-connection').textContent =
            'Connection interrupted · retrying every 2s';
        },
      });
    }
  }
  function connectToProgressEvents() {
    if (!elementWithID<HTMLFormElement>('connect-form').reportValidity()) {
      return;
    }
    progressEventSource?.close();
    resetProgressDisplay();
    const runId = elementWithID<HTMLInputElement>('run-id').value;
    elementWithID('endpoint').textContent = `POST /api/runs/${runId}/progress`;
    elementWithID('connection').textContent = 'CONNECTING';
    progressEventSource = new EventSource(
      `/api/runs/${encodeURIComponent(runId)}/events`,
    );
    progressEventSource.onopen = () => {
      elementWithID('connection').textContent = 'CONNECTED';
    };
    progressEventSource.onerror = () => {
      elementWithID('connection').textContent = 'RECONNECTING';
    };
    progressEventSource.onmessage = (event) => {
      try {
        acceptSample(ProgressSampleSchema.parse(JSON.parse(event.data)));
      } catch (error) {
        elementWithID('announcement').textContent =
          `Invalid sample: ${String(error)}`;
      }
    };
  }
  elementWithID('demo-mode').onclick = () => setProgressInputMode('demo');
  elementWithID('live-mode').onclick = () => setProgressInputMode('live');
  elementWithID('live-source').onchange = () => setProgressInputMode('live');
  elementWithID<HTMLFormElement>('connect-form').onsubmit = (e) => {
    e.preventDefault();
    connectToProgressEvents();
  };
  function updateDemoControls() {
    elementWithID('pause').textContent = isDemoPaused ? 'Resume' : 'Pause';
    elementWithID('pause').classList.toggle('active', isDemoPaused);
    elementWithID('signal').textContent = isSignalLost
      ? 'Restore signal'
      : 'Lose signal';
    elementWithID('signal').classList.toggle('active', isSignalLost);
    elementWithID('finish').textContent = isDemoCompleted
      ? 'New run ↗'
      : 'Finish ↗';
  }
  for (const button of document.querySelectorAll<HTMLElement>('[data-rate]')) {
    button.onclick = () => {
      publishDemoProgress(Date.now());
      demoProcessingRate = Number(button.dataset.rate);
      document
        .querySelectorAll<HTMLElement>('[data-rate]')
        .forEach((b) => b.classList.toggle('selected', b === button));
    };
  }
  elementWithID('pause').onclick = () => {
    publishDemoProgress(Date.now());
    isDemoPaused = !isDemoPaused;
    updateDemoControls();
    setTimeout(() => publishDemoProgress(Date.now()), 2);
  };
  elementWithID('signal').onclick = () => {
    isSignalLost = !isSignalLost;
    updateDemoControls();
    if (!isSignalLost) {
      publishDemoProgress(Date.now());
    }
  };
  elementWithID('reset').onclick = () => {
    if (progressSink.latest?.status === 'completed' || isDemoCompleted) {
      demoRunNumber++;
      resetProgressDisplay();
    }
    demoCompletedCount = 0;
    isDemoCompleted = false;
    isDemoPaused = false;
    isSignalLost = false;
    lastDemoTimestamp = Date.now();
    publishDemoProgress(lastDemoTimestamp);
    updateDemoControls();
  };
  elementWithID('finish').onclick = () => {
    if (isDemoCompleted || progressSink.latest?.status === 'completed') {
      demoRunNumber++;
      resetProgressDisplay();
      demoCompletedCount = 0;
      isDemoCompleted = false;
    } else {
      demoCompletedCount = 250000;
      isDemoCompleted = true;
    }
    isDemoPaused = false;
    isSignalLost = false;
    lastDemoTimestamp = Date.now();
    publishDemoProgress(lastDemoTimestamp);
    updateDemoControls();
  };

  function formattedTimeRemaining(seconds: number | null) {
    if (seconds === null) {
      return 'ETA —';
    }
    if (seconds === 0) {
      return 'Complete';
    }
    if (seconds < 60) {
      return `~${Math.ceil(seconds)}s remaining`;
    }
    if (seconds < 3600) {
      return `~${Math.ceil(seconds / 60)}m remaining`;
    }
    return `~${(seconds / 3600).toFixed(1)}h remaining`;
  }
  function updateProgressDashboard(snapshot: ProgressSnapshot) {
    elementWithID('state-badge').textContent =
      progressStateLabels[snapshot.state];
    if (roadScene != null && roadScene.scenePreset !== selectedWorldID) {
      selectedWorldID = roadScene.scenePreset;
      updateContentSelection();
    }
    elementWithID('rate-unit').textContent = `${snapshot.unit ?? 'rows'} / sec`;
    elementWithID('completed').textContent = countFormatter.format(
      snapshot.completed,
    );
    elementWithID('target').textContent =
      snapshot.targetTotal === null
        ? `${snapshot.unit ?? 'rows'} · open-ended`
        : `/ ${countFormatter.format(snapshot.targetTotal)} ${snapshot.unit ?? 'rows'}`;
    elementWithID('progress-fill').style.width =
      snapshot.progress === null ? '100%' : `${snapshot.progress * 100}%`;
    const track = document.querySelector<HTMLElement>('.progress-track')!;
    track.classList.toggle('indeterminate', snapshot.progress === null);
    if (snapshot.progress === null) {
      track.removeAttribute('aria-valuenow');
    } else {
      track.setAttribute('aria-valuenow', String(snapshot.progress * 100));
    }
    elementWithID('percent').textContent =
      snapshot.progress === null
        ? 'Open-ended'
        : `${(snapshot.progress * 100).toFixed(1)}%`;
    elementWithID('eta').textContent = formattedTimeRemaining(
      snapshot.etaSeconds,
    );
    elementWithID('freshness').textContent =
      snapshot.ageMs === null
        ? 'Awaiting data'
        : snapshot.ageMs < 3000
          ? 'Updated now'
          : `Updated ${Math.floor(snapshot.ageMs / 1000)}s ago`;
    elementWithID('rate-note').textContent =
      snapshot.state === 'stale'
        ? 'Coasting to a stop · data delayed'
        : snapshot.state === 'warming' || snapshot.state === 'waiting'
          ? 'Waiting for two samples'
          : snapshot.state === 'stalled'
            ? 'Fresh signal · count unchanged'
            : snapshot.resetCount > 0
              ? `Counter rebased · ${snapshot.resetCount} reset${snapshot.resetCount > 1 ? 's' : ''}`
              : '20s window · smoothed display';
    if (renderedChartVersion !== progressHistory.version) {
      const chart = progressHistory.plot();
      elementWithID('trend-line').setAttribute('d', chart.line);
      elementWithID('trend-area').setAttribute('d', chart.area);
      elementWithID('trend-dot').toggleAttribute('hidden', chart.last == null);
      if (chart.last != null) {
        elementWithID('trend-dot').setAttribute('cx', String(chart.last[0]));
        elementWithID('trend-dot').setAttribute('cy', String(chart.last[1]));
      }
      // Full counts keep nearby bounds distinguishable even for totals in the billions.
      elementWithID('chart-max').textContent =
        chart.last != null ? countFormatter.format(chart.max) : '—';
      elementWithID('chart-min').textContent =
        chart.last != null ? countFormatter.format(chart.min) : '—';
      const seconds = Math.floor(chart.duration / 1000);
      elementWithID('chart-duration').textContent =
        `−${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      elementWithID('trend').setAttribute(
        'aria-label',
        `Recent cumulative progress: ${countFormatter.format(snapshot.completed)} ${snapshot.unit ?? 'rows'}. Last ${seconds} seconds, vertical range ${countFormatter.format(chart.min)} to ${countFormatter.format(chart.max)}. Line connects received samples.`,
      );
      renderedChartVersion = progressHistory.version;
    }
    document.body.dataset.state = snapshot.state;
    if (snapshot.state !== previousProgressState) {
      elementWithID('announcement').textContent =
        progressStateLabels[snapshot.state];
      previousProgressState = snapshot.state;
    }
  }
  function updateSpeedometer(
    snapshot: ProgressSnapshot,
    animationTimeMilliseconds: number,
    deltaSeconds: number,
  ) {
    // Blend several slow oscillations for a small, continuous mechanical flutter.
    // Share one display rate between digits, needle, and arc; source data stays untouched.
    const strength =
      snapshot.state === 'running' ? Math.min(1, rateSmoother.value / 120) : 0;
    needleFlutterStrength +=
      (strength - needleFlutterStrength) * (1 - Math.exp(-deltaSeconds / 0.25));
    if (gaugeReducedMotion.matches) {
      needleFlutterStrength = 0;
    }
    const elapsedSeconds = animationTimeMilliseconds / 1000;
    const wave =
      0.55 * Math.sin(elapsedSeconds * 9.7) +
      0.3 * Math.sin(elapsedSeconds * 17.3) +
      0.15 * Math.sin(elapsedSeconds * 27.1);
    const flutter =
      wave *
      needleFlutterStrength *
      Math.min(rateSmoother.value * 0.03, (2000 * 1.2) / 180);
    const displayRate = Math.max(0, rateSmoother.value + flutter);
    const fraction = Math.min(displayRate / 2000, 1);
    const text = ['waiting', 'warming', 'stale'].includes(snapshot.state)
      ? '—'
      : countFormatter.format(displayRate);
    if (elementWithID('speed').textContent !== text) {
      elementWithID('speed').textContent = text;
    }
    elementWithID('needle').style.transform = `rotate(${fraction * 180}deg)`;
    elementWithID('gauge-fill').style.strokeDasharray = `${fraction * 100} 100`;
    elementWithID('gauge-scale').textContent =
      displayRate > 2000 ? '2k+' : '2k';
  }
  let previousFrameTime = performance.now();
  function renderAnimationFrame(animationTimeMilliseconds: number) {
    const deltaSeconds = Math.max(
      0,
      (animationTimeMilliseconds - previousFrameTime) / 1000,
    );
    previousFrameTime = animationTimeMilliseconds;
    const currentTimestamp = Date.now();
    const snapshot = progressSink.snapshot(currentTimestamp);
    rateSmoother.step(snapshot.targetRate, deltaSeconds);
    updateSpeedometer(snapshot, animationTimeMilliseconds, deltaSeconds);
    const isCompleted = snapshot.state === 'completed';
    roadScene?.render(rateSmoother.value, deltaSeconds, {
      completed: isCompleted,
    });
    elementWithID<HTMLSelectElement>('camera-mode').value = isCompleted
      ? 'approach'
      : (roadScene?.cameraMode ?? sceneOptions.camera ?? 'cinematic');
    elementWithID<HTMLSelectElement>('camera-mode').disabled = isCompleted;
    completionCelebration.update(snapshot, {
      source: inputMode,
      now: animationTimeMilliseconds,
    });
    if (animationTimeMilliseconds - lastDashboardUpdateTime > 100) {
      updateProgressDashboard(snapshot);
      lastDashboardUpdateTime = animationTimeMilliseconds;
    }
    requestAnimationFrame(renderAnimationFrame);
  }
  requestAnimationFrame(renderAnimationFrame);
  window.addEventListener('pagehide', () => {
    progressEventSource?.close();
    stopProgressPolling?.();
  });
}
