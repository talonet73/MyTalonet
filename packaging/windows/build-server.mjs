import {build} from 'esbuild';
import path from 'node:path';
const output=process.argv[2];
if(!output)throw new Error('Specify the output directory');
await build({entryPoints:['server.ts'],outfile:path.join(output,'server.mjs'),bundle:true,platform:'node',target:'node22',format:'esm',external:['vite'],banner:{js:"import {createRequire as __taleditCreateRequire} from 'node:module'; const require=__taleditCreateRequire(import.meta.url);"},sourcemap:false,legalComments:'eof'});
