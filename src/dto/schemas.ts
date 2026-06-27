import { z } from 'zod';

/**
 * ISO 8601 datetime that must carry a timezone (`Z` or `±hh:mm`). Naive strings
 * are rejected because their meaning would depend on the server's locale.
 */
const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 datetime with a timezone (e.g. 2026-06-25T09:00:00Z)' });

export const createAppointmentBody = z
  .object({
    clinicianId: z.string().min(1),
    patientId: z.string().min(1),
    start: isoDateTime,
    end: isoDateTime,
  })
  .refine((body) => Date.parse(body.start) < Date.parse(body.end), {
    // Catches zero-length and negative-length intervals in one rule.
    message: 'start must be strictly before end',
    path: ['end'],
  });

export type CreateAppointmentBody = z.infer<typeof createAppointmentBody>;

/** Shared date-window + paging for the list endpoints (`coerce` parses query strings). */
const pagination = {
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
};

const dateWindow = {
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
};

const windowRefinement = (q: { from?: string; to?: string }) =>
  !(q.from && q.to) || Date.parse(q.from) <= Date.parse(q.to);
const windowRefinementMessage = {
  message: 'from must be before or equal to to',
  path: ['from'] as (string | number)[],
};

export const clinicianAppointmentsQuery = z
  .object({ ...dateWindow, ...pagination })
  .refine(windowRefinement, windowRefinementMessage);

export const listAppointmentsQuery = z
  .object({
    ...dateWindow,
    ...pagination,
    // Accepted here so the role guard can read it; `X-Role` header also works.
    role: z.enum(['patient', 'clinician', 'admin']).optional(),
  })
  .refine(windowRefinement, windowRefinementMessage);

export const clinicianIdParams = z.object({
  id: z.string().min(1),
});

const appointmentResponse = z.object({
  id: z.string(),
  clinicianId: z.string(),
  patientId: z.string(),
  start: z.string(),
  end: z.string(),
  createdAt: z.string(),
});

export const appointmentResponseSchema = appointmentResponse;
export const appointmentListResponseSchema = z.array(appointmentResponse);
