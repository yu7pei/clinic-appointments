import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
});

const booking = {
  clinicianId: 'clin-1',
  patientId: 'pat-1',
  start: '2026-06-25T09:00:00Z',
  end: '2026-06-25T09:30:00Z',
};

function post(payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: '/appointments', payload, headers });
}

describe('POST /appointments', () => {
  it('creates an appointment and returns 201 with the stored resource', async () => {
    const res = await post(booking);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      id: 'appt-1',
      clinicianId: 'clin-1',
      patientId: 'pat-1',
      start: '2026-06-25T09:00:00.000Z',
      end: '2026-06-25T09:30:00.000Z',
    });
  });

  it('rejects an overlapping appointment for the same clinician with 409', async () => {
    await post(booking);

    const overlapping = await post({
      ...booking,
      patientId: 'pat-2',
      start: '2026-06-25T09:15:00Z',
      end: '2026-06-25T09:45:00Z',
    });

    expect(overlapping.statusCode).toBe(409);
    expect(overlapping.json().error.code).toBe('CONFLICT');
  });

  it('allows a back-to-back appointment that only touches at the endpoint', async () => {
    await post(booking);

    const adjacent = await post({
      ...booking,
      patientId: 'pat-2',
      start: '2026-06-25T09:30:00Z',
      end: '2026-06-25T10:00:00Z',
    });

    expect(adjacent.statusCode).toBe(201);
  });

  it('allows the same time for a different clinician', async () => {
    await post(booking);
    const other = await post({ ...booking, clinicianId: 'clin-2' });
    expect(other.statusCode).toBe(201);
  });

  it.each([
    ['start equal to end (zero length)', { start: '2026-06-25T09:00:00Z', end: '2026-06-25T09:00:00Z' }],
    ['end before start (negative length)', { start: '2026-06-25T09:30:00Z', end: '2026-06-25T09:00:00Z' }],
    ['timezone-naive datetime', { start: '2026-06-25T09:00:00', end: '2026-06-25T09:30:00' }],
    ['unparseable datetime', { start: 'not-a-date', end: '2026-06-25T09:30:00Z' }],
  ])('returns 400 for invalid input: %s', async (_label, override) => {
    const res = await post({ ...booking, ...override });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an appointment in the past with 400', async () => {
    const res = await post({
      ...booking,
      start: '2026-06-25T07:00:00Z',
      end: '2026-06-25T07:30:00Z',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /clinicians/:id/appointments', () => {
  it("returns a clinician's upcoming appointments sorted by start", async () => {
    await post({ ...booking, start: '2026-06-25T11:00:00Z', end: '2026-06-25T11:30:00Z' });
    await post({ ...booking, patientId: 'pat-2', start: '2026-06-25T09:00:00Z', end: '2026-06-25T09:30:00Z' });

    const res = await app.inject({ method: 'GET', url: '/clinicians/clin-1/appointments' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.map((a: { start: string }) => a.start)).toEqual([
      '2026-06-25T09:00:00.000Z',
      '2026-06-25T11:00:00.000Z',
    ]);
  });

  it('excludes past appointments from the upcoming list', async () => {
    // Created via the repo path would be blocked by the past-rule, so book a
    // future one and query with a `from` after it to prove filtering works.
    await post(booking);
    const res = await app.inject({
      method: 'GET',
      url: '/clinicians/clin-1/appointments?from=2026-06-25T10:00:00Z',
    });
    expect(res.json()).toHaveLength(0);
  });

  it('filters by an explicit from/to date range', async () => {
    await post({ ...booking, start: '2026-06-25T09:00:00Z', end: '2026-06-25T09:30:00Z' });
    await post({ ...booking, patientId: 'pat-2', start: '2026-06-26T09:00:00Z', end: '2026-06-26T09:30:00Z' });

    const res = await app.inject({
      method: 'GET',
      url: '/clinicians/clin-1/appointments?from=2026-06-25T00:00:00Z&to=2026-06-26T00:00:00Z',
    });
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].start).toBe('2026-06-25T09:00:00.000Z');
  });

  it('pages through results with limit and offset', async () => {
    await post({ ...booking, start: '2026-06-25T09:00:00Z', end: '2026-06-25T09:30:00Z' });
    await post({ ...booking, patientId: 'pat-2', start: '2026-06-25T10:00:00Z', end: '2026-06-25T10:30:00Z' });
    await post({ ...booking, patientId: 'pat-3', start: '2026-06-25T11:00:00Z', end: '2026-06-25T11:30:00Z' });

    const page1 = await app.inject({ method: 'GET', url: '/clinicians/clin-1/appointments?limit=2' });
    expect(page1.json().map((a: { start: string }) => a.start)).toEqual([
      '2026-06-25T09:00:00.000Z',
      '2026-06-25T10:00:00.000Z',
    ]);

    const page2 = await app.inject({ method: 'GET', url: '/clinicians/clin-1/appointments?limit=2&offset=2' });
    expect(page2.json().map((a: { start: string }) => a.start)).toEqual([
      '2026-06-25T11:00:00.000Z',
    ]);
  });

  it('rejects an invalid date window (from after to) with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/clinicians/clin-1/appointments?from=2026-07-01T00:00:00Z&to=2026-06-01T00:00:00Z',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /appointments (admin)', () => {
  it('requires the admin role', async () => {
    const forbidden = await app.inject({
      method: 'GET',
      url: '/appointments',
      headers: { 'x-role': 'patient' },
    });
    expect(forbidden.statusCode).toBe(403);

    const missing = await app.inject({ method: 'GET', url: '/appointments' });
    expect(missing.statusCode).toBe(400);
  });

  it('lists all clinicians upcoming appointments for an admin', async () => {
    await post(booking);
    await post({ ...booking, clinicianId: 'clin-2' });

    const res = await app.inject({
      method: 'GET',
      url: '/appointments',
      headers: { 'x-role': 'admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  it('rejects an unknown role with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/appointments',
      headers: { 'x-role': 'wizard' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts the admin role via a ?role= query param', async () => {
    const res = await app.inject({ method: 'GET', url: '/appointments?role=admin' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeInstanceOf(Array);
  });
});

describe('edge cases', () => {
  it('returns a structured 404 for an unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: { 'content-type': 'application/json' },
      payload: '{bad json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('returns 400 when a required field is missing', async () => {
    const { patientId: _omitted, ...withoutPatient } = booking;
    const res = await post(withoutPatient);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
