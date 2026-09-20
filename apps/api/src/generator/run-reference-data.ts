import { DEVELOPMENT_DATASET } from './generator.config';
import { generateReferenceData } from './reference-data/reference-data';

console.log(JSON.stringify({ seed: DEVELOPMENT_DATASET.seed, ...generateReferenceData() }, null, 2));
