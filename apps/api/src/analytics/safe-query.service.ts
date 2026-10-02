import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class SafeQueryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SafeQueryService.name);
  private pool: Pool;

  onModuleInit() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/atlas_commerce',
    });
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Executes a safe, read-only SQL query with a timeout and row limit.
   */
  async executeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // 1. Lexical check for unsafe DML/DDL
    // Note: This is a basic safety net. The true protection comes from READ ONLY transaction.
    const unsafeRegex = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COMMIT|ROLLBACK|VACUUM|REINDEX)\b/i;
    if (unsafeRegex.test(sql)) {
      throw new Error('Unsafe SQL detected. Only read operations are permitted.');
    }

    const client = await this.pool.connect();
    try {
      // 2. Enforce read-only transaction and statement timeout at the session level
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = '15s'`);
      
      const result = await client.query(sql, params);
      
      await client.query('COMMIT');
      
      // 3. Enforce max returned row count to prevent OOM
      if (result.rows.length > 5000) {
         this.logger.warn(`Query returned ${result.rows.length} rows. Truncating to 5000 limits.`);
         return result.rows.slice(0, 5000) as T[];
      }
      return result.rows as T[];
    } catch (error: any) {
      await client.query('ROLLBACK');
      this.logger.error(`Query failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      client.release();
    }
  }
}

