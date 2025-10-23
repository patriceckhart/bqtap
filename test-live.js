// Load environment variables from .env file
require('dotenv').config();

const { BQTap } = require('./dist/index');

console.log('Starting BQTap live test...\n');

const bqtap = new BQTap({
  projectId: process.env.BQTAP_PROJECT_ID,
  dataset: process.env.BQTAP_DATASET,
  table: process.env.BQTAP_TABLE,
  credentials: process.env.BQTAP_GOOGLE_API_CREDENTIALS,
  batchSize: 5,
  flushInterval: 2000,
  passthrough: true,
  autoCreateTable: true,
  metadata: {
    test: 'live-test',
    version: '1.0.0',
  },
});

// Start intercepting
bqtap.start();

console.log('Testing different log levels:');
console.log('This is a log message');
console.info('This is an info message', { userId: 123 });
console.warn('This is a warning', { code: 'WARN_001' });
console.error('This is an error', new Error('Test error'));
console.debug('Debug information', { debugData: true });

// Wait for batch size to be reached or interval
setTimeout(async () => {
  console.log('\nWaiting for auto-flush...');

  // Wait another moment for flush to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Manually flushing any remaining logs...');
  await bqtap.flush();
  console.log('Logs flushed successfully!');

  bqtap.stop();
  console.log('BQTap stopped. Test complete!');
  process.exit(0);
}, 1000);
