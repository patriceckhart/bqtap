import { BQTapConfig } from './types';
export declare class BQTap {
    private bigquery;
    private config;
    private logBuffer;
    private flushTimer;
    private originalConsole;
    private isActive;
    private tableReady;
    constructor(config: BQTapConfig);
    /**
     * Start intercepting console methods
     */
    start(): void;
    /**
     * Stop intercepting console methods and restore originals
     */
    stop(): void;
    /**
     * Manually flush logs to BigQuery
     */
    flush(): Promise<void>;
    /**
     * Ensure BigQuery table exists, create if it doesn't
     */
    private ensureTable;
    private overrideConsoleMethod;
    private formatMessage;
    private serializeArgs;
}
export * from './types';
export declare function createBQTap(config: BQTapConfig): BQTap;
