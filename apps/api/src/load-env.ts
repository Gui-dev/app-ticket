import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageEnvPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../.env',
);

export function loadEnvFile(): void {
  const envPath = existsSync(packageEnvPath)
    ? packageEnvPath
    : resolve(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  process.loadEnvFile(envPath);
}
