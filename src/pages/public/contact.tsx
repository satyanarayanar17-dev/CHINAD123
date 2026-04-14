import React from 'react';
import { Phone, Mail, MapPin, AlertCircle, Clock, Building2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const OPD_TIMINGS = [
  { dept:'General Medicine & Specialties', days:'Mon – Sat', hours:'8:00 AM – 6:00 PM' },
  { dept:'Emergency & Casualty', days:'All Days', hours:'24 Hours' },
  { dept:'Pharmacy', days:'All Days', hours:'24 Hours' },
  { dept:'Radiology & Imaging', days:'Mon – Sat', hours:'7:00 AM – 8:00 PM' },
  { dept:'Laboratory Services (NABL)', days:'All Days', hours:'6:00 AM – 10:00 PM' },
  { dept:'Dental OPD', days:'Mon – Sat', hours:'9:00 AM – 4:00 PM' },
];

const CONTACTS = [
  { label:'Main Hospital (EPABX)', value:'+91 44 4741 1000', type:'phone' },
  { label:'Emergency / Casualty', value:'+91 44 4741 1800', type:'phone', urgent:true },
  { label:'Ambulance', value:'+91 44 4741 1999', type:'phone', urgent:true },
  { label:'Patient Services', value:'patientservices@chettinadhealthcity.com', type:'email' },
  { label:'Medical Records', value:'medicalrecords@chettinadhealthcity.com', type:'email' },
  { label:'IT / Portal Support', value:'itsupport@chettinadhealthcity.com', type:'email' },
];

export const Contact = () => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-14">
        <h1 className="text-4xl font-extrabold text-on-surface mb-4">Contact & Location</h1>
        <p className="text-lg text-on-surface-variant max-w-xl mx-auto font-medium">Chettinad Health City is located on Rajiv Gandhi Salai (OMR), 30 km south of Chennai city centre.</p>
      </div>

      <div className="bg-error text-white rounded-2xl p-6 mb-10 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-error/20">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center shrink-0"><AlertCircle size={28}/></div>
          <div>
            <p className="font-black text-xl">24 × 7 Emergency Services</p>
            <p className="text-white/80 text-sm mt-0.5">Trauma, Casualty, Cardiac Emergency — always open</p>
          </div>
        </div>
        <div className="flex flex-col items-center md:items-end gap-1">
          <span className="text-white/70 text-xs font-bold uppercase tracking-widest">Emergency Hotline</span>
          <span className="text-3xl font-black">+91 44 4741 1800</span>
          <span className="text-white/70 text-sm">Ambulance: +91 44 4741 1999</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-14">
        <div className="space-y-6">
          <h2 className="text-2xl font-extrabold text-on-surface">Get in Touch</h2>
          <div className="bg-white rounded-2xl border border-outline/30 shadow-sm divide-y divide-outline/20 overflow-hidden">
            {CONTACTS.map(c => (
              <div key={c.label} className={`flex items-center gap-4 px-5 py-4 ${c.urgent ? 'bg-error/5' : ''}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.urgent ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
                  {c.type==='phone' ? <Phone size={16}/> : <Mail size={16}/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{c.label}</p>
                  <p className={`font-bold text-sm mt-0.5 truncate ${c.urgent ? 'text-error' : 'text-on-surface'}`}>{c.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-outline/30 shadow-sm p-5 flex gap-4">
            <div className="w-9 h-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0 mt-0.5"><MapPin size={16}/></div>
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Address</p>
              <p className="font-bold text-on-surface text-sm">Chettinad Health City</p>
              <p className="text-sm text-on-surface-variant font-medium mt-1 leading-relaxed">
                Rajiv Gandhi Salai (OMR), Kelambakkam<br/>Chengalpattu District, Tamil Nadu – 603 103
              </p>
              <a href="https://maps.google.com/?q=Chettinad+Health+City+Kelambakkam" target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                Open in Google Maps <ArrowRight size={12}/>
              </a>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-outline/30 shadow-sm p-5">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">How to Reach</p>
            <ul className="space-y-2 text-sm text-on-surface-variant font-medium">
              <li className="flex items-start gap-2"><span className="text-primary font-bold shrink-0">By Car:</span> 30 km from Chennai city on OMR. Past Siruseri IT Park.</li>
              <li className="flex items-start gap-2"><span className="text-primary font-bold shrink-0">By Bus:</span> TNSTC buses from CMBT and Tambaram to Kelambakkam bus stand (500m walk).</li>
              <li className="flex items-start gap-2"><span className="text-primary font-bold shrink-0">By Metro:</span> Nearest metro: Sholinganallur. Auto/cab from there (~15 km).</li>
              <li className="flex items-start gap-2"><span className="text-primary font-bold shrink-0">By Air:</span> 35 km from Chennai International Airport via OMR.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold text-on-surface mb-4">OPD Timings</h2>
            <div className="bg-white rounded-2xl border border-outline/30 shadow-sm overflow-hidden">
              <div className="bg-primary/5 px-5 py-3 border-b border-outline/20 flex items-center gap-2">
                <Clock size={16} className="text-primary"/>
                <span className="font-bold text-sm text-on-surface">Department Hours</span>
              </div>
              <div className="divide-y divide-outline/20">
                {OPD_TIMINGS.map(t => (
                  <div key={t.dept} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{t.dept}</p>
                      <p className="text-xs text-on-surface-variant font-medium mt-0.5">{t.days}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${t.hours==='24 Hours' ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'}`}>
                      {t.hours}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-outline/30 shadow-sm p-6">
            <h3 className="font-extrabold text-on-surface text-lg mb-1">Enquiries & Appointments</h3>
            <p className="text-sm text-on-surface-variant font-medium mb-5">Contact our patient services team directly.</p>
            <div className="space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">By Phone</p>
                <p className="text-sm font-bold text-on-surface">+91 44 4741 1000</p>
                <p className="text-xs text-on-surface-variant mt-1">Mon – Sat, 8:00 AM – 6:00 PM</p>
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">By Email</p>
                <p className="text-sm font-bold text-on-surface">patientservices@chettinadhealthcity.com</p>
                <p className="text-xs text-on-surface-variant mt-1">Responses within one working day</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Building2 size={32} className="text-primary shrink-0"/>
          <div>
            <p className="font-extrabold text-on-surface text-lg">Already a patient at Chettinad?</p>
            <p className="text-sm text-on-surface-variant font-medium">Activate your digital portal to access appointments, prescriptions, and reports online.</p>
          </div>
        </div>
        <Link to="/patient/activate" className="shrink-0 bg-primary text-white font-bold px-7 py-3 rounded-xl hover:brightness-110 transition-all flex items-center gap-2">
          Activate Portal <ArrowRight size={16}/>
        </Link>
      </div>
    </div>
  );
};