import React from 'react';
import { ArrowRight, BookOpen, Star, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

export const About = () => {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight mb-4">About Chettinad Care</h1>
        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
          Driving clinical excellence through deterministic workflows and structured patient management.
        </p>
      </div>

      <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-outline/30 mb-12">
        <div className="prose prose-on-surface max-w-none">
          <p className="lead text-xl text-on-surface font-medium mb-6">
            Chettinad Hospital and Research Institute is navigating a major digital transformation designed to eliminate data silos and connect point-of-care clinicians with real-time patient history.
          </p>
          <div className="h-px w-full bg-outline/20 my-8" />
          <h3 className="text-2xl font-bold text-on-surface mb-4">Phase 1: Foundation (Completed)</h3>
          <p className="text-on-surface-variant mb-6">
            Our staff operations have been successfully digitized. We govern encounter management through strict Optimistic Concurrency Control, ensuring no two clinicians can unintentionally overwrite active drafts or critical prescriptions. The "Nurse Triage" and "Doctor Command Center" modules represent our first leap into robust clinical software architecture.
          </p>
          
          <h3 className="text-2xl font-bold text-on-surface mb-4">Phase 2: Patient Portal (Current)</h3>
          <p className="text-on-surface-variant">
            We are actively integrating patients into this ecosystem. By utilizing offline OTP tokens, we securely bridge the gap between anonymous clinic visits and authenticated digital health dossiers. Patients can now independently verify upcoming appointments, active prescriptions, and completed laboratory records.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {[
           { i: <Target size={24} />, t: 'Mission', d: 'To digitise clinical operations without sacrificing operational speed.' },
           { i: <Star size={24} />, t: 'Vision', d: 'A wholly unified data mesh preventing fragmented healthcare.' },
           { i: <BookOpen size={24} />, t: 'Academics', d: 'Research backed by cryptographically auditable databases.' },
         ].map((card) => (
           <div key={card.t} className="bg-surface-container rounded-2xl p-6 border border-outline/30 flex flex-col items-start">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-4">
                {card.i}
              </div>
              <h4 className="font-bold text-on-surface mb-2">{card.t}</h4>
              <p className="text-sm font-medium text-on-surface-variant">{card.d}</p>
           </div>
         ))}
      </div>

      <div className="mt-16 text-center">
         <Link to="/patient/activate" className="inline-flex items-center gap-2 text-primary font-bold hover:underline">
            Join the Phase 2 Pilot <ArrowRight size={16} />
         </Link>
      </div>

    </div>
  );
};
