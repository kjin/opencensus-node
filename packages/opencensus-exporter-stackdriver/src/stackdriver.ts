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

import {Exporter, ExporterBuffer, ExporterConfig, Logger, RootSpan, Span, SpanContext, ConsoleLogger, SpanData} from '@opencensus/core';
import {auth, JWT} from 'google-auth-library';
import {google} from 'googleapis';

google.options({headers: {'x-opencensus-outgoing-request': 0x1}});
const cloudTrace = google.cloudtrace('v1');

type TranslatedTrace = {
  projectId: string,
  traceId: string,
  spans: TranslatedSpan[]
};

type TranslatedSpan = {
  name: string,
  kind: string,
  spanId: string,
  startTime: Date,
  endTime: Date
};


/**
 * Options for stackdriver configuration
 */
export interface StackdriverExporterOptions extends ExporterConfig {
  /**
   * projectId project id defined to stackdriver
   */
  projectId: string;
}

interface TracesWithCredentials {
  projectId: string;
  resource: {traces: {}};
  auth: JWT;
}

/** Format and sends span information to Stackdriver */
export class StackdriverTraceExporter implements Exporter {
  projectId: string;
  exporterBuffer: ExporterBuffer;
  logger: Logger;
  // TODO: Remove this field. It is being used for testing.
  failBuffer: SpanData[];

  constructor(options: StackdriverExporterOptions) {
    this.projectId = options.projectId;
    this.logger = options.logger || new ConsoleLogger();
    this.exporterBuffer = new ExporterBuffer(this, options);
  }

  /**
   * Is called whenever a span is ended.
   * @param span the ended span
   */
  onEndSpan(span: SpanData) {
    this.exporterBuffer.addToBuffer(span);
  }

  /** Not used for this exporter */
  onStartSpan() {}

  /**
   * Publishes a list of root spans to Stackdriver.
   * @param spans
   */
  publish(spans: SpanData[]) {
    const stackdriverTraces = this.translateSpans(spans);

    return this.authorize(stackdriverTraces)
        .then((traces: TracesWithCredentials) => {
          return this.sendTrace(traces);
        }).catch(err => {
          this.failBuffer.push(...spans);
          throw err;
        });
  }

  /**
   * Translates root span data to Stackdriver's trace format.
   * @param root
   */
  private translateSpans(spans: SpanData[]): TranslatedTrace[] {
    // Extract the list of unique trace IDs into traceIds.
    const traceIds = spans.reduce((knownIds, span) => {
      if (knownIds.indexOf(span.traceId) === -1) {
        knownIds.push(span.traceId);
      }
      return knownIds;
    }, []);
    return traceIds.map(traceId => {
      // Get all spans with this trace ID
      const matchingSpans = spans.filter(span => span.traceId === traceId);
      return {
        projectId: this.projectId,
        traceId: traceId,
        spans: matchingSpans.map(span => this.translateSpan(span))
      };
    })
  }

  /**
   * Translates span data to Stackdriver's span format.
   * @param span
   */
  private translateSpan(span: SpanData): TranslatedSpan {
    return {
      name: span.name,
      kind: 'SPAN_KIND_UNSPECIFIED',
      spanId: span.spanId,
      startTime: new Date(span.startTime),
      endTime: new Date(span.endTime)
    };
  }

  /**
   * Sends traces in the Stackdriver format to the service.
   * @param traces
   */
  private sendTrace(traces: TracesWithCredentials): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudTrace.projects.patchTraces(traces, (err: Error) => {
        if (err) {
          err.message = `sendTrace error: ${err.message}`;
          this.logger.error(err.message);
          reject(err);
        } else {
          const successMsg = 'sendTrace sucessfully';
          this.logger.debug(successMsg);
          resolve(successMsg);
        }
      });
    });
  }

  /**
   * Gets the Google Application Credentials from the environment variables,
   * authenticates the client and calls a method to send the traces data.
   * @param stackdriverTraces
   */
  private authorize(stackdriverTraces: TranslatedTrace[]) {
    return auth.getApplicationDefault()
        .then((client) => {
          let authClient = client.credential as JWT;

          if (authClient.createScopedRequired &&
              authClient.createScopedRequired()) {
            const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
            authClient = authClient.createScoped(scopes);
          }

          const traces: TracesWithCredentials = {
            projectId: client.projectId,
            resource: {traces: stackdriverTraces},
            auth: authClient
          };
          return traces;
        })
        .catch((err) => {
          err.message = `authorize error: ${err.message}`;
          this.logger.error(err.message);
          throw (err);
        });
  }
}