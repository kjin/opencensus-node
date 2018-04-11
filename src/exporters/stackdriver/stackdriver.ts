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

import * as uuidv4 from 'uuid/v4';

import { debug } from '../../internal/util'
import { StackdriverOptions } from './options'
import { Exporter } from '../exporter'
import { google } from 'googleapis'
import { JWT } from 'google-auth-library'
import { RootSpan } from '../../trace/model/rootspan'
import { Buffer } from '../buffer'

const cloudTrace = google.cloudtrace('v1');

export class Stackdriver implements Exporter {
    projectId: string;

    constructor(options: StackdriverOptions) {
        this.projectId = options.projectId;
    }

    public publish(rootSpans: RootSpan[]) {
        let stackdriverTraces = [];
        rootSpans.forEach(trace => {
            stackdriverTraces.push(this.translateTrace(trace));
        })
        this.authorize(this.sendTrace, stackdriverTraces);
    }

    private translateTrace(root: RootSpan) {
        // Builds span data
        let spanList = []
        root.spans.forEach(span => {
            spanList.push(this.translateSpan(span));
        });

        // Builds root span data
        spanList.push(this.translateSpan(root));

        return {
            "projectId": this.projectId,
            "traceId": root.traceId,
            "spans": spanList
        }
    }

    private translateSpan(span) {
        return {
            "name": span.name,
            "kind": "SPAN_KIND_UNSPECIFIED",
            "spanId": span.id,
            "startTime": span.startTime,
            "endTime": span.endTime
        }
    }

    private sendTrace(projectId, authClient, stackdriverTraces) {
        let request = {
            projectId: projectId,
            resource: {
                traces: stackdriverTraces
            },
            auth: authClient
        }
        cloudTrace.projects.patchTraces(request, function (err) {
            if (err) {
                debug(err);
                return;
            } else {
                debug('\nSENT TRACE:\n', request.resource);
            }
        })
    }

    private authorize(callback, stackdriverTraces) {
        google.auth.getApplicationDefault(function (err, authClient: JWT, projectId) {
            if (err) {
                console.error('authentication failed: ', err);
                return;
            }
            if (authClient.createScopedRequired && authClient.createScopedRequired()) {
                var scopes = ['https://www.googleapis.com/auth/cloud-platform'];
                authClient = authClient.createScoped(scopes);
            }
            callback(projectId, authClient, stackdriverTraces);
        });
    }
}