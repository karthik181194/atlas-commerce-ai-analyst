import { Test, TestingModule } from '@nestjs/testing';
import { SafeQueryService } from './safe-query.service';
import { Pool } from 'pg';

jest.mock('pg', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn(() => mClient),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('SafeQueryService', () => {
  let service: SafeQueryService;
  let pool: any;
  let client: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SafeQueryService],
    }).compile();

    service = module.get<SafeQueryService>(SafeQueryService);
    service.onModuleInit();
    pool = (service as any).pool;
    client = await pool.connect();
    
    client.query.mockClear();
    client.release.mockClear();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should execute safe query with timeout and read-only boundaries', async () => {
    client.query.mockResolvedValueOnce({}); // BEGIN READ ONLY
    client.query.mockResolvedValueOnce({}); // SET LOCAL statement_timeout
    client.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // actual query
    client.query.mockResolvedValueOnce({}); // COMMIT

    const result = await service.executeQuery('SELECT * FROM test');
    
    expect(result).toEqual([{ id: 1 }]);
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN READ ONLY');
    expect(client.query).toHaveBeenNthCalledWith(2, "SET LOCAL statement_timeout = '15s'");
    expect(client.query).toHaveBeenNthCalledWith(3, 'SELECT * FROM test', []);
    expect(client.query).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('should truncate results if over the limit', async () => {
    const largeRows = Array.from({ length: 6000 }, (_, i) => ({ id: i }));
    client.query.mockResolvedValueOnce({});
    client.query.mockResolvedValueOnce({});
    client.query.mockResolvedValueOnce({ rows: largeRows });
    client.query.mockResolvedValueOnce({});

    const result = await service.executeQuery('SELECT * FROM large_table');
    
    expect(result.length).toBe(5000);
    expect(result[4999]).toEqual({ id: 4999 });
  });

  it('should reject unsafe SQL mutations', async () => {
    const unsafeQueries = [
      'INSERT INTO users (name) VALUES ($1)',
      'UPDATE orders SET status = $1',
      'DELETE FROM order_items',
      'DROP TABLE customers',
      'TRUNCATE orders',
      'GRANT ALL PRIVILEGES',
      'ALTER TABLE users ADD column test',
    ];

    for (const sql of unsafeQueries) {
      await expect(service.executeQuery(sql)).rejects.toThrow(/Unsafe SQL detected/);
    }
  });

  it('should rollback transaction on error', async () => {
    client.query.mockResolvedValueOnce({});
    client.query.mockResolvedValueOnce({});
    client.query.mockRejectedValueOnce(new Error('Syntax error')); // actual query fails

    await expect(service.executeQuery('SELECT BAD SQL')).rejects.toThrow('Syntax error');
    
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

