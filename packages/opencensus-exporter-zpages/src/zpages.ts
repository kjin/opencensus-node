/**
 * Copyright 2018 OpenCensus Authors.
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

import {Exporter, ExporterConfig, Span, SpanData, ConsoleLogger} from '@opencensus/core';
import {Logger} from '@opencensus/core';
import * as express from 'express';
import * as http from 'http';
import {createRoutes} from './zpages-frontend/routes';

/** Interface to Zpages options */
export interface ZpagesExporterOptions extends ExporterConfig {
  /** Port number to Zpages server */
  port: number;
  /** Predefined span names to register on trace list */
  spanNames: string[];
  /** Define if the Zpages server will start with new instance */
  startServer: boolean;
}

/** Class to ZpagesExporter */
export class ZpagesExporter implements Exporter {
  /** ZpagesExporter default options */
  static readonly defaultOptions = {port: 8080, startServer: true};

  private app: express.Application;
  private server: http.Server;
  private port: number;
  private traces: Map<string, SpanData[]> = new Map();
  private logger: Logger;

  constructor(options: ZpagesExporterOptions) {
    /** create express app */
    this.app = express();
    this.port = options.port || ZpagesExporter.defaultOptions.port;
    this.logger = options.logger || new ConsoleLogger();
    const startServer = options.startServer != null ?
        options.startServer :
        ZpagesExporter.defaultOptions.startServer;

    /** register predefined span names, if any */
    if (options.spanNames) {
      this.registerSpanNames(options.spanNames);
    }

    /** defining routes */
    this.app.use(createRoutes(this.traces));

    /** start the server if the startServer option is true */
    if (startServer) {
      this.startServer();
    }
  }

  /**
   * Is called whenever a span is started.
   * @param span the started span
   */
  onStartSpan(span: SpanData) {
    this.sendTrace(span);
  }

  /**
   * Is called whenever a span is ended.
   * @param span the ended span
   */
  onEndSpan(span: SpanData) {
    this.sendTrace(span);
  }

  /**
   * Send a trace to traces array
   * @param span the rootSpan to be sent to the array list
   */
  private sendTrace(span: SpanData) {
    this.pushSpan(span);
    this.logger.debug('Z-PAGES: trace added');
  }

  /**
   * Push a span to the array list
   * @param span the span to be push to the array list
   */
  private pushSpan(span: SpanData): void {
    if (this.traces.has(span.name)) {
      const spans = this.traces.get(span.name)!;
      // if a trace already in list, just update
      for (let i = 0; i < spans.length; i++) {
        if (spans[i].spanId === span.spanId) {
          spans[i] = span;
          return;
        }
      }
      spans.push(span);
    } else {
      this.traces.set(span.name, [span]);
    }
  }

  /**
   * Register a span names array in the Zpages Exporter
   * @param spanNames
   */
  private registerSpanNames(spanNames: string[]) {
    for (const name of spanNames) {
      const span = {name} as SpanData;
      this.traces.set(name, [span]);
    }
  }

  /**
   * Not used in this context.
   * @param spans
   */
  publish(spans: SpanData[]) {
    return Promise.resolve();
  }

  /**
   * Start the Zpages HTTP Server.
   * @param callback A function that will be called when the server has started.
   */
  startServer(callback?: () => void) {
    const self = this;
    this.server = this.app.listen(self.port, () => {
      self.logger.debug('Zpages Server was started on port ' + self.port);
      if (callback) {
        callback();
      }
    });
  }

  /**
   * Stop the Zpages HTTP Server.
   * @param callback A function that will be called when the server is stopped.
   */
  stopServer(callback?: () => void) {
    this.server.close(callback);
  }
}
