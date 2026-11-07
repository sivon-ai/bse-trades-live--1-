// Starts the mock BSE API, the Node server and the React dev server (Vite) together.
//   npm run dev    real timing: a full pull takes 15 minutes
//   npm run demo   same thing with a 60-second pull (override with PULL_DURATION_SECONDS)
const { spawn } = require('child_process');
const path = require('path');

const env = { ...process.env };
if (process.argv.includes('--fast')) env.PULL_DURATION_SECONDS ||= '60';

const src = file => path.join(__dirname, '..', 'src', file);
const vite = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const kids = [src('mock-bse.js'), src('server.js'), vite].map(f => spawn(process.execPath, [f], { env, stdio: 'inherit' }));
const stop = () => kids.forEach(k => k.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
kids.forEach(k => k.on('exit', stop));
