import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
(0,eval)(readFileSync(new URL('../web/initial-load.js',import.meta.url),'utf8'));
test('summary is published before large datasets are requested, without omitting any dataset',async()=>{
  const events=[];
  await phigrosInitialLoad.loadLocal(async id=>{events.push(id);return id;},
    value=>{assert.equal(value,'profiles');events.push('visible');},
    value=>{assert.deepEqual(value,{tokens:'session-tokens',catalog:'song-catalog',analysis:'analysis-data'});events.push('details');});
  assert.deepEqual(events,['profiles','visible','session-tokens','song-catalog','analysis-data','details']);
});
test('detail failure propagates after publishing the available summary',async()=>{
  let visible=false,details=false;
  await assert.rejects(phigrosInitialLoad.loadLocal(async id=>{if(id==='analysis-data')throw Error('corrupt');return id;},
    ()=>{visible=true;},()=>{details=true;}),/corrupt/);
  assert.equal(visible,true);assert.equal(details,false);
});
