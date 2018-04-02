/**
 * Copyright 2018 Google Inc. All Rights Reserved.
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


import { Exporter } from "../exporter"
import { ZipkinOptions } from "./options"
import { RootSpan } from "../../trace/model/rootspan";
import * as http from "http"
import * as url from "url";
import { debug } from "../../internal/util"

export class Zipkin implements Exporter {
    private _zipkinUrl: url.UrlWithStringQuery;
    private _serviceName: string;

    constructor(options: ZipkinOptions) {
        this._zipkinUrl = url.parse(options.url);
        this._serviceName = options.serviceName;
    }
    
    writeTrace(root: RootSpan) {
        let spans = [];

        let spanRoot = {
            "traceId": root.traceId,
            "name": root.name,
            "id": root.id,
            "kind": "SERVER",
            "timestamp": (root.startTime.getTime()*1000).toFixed(),
            "duration": (root.duration*1000).toFixed(),
            "debug": true,
            "shared": true,
            "localEndpoint": {
                "serviceName": this._serviceName
            }
        }
        spans.push(spanRoot);

        for (let span of root.spans) {
            let spanObj = {
                "traceId": root.traceId,
                "parentId": root.id,
                "name": span.name,
                "id": span.id,
                "kind": "SERVER",
                "timestamp": (span.startTime.getTime()*1000).toFixed(),
                "duration": (span.duration*1000).toFixed(),
                "debug": true,
                "shared": true,
                "localEndpoint": {
                    "serviceName": this._serviceName
                }
            }
            spans.push(spanObj);
        }

        const options = {
            hostname: this._zipkinUrl.hostname,
            port: this._zipkinUrl.port,
            path: this._zipkinUrl.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        debug('Zipkins exporter options: %o', { hostname: options.hostname,  port: options.port, path: options.path});


        const req = http.request(options, (res) => {
            debug(`STATUS: ${res.statusCode}`);
            debug(`HEADERS: ${JSON.stringify(res.headers)}`);
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                debug(`BODY: ${chunk}`);
            });
            res.on('end', () => {
                debug('No more data in response.');
            });
        });

        req.on('error', (e) => {
            debug(`problem with request: ${e.message}`);
        });

        // write data to request body
        let spansJson: string[] = spans.map((span)=> JSON.stringify(span));
        spansJson.join("");
        let outputJson:string = `[${spansJson}]`
     //   debug('Zipkins span list Json: %s', outputJson);
        req.write(outputJson);
        req.end();
    }

    emit(rootSpans: RootSpan[]) {}

    public onEndSpan(rootSpan: RootSpan) {
        this.writeTrace(rootSpan);
    }

}