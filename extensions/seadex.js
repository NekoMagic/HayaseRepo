// NekoMagic SeaDex adapter for the public releases.moe PocketBase API.
// Uses the service's documented collection fields, not third-party extension code.
const ENDPOINT = 'https://releases.moe/api/collections/entries/records';

function magnet(hash, name) {
  return 'magnet:?xt=urn:btih:' + hash + (name ? '&dn=' + encodeURIComponent(name) : '');
}

function videoFiles(files) {
  return (Array.isArray(files) ? files : []).filter(f => /\.(mkv|mp4|avi|webm|m2ts)$/i.test(String(f?.name || '')));
}

function convert(record, fallback) {
  const hash = String(record?.infoHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hash)) return null;
  const files = Array.isArray(record.files) ? record.files : [];
  const first = videoFiles(files)[0]?.name || files[0]?.name || fallback;
  const group = record.releaseGroup ? `[${record.releaseGroup}] ` : '';
  const title = group + first + (record.dualAudio ? ' (Dual Audio)' : '');
  const size = files.reduce((sum, file) => sum + Math.max(0, Number(file?.length) || 0), 0);
  const parsed = Date.parse(record.created || '');
  return {
    title, link: magnet(hash, title), hash,
    seeders: 0, leechers: 0, downloads: 0,
    size, date: Number.isFinite(parsed) ? new Date(parsed) : new Date(0),
    accuracy: 'high', type: record.isBest ? 'best' : 'alt',
    _videoCount: videoFiles(files).length
  };
}

async function request(url, fetcher) {
  let response;
  try { response = await fetcher(url); }
  catch (error) { throw new Error('SeaDex network request failed: ' + (error?.message || error)); }
  if (!response.ok) throw new Error('SeaDex API returned HTTP ' + response.status);
  try { return await response.json(); }
  catch { throw new Error('SeaDex API returned invalid JSON'); }
}

async function lookup(query, mode) {
  const id = Number(query?.anilistId);
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  const fetcher = query?.fetch || globalThis.fetch;
  const params = new URLSearchParams({
    page: '1', perPage: '10', skipTotal: '1', expand: 'trs', filter: `alID=${id}`
  });
  const response = await request(ENDPOINT + '?' + params, fetcher);
  const items = Array.isArray(response?.items) ? response.items : [];
  const results = [];
  const seen = new Set();
  for (const item of items) {
    const releases = item?.expand?.trs;
    if (!Array.isArray(releases)) continue;
    for (const release of releases) {
      const result = convert(release, query?.titles?.[0] || `AniList ${id}`);
      if (!result || seen.has(result.hash)) continue;
      if (mode === 'batch' && Number(query?.episodeCount) > 1 && result._videoCount < Number(query.episodeCount)) continue;
      if ((query?.exclusions || []).some(word => word && result.title.toLowerCase().includes(String(word).toLowerCase()))) continue;
      seen.add(result.hash);
      delete result._videoCount;
      results.push(result);
    }
  }
  return results;
}

export default {
  async test() {
    const result = await request(ENDPOINT + '?page=1&perPage=1&skipTotal=1', globalThis.fetch);
    if (!Array.isArray(result?.items)) throw new Error('SeaDex API response is missing its items array');
    return true;
  },
  single(query) { return lookup(query, 'single'); },
  batch(query) { return lookup(query, 'batch'); },
  movie(query) { return lookup(query, 'movie'); }
};
