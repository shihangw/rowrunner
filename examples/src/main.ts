import {startDashboard} from './progress_dashboard.ts';
import {sceneOptions, celebrationOptions} from './example_configuration.ts';

if (import.meta.env.VITE_STATIC_PREVIEW === 'true') {
  document.querySelector('.source-picker')?.setAttribute('hidden', '');
}

startDashboard(sceneOptions, celebrationOptions);
