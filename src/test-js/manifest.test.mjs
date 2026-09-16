import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.template.json',root),'utf8')
  .replace('@VERSION_NAME@','3.0.0').replace('@VERSION_CODE@','20').replace('@MIN_HOST_VERSION_CODE@','24'));
assert.equal(manifest.formatVersion,3);
assert.equal(manifest.plugin.kind,'tool');
assert.equal(manifest.plugin.minAndroidApi,26);
assert.equal(JSON.stringify(manifest).includes('provider.apk'),false);
assert.deepEqual(new Set(manifest.datasets.map(item=>item.id)),new Set(['profiles','analysis-data','session-tokens','song-catalog']));
assert.equal(manifest.datasets.find(item=>item.id==='session-tokens').sensitive,true);
assert.ok(new Set(manifest.requires.capabilities.map(item=>item.id)).isSupersetOf(new Set(['storage','network.request','file.export','scheduler','phigros.summary'])));
assert.equal(manifest.runtime.background.length,1);
assert.equal(manifest.tasks.length,1);

const contract=JSON.parse(readFileSync(new URL('test/resources/legacy/migration-contract.json',root),'utf8'));
assert.deepEqual(new Set(contract.datasets.map(item=>item.id)),new Set(manifest.datasets.map(item=>item.id)));
assert.equal(contract.pages.length,6);
assert.deepEqual(new Set(contract.imageOutputs.map(item=>item.kind)),new Set(['b30','profile']));
const profiles=JSON.parse(readFileSync(new URL('test/resources/legacy/profiles.json',root),'utf8'));
const tokens=JSON.parse(readFileSync(new URL('test/resources/legacy/session-tokens.json',root),'utf8'));
assert.equal(profiles.profiles.length,2);
assert.deepEqual(new Set(tokens.tokens.map(item=>item.id)),new Set(profiles.profiles.map(item=>item.id)));
assert.ok(tokens.tokens.every(item=>/^[A-Za-z0-9]{25}$/.test(item.token)));
console.log('Phigros format v3 manifest and migration contract: OK');
