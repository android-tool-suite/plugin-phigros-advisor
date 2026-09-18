// Derived values never replace the source records. Keep this module usable in a Worker.
(() => {
  // Bump algorithm when RKS equations or push-threshold policy changes.
  const version=1,algorithm='rks-p3-b27-push-1';
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
  const fingerprint=(records,profileId)=>hash([algorithm,profileId,records.map(r=>[r.id,r.level,r.accuracy,r.constant,r.score])]);
  async function create(records,profileId){
    const targets=phigrosRks.pushTargets(records),key=await fingerprint(records,profileId);
    return {version,algorithm,profileId,fingerprint:key,targets,checksum:await hash(targets)};
  }
  async function valid(cache,records,profileId,key){
    if(!cache||cache.version!==version||cache.algorithm!==algorithm||cache.profileId!==profileId||cache.fingerprint!==key||!cache.targets||typeof cache.targets!=='object'||Array.isArray(cache.targets))return false;
    const expected=new Set(phigrosRks.calculate(records).sorted.map(r=>r.identity));
    if(Object.keys(cache.targets).length!==expected.size)return false;
    for(const id of expected){const target=cache.targets[id];if(!Object.prototype.hasOwnProperty.call(cache.targets,id)||!target||!Number.isFinite(target.resultingRks)||target.resultingRks<0||(target.targetAccuracy!==null&&(!Number.isFinite(target.targetAccuracy)||target.targetAccuracy<0||target.targetAccuracy>100)))return false;}
    return cache.checksum===await hash(cache.targets);
  }
  function service({read,write,compute}){
    const pending=new Map(),latest=new Map(),writes=new Map();
    async function prepare(records,profileId){
      const request=Symbol();latest.set(profileId,request);const key=await fingerprint(records,profileId);
      const workKey=profileId+':'+key;
      if(!pending.has(workKey))pending.set(workKey,compute(records,profileId).then(async cache=>{
        if(!await valid(cache,records,profileId,key))throw Error('推分计算结果校验失败');return cache;
      }).finally(()=>pending.delete(workKey)));
      return pending.get(workKey);
    }
    async function get(records,profileId,embedded){
      const request=Symbol();latest.set(profileId,request);const key=await fingerprint(records,profileId);
      if(await valid(embedded,records,profileId,key))return {cache:embedded,source:'save'};
      const blobId='phigros.push.'+await hash(profileId);
      let cached;try{cached=await read(blobId);}catch{/* A derived cache can be rebuilt from the validated source. */}
      if(await valid(cached,records,profileId,key))return {cache:cached,source:'cache'};
      // Do not let an older asynchronous read become the latest request again.
      const workKey=profileId+':'+key;
      if(!pending.has(workKey))pending.set(workKey,compute(records,profileId).then(async cache=>{
        if(!await valid(cache,records,profileId,key))throw Error('推分计算结果校验失败');return cache;
      }).finally(()=>pending.delete(workKey)));
      const cache=await pending.get(workKey);
      const save=(writes.get(profileId)||Promise.resolve()).catch(()=>{}).then(async()=>{
        if(latest.get(profileId)===request)await write(blobId,cache);
      });
      writes.set(profileId,save);
      try{await save;return {cache,source:'computed'};}
      catch(error){return {cache,source:'computed',cacheError:error.message||'缓存保存失败'};}
      finally{if(writes.get(profileId)===save)writes.delete(profileId);}
    }
    return {get,prepare};
  }
  globalThis.phigrosPushCache={version,algorithm,fingerprint,create,valid,service};
})();
