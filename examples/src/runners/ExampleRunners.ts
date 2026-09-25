import bookie from './bookie/BookieRunner.ts';
import prism from './prism/PrismRunner.ts';
import paperPlane from './paper-plane/PaperPlaneRunner.ts';
import surveyDrone from './survey-drone/SurveyDroneRunner.ts';

export const runners = [bookie, prism, paperPlane, surveyDrone] as const;
