import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { prisma } from './lib/prisma.js';

const config = loadConfig();
const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(`[kivo] API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[kivo] received ${signal}, shutting down`);
  server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0));
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
