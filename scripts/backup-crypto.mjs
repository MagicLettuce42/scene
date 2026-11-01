import {randomBytes,scrypt,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {createReadStream,createWriteStream} from 'node:fs';
import {open,appendFile,link,unlink,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
const derive=promisify(scrypt),N=131072,r=8,p=1;
async function key(password,salt){if(typeof password!=='string'||password.length<16||password.length>512)throw Error('Use a backup passphrase of 16–512 characters.');return derive(password,salt,32,{N,r,p,maxmem:256*1024*1024});}
export async function encryptBackup(input,output,password,validateSource=async()=>{}){
 const salt=randomBytes(32),iv=randomBytes(12),secret=await key(password,salt),temporary=output+'.partial-'+randomBytes(8).toString('hex');
 const header=Buffer.from(JSON.stringify({format:'scene-backup',version:1,cipher:'aes-256-gcm',kdf:'scrypt',N,r,p,salt:salt.toString('base64'),iv:iv.toString('base64'),createdAt:new Date().toISOString()})+'\n');
 try{
  const file=await open(temporary,'wx',0o600);await file.writeFile(header);await file.close();
  const cipher=createCipheriv('aes-256-gcm',secret,iv);cipher.setAAD(header);
  await pipeline(input,cipher,createWriteStream(temporary,{flags:'a',mode:0o600}));
  await validateSource();
  await appendFile(temporary,cipher.getAuthTag());
  // Atomic publication without overwriting an existing backup.
  await link(temporary,output);
 }finally{secret.fill(0);await unlink(temporary).catch(()=>{});}
}
export async function decryptBackup(input,password,output){
 const info=await stat(input);if(!info.isFile()||info.size<50)throw Error('Invalid backup file.');
 const file=await open(input,'r'),prefix=Buffer.alloc(1024),tag=Buffer.alloc(16);
 let header,meta;
 try{const {bytesRead}=await file.read(prefix,0,prefix.length,0),end=prefix.subarray(0,bytesRead).indexOf(10);if(end<0)throw Error('Invalid backup header.');header=prefix.subarray(0,end+1);meta=JSON.parse(header.toString());await file.read(tag,0,16,info.size-16);}finally{await file.close();}
 if(meta.format!=='scene-backup'||meta.version!==1||meta.cipher!=='aes-256-gcm'||meta.kdf!=='scrypt'||meta.N!==N||meta.r!==r||meta.p!==p)throw Error('Unsupported backup format.');
 const salt=Buffer.from(meta.salt,'base64'),iv=Buffer.from(meta.iv,'base64');if(salt.length!==32||iv.length!==12||info.size<=header.length+16)throw Error('Invalid backup format.');
 const secret=await key(password,salt);
 try{const cipher=createDecipheriv('aes-256-gcm',secret,iv);cipher.setAAD(header);cipher.setAuthTag(tag);
  // Callers must discard output on failure and never execute unauthenticated bytes.
  await pipeline(createReadStream(input,{start:header.length,end:info.size-17}),cipher,output);
 }finally{secret.fill(0);}
}
