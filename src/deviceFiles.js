import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { fileNameForDownload, sanitizeFileName, toDirectDownloadUrl } from './fileDownloadUtils.js';

const APP_DOCUMENT_FOLDER = 'Design App DKPM';

function browserSaveDataUri(base64, fileName, mimeType) {
  const link = document.createElement('a');
  link.href = `data:${mimeType};base64,${base64}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function ensurePublicStorageAccess() {
  if (Capacitor.getPlatform() !== 'android') return;
  let permission = await Filesystem.checkPermissions();
  if (permission.publicStorage !== 'granted') permission = await Filesystem.requestPermissions();
  if (permission.publicStorage !== 'granted') {
    throw new Error('Izin penyimpanan ditolak. Aktifkan izin File dan Media untuk aplikasi ini.');
  }
}

async function ensureDocumentFolder() {
  try {
    await Filesystem.mkdir({
      path: APP_DOCUMENT_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (!message.includes('exist')) throw error;
  }
}

async function verifySavedFile(path) {
  const info = await Filesystem.stat({ path, directory: Directory.Documents });
  if (!info.size) throw new Error('File tersimpan tetapi ukurannya kosong. Silakan ulangi proses.');
  return info;
}

export async function saveBase64Document(base64, requestedFileName, mimeType = 'application/pdf') {
  const fileName = sanitizeFileName(requestedFileName);
  if (!Capacitor.isNativePlatform()) {
    browserSaveDataUri(base64, fileName, mimeType);
    return { fileName, displayPath: `Unduhan browser/${fileName}`, size: 0 };
  }

  await ensurePublicStorageAccess();
  await ensureDocumentFolder();
  const path = `${APP_DOCUMENT_FOLDER}/${fileName}`;
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  const info = await verifySavedFile(path);
  return { fileName, uri: info.uri, size: info.size, displayPath: `Dokumen/${path}` };
}

async function removeDownloadedHtml(path) {
  try {
    const preview = await Filesystem.readFile({
      path,
      directory: Directory.Documents,
      offset: 0,
      length: 80,
    });
    const decoded = globalThis.atob(String(preview.data)).trimStart().toLowerCase();
    if (decoded.startsWith('<!doctype html') || decoded.startsWith('<html')) {
      await Filesystem.deleteFile({ path, directory: Directory.Documents });
      throw new Error('Tautan membuka halaman web, bukan file. Pastikan akses Google Drive disetel “Siapa saja yang memiliki link”.');
    }
  } catch (error) {
    if (String(error?.message || error).includes('Tautan membuka')) throw error;
  }
}

export async function downloadRemoteDocument(rawUrl, preferredFileName) {
  if (!rawUrl) throw new Error('Tautan file tidak tersedia.');
  const url = toDirectDownloadUrl(rawUrl);
  const fileName = fileNameForDownload(preferredFileName, url);

  if (!Capacitor.isNativePlatform()) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { fileName, displayPath: `Unduhan browser/${fileName}`, size: 0 };
  }

  await ensurePublicStorageAccess();
  await ensureDocumentFolder();
  const path = `${APP_DOCUMENT_FOLDER}/${fileName}`;
  const destination = await Filesystem.getUri({ path, directory: Directory.Documents });

  await FileTransfer.downloadFile({
    url,
    path: destination.uri,
    progress: false,
    connectTimeout: 30_000,
    readTimeout: 120_000,
  });

  const info = await verifySavedFile(path);
  await removeDownloadedHtml(path);
  return { fileName, uri: info.uri, size: info.size, displayPath: `Dokumen/${path}` };
}
