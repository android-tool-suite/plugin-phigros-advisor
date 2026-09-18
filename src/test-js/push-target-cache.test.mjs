import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Worker} from 'node:worker_threads';
globalThis.window=globalThis;
for(const file of ['rks','zip','push-target-cache'])(0,eval)(readFileSync(new URL(`../web/${file}.js`,import.meta.url),'utf8'));
const records=Array.from({length:32},(_,i)=>({id:`fixture-${i}`,level:'IN',accuracy:98,constant:16.5-i/100,score:980000,fc:false}));
const profile='fixture-profile',clone=value=>structuredClone(value);

test('sync cache round-trips inside the saved analysis and is reused without computing',async()=>{
  const cache=await phigrosPushCache.create(records,profile);
  const zip=phigrosZip.write(new Map([['saves/save-fixture.json',new TextEncoder().encode(JSON.stringify({records,pushTargetCache:cache}))]]));
  const saved=JSON.parse(new TextDecoder().decode((await phigrosZip.read(zip)).get('saves/save-fixture.json')));
  const service=phigrosPushCache.service({read:()=>assert.fail('embedded cache should avoid storage'),write:()=>assert.fail('embedded cache should avoid writes'),compute:()=>assert.fail('embedded cache should avoid computation')});
  const result=await service.get(saved.records,profile,saved.pushTargetCache);
  assert.equal(result.source,'save');assert.deepEqual(result.cache.targets,phigrosRks.pushTargets(records));
});

test('account, source changes, algorithm changes and damaged values invalidate the cache',async()=>{
  const cache=await phigrosPushCache.create(records,profile),key=await phigrosPushCache.fingerprint(records,profile);
  assert.equal(await phigrosPushCache.valid(cache,records,profile,key),true);
  for(const field of ['score','accuracy','constant','id','level']){
    const next=clone(records);next[0][field]=typeof next[0][field]==='number'?next[0][field]+.01:next[0][field]+'x';
    assert.equal(await phigrosPushCache.valid(cache,next,profile,await phigrosPushCache.fingerprint(next,profile)),false,field);
  }
  assert.equal(await phigrosPushCache.valid(cache,records,'other-profile',key),false);
  for(const damage of [c=>c.algorithm='old',c=>c.version=0,c=>delete c.targets[Object.keys(c.targets)[0]],c=>c.targets[Object.keys(c.targets)[0]].resultingRks+=.1]){
    const damaged=clone(cache);damage(damaged);assert.equal(await phigrosPushCache.valid(damaged,records,profile,key),false);
  }
});

test('legacy data computes once, persists, and a fresh service reuses it',async()=>{
  const disk=new Map();let computations=0;
  const options={read:async id=>disk.get(id),write:async(id,value)=>disk.set(id,clone(value)),compute:async(r,p)=>{computations++;return phigrosPushCache.create(r,p);}};
  assert.equal((await phigrosPushCache.service(options).get(records,profile)).source,'computed');
  assert.equal((await phigrosPushCache.service(options).get(records,profile)).source,'cache');
  assert.equal(computations,1);
  const restored=clone(records);restored[0].accuracy=99;
  assert.equal((await phigrosPushCache.service(options).get(restored,profile)).source,'computed');
  assert.equal(computations,2);
});

test('older asynchronous results cannot overwrite the latest account cache',async()=>{
  const pending=[],writes=[];
  const service=phigrosPushCache.service({read:async()=>null,write:async(_,value)=>writes.push(value),compute:(r,p)=>new Promise(resolve=>pending.push({r,p,resolve}))});
  const old=service.get(records,profile);
  while(pending.length<1)await new Promise(r=>setTimeout(r,1));
  const next=clone(records);next[0].accuracy=99;
  const current=service.get(next,profile);
  while(pending.length<2)await new Promise(r=>setTimeout(r,1));
  pending[1].resolve(await phigrosPushCache.create(next,profile));await current;
  pending[0].resolve(await phigrosPushCache.create(records,profile));await old;
  assert.equal(writes.length,1);assert.equal(writes[0].fingerprint,await phigrosPushCache.fingerprint(next,profile));
});

test('cache corruption is rebuilt; write failure is reported; solver failure remains a failure',async()=>{
  const service=phigrosPushCache.service({read:async()=>{throw Error('invalid cache');},write:async()=>{throw Error('disk full');},compute:phigrosPushCache.create});
  const result=await service.get(records,profile);
  assert.equal(result.cacheError,'disk full');assert.deepEqual(result.cache.targets,phigrosRks.pushTargets(records));
  await assert.rejects(phigrosPushCache.service({read:async()=>null,write:async()=>{},compute:async()=>{throw Error('solver failed');}}).get(records,profile),/solver failed/);
});

test('the shipped Worker computes the cache outside the caller thread',async()=>{
  const workerSource=readFileSync(new URL('../web/push-target-worker.js',import.meta.url),'utf8');
  const webRoot=new URL('../web/',import.meta.url).href;
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');const {readFileSync}=require('node:fs');globalThis.self=globalThis;globalThis.importScripts=(...names)=>names.forEach(name=>(0,eval)(readFileSync(new URL(name,${JSON.stringify(webRoot)}),'utf8')));self.postMessage=value=>parentPort.postMessage(value);${workerSource}\nparentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
  try{
    const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage({records,profileId:profile});});
    assert.equal(result.error,undefined);assert.deepEqual(result.cache.targets,phigrosRks.pushTargets(records));
    assert.equal(await phigrosPushCache.valid(result.cache,records,profile,await phigrosPushCache.fingerprint(records,profile)),true);
  }finally{await worker.terminate();}
});
