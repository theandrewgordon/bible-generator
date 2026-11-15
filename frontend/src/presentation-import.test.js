import test from 'node:test';
import assert from 'node:assert/strict';
import { importFileError } from './presentation-import.js';
const config={pdf:true,pptx:true,maxBytes:25*1024*1024};
test('upload preflight matches file limits and server conversion capabilities',()=>{
 assert.equal(importFileError({name:'SERMON.PDF',size:config.maxBytes},config),'');
 assert.match(importFileError({name:'notes.pdf.exe',size:1},config),/\.pptx or \.pdf/);
 assert.match(importFileError({name:'sermon.pptx',size:1},{...config,pptx:false}),/Export this deck as a PDF/);
 assert.match(importFileError({name:'sermon.pdf',size:config.maxBytes+1},config),/25 MB/);
 assert.match(importFileError({name:'sermon.pdf',size:0},config),/empty/);
 assert.match(importFileError(null,config),/Choose/);
 assert.match(importFileError(null,{...config,pdf:false,pptx:false}),/unavailable/);
});
