
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

function nzbEnclosure(item) {
  const elements = item.match(/<enclosure\b[^>]*\/?>/gi) || [];

  for (const element of elements) {
    const url = element.match(/\burl=["']([^"']+)["']/i)?.[1];
    const type = element.match(/\btype=["']([^"']+)["']/i)?.[1];

    if (!url) continue;

    const decodedUrl = decodeXml(url);

    if (
      type === 'application/x-nzb' ||
      /\.nzb(?:\?|$)/i.test(decodedUrl) ||
      /\/nzb\/\d+/i.test(decodedUrl)
    ) {
      return decodedUrl;
    }
  }

  return '';
}

function parseResults(xml) {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];

  return items.map(item => {
    const title = tag(item, 'title');
    const link = nzbEnclosure(item);
    const dateText = tag(item, 'pubDate');
    const date = new Date(dateText || 0);

    return {
      title,
      link,
      hash: '',
      seeders: 0,
      leechers: 0,
      downloads: 0,
      size: 0,
      date: Number.isNaN(date.getTime()) ? new Date(0) : date,
      accuracy: 'medium'
    };
  }).filter(result => result.title && result.link);
}

async function search(query) {
  const title = String(titleFrom(query)).trim();
  if (!title) return [];

  const fetcher = query?.fetch || globalThis.fetch;
  const response = await fetcher(
    ENDPOINT + encodeURIComponent(title)
  );

  if (!response.ok) {
    throw new Error('AnimeTosho NZB RSS HTTP ' + response.status);
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
      throw new Error('AnimeTosho NZB RSS HTTP ' + response.status);
    }

    return true;
  }
};
