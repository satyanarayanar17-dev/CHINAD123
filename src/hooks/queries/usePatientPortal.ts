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
    queryKey: ['myAppointments'],
    queryFn: () => PatientPortalAPI.fetchMyAppointments(),
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
