const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('demo seed uses real private files and preserves existing records on restart',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-demo-proof-'));const env={...process.env,NODE_ENV:'development',APP_ENV:'local_dev',SQLITE_PATH:path.join(root,'fixture.db'),PATIENT_DOCUMENT_STORAGE_PATH:path.join(root,'documents'),CORS_ORIGIN:'http://localhost:5173',JWT_SECRET:'SyntheticDemoFixtureProofKey2026Only',OPD_DEMO_OTP:'true',DB_DIALECT:'sqlite',OPD_NOTIFICATION_WORKER:'false'};
 try{
  let seed=spawnSync(process.execPath,[path.resolve(__dirname,'../opd/demo.cjs')],{env,encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
  const files=fs.readdirSync(path.join(root,'documents'));assert.equal(files.length,1);assert.match(files[0],/^[a-f0-9]{64}$/);assert.ok(fs.readFileSync(path.join(root,'documents',files[0])).includes(Buffer.from('/Count 1')));
  const before=fs.readFileSync(env.SQLITE_PATH);seed=spawnSync(process.execPath,[path.resolve(__dirname,'../opd/demo.cjs')],{env,encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);assert.ok(seed.stdout.includes('Existing demo records preserved'));assert.deepEqual(fs.readFileSync(env.SQLITE_PATH),before);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
