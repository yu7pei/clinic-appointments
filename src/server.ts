import { buildApp } from './app.js';
import { loadConfig } from './config.js';

/** Composition root: build the app with real dependencies and start listening. */
async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config, logger: true });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
