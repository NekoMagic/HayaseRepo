// Independent RSS adapter; endpoint and feed fields require runtime verification.

function titleFrom(query) {
  const titles = query?.titles || [];
  return titles.find(t => /[a-z]/i.test(t)) || titles[0] || '';
}
function term(query, mode) {
  let q = titleFrom(query).trim();
  if (mode === 'single' && query?.episode != null) q += ' ' + String(query.episode).padStart(2,'0');
  if (mode === 'batch') q += ' Batch';
  if (query?.resolution) q += ' ' + query.resolution + 'p';
  return q;
}
function decodeXml(s) { return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function tag(xml, name) { const m = xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i')); return m ? decodeXml(m[1].trim()) : ''; }
function rssItems(xml, kind='torrent') {
 const entries = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
 return entries.map(item => {
   const title=tag(item,'title');
   const link=tag(item,'link') || tag(item,'guid');
   const magnet=(item.match(/magnet:\?[^\s<>"']+/i)||[])[0];
   const enclosure=item.match(/<enclosure[^>]+url=["']([^"']+)/i);
   const seed=(item.match(/<(?:nyaa:)?seeders>(\d+)/i)||[])[1];
   const leech=(item.match(/<(?:nyaa:)?leechers>(\d+)/i)||[])[1];
   const size=(item.match(/<enclosure[^>]+length=["'](\d+)/i)||[])[1];
   return {title,link: kind==='nzb' ? (enclosure?.[1]||link) : (magnet||enclosure?.[1]||link),hash:'',seeders:Number(seed)||0,leechers:Number(leech)||0,downloads:0,size:Number(size)||0,date:new Date(tag(item,'pubDate')||0),accuracy:'low'};
 }).filter(x=>x.title && x.link);
}
async function requestJson(url, fetcher) {const res=await fetcher(url);if(!res.ok)throw new Error('HTTP '+res.status);return res.json();}
async function requestText(url, fetcher) {const res=await fetcher(url);if(!res.ok)throw new Error('HTTP '+res.status);return res.text();}
const ENDPOINT="https://subsplease.org/rss/?r=";const KIND="torrent";

const endpoint = ENDPOINT;
async function search(query, mode){const q=term(query,mode);if(!q)return [];const url=endpoint+encodeURIComponent(q);const xml=await requestText(url,query?.fetch||globalThis.fetch);return rssItems(xml,KIND);}
export default {single(q){return search(q,'single')},batch(q){return search(q,'batch')},movie(q){return search(q,'movie')},async test(){const r=await globalThis.fetch(endpoint+'test');if(!r.ok)throw Error('RSS HTTP '+r.status);return true;}};
