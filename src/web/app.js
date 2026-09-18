(() => {
  const pages = ['总览','成绩','时间线','定数表'];
  const trendViews = new Map();
  const state = {page:'总览',scoresPage:'RKS 列表',trendDays:30,profiles:{formatVersion:1,profiles:[],selectedProfile:null,widget:{}},tokens:{formatVersion:1,tokens:[]},catalog:[],analysisFiles:new Map(),save:null,snapshot:null,pushTargets:{},timeline:[],query:'',levels:new Set(['IN','AT']),login:null,loginTimer:null,loading:false,pendingDelete:null,listPage:0,historyDays:30,preview:null};
  const pageFilters={scores:{query:'',levels:new Set(['IN','AT'])},catalog:{query:'',levels:new Set(['IN','AT'])}};
  const currentFilters=()=>pageFilters[state.page==='定数表'?'catalog':'scores'];
  Object.defineProperties(state,{
    query:{get:()=>currentFilters().query,set:value=>{currentFilters().query=value;}},
    levels:{get:()=>currentFilters().levels,set:value=>{currentFilters().levels=value;}}
  });
  const ui = Object.fromEntries(['subtitle','tabs','progress','message','content','refresh','token-dialog','token-form','token-label','token-server','token-value'].map(id=>[id,document.getElementById(id)]));
  const byId=id=>{const local=ui.content.querySelector(`[id="${id}"]`);if(local)return local;const global=document.getElementById(id);return global&&!global.closest('.tab-page')?global:null;};
  const all=selector=>ui.content.querySelectorAll(selector);
  const one=selector=>ui.content.querySelector(selector);
  const encode = value => new TextEncoder().encode(JSON.stringify(value));
  const text = bytes => new TextDecoder().decode(bytes);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function setLoading(value){
    state.loading=value;ui.progress.hidden=!value;
    document.querySelectorAll('button').forEach(button=>{
      const readOnly=button.closest('#tabs,.snackbar')||button.matches('.level-filter,.scores-tab,.trend-range,.trend-hit,.go-tokens')||['accounts-open','accounts-close','cancel-login','close-image','cancel-delete-token'].includes(button.id);
      if(readOnly)return;
      if(value){if(!button.hasAttribute('data-busy-disabled'))button.dataset.busyDisabled=String(button.disabled);button.disabled=true;}
      else if(button.hasAttribute('data-busy-disabled')){button.disabled=button.dataset.busyDisabled==='true';delete button.dataset.busyDisabled;}
    });
    for(const id of ['profile-image','b30-image']){const button=byId(id);if(button)button.disabled=value||!state.save;}
    const sync=byId('sync');if(sync)sync.disabled=value||!selected();
  }
  const message=createFeedback(ui.message);
  async function load(){setLoading(true);message('');try{
    await phigrosInitialLoad.loadLocal(ats.readDataset, profiles => {
      state.profiles=profiles?JSON.parse(text(profiles)):{formatVersion:1,profiles:[],selectedProfile:null,widget:{}};
      render();
    }, async ({tokens,catalog,analysis}) => {
      state.tokens=tokens?JSON.parse(text(tokens)):{formatVersion:1,tokens:[]};
      state.catalog=catalog?parseCatalog(text(catalog)):[];
      if(analysis) await loadAnalysis(analysis);
      else {state.analysisFiles=new Map();state.save=null;state.snapshot=null;state.pushTargets={};state.timeline=[];}
      render();
    });
    for(const item of state.tokens.tokens||[]){if(item.id&&item.token)await ats.call('storage.secret.set',{datasetId:'session-tokens',key:`token:${item.id}`,value:item.token});}
    await consumePendingSync();
    ui.subtitle.textContent=state.profiles.profiles.length?`${state.profiles.profiles.length} 个账号 · 数据保存在本机`:'尚未添加账号';render();await pager.restore();
  }catch(error){message(error.message||'读取本地数据失败','danger');render();}finally{setLoading(false);}}
  function parseCatalog(raw){return phigrosPresentation.catalog(raw);}
  async function loadAnalysis(bytes){const files=await phigrosZip.read(bytes);state.analysisFiles=files;const scope=safeScope(state.profiles.selectedProfile);if(!scope)return;const save=files.get(`saves/save-${scope}.json`);const timeline=files.get(`timeline-${scope}.json`);if(save){state.save=JSON.parse(text(save));state.snapshot=phigrosRks.calculate(state.save.records||[]);state.pushTargets={};}if(timeline)state.timeline=JSON.parse(text(timeline));}
  const safeScope=value=>String(value||'').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,80);
  const serverConfig=server=>server==='GLOBAL'?{appId:'kviehleldgxsagpozb',appKey:'tG9CTm0LDD736k9HMM9lBZrbeBGRmUkjSfNLDNib',base:'https://kviehlel.cloud.ap-sg.tapapis.com/1.1'}:{appId:'rAK3FfdieFob2Nn8Am',appKey:'Qr9AEqtuoSVS3zeD6iVbM4ZC0AtkJcQ89tywVyi0',base:'https://rak3ffdi.cloud.tds1.tapapis.cn/1.1'};
  async function requestJson(url,options){const response=await ats.request(url,options);let value={};try{value=response.text?JSON.parse(response.text):{};}catch(_){throw new Error(`服务器返回了无法识别的数据（HTTP ${response.status}）`);}if(response.status<200||response.status>=300)throw new Error(value.error||value.message||`HTTP ${response.status}`);return value;}
  function historyEvent(previous,next,snapshot){return phigrosPresentation.historyEvent(previous,next,snapshot);}
  async function commitCloudSave(next,profileId){const scope=safeScope(profileId),previousBytes=state.analysisFiles.get(`saves/save-${scope}.json`),timelineBytes=state.analysisFiles.get(`timeline-${scope}.json`),previous=previousBytes?JSON.parse(text(previousBytes)):null,oldTimeline=timelineBytes?JSON.parse(text(timelineBytes)):[],snapshot=phigrosRks.calculate(next.records||[]),event=historyEvent(previous,next,snapshot),timeline=phigrosPresentation.appendHistory(oldTimeline,event);state.analysisFiles.set(`saves/save-${scope}.json`,encode(next));state.analysisFiles.set(`last-records-${scope}.json`,encode(next.records||[]));state.analysisFiles.set(`timeline-${scope}.json`,encode(timeline));await ats.writeDataset('analysis-data',phigrosZip.write(state.analysisFiles));if(profileId===state.profiles.selectedProfile){state.profiles.widget={rks:snapshot.overall,count:next.records.length,player:next.profile.playerId};await ats.writeDataset('profiles',encode(state.profiles));state.save=next;state.snapshot=snapshot;state.pushTargets={};state.timeline=timeline;}return snapshot;}
  async function consumePendingSync(){const pending=await ats.call('storage.kv.get',{key:'pending-cloud-sync'});if(!pending.found)return;const value=pending.value||{};try{const bytes=await ats.readBlob(value.blobId,8*1024*1024);if(!bytes)throw new Error('后台同步文件不存在');const next=await phigrosSaveParser.parse(bytes,value.player||{},value.saveInfo||{},state.catalog);await commitCloudSave(next,value.profileId);message('已应用后台同步结果','success');}finally{if(value.blobId)await ats.call('storage.blob.delete',{id:value.blobId}).catch(()=>{});await ats.call('storage.kv.delete',{key:'pending-cloud-sync'}).catch(()=>{});}}
  async function syncNow(){const profile=selected();if(!profile)throw new Error('请先添加并选择账号');const secret=await ats.call('storage.secret.get',{datasetId:'session-tokens',key:`token:${profile.id}`});if(!secret.found)throw new Error('当前账号缺少 SessionToken');const token=String(secret.value||'');const config=serverConfig(profile.server);const headers={'X-LC-Id':config.appId,'X-LC-Key':config.appKey,'X-LC-Session':token,'User-Agent':'LeanCloud-CSharp-SDK/1.0.3'};const player=await requestJson(`${config.base}/users/me`,{headers});if(!player.objectId)throw new Error('SessionToken 无法读取玩家信息');const where=encodeURIComponent(JSON.stringify({user:{__type:'Pointer',className:'_User',objectId:player.objectId}}));const saves=await requestJson(`${config.base}/gamesaves?skip=0&limit=100&where=${where}&include=cover,gameFile`,{headers});const candidates=(saves.results||[]).filter(item=>item.gameFile?.url);if(!candidates.length)throw new Error('没有找到可下载的云存档');candidates.sort((a,b)=>String(b.modifiedAt?.iso||b.updatedAt||'').localeCompare(String(a.modifiedAt?.iso||a.updatedAt||'')));const saveInfo=candidates[0],download=await ats.request(saveInfo.gameFile.url,{deadlineMs:60000});if(download.status<200||download.status>=300)throw new Error(`下载云存档失败（HTTP ${download.status}）`);const next=await phigrosSaveParser.parse(download.bytes,player,saveInfo,state.catalog);await commitCloudSave(next,profile.id);render();}
  function renderTabs(){ui.tabs.replaceChildren(...pages.map(page=>{const button=document.createElement('button');button.textContent=page;button.className=page===state.page?'active':'';button.onclick=()=>pager.goTo(page);return button;}));pager.syncTabs();}
  const listPages={};Object.defineProperty(state,'listPage',{get:()=>listPages[state.page==='成绩'?state.scoresPage:state.page]||0,set:value=>{listPages[state.page==='成绩'?state.scoresPage:state.page]=value;}});
  function drawPage(page,root){const previousPage=state.page,previousRoot=ui.content;state.page=page;ui.content=root;try{renderBody();}finally{state.page=previousPage;ui.content=previousRoot;}}
  const pager=createTabPager({host:ui.content,tabs:ui.tabs,pages,initialPage:state.page,isBusy:()=>false,renderPage:drawPage,onSelect:(page,root)=>{state.page=page;ui.content=root;renderTabs();setLoading(state.loading);}});
  ui.content=pager.root(state.page);
  function render(){
    const profile=selected();ui.subtitle.textContent=profile?`${profile.label} · ${profile.server==='GLOBAL'?'国际服':'国服'} · 数据保存在本机`:'尚未添加账号';
    renderTabs();pager.refresh();if(document.getElementById('accounts-dialog').open)renderAccountsDialog();
  }
  function renderAccountsDialog(){const previousPage=state.page,previousRoot=ui.content;state.page='账号管理';ui.content=document.getElementById('accounts-content');try{renderBody();}finally{state.page=previousPage;ui.content=previousRoot;}}
  function openAccounts(){renderAccountsDialog();const dialog=document.getElementById('accounts-dialog');if(!dialog.open)dialog.showModal();}
  function scoresTabs(){return `<nav class="scores-tabs" aria-label="成绩视图">${['RKS 列表','B30'].map(page=>`<button type="button" class="secondary scores-tab" data-page="${page}" aria-pressed="${state.scoresPage===page}">${page}</button>`).join('')}</nav>`;}

  function selected(){return state.profiles.profiles.find(item=>item.id===state.profiles.selectedProfile)||null;}
  function renderBody(){
    trendViews.get(ui.content)?.dispose();trendViews.delete(ui.content);
    const profile=selected(),page=state.page==='成绩'?state.scoresPage:state.page;
    if(page==='总览'){
      if (!state.save && state.loading && state.profiles.widget && Number(state.profiles.widget.count)>0) {
        const widget=state.profiles.widget;
        let rks=Number(widget.rks);
        if(!Number.isFinite(rks) && widget.rksBits!=null){const bytes=new ArrayBuffer(8),view=new DataView(bytes);view.setBigUint64(0,BigInt(widget.rksBits));rks=view.getFloat64(0);}
        ui.content.innerHTML=`<article class="card hero"><small>${escapeHtml(widget.player||profile?.label||'Phigros')}</small><div class="big">${Number.isFinite(rks)?rks.toFixed(4):'—'} <span>RKS</span></div><p>${Number(widget.count)} 条成绩</p><small>上次同步摘要 · 正在补全成绩详情</small></article>`;
        return;
      }

      const data=state.save?.profile||{};
      ui.content.innerHTML=state.save?`<article class="card hero player-summary"><h2>${escapeHtml(data.playerId||profile?.label||'当前账号')}</h2>${data.selfIntro?`<p class="self-intro">${escapeHtml(data.selfIntro)}</p>`:''}<div class="row"><div><small>本地计算 RKS</small><strong class="rks-value">${state.snapshot.overall.toFixed(4)}</strong></div><div class="player-meta"><strong>课题模式 ${Math.floor((data.challengeModeRank||0)/100)} / ${(data.challengeModeRank||0)%100}</strong><p>${formatMoney(data.money||[])}</p></div></div>${data.officialRks>0&&Math.abs(data.officialRks-state.snapshot.overall)>.001?`<small>官方存档 RKS ${Number(data.officialRks).toFixed(4)} · 本地计算差 ${(state.snapshot.overall-data.officialRks).toFixed(4)}</small>`:''}<small>存档时间 ${escapeHtml(String(data.saveUpdatedAt||'—').slice(0,19).replace('T',' '))} · ${profile?.server==='GLOBAL'?'国际服':'国服'}</small><div class="actions primary-actions"><button id="sync">同步云存档</button><button id="profile-image" class="text-button">个人信息图</button></div></article><section class="card" id="rks-trend"></section><section class="card"><h3>难度统计</h3><table class="difficulty-table" aria-label="各难度 Clear、FC、AP 数量"><thead><tr><th scope="col">难度</th>${['EZ','HD','IN','AT'].map(level=>`<th scope="col" data-level="${level}">${level}</th>`).join('')}</tr></thead><tbody>${[['Clear',data.cleared],['FC',data.fullCombo],['AP',data.phi]].map(([label,values])=>`<tr><th scope="row">${label}</th>${[0,1,2,3].map(index=>`<td>${Number(values?.[index])||0}</td>`).join('')}</tr>`).join('')}</tbody></table><small>有效成绩 ${state.save.records.filter(record=>record.score>0).length} 条 · 有定数 ${state.save.records.filter(record=>record.constant>0).length} 条</small></section>`:`<div class="empty"><h2>${profile?'还没有本地成绩':'开始使用'}</h2><p>${profile?'同步云存档后查看成绩与推分历史。':'添加账号后即可同步。成绩与历史保存在本机。'}</p>${profile?'<button id="sync">同步云存档</button>':'<button class="go-tokens">添加账号</button>'}</div>`;
    }else if(page==='账号管理'){
      ui.content.innerHTML=`<p class="supporting">凭据加密保存在本机，页面不回显。</p>${state.pendingDelete?'<div class="notice danger"><h3>确认删除这个账号？</h3><p>登录令牌会被删除，已缓存的成绩与时间线会保留。</p><div class="actions"><button id="confirm-delete-token">确认删除</button><button id="cancel-delete-token" class="secondary">取消</button></div></div>':''}${!state.login?'<section class="card"><label>服务器<select id="login-server"><option value="CN">国服</option><option value="GLOBAL">国际服</option></select></label><button class="tap-login">使用 TapTap 登录</button><details><summary>手动添加 SessionToken</summary><p class="supporting">保存后不回显明文。</p><button id="add-token" class="secondary">手动添加</button></details></section>':''}${state.login?`<article class="card login-card"><div id="login-qr" aria-label="TapTap 登录二维码"></div><div><h3>等待 TapTap 确认</h3><p id="login-expiry"></p><div class="actions"><button id="open-login">在浏览器打开登录页</button><button id="cancel-login" class="secondary">取消登录</button></div></div></article>`:''}<div class="list">${state.profiles.profiles.map(item=>`<article class="card row"><div><h3>${escapeHtml(item.label)}</h3><p>${item.server==='GLOBAL'?'国际服':'国服'} · ${item.id===state.profiles.selectedProfile?'当前使用':'未选择'}</p></div><div class="actions"><button class="secondary select-token" data-id="${escapeHtml(item.id)}" ${item.id===state.profiles.selectedProfile?'disabled':''}>选择</button><button class="secondary rename-token" data-id="${escapeHtml(item.id)}">改备注</button><button class="secondary delete-token" data-id="${escapeHtml(item.id)}">删除</button></div></article>`).join('')||'<div class="empty">还没有账号。</div>'}</div>`;
    }else if(page==='定数表'||page==='RKS 列表'){
      ui.content.innerHTML=`${page==='RKS 列表'?scoresTabs():''}<div class="catalog-search">${filterControls(true)}${page==='定数表'?'<button id="update-catalog" class="secondary">更新</button>':''}</div>${filterControls(false)}<p id="result-count" class="supporting"></p><div id="results" class="list"></div><div id="result-pager" class="pager"></div>`;
    }else if(page==='B30'){
      ui.content.innerHTML=`${scoresTabs()}<div class="section-header"><div><h2>P3 + B27</h2><p>${state.snapshot?`综合 RKS ${state.snapshot.overall.toFixed(4)}`:'尚无缓存'}</p></div><button id="b30-image">生成 B30 图</button></div>${[['P3',state.snapshot?.phi||[]],['B27',state.snapshot?.best27||[]]].map(([title,records])=>`<h3>${title}</h3><div class="list">${records.map((record,index)=>recordCard(record,String(index+1).padStart(2,'0'))).join('')||'<div class="empty">暂无成绩</div>'}</div>`).join('')}`;
    }else if(page==='时间线'){
      const events=phigrosPresentation.timeline(state.timeline,state.historyDays);
      ui.content.innerHTML=`<div class="section-header"><div><h2>推分时间线</h2><p>${events.length} 个历史节点</p></div><select id="history-days" aria-label="时间范围">${[30,90,180,0].map(days=>`<option value="${days}" ${state.historyDays===days?'selected':''}>${days?`${days} 天`:'全部'}</option>`).join('')}</select></div><div class="list">${events.map((item,index)=>`<details class="card history-event"><summary><div class="history-heading"><strong>${escapeHtml(String(item.saveTimestamp||new Date(item.timestamp).toLocaleString()).slice(0,19).replace('T',' '))}</strong><span>${Number(item.newRks||0).toFixed(4)} RKS${item.oldRks==null?'':` · ${item.newRks-item.oldRks>=0?'+':''}${(item.newRks-item.oldRks).toFixed(4)}`}</span></div><p class="history-meta">${(item.changes||[]).length} 项成绩变化 · 课题 ${Math.floor((item.challengeModeRank||0)/100)} / ${(item.challengeModeRank||0)%100}</p></summary><div class="history-details" data-history-index="${index}"></div></details>`).join('')||'<div class="empty">此时间范围内尚无变化记录。</div>'}</div>`;
    }
    bind();bindExtras();applyFilters();if(page==='总览'&&state.save)trendViews.set(ui.content,phigrosTrend.mount(byId('rks-trend'),{events:state.timeline,days:state.trendDays,onRangeChange:value=>{state.trendDays=value;}}));setLoading(state.loading);
  }
  function changeCard(item){const score=value=>value==null?'—':Number(value).toLocaleString(),acc=value=>value==null?'—':Number(value).toFixed(4)+'%';return `<div class="timeline-item"><h3>${escapeHtml(item.title||item.id)} · ${escapeHtml(item.level)}</h3><p class="change-tag">${escapeHtml(item.tag||'成绩提升')}</p><p>${score(item.oldScore)} → ${score(item.newScore)}</p><p>${acc(item.oldAccuracy)} → ${acc(item.newAccuracy)}</p></div>`;}
  function filterControls(search){return search?`<label class="record-search-label">搜索曲名或曲目 ID<input id="record-search" type="search" value="${escapeHtml(state.query)}" autocomplete="off"></label>`:`<div class="level-filters" aria-label="选择显示的难度">${['EZ','HD','IN','AT'].map(level=>`<button type="button" class="secondary level-filter${state.levels.has(level)?' active':''}" data-level="${level}" aria-pressed="${state.levels.has(level)}">${level}</button>`).join('')}</div>`;}
  function recordCard(record,rank=''){const identity=phigrosRks.identity(record);if(!(identity in state.pushTargets))state.pushTargets[identity]=phigrosRks.pushTarget(record,state.save?.records||[],state.snapshot);const target=state.pushTargets[identity],push=target?.targetAccuracy!=null?Number(target.targetAccuracy).toFixed(4)+'%':record.accuracy>=100?'已达 Phi':'无法推分';return `<article class="card record"><div class="record-heading"><strong class="rank">${escapeHtml(rank)}</strong><h3>${escapeHtml(record.title||record.id)}</h3><strong class="rating" data-rating="${phigrosPresentation.grade(record)}">${phigrosPresentation.grade(record)}</strong></div><div class="record-values"><div><small>难度</small><strong data-level="${escapeHtml(record.level)}">${escapeHtml(record.level)}</strong></div><div><small>定数</small><strong>${Number(record.constant||0).toFixed(1)}</strong></div><div><small>分数</small><strong>${String(record.score||0).padStart(7,'0')}</strong></div><div><small>准确率</small><strong>${Number(record.accuracy||0).toFixed(4)}%</strong></div></div><div class="record-footer"><div class="push-value"><small>推分 ACC</small><strong>${push}</strong></div><div class="chart-rks"><small>单曲 RKS</small><strong>${Number(record.rks||0).toFixed(4)}</strong></div></div></article>`;}
  function bind(){byId('add-token')?.addEventListener('click',()=>ui['token-dialog'].showModal());all('.tap-login').forEach(button=>button.onclick=()=>startLogin(document.querySelector('#accounts-content #login-server')?.value||'CN'));byId('open-login')?.addEventListener('click',()=>ats.call('app.openExternal',{url:state.login.loginUrl}).catch(error=>message(error.message,'danger')));renderLoginQr();all('.select-token').forEach(button=>button.onclick=()=>runAction(async()=>{state.profiles.selectedProfile=button.dataset.id;await ats.writeDataset('profiles',encode(state.profiles));state.listPage=0;await load();}));all('.delete-token').forEach(button=>button.onclick=()=>{state.pendingDelete=button.dataset.id;render();});byId('confirm-delete-token')?.addEventListener('click',()=>runAction(()=>deleteToken(state.pendingDelete)));byId('cancel-delete-token')?.addEventListener('click',()=>{state.pendingDelete=null;render();});byId('sync')?.addEventListener('click',async()=>{setLoading(true);try{await syncNow();message('云存档同步完成','success');}catch(error){message(error.message,'danger');}finally{setLoading(false);}});byId('profile-image')?.addEventListener('click',()=>exportImage('profile'));byId('b30-image')?.addEventListener('click',()=>exportImage('b30'));byId('record-search')?.addEventListener('input',event=>{state.query=event.target.value;state.listPage=0;applyFilters();});all('.level-filter').forEach(button=>button.onclick=()=>{const level=button.dataset.level;state.levels.has(level)?state.levels.delete(level):state.levels.add(level);button.classList.toggle('active',state.levels.has(level));button.setAttribute('aria-pressed',String(state.levels.has(level)));state.listPage=0;applyFilters();});}
  async function runAction(action){setLoading(true);try{await action();}catch(error){message(error.message||'操作失败','danger');if(byId('image-dialog')?.open)byId('image-status').textContent=error.message||'操作失败，请重试';}finally{setLoading(false);}}
  async function updateCatalog(){await runAction(async()=>{const response=await ats.request('https://raw.githubusercontent.com/Catrong/phi-plugin/main/resources/info/info.csv',{deadlineMs:60000});if(response.status<200||response.status>=300)throw new Error(`更新曲库失败（HTTP ${response.status}）`);const catalog=parseCatalog(response.text);if(catalog.length<=100)throw new Error('曲库返回内容不完整，已保留本地曲库');await ats.writeDataset('song-catalog',new TextEncoder().encode(response.text));state.catalog=catalog;state.listPage=0;render();message(`曲库已更新，共 ${catalog.length} 首曲目`,'success');});}
  function bindExtras(){
    all('.history-event').forEach(details=>details.addEventListener('toggle',()=>{if(!details.open)return;const target=details.querySelector('.history-details');if(target.dataset.loaded)return;const event=phigrosPresentation.timeline(state.timeline,state.historyDays)[Number(target.dataset.historyIndex)];target.innerHTML=(event?.changes||[]).map(changeCard).join('')||'<p>本次为 RKS 或课题变化，没有谱面成绩变化。</p>';target.dataset.loaded='true';}));
    byId('overview-b30-image')?.addEventListener('click',()=>exportImage('b30'));all('.go-tokens').forEach(button=>button.addEventListener('click',openAccounts));all('.scores-tab').forEach(button=>button.onclick=()=>{state.scoresPage=button.dataset.page;render();});
    byId('update-catalog')?.addEventListener('click',updateCatalog);
    byId('history-days')?.addEventListener('change',event=>{state.historyDays=Number(event.target.value);render();});
    byId('cancel-login')?.addEventListener('click',()=>{clearTimeout(state.loginTimer);state.login=null;state.loginTimer=null;render();});
    all('.rename-token').forEach(button=>button.onclick=()=>{const profile=state.profiles.profiles.find(item=>item.id===button.dataset.id);const dialog=byId('rename-dialog');dialog.dataset.profileId=profile.id;byId('rename-value').value=profile.label;dialog.showModal();});
  }
  async function deleteToken(id){if(!id)return;state.profiles.profiles=state.profiles.profiles.filter(item=>item.id!==id);state.tokens.tokens=(state.tokens.tokens||[]).filter(item=>item.id!==id);state.pendingDelete=null;if(state.profiles.selectedProfile===id)state.profiles.selectedProfile=state.profiles.profiles[0]?.id||null;await ats.call('storage.secret.delete',{datasetId:'session-tokens',key:`token:${id}`});await Promise.all([ats.writeDataset('profiles',encode(state.profiles)),ats.writeDataset('session-tokens',encode(state.tokens))]);await load();}
  function applyFilters(){
    const target=byId('results');if(!target)return;
    const catalog=state.page==='定数表',query=state.query.trim().toLowerCase();
    const records=catalog?phigrosPresentation.charts(state.catalog,state.levels,query):(state.snapshot?.sorted||[]).filter(record=>state.levels.has(record.level)&&(!query||`${record.id} ${record.title}`.toLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(records.length/40));state.listPage=Math.min(state.listPage,pages-1);
    byId('result-count').textContent=`${records.length} ${catalog?'张谱面':'条成绩'}`;
    const counts=new Map();if(catalog)records.forEach(record=>{const major=Math.floor(record.constant);counts.set(major,(counts.get(major)||0)+1);});
    let group=null;
    target.innerHTML=records.slice(state.listPage*40,(state.listPage+1)*40).map(record=>{
      if(!catalog){const rank=state.snapshot.sorted.findIndex(item=>phigrosRks.identity(item)===phigrosRks.identity(record))+1;return recordCard(record,String(rank).padStart(2,'0'));}
      const major=Math.floor(record.constant),heading=major!==group?`<h3 class="catalog-group-heading">${major} · ${counts.get(major)} 张谱面</h3>`:'';group=major;
      return `${heading}<article class="catalog-row"><strong class="catalog-constant" data-level="${record.level}">${record.constant.toFixed(1)}</strong><div class="catalog-song"><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.composer||record.id)}</small></div><strong data-level="${record.level}">${record.level}</strong></article>`;
    }).join('')||'<div class="empty">没有符合条件的谱面或成绩。</div>';
    const pagination=byId('result-pager');pagination.hidden=pages<=1;
    pagination.innerHTML=`<button id="previous-results" class="secondary" ${state.listPage?'':'disabled'}>上一页</button><span>${state.listPage+1} / ${pages}</span><button id="next-results" class="secondary" ${state.listPage+1<pages?'':'disabled'}>下一页</button>`;
    byId('previous-results').onclick=()=>{state.listPage--;applyFilters();};byId('next-results').onclick=()=>{state.listPage++;applyFilters();};
  }
  function renderLoginQr(){const target=byId('login-qr');if(!target||!state.login||typeof qrcode!=='function')return;try{const code=qrcode(0,'M');code.addData(state.login.loginUrl);code.make();target.innerHTML=code.createSvgTag({cellSize:5,margin:2,scalable:true});}catch(error){target.textContent='二维码生成失败，可使用右侧按钮继续登录';}}
  async function saveToken(label,server,token){const existing=(state.tokens.tokens||[]).find(item=>item.token===token);const id=existing?.id||crypto.randomUUID().replace(/-/g,''),now=Date.now();if(!state.profiles.profiles.some(item=>item.id===id))state.profiles.profiles.push({id,label,server,createdAt:now,lastUsedAt:now});state.profiles.selectedProfile=id;state.tokens.tokens=(state.tokens.tokens||[]).filter(item=>item.id!==id);state.tokens.tokens.push({id,token});await ats.call('storage.secret.set',{datasetId:'session-tokens',key:`token:${id}`,value:token});await Promise.all([ats.writeDataset('profiles',encode(state.profiles)),ats.writeDataset('session-tokens',encode(state.tokens))]);}
  async function startLogin(server){setLoading(true);try{if(state.loginTimer)clearTimeout(state.loginTimer);state.login=await phigrosLogin.request(server);render();pollLogin();message('请在浏览器中完成 TapTap 登录','');}catch(error){state.login=null;message(error.message,'danger');}finally{setLoading(false);}}
  async function pollLogin(){const session=state.login;if(!session)return;try{const result=await phigrosLogin.poll(session);if(state.login!==session)return;if(result){await saveToken(result.label,state.login.server,result.token);state.login=null;state.loginTimer=null;message('TapTap 登录完成','success');await load();return;}}catch(error){if(state.login!==session)return;state.login=null;state.loginTimer=null;message(error.message,'danger');render();return;}state.loginTimer=setTimeout(pollLogin,state.login.intervalSeconds*1000);}
  async function exportImage(kind){await runAction(async()=>{
    if(!state.save||!state.snapshot)throw new Error('请先同步或恢复成绩数据');
    const records=kind==='b30'?[...state.snapshot.phi,...state.snapshot.best27]:state.snapshot.sorted.slice(0,8);
    const artworks=await loadArtworks(records);
    try{
      const canvas=phigrosImages.render(kind,state.save,state.snapshot,state.pushTargets,artworks,selected()?.label);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('当前 WebView 无法生成 PNG');
      clearPreview();const url=URL.createObjectURL(blob);state.preview={blob,url,kind};byId('image-preview').src=url;byId('image-status').textContent=artworks.every(Boolean)?'确认预览后选择保存位置。':'部分曲绘未能加载，已保留对应成绩文字；可检查网络授权后重新生成。';byId('image-dialog').showModal();
    }finally{artworks.forEach(item=>{if(item)URL.revokeObjectURL(item.url);});}
  });}
  function clearPreview(){if(state.preview)URL.revokeObjectURL(state.preview.url);state.preview=null;byId('image-preview').removeAttribute('src');}
  async function loadArtworks(records){
    const results=new Array(records.length),cache=new Map();let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,records.length)},async()=>{while(cursor<records.length){const index=cursor++,record=records[index],key=record.illustrationUrl||record.id;if(!cache.has(key))cache.set(key,loadArtwork(record));results[index]=await cache.get(key);}}));
    return results;
  }
  async function loadArtwork(record){if(!record.illustrationUrl)return null;try{const response=await ats.request(record.illustrationUrl,{deadlineMs:30000});if(response.status<200||response.status>=300||!response.bytes.length)return null;const url=URL.createObjectURL(new Blob([response.bytes],{type:'image/png'})),image=new Image();image.src=url;await image.decode();return{image,url};}catch(_){return null;}}
  function formatMoney(values){const units=['KiB','MiB','GiB','TiB','PiB'],parts=[];for(let index=values.length-1;index>=0;index--)if(Number(values[index])>0)parts.push(`${values[index]} ${units[index]||'?'}`);return parts.join(' · ')||'0 KiB';}
  ui.refresh.onclick=load;
  document.getElementById('accounts-open').onclick=openAccounts;
  document.getElementById('accounts-close').onclick=()=>document.getElementById('accounts-dialog').close();
  ui['token-form'].addEventListener('submit',async event=>{
    if(event.submitter?.value==='cancel'){ui['token-value'].value='';return;}
    event.preventDefault();const token=ui['token-value'].value.trim();
    if(!/^[A-Za-z0-9]{25}$/.test(token)){message('SessionToken 应为 25 位字母或数字','danger');return;}
    await runAction(async()=>{await saveToken(ui['token-label'].value.trim(),ui['token-server'].value,token);ui['token-value'].value='';ui['token-dialog'].close();await load();setLoading(false);openAccounts();});
  });
  ui['token-dialog'].addEventListener('close',()=>{ui['token-value'].value='';});
  byId('rename-form').addEventListener('submit',event=>{
    if(event.submitter?.value==='cancel')return;event.preventDefault();const dialog=byId('rename-dialog'),profile=state.profiles.profiles.find(item=>item.id===dialog.dataset.profileId),label=byId('rename-value').value.trim();if(!profile||!label)return;
    runAction(async()=>{const next={...state.profiles,profiles:state.profiles.profiles.map(item=>item.id===profile.id?{...item,label}:item)};await ats.writeDataset('profiles',encode(next));state.profiles=next;dialog.close();render();});
  });
  byId('close-image').onclick=()=>byId('image-dialog').close();
  byId('image-dialog').addEventListener('close',clearPreview);
  byId('save-image').onclick=()=>runAction(async()=>{const preview=state.preview;if(!preview)return;const blobId=`generated.${preview.kind}`;await ats.writeBlob(blobId,new Uint8Array(await preview.blob.arrayBuffer()));try{await ats.call('file.export.save',{blobId,fileName:`Phigros-${preview.kind==='b30'?'B30':'Profile'}-${Date.now()}.png`,mimeType:'image/png'},600000);message('图片已保存','success');}finally{await ats.call('storage.blob.delete',{id:blobId}).catch(()=>{});}});
  setInterval(()=>{const label=document.querySelector('#accounts-content #login-expiry');if(label&&state.login)label.textContent=`${Math.max(0,Math.ceil((state.login.expiresAt-Date.now())/1000))} 秒后过期`;},1000);
  const applyDomainTheme=()=>{document.documentElement.dataset.theme=getComputedStyle(document.documentElement).colorScheme==='dark'?'dark':'light';};applyDomainTheme();new MutationObserver(applyDomainTheme).observe(document.head,{childList:true,subtree:true,characterData:true});
  (async()=>{try{await ats.ready;await load();}catch(error){message(error.message||'工具初始化失败','danger');setLoading(false);}})();
})();
