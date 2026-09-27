// Starts a local LiveKit SFU for development (`npm run voice`).
// Uses tools/livekit/livekit-server(.exe) if present, otherwise `livekit-server` on PATH.
// --dev uses the well-known dev credentials devkey / secret — never use them in production.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const exe = process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server';
const local = resolve(import.meta.dirname, '../tools/livekit', exe);
const bin = existsSync(local) ? local : 'livekit-server';

const child = spawn(bin, ['--dev', '--bind', '127.0.0.1'], { stdio: 'inherit' });
child.on('error', () => {
  console.error(`\nCould not start LiveKit (${bin}).\nInstall it: https://docs.livekit.io/home/self-hosting/local/ or see README → Voice.\n`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
