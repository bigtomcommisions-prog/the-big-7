// Production build for Vercel (bigtomdev.fyi): all the static apps plus the Big Tom Dev site pages,
// into apps/client/dist. Run with `npm run build:vercel`. Works on Windows, macOS and Linux.
import { execSync } from 'node:child_process';

const env = {
  ...process.env,
  VITE_BASE: '/hearthvale/',
  VITE_API_ORIGIN: 'https://api.bigtomdev.fyi',
  VITE_SITE_URL: 'https://bigtomdev.fyi/hearthvale/',
};

const steps = [
  'npm run build -w @hearthvale/client',
  'npm run build -w @bigtomdev/omniprice',
  'npm run build -w @bigtomdev/homebase',
  'node scripts/build-site.mjs',
];

for (const cmd of steps) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env });
}
