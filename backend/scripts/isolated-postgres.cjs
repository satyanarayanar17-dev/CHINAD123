// Run a command against a newly created local PostgreSQL database, then drop it.
// Never migrate, seed, truncate, or reset the connection's existing database.
const {Client}=require('pg');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
(async()=>{
 const base=new URL(process.env.TEST_POSTGRES_ADMIN_URL || `postgresql://${require('node:os').userInfo().username}@127.0.0.1:5432/postgres`);
 if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('Test database host must be local');
 const name='cc_validation_'+randomUUID().replaceAll('-','');
 const admin=new Client({connectionString:base.href});await admin.connect();
 let created=false,child;
 try {
  await admin.query(`CREATE DATABASE "${name}"`);created=true;
  base.pathname='/'+name;
  const env={...process.env,NODE_ENV:'development',APP_ENV:'local_dev',DB_DIALECT:'postgres',DATABASE_URL:base.href,DATABASE_SSL:'false',OPD_TEST_POSTGRES:'true',CC_ISOLATED_TEST_DB:name};
  const [command,...args]=process.argv.slice(2);
  if(!command)throw Error('Usage: node backend/scripts/isolated-postgres.cjs <command> [args]');
  console.log('Isolated PostgreSQL fixture: '+name);
  child=spawn(command,args,{env,stdio:'inherit'});
  const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code)=>resolve(code??1));});
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  process.exitCode=code;
 }finally{
  if(created){await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);console.log('Dropped isolated PostgreSQL fixture: '+name);}
  await admin.end();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
