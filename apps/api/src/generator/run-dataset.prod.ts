// Set environment variable before any imports
process.env.DATASET_ENV = 'production';

// Dynamic import ensures the env var is set before the module evaluates
require('./run-dataset');
