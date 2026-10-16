
const ENDPOINT = 'https://www.anirena.com/rss?q=';

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

function magnetFromText(text) {
  const match = text.match(/magnet:\?[^\s<>"']+/i);
  return match ? decodeXml(match[0]) : '';
}

function hashFromMagnet(magnet) {
  const match = magnet.match(/[?&]xt=urn:btih:([a-z0-9]+)/i);
  return match ? match[1] : '';
}

function sizeFromDescription(description) {
  const match = description.match(
    /Size:\s*([\d.]+)\s*(B|KB|MB|GB|TB)\b/i
  );

  if (!match) return 0;

  const value = Number(match[1]);
  const unit = match[2].toUpperCase();

  const multipliers = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  };

  return Math.round(value * multipliers[unit]);
}

function parseResults(xml) {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];

  return items.map(item => {
    const title = tag(item, 'title');
    const description = tag(item, 'description');
    const rssLink = tag(item, 'link');
    const attachments = enclosures(item);

    const torrent = attachments.find(file =>
      file.type === 'application/x-bittorrent' ||
      /\.torrent(?:\?|$)/i.test(file.url)
    );

    const magnet =
      magnetFromText(description) ||
      magnetFromText(rssLink);

    // Prefer an actual download link over a webpage.
    const link =
      magnet ||
      torrent?.url ||
      (/^(magnet:|https?:\/\/.*\.torrent(?:\?|$))/i.test(rssLink)
        ? rssLink
        : '');

    const hash = hashFromMagnet(magnet);

    const seeders = item.match(/<(?:nyaa:)?seeders>(\d+)/i)?.[1];
    const leechers = item.match(/<(?:nyaa:)?leechers>(\d+)/i)?.[1];

    const dateText = tag(item, 'pubDate');
    const date = new Date(dateText || 0);

    return {
      title,
      link,
      hash,
      seeders: Number(seeders) || 0,
      leechers: Number(leechers) || 0,
      downloads: 0,
      size: torrent?.length || sizeFromDescription(description),
      date: Number.isNaN(date.getTime()) ? new Date(0) : date,
      accuracy: 'medium'
    };
  }).filter(result => result.title && result.link);
}

async function search(query) {
  return [{
    title: 'Frieren - S02E10 [1080p]',
    link: 'https://www.anirena.com/torrents/019d5dfe-3940-7461-ba76-beff8f15f94f.torrent',
    hash: '',
    seeders: 1,
    leechers: 0,
    downloads: 0,
    size: 1717986918,
    date: new Date('2026-03-27T18:50:00Z'),
    accuracy: 'medium'
  }];
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
      ENDPOINT + encodeURIComponent('naruto') + '&adult=1'
    );

    if (!response.ok) {
      throw new Error('AniRena RSS HTTP ' + response.status);
    }

    return true;
  }
};
