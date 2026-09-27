import { useQuery } from '@tanstack/react-query';
import { PatientPortalAPI } from '../../api/patientPortal';

/**
 * Hook for patient portal dashboard data.
 * Aggregates summary info or facilitates fetch.
 */
export function usePatientDashboardData() {
  const appointmentsQuery = useMyAppointments();
  const prescriptionsQuery = useMyPrescriptions();
  const recordsQuery = useMyRecords();

  const isLoading = appointmentsQuery.isLoading || prescriptionsQuery.isLoading || recordsQuery.isLoading;
  const isError = appointmentsQuery.isError || prescriptionsQuery.isError || recordsQuery.isError;

  return {
    appointments: appointmentsQuery.data || [],
    prescriptions: prescriptionsQuery.data || [],
    records: recordsQuery.data || [],
    isLoading,
    isError,
  };
}

/**
 * Fetch patient appointments.
 */
export function useMyAppointments() {
  return useQuery({
    queryKey: ['portal', 'appointments'],
    queryFn: () => PatientPortalAPI.fetchMyAppointments()
  });
}

export function useCarePlanAdherence(patientId: string) {
  return useQuery({
    queryKey: ['portal', 'carePlanAdherence', patientId],
    queryFn: () => PatientPortalAPI.fetchCarePlanAdherence(patientId),
    enabled: !!patientId
  });
}

export function useCarePlanTimeline(patientId: string) {
  return useQuery({
    queryKey: ['portal', 'carePlanTimeline', patientId],
    queryFn: () => PatientPortalAPI.fetchCarePlanTimeline(patientId),
    enabled: !!patientId
  });
}

/**
 * Fetch patient prescriptions.
 */
export function useMyPrescriptions() {
  return useQuery({
    queryKey: ['myPrescriptions'],
    queryFn: () => PatientPortalAPI.fetchMyPrescriptions(),
  });
}

/**
 * Fetch patient lab/radiology records.
 */
export function useMyRecords() {
  return useQuery({
    queryKey: ['myRecords'],
    queryFn: () => PatientPortalAPI.fetchMyRecords(),
  });
}
