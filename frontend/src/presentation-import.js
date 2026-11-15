export function importFileError(file, {pdf, pptx, maxBytes}) {
  if (!pdf && !pptx) return 'Presentation importing is temporarily unavailable.';
  if (!file) return 'Choose a PowerPoint or PDF file.';
  const extension = file.name.split('.').at(-1).toLowerCase();
  if (!['pdf', 'pptx'].includes(extension)) return 'Choose a .pptx or .pdf file.';
  if (extension === 'pptx' && !pptx) return 'PowerPoint import is unavailable. Export this deck as a PDF first.';
  if (extension === 'pdf' && !pdf) return 'PDF import is unavailable. Choose a PowerPoint file.';
  if (!file.size) return 'This file is empty. Choose another presentation.';
  if (file.size > maxBytes) return 'Choose a presentation no larger than 25 MB.';
  return '';
}
