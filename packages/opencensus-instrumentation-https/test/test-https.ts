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

import {CoreTracer, RootSpan, SpanEventListener, SpanData, ConsoleLogger} from '@opencensus/core';
import * as assert from 'assert';
import * as fs from 'fs';
import * as https from 'https';
import * as nock from 'nock';

import {plugin} from '../src/';
import {HttpsPlugin} from '../src/';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function doNock(
    url: string, path: string, httpCode: number, respBody: string,
    times?: number) {
  const i = times || 1;
  nock(url).get(path).times(i).reply(httpCode, respBody);
}

type RequestFunction = typeof https.request|typeof https.get;

const httpRequest = {
  request: (options: {}|string) => {
    return httpRequest.make(options, https.request);
  },
  get: (options: {}|string) => {
    return httpRequest.make(options, https.get);
  },
  make: (options: {}|string, method: RequestFunction) => {
    return new Promise((resolve, reject) => {
      const req = method(options, resp => {
        let data = '';
        resp.on('data', chunk => {
          data += chunk;
        });
        resp.on('end', () => {
          resolve(data);
        });
        resp.on('error', err => {
          reject(err);
        });
      });
      req.end();
    });
  },
};

const VERSION = process.versions.node;

class SpanVerifier implements SpanEventListener {
  readonly endedRootSpans: SpanData[] = [];
  readonly endedChildSpans: SpanData[] = [];

  clear() {
    this.endedRootSpans.length = 0;
    this.endedChildSpans.length = 0;
  }

  onStartSpan(): void {}
  onEndSpan(span: SpanData) {
    if (span.sameProcessAsParentSpan) {
      this.endedChildSpans.push(span);
    } else {
      this.endedRootSpans.push(span);
    }
  }
}

const httpsOptions = {
  key: fs.readFileSync('./test/fixtures/key.pem'),
  cert: fs.readFileSync('./test/fixtures/cert.pem')
};

function assertSpanAttributes(
    span: SpanData, httpStatusCode: number, httpMethod: string, hostName: string,
    path: string, userAgent: string) {
  assert.strictEqual(
      span.status, HttpsPlugin.convertTraceStatus(httpStatusCode));
  assert.strictEqual(
      span.attributes[HttpsPlugin.ATTRIBUTE_HTTP_HOST], hostName);
  assert.strictEqual(
      span.attributes[HttpsPlugin.ATTRIBUTE_HTTP_METHOD], httpMethod);
  assert.strictEqual(span.attributes[HttpsPlugin.ATTRIBUTE_HTTP_PATH], path);
  assert.strictEqual(span.attributes[HttpsPlugin.ATTRIBUTE_HTTP_ROUTE], path);
  assert.strictEqual(
      span.attributes[HttpsPlugin.ATTRIBUTE_HTTP_USER_AGENT], userAgent);
  assert.strictEqual(
      span.attributes[HttpsPlugin.ATTRIBUTE_HTTP_STATUS_CODE],
      `${httpStatusCode}`);
}

describe('HttpsPlugin', () => {
  const hostName = 'fake.service.io';
  const urlHost = `https://${hostName}`;
  let serverPort = 3000;

  let server: https.Server;
  const log = new ConsoleLogger();
  const tracer = new CoreTracer();
  const spanVerifier = new SpanVerifier();
  tracer.start({samplingRate: 1, logger: log});

  it('should return a plugin', () => {
    assert.ok(plugin instanceof HttpsPlugin);
  });

  before(() => {
    plugin.enable(https, tracer, VERSION, null);
    tracer.registerSpanEventListener(spanVerifier);
    server = https.createServer(httpsOptions, (request, response) => {
      response.end('Test Server Response');
    });
    server.listen(serverPort);
    server.once('listening', () => {
      // to fix node 6 issue
      // disable-next-line to disable no-any check
      // tslint:disable-next-line
      serverPort = (server.address() as any).port;
    });
    nock.disableNetConnect();
  });

  beforeEach(() => {
    spanVerifier.clear();
    nock.cleanAll();
  });

  after(() => {
    server.close();
  });

  const methods = [httpRequest.get, httpRequest.request];

  describe('Instrumenting outgoing requests', () => {
    methods.map(requestMethod => {
      /** Should intercept outgoing requests */
      describe(`Testing https.${requestMethod.name}() method`, () => {
        it('should create a rootSpan for GET requests as a client',
           async () => {
             const testPath = '/outgoing/rootSpan/1';
             doNock(urlHost, testPath, 200, 'Ok');
             assert.strictEqual(spanVerifier.endedRootSpans.length, 0);
             await requestMethod(`${urlHost}${testPath}`).then((result) => {
               assert.strictEqual(result, 'Ok');
               assert.ok(
                   spanVerifier.endedRootSpans[0].name.indexOf(testPath) >=
                   0);
               assert.strictEqual(spanVerifier.endedRootSpans.length, 1);

               const span = spanVerifier.endedRootSpans[0];
               assertSpanAttributes(
                   span, 200, 'GET', hostName, testPath, undefined);
             });
           });

        const httpErrorCodes = [400, 401, 403, 404, 429, 501, 503, 504, 500];

        for (let i = 0; i < httpErrorCodes.length; i++) {
          it(`should test rootSpan for GET requests with http error ${
                 httpErrorCodes[i]}`,
             async () => {
               const testPath = '/outgoing/rootSpan/1';
               doNock(
                   urlHost, testPath, httpErrorCodes[i],
                   httpErrorCodes[i].toString());
               assert.strictEqual(spanVerifier.endedRootSpans.length, 0);
               await requestMethod(`${urlHost}${testPath}`).then((result) => {
                 assert.strictEqual(result, httpErrorCodes[i].toString());
                 assert.ok(
                     spanVerifier.endedRootSpans[0].name.indexOf(
                         testPath) >= 0);
                 assert.strictEqual(spanVerifier.endedRootSpans.length, 1);
                 const span = spanVerifier.endedRootSpans[0];
                 assertSpanAttributes(
                     span, httpErrorCodes[i], 'GET', hostName, testPath,
                     undefined);
               });
             });
        }


        it('should create a child span for GET requests', () => {
          const testPath = '/outgoing/rootSpan/childs/1';
          doNock(urlHost, testPath, 200, 'Ok');
          const options = {name: 'TestRootSpan'};
          return tracer.startRootSpan(options, async (root: RootSpan) => {
            await requestMethod(`${urlHost}${testPath}`).then((result) => {
              root.end();
              assert.strictEqual(spanVerifier.endedRootSpans.length, 1);
              assert.strictEqual(spanVerifier.endedChildSpans.length, 1);
              const rootSpanData = spanVerifier.endedRootSpans[0];
              const childSpanData = spanVerifier.endedChildSpans[0];
              assert.ok(rootSpanData.name.indexOf('TestRootSpan') >= 0);
              assert.ok(childSpanData.name.indexOf(testPath) >= 0);
              assert.strictEqual(childSpanData.traceId, rootSpanData.traceId);
              assertSpanAttributes(childSpanData, 200, 'GET', hostName, testPath, undefined);
            });
          });
        });

        for (let i = 0; i < httpErrorCodes.length; i++) {
          it(`should test a child spans for GET requests with http error ${
                 httpErrorCodes[i]}`,
             () => {
               const testPath = '/outgoing/rootSpan/childs/1';
               doNock(
                   urlHost, testPath, httpErrorCodes[i],
                   httpErrorCodes[i].toString());
               const options = {name: 'TestRootSpan'};
               return tracer.startRootSpan(options, async (root: RootSpan) => {
                 await requestMethod(`${urlHost}${testPath}`).then((result) => {
                  root.end();
                  assert.strictEqual(spanVerifier.endedRootSpans.length, 1);
                  assert.strictEqual(spanVerifier.endedChildSpans.length, 1);
                  const rootSpanData = spanVerifier.endedRootSpans[0];
                  const childSpanData = spanVerifier.endedChildSpans[0];
                  assert.ok(rootSpanData.name.indexOf('TestRootSpan') >= 0);
                  assert.ok(childSpanData.name.indexOf(testPath) >= 0);
                  assert.strictEqual(childSpanData.traceId, rootSpanData.traceId);
   
                  assertSpanAttributes(
                      childSpanData, httpErrorCodes[i], 'GET', hostName, testPath,
                      undefined);
                 });
               });
             });
        }

        it('should create multiple child spans for GET requests', () => {
          const testPath = '/outgoing/rootSpan/childs';
          const num = 5;
          doNock(urlHost, testPath, 200, 'Ok', num);
          const options = {name: 'TestRootSpan'};
          return tracer.startRootSpan(options, async (root: RootSpan) => {
            assert.ok(root.name.indexOf('TestRootSpan') >= 0);
            for (let i = 0; i < num; i++) {
              await requestMethod(`${urlHost}${testPath}`).then((result) => {
                assert.strictEqual(root.spans.length, i + 1);
                assert.ok(root.spans[i].name.indexOf(testPath) >= 0);
                assert.strictEqual(root.traceId, root.spans[i].traceId);
              });
            }
            assert.strictEqual(spanVerifier.endedSpans.length, 0);
            root.end();
            assert.strictEqual(spanVerifier.endedSpans.length, 1);
          });
        });

        it('should not trace requests with \'x-opencensus-outgoing-request\' header',
           async () => {
             const testPath = '/outgoing/do-not-trace';
             doNock(urlHost, testPath, 200, 'Ok');

             const options = {
               host: hostName,
               path: testPath,
               headers: {'x-opencensus-outgoing-request': 1}
             };

             assert.strictEqual(spanVerifier.endedSpans.length, 0);
             await requestMethod(options).then((result) => {
               assert.equal(result, 'Ok');
               assert.strictEqual(spanVerifier.endedSpans.length, 0);
             });
           });
      });
    });
  });


  /** Should intercept incoming requests */
  describe('Instrumenting incoming requests', () => {
    it('should create a root span for incoming requests', async () => {
      const testPath = '/incoming/rootSpan/';

      const options = {
        host: 'localhost',
        path: testPath,
        port: serverPort,
        headers: {'User-Agent': 'Android'}
      };
      nock.enableNetConnect();

      assert.strictEqual(spanVerifier.endedSpans.length, 0);

      await httpRequest.request(options).then((result) => {
        assert.ok(
            spanVerifier.endedSpans[0].name.indexOf(testPath) >= 0);
        assert.strictEqual(spanVerifier.endedSpans.length, 2);
        const span = spanVerifier.endedSpans[0];
        assertSpanAttributes(
            span, 200, 'GET', 'localhost', testPath, 'Android');
      });
    });
  });

  /** Should not intercept incoming and outgoing requests */
  describe('Removing instrumentation', () => {
    it('should not create a root span for incoming requests', async () => {
      plugin.disable();
      const testPath = '/incoming/unpatch/';

      const options = {host: 'localhost', path: testPath, port: serverPort};

      assert.strictEqual(spanVerifier.endedSpans.length, 0);
      await httpRequest.request(options).then((result) => {
        assert.strictEqual(spanVerifier.endedSpans.length, 0);
      });
    });
  });
});
