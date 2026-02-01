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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
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
