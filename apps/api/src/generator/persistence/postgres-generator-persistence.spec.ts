import { persistDatasetToPostgres } from './postgres-generator-persistence';
import { Client } from 'pg';

// Mock the pg Client
jest.mock('pg', () => {
  const mClient = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };
  return { Client: jest.fn(() => mClient) };
});

describe('PostgresGeneratorPersistence', () => {
  let client: any;

  beforeEach(() => {
    client = new Client();
    (client.query as jest.Mock).mockClear();
    (client.connect as jest.Mock).mockClear();
    (client.end as jest.Mock).mockClear();
  });

  it('successfully connects, begins transaction, truncates, inserts, and commits', async () => {
    (client.query as jest.Mock).mockImplementation((q) => {
      if (q.includes('current_database')) return Promise.resolve({ rows: [{ current_database: 'atlas_commerce' }] });
      return Promise.resolve({ rows: [] });
    });

    const result = await persistDatasetToPostgres();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    
    // Verify truncation happened
    const queries = (client.query as jest.Mock).mock.calls.map(c => c[0]);
    expect(queries.some(q => q.includes('TRUNCATE TABLE') && q.includes('RESTART IDENTITY CASCADE'))).toBe(true);

    // Verify commit happened
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.end).toHaveBeenCalledTimes(1);

    expect(result.success).toBe(true);
    expect(result.counts.customers).toBe(10);
    expect(result.counts.products).toBe(6);
    expect(result.counts.orders).toBe(20);
    expect(result.counts.campaigns).toBeUndefined(); // we used marketingCampaigns
    expect(result.counts.marketingCampaigns).toBe(4);
  });

  it('rolls back transaction on error', async () => {
    const error = new Error('Database insertion failed');
    // Force the query to throw on TRUNCATE
    (client.query as jest.Mock).mockImplementation((q) => {
      if (q.includes('current_database')) return Promise.resolve({ rows: [{ current_database: 'atlas_commerce' }] });
      if (q.includes('TRUNCATE')) throw error;
      return Promise.resolve({ rows: [] });
    });

    await expect(persistDatasetToPostgres()).rejects.toThrow('Database insertion failed');

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
