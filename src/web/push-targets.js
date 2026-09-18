(() => {
  function compute(records,profileId){
    return new Promise((resolve,reject)=>{
      const worker=new Worker('push-target-worker.js');
      const timer=setTimeout(()=>finish(Error('推分计算超时，请刷新重试')),60000);
      const finish=(error,cache)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(cache);};
      worker.onmessage=event=>event.data.error?finish(Error(event.data.error)):finish(null,event.data.cache);
      worker.onerror=()=>finish(Error('无法启动推分计算，请刷新重试'));
      worker.onmessageerror=()=>finish(Error('无法读取推分计算结果'));
      try{worker.postMessage({records,profileId});}catch(error){finish(error);}
    });
  }
  globalThis.phigrosPushTargets=phigrosPushCache.service({
    read:async id=>{const bytes=await ats.readBlob(id,8*1024*1024);return bytes?JSON.parse(new TextDecoder().decode(bytes)):null;},
    write:(id,cache)=>ats.writeBlob(id,new TextEncoder().encode(JSON.stringify(cache))),
    compute,
  });
})();
