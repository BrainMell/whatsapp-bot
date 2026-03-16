const play = require('play-dl');
async function test() {
    try {
        const search = await play.search('never gonna give you up', { limit: 1 });
        console.log('Search Result:', search[0].url);
        const stream = await play.stream(search[0].url);
        console.log('Stream Type:', stream.type);
    } catch (err) {
        console.error('Play-DL Error:', err.message);
    }
}
test();
