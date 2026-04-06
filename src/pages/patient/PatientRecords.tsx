import React from 'react';
import { FileText, Download, Eye, Search, Filter, CheckCircle, Clock } from 'lucide-react';
import { useMyRecords } from '../../hooks/queries/usePatientPortal';

export const PatientRecords = () => {
  const { data: records = [], isLoading } = useMyRecords();

  if (isLoading) return <div className="p-20 text-center animate-pulse font-bold text-on-surface-variant text-sm">Retrieving your clinical reports...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Clinical Records</h1>
          <p className="text-sm text-on-surface-variant">View and download your official laboratory and imaging reports</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-on-surface-variant" />
            <input 
              type="text" 
              placeholder="Search reports..." 
              className="pl-9 pr-4 py-2 text-sm border border-outline rounded-xl outline-none focus:border-primary transition-all bg-white"
            />
          </div>
          <button className="p-2 border border-outline rounded-xl hover:bg-gray-50 text-on-surface-variant">
            <Filter size={18} />
          </button>
        </div>
      </div>

      {records.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {records.map((report: any) => (
            <div key={report.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-start gap-4 hover:shadow-md transition-shadow group">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                report.status === 'READY' ? 'bg-emerald-100/50 text-emerald-600' : 'bg-amber-100/50 text-amber-600'
              }`}>
                {report.status === 'READY' ? <CheckCircle size={24} /> : <Clock size={24} />}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-on-surface leading-snug">{report.testName}</h3>
                    <p className="text-[11px] font-bold text-primary uppercase mt-0.5 tracking-wider">
                      {report.category === 'lab' ? 'Pathology' : 'Radiology'} Report
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    report.status === 'READY' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {report.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-1.5 border-l-2 border-gray-50 pl-3">
                  <p className="text-xs text-on-surface-variant font-medium">
                    <span className="opacity-60">Requested by:</span> {report.requestedBy}
                  </p>
                  <p className="text-xs text-on-surface-variant font-medium">
                    <span className="opacity-60">Date:</span> {report.date}
                  </p>
                </div>

                {report.status === 'READY' && report.findings && (
                  <div className="mt-4 p-3 bg-surface-container-low rounded-xl text-[11px] text-on-surface font-medium border border-outline/10 italic">
                    {report.findings}
                  </div>
                )}

                {report.status === 'READY' && (
                  <div className="mt-5 flex gap-3">
                    <button className="flex-1 flex items-center justify-center gap-2 bg-primary text-white text-xs font-bold py-2.5 rounded-lg hover:brightness-110 transition-all">
                      <Eye size={14} /> View Report
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 border border-outline text-on-surface text-xs font-bold py-2.5 rounded-lg hover:bg-surface-container transition-all">
                      <Download size={14} /> Download PDF
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
            <FileText size={32} />
          </div>
          <h2 className="text-lg font-bold text-on-surface">No Clinical Records Found</h2>
          <p className="text-on-surface-variant text-sm mt-1 max-w-xs mx-auto">
            You don't have any laboratory or radiology reports on file in this portal yet.
          </p>
        </div>
      )}
    </div>
  );
};
