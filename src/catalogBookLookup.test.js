import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBookMetadata, createBookDraft, extractIsbn, extractSearchText, getGoogleBookSearchUrl, isValidIsbn, lookupBookMetadata, normalizeIsbn } from './catalogBookLookup.js';

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

test('queries Google over the internet without using cached results', async () => {
  const fetchFn = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://www.googleapis.com');
    assert.equal(new URL(url).searchParams.get('q'), 'isbn:9780306406157');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ totalItems: 0 }) };
  };
  const result = await lookupBookMetadata({ text: '9780306406157', fetchFn });
  assert.equal(result.found, false);
  assert.equal(result.isbn, '9780306406157');
  assert.equal(result.title, '');
  assert.equal(result.source, undefined);
});

test('empty Google results retain scanned title and ISBN without inventing metadata', async () => {
  const queries = [];
  const fetchFn = async url => {
    assert.equal(new URL(url).hostname, 'www.googleapis.com');
    queries.push(new URL(url).searchParams.get('q'));
    return { ok: true, json: async () => ({ totalItems: 0 }) };
  };
  const result = await lookupBookMetadata({ text: 'DESAIN PRODUK\nISBN: 9780306406157', fetchFn });
  assert.deepEqual(queries, ['isbn:9780306406157', 'intitle:DESAIN PRODUK', 'DESAIN PRODUK']);
  assert.deepEqual(result, { title: 'DESAIN PRODUK', isbn: '9780306406157', category: 'Buku', found: false });
});

test('title search broadens the Google query when the title-only query has no results', async () => {
  const queries = [];
  const fetchFn = async url => {
    queries.push(new URL(url).searchParams.get('q'));
    return { ok: true, json: async () => queries.length === 1 ? {} : ({ items: [{ volumeInfo: { title: 'Panduan Desain' } }] }) };
  };
  const result = await lookupBookMetadata({ text: 'Panduan Desain', fetchFn });
  assert.deepEqual(queries, ['intitle:Panduan Desain', 'Panduan Desain']);
  assert.equal(result.found, true);
  assert.equal(result.provider, 'Google Books');
});

test('a Google outage is reported separately from a missing book without calling another service', async () => {
  let requests = 0;
  await assert.rejects(lookupBookMetadata({ text: 'Panduan Desain', fetchFn: async url => {
    requests += 1;
    assert.equal(new URL(url).hostname, 'www.googleapis.com');
    return { ok: false, status: 429 };
  } }), /Google Books sedang membatasi/);
  assert.equal(requests, 1);
  await assert.rejects(lookupBookMetadata({ text: 'Panduan Desain', fetchFn: async () => {
    throw new TypeError('Failed to fetch');
  } }), /koneksi internet/);
});

test('manual continuation preserves the selected type and existing form fields', () => {
  const previous = { title: '', category: 'Katalog Produk', source: '', tags: ['Digital'], fileLink: 'https://example.test/file', desc: 'Catatan sendiri' };
  const draft = createBookDraft({ text: 'Judul dari Sampul' });
  const merged = applyBookMetadata(previous, draft);
  assert.equal(merged.title, 'Judul dari Sampul');
  assert.equal(merged.category, 'Katalog Produk');
  assert.equal(merged.source, '');
  assert.deepEqual(merged.tags, ['Digital']);
  assert.equal(merged.desc, 'Catatan sendiri');
  assert.equal(merged.fileLink, previous.fileLink);
});

test('Google web search links safely encode a title or ISBN', () => {
  const url = getGoogleBookSearchUrl({ text: 'Desain & Arsitektur' });
  assert.equal(new URL(url).origin, 'https://www.google.com');
  assert.equal(new URL(url).searchParams.get('q'), 'Desain & Arsitektur buku');
  assert.equal(new URL(getGoogleBookSearchUrl({ text: '9780306406157' })).searchParams.get('q'), '9780306406157 buku');
  assert.equal(getGoogleBookSearchUrl(), '');
});

test('a title fallback cannot label another Google result with the original ISBN', async () => {
  let requests = 0;
  const result = await lookupBookMetadata({ isbn: '9780306406157', text: 'Panduan Desain', fetchFn: async () => {
    requests += 1;
    return { ok: true, json: async () => requests === 1 ? {} : ({ items: [{ volumeInfo: { title: 'Panduan Desain', authors: ['Penulis'] } }] }) };
  } });
  assert.equal(result.isbn, '');
  assert.equal(result.source, '');
});
