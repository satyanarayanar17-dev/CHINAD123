const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {backup}=require('./pilotBackup');const {logEvent}=require('./logger');
const state={last_success_at:null,last_attempt_at:null,status:'not_started'};
let running=false;
async function createScheduledBackup(config,pool){
 if(running)return;running=true;state.last_attempt_at=new Date().toISOString();state.status='running';
 let client;
 try{
  const directory=path.join(config.persistentDataRoot,'backups');await fs.mkdir(directory,{recursive:true,mode:0o700});
  client=await pool.connect();const output=path.join(directory,'pilot-'+new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID()+'.ccbackup');
  await backup({client,documentsPath:config.documentStoragePath,output,key:config.backupEncryptionKey});
  // Retain seven local recovery snapshots. The runbook requires an independent encrypted copy.
  const archives=(await fs.readdir(directory)).filter(f=>/^pilot-.*\.ccbackup$/.test(f)).sort().reverse();
  for(const file of archives.slice(7))await fs.unlink(path.join(directory,file));
  state.last_success_at=new Date().toISOString();state.status='ok';logEvent('info','pilot_backup_completed',{format:1});
 }catch(error){state.status='failed';logEvent('error','pilot_backup_failed',{code:'BACKUP_FAILED'});throw error;}
 finally{client?.release();running=false;}
}
async function startPilotBackups(config,pool){
 await createScheduledBackup(config,pool);
 const timer=setInterval(()=>{createScheduledBackup(config,pool).catch(()=>{});},24*60*60*1000);timer.unref();return timer;
}
function backupStatus(){return {...state,fresh:state.status==='ok'&&Date.now()-new Date(state.last_success_at).getTime()<26*60*60*1000};}
module.exports={startPilotBackups,backupStatus};
