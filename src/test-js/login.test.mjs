import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.window=globalThis;
(0,eval)(readFileSync(new URL('../web/login.js',import.meta.url),'utf8'));
assert.equal(globalThis.phigrosLogin.md5('abc'),'900150983cd24fb0d6963f7d28e17f72');
assert.equal(globalThis.phigrosLogin.md5(''),'d41d8cd98f00b204e9800998ecf8427e');
console.log('Phigros Web login crypto fixture: OK');
