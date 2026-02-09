const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 * 24 });

async function getAnikaiBestMatch(title) {
  if (!title) return null;

  const cached = cache.get(title);
  if (cached) return cached;

  const searchUrl = `https://anikai.to/browser?keyword=${encodeURIComponent(title)}`;

  try {
    const res = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://anikai.to/',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 20000
    });

    const $ = cheerio.load(res.data);
    const firstLink = $('a[href*="/watch/"]').first().attr('href');

    let finalLink;
    if (firstLink) {
      finalLink = firstLink.startsWith('/') ? `https://anikai.to${firstLink}#ep=1` : `${firstLink}#ep=1`;
    } else {
      finalLink = searchUrl; // fallback
    }

    cache.set(title, finalLink);
    return finalLink;

  } catch (err) {
    console.error('Anikai Axios resolver error:', err.message);
    cache.set(title, searchUrl);
    return searchUrl;
  }
}

module.exports = { getAnikaiBestMatch };
