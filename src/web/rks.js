(() => {
  const chart = (accuracy, constant) => accuracy < 55 ? 0 : constant * ((accuracy - 55) / 45) ** 2;
  const identity = record => `${record.id}|${record.level}`;
  function calculate(records) {
    const normalized = records.map(item => ({...item,rks:chart(Number(item.accuracy),Number(item.constant)),identity:identity(item)}));
    const sorted = [...normalized].filter(item => item.rks > 0).sort((a,b) => b.rks-a.rks || b.score-a.score);
    const phi = sorted.filter(item => item.accuracy >= 100 - 1e-6 || item.score >= 1000000).slice(0,3);
    const best27 = sorted.slice(0,27);
    const overall = (phi.reduce((sum,item)=>sum+item.rks,0)+best27.reduce((sum,item)=>sum+item.rks,0))/30;
    return {phi,best27,sorted,overall};
  }
  const nextDisplayedThreshold=overall=>{let delta=Math.floor(overall*100)/100+.005-overall;if(delta<0)delta+=.01;return overall+delta;};
  function pushTarget(record,records,baseline=calculate(records)){if(record.accuracy>=100-1e-7||record.constant<=0)return{targetAccuracy:null,resultingRks:baseline.overall};const target=nextDisplayedThreshold(baseline.overall),replace=accuracy=>records.map(item=>identity(item)===identity(record)?{...item,accuracy,score:accuracy>=100?1000000:item.score,fc:item.fc||accuracy>=100}:item),perfect=calculate(replace(100)).overall;if(perfect+1e-8<target)return{targetAccuracy:null,resultingRks:perfect};let low=record.accuracy,high=100;for(let index=0;index<42;index++){const mid=(low+high)/2;if(calculate(replace(mid)).overall>=target)high=mid;else low=mid;}return{targetAccuracy:high,resultingRks:calculate(replace(high)).overall};}
  const pushTargets=(records,snapshot=calculate(records))=>Object.fromEntries(snapshot.sorted.map(record=>[record.identity,pushTarget(record,records,snapshot)]));
  window.phigrosRks = {chart,calculate,identity,nextDisplayedThreshold,pushTarget,pushTargets};
})();
