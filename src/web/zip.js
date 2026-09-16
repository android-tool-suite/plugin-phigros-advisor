(() => {
  const decoder = new TextDecoder();
  const table = new Uint32Array(256);
  for (let value=0;value<256;value++) { let crc=value; for(let bit=0;bit<8;bit++) crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1; table[value]=crc>>>0; }
  const crc32 = bytes => { let crc=0xffffffff; for(const byte of bytes) crc=table[(crc^byte)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; };
  const u16=(view,offset)=>view.getUint16(offset,true), u32=(view,offset)=>view.getUint32(offset,true);
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('当前 WebView 不支持旧缓存解压');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function read(bytes,{maxEntries=256,maxExpandedBytes=64*1024*1024}={}) {
    if (!(bytes instanceof Uint8Array) || bytes.length<22) throw new Error('分析数据 ZIP 无效');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let eocd=-1;
    for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--){if(u32(view,offset)===0x06054b50){eocd=offset;break;}}
    if(eocd<0) throw new Error('分析数据 ZIP 缺少目录');
    const count=u16(view,eocd+10), centralOffset=u32(view,eocd+16);
    if(count>maxEntries||centralOffset>=bytes.length) throw new Error('分析数据 ZIP 超出条目限制');
    const result=new Map(); let cursor=centralOffset,total=0;
    for(let index=0;index<count;index++){
      if(cursor+46>bytes.length||u32(view,cursor)!==0x02014b50) throw new Error('分析数据 ZIP 目录损坏');
      const method=u16(view,cursor+10), expectedCrc=u32(view,cursor+16), compressedSize=u32(view,cursor+20), size=u32(view,cursor+24);
      const nameLength=u16(view,cursor+28),extraLength=u16(view,cursor+30),commentLength=u16(view,cursor+32),localOffset=u32(view,cursor+42);
      const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength)).replace(/\\/g,'/');
      cursor+=46+nameLength+extraLength+commentLength;
      if(!name||name.startsWith('/')||name.split('/').some(part=>part==='..')||result.has(name)) throw new Error('分析数据 ZIP 包含不安全路径');
      if(name.endsWith('/')) continue;
      total+=size;if(total>maxExpandedBytes) throw new Error('分析数据 ZIP 展开后过大');
      if(localOffset+30>bytes.length||u32(view,localOffset)!==0x04034b50) throw new Error('分析数据 ZIP 本地条目损坏');
      const localName=u16(view,localOffset+26),localExtra=u16(view,localOffset+28),start=localOffset+30+localName+localExtra,end=start+compressedSize;
      if(end>bytes.length) throw new Error('分析数据 ZIP 条目越界');
      const compressed=bytes.subarray(start,end);
      const output=method===0?new Uint8Array(compressed):method===8?await inflateRaw(compressed):null;
      if(!output) throw new Error(`不支持的 ZIP 压缩方式：${method}`);
      if(output.length!==size||crc32(output)!==expectedCrc) throw new Error('分析数据 ZIP 条目校验失败');
      result.set(name,output);
    }
    return result;
  }
  function write(files) {
    const entries=[];let payloadSize=0,centralSize=0;
    for(const [name,value] of files){const safe=String(name).replace(/\\/g,'/');if(!safe||safe.startsWith('/')||safe.split('/').some(part=>part==='..'))throw new Error('ZIP 输出路径无效');const nameBytes=new TextEncoder().encode(safe);const bytes=value instanceof Uint8Array?value:new Uint8Array(value);entries.push({nameBytes,bytes,crc:crc32(bytes),offset:payloadSize});payloadSize+=30+nameBytes.length+bytes.length;centralSize+=46+nameBytes.length;}
    const output=new Uint8Array(payloadSize+centralSize+22),view=new DataView(output.buffer);let cursor=0;
    const put16=value=>{view.setUint16(cursor,value,true);cursor+=2;},put32=value=>{view.setUint32(cursor,value,true);cursor+=4;};
    for(const entry of entries){put32(0x04034b50);put16(20);put16(0x800);put16(0);put16(0);put16(0);put32(entry.crc);put32(entry.bytes.length);put32(entry.bytes.length);put16(entry.nameBytes.length);put16(0);output.set(entry.nameBytes,cursor);cursor+=entry.nameBytes.length;output.set(entry.bytes,cursor);cursor+=entry.bytes.length;}
    const centralOffset=cursor;
    for(const entry of entries){put32(0x02014b50);put16(20);put16(20);put16(0x800);put16(0);put16(0);put16(0);put32(entry.crc);put32(entry.bytes.length);put32(entry.bytes.length);put16(entry.nameBytes.length);put16(0);put16(0);put16(0);put16(0);put32(0);put32(entry.offset);output.set(entry.nameBytes,cursor);cursor+=entry.nameBytes.length;}
    put32(0x06054b50);put16(0);put16(0);put16(entries.length);put16(entries.length);put32(cursor-centralOffset);put32(centralOffset);put16(0);return output;
  }
  window.phigrosZip={read,write,crc32};
})();
