'use strict';
const fs = require('node:fs/promises');
const {createReadStream,createWriteStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Readable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const zlib = require('node:zlib');
const readline = require('node:readline');
const MAGIC = Buffer.from('CCBACK01');
const quote = value => '"'+value.replaceAll('"','""')+'"';
const keyBuffer = value => { if (!/^[a-f0-9]{64}$/i.test(value || '')) throw Error('BACKUP_ENCRYPTION_KEY must be a 32-byte hexadecimal key.'); return Buffer.from(value,'hex'); };
async function schema(client) {
  const columns=(await client.query("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const constraints=(await client.query("SELECT c.conrelid::regclass::text AS table_name,c.conname,pg_get_constraintdef(c.oid) AS definition,c.contype,c.condeferrable,c.condeferred FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY table_name,c.conname")).rows;
  return {columns,constraints,tables:[...new Set(columns.map(c=>c.table_name))]};
}
const fingerprint = shape => crypto.createHash('sha256').update(JSON.stringify({columns:shape.columns,constraints:shape.constraints})).digest('hex');
const line = data => JSON.stringify(data)+'\n';
async function *rows(client,table) {
  await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT * FROM ${quote(table)}`);
  try { for(;;) { const result=await client.query('FETCH 250 FROM backup_rows'); if(!result.rows.length)break; for(const row of result.rows)yield row; } }
  finally { await client.query('CLOSE backup_rows'); }
}
async function backup({client,documentsPath,output,key}) {
  // Use a fresh nonce for each archive.
  const iv=crypto.randomBytes(12);
  const encrypt=crypto.createCipheriv('aes-256-gcm',keyBuffer(key),iv);
  const partial=output+'.partial-'+crypto.randomUUID();
  await fs.mkdir(path.dirname(output),{recursive:true,mode:0o700});
  const handle=await fs.open(partial,'wx',0o600);
  await handle.write(Buffer.concat([MAGIC,iv]));await handle.close();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const shape=await schema(client);
    async function *contents() {
      yield line({kind:'manifest',format:1,created_at:new Date().toISOString(),schema:fingerprint(shape),tables:shape.tables});
      for(const table of shape.tables) for await(const row of rows(client,table)) yield line({kind:'row',table,row});
      if(shape.tables.includes('patient_documents')) {
        for await(const doc of rows(client,'patient_documents')) {
          if(doc.storage_provider!=='local-private' || !/^[a-f0-9]{64}$/.test(doc.storage_key)) throw Error('Unsupported private document storage provider or key.');
          const target=path.join(documentsPath,doc.storage_key), stat=await fs.lstat(target);
          if(!stat.isFile() || stat.isSymbolicLink() || stat.size!==doc.size_bytes) throw Error('A referenced document is missing or has changed.');
          yield line({kind:'file',key:doc.storage_key,size:stat.size});
          const hash=crypto.createHash('sha256');
          for await(const chunk of createReadStream(target,{highWaterMark:65536})) { hash.update(chunk); yield line({kind:'chunk',data:chunk.toString('base64')}); }
          yield line({kind:'file_end',sha256:hash.digest('hex')});
        }
      }
      yield line({kind:'end'});
    }
    await pipeline(Readable.from(contents()),zlib.createGzip(),encrypt,createWriteStream(partial,{flags:'a',mode:0o600}));
    await fs.appendFile(partial,encrypt.getAuthTag());
    await client.query('COMMIT');
    // Never silently overwrite an existing archive.
    await fs.link(partial,output);await fs.unlink(partial);
    return {format:1,tables:shape.tables.length};
  } catch(error) { await client.query('ROLLBACK').catch(()=>{});await fs.rm(partial,{force:true});throw error; }
}
async function restore({client,documentsPath,input,key,confirmEmpty=false}) {
  if(!confirmEmpty)throw Error('Restore requires explicit confirmation of an empty, isolated target.');
  const stat=await fs.stat(input);if(stat.size<36)throw Error('Invalid backup archive.');
  const archive=await fs.open(input,'r');
  const header=Buffer.alloc(20),tag=Buffer.alloc(16);
  await archive.read(header,0,20,0);await archive.read(tag,0,16,stat.size-16);await archive.close();
  if(!header.subarray(0,8).equals(MAGIC))throw Error('Unsupported backup format.');
  const decrypt=crypto.createDecipheriv('aes-256-gcm',keyBuffer(key),header.subarray(8));decrypt.setAuthTag(tag);
  const source=createReadStream(input,{start:20,end:stat.size-17});
  const decoded=zlib.createGunzip();
  let pump;
  const staging=documentsPath+'.restore-'+crypto.randomUUID();
  await fs.mkdir(path.dirname(staging),{recursive:true,mode:0o700});
  await fs.mkdir(staging,{recursive:false,mode:0o700});
  let activeFile,manifest,ended=false,promoted=false,commitAttempted=false;
  await client.query('BEGIN');
  try {
    const shape=await schema(client);
    for(const table of shape.tables.filter(t=>!['schema_migrations','departments'].includes(t))) {
      const count=(await client.query(`SELECT 1 FROM ${quote(table)} LIMIT 1`)).rowCount;
      if(count)throw Error('Restore refused: target contains records.');
    }
    const departments=(await client.query('SELECT name,prefix FROM departments')).rows;
    if(departments.length>1 || departments.some(d=>d.name!=='Obstetrics & Gynaecology'||d.prefix!=='OBST'))throw Error('Restore refused: target contains configured departments.');
    try { if((await fs.readdir(documentsPath)).length)throw Error('Restore refused: target document directory is not empty.'); }
    catch(error){if(error.code!=='ENOENT')throw error;}
    const foreignKeys=shape.constraints.filter(c=>c.contype==='f');
    for(const c of foreignKeys)await client.query(`ALTER TABLE ${quote(c.table_name)} ALTER CONSTRAINT ${quote(c.conname)} DEFERRABLE INITIALLY DEFERRED`);
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query('DELETE FROM schema_migrations');
    // Migration 014 creates the canonical empty department with a fresh ID.
    // Replace only this proven baseline row, never an established target.
    await client.query('DELETE FROM departments');
    const tableColumns=new Map(shape.tables.map(t=>[t,shape.columns.filter(c=>c.table_name===t).map(c=>c.column_name)]));
    const files=new Set();
    const lines=readline.createInterface({input:decoded,crlfDelay:Infinity});
    // Start only after a consumer exists; authentication failures must also end iteration.
    pump=pipeline(source,decrypt,decoded);
    pump.catch(()=>lines.close());
    for await(const raw of lines) {
      if(raw.length>1024*1024)throw Error('Backup record is too large.');
      const item=JSON.parse(raw);
      if(!manifest) {
        if(item.kind!=='manifest'||item.format!==1||item.schema!==fingerprint(shape)||JSON.stringify(item.tables)!==JSON.stringify(shape.tables))throw Error('Backup schema does not match this release.');
        manifest=item;continue;
      }
      if(ended)throw Error('Unexpected records after backup end.');
      if(item.kind==='row' && !activeFile) {
        const columns=tableColumns.get(item.table);
        if(!columns||Object.keys(item.row).sort().join('|')!==[...columns].sort().join('|'))throw Error('Invalid table or columns.');
        await client.query(`INSERT INTO ${quote(item.table)} (${columns.map(quote).join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(c=>item.row[c]));
      } else if(item.kind==='file' && !activeFile) {
        if(!/^[a-f0-9]{64}$/.test(item.key)||!Number.isInteger(item.size)||item.size<1||item.size>10485760||files.has(item.key))throw Error('Invalid document metadata.');
        const doc=(await client.query('SELECT size_bytes,storage_provider FROM patient_documents WHERE storage_key=$1',[item.key])).rows[0];
        if(!doc||doc.size_bytes!==item.size||doc.storage_provider!=='local-private')throw Error('Document does not match restored metadata.');
        files.add(item.key);activeFile={handle:await fs.open(path.join(staging,item.key),'wx',0o600),hash:crypto.createHash('sha256'),size:item.size,written:0};
      } else if(item.kind==='chunk' && activeFile) {
        if(typeof item.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))throw Error('Invalid document chunk.');
        const chunk=Buffer.from(item.data,'base64');activeFile.written+=chunk.length;
        if(activeFile.written>activeFile.size)throw Error('Document exceeds declared length.');
        activeFile.hash.update(chunk);await activeFile.handle.write(chunk);
      } else if(item.kind==='file_end' && activeFile) {
        await activeFile.handle.close();activeFile.handle=null;
        if(activeFile.written!==activeFile.size||activeFile.hash.digest('hex')!==item.sha256)throw Error('Document checksum mismatch.');
        activeFile=null;
      } else if(item.kind==='end' && !activeFile)ended=true;
      else throw Error('Invalid backup record sequence.');
    }
    await pump; // Authenticated decryption must finish before any commit or file promotion.
    if(!ended)throw Error('Incomplete archive.');
    const expected=(await client.query('SELECT count(*)::int AS count FROM patient_documents')).rows[0].count;
    if(files.size!==expected)throw Error('Some referenced documents are missing.');
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    for(const c of foreignKeys)await client.query(`ALTER TABLE ${quote(c.table_name)} ALTER CONSTRAINT ${quote(c.conname)} ${c.condeferrable?'DEFERRABLE':'NOT DEFERRABLE'} INITIALLY ${c.condeferred?'DEFERRED':'IMMEDIATE'}`);
    for(const column of shape.columns.filter(c=>c.column_default?.startsWith('nextval('))) {
      await client.query(`SELECT setval(pg_get_serial_sequence($1,$2),GREATEST(COALESCE((SELECT MAX(${quote(column.column_name)}) FROM ${quote(column.table_name)}),0),1),EXISTS(SELECT 1 FROM ${quote(column.table_name)}))`,[column.table_name,column.column_name]);
    }
    // Recovery requires fresh sign-in and human review of old reminder jobs.
    await client.query('UPDATE refresh_tokens SET revoked=1');
    await client.query('UPDATE patient_otps SET consumed=1');
    await client.query("UPDATE sms_outbox SET status='FAILED' WHERE status!='SENT'");
    await fs.rmdir(documentsPath).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await fs.rename(staging,documentsPath);promoted=true;
    commitAttempted=true;await client.query('COMMIT');
    return {format:1,files:files.size,tables:shape.tables.length};
  }catch(error){source.destroy();decoded.destroy();await pump?.catch(()=>{});await activeFile?.handle?.close().catch(()=>{});await client.query('ROLLBACK').catch(()=>{});if(!commitAttempted)await fs.rm(promoted?documentsPath:staging,{recursive:true,force:true});throw error;}
}
module.exports={backup,restore,schema};
