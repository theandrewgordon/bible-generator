import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadName, worksheetFile } from './worksheet-download.js';

test('accepts PDF/ZIP files and safely reads encoded and malformed filenames', async () => {
  const pdf = await worksheetFile(new Response('%PDF-1.7', {headers: {'Content-Type':'application/pdf', 'Content-Disposition':"attachment; filename*=UTF-8''Psalm%2023.pdf"}}));
  assert.equal(pdf.name, 'Psalm 23.pdf');
  const zip = await worksheetFile(new Response('PK', {headers:{'Content-Type':'application/zip'}}), 'verses');
  assert.equal(zip.name, 'verses.zip');
  assert.equal(downloadName("filename*=UTF-8''%broken; filename=backup.pdf", 'fallback.pdf'), 'backup.pdf');
  assert.equal(downloadName('filename="../secret.pdf"', 'worksheet.pdf'), '.._secret.pdf');
});
test('HTML login redirects and empty downloads are never saved as worksheets', async () => {
  await assert.rejects(worksheetFile(new Response('<html>Sign in</html>', {headers:{'Content-Type':'text/html'}})), /session may have expired/);
  await assert.rejects(worksheetFile(new Response('', {headers:{'Content-Type':'application/pdf'}})), /empty/);
});
test('quota and server errors have readable messages without exposing an HTML response', async () => {
  await assert.rejects(worksheetFile(new Response('<html>Traceback secret</html>', {status:500, headers:{'Content-Type':'text/html'}})), /could not be created/);
  await assert.rejects(worksheetFile(new Response('', {status:429})), /limit has been reached/);
  await assert.rejects(worksheetFile(new Response('{"error":"Please shorten the passage."}', {status:400, headers:{'Content-Type':'application/json'}})), /shorten the passage/);
});
