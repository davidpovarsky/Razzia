import fs from 'node:fs';
const capability = fs.readFileSync('/run/secrets/runtime-capability', 'utf8').trim();
if (!/^[a-f0-9]{64}$/u.test(capability)) throw new Error('Runtime capability configuration rejected');
process.env.TADAZZ_RUNTIME_CAPABILITY_SECRET = capability;
await import('./runtime.mjs');
