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

import * as loggerTypes from '../common/types';
import {SpanData} from '../trace/model/types';

import {ExporterBuffer} from './exporter-buffer';
import * as types from './types';

/** Do not send span data */
export class NoopExporter implements types.Exporter {
  logger: loggerTypes.Logger;
  onStartSpan(span: SpanData) {}
  onEndSpan(span: SpanData) {}
  publish(spans: SpanData[]) {
    return Promise.resolve();
  }
}

/** Format and sends span data to the console. */
export class ConsoleExporter implements types.Exporter {
  /** Buffer object to store the spans. */
  private buffer: ExporterBuffer;
  private logger: loggerTypes.Logger;

  /**
   * Constructs a new ConsoleLogExporter instance.
   * @param config Exporter configuration object to create a console log
   * exporter.
   */
  constructor(config: types.ExporterConfig) {
    this.buffer = new ExporterBuffer(this, config);
    this.logger = config.logger;
  }

  onStartSpan(span: SpanData) {}

  /**
   * Event called when a span is ended.
   * @param span Ended span.
   */
  onEndSpan(span: SpanData) {
    this.buffer.addToBuffer(span);
  }

  /**
   * Sends the spans information to the console.
   * @param rootSpans
   */
  publish(spans: SpanData[]) {
    console.log(`${spans}`);
    return Promise.resolve();
  }
}
