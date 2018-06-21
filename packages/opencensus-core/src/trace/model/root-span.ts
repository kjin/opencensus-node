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

import * as uuid from 'uuid';

import {Logger} from '../../common/types';

import {BaseSpan, ChildSpan} from './base-span';
import * as types from './types';
import {Span, SpanData, SpanEventListener, SpanKind} from './types';


/**
 * Defines a root span.
 */
export class RootSpan extends BaseSpan implements types.RootSpan,
                                                  SpanEventListener {
  /** A list of child spans. */
  readonly spans: ChildSpan[] = [];

  /**
   * Constructs a new RootSpanImpl instance.
   * @param logger A logger.
   * @param options A trace options object to build the root span.
   */
  constructor(logger: Logger, options?: types.SpanOptions) {
    super(logger);
    this.data.traceId =
        options && options.spanContext && options.spanContext.traceId ?
        options.spanContext.traceId :
        (uuid.v4().split('-').join(''));
    this.data.name = options && options.name ? options.name : 'undefined';
    if (options && options.spanContext) {
      this.data.parentSpanId = options.spanContext.spanId || '';
    }
    this.data.kind = options && options.kind ? options.kind : null;
    // This flag distinguishes between root and child spans.
    this.data.sameProcessAsParentSpan = false;
  }

  /** Ends a rootspan instance. */
  end() {
    // Child spans MUST end before the the root ends.
    for (const span of this.spans) {
      if (!span.ended && span.started) {
        span.truncate();
      }
    }
    super.end();
  }

  onStartSpan(data: SpanData) {
    // Forward the event to this object's listeners.
    this.listeners.forEach(l => l.onStartSpan(data));
  }

  onEndSpan(data: SpanData) {
    // Forward the event to this object's listeners.
    this.listeners.forEach(l => l.onEndSpan(data));
  }

  /**
   * Starts a new child span in the root span.
   * @param name Span name.
   * @param kind Span kind.
   * @param parentSpanId Span parent ID.
   */
  startChildSpan(name: string, kind: SpanKind = SpanKind.CLIENT): Span|null {
    if (this.ended) {
      this.logger.warn(`Can't start child span on ended root span: ${this}`);
      return null;
    }
    if (!this.started) {
      this.logger.warn(
          `Can't start child span on un-started root span: ${this}`);
      return null;
    }
    const childSpan = new ChildSpan(this.logger, {
      traceId: this.data.traceId,
      parentSpanId: this.data.spanId,
      name,
      kind
    });
    // Listen on child span lifetime events.
    childSpan.registerSpanEventListener(this);
    childSpan.start();
    this.spans.push(childSpan);
    return childSpan;
  }
}
