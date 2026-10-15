// -----------------------------------------------------------------------------
// Entry point of the MEATER integration: SDK wiring only. All the work lives
// in src/ (src/app.js registers the handlers, src/hub.js runs the refresh).
//
// The Gladys supervisor provides GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN
// and GLADYS_INTEGRATION_SELECTOR; the SDK reads them.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
const app = createApp({ gladys });

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal}: shutting down`);
  app.stop();
});

logger.info('Starting the MEATER integration');
gladys.connect().catch((err) => {
  logger.error(`Initial connection failed (${err.message})`);
  process.exit(1);
});
