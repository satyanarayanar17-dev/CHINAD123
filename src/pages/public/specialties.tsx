import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';

const DEPARTMENTS = [
  { name:'Cardiology & Cardiac Surgery', tag:'Heart', color:'bg-red-50 text-red-700 border-red-100', accent:'text-red-600', head:'Consultant-led cardiac care team', services:['Interventional Cardiology (Angioplasty, Stenting)','Electrophysiology & Pacemaker Implantation','Echocardiography & Stress Testing','Coronary Artery Bypass Graft (CABG)','Valve Repair & Replacement','Paediatric Cardiac Surgery'] },
  { name:'Neurology & Neurosurgery', tag:'Brain & Spine', color:'bg-purple-50 text-purple-700 border-purple-100', accent:'text-purple-600', head:'Multidisciplinary neuro care team', services:['Stroke Care & Thrombolysis Unit','Epilepsy Monitoring & Surgery','Movement Disorders (Parkinson\'s, Tremor)','Brain Tumour Surgery','Spine Surgery & Minimally Invasive Procedures','Peripheral Nerve Surgery'] },
  { name:'Oncology', tag:'Cancer Care', color:'bg-teal-50 text-teal-700 border-teal-100', accent:'text-teal-600', head:'Integrated oncology program', services:['Medical Oncology & Chemotherapy','Radiation Oncology (Linear Accelerator)','Surgical Oncology','Haematology & Bone Marrow Transplant','Palliative Care','Cancer Genetic Counselling'] },
  { name:'Orthopaedics & Trauma', tag:'Bones & Joints', color:'bg-blue-50 text-blue-700 border-blue-100', accent:'text-blue-600', head:'Orthopaedic and trauma specialists', services:['Total Hip & Knee Replacement','Arthroscopic (Keyhole) Surgery','Sports Medicine & Rehabilitation','Spine Disorders & Disc Surgery','Fracture Care & Trauma Surgery','Paediatric Orthopaedics'] },
  { name:"Obstetrics & Gynaecology", tag:"Women's Health", color:'bg-pink-50 text-pink-700 border-pink-100', accent:'text-pink-600', head:'Women\'s health consultant team', services:['Antenatal & High-Risk Pregnancy Care','Infertility & IVF','Laparoscopic Gynaecological Surgery','Gynaecological Oncology','Urogynaecology & Pelvic Floor Repair','Neonatal Care (Level III NICU)'] },
  { name:'Nephrology & Renal Transplant', tag:'Kidney', color:'bg-amber-50 text-amber-700 border-amber-100', accent:'text-amber-600', head:'Renal medicine and transplant team', services:['Chronic Kidney Disease Management','Haemodialysis & Peritoneal Dialysis','Living and Cadaveric Renal Transplant','Glomerulonephritis & Autoimmune Kidney Disease','Hypertension & Metabolic Disorders','Urology & Endourology'] },
  { name:'Gastroenterology & GI Surgery', tag:'Digestive Health', color:'bg-green-50 text-green-700 border-green-100', accent:'text-green-600', head:'Digestive health specialists', services:['Diagnostic & Therapeutic Endoscopy','Liver Disease & Hepatology','Inflammatory Bowel Disease','Laparoscopic GI Surgery','Bariatric (Weight Loss) Surgery','Liver Transplant Programme'] },
  { name:'Pulmonology & Respiratory Medicine', tag:'Lungs', color:'bg-cyan-50 text-cyan-700 border-cyan-100', accent:'text-cyan-600', head:'Respiratory medicine consultant team', services:['Asthma & COPD Management','Interventional Bronchoscopy','Interstitial Lung Disease','Sleep Studies & CPAP Therapy','Pleural Disease Management','Thoracic Oncology'] },
  { name:'Paediatrics & Neonatology', tag:'Child Health', color:'bg-orange-50 text-orange-700 border-orange-100', accent:'text-orange-600', head:'Paediatric and neonatal care team', services:['General Paediatrics & Outpatient Clinics','Paediatric Intensive Care (PICU)','Neonatal ICU (Level III NICU)','Paediatric Neurology','Paediatric Surgery','Developmental & Behavioural Paediatrics'] },
  { name:'General Medicine & Internal Medicine', tag:'General', color:'bg-indigo-50 text-indigo-700 border-indigo-100', accent:'text-indigo-600', head:'Internal medicine consultant team', services:['Diabetes & Endocrinology','Infectious Diseases & Tropical Medicine','Rheumatology & Autoimmune Disorders','Geriatric Medicine','General Medical OPD & Follow-up','Preventive Health Screening'] },
  { name:'Psychiatry & Mental Health', tag:'Mental Wellness', color:'bg-violet-50 text-violet-700 border-violet-100', accent:'text-violet-600', head:'Behavioural health specialists', services:['Adult Psychiatry & Counselling','Child & Adolescent Psychiatry','De-addiction Services','Neuropsychiatry','Psychotherapy & Cognitive Behavioural Therapy','Inpatient Psychiatric Unit'] },
  { name:'Radiology & Medical Imaging', tag:'Diagnostics', color:'bg-slate-50 text-slate-700 border-slate-100', accent:'text-slate-600', head:'Radiology and imaging team', services:['3T MRI & CT Scan','Digital X-Ray & Fluoroscopy','Interventional Radiology','Mammography & Bone Densitometry','PET-CT (Nuclear Medicine)','Ultrasound & Doppler Studies'] },
];

export const Specialties = () => {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = DEPARTMENTS.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.tag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-on-surface mb-4">Clinical Departments</h1>
        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto font-medium">Chettinad Health City operates {DEPARTMENTS.length} departments supported by multidisciplinary specialist teams.</p>
      </div>

      <div className="relative max-w-md mx-auto mb-12">
        <Search size={18} className="absolute left-4 top-3.5 text-on-surface-variant"/>
        <input type="text" placeholder="Search departments…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 border border-outline rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all bg-white shadow-sm"/>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map(dep => (
          <div key={dep.name}
            className={`bg-white rounded-2xl border p-6 cursor-pointer transition-all hover:shadow-lg ${expanded===dep.name ? 'shadow-lg border-primary/30' : 'border-outline/30'}`}
            onClick={() => setExpanded(expanded===dep.name ? null : dep.name)}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border mb-3 ${dep.color}`}>{dep.tag}</span>
                <h2 className="font-bold text-on-surface text-lg leading-snug">{dep.name}</h2>
                <p className={`text-xs font-semibold mt-1 ${dep.accent}`}>{dep.head}</p>
              </div>
              <span className={`text-lg font-black ${dep.accent} shrink-0 mt-1`}>{expanded===dep.name ? '−' : '+'}</span>
            </div>
            {expanded===dep.name && (
              <div className="mt-5 pt-5 border-t border-outline/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Services Offered</p>
                <ul className="grid grid-cols-1 gap-2">
                  {dep.services.map(s => (
                    <li key={s} className="flex items-start gap-2 text-sm text-on-surface font-medium">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dep.accent}`} style={{background:'currentColor'}}/>
                      {s}
                    </li>
                  ))}
                </ul>
                <Link to="/contact" className={`mt-5 inline-flex items-center gap-1.5 text-sm font-bold ${dep.accent} hover:gap-2.5 transition-all`} onClick={e=>e.stopPropagation()}>
                  Book an Appointment <ArrowRight size={14}/>
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length===0 && <div className="text-center py-16 text-on-surface-variant font-medium">No departments match "{search}".</div>}

      <div className="mt-16 text-center bg-primary/5 border border-primary/20 rounded-2xl p-8">
        <h3 className="font-extrabold text-on-surface text-xl mb-3">Can't find your specialty?</h3>
        <p className="text-on-surface-variant font-medium mb-6">Contact our patient services team and we'll direct you to the right clinic.</p>
        <Link to="/contact" className="inline-flex items-center gap-2 bg-primary text-white font-bold px-7 py-3 rounded-xl hover:brightness-110 transition-all">
          Contact Us <ArrowRight size={16}/>
        </Link>
      </div>
    </div>
  );
};
