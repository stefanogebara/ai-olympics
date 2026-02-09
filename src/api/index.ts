import { createAPIServer } from './server.js';

export { createAPIServer, startApiServer } from './server.js';

// Start server when run directly
const api = createAPIServer();
api.start();
