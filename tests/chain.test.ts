import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,sha,verifyBundle} from '../scripts/chain';
test('canonical serialization agrees with Python and detects tampering',async()=>{
 const a={z:1,a:{queued:2,label:'traffic'}};
 assert.equal(canonical(a),'{"a":{"label":"traffic","queued":2},"z":1}');
 const hash=sha(canonical(a)).toString('hex');assert(await verifyBundle(a,hash));
 assert(!await verifyBundle({...a,z:2},hash));assert.throws(()=>canonical({x:1.5}));
});
