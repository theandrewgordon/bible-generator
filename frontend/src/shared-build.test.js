import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

test('every page imports one identical content-hashed runtime that exists in the release',()=>{
 const pages=['browse','gathering','worksheet','history','games','worship','song-editor','deck-review','presentation-review','presentation-upload','live-follow','live-remote','live-setup','learning-home'];
 const imports=pages.map(page=>{
  const entry=readFileSync(new URL(`../../static/dist/${page}/${page}.js`,import.meta.url),'utf8');
  const runtime=entry.match(/\.\.\/shared\/react-runtime-[A-Za-z0-9_-]+\.js/);
  assert.ok(runtime,`${page} must import the shared runtime`);
  assert.ok(existsSync(new URL(`../../static/dist/${page}/${runtime[0]}`,import.meta.url)),`${page}'s runtime must ship`);
  return runtime[0];
 });
 assert.equal(new Set(imports).size,1);
 assert.equal(readdirSync(new URL('../../static/dist/shared/',import.meta.url)).filter(name=>name.startsWith('react-runtime-')).length,1);
});
