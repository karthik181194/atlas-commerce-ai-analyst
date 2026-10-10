import { GeminiAnalystSynthesizer } from './src/analytics/gemini-analyst-synthesizer';
import path from 'path';

async function verify() {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../.env'));
  } catch (e) {
    // Ignore if file doesn't exist
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('Skipping native verification: GEMINI_API_KEY is not set.');
    return;
  }

  const synthesizer = new GeminiAnalystSynthesizer();

  const question = 'Why did August 2025 revenue change?';
  const evidence = [
    {
      capability: 'revenue_period_comparison',
      data: {
        currentNetRevenue: "4902292.52",
        comparisonNetRevenue: "3635671.55",
        absoluteChange: "1266620.97",
        percentageChange: "34.84",
        currentCompletedOrders: 17136,
        comparisonCompletedOrders: 12822,
        currentAov: "286.081496",
        comparisonAov: "283.549489",
        aovChangePercentage: "0.89"
      }
    },
    {
      capability: 'revenue_by_region_comparison',
      data: [
        {
          region: "North",
          currentNetRevenue: "1418622.04",
          comparisonNetRevenue: "1064559.09",
          absoluteChange: "354062.95",
          percentageChange: "33.26",
          currentCompletedOrders: 4996,
          comparisonCompletedOrders: 3777,
          orderChangePercentage: "32.27",
          currentAov: "283.9515692554043235",
          comparisonAov: "281.8530818109610802",
          aovChangePercentage: "0.74"
        },
        {
          region: "South",
          currentNetRevenue: "1225253.23",
          comparisonNetRevenue: "912932.12",
          absoluteChange: "312321.11",
          percentageChange: "34.21",
          currentCompletedOrders: 4197,
          comparisonCompletedOrders: 3151,
          orderChangePercentage: "33.20",
          currentAov: "291.9354848701453419",
          comparisonAov: "289.7277435734687401",
          aovChangePercentage: "0.76"
        },
        {
          region: "Central",
          currentNetRevenue: "947050.16",
          comparisonNetRevenue: "716573.29",
          absoluteChange: "230476.87",
          percentageChange: "32.16",
          currentCompletedOrders: 3358,
          comparisonCompletedOrders: 2555,
          orderChangePercentage: "31.43",
          currentAov: "282.0280405002977963",
          comparisonAov: "280.4592133072407045",
          aovChangePercentage: "0.56"
        },
        {
          region: "West",
          currentNetRevenue: "828988.89",
          comparisonNetRevenue: "570424.95",
          absoluteChange: "258563.94",
          percentageChange: "45.33",
          currentCompletedOrders: 2922,
          comparisonCompletedOrders: 2072,
          orderChangePercentage: "41.02",
          currentAov: "283.7059856262833676",
          comparisonAov: "275.3016167953667954",
          aovChangePercentage: "3.05"
        },
        {
          region: "East",
          currentNetRevenue: "482378.20",
          comparisonNetRevenue: "371182.10",
          absoluteChange: "111196.10",
          percentageChange: "29.96",
          currentCompletedOrders: 1663,
          comparisonCompletedOrders: 1267,
          orderChangePercentage: "31.25",
          currentAov: "290.0650631389055923",
          comparisonAov: "292.9614048934490923",
          aovChangePercentage: "-0.99"
        }
      ]
    },
    {
      capability: 'revenue_by_category_comparison',
      data: [
        {
          category: "Beauty & Personal Care",
          currentNetRevenue: "1051328.76",
          comparisonNetRevenue: "790102.69",
          absoluteChange: "261226.07",
          percentageChange: "33.06",
          currentCompletedOrders: 6015,
          comparisonCompletedOrders: 4537,
          orderChangePercentage: "32.58",
          currentAov: "174.7844987531172070",
          comparisonAov: "174.1465042979942693",
          aovChangePercentage: "0.37"
        },
        {
          category: "Electronics",
          currentNetRevenue: "952571.58",
          comparisonNetRevenue: "712938.97",
          absoluteChange: "239632.61",
          percentageChange: "33.61",
          currentCompletedOrders: 4855,
          comparisonCompletedOrders: 3657,
          orderChangePercentage: "32.76",
          currentAov: "196.2042389289392379",
          comparisonAov: "194.9518649165983046",
          aovChangePercentage: "0.64"
        },
        {
          category: "Apparel",
          currentNetRevenue: "806810.38",
          comparisonNetRevenue: "577838.11",
          absoluteChange: "228972.27",
          percentageChange: "39.63",
          currentCompletedOrders: 5080,
          comparisonCompletedOrders: 3880,
          orderChangePercentage: "30.93",
          currentAov: "158.8209409448818898",
          comparisonAov: "148.9273479381443299",
          aovChangePercentage: "6.64"
        },
        {
          category: "Home Goods",
          currentNetRevenue: "722448.10",
          comparisonNetRevenue: "537872.47",
          absoluteChange: "184575.63",
          percentageChange: "34.32",
          currentCompletedOrders: 4128,
          comparisonCompletedOrders: 3084,
          orderChangePercentage: "33.85",
          currentAov: "175.0116521317829457",
          comparisonAov: "174.4074156939040208",
          aovChangePercentage: "0.35"
        },
        {
          category: "Sporting Goods",
          currentNetRevenue: "713313.55",
          comparisonNetRevenue: "527312.42",
          absoluteChange: "186001.13",
          percentageChange: "35.27",
          currentCompletedOrders: 3807,
          comparisonCompletedOrders: 2805,
          orderChangePercentage: "35.72",
          currentAov: "187.3689387969529814",
          comparisonAov: "187.9901675579322638",
          aovChangePercentage: "-0.33"
        },
        {
          category: "Kitchen & Dining",
          currentNetRevenue: "655820.15",
          comparisonNetRevenue: "489606.89",
          absoluteChange: "166213.26",
          percentageChange: "33.95",
          currentCompletedOrders: 4164,
          comparisonCompletedOrders: 3070,
          orderChangePercentage: "35.64",
          currentAov: "157.4976344860710855",
          comparisonAov: "159.4810716612377850",
          aovChangePercentage: "-1.24"
        }
      ]
    }
  ] as any[];

  console.log(`--- Synthesizing response for: "${question}" ---`);
  console.log('Sending deterministic evidence payload...');

  try {
    const result = await synthesizer.synthesize({ question, evidence });
    console.log('\n=== GEMINI SYNTHESIS RESULT ===\n');
    console.log(result.answer);
    console.log('\n===============================');
  } catch (e: any) {
    console.error('Error during synthesis:', e.message);
  }
}

verify();

