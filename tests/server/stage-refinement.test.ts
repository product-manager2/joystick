import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refinedStages } from '../../src/live/stage-refinement.js';

const prior=[
  {name:'Research',goal:'Find evidence',target:1000,gateTarget:5,unit:'sources'},
  {name:'Build',goal:'Ship prototype',target:1,gateTarget:3,unit:'results'},
];

test('mission draft refinement preserves stage approval thresholds when omitted',()=>{
  const renamed=refinedStages(prior,[{name:'Research',goal:'Find evidence',target:1200,unit:'sources'},{name:'Make',goal:'Ship prototype',target:1,unit:'results'}]);
  assert.deepEqual(renamed.map(s=>s.gateTarget),[5,3]);
  const reordered=refinedStages(prior,[{name:'Build',goal:'Ship prototype',target:1,unit:'results'},{name:'Research',goal:'Find evidence',target:1000,unit:'sources'}]);
  assert.deepEqual(reordered.map(s=>s.gateTarget),[3,5]);
  const explicit=refinedStages(prior,[{name:'Research',goal:'Find evidence',target:1000,gateTarget:2,unit:'sources'},{name:'Build',goal:'Ship prototype',target:1,unit:'results'}]);
  assert.deepEqual(explicit.map(s=>s.gateTarget),[2,3]);
  const unrecognizable=refinedStages(prior,[{name:'New stage',goal:'New work',target:1,unit:'results'},{name:'Another',goal:'Other work',target:1,unit:'results'}]);
  assert.deepEqual(unrecognizable.map(s=>s.gateTarget),[1,1]);
});
