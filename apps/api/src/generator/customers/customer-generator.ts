import { DEVELOPMENT_DATASET } from '../generator.config';
import { DeterministicRandom } from '../deterministic-random';
import { generateReferenceData } from '../reference-data/reference-data';

export interface Customer { customerId: number; firstName: string; lastName: string; email: string; regionId: number; segmentId: number; signupDate: string }
const firstNames = ['Aarav', 'Ananya', 'Arjun', 'Diya', 'Ishaan', 'Kavya', 'Meera', 'Rohan', 'Saanvi', 'Vihaan', 'Zoya', 'Nikhil'];
const lastNames = ['Sharma', 'Iyer', 'Kapoor', 'Mehta', 'Nair', 'Patel', 'Reddy', 'Singh', 'Verma', 'Das'];
const regionWeights = [28, 24, 20, 18, 10];
const segmentWeights = [15, 50, 30, 5];
function weightedId(random: DeterministicRandom, weights: number[]): number { let draw = random.nextInt(1, weights.reduce((sum, value) => sum + value, 0)); for (let index = 0; index < weights.length; index += 1) { draw -= weights[index]; if (draw <= 0) return index + 1; } return weights.length; }
function date(random: DeterministicRandom, segmentId: number): string { const end = Date.parse(`${DEVELOPMENT_DATASET.asOfDate}T00:00:00Z`); const start = Date.parse(`${DEVELOPMENT_DATASET.datasetStartDate}T00:00:00Z`); const earliest = segmentId === 1 ? end - 89 * 86400000 : start; return new Date(random.nextInt(Math.floor(earliest / 86400000), Math.floor(end / 86400000)) * 86400000).toISOString().slice(0, 10); }
export function generateCustomers(seed: number = DEVELOPMENT_DATASET.seed): Customer[] { const random = new DeterministicRandom(seed); const reference = generateReferenceData(seed); return Array.from({ length: DEVELOPMENT_DATASET.customers }, (_, index) => { const customerId = index + 1; const segmentId = weightedId(random, segmentWeights); return { customerId, firstName: firstNames[random.nextInt(0, firstNames.length - 1)], lastName: lastNames[random.nextInt(0, lastNames.length - 1)], email: `customer${String(customerId).padStart(3, '0')}@atlascommerce.example`, regionId: reference.regions[weightedId(random, regionWeights) - 1].regionId, segmentId, signupDate: date(random, segmentId) }; }); }
