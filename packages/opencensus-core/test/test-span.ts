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

import {Span, SpanData, SpanEventListener, SpanKind} from '../src';
import {BaseSpan, ChildSpan} from '../src/trace/model/base-span';
import {RootSpan} from '../src/trace/model/root-span';

import {TestLogger} from './logger';

/**
 * An interface that represents options for mutateAndCheckSpan.
 */
type MutateAndCheckSpanOptions = {
  mutate: (span: Span) => void
}&Partial<SpanEventListener>;

/**
 * A helper function which, when awaited, delays execution for `ms` ms.
 * @param ms The number of milliseconds to delay execution.
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A concrete subclass of BaseSpan.
 */
class TestSpan extends BaseSpan {}

describe('Span implementations', () => {
  const logger = new TestLogger();

  describe('BaseSpan (common behavior for ChildSpan and RootSpan)', () => {
    /**
     * A helper function that does common work in mutating a span, and then
     * checking that the values in the span data passed to span event listeners
     * reflects these mutations. The span is guaranteed to be started and ended.
     * @param options Options that specify how the span should be mutated and
     * checked. Either the start span or end span listener must be defined.
     */
    function mutateAndCheckSpan(options: MutateAndCheckSpanOptions) {
      const span = new TestSpan(logger);
      let onStartSpanCalled = false;
      let onEndSpanCalled = false;
      span.registerSpanEventListener({
        onStartSpan: (spanData: SpanData) => {
          onStartSpanCalled = true;
          if (options.onStartSpan) {
            options.onStartSpan(spanData);
          }
        },
        onEndSpan: (spanData: SpanData) => {
          onEndSpanCalled = true;
          if (options.onEndSpan) {
            options.onEndSpan(spanData);
          }
        }
      });
      options.mutate(span);
      span.start();
      span.end();
      assert.ok(onStartSpanCalled && onEndSpanCalled);
    }

    it('should expose a way to get trace context', () => {
      const span =
          new TestSpan(logger, {traceId: 'my-trace-id', spanId: 'my-span-id'});
      assert.deepStrictEqual(
          span.getSpanContext(),
          {traceId: 'my-trace-id', spanId: 'my-span-id', options: 1});
    });

    it('should assign endTime when started the first time', async () => {
      const span = new TestSpan(logger);
      let earliest: number, latest: number;
      let spanData: SpanData;
      span.registerSpanEventListener({
        onStartSpan: () => {},
        onEndSpan: data => {
          spanData = data;
        },
      });
      await wait(10);
      earliest = Date.now();
      span.start();
      latest = Date.now();
      await wait(10);
      span.start();  // shouldn't change the start time
      span.end();
      span.start();  // shouldn't change the start time
      assert.ok(spanData);
      assert.ok(spanData.startTime >= earliest);
      assert.ok(spanData.startTime <= latest);
    });

    it('should assign endTime when ended after being started the first time',
       async () => {
         const span = new TestSpan(logger);
         let earliest: number, latest: number;
         let spanData: SpanData;
         span.registerSpanEventListener(
             {onStartSpan: () => {}, onEndSpan: data => spanData = data});
         span.end();  // shouldn't change the end time
         span.start();
         await wait(10);
         earliest = Date.now();
         span.end();
         latest = Date.now();
         await wait(10);
         span.end();  // shouldn't change the end time
         assert.ok(spanData);
         assert.ok(spanData.endTime >= earliest);
         assert.ok(spanData.endTime <= latest);
       });

    describe('adding an attribute', () => {
      it('should add an attribute to the backing span data', () => {
        mutateAndCheckSpan({
          mutate: (span) => {
            ['String', 'Number', 'Boolean'].forEach(
                attType => span.addAttribute(
                    'testKey' + attType, 'testValue' + attType));
          },
          onEndSpan: (spanData) => {
            ['String', 'Number', 'Boolean'].forEach(
                attType => assert.strictEqual(
                    spanData.attributes['testKey' + attType],
                    'testValue' + attType));
          }
        });
      });
    });

    describe('adding an annotation', () => {
      it('should add an annotation event to the backing span data', () => {
        const attributes = {};
        mutateAndCheckSpan({
          mutate: (span) => {
            span.addAnnotation('a', 1, attributes);
          },
          onEndSpan: (spanData) => {
            assert.deepStrictEqual(
                spanData.timeEvents,
                [{description: 'a', timestamp: 1, attributes}]);
          }
        });
      });
    });

    describe('adding a link', () => {
      it('should add a link to the backing span data', () => {
        const attributes = {};
        mutateAndCheckSpan({
          mutate: (span) => {
            span.addLink('a', 'b', 'c', attributes);
          },
          onEndSpan: (spanData) => {
            assert.deepStrictEqual(
                spanData.links,
                [{traceId: 'a', spanId: 'b', type: 'c', attributes}]);
          }
        });
      });
    });

    describe('adding a message event', () => {
      it('should add a message event to the backing span data', () => {
        mutateAndCheckSpan({
          mutate: (span) => {
            span.addMessageEvent('a', 'b');
          },
          onEndSpan: (spanData) => {
            assert.deepStrictEqual(spanData.timeEvents, [{type: 'a', id: 'b'}]);
          }
        });
      });
    });
  });

  describe('ChildSpan', () => {
    it('should be distinguishable from root spans', () => {
      const span = new ChildSpan(logger);
      let spanData: SpanData;
      span.registerSpanEventListener(
          {onStartSpan: data => spanData = data, onEndSpan: () => {}});
      span.start();
      assert.ok(spanData);
      assert.strictEqual(spanData.sameProcessAsParentSpan, true);
    });

    it('should exhibit nothing more than common behavior', () => {
      Object.getOwnPropertyNames(TestSpan.prototype).forEach((prop) => {
        if (prop === 'constructor') {
          return;
        }
        // `prop` is known to be a property of both classes.
        // tslint:disable:no-any
        assert.strictEqual(
            (ChildSpan.prototype as any)[prop],
            (TestSpan.prototype as any)[prop]);
        // tslint:enable:no-any
      });
    });
  });

  describe('RootSpan', () => {
    it('should be distinguishable from child spans', () => {
      const span = new RootSpan(logger);
      let spanData: SpanData;
      span.registerSpanEventListener(
          {onStartSpan: data => spanData = data, onEndSpan: () => {}});
      span.start();
      assert.ok(spanData);
      assert.strictEqual(spanData.sameProcessAsParentSpan, false);
    });

    it('should start child spans when they are created', () => {
      const rootSpan = new RootSpan(logger);
      rootSpan.start();
      const earliest = Date.now();
      const childSpan = rootSpan.startChildSpan('child');
      const latest = Date.now();
      let childSpanData: SpanData;
      childSpan.registerSpanEventListener(
          {onStartSpan: () => {}, onEndSpan: data => childSpanData = data});
      childSpan.end();
      assert.ok(childSpanData);
      assert.ok(childSpanData.startTime >= earliest);
      assert.ok(childSpanData.startTime <= latest);
    });

    it('should truncate child spans when the root span is ended', () => {
      const rootSpan = new RootSpan(logger);
      rootSpan.start();
      const childSpan = rootSpan.startChildSpan('child');
      let childSpanData: SpanData;
      childSpan.registerSpanEventListener(
          {onStartSpan: () => {}, onEndSpan: data => childSpanData = data});
      const earliest = Date.now();
      rootSpan.end();
      const latest = Date.now();
      assert.ok(childSpanData);
      assert.ok(childSpanData.endTime >= earliest);
      assert.ok(childSpanData.endTime <= latest);
    });

    it('should assign the correct properties to the child span', () => {
      // Properties to look for are:
      // - Trace ID
      // - Parent Span ID
      // - Name
      // - Span Kind
      const rootSpan = new RootSpan(logger);
      rootSpan.start();
      const childSpan =
          rootSpan.startChildSpan('child', SpanKind.SPAN_KIND_UNSPECIFIED);
      let childSpanData: SpanData;
      childSpan.registerSpanEventListener(
          {onStartSpan: () => {}, onEndSpan: data => childSpanData = data});
      childSpan.end();
      assert.ok(childSpanData);
      assert.strictEqual(
          childSpanData.traceId, rootSpan.getSpanContext().traceId);
      assert.strictEqual(
          childSpanData.parentSpanId, rootSpan.getSpanContext().spanId);
      assert.strictEqual(childSpanData.name, 'child');
      assert.strictEqual(childSpanData.kind, SpanKind.SPAN_KIND_UNSPECIFIED);
    });
  });
});
