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
    .filter(line => line.length >= 4 && line.length <= 100 && !ignored.test(line));

  return lines.slice(0, 3).join(' ').slice(0, 180);
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
    source: info.publisher || info.authors?.[0] || '',
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
  };
};

const fromOpenLibrary = (doc, fallbackIsbn = '') => {
  const isbn = fallbackIsbn || doc?.isbn?.[0] || '';
  const workKey = doc?.key?.startsWith('/works/') ? doc.key : '';
  return {
    title: doc?.title || '',
    source: doc?.publisher?.[0] || doc?.author_name?.[0] || '',
    isbn: normalizeIsbn(isbn),
    category: 'Buku',
    webLink: workKey ? `https://openlibrary.org${workKey}` : '',
    desc: buildDescription({
      authors: doc?.author_name,
      publishedDate: doc?.first_publish_year ? String(doc.first_publish_year) : '',
      isbn,
      language: doc?.language?.[0],
    }),
    coverUrl: doc?.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
    provider: 'Open Library',
  };
};

const getJson = async (url, fetchFn) => {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Layanan metadata merespons ${response.status}`);
  return response.json();
};

export const lookupBookMetadata = async ({ isbn = '', text = '', fetchFn = fetch } = {}) => {
  const normalizedIsbn = normalizeIsbn(isbn) || extractIsbn(text);
  const searchText = extractSearchText(text);
  if (!normalizedIsbn && !searchText) throw new Error('ISBN atau judul buku belum terbaca.');

  const googleQuery = normalizedIsbn ? `isbn:${normalizedIsbn}` : searchText;
  const googleBooksKey = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY?.trim();
  const keyParameter = googleBooksKey ? `&key=${encodeURIComponent(googleBooksKey)}` : '';
  try {
    const googleData = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(googleQuery)}&maxResults=5&printType=books${keyParameter}`, fetchFn);
    const bestItem = googleData.items?.find(item => item.volumeInfo?.title) || googleData.items?.[0];
    if (bestItem) return fromGoogleBook(bestItem, normalizedIsbn);
  } catch {
    // Open Library menjadi fallback saat Google Books sedang dibatasi atau tidak tersedia.
  }

  const openLibraryUrl = normalizedIsbn
    ? `https://openlibrary.org/search.json?isbn=${encodeURIComponent(normalizedIsbn)}&limit=5`
    : `https://openlibrary.org/search.json?q=${encodeURIComponent(searchText)}&limit=5`;
  const openLibraryData = await getJson(openLibraryUrl, fetchFn);
  const bestDoc = openLibraryData.docs?.find(doc => doc.title) || openLibraryData.docs?.[0];
  if (bestDoc) return fromOpenLibrary(bestDoc, normalizedIsbn);

  throw new Error('Data buku tidak ditemukan di Google Books maupun Open Library.');
};
