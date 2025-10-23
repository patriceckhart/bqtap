import { BigQuery } from '@google-cloud/bigquery';
import { BQTapConfig, LogEntry } from './types';

export class BQTap {
  private bigquery: BigQuery;
  private config: Required<Omit<BQTapConfig, 'credentials' | 'metadata' | 'onError'>> & Pick<BQTapConfig, 'credentials' | 'metadata' | 'onError'>;
  private logBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    info: typeof console.info;
    debug: typeof console.debug;
  };
  private isActive = false;
  private tableReady = false;

  constructor(config: BQTapConfig) {
    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

    // Check if enabled via config or environment variable
    const isEnabled = config.enabled !== undefined
      ? config.enabled
      : (process.env.BQTAP_ENABLED !== 'false' && process.env.BQTAP_ENABLED !== '0');

    // Set defaults
    this.config = {
      projectId: config.projectId,
      dataset: config.dataset,
      table: config.table,
      credentials: config.credentials,
      enabled: isEnabled,
      autoCreateTable: config.autoCreateTable !== undefined ? config.autoCreateTable : true,
      methods: config.methods || ['log', 'warn', 'error', 'info', 'debug'],
      batchSize: config.batchSize || 10,
      flushInterval: config.flushInterval || 5000,
      passthrough: config.passthrough !== undefined ? config.passthrough : true,
      metadata: config.metadata,
      onError: config.onError,
    };

    // Initialize BigQuery client
    const bqOptions: any = {
      projectId: this.config.projectId,
    };

    if (this.config.credentials) {
      try {
        bqOptions.credentials = JSON.parse(this.config.credentials);
      } catch (error) {
        throw new Error('Invalid credentials JSON string');
      }
    }

    this.bigquery = new BigQuery(bqOptions);
  }

  /**
   * Start intercepting console methods
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    // Don't start if disabled
    if (!this.config.enabled) {
      return;
    }

    this.config.methods.forEach((method) => {
      this.overrideConsoleMethod(method);
    });

    // Start flush timer
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);

    this.isActive = true;
  }

  /**
   * Stop intercepting console methods and restore originals
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    // Flush any remaining logs
    this.flush();

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Restore original console methods
    this.config.methods.forEach((method) => {
      console[method] = this.originalConsole[method];
    });

    this.isActive = false;
  }

  /**
   * Manually flush logs to BigQuery
   */
  async flush(): Promise<void> {
    // Ensure table exists before first flush
    if (!this.tableReady && this.config.autoCreateTable) {
      await this.ensureTable();
    }

    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      await this.bigquery
        .dataset(this.config.dataset)
        .table(this.config.table)
        .insert(logsToSend);
    } catch (error: any) {
      // Log detailed error information
      if (error.name === 'PartialFailureError' && error.errors) {
        this.originalConsole.error('BQTap: Partial failure inserting logs:');
        error.errors.forEach((err: any, index: number) => {
          this.originalConsole.error(`  Row ${index}:`, err.errors);
          this.originalConsole.error(`  Data:`, JSON.stringify(err.row, null, 2));
        });
      }

      if (this.config.onError) {
        this.config.onError(error as Error);
      } else {
        // Use original console.error to avoid infinite loop
        this.originalConsole.error('BQTap: Failed to insert logs into BigQuery:', error.message || error);
      }
    }
  }

  /**
   * Ensure BigQuery table exists, create if it doesn't
   */
  private async ensureTable(): Promise<void> {
    if (this.tableReady) {
      return;
    }

    try {
      const dataset = this.bigquery.dataset(this.config.dataset);
      const table = dataset.table(this.config.table);

      // Check if table exists
      const [exists] = await table.exists();

      if (!exists) {
        // Create table with schema
        const schema = {
          fields: [
            { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'level', type: 'STRING', mode: 'REQUIRED' },
            { name: 'message', type: 'STRING', mode: 'NULLABLE' },
            { name: 'args', type: 'STRING', mode: 'NULLABLE' },
            { name: 'metadata', type: 'STRING', mode: 'NULLABLE' },
          ],
        };

        await dataset.createTable(this.config.table, { schema });
        this.originalConsole.log(`BQTap: Created BigQuery table ${this.config.dataset}.${this.config.table}`);
      }

      this.tableReady = true;
    } catch (error: any) {
      // If table already exists, that's fine
      if (error.code === 409 || error.message?.includes('Already Exists')) {
        this.tableReady = true;
        return;
      }

      if (this.config.onError) {
        this.config.onError(error as Error);
      } else {
        this.originalConsole.error('BQTap: Failed to ensure table exists:', error);
      }
      // Mark as ready to prevent repeated attempts
      this.tableReady = true;
    }
  }

  private overrideConsoleMethod(method: 'log' | 'warn' | 'error' | 'info' | 'debug'): void {
    const originalMethod = this.originalConsole[method];

    console[method] = (...args: any[]) => {
      // Call original console method if passthrough is enabled
      if (this.config.passthrough) {
        originalMethod(...args);
      }

      // Create log entry
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: method,
        message: this.formatMessage(args),
        args: JSON.stringify(this.serializeArgs(args)),
        ...(this.config.metadata && { metadata: JSON.stringify(this.config.metadata) }),
      };

      // Add to buffer
      this.logBuffer.push(logEntry);

      // Flush if batch size reached
      if (this.logBuffer.length >= this.config.batchSize) {
        this.flush();
      }
    };
  }

  private formatMessage(args: any[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
  }

  private serializeArgs(args: any[]): any[] {
    return args.map((arg) => {
      if (arg instanceof Error) {
        return {
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        };
      }

      if (typeof arg === 'object' && arg !== null) {
        try {
          // Try to serialize, but avoid circular references
          JSON.stringify(arg);
          return arg;
        } catch {
          return String(arg);
        }
      }

      return arg;
    });
  }
}

// Export types
export * from './types';

// Convenience function for quick setup
export function createBQTap(config: BQTapConfig): BQTap {
  return new BQTap(config);
}
