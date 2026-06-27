import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ForbiddenError, ValidationError } from '../domain/errors.js';

export type Role = 'patient' | 'clinician' | 'admin';
const ROLES: readonly Role[] = ['patient', 'clinician', 'admin'];

function readRole(request: FastifyRequest): Role {
  // Simulated auth: a real system would derive this from a verified token,
  // never trust a client-supplied header/param. Header wins over query param.
  const header = request.headers['x-role'];
  const query = (request.query as { role?: string } | undefined)?.role;
  const raw = (Array.isArray(header) ? header[0] : header) ?? query;

  if (!raw) {
    throw new ValidationError('Missing role; supply an X-Role header or ?role= query param');
  }
  if (!ROLES.includes(raw as Role)) {
    throw new ValidationError(`Unknown role '${raw}'; expected one of ${ROLES.join(', ')}`);
  }
  return raw as Role;
}

/** preHandler that admits only the listed roles. */
export function requireRole(...allowed: Role[]): preHandlerHookHandler {
  return async (request) => {
    const role = readRole(request);
    if (!allowed.includes(role)) {
      throw new ForbiddenError(
        `Role '${role}' may not access this resource; requires ${allowed.join(' or ')}`,
      );
    }
  };
}
