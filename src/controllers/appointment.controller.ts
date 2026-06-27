import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppointmentService } from '../services/appointment.service.js';
import { toAppointmentDto } from '../dto/appointment.dto.js';
import { requireRole } from '../middleware/role-guard.js';
import {
  appointmentListResponseSchema,
  appointmentResponseSchema,
  createAppointmentBody,
  listAppointmentsQuery,
} from '../dto/schemas.js';

export function registerAppointmentRoutes(
  app: FastifyInstance,
  service: AppointmentService,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // POST /appointments — book an appointment.
  typed.route({
    method: 'POST',
    url: '/appointments',
    schema: {
      tags: ['appointments'],
      summary: 'Create an appointment',
      body: createAppointmentBody,
      response: { 201: appointmentResponseSchema },
    },
    handler: async (request, reply) => {
      const created = await service.book(request.body);
      return reply.status(201).send(toAppointmentDto(created));
    },
  });

  // GET /appointments — admin-only view of all upcoming appointments.
  typed.route({
    method: 'GET',
    url: '/appointments',
    preHandler: requireRole('admin'),
    schema: {
      tags: ['appointments'],
      summary: 'List all upcoming appointments (admin only)',
      querystring: listAppointmentsQuery,
      response: { 200: appointmentListResponseSchema },
    },
    handler: async (request) => {
      const { from, to, limit, offset } = request.query;
      const appointments = await service.listUpcoming({ from, to, limit, offset });
      return appointments.map(toAppointmentDto);
    },
  });
}
