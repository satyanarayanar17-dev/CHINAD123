const {test}=require('node:test'),assert=require('node:assert/strict');
const {Client}=require('pg'),crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {applyMigrations}=require('../migrations');const {backup,restore}=require('../lib/pilotBackup');
test('encrypted PostgreSQL/document recovery is exact, revokes sessions and refuses tampered or populated targets',async()=>{
 const url=new URL(process.env.TEST_POSTGRES_ADMIN_URL||'postgres://audit_owner@127.0.0.1:55432/postgres');
 if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Tests require a local database host.');
 const admin=new Client({connectionString:url.href});await admin.connect();
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-backup-proof-')),clients=[],names=[];
 async function emptyDatabase(){
  const name='cc_backup_'+crypto.randomUUID().replaceAll('-','');names.push(name);await admin.query(`CREATE DATABASE "${name}"`);
  const target=new URL(url);target.pathname='/'+name;const client=new Client({connectionString:target.href});await client.connect();clients.push(client);
  await applyMigrations({dialect:'postgres',run:async(sql,params=[])=>client.query(sql.replace(/\?/g,(()=>{let i=0;return()=>'$'+(++i);})()),params),all:async(sql,params=[]) => (await client.query(sql.replace(/\?/g,(()=>{let i=0;return()=>'$'+(++i);})()),params)).rows});
  return client;
 }
 try{
  const source=await emptyDatabase(),target=await emptyDatabase(),tamperTarget=await emptyDatabase();
  const srcDocs=path.join(root,'source-documents');await fs.mkdir(srcDocs);
  const documentKey=crypto.randomBytes(32).toString('hex'),document=Buffer.from('%PDF-1.4\nSynthetic recovery document only.\n%%EOF');await fs.writeFile(path.join(srcDocs,documentKey),document);
  await source.query("INSERT INTO patients (id,mrn,name,phone,dob,gender,allergies,allergy_review_status,__v) VALUES ('p','SYN-RECOVERY','Synthetic Recovery Patient','+919000009881','1990-01-01','Female','Synthetic allergy','RECORDED',7)");
  await source.query("INSERT INTO users (id,name,role,patient_id,is_active) VALUES ('u','Synthetic Patient','PATIENT','p',1),('doc','Synthetic Doctor','DOCTOR',NULL,1)");
  await source.query("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,assigned_doctor_id,is_discharged) VALUES ('enc','p','DISCHARGED','DISCHARGED','doc',1)");
  await source.query("INSERT INTO clinical_notes (id,encounter_id,draft_content,status,author_id,created_at,updated_at,__v) VALUES ('note','enc','{}','FINALIZED','doc','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z',4)");
  await source.query("INSERT INTO patient_documents (id,patient_id,uploaded_by,document_type,title,original_filename,mime_type,size_bytes,storage_provider,storage_key,clinical_date,created_at,updated_at) VALUES ('document','p','u','LAB_REPORT','Synthetic report','synthetic.pdf','application/pdf',$1,'local-private',$2,'2026-10-01','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')",[document.length,documentKey]);
  await source.query("INSERT INTO refresh_tokens (id,user_id,expires_at,revoked,account_type,session_key) VALUES ('hash','u','2030-01-01T00:00:00.000Z',0,'PATIENT','session')");
  await source.query("INSERT INTO sms_outbox (id,patient_id,code,context,status,attempts,next_attempt_at,created_at) VALUES ('sms','p','FOLLOW_UP_REMINDER','{}','PENDING',0,'2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')");
  const key=crypto.randomBytes(32).toString('hex'),archive=path.join(root,'snapshot.ccbackup');
  await backup({client:source,documentsPath:srcDocs,output:archive,key});
  const raw=await fs.readFile(archive);assert.ok(!raw.includes(Buffer.from('Synthetic Recovery Patient')));assert.equal((await fs.stat(archive)).mode&0o777,0o600);
  await assert.rejects(backup({client:source,documentsPath:srcDocs,output:archive,key}));
  const result=await restore({client:target,documentsPath:path.join(root,'restored-documents'),input:archive,key,confirmEmpty:true});assert.equal(result.files,1);
  assert.equal((await target.query("SELECT __v FROM patients WHERE id='p'")).rows[0].__v,7);assert.equal((await target.query("SELECT __v FROM clinical_notes WHERE id='note'")).rows[0].__v,4);
  assert.deepEqual(await fs.readFile(path.join(root,'restored-documents',documentKey)),document);
  assert.equal((await target.query('SELECT revoked FROM refresh_tokens')).rows[0].revoked,1);assert.equal((await target.query('SELECT status FROM sms_outbox')).rows[0].status,'FAILED');
  await assert.rejects(restore({client:target,documentsPath:path.join(root,'restored-documents'),input:archive,key,confirmEmpty:true}),/contains records/);
  const damaged=Buffer.from(raw);damaged[damaged.length-1]^=1;const bad=path.join(root,'tampered.ccbackup');await fs.writeFile(bad,damaged);
  await assert.rejects(restore({client:tamperTarget,documentsPath:path.join(root,'bad-documents'),input:bad,key,confirmEmpty:true}));
  assert.equal((await tamperTarget.query('SELECT count(*)::int AS n FROM patients')).rows[0].n,0);
  assert.equal((await fs.readdir(root)).filter(n=>n.startsWith('bad-documents')).length,0);
  await assert.rejects(restore({client:tamperTarget,documentsPath:path.join(root,'bad-documents'),input:archive,key:crypto.randomBytes(32).toString('hex'),confirmEmpty:true}));
  assert.equal((await tamperTarget.query('SELECT count(*)::int AS n FROM patients')).rows[0].n,0);
 }finally{for(const c of clients)await c.end();for(const name of names)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();await fs.rm(root,{recursive:true,force:true});}
});
