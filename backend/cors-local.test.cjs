const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-local-cors-'));
Object.assign(process.env,{NODE_ENV:'development',APP_ENV:'local_dev',DB_DIALECT:'sqlite',SQLITE_PATH:path.join(root,'fixture.db'),CORS_ORIGIN:'https://approved-demo.invalid',JWT_SECRET:'SyntheticLocalCorsKey2026Only12345',OPD_NOTIFICATION_WORKER:'false'});
const request=require('supertest'),app=require('./server'),db=require('./database');
after(async()=>{await new Promise(resolve=>db.db.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
test('a configured development service rejects arbitrary credentialed origins',async()=>{
 for(const origin of ['https://attacker.invalid','http://localhost:5173']){
  const response=await request(app).options('/api/v1/auth/opd/config').set('Origin',origin).set('Access-Control-Request-Method','GET');assert.equal(response.status,403);assert.equal(response.headers['access-control-allow-origin'],undefined);
 }
 const allowed=await request(app).options('/api/v1/auth/opd/config').set('Origin','https://approved-demo.invalid').set('Access-Control-Request-Method','GET');assert.equal(allowed.status,204);assert.equal(allowed.headers['access-control-allow-origin'],'https://approved-demo.invalid');
 assert.equal((await request(app).get('/api/v1/auth/opd/config')).status,200);
});
