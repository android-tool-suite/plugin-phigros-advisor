import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
(0,eval)(readFileSync(new URL('../web/initial-load.js',import.meta.url),'utf8'));

test('scores read no unrelated catalog or credentials; catalog loads on demand',async()=>{
  const reads=[],applied=[];
  const loader=phigrosInitialLoad.createLoader(async id=>{reads.push(id);return id;},(id,value)=>applied.push([id,value]));
  await loader.ensure('profiles');await loader.page('成绩');await loader.page('时间线');
  assert.deepEqual(reads,['profiles','analysis-data']);
  await loader.page('定数表');await loader.ensure('session-tokens');
  assert.deepEqual(reads,['profiles','analysis-data','song-catalog','session-tokens']);
  assert.deepEqual(applied,reads.map(id=>[id,id]));
});
test('concurrent pages share a read and corrupt details remain retryable',async()=>{
  let reads=0,fail=true;
  const loader=phigrosInitialLoad.createLoader(async()=>{reads++;return new Uint8Array([1]);},()=>{if(fail)throw Error('corrupt');});
  const results=await Promise.allSettled([loader.page('成绩'),loader.page('总览')]);
  assert.equal(reads,1);assert.ok(results.every(r=>r.status==='rejected'));assert.equal(loader.has('analysis-data'),false);
  fail=false;await loader.page('成绩');assert.equal(reads,2);assert.equal(loader.has('analysis-data'),true);
});
test('missing data is applied; refresh uses a new data generation',async()=>{
  const values=[];let reads=0;
  const create=()=>phigrosInitialLoad.createLoader(async()=>{reads++;return null;},(_,value)=>values.push(value));
  const first=create();await first.page('定数表');await first.page('定数表');await create().page('定数表');
  assert.equal(reads,2);assert.deepEqual(values,[null,null]);
});

test('only a rejected read is a failure; starting a retry clears that state',async()=>{
  let reject,resolve;
  const loader=phigrosInitialLoad.createLoader(()=>new Promise((ok,fail)=>{resolve=ok;reject=fail;}),()=>{});
  const first=loader.page('定数表');await Promise.resolve();
  assert.equal(loader.failed('song-catalog'),false);assert.equal(loader.has('song-catalog'),false);
  reject(Error('read failed'));await assert.rejects(first,/read failed/);
  assert.equal(loader.failed('song-catalog'),true);
  const retry=loader.page('定数表');assert.equal(loader.failed('song-catalog'),false);
  await Promise.resolve();resolve(null);await retry;
  assert.equal(loader.has('song-catalog'),true);assert.equal(loader.failed('song-catalog'),false);
});
