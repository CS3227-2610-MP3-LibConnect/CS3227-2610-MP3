import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  defaultLostBookFineMinorUnits,
  getLostBookFineMinorUnits,
} from '../dist/apps/api/src/config/fines.js';

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  LOST_BOOK_FINE_MINOR_UNITS: process.env.LOST_BOOK_FINE_MINOR_UNITS,
};

afterEach(() => {
  if (originalEnvironment.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment.NODE_ENV;
  if (originalEnvironment.LOST_BOOK_FINE_MINOR_UNITS === undefined)
    delete process.env.LOST_BOOK_FINE_MINOR_UNITS;
  else process.env.LOST_BOOK_FINE_MINOR_UNITS = originalEnvironment.LOST_BOOK_FINE_MINOR_UNITS;
});

test('uses the development fallback outside production', () => {
  process.env.NODE_ENV = 'test';
  delete process.env.LOST_BOOK_FINE_MINOR_UNITS;
  assert.equal(getLostBookFineMinorUnits(), defaultLostBookFineMinorUnits);
});

test('fails closed when production fine policy is missing', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.LOST_BOOK_FINE_MINOR_UNITS;
  assert.throws(() => getLostBookFineMinorUnits(), /must be configured in production/);
});

test('accepts a configured positive safe integer', () => {
  process.env.NODE_ENV = 'production';
  process.env.LOST_BOOK_FINE_MINOR_UNITS = '1250';
  assert.equal(getLostBookFineMinorUnits(), 1250);
});

test('rejects invalid configured fine values', () => {
  process.env.NODE_ENV = 'production';
  for (const value of ['0', '-1', '1.25', 'not-a-number']) {
    process.env.LOST_BOOK_FINE_MINOR_UNITS = value;
    assert.throws(() => getLostBookFineMinorUnits(), /positive|integer/);
  }
});
