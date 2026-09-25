import {bookie} from './bookie/bookie_runner.ts';
import {prism} from './prism/prism_runner.ts';
import {paperPlane} from './paper-plane/paper_plane_runner.ts';
import {surveyDrone} from './survey-drone/survey_drone_runner.ts';

export const runners = [bookie, prism, paperPlane, surveyDrone] as const;
