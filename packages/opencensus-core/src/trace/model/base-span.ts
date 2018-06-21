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
import {Logger} from '../../common/types';
import {randomSpanId} from '../../internal/util';

import {Attributes, Span, SpanContext, SpanData, SpanEventEmitter, SpanEventListener, SpanKind} from './types';

const UNINITIALIZED_DATE = 0;

function createSpanData(base: Partial<SpanData> = {}): SpanData {
  return Object.assign(
      {
        traceId: '',
        spanId: '',
        parentSpanId: '',
        name: '',
        kind: SpanKind.SPAN_KIND_UNSPECIFIED,
        startTime: UNINITIALIZED_DATE,
        endTime: UNINITIALIZED_DATE,
        attributes: {},
        stackTrace: {},
        timeEvents: [],
        links: []
      },
      base);
}


/**
 * A class the represents the base logic for root and child spans.
 */
export abstract class BaseSpan implements Span {
  readonly data: SpanData;
  /** Indicates if this span was forced to end. TODO(kjin): Is this needed? */
  private truncated = false;
  /** An object to log information to */
  protected readonly logger: Logger;
  /** A list of objects interested in the lifetime of this span. */
  protected listeners: SpanEventListener[] = [];

  registerSpanEventListener(listener: SpanEventListener) {
    this.listeners.push(listener);
  }

  unregisterSpanEventListener(listener: SpanEventListener) {
    this.listeners = this.listeners.filter(l => l === listener);
  }

  /** Constructs a new SpanBase instance. */
  constructor(logger: Logger, spanData: Partial<SpanData> = {}) {
    this.logger = logger;
    this.data =
        createSpanData(Object.assign({spanId: randomSpanId()}, spanData));
  }

  /** Indicates if span was started. */
  get started(): boolean {
    return this.data.startTime !== UNINITIALIZED_DATE;
  }

  /** Indicates if span was ended. */
  get ended(): boolean {
    return this.data.endTime !== UNINITIALIZED_DATE;
  }

  /** Gives the TraceContext of the span. */
  getSpanContext(): SpanContext {
    return {
      traceId: this.data.traceId,
      spanId: this.data.spanId,
      options: 0x1  // always traced
    };
  }

  /**
   * Adds an atribute to the span.
   * @param key Describes the value added.
   * @param value The result of an operation.
   */
  addAttribute(key: string, value: string|number|boolean) {
    this.data.attributes[key] = value;
  }

  /**
   * Adds an annotation to the span.
   * @param description Describes the event.
   * @param timestamp A timestamp that maks the event.
   * @param attributes A set of attributes on the annotation.
   */
  addAnnotation(
      description: string, timestamp: number, attributes?: Attributes) {
    this.data.timeEvents.push({description, timestamp, attributes});
  }

  /**
   * Adds a link to the span.
   * @param traceId The trace ID for a trace within a project.
   * @param spanId The span ID for a span within a trace.
   * @param type The relationship of the current span relative to the linked.
   * @param attributes A set of attributes on the link.
   */
  addLink(
      traceId: string, spanId: string, type: string, attributes?: Attributes) {
    this.data.links.push({traceId, spanId, type, attributes});
  }

  /**
   * Adds a message event to the span.
   * @param type The type of message event.
   * @param id An identifier for the message event.
   */
  addMessageEvent(type: string, id: string) {
    this.data.timeEvents.push({type, id});
  }

  setStatus(code: number, message = '') {
    this.data.status = {code, message};
  }

  /** Starts the span. */
  start() {
    if (this.started) {
      this.logger.warn(
          `start() called on span that has already been started: ${this}`);
      return;
    }
    this.data.startTime = new Date().getTime();
    this.listeners.forEach(l => l.onStartSpan(this.data));
  }

  /** Ends the span. */
  end(): void {
    if (this.ended) {
      this.logger.warn(
          `end() called on span that has already been ended: ${this}`);
      return;
    }
    if (!this.started) {
      this.logger.warn(
          `end() called on span that hasn't been started yet: ${this}`);
      return;
    }
    this.data.endTime = new Date().getTime();
    this.listeners.forEach(l => l.onEndSpan(this.data));
    // Free the list of listeners, as it's no longer needed.
    this.listeners = [];
  }


  /** Forces the span to end. */
  truncate() {
    this.truncated = true;
    this.end();
    this.logger.debug(`Truncating ${this}`);
  }

  /**
   * Serialize this object into a string for logging purposes.
   */
  protected toString(): string {
    const serialized: Partial<SpanData> = {
      name: this.data.name,
      traceId: this.data.traceId,
      spanId: this.data.spanId,
      kind: this.data.kind
    };
    if (this.data.parentSpanId) {
      serialized.parentSpanId = this.data.parentSpanId;
    }
    return `${this.constructor.name} ${JSON.stringify(serialized)}`;
  }
}

export class ChildSpan extends BaseSpan {
  constructor(logger: Logger, spanData?: Partial<SpanData>) {
    super(logger, spanData);
    // This flag distinguishes between root and child spans.
    this.data.sameProcessAsParentSpan = true;
  }
}
