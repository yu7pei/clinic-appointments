import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../domain/errors.js';

/** One uniform error envelope for the whole API. */
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function envelope(code: string, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/**
 * Turns thrown errors into HTTP responses: domain AppErrors use their own
 * status/code, Zod validation failures become 400s, other client errors (e.g.
 * a malformed JSON body) keep their 4xx status, and anything else is a 500.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.status)
        .send(envelope(error.code, error.message, error.details));
    }

    const validationIssues =
      error instanceof ZodError ? error.issues : error.validation;
    if (validationIssues) {
      return reply
        .status(400)
        .send(envelope('VALIDATION_ERROR', 'Request validation failed', validationIssues));
    }

    // Framework client errors such as a malformed JSON body arrive here with a
    // 4xx statusCode; surface that rather than masking it as a 500.
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send(envelope('BAD_REQUEST', error.message));
    }

    request.log.error(error);
    return reply
      .status(500)
      .send(envelope('INTERNAL_ERROR', 'An unexpected error occurred'));
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(envelope('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
  });
}
