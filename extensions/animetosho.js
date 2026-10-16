
const ENDPOINT = 'https://feed.animetosho.net/rss2?q=';

function titleFrom(query) {
  const titles = query?.titles || [];
  return titles.find(t => /[a-z]/i.test(t)) || titles[0] || '';
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

function tag(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    '<' + escaped + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + escaped + '>',
    'i'
  );
  const match = xml.match(pattern);
  return match ? decodeXml(match[1].trim()) : '';
}

function enclosures(xml) {
  const found = [];
  const pattern = /<enclosure\b[^>]*\/?>/gi;

  for (const match of xml.matchAll(pattern)) {
    const element = match[0];
    const url = element.match(/\burl=["']([^"']+)["']/i)?.[1];
    const type = element.match(/\btype=["']([^"']+)["']/i)?.[1];
    const length = element.match(/\blength=["'](\d+)["']/i)?.[1];

    if (url) {
      found.push({
        url: decodeXml(url),
        type: type || '',
        length: Number(length) || 0
      });
    }
  }

  return found;
}

function magnetFromDescription(description) {
  const match = description.match(/magnet:\?[^\s<>"']+/i);
  return match ? decodeXml(match[0]) : '';
}

function hashFromMagnet(magnet) {
  const match = magnet.match(/[?&]xt=urn:btih:([a-z0-9]+)/i);
  return match ? match[1] : '';
}

function parseResults(xml) {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];

  return items.map(item => {
    const title = tag(item, 'title');
    const description = tag(item, 'description');
    const attachments = enclosures(item);

    const torrent = attachments.find(file =>
      file.type === 'application/x-bittorrent' ||
      /\.torrent(?:\?|$)/i.test(file.url)
    );

    const magnet = magnetFromDescription(description);
    const link = magnet || torrent?.url || '';
    const hash = hashFromMagnet(magnet);

    const dateText = tag(item, 'pubDate');
    const date = new Date(dateText || 0);

    return {
      title,
      link,
      hash,
      seeders: 0,
      leechers: 0,
      downloads: 0,
      size: torrent?.length || 0,
      date: Number.isNaN(date.getTime()) ? new Date(0) : date,
      accuracy: 'medium'
    };
  }).filter(result => result.title && result.link);
}

function requestedEpisode(query) {
  const raw = query?.episode;

  if (raw == null || raw === '') return null;

  const episode = Number(raw);

  return Number.isInteger(episode) && episode >= 0
    ? episode
    : null;
}

function matchesEpisode(title, episode) {
  if (episode == null) return true;

  const text = String(title);

  // Season and episode: S02E04, S2.E4
  const seasonEpisode = text.match(
    /\bS\d{1,2}[\s._-]*E(?:P)?[\s._-]*(\d{1,3})\b/i
  );

  if (seasonEpisode) {
    return Number(seasonEpisode[1]) === episode;
  }

  // Season and episode: S2 - 04
  const seasonDash = text.match(
    /\bS\d{1,2}\s*[-–]\s*(\d{1,3})(?:v\d+)?(?=\s|$|[.[(])/i
  );

  if (seasonDash) {
    return Number(seasonDash[1]) === episode;
  }

  // Alternative format: 2x04
  const alternate = text.match(/\b\d{1,2}x(\d{1,3})\b/i);

  if (alternate) {
    return Number(alternate[1]) === episode;
  }

  // Batch ranges: (01-12), [01~12], E01-E12
  const range = text.match(
    /(?:^|[\s[(])(?:E(?:P)?\s*)?(\d{1,3})\s*[-~]\s*(?:E(?:P)?\s*)?(\d{1,3})(?=\s|$|[\])])/i
  );

  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);

    if (start <= end) {
      return episode >= start && episode <= end;
    }
  }

  // Common anime naming: Anime - 04, Anime - 04v2
  const dashEpisode = text.match(
    /(?:^|[\s\]])[-–]\s*(\d{1,3})(?:v\d+)?(?=\s|$|[.[(])/i
  );

  if (dashEpisode) {
    return Number(dashEpisode[1]) === episode;
  }

  // E04, EP04
  const episodeTag = text.match(
    /\bEP?[\s._-]*(\d{1,3})\b/i
  );

  if (episodeTag) {
    return Number(episodeTag[1]) === episode;
  }

  // No identifiable episode number.
  return false;
}

async function search(query) {
  const title = String(titleFrom(query)).trim();
  if (!title) return [];

  const fetcher = query?.fetch || globalThis.fetch;
  const response = await fetcher(
    ENDPOINT + encodeURIComponent(title)
  );

  if (!response.ok) {
    throw new Error('AnimeTosho RSS HTTP ' + response.status);
  }

  const results = parseResults(await response.text());
  const episode = requestedEpisode(query);

  if (episode == null) {
    return results;
  }

  return results.filter(result =>
    matchesEpisode(result.title, episode)
  );
}

export default {
  single(query) {
    return search(query);
  },

  batch(query) {
    return search(query);
  },

  movie(query) {
    return search(query);
  },

  async test() {
    const response = await globalThis.fetch(
      ENDPOINT + encodeURIComponent('naruto')
    );

    if (!response.ok) {
      throw new Error('AnimeTosho RSS HTTP ' + response.status);
    }

    return true;
  }
};
