import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3001);

const app = buildApp();

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    console.log(`[api] listening on http://localhost:${port}`);
  })
  .catch((error) => {
    console.error('[api] failed to start', error);
    process.exit(1);
  });
