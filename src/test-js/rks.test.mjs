import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

globalThis.window = globalThis;
(0, eval)(readFileSync(new URL('../web/rks.js', import.meta.url), 'utf8'));

const fixture = JSON.parse(readFileSync(
  new URL('../test/resources/legacy/save-cn-main.json', import.meta.url),
  'utf8'
));
const snapshot = globalThis.phigrosRks.calculate(fixture.records);

assert.equal(globalThis.phigrosRks.chart(54.99, 16), 0);
assert.equal(globalThis.phigrosRks.chart(100, 16), 16);
assert.equal(snapshot.phi.length, 1);
assert.equal(snapshot.best27.length, 3);
assert.ok(Math.abs(snapshot.overall - 1.9537606995884775) < 1e-12);
assert.equal(snapshot.sorted[0].identity, 'fixture.song.one|AT');

const pushRecords=Array.from({length:30},(_,index)=>({id:`song-${index}`,title:`Song ${index}`,level:'IN',levelIndex:2,constant:16.5-index/100,score:980000,accuracy:98,fc:false,illustrationUrl:''}));
const pushSnapshot=globalThis.phigrosRks.calculate(pushRecords);
const target=globalThis.phigrosRks.pushTarget(pushSnapshot.best27[0],pushRecords,pushSnapshot);
assert.notEqual(target.targetAccuracy,null);
assert.ok(target.resultingRks+1e-7>=globalThis.phigrosRks.nextDisplayedThreshold(pushSnapshot.overall));

console.log('Phigros Web RKS fixture: OK');
