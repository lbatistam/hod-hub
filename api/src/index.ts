import 'dotenv/config';
import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();
app.listen(config.port, '127.0.0.1', () => {
  console.log(`HOD Platform disponível em ${config.origin} (bind 127.0.0.1:${config.port})`);
  console.log(`OpenAPI: ${config.origin}/api/v1/openapi.json — SSE: ${config.origin}/api/v1/stream`);
});
