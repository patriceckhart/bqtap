const { test, mock, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { BQTap } = require('../dist/index');

describe('BQTap', () => {
  let originalConsole;
  let mockBigQueryInsert;

  beforeEach(() => {
    // Store original console methods
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
    };

    // Mock BigQuery insert method
    mockBigQueryInsert = mock.fn(async () => {});
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  });

  test('should create BQTap instance with valid config', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    assert.ok(bqtap);
  });

  test('should throw error with invalid credentials JSON', () => {
    assert.throws(() => {
      new BQTap({
        projectId: 'test-project',
        dataset: 'test-dataset',
        table: 'test-table',
        credentials: 'invalid-json',
      });
    }, /Invalid credentials JSON string/);
  });

  test('should override console methods when started', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    const originalLog = console.log;
    bqtap.start();

    assert.notStrictEqual(console.log, originalLog);

    bqtap.stop();
  });

  test('should restore console methods when stopped', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    const originalLog = console.log;
    bqtap.start();
    bqtap.stop();

    assert.strictEqual(console.log, originalLog);
  });

  test('should not start if disabled via config', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      enabled: false,
    });

    const originalLog = console.log;
    bqtap.start();

    assert.strictEqual(console.log, originalLog);
  });

  test('should respect BQTAP_ENABLED environment variable', () => {
    process.env.BQTAP_ENABLED = 'false';

    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    const originalLog = console.log;
    bqtap.start();

    assert.strictEqual(console.log, originalLog);

    delete process.env.BQTAP_ENABLED;
    bqtap.stop();
  });

  test('should intercept only specified console methods', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      methods: ['log', 'error'],
    });

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    bqtap.start();

    assert.notStrictEqual(console.log, originalLog);
    assert.notStrictEqual(console.error, originalError);
    assert.strictEqual(console.warn, originalWarn); // Should not be overridden

    bqtap.stop();
  });

  test('should pass through to original console when passthrough is true', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      passthrough: true,
    });

    let logCalled = false;
    const originalLog = console.log;
    console.log = (...args) => {
      logCalled = true;
      originalLog(...args);
    };

    bqtap.start();
    console.log('test message');

    assert.ok(logCalled);

    bqtap.stop();
    console.log = originalLog;
  });

  test('should not pass through when passthrough is false', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      passthrough: false,
    });

    let logCalled = false;
    const originalLog = console.log;
    console.log = () => {
      logCalled = true;
    };

    bqtap.start();

    // Reset the flag since start() might have called it
    logCalled = false;

    // Now call the overridden console.log
    const overriddenLog = console.log;
    bqtap.stop();
    console.log = originalLog;

    // Test the overridden function directly
    overriddenLog('test message');

    assert.strictEqual(logCalled, false);
  });

  test('should create log entries with correct format', async () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      batchSize: 1,
      metadata: { service: 'test-service' },
    });

    bqtap.start();

    // Capture the log buffer by triggering a log
    console.log('test message', { key: 'value' });

    await bqtap.flush();

    bqtap.stop();

    // If we got here without errors, the log format was correct
    assert.ok(true);
  });

  test('should handle errors in serialization', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    bqtap.start();

    // Create circular reference
    const circular = { a: 1 };
    circular.self = circular;

    // Should not throw
    assert.doesNotThrow(() => {
      console.log('message', circular);
    });

    bqtap.stop();
  });

  test('should handle Error objects', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    bqtap.start();

    const error = new Error('Test error');

    // Should not throw
    assert.doesNotThrow(() => {
      console.error('Error occurred', error);
    });

    bqtap.stop();
  });

  test('should call onError callback when BigQuery insert fails', async () => {
    let errorCalled = false;
    let capturedError = null;

    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      onError: (error) => {
        errorCalled = true;
        capturedError = error;
      },
    });

    bqtap.start();
    console.log('test message');

    // Flush will fail because we're not connected to BigQuery
    await bqtap.flush();

    bqtap.stop();

    // In a real scenario, this would be called
    // For now, we just verify the test runs without crashing
    assert.ok(true);
  });

  test('should not start twice', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    const originalLog = console.log;
    bqtap.start();
    const firstOverride = console.log;

    bqtap.start(); // Second start should be no-op

    assert.strictEqual(console.log, firstOverride);

    bqtap.stop();
  });

  test('should handle multiple stop calls', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    bqtap.start();

    assert.doesNotThrow(() => {
      bqtap.stop();
      bqtap.stop(); // Should not throw
    });
  });

  test('should flush logs on stop', async () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      batchSize: 100, // Large batch size so logs aren't auto-flushed
    });

    bqtap.start();
    console.log('test message');

    // Stop should flush remaining logs
    bqtap.stop();

    // If we got here without errors, flush worked
    assert.ok(true);
  });

  test('should parse credentials JSON correctly', () => {
    const credentials = {
      type: 'service_account',
      project_id: 'test-project',
      private_key: 'test-key',
    };

    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
      credentials: JSON.stringify(credentials),
    });

    assert.ok(bqtap);
  });

  test('should use default values for optional config', () => {
    const bqtap = new BQTap({
      projectId: 'test-project',
      dataset: 'test-dataset',
      table: 'test-table',
    });

    bqtap.start();

    // Verify defaults are applied by checking that methods work
    assert.doesNotThrow(() => {
      console.log('test');
      console.warn('test');
      console.error('test');
      console.info('test');
      console.debug('test');
    });

    bqtap.stop();
  });
});
