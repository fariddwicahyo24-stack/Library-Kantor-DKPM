import test from 'node:test';
import assert from 'node:assert/strict';
import { extractIsbn, extractSearchText, isValidIsbn, lookupBookMetadata, normalizeIsbn } from './catalogBookLookup.js';

test('normalizes and validates ISBN-10 and ISBN-13', () => {
  assert.equal(normalizeIsbn('978-0-306-40615-7'), '9780306406157');
  assert.equal(isValidIsbn('978-0-306-40615-7'), true);
  assert.equal(isValidIsbn('0-306-40615-2'), true);
  assert.equal(isValidIsbn('9780306406158'), false);
});

test('extracts a valid ISBN from noisy OCR text', () => {
  assert.equal(extractIsbn('Penerbit Contoh\nISBN: 978-0-306-40615-7\nCetakan 2024'), '9780306406157');
});

test('builds a useful title query when ISBN is absent', () => {
  assert.equal(extractSearchText('Penerbit Contoh\nDESAIN PRODUK\nPanduan Praktis\nISBN tidak terbaca'), 'DESAIN PRODUK Panduan Praktis');
});

test('maps Google Books metadata to catalog fields', async () => {
  const fetchFn = async () => ({
    ok: true,
    json: async () => ({ items: [{ volumeInfo: {
      title: 'Buku Uji', authors: ['A. Penulis'], publisher: 'Penerbit DKPM', publishedDate: '2025',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780306406157' }], infoLink: 'https://example.test/book',
    } }] }),
  });
  const result = await lookupBookMetadata({ isbn: '9780306406157', fetchFn });
  assert.equal(result.title, 'Buku Uji');
  assert.equal(result.source, 'Penerbit DKPM');
  assert.equal(result.isbn, '9780306406157');
  assert.match(result.desc, /A\. Penulis/);
});

test('falls back to Open Library when Google Books is unavailable', async () => {
  let callCount = 0;
  const fetchFn = async () => {
    callCount += 1;
    if (callCount === 1) return { ok: false, status: 429 };
    return {
      ok: true,
      json: async () => ({ docs: [{
        title: 'Buku Cadangan', author_name: ['Penulis Kedua'], publisher: ['Penerbit Alternatif'],
        isbn: ['9780306406157'], key: '/works/OL123W',
      }] }),
    };
  };
  const result = await lookupBookMetadata({ isbn: '9780306406157', fetchFn });
  assert.equal(result.provider, 'Open Library');
  assert.equal(result.title, 'Buku Cadangan');
  assert.equal(result.webLink, 'https://openlibrary.org/works/OL123W');
});
