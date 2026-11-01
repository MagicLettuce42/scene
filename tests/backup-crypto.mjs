import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable,Writable} from 'node:stream';
import {encryptBackup,decryptBackup} from '../scripts/backup-crypto.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'scene-backup-qa-')),file=path.join(dir,'test.scene-backup');
const pass='Disposable fixture passphrase only',payload=Buffer.from('PGDMP\0Fixture private watchlist and ratings'.repeat(200));
const sink=chunks=>new Writable({write(chunk,encoding,cb){chunks.push(Buffer.from(chunk));cb();}});
try{
 await encryptBackup(Readable.from(payload),file,pass);
 const encrypted=await readFile(file);assert.equal(encrypted.includes('Fixture private'),false);assert.equal((await stat(file)).mode&0o777,0o600);
 const chunks=[];await decryptBackup(file,pass,sink(chunks));assert.deepEqual(Buffer.concat(chunks),payload);
 await assert.rejects(decryptBackup(file,'Wrong passphrase for QA',sink([])));
 encrypted[encrypted.length-25]^=1;const tampered=path.join(dir,'tampered.scene-backup');await writeFile(tampered,encrypted);await assert.rejects(decryptBackup(tampered,pass,sink([])));
 await assert.rejects(encryptBackup(Readable.from(payload),file,pass),'never overwrite a backup');
 const failed=path.join(dir,'failed.scene-backup');await assert.rejects(encryptBackup(Readable.from(payload),failed,pass,async()=>{throw Error('dump failed');}));await assert.rejects(stat(failed));
 const original=await readFile(file);
 for(const [name,data] of [['truncated',original.subarray(0,original.length-12)],['header',Buffer.from(original)]]){
  if(name==='header'){const offset=data.indexOf('createdAt');assert.ok(offset>0);data[offset]='C'.charCodeAt(0);}
  const broken=path.join(dir,name+'.scene-backup');await writeFile(broken,data);await assert.rejects(decryptBackup(broken,pass,sink([])));
 }
 console.log('PASS: encrypted backup round trip, wrong-passphrase and tamper rejection, owner-only permissions, no overwrite and failed-source cleanup.');
}finally{await rm(dir,{recursive:true,force:true});}
