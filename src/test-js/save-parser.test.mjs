import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

globalThis.window=globalThis;
(0,eval)(readFileSync(new URL('../web/save-parser.js',import.meta.url),'utf8'));

const encoder=new TextEncoder();
const chunks=[];
const byte=value=>chunks.push(Uint8Array.of(value));
const varint=value=>value>127?chunks.push(Uint8Array.of((value&127)|128,value>>>7)):byte(value);
const string=value=>{const bytes=encoder.encode(value);varint(bytes.length);chunks.push(bytes);};
const int=value=>{const bytes=new Uint8Array(4);new DataView(bytes.buffer).setInt32(0,value,true);chunks.push(bytes);};
const float=value=>{const bytes=new Uint8Array(4);new DataView(bytes.buffer).setFloat32(0,value,true);chunks.push(bytes);};
varint(1);string('fixture.song.one.0');varint(0);byte(1<<2);byte(1<<2);int(982500);float(98.25);
const size=chunks.reduce((sum,item)=>sum+item.length,0),recordBytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){recordBytes.set(chunk,offset);offset+=chunk.length;}
const records=globalThis.phigrosSaveParser.parseRecords(recordBytes,[{id:'fixture.song.one',title:'Fixture One',constants:[5,10,15.4,0]}]);
assert.equal(records.length,1);assert.equal(records[0].level,'IN');assert.equal(records[0].score,982500);assert.equal(records[0].fc,true);assert.equal(records[0].constant,15.4);

console.log('Phigros Web save parser fixture: OK');
