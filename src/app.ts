import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { type Clock, systemClock } from './domain/clock.js';
import { AppointmentService } from './services/appointment.service.js';
import { SqliteAppointmentRepository } from './repository/sqlite-appointment-repository.js';
import type { AppointmentRepository } from './repository/appointment-repository.js';
import { ActorStore } from './repository/actor-store.js';
import { type AppConfig, loadConfig } from './config.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerAppointmentRoutes } from './controllers/appointment.controller.js';
import { registerClinicianRoutes } from './controllers/clinician.controller.js';

export interface BuildAppOptions {
  /** Every dependency is injectable so tests stay deterministic and isolated. */
  readonly clock?: Clock;
  readonly repository?: AppointmentRepository;
  readonly actors?: ActorStore;
  readonly config?: AppConfig;
  readonly logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const clock = options.clock ?? systemClock;
  const config = options.config ?? loadConfig();
  const repository =
    options.repository ??
    new SqliteAppointmentRepository({ filename: config.databasePath, clock });
  const actors = options.actors ?? new ActorStore(clock);

  const app = Fastify({ logger: options.logger ?? false });

  // Wire Zod in as the single source of validation + serialization + OpenAPI.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: { title: 'Clinic Appointment System', version: '1.0.0' },
      tags: [{ name: 'appointments' }, { name: 'clinicians' }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerErrorHandler(app);

  const service = new AppointmentService({ repository, actors, clock });
  registerAppointmentRoutes(app, service);
  registerClinicianRoutes(app, service);

  return app;
}
