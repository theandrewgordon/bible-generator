import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
// Resolve the actual generated ES modules (including shared chunks) for jsdom.
export function pageBundle(page) {
  return buildSync({entryPoints:[fileURLToPath(new URL(`../../static/dist/${page}/${page}.js`,import.meta.url))],bundle:true,format:'iife',write:false}).outputFiles[0].text;
}
