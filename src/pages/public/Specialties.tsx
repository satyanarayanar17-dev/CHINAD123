import React from 'react';
import { Link } from 'react-router-dom';
import { Microscope, Brain, Bone, HeartPulse, Sparkles, Activity } from 'lucide-react';

export const Specialties = () => {
  const departments = [
    { title: 'General Medicine', icon: <Activity size={24} />, color: 'bg-primary', light: 'bg-primary/10', text: 'text-primary' },
    { title: 'Cardiology', icon: <HeartPulse size={24} />, color: 'bg-error', light: 'bg-error/10', text: 'text-error' },
    { title: 'Orthopedics', icon: <Bone size={24} />, color: 'bg-emerald-600', light: 'bg-emerald-100', text: 'text-emerald-700' },
    { title: 'Neurology', icon: <Brain size={24} />, color: 'bg-tertiary', light: 'bg-tertiary/10', text: 'text-tertiary' },
    { title: 'Pediatrics', icon: <Sparkles size={24} />, color: 'bg-amber-500', light: 'bg-amber-100', text: 'text-amber-600' },
    { title: 'Laboratory', icon: <Microscope size={24} />, color: 'bg-secondary', light: 'bg-secondary/10', text: 'text-secondary' },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-16">
      
      <div className="mb-12">
        <h1 className="text-4xl font-extrabold text-on-surface mb-4">Clinical Departments</h1>
        <p className="text-on-surface-variant text-lg max-w-2xl">
          Our specialists represent the vanguard of evidence-based medical logic. Select a department to learn more.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {departments.map((dep) => (
           <div key={dep.title} className="bg-white rounded-2xl p-6 border border-outline/30 hover:shadow-lg hover:border-outline/60 transition-all flex flex-col group cursor-pointer">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${dep.light} ${dep.text}`}>
                 {dep.icon}
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-2">{dep.title}</h2>
              <p className="text-sm text-on-surface-variant font-medium flex-1 mb-6">
                Comprehensive diagnostic and therapeutic architectures governed by strict Phase 1 compliance structures.
              </p>
              <div className={`text-sm font-bold flex items-center gap-1 ${dep.text}`}>
                 View Practitioners →
              </div>
           </div>
         ))}
      </div>

    </div>
  );
};
