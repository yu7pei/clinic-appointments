import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppointmentService } from '../services/appointment.service.js';
import { toAppointmentDto } from '../dto/appointment.dto.js';
import {
  appointmentListResponseSchema,
  clinicianAppointmentsQuery,
  clinicianIdParams,
} from '../dto/schemas.js';

export function registerClinicianRoutes(
  app: FastifyInstance,
  service: AppointmentService,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // GET /clinicians/:id/appointments — a clinician's upcoming schedule.
  typed.route({
    method: 'GET',
    url: '/clinicians/:id/appointments',
    schema: {
      tags: ['clinicians'],
      summary: "List a clinician's upcoming appointments",
      params: clinicianIdParams,
      querystring: clinicianAppointmentsQuery,
      response: { 200: appointmentListResponseSchema },
    },
    handler: async (request) => {
      const { id } = request.params;
      const { from, to, limit, offset } = request.query;
      const appointments = await service.listUpcoming({
        clinicianId: id,
        from,
        to,
        limit,
        offset,
      });
      return appointments.map(toAppointmentDto);
    },
  });
}
