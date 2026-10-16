
// NekoMagic SeaDex adapter.
// Uses the public releases.moe PocketBase API.

const ENDPOINT =
  'https://releases.moe/api/collections/entries/records';

function magnet(hash, name) {
  return 'magnet:?xt=urn:btih:' + hash +
    (name ? '&dn=' + encodeURIComponent(name) : '');
}

function videoFiles(files) {
  return (Array.isArray(files) ? files : []).filter(file =>
    /\.(mkv|mp4|avi|webm|m2ts)$/i.test(String(file?.name || ''))
  );
}

function episodeFromFilename(filename) {
  const name = String(filename || '');

  // S01E04, S1.E04, S01_E04
  const seasonEpisode = name.match(
    /\bS(\d{1,2})[\s._-]*E(?:P)?[\s._-]*(\d{1,3})\b/i
  );

  if (seasonEpisode) {
    return {
      season: Number(seasonEpisode[1]),
      episode: Number(seasonEpisode[2])
    };
  }

  // 1x04
  const alternate = name.match(
    /\b(\d{1,2})x(\d{1,3})\b/i
  );

  if (alternate) {
    return {
      season: Number(alternate[1]),
      episode: Number(alternate[2])
    };
  }

  // Anime - 04
  const dashEpisode = name.match(
    /(?:^|[\s\]])[-–]\s*(\d{1,3})(?:v\d+)?(?=\s|$|[.[(])/i
  );

  if (dashEpisode) {
    return {
      season: null,
      episode: Number(dashEpisode[1])
    };
  }

  return null;
}

function requestedEpisode(query) {
  const value = Number(query?.episode);

  return Number.isInteger(value) && value > 0
    ? value
    : null;
}

function requestedSeason(query) {
  const value = Number(query?.season);

  return Number.isInteger(value) && value > 0
    ? value
    : null;
}

function matchesRequestedEpisode(files, query) {
  const episode = requestedEpisode(query);

  if (episode == null) return true;

  const season = requestedSeason(query);
  const videos = videoFiles(files);

  if (!videos.length) return false;

  const parsed = videos
    .map(file => episodeFromFilename(file.name))
    .filter(Boolean);

  if (!parsed.length) {
    // Unknown naming convention; don't exclude a curated release.
    return true;
  }

  return parsed.some(file =>
    file.episode === episode &&
    (season == null ||
      file.season == null ||
      file.season === season)
  );
}

function releaseTitle(record, fallback) {
  const files = Array.isArray(record?.files)
    ? record.files
    : [];

  const videos = videoFiles(files);
  const group = record?.releaseGroup
    ? `[${record.releaseGroup}] `
    : '';

  if (videos.length > 1) {
    return group + fallback +
      ` [Pack - ${videos.length} video files]` +
      (record?.dualAudio ? ' (Dual Audio)' : '');
  }

  const first = videos[0]?.name ||
    files[0]?.name ||
    fallback;

  return group + first +
    (record?.dualAudio ? ' (Dual Audio)' : '');
}

function convert(record, fallback) {
  const hash = String(
    record?.infoHash || ''
  ).trim().toLowerCase();

  if (!/^[0-9a-f]{40}$/.test(hash)) return null;

  const files = Array.isArray(record.files)
    ? record.files
    : [];

  const title = releaseTitle(record, fallback);

  const size = files.reduce(
    (sum, file) =>
      sum + Math.max(0, Number(file?.length) || 0),
    0
  );

  const parsedDate = Date.parse(record.created || '');

  return {
    title,
    link: magnet(hash, title),
    hash,
    seeders: 0,
    leechers: 0,
    downloads: 0,
    size,
    date: Number.isFinite(parsedDate)
      ? new Date(parsedDate)
      : new Date(0),
    accuracy: 'high',
    type: record.isBest ? 'best' : 'alt',
    _videoCount: videoFiles(files).length
  };
}

async function request(url, fetcher) {
  let response;

  try {
    response = await fetcher(url);
  } catch (error) {
    throw new Error(
      'SeaDex network request failed: ' +
      (error?.message || error)
    );
  }

  if (!response.ok) {
    throw new Error(
      'SeaDex API returned HTTP ' + response.status
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error('SeaDex API returned invalid JSON');
  }
}

async function lookup(query, mode) {
  const id = Number(query?.anilistId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return [];
  }

  const fetcher = query?.fetch || globalThis.fetch;

  const params = new URLSearchParams({
    page: '1',
    perPage: '10',
    skipTotal: '1',
    expand: 'trs',
    filter: `alID=${id}`
  });

  const response = await request(
    ENDPOINT + '?' + params,
    fetcher
  );

  const items = Array.isArray(response?.items)
    ? response.items
    : [];

  const results = [];
  const seen = new Set();

  for (const item of items) {
    const releases = item?.expand?.trs;

    if (!Array.isArray(releases)) continue;

    for (const release of releases) {
      const files = Array.isArray(release.files)
        ? release.files
        : [];

      if (
        mode === 'single' &&
        !matchesRequestedEpisode(files, query)
      ) {
        continue;
      }

      const result = convert(
        release,
        query?.titles?.[0] || `AniList ${id}`
      );

      if (!result || seen.has(result.hash)) {
        continue;
      }

      if (
        mode === 'batch' &&
        Number(query?.episodeCount) > 1 &&
        result._videoCount < Number(query.episodeCount)
      ) {
        continue;
      }

      if (
        (query?.exclusions || []).some(word =>
          word &&
          result.title.toLowerCase().includes(
            String(word).toLowerCase()
          )
        )
      ) {
        continue;
      }

      seen.add(result.hash);
      delete result._videoCount;
      results.push(result);
    }
  }

  return results;
}

export default {
  async test() {
    const result = await request(
      ENDPOINT + '?page=1&perPage=1&skipTotal=1',
      globalThis.fetch
    );

    if (!Array.isArray(result?.items)) {
      throw new Error(
        'SeaDex API response is missing its items array'
      );
    }

    return true;
  },

  single(query) {
    return lookup(query, 'single');
  },

  batch(query) {
    return lookup(query, 'batch');
  },

  movie(query) {
    return lookup(query, 'movie');
  }
};
