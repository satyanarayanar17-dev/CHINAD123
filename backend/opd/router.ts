import { Router } from 'express';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { db, transaction, endpoint, parse, text, date, profileSchema, now, day, id, fail, roles, actor, patientAccess, pilotDepartment, enforcePilotDepartment, event, audit, createPatient } from './core.ts';
import type { Staff, Department, Schedule, Doctor, Patient, Dashboard, QueueEntry, Appointment, Notification } from '../../src/opd/types.ts';
import * as scheduling from './scheduling.ts';
import * as clinical from './clinical.ts';
const require = createRequire(import.meta.url);
const { requireAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
export const router = Router();
router.use(requireAuth);
router.get('/session', endpoint(async (req,res) => res.json(await actor(req))));
router.get('/directory', endpoint(async (_req,res) => {
  const pilot = await pilotDepartment(db);
  const departments = await db.all<Department>(`SELECT * FROM departments${pilot ? ' WHERE id=?' : ''} ORDER BY name`,pilot ? [pilot.id] : []);
  const doctors = await db.all<Doctor>(`SELECT id,name,role,department FROM users WHERE role='DOCTOR' AND is_active=1${pilot ? ' AND department=?' : ''} ORDER BY name`,pilot ? [pilot.name] : []);
  const schedules = await db.all<Schedule>(`SELECT * FROM practitioner_schedules${pilot ? ' WHERE department_id=?' : ''} ORDER BY weekday`,pilot ? [pilot.id] : []);
  res.json({ departments, doctors: doctors.map(d => ({ ...d, schedules: schedules.filter(s=>s.doctor_id===d.id) })) });
}));
router.get('/slots', endpoint(async (req,res) => res.json(await scheduling.slots(parse(text,req.query.doctor_id), parse(date,req.query.date)))));
router.post('/schedules', endpoint(async (req,res) => res.json(await scheduling.saveSchedule(req))));
router.get('/unavailability', endpoint(async (req,res) => { 
  roles(req,['ADMIN', 'DOCTOR']); 
  let q = 'SELECT * FROM practitioner_unavailability WHERE date>=?';
  const params: string[] = [day()];
  if (req.user.role === 'DOCTOR') {
    q += ' AND doctor_id=?';
    params.push(req.user.id);
  }
  q += ' ORDER BY date';
  res.json(await db.all(q, params)); 
}));
router.post('/unavailability', endpoint(async (req,res) => {
  roles(req,['ADMIN', 'DOCTOR']); const value=parse(z.object({doctor_id:text,date,reason:text}),req.body);
  if (req.user.role === 'DOCTOR' && req.user.id !== value.doctor_id) fail('UNAUTHORIZED', 403);
  await transaction(async tx=>{
    if (tx.dialect==='postgres') await tx.get('SELECT id FROM users WHERE id=? FOR UPDATE',[value.doctor_id]);
    const start=new Date(`${value.date}T00:00:00+05:30`); const end=new Date(start.getTime()+86400000);
    if(await tx.get("SELECT id FROM appointments WHERE doctor_id=? AND scheduled_at>=? AND scheduled_at<? AND status IN ('CONFIRMED','CHECKED_IN')",[value.doctor_id,start.toISOString(),end.toISOString()])) fail('RESCHEDULE_BOOKINGS_FIRST',409);
    await tx.run('INSERT INTO practitioner_unavailability (id,doctor_id,date,reason) VALUES (?,?,?,?)',[id('leave'),value.doctor_id,value.date,value.reason]);
    await audit(tx,req,'DOCTOR_UNAVAILABLE',null,{doctor_id:value.doctor_id,date:value.date});
  });
  res.json({success:true});
}));
router.delete('/unavailability/:id',endpoint(async(req,res)=>{
  roles(req,['ADMIN', 'DOCTOR']);
  await transaction(async tx=>{
    const leave = await tx.get<{doctor_id: string}>('SELECT doctor_id FROM practitioner_unavailability WHERE id=?', [req.params.id]);
    if (!leave) fail('NOT_FOUND', 404);
    if (req.user.role === 'DOCTOR' && req.user.id !== leave!.doctor_id) return fail('UNAUTHORIZED', 403);
    await tx.run('DELETE FROM practitioner_unavailability WHERE id=?',[req.params.id]);
    await audit(tx,req,'DOCTOR_AVAILABILITY_RESTORED',null,{resource:String(req.params.id)});
  });
  res.json({success:true});
}));
router.get('/patients', endpoint(async(req,res)=>{
  roles(req,['ADMIN']);const search=String(req.query.search || '').slice(0,100);
  await audit(db,req,'PATIENT_DIRECTORY_ACCESSED');
  const limit = Math.min(parseInt(String(req.query.limit)) || 100, 500);
  const offset = parseInt(String(req.query.offset)) || 0;
  const results = await db.all<Patient>('SELECT * FROM patients WHERE LOWER(name) LIKE LOWER(?) OR phone LIKE ? OR mrn LIKE ? ORDER BY name, id LIMIT ? OFFSET ?',[`%${search}%`,`%${search}%`,`%${search}%`, limit, offset]);
  if (req.user.department !== 'MEDICAL_RECORDS') {
    res.json(results.map(p => ({
      ...p,
      phone: p.phone ? `***-***-${p.phone.slice(-4)}` : p.phone,
      mrn: p.mrn ? `***-${p.mrn.slice(-4)}` : p.mrn,
      dob: p.dob ? p.dob.substring(0, 4) + '-**-**' : p.dob
    })));
  } else {
    res.json(results);
  }
}));
router.post('/patients',endpoint(async(req,res)=>{roles(req,['ADMIN']);res.status(201).json(await transaction(async tx=>{const patient=await createPatient(tx,req,req.body);await event(tx,req,patient.id,'PATIENT_REGISTERED');return patient;}));}));
router.get('/profile',endpoint(async(req,res)=>{roles(req,['PATIENT']);const user=await actor(req);res.json(await patientAccess(req,user.patient_id!));}));
router.patch('/patients/:id',endpoint(async(req,res)=>{
  roles(req,['PATIENT','ADMIN']); const data=parse(profileSchema,req.body.data);
  await transaction(async tx=>{
    const patient=await patientAccess(req,String(req.params.id),tx,false);
    if(patient.__v!==req.body.__v) fail('STALE_STATE',409);
    // Patient mobile is their login identity. Changing it requires a separate verified identity workflow.
    if(data.phone!==patient.phone) fail('MOBILE_CHANGE_REQUIRES_VERIFICATION');
    const fields=Object.keys(data); const changed=await tx.run(`UPDATE patients SET ${fields.map(f=>`${f}=?`).join(',')},__v=__v+1 WHERE id=? AND __v=?`,[...Object.values(data),patient.id,patient.__v]);
    if(!changed.changes) fail('STALE_STATE',409);
    await tx.run('UPDATE users SET name=? WHERE patient_id=?',[data.name,patient.id]);
    await event(tx,req,patient.id,'PROFILE_UPDATED');
  });res.json({success:true});
}));
router.get('/appointments',endpoint(async(req,res)=>res.json(await scheduling.appointments(req))));
router.post('/appointments',endpoint(async(req,res)=>res.status(201).json(await transaction(tx=>scheduling.book(tx,req,req.body)))));
router.post('/appointments/:id/confirm',endpoint(async(req,res)=>res.json(await scheduling.confirmRequest(req,String(req.params.id)))));
router.post('/appointments/:id/check-in',endpoint(async(req,res)=>res.json(await scheduling.checkIn(req))));
router.post('/appointments/:id/:action',endpoint(async(req,res)=>res.json(await scheduling.changeAppointment(req,String(req.params.action)))));
router.get('/queue',endpoint(async(req,res)=>res.json(await scheduling.queue(req))));
router.post('/encounters/:id/start-triage',endpoint(async(req,res)=>res.json(await clinical.transition(req,'TRIAGE'))));
router.post('/encounters/:id/triage',endpoint(async(req,res)=>res.json(await clinical.triage(req))));
router.post('/encounters/:id/call',endpoint(async(req,res)=>res.json(await clinical.transition(req,'DOCTOR_READY'))));
router.post('/encounters/:id/start',endpoint(async(req,res)=>res.json(await clinical.transition(req,'CONSULTATION'))));
router.put('/encounters/:id/consultation',endpoint(async(req,res)=>res.json(await clinical.saveConsultation(req,false))));
router.post('/encounters/:id/complete',endpoint(async(req,res)=>res.json(await clinical.saveConsultation(req,true))));
router.post('/encounters/:id/amend',endpoint(async(req,res)=>res.json(await clinical.amend(req))));
router.post('/encounters/:id/labs',endpoint(async(req,res)=>res.status(201).json(await clinical.orderLab(req))));
router.get('/patients/:id/record',endpoint(async(req,res)=>res.json(await clinical.record(req,String(req.params.id)))));
router.get('/patients/:id/journey',endpoint(async(req,res)=>res.json(await clinical.journey(req,String(req.params.id)))));
router.get('/labs',endpoint(async(req,res)=>res.json(await clinical.labs(req))));
router.post('/labs/:id/:action',endpoint(async(req,res)=>res.json(await clinical.changeLab(req,String(req.params.action)))));
router.get('/catalogues',endpoint(async(req,res)=>{
  roles(req,['DOCTOR','ADMIN']);res.json({drugs:await db.all('SELECT * FROM drug_catalog WHERE active=1 ORDER BY name'),diagnoses:await db.all('SELECT * FROM diagnosis_catalog ORDER BY name'),tests:await db.all('SELECT * FROM lab_test_catalog WHERE active=1 ORDER BY name')});
}));
router.post('/catalogues/:kind',endpoint(async(req,res)=>{
  roles(req,['ADMIN']);const kind=String(req.params.kind);
  await transaction(async tx=>{
    if(kind==='departments'){const v=parse(z.object({name:text,prefix:z.string().regex(/^[A-Z]{2,6}$/)}),req.body);const pilot=await pilotDepartment(tx);if(pilot&&(v.name!==pilot.name||v.prefix!==pilot.prefix))fail('PILOT_DEPARTMENT_ONLY',422);await tx.run('INSERT INTO departments (id,name,prefix) VALUES (?,?,?)',[id('dept'),v.name,v.prefix]);}
    else if(kind==='drugs'){const v=parse(z.object({name:text,strength:text,form:text,route:text}),req.body);await tx.run('INSERT INTO drug_catalog (id,name,strength,form,route) VALUES (?,?,?,?,?)',[id('drug'),v.name,v.strength,v.form,v.route]);}
    else if(kind==='diagnoses'){const v=parse(z.object({name:text}),req.body);await tx.run('INSERT INTO diagnosis_catalog (id,name) VALUES (?,?)',[id('diagnosis'),v.name]);}
    else if(kind==='tests'){const v=parse(z.object({name:text,code:text,department:text,unit:z.string().max(60),reference_range:text}),req.body);await tx.run('INSERT INTO lab_test_catalog (id,name,code,department,unit,reference_range) VALUES (?,?,?,?,?,?)',[id('test'),v.name,v.code,v.department,v.unit,v.reference_range]);}
    else fail('INVALID_CATALOGUE');
    await audit(tx,req,'CATALOGUE_ITEM_CREATED',null,{kind});
  });res.status(201).json({success:true});
}));
router.get('/staff',endpoint(async(req,res)=>{roles(req,['ADMIN']);const pilot=await pilotDepartment(db);res.json(await db.all<Staff>(`SELECT id,name,role,department,is_active,must_change_password FROM users WHERE role!='PATIENT'${pilot?" AND (role='ADMIN' OR department=?)":''} ORDER BY name`,pilot?[pilot.name]:[]));}));
router.post('/staff',endpoint(async(req,res)=>{
  roles(req,['ADMIN']);const data=parse(z.object({id:z.string().regex(/^[a-zA-Z0-9_.-]{3,60}$/),name:text,role:z.enum(['ADMIN','NURSE','DOCTOR']),department:text,password:z.string().min(12).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9]/)}),req.body);
  const hash=await bcrypt.hash(data.password,12);
  await transaction(async tx=>{
    const department=await tx.get<Department>('SELECT * FROM departments WHERE name=?',[data.department]);if(!department) fail('INVALID_DEPARTMENT');await enforcePilotDepartment(tx,department!.id);
    await tx.run('INSERT INTO users (id,name,role,department,password_hash,must_change_password,is_active,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)',[data.id,data.name,data.role,data.department,hash,now(),now()]);
    await audit(tx,req,'STAFF_CREATED',null,{id:data.id,role:data.role,department:data.department});
  });res.status(201).json({success:true});
}));

router.put('/staff/:id', endpoint(async (req, res) => {
  roles(req, ['ADMIN']);
  const data = parse(z.object({
    name: text,
    role: z.enum(['ADMIN', 'NURSE', 'DOCTOR']),
    department: text
  }), req.body);
  
  await transaction(async tx => {
    const department = await tx.get('SELECT * FROM departments WHERE name=?', [data.department]);
    if (!department) fail('INVALID_DEPARTMENT');
    await enforcePilotDepartment(tx, (department as any).id);
    
    const changed = await tx.run(
      "UPDATE users SET name=?, role=?, department=?, updated_at=? WHERE id=? AND role!='PATIENT'",
      [data.name, data.role, data.department, now(), req.params.id]
    );
    if (!changed.changes) fail('NOT_FOUND', 404);
    await audit(tx, req, 'STAFF_PROFILE_UPDATED', null, { id: req.params.id, ...data });
  });
  res.json({ success: true });
}));

router.patch('/staff/:id',endpoint(async(req,res)=>{
  roles(req,['ADMIN']);const active=parse(z.boolean(),req.body.active);
  if(req.params.id===req.user.id) fail('CANNOT_DISABLE_SELF');
  await transaction(async tx=>{
    const changed=await tx.run("UPDATE users SET is_active=?,updated_at=? WHERE id=? AND role!='PATIENT'",[active?1:0,now(),req.params.id]);
    if(!changed.changes) fail('NOT_FOUND',404);
    if(!active) await tx.run('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?',[req.params.id]);
    await audit(tx,req,'STAFF_ACCESS_CHANGED',null,{id:String(req.params.id),active});
  });res.json({success:true});
}));
router.get('/notifications',endpoint(async(req,res)=>{
  const limit = Math.min(parseInt(String(req.query.limit)) || 100, 500);
  const offset = parseInt(String(req.query.offset)) || 0;
  const rows=await db.all<Notification & {context:string}>('SELECT * FROM opd_notifications WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',[req.user.id, limit, offset]);
  res.json(rows.map(r=>({...r,context:JSON.parse(r.context)})));
}));
router.post('/notifications/read',endpoint(async(req,res)=>{await db.run('UPDATE opd_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',[now(),req.user.id]);res.json({success:true});}));
router.get('/audit',endpoint(async(req,res)=>{
  roles(req,['ADMIN']);
  const limit = Math.min(parseInt(String(req.query.limit)) || 200, 1000);
  const offset = parseInt(String(req.query.offset)) || 0;
  res.json(await db.all('SELECT id,timestamp,actor_id,patient_id,action,new_state FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]));
}));
router.get('/dashboard',endpoint(async(req,res)=>{
  roles(req,['ADMIN','DOCTOR', 'NURSE']);
  const dashboardUser=await actor(req);
  const pilot=await pilotDepartment(db);
  if(pilot&&dashboardUser.role==='DOCTOR'&&dashboardUser.department!==pilot.name)fail('PILOT_DEPARTMENT_ONLY',422);
  
  // Get all appointments to calculate requires_action, today, upcoming
  const allAppointments = await scheduling.appointments(req);
  const todayDate = day();
  const todayStart = new Date(`${todayDate}T00:00:00+05:30`).getTime();
  const todayEnd = todayStart + 86400000;
  
  const requiresAction = allAppointments.filter(a => (a.status as any) === 'PENDING_CONFIRMATION');
  const todayConfirmed = allAppointments.filter(a => (a.status === 'CONFIRMED' || a.status === 'CHECKED_IN' || (a.status as any) === 'READY_FOR_DOCTOR' || (a.status as any) === 'IN_TRIAGE' || (a.status as any) === 'IN_CONSULTATION') && new Date(a.scheduled_at).getTime() >= todayStart && new Date(a.scheduled_at).getTime() < todayEnd);
  const upcoming = allAppointments.filter(a => a.status === 'CONFIRMED' && new Date(a.scheduled_at).getTime() >= todayEnd);
  const appointments = allAppointments.filter(a => new Date(a.scheduled_at).getTime() >= todayStart && new Date(a.scheduled_at).getTime() < todayEnd);
  
  const queue=await scheduling.queue(req);
  const todayQueue=queue.filter(q=>q.date===day());
  const completed=await db.all<{doctor_id:string;department_id:string;checked_in_at:string;consultation_started_at:string;completed_at:string}>(`SELECT a.doctor_id,a.department_id,q.checked_in_at,q.consultation_started_at,e.completed_at FROM queue_entries q JOIN appointments a ON a.id=q.appointment_id JOIN encounters e ON e.id=q.encounter_id WHERE q.date=? AND q.status='COMPLETED' ${req.user.role==='DOCTOR'?'AND a.doctor_id=?':''}${pilot?' AND a.department_id=?':''}`,[day(),...(req.user.role==='DOCTOR'?[req.user.id]:[]),...(pilot?[pilot.id]:[])]);
  const average=(values:number[])=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;
  const wait=(q:{checked_in_at:string;consultation_started_at:string})=>Math.max(0,(new Date(q.consultation_started_at).getTime()-new Date(q.checked_in_at).getTime())/60000);
  const departments=await db.all<Department>(`SELECT * FROM departments${pilot?' WHERE id=?':''} ORDER BY name`,pilot?[pilot.id]:[]);
  const doctors=await db.all<Staff>(`SELECT id,name FROM users WHERE role='DOCTOR' AND is_active=1${pilot?' AND department=?':''}`,pilot?[pilot.name]:[]);
  const labs=await clinical.labs(req);
  const waitingForDoctor = queue.filter(q => (q.status as any) === 'READY_FOR_DOCTOR' || q.status === 'DOCTOR_READY').length;
  
  let securityAlerts = 0;
  if (req.user.role === 'ADMIN') {
    const alerts = await db.all(`SELECT id FROM audit_logs WHERE code = 'BREAK_GLASS_ACCESSED' AND timestamp >= ?`, [new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()]);
    securityAlerts = alerts.length;
  }

  const result:Dashboard={
    date:day(),
    requires_action: requiresAction.length,
    security_alerts: securityAlerts,
    today_confirmed: todayConfirmed.length,
    upcoming: upcoming.length,
    appointments:appointments.length,
    checked_in:todayQueue.length+completed.length,
    waiting: waitingForDoctor,
    triage:queue.filter(q=>q.status==='TRIAGE').length,
    consultation:queue.filter(q=>q.status==='CONSULTATION').length,
    completed:completed.length,
    no_shows:appointments.filter(a=>a.status==='NO_SHOW').length,
    average_wait:average(completed.map(wait)),
    results_pending:labs.filter(l=>l.status==='AVAILABLE').length,
    departments:departments.map(d=>{const q=queue.filter(q=>q.department_id===d.id);return{name:d.name,patients:appointments.filter(a=>a.department_id===d.id).length,waiting:q.length,average_wait:average(q.map(q=>q.wait_minutes)),longest_wait:q.length?Math.max(...q.map(q=>q.wait_minutes)):null};}),
    doctors:doctors.filter(d=>req.user.role==='ADMIN'||d.id===req.user.id).map(d=>({name:d.name,appointments:appointments.filter(a=>a.doctor_id===d.id).length,waiting:queue.filter(q=>q.doctor_id===d.id).length,completed:completed.filter(c=>c.doctor_id===d.id).length,average_consultation:average(completed.filter(c=>c.doctor_id===d.id).map(c=>(new Date(c.completed_at).getTime()-new Date(c.consultation_started_at).getTime())/60000))})),
  };
  res.json(result);
}));
