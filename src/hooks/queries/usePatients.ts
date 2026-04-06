import { useQuery } from '@tanstack/react-query';
import { PatientsAPI } from '../../api/patients';

export function usePatient(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      if (!patientId) {
        throw new Error("No patient ID provided");
      }
      return await PatientsAPI.getPatient(patientId);
    },
    enabled: !!patientId,
  });
}

export function useSearchPatients(query: string) {
  return useQuery({
    queryKey: ['searchPatients', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      return await PatientsAPI.searchPatients(query);
    },
    enabled: query.length >= 2,
  });
}
export function usePatientTimeline(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patientTimeline', patientId],
    queryFn: async () => {
      if (!patientId) {
        throw new Error("No patient ID provided");
      }
      return await PatientsAPI.getPatientTimeline(patientId);
    },
    enabled: !!patientId,
  });
}
