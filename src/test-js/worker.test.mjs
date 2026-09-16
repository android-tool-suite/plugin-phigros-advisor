import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

(0,eval)(readFileSync(new URL('../workers/phigros.js',import.meta.url),'utf8'));

const profile={formatVersion:1,selectedProfile:'fixture-profile',profiles:[{id:'fixture-profile',label:'Fixture',server:'CN'}]};
const profileBytes=new TextEncoder().encode(JSON.stringify(profile));
const fakeToken='A1B2C3D4E5F6G7H8I9J0K1L2M';
const body=value=>Buffer.from(JSON.stringify(value)).toString('base64');
let readDone=false,networkIndex=0,kvValue=null,written=[],networkBlobDeleted=false;
const ats={
  decodeBase64:value=>Uint8Array.from(Buffer.from(value,'base64')),
  decodeUtf8:value=>new TextDecoder().decode(value),
  async call(method,payload){
    if(method==='storage.dataset.openRead')return{found:true,handle:'dataset'};
    if(method==='storage.dataset.read'){if(readDone)return{bytes:'',eof:true};readDone=true;return{bytes:Buffer.from(profileBytes).toString('base64'),eof:true};}
    if(method==='storage.dataset.abort')return{aborted:true};
    if(method==='storage.secret.get')return{found:true,value:fakeToken};
    if(method==='network.request'){
      networkIndex++;
      if(networkIndex===1){assert.equal(payload.headers['X-LC-Session'],fakeToken);return{status:200,body:body({objectId:'player-object',nickname:'Fixture'})};}
      if(networkIndex===2){assert.match(payload.url,/\/gamesaves\?skip=/);assert.doesNotMatch(payload.url,/\/gamesaves\/\?/);return{status:200,body:body({results:[{modifiedAt:{iso:'2026-08-31T00:00:00.000Z'},gameFile:{url:'https://files.tapapis.cn/save.zip'}}]})};}
      return{status:200,body:null,bodyBlob:{id:'network.fixture-save',size:4}};
    }
    if(method==='storage.blob.openWrite')return{handle:'writer'};
    if(method==='storage.blob.openRead'){assert.equal(payload.id,'network.fixture-save');return{found:true,handle:'network-reader',size:4};}
    if(method==='storage.blob.read')return{bytes:Buffer.from([1,2,3,4]).toString('base64'),eof:true};
    if(method==='storage.blob.delete'){assert.equal(payload.id,'network.fixture-save');networkBlobDeleted=true;return{deleted:true};}
    if(method==='storage.blob.write'){written.push(...Buffer.from(payload.bytes,'base64'));return{written:written.length};}
    if(method==='storage.blob.close')return{closed:true};
    if(method==='storage.kv.set'){kvValue=payload.value;return{stored:true};}
    throw new Error(`Unexpected method: ${method}`);
  }
};

const output=await globalThis.atsWorkerMain({},ats);
assert.deepEqual(output,{status:'acquired',profileId:'fixture-profile',size:4});
assert.deepEqual(written,[1,2,3,4]);
assert.equal(networkBlobDeleted,true);
assert.equal(kvValue.profileId,'fixture-profile');
assert.equal(kvValue.blobId,'pending.cloud.fixture-profile');
assert.equal(JSON.stringify(output).includes(fakeToken),false);
assert.equal(JSON.stringify(kvValue).includes(fakeToken),false);
console.log('Phigros background acquisition fixture: OK');
