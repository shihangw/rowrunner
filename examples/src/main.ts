import {startDashboard} from './progress_dashboard.ts';
import {sceneOptions, celebrationOptions} from './example_configuration.ts';

if (import.meta.env.VITE_ENABLE_BACKEND === 'false') {
  document.querySelector('#live-source option[value="custom"]')?.remove();
  document.querySelector('.source-picker')?.setAttribute('hidden', '');
  document.querySelector('.live-source-picker')?.setAttribute('hidden', '');
}

startDashboard(sceneOptions, celebrationOptions);
