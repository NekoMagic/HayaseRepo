
const BASE = 'https://feed.animetosho.org/json';
const QUALITIES = ['1080', '720', '540', '480'];
const FAKE_PEER_THRESHOLD = 30000;

function buildQ(resolution, exclusions) {
  const groups = [];

  const excluded = (exclusions || [])
    .map(value => String(value).trim())
    .filter(Boolean);

  if (excluded.length) {
    groups.push(
      '!(' + excluded.map(value => `"${value}"`).join('|') + ')'
    );
  }

  if (resolution) {
    const other = QUALITIES.filter(
      quality => quality !== String(resolution)
    );

    if (other.length) {
      groups.push(
        '!(' + other.map(quality => `*${quality}*`).join('|') + ')'
      );
    }
  }

  return groups.join('');
}

function buildUrl(params, resolution, exclusions) {
  const searchParams = new URLSearchParams(params);
  const q = buildQ(resolution, exclusions);

  if (q) {
    searchParams.set('qx', '1');
    searchParams.set('q', q);
  }

  return BASE + '?' + searchParams.toString();
}

function cleanPeers(value) {
  const count = Number(value) || 0;
  return count >= FAKE_PEER_THRESHOLD ? 0 : count;
}

function mapEntry(entry, batch = false) {
  const title = entry.title || entry.torrent_name || '';
  const hash = String(entry.info_hash || '').toLowerCase();

  const link = entry.magnet_uri ||
    (hash ? 'magnet:?xt=urn:btih:' + hash : '');

  const result = {
    title,
    link,
    hash,
    seeders: cleanPeers(entry.seeders),
    leechers: cleanPeers(entry.leechers),
    downloads: Number(entry.torrent_downloaded_count) || 0,
    size: Number(entry.total_size) || 0,
    date: entry.timestamp
      ? new Date(Number(entry.timestamp) * 1000)
      : new Date(0),
    accuracy: entry.anidb_fid ? 'high' : 'medium'
  };

  if (batch) {
    result.type = 'batch';
  }

  return result;
}

async function fetchJson(fetcher, url) {
  let response;

  try {
    response = await fetcher(url);
  } catch (error) {
    throw new Error(
      'AnimeTosho network request failed: ' +
      (error?.message || error)
    );
  }

  if (!response.ok) {
    throw new Error(
      'AnimeTosho returned HTTP ' + response.status
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(
      'AnimeTosho returned invalid JSON'
    );
  }
}

function convertResults(data, batch = false) {
  if (!Array.isArray(data)) return [];

  return data
    .map(entry => mapEntry(entry, batch))
    .filter(result => result.title && result.link);
}

export default {
  async test() {
    const response = await globalThis.fetch(BASE);

    if (!response.ok) {
      throw new Error(
        'AnimeTosho is unreachable (HTTP ' +
        response.status + ')'
      );
    }

    return true;
  },

  async single(query) {
    const fetcher = query?.fetch || globalThis.fetch;
    const episodeId = query?.anidbEid;

    if (!episodeId) {
      throw new Error(
        'AnimeTosho requires an AniDB episode ID. ' +
        'Hayase did not provide one for this episode.'
      );
    }

    const url = buildUrl(
      { eid: String(episodeId) },
      query?.resolution,
      query?.exclusions
    );

    const data = await fetchJson(fetcher, url);
    return convertResults(data);
  },

  async batch(query) {
    const fetcher = query?.fetch || globalThis.fetch;
    const animeId = query?.anidbAid;

    if (!animeId) {
      throw new Error(
        'AnimeTosho requires an AniDB anime ID ' +
        'for batch searches.'
      );
    }

    const url = buildUrl(
      {
        aid: String(animeId),
        order: 'size-d'
      },
      query?.resolution,
      query?.exclusions
    );

    const data = await fetchJson(fetcher, url);

    if (!Array.isArray(data)) return [];

    const episodeCount = Number(query?.episodeCount);

    const filtered = episodeCount > 0
      ? data.filter(entry =>
          Number(entry.num_files) >= episodeCount
        )
      : data;

    return convertResults(filtered, true);
  },

  async movie(query) {
    const fetcher = query?.fetch || globalThis.fetch;
    const animeId = query?.anidbAid;

    if (!animeId) {
      throw new Error(
        'AnimeTosho requires an AniDB anime ID ' +
        'for movie searches.'
      );
    }

    const url = buildUrl(
      { aid: String(animeId) },
      query?.resolution,
      query?.exclusions
    );

    const data = await fetchJson(fetcher, url);
    return convertResults(data);
  }
};
