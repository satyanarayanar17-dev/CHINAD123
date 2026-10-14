// Archive content and credentials are never printed. Keep the encryption key separately.
const path=require('node:path');
const {runtimeConfig,validateRuntimeConfig}=require('../config');
const {backup,restore}=require('../lib/pilotBackup');
(async()=>{
 if(runtimeConfig.dbDialect!=='postgres')throw Error('Pilot backup requires PostgreSQL.');
 if(validateRuntimeConfig(runtimeConfig).errors.length)throw Error('Runtime configuration is invalid.');
 const [action,file]=process.argv.slice(2);
 if(!['create','restore'].includes(action)||!file)throw Error('Usage: node scripts/pilot-backup.cjs create|restore <archive.ccbackup>');
 const {pgPool}=require('../database');const client=await pgPool.connect();
 try{
 const options={client,key:process.env.BACKUP_ENCRYPTION_KEY,documentsPath:path.resolve(process.env.PATIENT_DOCUMENT_STORAGE_PATH || path.join(__dirname,'../storage/patient-documents'))};
 const result=action==='create'?await backup({...options,output:path.resolve(file)}):await restore({...options,input:path.resolve(file),confirmEmpty:process.env.RESTORE_CONFIRM_EMPTY==='true'});
 console.log(JSON.stringify({event:'pilot_backup_'+action,status:'ok',...result}));
 }finally{client.release();await pgPool.end();}
})().catch(()=>{console.error('Pilot backup operation failed. Check configuration, archive authentication and an empty matching target.');process.exitCode=1;});
