# BQTap

Console logging interceptor that automatically sends logs to Google BigQuery.

## Installation

```bash
npm install bqtap
```

## Prerequisites

1. A Google Cloud project with BigQuery API enabled
2. A BigQuery dataset created (the table will be created automatically by default)
3. Google Cloud credentials (one of the following):
   - Service account credentials as JSON string (recommended for production)
   - Application Default Credentials (ADC)
   - Google Cloud SDK authentication

**Note:** The BigQuery table will be created automatically with the correct schema when you first log. You can disable this by setting `autoCreateTable: false` in the configuration.

## Usage

### Basic Usage

```javascript
const { BQTap } = require('bqtap');

const bqtap = new BQTap({
  projectId: 'your-gcp-project-id',
  dataset: 'your-dataset-name',
  table: 'your-table-name',
  credentials: process.env.BQTAP_GOOGLE_API_CREDENTIALS, // JSON string (optional)
});

// Start intercepting console methods
bqtap.start();

// Now all console logs will be sent to BigQuery
console.log('Hello, BigQuery!');
console.error('An error occurred', { userId: 123 });
console.warn('Warning message');

// Stop intercepting when done
bqtap.stop();
```

### TypeScript Usage

```typescript
import { BQTap, BQTapConfig } from 'bqtap';

const config: BQTapConfig = {
  projectId: 'your-gcp-project-id',
  dataset: 'your-dataset-name',
  table: 'your-table-name',
};

const bqtap = new BQTap(config);
bqtap.start();
```

### Advanced Configuration

```javascript
const bqtap = new BQTap({
  projectId: 'your-gcp-project-id',
  dataset: 'logs',
  table: 'console_logs',

  // Google Cloud credentials as JSON string
  credentials: process.env.BQTAP_GOOGLE_API_CREDENTIALS,

  // Enable/disable (defaults to BQTAP_ENABLED env var)
  enabled: true,

  // Auto-create table if it doesn't exist (default: true)
  autoCreateTable: true,

  // Only intercept specific methods
  methods: ['error', 'warn'],

  // Batch size before sending to BigQuery
  batchSize: 20,

  // Flush interval in milliseconds
  flushInterval: 10000,

  // Disable passthrough to original console
  passthrough: false,

  // Add custom metadata to all logs
  metadata: {
    service: 'api-server',
    version: '1.0.0',
  },

  // Handle BigQuery insertion errors
  onError: (error) => {
    console.error('Failed to send logs to BigQuery:', error);
  },
});

bqtap.start();
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectId` | `string` | **required** | Google Cloud project ID |
| `dataset` | `string` | **required** | BigQuery dataset name |
| `table` | `string` | **required** | BigQuery table name |
| `credentials` | `string` | optional | Google Cloud credentials as JSON string |
| `enabled` | `boolean` | `true` | Enable/disable console override (also via `BQTAP_ENABLED` env var) |
| `autoCreateTable` | `boolean` | `true` | Automatically create BigQuery table if it doesn't exist |
| `methods` | `string[]` | `['log', 'warn', 'error', 'info', 'debug']` | Console methods to intercept |
| `batchSize` | `number` | `10` | Number of logs to batch before sending |
| `flushInterval` | `number` | `5000` | Flush interval in milliseconds |
| `passthrough` | `boolean` | `true` | Whether to also output to original console |
| `metadata` | `object` | optional | Custom metadata attached to all logs |
| `onError` | `function` | optional | Error handler for BigQuery failures |

## Methods

### `start()`

Start intercepting console methods and sending logs to BigQuery.

### `stop()`

Stop intercepting console methods and restore original behavior. Flushes any pending logs.

### `flush()`

Manually flush all buffered logs to BigQuery. Returns a Promise.

```javascript
await bqtap.flush();
```

## Best Practices

1. **Handle process termination**: Ensure logs are flushed before the process exits

```javascript
process.on('beforeExit', async () => {
  await bqtap.flush();
  bqtap.stop();
});
```

2. **Use environment variables**: Store configuration in environment variables

```javascript
const bqtap = new BQTap({
  projectId: process.env.BQTAP_PROJECT_ID,
  dataset: process.env.BQTAP_DATASET,
  table: process.env.BQTAP_TABLE,
  credentials: process.env.BQTAP_GOOGLE_API_CREDENTIALS, // JSON string
});
```

3. **Control activation with BQTAP_ENABLED**: Use environment variable to enable/disable logging

```javascript
// Set BQTAP_ENABLED=false to disable, BQTAP_ENABLED=true to enable
const bqtap = new BQTap({
  projectId: process.env.BQTAP_PROJECT_ID,
  dataset: process.env.BQTAP_DATASET,
  table: process.env.BQTAP_TABLE,
  credentials: process.env.BQTAP_GOOGLE_API_CREDENTIALS,
  // Will automatically check BQTAP_ENABLED env var
});

// Or explicitly control it via config
const bqtap = new BQTap({
  // ... other config
  enabled: true, // or false
});
```

4. **Add contextual metadata**: Include service information in metadata

```javascript
const bqtap = new BQTap({
  // ... other config
  metadata: {
    hostname: os.hostname(),
    pid: process.pid,
    service: 'my-service',
  },
});
```

## BigQuery Table Schema

By default, BQTap will automatically create the BigQuery table with the correct schema if it doesn't exist. The schema used is:

```sql
CREATE TABLE `your-project.your-dataset.logs` (
  timestamp TIMESTAMP NOT NULL,
  level STRING NOT NULL,
  message STRING,
  args STRING,  -- JSON-stringified array of arguments
  metadata STRING  -- JSON-stringified metadata object
);
```

### Manual Table Creation (Optional)

If you prefer to create the table manually or want to use advanced features like partitioning, you can set `autoCreateTable: false` and create the table yourself:

```sql
CREATE TABLE `your-project.your-dataset.logs` (
  timestamp TIMESTAMP NOT NULL,
  level STRING NOT NULL,
  message STRING,
  args STRING,  -- JSON-stringified array of arguments
  metadata STRING  -- JSON-stringified metadata object
)
PARTITION BY DATE(timestamp)
CLUSTER BY level;
```

## Development

### Running Tests

The package includes tests using Node.js built-in test runner:

```bash
npm test
```

This will build the TypeScript code and run all tests in the `test/` directory.

### Building

```bash
npm run build
```

This compiles the TypeScript code to JavaScript in the `dist/` directory.

## License

MIT
