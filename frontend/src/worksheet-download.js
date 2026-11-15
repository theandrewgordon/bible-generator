export function downloadName(disposition, fallback) {
  let name;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition || '');
  if (encoded) try { name = decodeURIComponent(encoded[1]); } catch { /* Use plain filename. */ }
  name ||= /filename\s*=\s*"([^"]+)"/i.exec(disposition || '')?.[1]
    || /filename\s*=\s*([^;]+)/i.exec(disposition || '')?.[1] || fallback;
  return name.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim() || fallback;
}

export async function worksheetFile(response, fallback = 'worksheet') {
  const type = (response.headers.get('Content-Type') || '').toLowerCase();
  if (!response.ok) {
    let message = '';
    if (type.includes('application/json')) {
      try { const body = await response.json(); message = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : ''; } catch { /* Use readable fallback. */ }
    } else if (type.includes('text/plain')) {
      message = (await response.text()).slice(0, 240);
    }
    const fallbackMessage = response.status === 429 ? 'Your worksheet limit has been reached. Try again later or check your membership.'
      : response.status === 401 || response.status === 403 ? 'Your session may have expired. Sign in again, then retry.'
      : 'The worksheet could not be created. Please check your choices and try again.';
    throw new Error(message.slice(0, 240) || fallbackMessage);
  }
  // A login redirect can return HTML with status 200. Never save it as a PDF.
  if (!['application/pdf', 'application/zip', 'application/octet-stream', 'application/x-zip-compressed'].some(mime => type.split(';')[0].trim() === mime)) {
    throw new Error('No worksheet was returned. Check your passage and version; your session may have expired. Sign in again if needed, then retry.');
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('The downloaded file was empty. Please try again.');
  const extension = type.includes('zip') ? '.zip' : '.pdf';
  return { blob, name: downloadName(response.headers.get('Content-Disposition'), `${fallback}${extension}`) };
}
