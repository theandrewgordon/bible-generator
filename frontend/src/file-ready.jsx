import React from 'react';
import {ActionRow,ActionLink,StatusPanel} from './ui.jsx';
import {worksheetFile} from './worksheet-download.js';
export async function receiveDownload(response,fallback='worksheet'){
  const file=await worksheetFile(response,fallback,fallback==='bible-game'?'game':'worksheet');
  const url=URL.createObjectURL(file.blob);
  const link=document.createElement('a');link.href=url;link.download=file.name;
  document.body.appendChild(link);link.click();link.remove();
  return {url,name:file.name};
}
export function FileReady({file,onEdit,library=true}){
  if(!file)return null;
  return <section className="journey-panel" aria-label="Your file is ready"><h2>Your file is ready</h2><StatusPanel>Download ready: {file.name}</StatusPanel><p>The download has started. You can open it or download it again below.</p><ActionRow><ActionLink href={file.url} target="_blank" rel="noopener">Preview file</ActionLink><ActionLink href={file.url} download={file.name} primary>Download again</ActionLink><button type="button" className="button ghost" onClick={onEdit}>Edit choices</button>{library&&<ActionLink href="/prints">Open My Library</ActionLink>}</ActionRow><p className="small muted">{library?'Worksheets are available in My Library when signed in.':'Keep this downloaded file. Printable games are not saved in My Library.'}</p></section>;
}
