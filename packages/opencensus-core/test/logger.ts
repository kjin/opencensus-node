import {Logger} from '../src';

const noop = () => {};

/**
 * A logger used for testing that doesn't do anything.
 */
export class TestLogger implements Logger {
  level = '';
  error = noop;
  warn = noop;
  info = noop;
  debug = noop;
  silly = noop;
}