import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const geo = path.resolve(here, '../geo');
const expected = [
  'canal','dam','pier','tunnel','country','continent','Earth',
  'erosion','deposition','weathering','aquifer','hot spring','geyser',
  'compass rose','contour line','coordinates','equator','hemisphere',
  'latitude','longitude','map key','map scale','North Pole','South Pole',
  'topographic map','altitude','elevation','horizon'
];

test('Geo Detectives watercolor replacements are complete when enabled', t => {
  const app = fs.readFileSync(path.join(geo,'main.jsx'),'utf8');
  if (!app.includes("import './art-replacements.css';")) {
    t.skip('Replacement images not enabled in source yet');
    return;
  }
  const css = fs.readFileSync(path.join(geo,'art-replacements.css'),'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(geo,'data.json'),'utf8'));
  const quest = new Map(data.quest.map(q=>[q.answer.toLowerCase(),q]));
  const files = fs.readdirSync(path.join(geo,'art-replacements')).filter(f=>f.endsWith('.webp'));
  assert.equal(files.length,28,'Expected 28 distinct WebP images');
  const images = new Set(files);
  const arts = new Set();
  for (const name of expected) {
    const record = quest.get(name.toLowerCase());
    assert.ok(record,'Missing geography concept: '+name);
    assert.ok(!arts.has(record.art),'Duplicate art key: '+record.art);
    arts.add(record.art);
    const filename = name.toLowerCase().replaceAll(' ','-')+'.webp';
    assert.ok(images.has(filename),'Missing asset: '+filename);
    assert.ok(css.includes('.'+record.art+' {'),'Missing CSS class: '+record.art);
    assert.ok(css.includes('./art-replacements/'+filename),'Missing image reference in CSS: '+filename);
    const bytes = fs.readFileSync(path.join(geo,'art-replacements',filename));
    assert.equal(bytes.subarray(0,4).toString(),'RIFF','Invalid WebP RIFF: '+filename);
    assert.equal(bytes.subarray(8,12).toString(),'WEBP','Invalid WebP format: '+filename);
  }
});
