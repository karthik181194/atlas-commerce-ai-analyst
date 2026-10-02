import { ACTIVE_DATASET } from './generator.config';
import { generateReferenceData } from './reference-data/reference-data';

console.log(JSON.stringify({ seed: ACTIVE_DATASET.seed, ...generateReferenceData() }, null, 2));
