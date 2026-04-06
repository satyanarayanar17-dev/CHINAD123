export const LifecycleStatus = {
  AWAITING: 'AWAITING',
  RECEPTION: 'RECEPTION',
  IN_CONSULTATION: 'IN_CONSULTATION',
  DISCHARGED: 'DISCHARGED'
} as const;

export const QueueStatus = {
  EARLY: 'EARLY',
  ON_TIME: 'ON_TIME',
  DELAYED: 'DELAYED'
} as const;

export const ProviderStatus = {
  AVAILABLE: 'AVAILABLE',
  SESSION: 'SESSION',
  OFF: 'OFF'
} as const;

export const TriageEws = {
  L1_RESUSCITATION: 'L1_RESUSCITATION',
  L2_EMERGENT: 'L2_EMERGENT',
  L3_URGENT: 'L3_URGENT',
  L4_LESS: 'L4_LESS',
  L5_NON: 'L5_NON'
} as const;

export const OrderStatus = {
  SAMPLE_COLL: 'SAMPLE_COLL',
  IN_PROCESS: 'IN_PROCESS',
  ORDER_SENT: 'ORDER_SENT',
  DISPENSED: 'DISPENSED'
} as const;

export const MedReconStatus = {
  CONTINUE: 'CONTINUE',
  MODIFY: 'MODIFY',
  STOP: 'STOP',
  NEW: 'NEW'
} as const;

/* Helper to get Display Labels */
export const DisplayLabels = {
  [LifecycleStatus.AWAITING]: 'Awaiting',
  [LifecycleStatus.RECEPTION]: 'Reception',
  [LifecycleStatus.IN_CONSULTATION]: 'In-Consultation',
  [LifecycleStatus.DISCHARGED]: 'Discharged',

  [QueueStatus.EARLY]: 'Early',
  [QueueStatus.ON_TIME]: 'On Time',
  [QueueStatus.DELAYED]: 'Delayed',

  [ProviderStatus.AVAILABLE]: 'Available',
  [ProviderStatus.SESSION]: 'In Session',
  [ProviderStatus.OFF]: 'Lunch Break',

  [TriageEws.L1_RESUSCITATION]: 'L1: Resus',
  [TriageEws.L2_EMERGENT]: 'L2: Emergent',
  [TriageEws.L3_URGENT]: 'L3: Urgent',
  [TriageEws.L4_LESS]: 'L4: Less',
  [TriageEws.L5_NON]: 'L5: Non',

  [OrderStatus.SAMPLE_COLL]: 'Sample Collected',
  [OrderStatus.IN_PROCESS]: 'In-Process',
  [OrderStatus.ORDER_SENT]: 'Order Sent',
  [OrderStatus.DISPENSED]: 'Dispensed',

  [MedReconStatus.CONTINUE]: 'Continue',
  [MedReconStatus.MODIFY]: 'Modifying',
  [MedReconStatus.STOP]: 'Stop',
  [MedReconStatus.NEW]: 'New Prescription',
};

// --- Basic Mock DTOs ---

export interface PatientStub {
  id: string;
  name: string;
  mrn: string;
  age: number;
  gender: string;
  bloodGroup: string;
}
