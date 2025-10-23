export interface BQTapConfig {
    /** Google Cloud project ID */
    projectId: string;
    /** BigQuery dataset name */
    dataset: string;
    /** BigQuery table name */
    table: string;
    /** Google Cloud credentials as JSON string (optional if using default credentials) */
    credentials?: string;
    /** Enable/disable console override (default: true, can be set via BQTAP_ENABLED env var) */
    enabled?: boolean;
    /** Automatically create BigQuery table if it doesn't exist (default: true) */
    autoCreateTable?: boolean;
    /** Console methods to intercept (default: all) */
    methods?: ('log' | 'warn' | 'error' | 'info' | 'debug')[];
    /** Batch size for sending logs to BigQuery (default: 10) */
    batchSize?: number;
    /** Flush interval in milliseconds (default: 5000) */
    flushInterval?: number;
    /** Whether to also output to original console (default: true) */
    passthrough?: boolean;
    /** Custom metadata to attach to all log entries */
    metadata?: Record<string, any>;
    /** Error handler for BigQuery insertion failures */
    onError?: (error: Error) => void;
}
export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    args: string;
    metadata?: string;
}
