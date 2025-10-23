"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BQTap = void 0;
exports.createBQTap = createBQTap;
const bigquery_1 = require("@google-cloud/bigquery");
class BQTap {
    constructor(config) {
        this.logBuffer = [];
        this.flushTimer = null;
        this.isActive = false;
        this.tableReady = false;
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
        const bqOptions = {
            projectId: this.config.projectId,
        };
        if (this.config.credentials) {
            try {
                bqOptions.credentials = JSON.parse(this.config.credentials);
            }
            catch (error) {
                throw new Error('Invalid credentials JSON string');
            }
        }
        this.bigquery = new bigquery_1.BigQuery(bqOptions);
    }
    /**
     * Start intercepting console methods
     */
    start() {
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
    stop() {
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
    async flush() {
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
        }
        catch (error) {
            // Log detailed error information
            if (error.name === 'PartialFailureError' && error.errors) {
                this.originalConsole.error('BQTap: Partial failure inserting logs:');
                error.errors.forEach((err, index) => {
                    this.originalConsole.error(`  Row ${index}:`, err.errors);
                    this.originalConsole.error(`  Data:`, JSON.stringify(err.row, null, 2));
                });
            }
            if (this.config.onError) {
                this.config.onError(error);
            }
            else {
                // Use original console.error to avoid infinite loop
                this.originalConsole.error('BQTap: Failed to insert logs into BigQuery:', error.message || error);
            }
        }
    }
    /**
     * Ensure BigQuery table exists, create if it doesn't
     */
    async ensureTable() {
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
        }
        catch (error) {
            // If table already exists, that's fine
            if (error.code === 409 || error.message?.includes('Already Exists')) {
                this.tableReady = true;
                return;
            }
            if (this.config.onError) {
                this.config.onError(error);
            }
            else {
                this.originalConsole.error('BQTap: Failed to ensure table exists:', error);
            }
            // Mark as ready to prevent repeated attempts
            this.tableReady = true;
        }
    }
    overrideConsoleMethod(method) {
        const originalMethod = this.originalConsole[method];
        console[method] = (...args) => {
            // Call original console method if passthrough is enabled
            if (this.config.passthrough) {
                originalMethod(...args);
            }
            // Create log entry
            const logEntry = {
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
    formatMessage(args) {
        return args
            .map((arg) => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                }
                catch {
                    return String(arg);
                }
            }
            return String(arg);
        })
            .join(' ');
    }
    serializeArgs(args) {
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
                }
                catch {
                    return String(arg);
                }
            }
            return arg;
        });
    }
}
exports.BQTap = BQTap;
// Export types
__exportStar(require("./types"), exports);
// Convenience function for quick setup
function createBQTap(config) {
    return new BQTap(config);
}
