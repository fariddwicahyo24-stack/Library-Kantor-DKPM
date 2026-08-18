import test from 'node:test';
import assert from 'node:assert/strict';
import { fileNameForDownload, sanitizeFileName, toDirectDownloadUrl } from './fileDownloadUtils.js';

test('membersihkan karakter yang tidak valid dari nama file Android', () => {
  assert.equal(sanitizeFileName('Laporan: Proyek/A?.pdf'), 'Laporan_ Proyek_A_.pdf');
});

test('mempertahankan ekstensi atau menambahkan ekstensi yang sesuai', () => {
  assert.equal(fileNameForDownload('Form Cuti.docx', 'https://example.com/a'), 'Form Cuti.docx');
  assert.equal(fileNameForDownload('Rekap', 'https://docs.google.com/spreadsheets/d/abc/edit'), 'Rekap.xlsx');
  assert.equal(fileNameForDownload('Laporan', 'https://example.com/file.pdf'), 'Laporan.pdf');
});

test('mengubah tautan Google Drive dan Google Docs menjadi tautan unduh', () => {
  assert.equal(
    toDirectDownloadUrl('https://drive.google.com/file/d/FILE123/view?usp=sharing'),
    'https://drive.usercontent.google.com/download?id=FILE123&export=download&confirm=t',
  );
  assert.equal(
    toDirectDownloadUrl('https://docs.google.com/document/d/DOC123/edit'),
    'https://docs.google.com/document/d/DOC123/export?format=pdf',
  );
});
