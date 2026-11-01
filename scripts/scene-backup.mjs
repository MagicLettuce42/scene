#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {link,unlink} from 'node:fs/promises';
import {Writable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encryptBackup,decryptBackup} from './backup-crypto.mjs';
import {backupDestination,databaseEnvironment} from './backup-safety.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Hidden terminal input: credentials/passphrases never appear in arguments or files.
function ask(label){
 if(!process.stdin.isTTY)throw Error('Run this interactively in Terminal. Do not pipe credentials.');
 process.stdout.write(label+': ');process.stdin.setEncoding('utf8');process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const done=(error)=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);};const read=chunk=>{for(const c of chunk){if(c==='\u0003')return done(Error('Cancelled.'));if(c==='\r'||c==='\n')return done();if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c==='\u0015')value='';else if(c>=' '&&value.length<1024)value+=c;}};process.stdin.on('data',read);});
}
async function password(confirm=false){const value=await ask('Backup passphrase (hidden; at least 16 characters)');if(value.length<16||value.length>512)throw Error('Use 16–512 characters.');if(confirm&&value!==await ask('Repeat backup passphrase (hidden)'))throw Error('Passphrases did not match.');return value;}
async function main(){
 const [action,input,output]=process.argv.slice(2);
 if(!['backup','verify','decrypt'].includes(action)){console.log('Scene encrypted database backup (Node 22+; pg_dump 17+)\n\nbackup /absolute/path/scene.scene-backup\nverify /absolute/path/scene.scene-backup\ndecrypt /absolute/path/scene.scene-backup /absolute/path/scene.dump\n\nCredentials are entered interactively with hidden input. This tool never restores over a database.');return;}
 if(action==='backup'){
  const target=await backupDestination(input,root),version=spawnSync('pg_dump',['--version'],{encoding:'utf8'});
  const major=Number(version.stdout?.match(/\b(\d+)\./)?.[1]);if(version.status!==0||major<17)throw Error('Install PostgreSQL client tools version 17 or newer and put pg_dump on PATH.');
  console.log('Use the Session pooler connection from Supabase → Connect. All input below is hidden.');
  const host=await ask('Database host'),port=await ask('Database port (usually 5432)'),user=await ask('Database user'),database=await ask('Database name (usually postgres)'),dbPassword=await ask('Database password');
  const dbEnv=databaseEnvironment(process.env,{host,port,user,database,password:dbPassword});
  const pass=await password(true);
  const child=spawn('pg_dump',['--format=custom','--no-password','--lock-wait-timeout=10000'],{env:dbEnv,stdio:['ignore','pipe','pipe']});
  delete dbEnv.PGPASSWORD;
  // Consume warnings without leaking connection information. A warning requires review.
  let warnings=false;child.stderr.on('data',()=>{warnings=true;});
  const ended=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',resolve);});
  try{await encryptBackup(child.stdout,target,pass,async()=>{if(await ended!==0)throw Error('pg_dump failed; no backup was saved. Check your connection and permissions.');});}catch(e){child.kill();throw e;}
  await decryptBackup(target,pass,new Writable({write(chunk,encoding,cb){cb();}}));
  console.log('Encrypted backup created and authentication verified: '+target);
  if(warnings)console.log('pg_dump produced warnings. Have an administrator review a separate diagnostic run before treating this as a complete backup.');
  console.log('Keep the passphrase separately. Copy the encrypted file to protected off-site storage. Verify it there too.');
 }else if(action==='verify'){
  await decryptBackup(path.resolve(input),await password(),new Writable({write(chunk,encoding,cb){cb();}}));
  console.log('PASS: the entire encrypted backup decrypted and authenticated. This is an integrity check, not a database restore test.');
 }else{
  const target=await backupDestination(output,root),temporary=target+'.partial-'+randomBytes(8).toString('hex');
  try{await decryptBackup(path.resolve(input),await password(),createWriteStream(temporary,{flags:'wx',mode:0o600}));await link(temporary,target);}finally{await unlink(temporary).catch(()=>{});}
  console.log('Authenticated archive decrypted with owner-only file permissions: '+target);
  console.log('Contains sensitive database data. Use only in an isolated restore environment, then remove the plaintext copy.');
 }
}
main().catch(e=>{console.error(e.message==='Unsupported state or unable to authenticate data'?'Wrong passphrase or damaged/tampered backup. No verified output was saved.':e.message);process.exitCode=1;});
