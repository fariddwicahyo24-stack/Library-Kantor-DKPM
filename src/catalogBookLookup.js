const ISBN_LABEL_PATTERN = /(?:ISBN(?:-1[03])?\s*[:#]?\s*)?((?:97[89][\s.-]?)?\d[\d\s.-]{8,16}[\dXx])/gi;

export const normalizeIsbn = (value = '') => value.replace(/[^0-9X]/gi, '').toUpperCase();

export const isValidIsbn = (value) => {
  const isbn = normalizeIsbn(value);
  if (isbn.length === 13) {
    const sum = isbn.slice(0, 12).split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(isbn[12]);
  }
  if (isbn.length === 10) {
    const sum = isbn.split('').reduce((total, digit, index) => {
      const valueAtIndex = digit === 'X' ? 10 : Number(digit);
      return total + valueAtIndex * (10 - index);
    }, 0);
    return sum % 11 === 0;
  }
  return false;
};

export const extractIsbn = (text = '') => {
  for (const match of text.matchAll(ISBN_LABEL_PATTERN)) {
    const candidate = normalizeIsbn(match[1]);
    if (isValidIsbn(candidate)) return candidate;
  }
  return '';
};

export const extractSearchText = (text = '') => {
  const ignored = /^(isbn|penerbit|publisher|copyright|dicetak|printed|www\.|http|edisi|edition|halaman|pages?\b)/i;
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/[^\p{L}\p{N}\s:'&.,-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 4 && line.length <= 100 && !ignored.test(line) && !/^[\dXx\s.-]+$/.test(line));

  return lines.slice(0, 3).join(' ').slice(0, 180);
};

export const createBookDraft = ({ isbn = '', text = '' } = {}) => ({
  title: extractSearchText(text),
  isbn: normalizeIsbn(isbn) || extractIsbn(text),
  category: 'Buku',
  found: false,
});

export const getGoogleBookSearchUrl = ({ isbn = '', text = '' } = {}) => {
  const draft = createBookDraft({ isbn, text });
  const term = draft.isbn || draft.title;
  return term ? `https://www.google.com/search?q=${encodeURIComponent(`${term} buku`)}` : '';
};

export const applyBookMetadata = (previous, metadata) => {
  const updates = {};
  for (const field of ['title', 'source', 'isbn', 'category', 'webLink', 'desc']) {
    if (field === 'category' && !metadata.found) continue;
    if (metadata[field]) updates[field] = metadata[field];
  }
  return { ...previous, ...updates };
};

const buildDescription = ({ authors = [], publishedDate = '', pageCount, isbn = '', description = '', language = '' }) => {
  const facts = [];
  if (authors.length) facts.push(`Penulis: ${authors.join(', ')}`);
  if (publishedDate) facts.push(`Terbit: ${publishedDate}`);
  if (isbn) facts.push(`ISBN: ${isbn}`);
  if (pageCount) facts.push(`${pageCount} halaman`);
  if (language) facts.push(`Bahasa: ${language.toUpperCase()}`);
  if (description) facts.push(description.trim());
  return facts.join(' · ').slice(0, 1500);
};

const fromGoogleBook = (item, fallbackIsbn = '') => {
  const info = item?.volumeInfo || {};
  const isbn = fallbackIsbn || info.industryIdentifiers?.find(identifier => identifier.type === 'ISBN_13')?.identifier || info.industryIdentifiers?.[0]?.identifier || '';
  return {
    title: info.title ? `${info.title}${info.subtitle ? `: ${info.subtitle}` : ''}` : '',
    source: info.publisher || '',
    isbn: normalizeIsbn(isbn),
    category: 'Buku',
    webLink: info.infoLink || info.previewLink || '',
    desc: buildDescription({
      authors: info.authors,
      publishedDate: info.publishedDate,
      pageCount: info.pageCount,
      isbn,
      description: info.description,
      language: info.language,
    }),
    coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, 'https:') || '',
    provider: 'Google Books',
    found: true,
  };
};

const getJson = async (url, fetchFn) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchFn(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 429
      ? 'Google Books sedang membatasi pencarian. Coba Cari di Google atau lanjut isi form.'
      : `Google Books belum dapat diakses (${response.status}). Coba Cari di Google atau lanjut isi form.`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TypeError') {
      throw new Error('Tidak dapat terhubung ke Google Books. Periksa koneksi internet, atau lanjut isi form.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const lookupBookMetadata = async ({ isbn = '', text = '', fetchFn = fetch } = {}) => {
  const draft = createBookDraft({ isbn, text });
  const normalizedIsbn = draft.isbn;
  const searchText = draft.title;
  if (!normalizedIsbn && !searchText) throw new Error('ISBN atau judul buku belum terbaca.');

  const googleBooksKey = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY?.trim();
  const keyParameter = googleBooksKey ? `&key=${encodeURIComponent(googleBooksKey)}` : '';
  const queries = [...new Set([
    ...(normalizedIsbn ? [`isbn:${normalizedIsbn}`] : []),
    ...(searchText ? [`intitle:${searchText}`, searchText] : []),
  ])];
  for (const googleQuery of queries) {
    const googleData = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(googleQuery)}&maxResults=5&printType=books${keyParameter}`, fetchFn);
    const bestItem = googleData.items?.find(item => item.volumeInfo?.title);
    if (bestItem) return fromGoogleBook(bestItem, googleQuery.startsWith('isbn:') ? normalizedIsbn : '');
  }
  return draft;
};
