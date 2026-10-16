// Independent NekoMagic API adapter. Runtime behavior not yet verified.

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

const SITE = 'sukebei';

const endpoint = 'https://nyaasi-api.vercel.app/api/search';
async function search(query, mode) {
 const fetcher=query?.fetch||globalThis.fetch;
 const title=titleFrom(query); if(!title)return [];
 const params=new URLSearchParams({q:term(query,mode),title,site:SITE,category:'1_0',batch:String(mode==='batch')});
 if(query?.episode!=null)params.set('episode',String(query.episode));
 if(query?.absoluteEpisodeNumber!=null)params.set('absoluteEpisode',String(query.absoluteEpisodeNumber));
 if(query?.resolution)params.set('resolution',String(query.resolution));
 if(query?.exclusions?.length)params.set('exclusions',query.exclusions.join(','));
 const data=await requestJson(endpoint+'?'+params,fetcher);
 if(!Array.isArray(data))throw new Error('Unexpected API response');
 return data.map(x=>({title:x.title||'Unknown',link:x.link||x.magnet||'',hash:x.hash||'',seeders:Number(x.seeders)||0,leechers:Number(x.leechers)||0,downloads:Number(x.downloads)||0,size:Number(x.size)||0,date:new Date(x.date||0),accuracy:x.accuracy||'low'})).filter(x=>x.link);
}
export default {
 single(query){return search(query,'single')},batch(query){return search(query,'batch')},movie(query){return search(query,'movie')},
 async test(){const res=await globalThis.fetch(endpoint+'?q=test&site='+SITE+'&category=1_0');if(!res.ok)throw new Error('API HTTP '+res.status);return true;}
};
