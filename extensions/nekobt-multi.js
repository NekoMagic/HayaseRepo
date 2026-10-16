
// NekoBT torrent search adapter using the public JSON API.
const API = 'https://nekobt.to/api/v1/torrents/search';

function titleFrom(query) {
  const titles = query?.titles || [];
  return titles.find(t => /[a-z]/i.test(t)) || titles[0] || '';
}

function term(query, mode) {
  let q = String(titleFrom(query)).trim();

  if (mode === 'single' && query?.episode != null) {
    q += ' ' + String(query.episode).padStart(2, '0');
  }

  if (mode === 'batch') q += ' Batch';
  if (query?.resolution) q += ' ' + query.resolution + 'p';

  return q.trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value) {
  if (value == null || value === '') return new Date(0);

  const n = Number(value);
  if (Number.isFinite(n)) {
    return new Date(n < 1e12 ? n * 1000 : n);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function toResult(item) {
  const hash = String(item.infohash || item.info_hash || '').trim();
  const magnet = String(item.magnet || '').trim();

  const link = magnet ||
    (hash ? 'magnet:?xt=urn:btih:' + encodeURIComponent(hash) : '') ||
    (item.id != null
      ? 'https://nekobt.to/api/v1/torrents/' +
        encodeURIComponent(String(item.id)) + '/download'
      : '');

  return {
    title: String(item.title || item.name || ''),
    link,
    hash,
    seeders: toNumber(item.seeders),
    leechers: toNumber(item.leechers),
    downloads: toNumber(item.completed ?? item.downloads),
    size: toNumber(item.filesize ?? item.size),
    date: toDate(item.uploaded_at ?? item.created_at),
    accuracy: 'medium'
  };
}

async function requestJson(url, fetcher) {
  const response = await fetcher(url);

  if (!response.ok) {
    throw new Error('NekoBT API HTTP ' + response.status);
  }

  return response.json();
}

function isMultiSub(item) {
  // Prefer NekoBT's structured subtitle-language metadata.
  const languages = new Set(
  [item.sub_lang, item.fsub_lang]
    .flatMap(value =>
      Array.isArray(value)
        ? value
        : String(value || '').split(',')
    )
    .map(lang => String(lang).trim().toLowerCase())
    .filter(lang => lang && lang !== 'null')
);

  if (languages.size >= 2) return true;

  // Explicit MultiSub labels in titles or descriptions.
  const title = String(item.title || '');
  const description = String(item.description || '');

  const multiSubLabel =
    /\bmulti[\s._-]*(?:sub|subs|subtitle|subtitles)\b/i;

  if (multiSubLabel.test(title) ||
      multiSubLabel.test(description)) {
    return true;
  }

  // Explicit lists of subtitle languages in descriptions.
  const languageNames =
    /\b(english|japanese|spanish|french|german|italian|portuguese|arabic|chinese|korean|russian|indonesian|thai|vietnamese|turkish|polish|dutch|hindi)\b/gi;

  const subtitleSection =
    description.match(
      /(?:subtitle languages|subtitle tracks|subtitles|softsubs|fansubs)\s*[:\-]\s*([^\n\r]{1,200})/i
    );

  if (subtitleSection) {
    const matches = subtitleSection[1].match(languageNames) || [];
    const uniqueLanguages = new Set(
      matches.map(lang => lang.toLowerCase())
    );

    if (uniqueLanguages.size >= 2) return true;
  }

  return false;
}

async function search(query, mode) {
  const q = term(query, mode);
  if (!q) return [];

  const url = API + '?query=' + encodeURIComponent(q) + '&limit=50';
  const data = await requestJson(
    url,
    query?.fetch || globalThis.fetch
  );

  if (data.error) {
    throw new Error('NekoBT API returned an error');
  }

  const results = data?.data?.results;

  if (!Array.isArray(results)) {
    throw new Error('Unexpected NekoBT API response');
  }

  return results
    .filter(isMultiSub)
    .map(toResult)
    .filter(r => r.title && r.link);
}

export default {
  single(q) {
    return search(q, 'single');
  },

  batch(q) {
    return search(q, 'batch');
  },

  movie(q) {
    return search(q, 'movie');
  },

  async test() {
    const data = await requestJson(
      API + '?query=naruto&limit=1',
      globalThis.fetch
    );

    if (data.error || !Array.isArray(data?.data?.results)) {
      throw new Error('NekoBT API test failed');
    }

    return true;
  }
};
