import path from 'node:path';
import {realpath,lstat,stat} from 'node:fs/promises';

// Resolve directory symlinks before checking the boundary. Never publish a
// plaintext restore archive into the checkout through an innocent-looking alias.
export async function backupDestination(value,sourceRoot){
 if(!value||!path.isAbsolute(value))throw Error('Supply an absolute output path.');
 const root=await realpath(sourceRoot),parent=await realpath(path.dirname(value));
 const output=path.join(parent,path.basename(value));
 if(output===root||output.startsWith(root+path.sep))throw Error('Save backups outside the Scene source checkout.');
 const folder=await stat(parent);
 if(!folder.isDirectory()||(folder.mode&0o077)!==0)throw Error('Use a private output folder with permissions 700 (owner only).');
 if(typeof process.getuid==='function'&&folder.uid!==process.getuid())throw Error('The output folder must be owned by your account.');
 try{await lstat(output);}catch(error){if(error.code==='ENOENT')return output;throw error;}
 throw Error('The output path already exists. Choose a new filename.');
}

// Inherited libpq settings must not redirect the connection or weaken TLS.
export function databaseEnvironment(base,{host,port,user,database,password}){
 if(!/^[a-zA-Z0-9.-]+$/.test(host)||!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535||
  !/^[a-zA-Z0-9_.-]+$/.test(user)||!/^[a-zA-Z0-9_-]+$/.test(database)||!password)throw Error('Invalid connection details.');
 const env=Object.fromEntries(Object.entries(base).filter(([name])=>!name.toUpperCase().startsWith('PG')));
 return {...env,PGHOST:host,PGPORT:port,PGUSER:user,PGDATABASE:database,PGPASSWORD:password,
  PGSSLMODE:'verify-full',PGSSLROOTCERT:'system',PGGSSENCMODE:'disable',PGCONNECT_TIMEOUT:'15'};
}
