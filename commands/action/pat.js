const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'pat',
    description: 'Pat someone on the head',
    verb: 'patted',
    emoji: '✋',
    searchQuery: 'anime head pat',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/tL7u-WIxJz8AAAAC/headpat-cute.gif',
        'https://media.tenor.com/h0zV2P8bD7AAAAAC/anime-head-pat.gif',
        'https://media.tenor.com/YcFcJ8C0ZZQAAAAC/head-pat-anime.gif',
        'https://media.tenor.com/3J1Y5fG-3dEAAAAC/pat-anime.gif',
        'https://media.tenor.com/BZU_7WCQ9poAAAAC/anime-pat.gif'
    ]
});
