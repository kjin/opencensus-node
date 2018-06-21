/**
 * Copyright 2018, OpenCensus Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';

import {Exporter, ExporterBuffer, SpanData, SpanKind} from '../src';
import {RootSpan} from '../src/trace/model/root-span';

import {TestLogger} from './logger';

const DEFAULT_BUFFER_SIZE = 3;
const DEFAULT_BUFFER_TIMEOUT = 2000;  // time in milliseconds

class TestExporter implements Exporter {
  readonly publishedData: SpanData[][] = [];
  onStartSpan() {}
  onEndSpan() {}
  async publish(spans: SpanData[]): Promise<string|number|void> {
    this.publishedData.push(spans);
  }
}

describe('ExporterBuffer', () => {
  const logger = new TestLogger();
  let exporter: Exporter;

  const defaultBufferConfig = {
    bufferSize: DEFAULT_BUFFER_SIZE,
    bufferTimeout: DEFAULT_BUFFER_TIMEOUT,
    logger
  };

  const createRootSpans = (num: number): RootSpan[] => {
    const rootSpans = [];
    for (let i = 0; i < num; i++) {
      const rootSpan = new RootSpan(logger, {name: `rootSpan.${i}`});
      rootSpan.start();
      for (let j = 0; j < 10; j++) {
        rootSpan.startChildSpan(`childSpan.${i}.${j}`, SpanKind.CLIENT);
      }
      rootSpans.push(rootSpan);
    }
    return rootSpans;
  };

  beforeEach(() => {
    exporter = new TestExporter();
  });

  /**
   * Should return the Buffer
   */
  describe('setBufferSize', () => {
    it('should set BufferSize', () => {
      const buffer = new ExporterBuffer(exporter, defaultBufferConfig);
      const newBufferSize = DEFAULT_BUFFER_SIZE + 10;
      const bufferResize = buffer.setBufferSize(newBufferSize);
      assert.ok(bufferResize instanceof ExporterBuffer);
      assert.strictEqual(bufferResize.getBufferSize(), newBufferSize);
    });
  });

  /**
   * Should add one item to the Buffer
   */
  describe('addToBuffer', () => {
    it('should add one item to the Buffer', () => {
      const buffer = new ExporterBuffer(exporter, defaultBufferConfig);
      buffer.addToBuffer(new RootSpan(logger).data);
      assert.strictEqual(buffer.getQueue().length, 1);
    });
  });

  /**
   * Should force flush
   */
  describe('addToBuffer force flush ', () => {
    it('should force flush', () => {
      const buffer = new ExporterBuffer(exporter, defaultBufferConfig);
      const rootSpans = createRootSpans(DEFAULT_BUFFER_SIZE);
      for (const rootSpan of rootSpans) {
        buffer.addToBuffer(rootSpan.data);
      }
      assert.strictEqual(buffer.getQueue().length, buffer.getBufferSize());
      buffer.addToBuffer(new RootSpan(logger).data);
      assert.strictEqual(buffer.getQueue().length, 0);
    });
  });

  /**
   * Should flush by timeout
   */
  describe('addToBuffer force flush by timeout ', () => {
    it('should flush by timeout', (done) => {
      const buffer = new ExporterBuffer(exporter, defaultBufferConfig);
      buffer.addToBuffer(new RootSpan(logger).data);
      assert.strictEqual(buffer.getQueue().length, 1);
      setTimeout(() => {
        assert.strictEqual(buffer.getQueue().length, 0);
        done();
      }, DEFAULT_BUFFER_TIMEOUT + 100);
    }).timeout(5000);
  });
});
