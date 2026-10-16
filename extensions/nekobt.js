
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

  return results.map(toResult).filter(r => r.title && r.link);
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
