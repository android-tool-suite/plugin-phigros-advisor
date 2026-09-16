import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

globalThis.window=globalThis;
(0,eval)(readFileSync(new URL('../web/zip.js',import.meta.url),'utf8'));

const encoder=new TextEncoder();
const name=encoder.encode('timeline-fixture.json');
const payload=encoder.encode('[{"status":"ok"}]');
const crc=globalThis.phigrosZip.crc32(payload);
const size=30+name.length+payload.length+46+name.length+22;
const bytes=new Uint8Array(size);const view=new DataView(bytes.buffer);let offset=0;
const u16=(value)=>{view.setUint16(offset,value,true);offset+=2;},u32=(value)=>{view.setUint32(offset,value,true);offset+=4;};
u32(0x04034b50);u16(20);u16(0);u16(0);u16(0);u16(0);u32(crc);u32(payload.length);u32(payload.length);u16(name.length);u16(0);bytes.set(name,offset);offset+=name.length;bytes.set(payload,offset);offset+=payload.length;
const centralOffset=offset;u32(0x02014b50);u16(20);u16(20);u16(0);u16(0);u16(0);u16(0);u32(crc);u32(payload.length);u32(payload.length);u16(name.length);u16(0);u16(0);u16(0);u16(0);u32(0);u32(0);bytes.set(name,offset);offset+=name.length;
const centralSize=offset-centralOffset;u32(0x06054b50);u16(0);u16(0);u16(1);u16(1);u32(centralSize);u32(centralOffset);u16(0);
const files=await globalThis.phigrosZip.read(bytes);
assert.equal(new TextDecoder().decode(files.get('timeline-fixture.json')),'[{"status":"ok"}]');
const rewritten=globalThis.phigrosZip.write(files);
const roundTrip=await globalThis.phigrosZip.read(rewritten);
assert.equal(new TextDecoder().decode(roundTrip.get('timeline-fixture.json')),'[{"status":"ok"}]');
await assert.rejects(()=>globalThis.phigrosZip.read(new Uint8Array([1,2,3])),/分析数据 ZIP 无效/);
console.log('Phigros Web ZIP fixture: OK');
