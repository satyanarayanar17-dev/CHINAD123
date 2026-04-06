import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PatientPortalAPI } from '../../api/patientPortal';
import type { Prescription } from '../../store/mockData';

/**
 * Live abstraction for patient medication preferences and reminders.
 */
export const usePatientMeds = () => {
  // Local state for toggles until full backend sync is available
  const [localMeds, setLocalMeds] = useState<Prescription[]>([]);

  const query = useQuery({
    queryKey: ['my-prescriptions'],
    queryFn: async () => {
      return await PatientPortalAPI.fetchMyPrescriptions();
    }
  });

  const toggleReminder = (id: string) => {
    // Optimistic local update (this would hit a PATCH endpoint in a full CRM)
    alert('Reminder toggle feature temporarily disabled pending SMS integration API.');
  };

  return { meds: query.data || [], toggleReminder, isLoading: query.isLoading };
};
