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

import * as assert from 'assert';
import * as mocha from 'mocha';

import {TracerImpl} from '../src/trace/model/tracer';
import {RootSpanImpl} from '../src/trace/model/rootspan';
import {SamplerImpl} from '../src/trace/config/sampler';
const tracer = new TracerImpl();


describe('Sampler', function () {
  const options = { name: "test" };
  const callback = (root) => root;

  describe('new Sampler()', function () {
    it('should create a Sampler instance', function () {
      const sampler = new SamplerImpl();
      assert.ok(sampler instanceof SamplerImpl);
    });
  });

  describe('new Sampler(traceId)', function () {
    it('should create a Sampler instance', function () {
      const root = new RootSpanImpl(tracer);
      const sampler = new SamplerImpl(root.traceId);
      assert.ok(sampler instanceof SamplerImpl);
    });
  });

  describe('always()', function () {
    it('should return a sampler instance', function () {
      const sampler = new SamplerImpl();
      const samplerAlways = sampler.always();
      assert.ok(samplerAlways instanceof SamplerImpl);
    });

  });

  describe('never()', function () {
    it('should return a sampler instance', function () {
      const sampler = new SamplerImpl();
      const tracerNever = sampler.never();
      assert.ok(tracerNever instanceof SamplerImpl);
    });

  });

  describe('probability()', function () {
    it('should return a sampler instance', function () {
      const PROBABILITY = 0.5;
      const sampler = new SamplerImpl();
      const tracerProbability = sampler.probability(PROBABILITY);
      assert.ok(tracerProbability instanceof SamplerImpl);
    });

  });

});