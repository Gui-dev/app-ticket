import { execSync } from 'node:child_process';

export default function globalSetup(): void {
  execSync('pnpm --filter @ticketvibe/api db:seed', { stdio: 'inherit' });
}
