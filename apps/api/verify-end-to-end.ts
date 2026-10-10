import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { BusinessAnalystService } from './src/analytics/business-analyst.service';
import { AnalystOrchestrator } from './src/analytics/analyst-orchestrator.service';
import path from 'path';

async function bootstrap() {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../.env'));
  } catch (e) {
    // Ignore
  }

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    // Spy on planner to log output without modifying production code
    const planner = app.get('ANALYST_PLANNER') as any;
    const origPlan = planner.plan.bind(planner);
    planner.plan = async (...args: any[]) => {
      const res = await origPlan(...args);
      console.log('\n--- PLANNER OUTPUT ---');
      console.log(JSON.stringify(res, null, 2));
      return res;
    };

    // Spy on orchestrator to log output
    const orchestrator = app.get(AnalystOrchestrator) as any;
    const origExec = orchestrator.execute.bind(orchestrator);
    orchestrator.execute = async (...args: any[]) => {
      const res = await origExec(...args);
      console.log('\n--- EVIDENCE RESULT ---');
      console.log(JSON.stringify(res, null, 2));
      return res;
    };

    const service = app.get(BusinessAnalystService);
    const question = 'Show August 2025 revenue';
    console.log(`\nStarting execution for question: "${question}"`);
    
    const result = await service.answer(question);
    
    console.log('\n--- FINAL SYNTHESIZED ANSWER ---');
    console.log(JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error('\nExecution Failed:', e.message);
  } finally {
    await app.close();
  }
}

bootstrap();

