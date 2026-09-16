async function readDataset(ats, datasetId, maxBytes) {
  const opened = await ats.call('storage.dataset.openRead', {datasetId});
  if (!opened.found) return null;
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await ats.call('storage.dataset.read', {
        handle: opened.handle,
        offset: size,
        maxBytes: Math.min(131072, maxBytes - size)
      });
      const bytes = ats.decodeBase64(part.bytes);
      chunks.push(bytes);
      size += bytes.length;
      if (size > maxBytes) throw Object.assign(new Error('Dataset exceeds worker limit'), {code:'RESOURCE_LIMIT'});
      if (part.eof) break;
    }
  } finally {
    await ats.call('storage.dataset.abort', {handle: opened.handle}).catch(() => {});
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

async function summary(ats) {
  const raw = await readDataset(ats, 'profiles', 262144);
  if (!raw) return {title:'尚未添加账号', detail:'打开工具添加 SessionToken', value:'—', state:'empty'};
  const root = JSON.parse(ats.decodeUtf8(raw));
  const widget = root.widget || {};
  let value = Number.isFinite(Number(widget.rks)) ? Number(widget.rks).toFixed(2) : '—';
  if (value === '—' && widget.rksBits !== undefined && widget.rksBits !== null) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigUint64(0, BigInt(widget.rksBits), false);
    const decoded = view.getFloat64(0, false);
    if (Number.isFinite(decoded)) value = decoded.toFixed(2);
  }
  return {
    title: widget.player || 'Phigros Player',
    detail: Number(widget.count || 0) > 0 ? `${Number(widget.count)} 条成绩` : '等待同步云存档',
    value,
    state: value === '—' ? 'empty' : 'ready'
  };
}

async function readCapabilityBlob(ats, blobId, maxBytes) {
  const opened = await ats.call('storage.blob.openRead', {id:blobId});
  if (!opened.found) throw Object.assign(new Error('网络响应文件不存在'), {code:'NOT_FOUND'});
  const chunks=[];let offset=0;
  try {
    if(opened.size>maxBytes)throw Object.assign(new Error('网络响应超过大小限制'),{code:'RESOURCE_LIMIT'});
    while(true){const part=await ats.call('storage.blob.read',{handle:opened.handle,offset,maxBytes:131072});const bytes=ats.decodeBase64(part.bytes);chunks.push(bytes);offset+=bytes.length;if(part.eof)break;}
  } finally { await ats.call('storage.blob.close',{handle:opened.handle}).catch(()=>{}); }
  const output=new Uint8Array(offset);let cursor=0;for(const chunk of chunks){output.set(chunk,cursor);cursor+=chunk.length;}return output;
}

async function responseBytes(ats,response,maxBytes) {
  const blobId=response.bodyBlob?.id||response.blobId;
  try {
    const bytes=typeof response.body==='string'?ats.decodeBase64(response.body):blobId?await readCapabilityBlob(ats,blobId,maxBytes):new Uint8Array();
    if(bytes.length>maxBytes)throw Object.assign(new Error('网络响应超过大小限制'),{code:'RESOURCE_LIMIT'});
    return bytes;
  }finally{if(blobId)await ats.call('storage.blob.delete',{id:blobId}).catch(()=>{});}
}

async function responseJson(ats,response) {
  const raw=ats.decodeUtf8(await responseBytes(ats,response,2*1024*1024));
  let value={};try{value=raw?JSON.parse(raw):{};}catch(_){throw Object.assign(new Error(`服务器返回无法识别的数据（HTTP ${response.status}）`),{code:'INVALID_RESULT'});}
  if(response.status<200||response.status>=300)throw Object.assign(new Error(value.error||value.message||`HTTP ${response.status}`),{code:'NETWORK_ERROR',retryable:response.status>=500});
  return value;
}

async function writeBlob(ats,id,bytes){const opened=await ats.call('storage.blob.openWrite',{id});try{for(let offset=0;offset<bytes.length;offset+=131072)await ats.call('storage.blob.write',{handle:opened.handle,bytes:btoaBytes(bytes.subarray(offset,offset+131072))});return await ats.call('storage.blob.close',{handle:opened.handle});}catch(error){await ats.call('storage.blob.close',{handle:opened.handle}).catch(()=>{});throw error;}}
function btoaBytes(bytes){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=i+1<bytes.length?bytes[i+1]:0,c=i+2<bytes.length?bytes[i+2]:0,n=(a<<16)|(b<<8)|c;out+=chars[n>>>18&63]+chars[n>>>12&63]+(i+1<bytes.length?chars[n>>>6&63]:'=')+(i+2<bytes.length?chars[n&63]:'=');}return out;}

async function acquireCloudSave(ats,root){const profile=(root.profiles||[]).find(item=>item.id===root.selectedProfile);if(!profile)return{status:'skipped',reason:'no-selection'};const secret=await ats.call('storage.secret.get',{datasetId:'session-tokens',key:`token:${profile.id}`});if(!secret.found)return{status:'skipped',reason:'no-token'};const config=profile.server==='GLOBAL'?{appId:'kviehleldgxsagpozb',appKey:'tG9CTm0LDD736k9HMM9lBZrbeBGRmUkjSfNLDNib',base:'https://kviehlel.cloud.ap-sg.tapapis.com/1.1'}:{appId:'rAK3FfdieFob2Nn8Am',appKey:'Qr9AEqtuoSVS3zeD6iVbM4ZC0AtkJcQ89tywVyi0',base:'https://rak3ffdi.cloud.tds1.tapapis.cn/1.1'},headers={'X-LC-Id':config.appId,'X-LC-Key':config.appKey,'X-LC-Session':String(secret.value),'User-Agent':'LeanCloud-CSharp-SDK/1.0.3'};const player=await responseJson(ats,await ats.call('network.request',{url:`${config.base}/users/me`,method:'GET',headers}));if(!player.objectId)throw Object.assign(new Error('SessionToken 无法读取玩家信息'),{code:'UNAUTHORIZED'});const where=encodeURIComponent(JSON.stringify({user:{__type:'Pointer',className:'_User',objectId:player.objectId}})),saves=await responseJson(ats,await ats.call('network.request',{url:`${config.base}/gamesaves?skip=0&limit=100&where=${where}&include=cover,gameFile`,method:'GET',headers})),candidates=(saves.results||[]).filter(item=>item.gameFile&&item.gameFile.url);if(!candidates.length)throw Object.assign(new Error('没有找到可下载的云存档'),{code:'NOT_FOUND'});candidates.sort((a,b)=>String(b.modifiedAt?.iso||b.updatedAt||'').localeCompare(String(a.modifiedAt?.iso||a.updatedAt||'')));const saveInfo=candidates[0],download=await ats.call('network.request',{url:saveInfo.gameFile.url,method:'GET',headers:{}}),bytes=await responseBytes(ats,download,8*1024*1024),blobId=`pending.cloud.${profile.id}`;await writeBlob(ats,blobId,bytes);await ats.call('storage.kv.set',{key:'pending-cloud-sync',value:{profileId:profile.id,blobId,player,saveInfo,acquiredAt:Date.now()}});return{status:'acquired',profileId:profile.id,size:bytes.length};}

globalThis.atsWorkerMain = async function (input, ats) {
  if (input?.kind === 'capability' && input?.method === 'phigros.summary.get') {
    return summary(ats);
  }
  const profiles = await readDataset(ats, 'profiles', 262144);
  if (!profiles) return {status:'skipped', reason:'no-profile'};
  return acquireCloudSave(ats,JSON.parse(ats.decodeUtf8(profiles)));
};
