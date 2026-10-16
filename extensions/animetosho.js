
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

async function search(query) {
  const title = String(titleFrom(query)).trim();
  if (!title) return [];

  const fetcher = query?.fetch || globalThis.fetch;
  const response = await fetcher(ENDPOINT + encodeURIComponent(title));

  if (!response.ok) {
    throw new Error('AnimeTosho RSS HTTP ' + response.status);
  }

  return parseResults(await response.text());
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
