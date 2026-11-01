import { build } from 'esbuild';

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], logLevel: 'warning' };
await build({ ...common, entryPoints: ['src/main.js'], outfile: 'dist/main.cjs' });
await build({ ...common, entryPoints: ['src/preload.js'], outfile: 'dist/preload.cjs' });
console.log('build ok');
