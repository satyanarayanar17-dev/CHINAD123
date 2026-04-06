import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, ShieldCheck, HeartPulse, Clock, ArrowRight } from 'lucide-react';

export const Home = () => {
  return (
    <div className="w-full flex-col">
      {/* ── Hero Section ── */}
      <section className="relative w-full bg-gradient-to-br from-primary/10 via-primary/5 to-white pt-24 pb-32 px-4 overflow-hidden border-b border-primary/10">
        
        {/* Background Decorative Blur */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-primary/10 blur-[120px] pointer-events-none rounded-full" style={{ transform: 'translate(20%, -20%)' }} />
        <div className="absolute bottom-0 left-0 w-1/3 h-1/2 bg-secondary/10 blur-[100px] pointer-events-none rounded-full" style={{ transform: 'translate(-10%, 10%)' }} />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10 px-4 sm:px-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-primary/20 text-primary font-bold text-xs mb-8 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Phase 2 Portal Live
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold text-on-surface tracking-tight leading-[1.1] mb-6">
              Empowering your <span className="text-primary bg-clip-text">clinical care.</span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant font-medium leading-relaxed mb-10 max-w-lg">
              Chettinad Care provides a seamless digital bridge between our trusted medical professionals and your health journey.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/patient/activate" className="bg-primary text-white font-bold px-8 py-4 rounded-xl hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/20 transition-all text-center flex items-center justify-center gap-2 text-lg">
                Activate Portal <ArrowRight size={20} />
              </Link>
              <Link to="/specialties" className="bg-white text-on-surface border-2 border-outline px-8 py-4 rounded-xl hover:border-primary hover:bg-primary/5 transition-all font-bold text-center text-lg">
                Our Specialties
              </Link>
            </div>
          </div>
          
          {/* Abstract Hero Image Component */}
          <div className="relative hidden lg:block">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-[3rem] transform rotate-3 scale-105" />
            <div className="bg-white border border-outline/50 shadow-2xl rounded-[3rem] p-8 relative overflow-hidden backdrop-blur-sm aspect-[4/3] flex flex-col justify-center items-center">
              {/* Decorative Mock App Frame inside Hero */}
              <div className="w-full h-12 bg-surface-container-low rounded-t-xl border border-outline/30 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-error/80" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="w-full flex-1 bg-surface-container-low border-b border-x border-outline/30 rounded-b-xl p-6 flex flex-col gap-4">
                 <div className="w-2/3 h-6 bg-outline/20 rounded-md animate-pulse" />
                 <div className="grid grid-cols-2 gap-4 h-full">
                    <div className="bg-white rounded-lg border border-outline/20 flex flex-col p-4 justify-center items-center gap-3">
                       <ShieldCheck className="text-primary opacity-50" size={32} />
                       <div className="w-16 h-3 bg-outline/20 rounded-md" />
                    </div>
                    <div className="bg-white rounded-lg border border-outline/20 flex flex-col p-4 justify-center items-center gap-3">
                       <Activity className="text-tertiary opacity-50" size={32} />
                       <div className="w-20 h-3 bg-outline/20 rounded-md" />
                    </div>
                 </div>
              </div>
              
              {/* Floating Widget overlay */}
              <div className="absolute -right-6 top-1/3 bg-white p-4 rounded-2xl shadow-xl border border-outline/20 flex items-center gap-4 animate-bounce" style={{animationDuration: '3s'}}>
                 <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                   <HeartPulse size={20} className="text-emerald-600" />
                 </div>
                 <div>
                   <p className="font-bold text-sm text-on-surface">Vitals Tracked</p>
                   <p className="text-xs text-on-surface-variant font-medium">Synced instantly</p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Bar ── */}
      <section className="py-20 bg-white border-b border-outline/20 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { icon: <ShieldCheck size={32} className="text-primary" />, title: 'Highly Secure', desc: 'Enterprise-grade architecture ensures your clinical data is locked behind strict role-based constraints.' },
              { icon: <Clock size={32} className="text-secondary" />, title: 'Real-time Tracking', desc: 'From triage to discharge, monitor appointment scheduling and status directly via the portal.' },
              { icon: <Activity size={32} className="text-tertiary" />, title: 'Unified Records', desc: 'Digitized prescriptions, notes, and records tied persistently to your unique health identity.' }
            ].map(f => (
              <div key={f.title} className="flex flex-col items-start p-6 bg-surface-container rounded-2xl border border-outline/30 hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6">
                  {f.icon}
                </div>
                <h3 className="font-extrabold text-xl text-on-surface mb-3">{f.title}</h3>
                <p className="text-on-surface-variant text-sm font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick Patient Guide ── */}
      <section className="py-24 bg-surface-container-low w-full">
         <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-extrabold text-on-surface mb-6">Access your digital health portal in 3 steps</h2>
            <p className="text-on-surface-variant text-lg font-medium mb-16 max-w-2xl mx-auto">
              Our Phase 2 integration provides immediate read-access to upcoming encounters and completed prescriptions without relying on insecure passwords.
            </p>
            
            <div className="flex flex-col md:flex-row gap-8 relative items-center justify-center">
               <div className="hidden md:block absolute top-1/2 left-[15%] w-[70%] h-px bg-outline/50 border-t border-dashed border-outline/50 -z-0" />
               
               {[
                 { step: '1', title: 'Register on Site', desc: 'Visit our hospital reception for a strict identity check to generate a UHID.' },
                 { step: '2', title: 'Claim Token', desc: 'Receive a secure OTP from your consulting practitioner or triage nurse.' },
                 { step: '3', title: 'Authenticate', desc: 'Bridge your UHID to a permanent password via the Activation Portal.' },
               ].map((s, idx) => (
                 <div key={idx} className="bg-white p-8 rounded-2xl shadow-sm border border-outline/50 relative z-10 w-full md:w-1/3 flex flex-col items-center">
                    <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-black text-xl mb-6 shadow-md shadow-primary/20">{s.step}</div>
                    <h4 className="font-bold text-on-surface text-lg mb-2">{s.title}</h4>
                    <p className="text-sm text-on-surface-variant font-medium px-4">{s.desc}</p>
                 </div>
               ))}
            </div>
         </div>
      </section>

    </div>
  );
};
