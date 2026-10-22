import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveApiOrigin, validateOrigin } from '../dist/apps/api/src/config/origins.js';

test('production startup requires an explicit API origin', () => {
  assert.throws(
    () => resolveApiOrigin({ nodeEnv: 'production', port: 3000 }),
    /API_ORIGIN must be configured in production/,
  );
});

test('production startup rejects a cleartext API origin', () => {
  assert.throws(
    () => resolveApiOrigin({ nodeEnv: 'production', apiOrigin: 'http://api.example.test', port: 3000 }),
    /API_ORIGIN must use HTTPS in production/,
  );
});

test('production startup accepts a validated HTTPS API origin', () => {
  assert.equal(
    resolveApiOrigin({ nodeEnv: 'production', apiOrigin: 'https://api.example.test', port: 3000 }),
    'https://api.example.test',
  );
});

test('local startup retains the localhost default and rejects origin paths', () => {
  assert.equal(resolveApiOrigin({ nodeEnv: 'development', port: 3000 }), 'http://localhost:3000');
  assert.throws(
    () => validateOrigin('API_ORIGIN', 'https://api.example.test/reset'),
    /API_ORIGIN must be a valid origin URL without a path/,
  );
});
