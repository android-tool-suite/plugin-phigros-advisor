import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function application(failWrite=false,pendingProfile='fixture'){
  const elements=new Map(),writes=[],calls=[];
  const element=()=>({dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},replaceChildren(){},querySelector:()=>null,querySelectorAll:()=>[],closest:()=>null});
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const context=vm.createContext({TextEncoder,TextDecoder,Uint8Array,DataView,ArrayBuffer,crypto,console,setTimeout,clearTimeout,
    document:{getElementById:get,createElement:element,querySelector:()=>null,querySelectorAll:()=>[],head:element(),documentElement:element()},
    MutationObserver:class{observe(){}},getComputedStyle:()=>({colorScheme:'light'}),setInterval:()=>0,
    createFeedback:()=>()=>{},createTabPager:()=>({root:()=>element(),syncTabs(){},refresh(){},initialize:()=>{}}),
    ats:{ready:new Promise(()=>{}),
      readDataset:async id=>id==='profiles'?new TextEncoder().encode(JSON.stringify({profiles:[{id:'fixture',label:'Fixture'}],selectedProfile:'fixture'})):null,
      readBlob:async()=>{calls.push('readBlob');return new Uint8Array([1]);},
      request:async()=>assert.fail('No network request is expected in this fixture'),
      call:async(method,payload)=>{calls.push(method);return method==='storage.kv.get'&&payload.key==='pending-cloud-sync'?{found:true,value:{profileId:pendingProfile,blobId:'fixture.pending'}}:{};},
      writeDataset:async(id,bytes)=>{if(failWrite&&id==='analysis-data')throw Error('disk full');writes.push({id,bytes});}},
  });
  context.window=context;
  for(const file of ['loading-feedback','rks','zip','presentation','push-target-cache','initial-load'])vm.runInContext(readFileSync(new URL(`../web/${file}.js`,import.meta.url),'utf8'),context);
  context.phigrosPushTargets={prepare:(records,id)=>context.phigrosPushCache.create(records,id)};
  context.phigrosSaveParser={parse:async()=>save()};
  const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,'globalThis.testCommit={state,commitCloudSave,load,syncNow,consumePendingSync};})();'),context);
  context.testCommit.state.profiles.selectedProfile='fixture';
  return{...context.testCommit,writes,calls,zip:context.phigrosZip,cache:context.phigrosPushCache};
}
const save=()=>JSON.parse(readFileSync(new URL('../test/resources/legacy/save-cn-main.json',import.meta.url),'utf8'));

test('the actual sync commit writes records and validated push cache in one analysis archive',async()=>{
  const app=application(),next=save();await app.commitCloudSave(next,'fixture');
  assert.deepEqual(app.writes.map(w=>w.id),['analysis-data','profiles']);
  const files=await app.zip.read(app.writes[0].bytes),stored=JSON.parse(new TextDecoder().decode(files.get('saves/save-fixture.json')));
  assert.deepEqual(stored.records,next.records);
  assert.equal(await app.cache.valid(stored.pushTargetCache,stored.records,'fixture',await app.cache.fingerprint(stored.records,'fixture')),true);
  assert.equal(app.state.pushStatus,'ready');assert.ok(Object.keys(app.state.pushTargets).length);
  assert.equal(next.pushTargetCache,undefined,'caller input stays unchanged');
});

test('failed analysis commit preserves the old in-memory files and current save',async()=>{
  const app=application(true),originalFiles=app.state.analysisFiles,oldSave=save();app.state.save=oldSave;
  await assert.rejects(app.commitCloudSave(save(),'fixture'),/disk full/);
  assert.equal(app.state.analysisFiles,originalFiles);assert.equal(originalFiles.size,0);assert.equal(app.state.save,oldSave);assert.equal(app.writes.length,0);
});

test('opening a page never applies pending cloud data; the explicit sync action does',async()=>{
  const app=application();await app.load();
  assert.equal(app.writes.length,0);assert.equal(app.calls.length,0);
  await app.syncNow();assert.deepEqual(app.writes.map(w=>w.id),['analysis-data','profiles']);
  assert.ok(app.calls.includes('readBlob'));assert.ok(app.calls.includes('storage.kv.delete'));
});

test('manual sync does not consume a different account pending result',async()=>{
  const app=application(false,'other-account');await app.load();
  assert.equal(await app.consumePendingSync('fixture'),false);
  assert.equal(app.writes.length,0);assert.equal(app.calls.includes('readBlob'),false);assert.equal(app.calls.includes('storage.kv.delete'),false);
});
