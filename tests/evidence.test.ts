import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evidenceHash,canonical} from '../src/evidence';

test('browser verifier validates every real demo bundle and rejects changed observations',async()=>{
 const run=JSON.parse(readFileSync('data/demo/latest.json','utf8'));
 for(const item of run.evidence){
  assert.equal(await evidenceHash(item.bundle),item.hash);
  const changed=structuredClone(item.bundle);changed.observation.approaches.A.queued++;
  assert.notEqual(await evidenceHash(changed),item.hash);
 }
 assert.throws(()=>canonical({value:0.5}));
 assert.throws(()=>canonical({value:Number.MAX_SAFE_INTEGER+1}));
});
