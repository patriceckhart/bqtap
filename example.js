const { BQTap } = require('./dist/index');

// Example configuration
const bqtap = new BQTap({
  projectId: process.env.BQTAP_PROJECT_ID || 'your-project-id',
  dataset: process.env.BQTAP_DATASET || 'your-dataset',
  table: process.env.BQTAP_TABLE || 'console_logs',

  // Optional: Google Cloud credentials as JSON string
  credentials: process.env.BQTAP_GOOGLE_API_CREDENTIALS,

  // Optional: Enable/disable (defaults to BQTAP_ENABLED env var)
  // enabled: true,

  // Optional: Auto-create BigQuery table if it doesn't exist (default: true)
  // autoCreateTable: true,

  // Optional: Only intercept specific methods
  methods: ['log', 'warn', 'error', 'info', 'debug'],

  // Optional: Batch configuration
  batchSize: 10,
  flushInterval: 5000,

  // Optional: Keep original console output
  passthrough: true,

  // Optional: Add metadata to all logs
  metadata: {
    service: 'example-app',
    version: '1.0.0',
  },

  // Optional: Handle errors
  onError: (error) => {
    console.error('BQTap error:', error.message);
  },
});

// Start intercepting
bqtap.start();

// Test different log levels
console.log('This is a log message');
console.info('This is an info message', { userId: 123 });
console.warn('This is a warning', { code: 'WARN_001' });
console.error('This is an error', new Error('Something went wrong'));
console.debug('Debug information', { debugData: true });

// Manually flush logs
setTimeout(async () => {
  console.log('Flushing logs...');
  await bqtap.flush();
  console.log('Logs flushed!');

  // Stop intercepting
  bqtap.stop();
  console.log('BQTap stopped');
}, 2000);

// Handle process termination
process.on('beforeExit', async () => {
  await bqtap.flush();
  bqtap.stop();
});
