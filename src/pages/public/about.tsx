import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Star, Target, Users, Building2, GraduationCap } from 'lucide-react';

const MILESTONES = [
  { year:'1994', event:'Chettinad Health City founded at Kelambakkam on the Old Mahabalipuram Road, Chennai.' },
  { year:'2000', event:'Chettinad Medical College and Research Institute established, affiliated to The Tamil Nadu Dr. M.G.R. Medical University.' },
  { year:'2008', event:'Hospital expansion to 1500 beds with dedicated ICUs for Cardiac, Neuro, Neonatal, and Surgical care.' },
  { year:'2015', event:'NABH Accreditation achieved. NABL-accredited clinical laboratory commissioned.' },
  { year:'2020', event:'Dedicated COVID-19 care centre established. Telemedicine services launched.' },
  { year:'2024', event:'Chettinad Care digital platform initiated — staff operations digitised and patient portal launched.' },
];

export const About = () => (
  <div className="w-full max-w-5xl mx-auto px-4 py-16">
    <div className="text-center mb-16">
      <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight mb-4">About Chettinad Health City</h1>
      <p className="text-lg text-on-surface-variant max-w-2xl mx-auto font-medium">A premier academic medical centre and teaching hospital serving patients across South India since 1994.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
      {[
        { icon:<Target size={22}/>, title:'Mission', desc:"To provide affordable, accessible, and evidence-based healthcare to every patient, regardless of background, while training the next generation of compassionate clinicians." },
        { icon:<Star size={22}/>, title:'Vision', desc:"To be recognised as South India's leading academic medical centre — where clinical excellence, research, and education converge." },
        { icon:<BookOpen size={22}/>, title:'Values', desc:'Compassion, integrity, innovation, and inclusivity — at every patient interaction, every educational session, and every research endeavour.' },
      ].map(card => (
        <div key={card.title} className="bg-white rounded-2xl p-6 border border-outline/30 shadow-sm">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">{card.icon}</div>
          <h3 className="font-bold text-on-surface text-lg mb-2">{card.title}</h3>
          <p className="text-sm text-on-surface-variant font-medium leading-relaxed">{card.desc}</p>
        </div>
      ))}
    </div>

    <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-outline/30 mb-16">
      <h2 className="text-2xl font-extrabold text-on-surface mb-6">About the Institution</h2>
      <div className="space-y-5 text-on-surface-variant font-medium leading-relaxed">
        <p>Chettinad Hospital and Research Institute is a 1500-bed NABH-accredited multi-specialty hospital located at Kelambakkam, on the Rajiv Gandhi Salai (OMR), Chennai. The campus houses Chettinad Medical College and Research Institute, one of Tamil Nadu's premier medical schools affiliated to The Tamil Nadu Dr. M.G.R. Medical University.</p>
        <p>The hospital operates across more than 30 clinical departments including Cardiology, Neurology, Oncology, Nephrology, Orthopaedics, Obstetrics and Gynaecology, Paediatrics, and Emergency Medicine. Advanced facilities include Cardiac Catheterisation Laboratories, a Bone Marrow Transplant Unit, a Neonatal Intensive Care Unit, and a dedicated Cancer Centre.</p>
        <p>Chettinad Medical College trains MBBS, MD, MS, and super-specialty (DM/MCh) students under the guidance of over 200 faculty members. The institution holds an active ICMR-registered ethics committee and collaborates with national and international academic partners.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 pt-8 border-t border-outline/20">
        {[
          { icon:<Building2 size={20}/>, value:'1500+', label:'Beds' },
          { icon:<Users size={20}/>, value:'200+', label:'Specialists' },
          { icon:<GraduationCap size={20}/>, value:'30+', label:'Departments' },
          { icon:<Star size={20}/>, value:'NABH', label:'Accredited' },
        ].map(s => (
          <div key={s.label} className="text-center p-4 bg-surface-container rounded-xl border border-outline/30">
            <div className="flex justify-center text-primary mb-2">{s.icon}</div>
            <div className="text-2xl font-black text-on-surface">{s.value}</div>
            <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>

    <div className="mb-16">
      <h2 className="text-2xl font-extrabold text-on-surface mb-8 text-center">Our Journey</h2>
      <div className="relative border-l-2 border-primary/30 ml-4 space-y-8 pl-8">
        {MILESTONES.map(m => (
          <div key={m.year} className="relative">
            <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-primary border-4 border-white shadow" />
            <span className="text-xs font-black text-primary uppercase tracking-widest block mb-1">{m.year}</span>
            <p className="text-sm text-on-surface font-medium">{m.event}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 md:p-10">
      <h2 className="text-2xl font-extrabold text-on-surface mb-4">Chettinad Care — Digital Transformation</h2>
      <p className="text-on-surface-variant font-medium leading-relaxed mb-4">Chettinad Care is our institutional digital platform, designed to eliminate paper-based workflows and connect every point of the patient journey — from first contact at triage to final discharge and beyond.</p>
      <p className="text-on-surface-variant font-medium leading-relaxed mb-6">The platform provides role-based dashboards for nursing staff, attending physicians, and hospital administrators, and delivers a secure self-service portal to patients for accessing appointments, prescriptions, and laboratory results.</p>
      <Link to="/patient/activate" className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:brightness-110 transition-all">
        Activate Patient Access <ArrowRight size={16}/>
      </Link>
    </div>
  </div>
);