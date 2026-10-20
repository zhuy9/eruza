import { serve } from '@hono/node-server';
import { once } from 'node:events';
import { createServer } from 'vite';
import { createApp } from './app';
import { readConfig } from './config';

const config = readConfig();
const app = createApp(config);
const vite = await createServer({ configLoader: 'native' });
const api = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port });
await once(api, 'listening');
await vite.listen();
vite.printUrls();
console.log(`Local API: http://127.0.0.1:${config.port}`);
