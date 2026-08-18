const KNOWN_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|csv|dwg)$/i;

export function sanitizeFileName(name, fallback = 'Dokumen_DKPM.pdf') {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (cleaned || fallback).slice(0, 140);
}

function extensionForLink(url) {
  try {
    const parsed = new URL(url);
    const match = decodeURIComponent(parsed.pathname).match(KNOWN_EXTENSIONS);
    if (match) return match[0].toLowerCase();
    if (parsed.hostname === 'docs.google.com') {
      if (parsed.pathname.includes('/spreadsheets/')) return '.xlsx';
      if (parsed.pathname.includes('/presentation/')) return '.pdf';
      if (parsed.pathname.includes('/document/')) return '.pdf';
    }
  } catch {
    return '';
  }
  return '';
}

export function fileNameForDownload(preferredName, url) {
  let name = sanitizeFileName(preferredName || 'Dokumen_DKPM', 'Dokumen_DKPM');
  if (!KNOWN_EXTENSIONS.test(name)) name += extensionForLink(url) || '.pdf';
  return name;
}

export function toDirectDownloadUrl(rawUrl) {
  const normalized = /^https?:\/\//i.test(rawUrl || '') ? rawUrl : `https://${rawUrl || ''}`;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return normalized;
  }

  const path = parsed.pathname;
  const driveId = path.match(/\/file\/d\/([^/]+)/)?.[1] || parsed.searchParams.get('id');
  if ((parsed.hostname === 'drive.google.com' || parsed.hostname === 'drive.usercontent.google.com') && driveId) {
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`;
  }

  const googleDocument = path.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
  if (parsed.hostname === 'docs.google.com' && googleDocument) {
    const [, type, id] = googleDocument;
    if (type === 'spreadsheets') return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
    if (type === 'presentation') return `https://docs.google.com/presentation/d/${id}/export/pdf`;
    return `https://docs.google.com/document/d/${id}/export?format=pdf`;
  }

  return normalized;
}
