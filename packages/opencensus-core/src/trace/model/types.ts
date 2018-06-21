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

import * as loggerTypes from '../../common/types';
import * as configTypes from '../config/types';
import {Propagation} from '../propagation/types';
import * as samplerTypes from '../sampler/types';

// A convenience type for functions that take any number of arguments and
// return a value.
// tslint:disable:no-any
export type Func<T> = (...args: any[]) => T;

/** Maps a label to a string, number or boolean. */
export interface Attributes { [attributeKey: string]: string|number|boolean; }

/** A text annotation with a set of attributes. */
export interface Annotation {
  /** A user-supplied message describing the event. */
  description: string;
  /** A timestamp that maks the event. */
  timestamp: number;
  /** A set of attributes on the annotation. */
  attributes: Attributes;
}

/** An event describing a message sent/received between Spans. */
export interface MessageEvent {
  /** Indicates whether the message was sent or received. */
  type: string;
  /** An identifier for the MessageEvent's message. */
  id: string;
}

/**
 * A pointer from the current span to another span in the same trace or in a
 * different trace.
 */
export interface Link {
  /** The trace ID for a trace within a project. */
  traceId: string;
  /** The span ID for a span within a trace. */
  spanId: string;
  /** The relationship of the current span relative to the linked. */
  type: string;
  /** A set of attributes on the link. */
  attributes: Attributes;
}

/** Defines the trace options */
export interface SpanOptions {
  /** Root span name */
  name: string;
  /** Trace context */
  spanContext?: SpanContext;
  /** Span kind */
  kind?: SpanKind;
}

/** Defines the span context */
export interface SpanContext {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Options */
  options?: number;
}

/**
 * An interface that represents actions that should fire when a span starts or
 * ends.
 */
export interface SpanEventListener {
  /**
   * Called when a span starts.
   * @param span The span that just started.
   */
  onStartSpan(span: SpanData): void;
  /**
   * Called when a span ends.
   * @param span The span that just ended.
   */
  onEndSpan(span: SpanData): void;
}

/**
 * An interface that represents an object that can emit events when a span
 * starts or ends.
 */
export interface SpanEventEmitter {
  registerSpanEventListener(listener: SpanEventListener): void;
  unregisterSpanEventListener(listener: SpanEventListener): void;
}

/**
 * An interface that represents the error status of a span.
 */
export interface Status {
  code: number;
  message: string;
}

/**
 * An enumeration of the different types of spans. Can be used to specify
 * additional relationships between spans in addition to a parent/child
 * relationship.
 */
export enum SpanKind {
  SPAN_KIND_UNSPECIFIED = 0,
  SERVER = 1,
  CLIENT = 2
}

/**
 * An interface describing the data model for a span. A span represents a
 * single operation within a trace.
 */
export interface SpanData {
  /**
   * A unique 16-byte identifier for a trace. All spans from the same trace
   * share the same trace ID.
   */
  traceId: string;
  /**
   * A unique 8-byte identifier for a span within a trace, assigned when the
   * span is created.
   */
  spanId: string;
  /**
   * The span ID of this span's parent span. If this is a root span, then this
   * field must be an empty string.
   */
  parentSpanId: string;
  /**
   * A description of the span's operation.
   */
  name: string;
  /**
   * Distinguishes between spans generated in a particular context.
   */
  kind: SpanKind;
  /**
   * The start time of the span.
   */
  startTime: number;
  /**
   * The end time of the span.
   */
  endTime: number;
  /**
   * A set of attributes on the span.
   */
  attributes: Attributes;
  /**
   * A stack trace captured at the start of the span.
   */
  stackTrace: {};  // TODO(kjin)
  /**
   * The included time events.
   */
  timeEvents: Array<Annotation|MessageEvent>;
  /**
   * The included links.
   */
  links: Link[];
  /**
   * An optional final status for this span.
   */
  status?: Status;
  /**
   * A flag that identifies when a trace crosses a process boundary. True when
   * the parent span belongs to the same process as the current span.
   */
  sameProcessAsParentSpan?: boolean;
}

/**
 * An interface that represents a span. Consumers of this interface can
 * manipulate the span and get the span context.
 */
export interface Span extends SpanEventEmitter {
  /**
   * The raw span data.
   */
  readonly data: Readonly<SpanData>;

  /** Gives the TraceContext of the span. */
  getSpanContext(): SpanContext;

  /**
   * Adds an atribute to the span.
   * @param key Describes the value added.
   * @param value The result of an operation.
   */
  addAttribute(key: string, value: string): void;

  /**
   * Adds an annotation to the span.
   * @param description Describes the event.
   * @param timestamp A timestamp that maks the event.
   * @param attributes A set of attributes on the annotation.
   */
  addAnnotation(
      description: string, timestamp: number, attributes?: Attributes): void;

  /**
   * Adds a link to the span.
   * @param traceId The trace ID for a trace within a project.
   * @param spanId The span ID for a span within a trace.
   * @param type The relationship of the current span relative to the linked.
   * @param attributes A set of attributes on the link.
   */
  addLink(
      traceId: string, spanId: string, type: string,
      attributes?: Attributes): void;

  /**
   * Adds a message event to the span.
   * @param type The type of message event.
   * @param id An identifier for the message event.
   */
  addMessageEvent(type: string, id: string): void;

  /**
   * Sets the optional status code and message.
   * @param code The status code.
   * @param message The status message.
   */
  setStatus(code: number, message?: string): void;

  /** Starts a span. */
  start(): void;

  /** Ends a span. */
  end(): void;

  /** Forces a span to end. */
  truncate(): void;
}

/** Interface for RootSpan */
export interface RootSpan extends Span {
  /** Starts a new Span instance in the RootSpan instance */
  startChildSpan(name: string, kind?: SpanKind): Span;
}

/** Interface for Tracer */
export interface Tracer extends SpanEventEmitter, SpanEventListener {
  /** Get and set the currentRootSpan to tracer instance */
  currentRootSpan: RootSpan;

  /** A sampler that will decide if the span will be sampled or not */
  sampler: samplerTypes.Sampler;

  /** A configuration for starting the tracer */
  logger: loggerTypes.Logger;

  /** A propagation instance */
  readonly propagation: Propagation;

  /** Get the eventListeners from tracer instance */
  readonly eventListeners: SpanEventListener[];

  /** Get the active status from tracer instance */
  readonly active: boolean;

  /**
   * Start a tracer instance
   * @param config Configuration for tracer instace
   * @returns A tracer instance started
   */
  start(config: configTypes.TracerConfig): Tracer;

  /** Stop the tracer instance */
  stop(): Tracer;

  /**
   * Start a new RootSpan to currentRootSpan
   * @param options Options for tracer instance
   * @param fn Callback function
   * @returns The callback return
   */
  startRootSpan<T>(options: SpanOptions, fn: (root: RootSpan) => T): T;

  /** Clear the currentRootSpan from tracer instance */
  clearCurrentTrace(): void;

  /**
   * Start a new Span instance to the currentRootSpan
   * @param name Span name
   * @param type Span type
   * @returns The new Span instance started
   */
  startChildSpan(name: string, type?: SpanKind): Span;

  /**
   * Binds the trace context to the given function.
   * This is necessary in order to create child spans correctly in functions
   * that are called asynchronously (for example, in a network response
   * handler).
   * @param fn A function to which to bind the trace context.
   */
  wrap<T>(fn: Func<T>): Func<T>;

  /**
   * Binds the trace context to the given event emitter.
   * This is necessary in order to create child spans correctly in event
   * handlers.
   * @param emitter An event emitter whose handlers should have
   * the trace context binded to them.
   */
  wrapEmitter(emitter: NodeJS.EventEmitter): void;
}
