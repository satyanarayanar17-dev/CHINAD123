import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, HeartPulse, Clock, ArrowRight, Star, Phone, Award } from 'lucide-react';

const STATS = [
  { value: '1500+', label: 'Beds' },
  { value: '200+', label: 'Specialist Doctors' },
  { value: '30+', label: 'Departments' },
  { value: '24/7', label: 'Emergency Care' },
];

const DEPARTMENTS = [
  { name: 'Cardiology & Cardiac Surgery', desc: 'Advanced cardiac care including interventional cardiology and electrophysiology.' },
  { name: 'Neurology & Neurosurgery', desc: 'Comprehensive brain, spine, and nervous system diagnosis and surgery.' },
  { name: 'Oncology', desc: 'Medical, surgical, and radiation oncology with state-of-the-art chemotherapy units.' },
  { name: 'Orthopaedics', desc: 'Joint replacement, sports medicine, and trauma care.' },
  { name: 'Obstetrics & Gynaecology', desc: "Maternity, high-risk pregnancy, and women's health services." },
  { name: 'Nephrology & Urology', desc: 'Kidney disease management, dialysis, and urological surgery.' },
];

export const Home = () => (
  <div className="w-full flex flex-col">
    <section className="relative w-full bg-gradient-to-br from-primary/10 via-white to-white pt-20 pb-28 overflow-hidden border-b border-primary/10">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-primary/5 blur-[140px] rounded-full pointer-events-none" style={{ transform: 'translate(20%,-20%)' }} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-primary/20 text-primary font-bold text-xs mb-6 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Digital Patient Portal — Now Live
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-on-surface tracking-tight leading-[1.1] mb-6">
            Chettinad Health City
          </h1>
          <p className="text-xl text-on-surface-variant font-medium leading-relaxed mb-4">
            A NABH-accredited 1500-bed multi-specialty hospital delivering world-class healthcare at Kelambakkam, Chennai.
          </p>
          <p className="text-base text-on-surface-variant mb-10">
            Chettinad Care is our unified digital platform — bridging patients, clinicians, and administrators in a single secure environment.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/patient/activate" className="bg-primary text-white font-bold px-8 py-4 rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 text-base shadow-lg shadow-primary/20">
              Activate Patient Portal <ArrowRight size={18} />
            </Link>
            <Link to="/specialties" className="bg-white text-on-surface border-2 border-outline px-8 py-4 rounded-xl hover:border-primary hover:bg-primary/5 transition-all font-bold text-center text-base">
              View Specialties
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {STATS.map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-6 border border-outline/30 shadow-sm hover:shadow-md transition-shadow text-center">
              <div className="text-4xl font-black text-primary mb-1">{s.value}</div>
              <div className="text-sm font-semibold text-on-surface-variant">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="bg-primary py-5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center gap-8 text-white/90 text-sm font-semibold">
        {['NABH Accredited','ISO 9001:2015 Certified','JCI Standards','NABL Accredited Laboratory'].map(t => (
          <span key={t} className="flex items-center gap-2"><Award size={16}/>{t}</span>
        ))}
      </div>
    </section>

    <section className="py-20 bg-white w-full border-b border-outline/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-on-surface mb-3">Clinical Centres of Excellence</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto font-medium">Subspecialty care delivered by experienced clinicians using advanced diagnostic and surgical technology.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {DEPARTMENTS.map(dep => (
            <div key={dep.name} className="bg-surface-container rounded-2xl p-6 border border-outline/30 hover:shadow-lg hover:border-primary/30 transition-all group">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <HeartPulse size={20} className="text-primary" />
              </div>
              <h3 className="font-bold text-on-surface mb-2 group-hover:text-primary transition-colors">{dep.name}</h3>
              <p className="text-sm text-on-surface-variant font-medium leading-relaxed">{dep.desc}</p>
              <Link to="/specialties" className="mt-4 text-xs font-bold text-primary flex items-center gap-1 hover:gap-2 transition-all">
                Learn More <ArrowRight size={12}/>
              </Link>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link to="/specialties" className="inline-flex items-center gap-2 text-primary font-bold border-2 border-primary px-8 py-3 rounded-xl hover:bg-primary hover:text-white transition-all">
            View All Departments <ArrowRight size={16}/>
          </Link>
        </div>
      </div>
    </section>

    <section className="py-20 bg-surface-container-low w-full">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-extrabold text-on-surface mb-4">Access Your Health Records in 3 Steps</h2>
        <p className="text-on-surface-variant font-medium mb-14 max-w-xl mx-auto">Chettinad Care gives patients secure digital access to appointments, prescriptions, and laboratory reports.</p>
        <div className="flex flex-col md:flex-row gap-6 relative items-start justify-center">
          <div className="hidden md:block absolute top-8 left-[18%] w-[64%] border-t-2 border-dashed border-primary/30" />
          {[
            { step:'1', title:'Register at the Hospital', desc:'Visit OPD reception with a valid ID. Our staff will issue your Unique Health ID (UHID).' },
            { step:'2', title:'Receive Activation Code', desc:'Your treating doctor or nurse will generate a one-time PIN linked to your UHID.' },
            { step:'3', title:'Set Up Your Portal', desc:'Visit /patient/activate, enter your UHID and PIN, and set your permanent password.' },
          ].map(s => (
            <div key={s.step} className="bg-white p-8 rounded-2xl shadow-sm border border-outline/30 relative z-10 w-full md:w-1/3 text-center">
              <div className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center font-black text-xl mb-5 mx-auto shadow-md shadow-primary/20">{s.step}</div>
              <h4 className="font-bold text-on-surface text-base mb-2">{s.title}</h4>
              <p className="text-sm text-on-surface-variant font-medium">{s.desc}</p>
            </div>
          ))}
        </div>
        <Link to="/patient/activate" className="inline-flex items-center gap-2 mt-12 bg-primary text-white font-bold px-8 py-4 rounded-xl hover:brightness-110 transition-all shadow-md shadow-primary/20">
          Activate My Portal <ArrowRight size={16}/>
        </Link>
      </div>
    </section>

    <section className="bg-error py-8 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0"><Phone size={22}/></div>
          <div>
            <p className="font-black text-lg">24 × 7 Emergency Services</p>
            <p className="text-white/80 text-sm">Casualty and Trauma Centre — Chettinad Health City Campus</p>
          </div>
        </div>
        <div className="text-3xl font-black tracking-tight">+91 44 4741 1000</div>
      </div>
    </section>

    <section className="py-20 bg-white w-full">
      <div className="max-w-5xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-extrabold text-on-surface mb-12">Why Patients Trust Chettinad</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: <ShieldCheck size={28} className="text-primary"/>, title:'NABH Accredited', desc:'Our quality systems meet the National Accreditation Board for Hospitals standards for patient safety and care quality.' },
            { icon: <Star size={28} className="text-amber-500"/>, title:'30+ Years of Service', desc:'Chettinad Health City has served generations of families across Tamil Nadu and neighbouring states.' },
            { icon: <Clock size={28} className="text-tertiary"/>, title:'Round-the-Clock Care', desc:'Emergency medicine, ICU, and pharmacy services operate 24 hours a day, every day of the year.' },
          ].map(card => (
            <div key={card.title} className="p-8 bg-surface-container rounded-2xl border border-outline/30 flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center mb-5">{card.icon}</div>
              <h3 className="font-bold text-on-surface text-lg mb-3">{card.title}</h3>
              <p className="text-sm text-on-surface-variant font-medium leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  </div>
);