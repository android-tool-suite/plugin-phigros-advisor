importScripts('rks.js','push-target-cache.js');
self.onmessage=async event=>{
  try{self.postMessage({cache:await phigrosPushCache.create(event.data.records,event.data.profileId)});}
  catch(error){self.postMessage({error:error.message||'推分计算失败'});}
};
