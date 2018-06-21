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

import {CoreTracer, SpanData, SpanKind, TracerConfig} from '../src';
import {RootSpan} from '../src/trace/model/root-span';

const defaultConfig: TracerConfig = {
  samplingRate: 1.0  // always sampled
};

describe('Tracer', () => {
  it('should be active after it is started', () => {
    const tracer = new CoreTracer();
    assert.ok(!tracer.active);
    tracer.start(defaultConfig);
    assert.ok(tracer.active);
    tracer.stop();
  });

  it('should not be active after it is stopped', () => {
    const tracer = new CoreTracer();
    tracer.start(defaultConfig);
    assert.strictEqual(tracer.active, true);
    tracer.stop();
    assert.strictEqual(tracer.active, false);
  });

  it('should expose the currently running root span', () => {
    const tracer = new CoreTracer().start(defaultConfig);
    tracer.startRootSpan({name: 'root'}, rootSpan => {
      assert.strictEqual(tracer.currentRootSpan, rootSpan);
    });
    tracer.stop();
  });

  it('should start root spans when they are created', () => {
    const tracer = new CoreTracer().start(defaultConfig);
    const earliest = Date.now();
    const rootSpan = tracer.startRootSpan({name: 'root'}, x => x);
    const latest = Date.now();
    let spanData: SpanData;
    rootSpan.registerSpanEventListener(
        {onStartSpan: () => {}, onEndSpan: data => spanData = data});
    rootSpan.end();
    assert.ok(spanData);
    assert.ok(spanData.startTime >= earliest);
    assert.ok(spanData.startTime <= latest);
    tracer.stop();
  });

  it('should call through to RootSpan#createChildSpan when child span created',
     () => {
       const tracer = new CoreTracer().start(defaultConfig);
       const rootSpan = tracer.startRootSpan({name: 'root'}, x => x);
       let createChildSpanCalled = false;
       rootSpan.startChildSpan = function(name, kind?) {
         createChildSpanCalled = true;
         assert.strictEqual(name, 'child');
         assert.strictEqual(kind, SpanKind.SPAN_KIND_UNSPECIFIED);
         return RootSpan.prototype.startChildSpan.call(this, name, kind);
       };
     });

  it('should create root spans with appropriate supplied fields', () => {
    const tracer = new CoreTracer().start(defaultConfig);
    const rootSpan = tracer.startRootSpan(
        {
          name: 'root',
          spanContext: {traceId: 'a', spanId: 'b', options: 1},
          kind: SpanKind.CLIENT
        },
        x => x);
    let spanData: SpanData;
    rootSpan.registerSpanEventListener(
        {onStartSpan: () => {}, onEndSpan: data => spanData = data});
    rootSpan.end();
    assert.ok(spanData);
    assert.strictEqual(spanData.name, 'root');
    assert.strictEqual(spanData.traceId, 'a');
    assert.strictEqual(spanData.parentSpanId, 'b');
    assert.strictEqual(spanData.kind, SpanKind.CLIENT);
    tracer.stop();
  });

  it('should create root spans with acceptable defaults', () => {
    const tracer = new CoreTracer().start(defaultConfig);
    const rootSpan = tracer.startRootSpan({name: 'root'}, x => x);
    let spanData: SpanData;
    rootSpan.registerSpanEventListener(
        {onStartSpan: () => {}, onEndSpan: data => spanData = data});
    rootSpan.end();
    assert.ok(spanData);
    assert.ok(!spanData.parentSpanId);
    assert.ok(spanData.spanId);
    assert.strictEqual(spanData.kind, SpanKind.SERVER);
    tracer.stop();
  });

  it('should not create a root span if not active', () => {
    const tracer = new CoreTracer();
    const rootSpan = tracer.startRootSpan({name: 'root'}, x => x);
    assert.ok(!rootSpan);
  });

  it('should forward span events to listeners', () => {
    const tracer = new CoreTracer().start(defaultConfig);
    let eventMarks = '';
    // Register a few listeners. We expect the listeners to be called in a
    // certain order.
    tracer.registerSpanEventListener({
      onStartSpan: data => {
        assert.strictEqual(data.name, 'root');
        eventMarks += '0';
      },
      onEndSpan: data => {
        assert.strictEqual(data.name, 'root');
        eventMarks += '3';
      }
    });
    tracer.registerSpanEventListener({
      onStartSpan: () => {
        eventMarks += '1';
      },
      onEndSpan: () => {
        eventMarks += '4';
      }
    });
    const rootSpan = tracer.startRootSpan({name: 'root'}, x => x);
    eventMarks += '2';
    rootSpan.end();
    eventMarks += '5';
    assert.strictEqual(eventMarks, '012345');
    tracer.stop();
  });

  it('should not forward span events to unregistered listeners', () => {
    const tracer = new CoreTracer().start(defaultConfig);
    const badListener = {
      onStartSpan: () => assert.fail('unexpected line hit'),
      onEndSpan: () => assert.fail('unexpected line hit'),
    };
    tracer.registerSpanEventListener(badListener);
    tracer.unregisterSpanEventListener(badListener);
    tracer.startRootSpan({name: 'root'}, x => x);
    tracer.stop();
  });

  describe('startRootSpan() with sampler never', () => {
    it('should not create a root span', () => {
      const tracer = new CoreTracer();
      const config = {samplingRate: 0} as TracerConfig;
      tracer.start(config);
      tracer.startRootSpan({name: 'root'}, (rootSpan) => {
        assert.strictEqual(rootSpan, null);
      });
      tracer.stop();
    });
  });

  it('should expose an option to clear the current root span', () => {
    const tracer = new CoreTracer();
    tracer.start(defaultConfig);
    tracer.startRootSpan({name: 'root'}, () => {
      assert.ok(tracer.currentRootSpan);
      tracer.clearCurrentTrace();
      assert.ok(!tracer.currentRootSpan);
    });
    tracer.stop();
  });
});
