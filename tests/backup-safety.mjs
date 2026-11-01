import assert from 'node:assert/strict';
import {mkdtemp,mkdir,symlink,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {backupDestination,databaseEnvironment} from '../scripts/backup-safety.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'scene-backup-safety-'));
try{
 const source=path.join(dir,'source'),safe=path.join(dir,'private');
 await mkdir(source,{mode:0o700});await mkdir(safe,{mode:0o700});
 assert.equal(await backupDestination(path.join(safe,'test.dump'),source),path.join(safe,'test.dump'));
 await assert.rejects(backupDestination('relative.dump',source));
 await assert.rejects(backupDestination(path.join(source,'test.dump'),source));
 await symlink(source,path.join(dir,'alias'));
 await assert.rejects(backupDestination(path.join(dir,'alias','test.dump'),source));
 const exists=path.join(safe,'existing.dump');await writeFile(exists,'fixture');
 await assert.rejects(backupDestination(exists,source));
 await symlink(path.join(dir,'missing'),path.join(safe,'broken.dump'));
 await assert.rejects(backupDestination(path.join(safe,'broken.dump'),source));
 await chmod(safe,0o755);await assert.rejects(backupDestination(path.join(safe,'unsafe.dump'),source));await chmod(safe,0o700);
 const config={host:'pooler.example.com',port:'5432',user:'postgres.fixture',database:'postgres',password:'fixture-only'};
 const env=databaseEnvironment({PATH:'/usr/bin',PGHOSTADDR:'bad',PGSERVICE:'bad',PGOPTIONS:'bad',PGSSLMODE:'disable',PGPASSFILE:'bad'},config);
 assert.equal(env.PGHOSTADDR,undefined);assert.equal(env.PGSERVICE,undefined);assert.equal(env.PGOPTIONS,undefined);assert.equal(env.PGPASSFILE,undefined);
 assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGSSLROOTCERT,'system');assert.equal(env.PATH,'/usr/bin');
 for(const bad of [{port:'65536'},{port:'0'},{database:'postgresql://other.example/database'},{database:'host=other.example'},{host:'host other'}])assert.throws(()=>databaseEnvironment({}, {...config,...bad}));
 console.log('PASS: private output directories, symlink boundary, no overwrite, absolute paths, libpq environment isolation and connection-string injection rejection.');
}finally{await rm(dir,{recursive:true,force:true});}
