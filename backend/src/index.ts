import app from './app.js';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';

// Graceful Server Startup & Shutdown for local Node environment
const server = app.listen(config.port, () => {
  logger.info(`AquaVision Backend API operational on port ${config.port}`, undefined, 'ServerBootstrap', {
    environment: config.env,
    corsOrigin: config.corsOrigin,
  });
});

function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down HTTP server gracefully...`, undefined, 'ServerShutdown');
  server.close(() => {
    logger.info('HTTP server closed cleanly.', undefined, 'ServerShutdown');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.', undefined, 'ServerShutdown');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

