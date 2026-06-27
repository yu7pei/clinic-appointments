import type { Appointment } from '../domain/appointment.js';

/** Wire shape of an appointment: epoch ms internally become ISO 8601 UTC strings. */
export interface AppointmentDto {
  readonly id: string;
  readonly clinicianId: string;
  readonly patientId: string;
  readonly start: string;
  readonly end: string;
  readonly createdAt: string;
}

export function toAppointmentDto(appointment: Appointment): AppointmentDto {
  return {
    id: appointment.id,
    clinicianId: appointment.clinicianId,
    patientId: appointment.patientId,
    start: new Date(appointment.startsAt).toISOString(),
    end: new Date(appointment.endsAt).toISOString(),
    createdAt: new Date(appointment.createdAt).toISOString(),
  };
}
