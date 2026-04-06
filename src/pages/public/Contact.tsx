import React from 'react';
import { Phone, Mail, MapPin, AlertCircle } from 'lucide-react';

export const Contact = () => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-on-surface mb-4">Contact & Support</h1>
        <p className="text-lg text-on-surface-variant">We are available 24/7 for medical emergencies and clinical inquiries.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {/* Emergency Card */}
        <div className="bg-error text-white rounded-3xl p-8 shadow-lg shadow-error/20 flex flex-col items-center text-center lg:col-span-1">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2">Emergency Hub</h2>
          <p className="text-white/80 font-medium mb-6">Immediate casualty and trauma support. Open 24/7/365.</p>
          <div className="text-4xl font-black tracking-tight mt-auto">Ext. 1800</div>
        </div>

        {/* General Contact */}
        <div className="bg-white rounded-3xl p-8 border border-outline/30 shadow-sm flex flex-col justify-center lg:col-span-2">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                 <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
                    <Phone size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-on-surface mb-1">General Enquiries</h3>
                    <p className="text-on-surface-variant text-sm mb-2">Mon-Sat, 8am to 8pm</p>
                    <p className="font-extrabold text-lg text-primary">+91 (44) 4741 1000</p>
                 </div>
              </div>

              <div className="flex gap-4">
                 <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
                    <Mail size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-on-surface mb-1">IT Support</h3>
                    <p className="text-on-surface-variant text-sm mb-2">Portal Access Issues</p>
                    <p className="font-extrabold text-lg text-primary">ittriage@internal.local</p>
                 </div>
              </div>
              
              <div className="flex gap-4 md:col-span-2 mt-4 pt-8 border-t border-outline/20">
                 <div className="w-12 h-12 bg-surface-container rounded-xl flex items-center justify-center text-on-surface-variant shrink-0">
                    <MapPin size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-on-surface mb-1">Chettinad Health City Campus</h3>
                    <p className="text-on-surface-variant font-medium">Rajiv Gandhi Salai, Kelambakkam<br/>Chengalpattu District, Tamil Nadu 603103</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
