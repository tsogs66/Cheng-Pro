// Minimal dBASE III/IV (.dbf) reader: no dependencies, never executes anything from the file. Returns { fields, rows } with trimmed strings.
'use strict';
const fs=require('fs');
module.exports=function readDbf(file){const b=fs.readFileSync(file);const n=b.readUInt32LE(4),hl=b.readUInt16LE(8),rl=b.readUInt16LE(10);const fields=[];for(let o=32;b[o]!==0x0d;o+=32){const name=b.toString('latin1',o,o+11).replace(/\0.*$/,'');fields.push({name,len:b[o+16]});}
 const rows=[];for(let i=0;i<n;i++){let o=hl+i*rl;if(b[o]===0x2a){continue;}o++;const r={};for(const f of fields){r[f.name]=b.toString('utf8',o,o+f.len).trim();o+=f.len;}rows.push(r);}return {fields,rows};};
