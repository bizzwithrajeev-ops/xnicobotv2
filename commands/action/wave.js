const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'wave',
    description: 'Wave at someone',
    verb: 'waved at',
    emoji: ':wave:',
    searchQuery: 'anime wave hello',
    aliases: ['hi', 'hello'],
    selfAllowed: true,
    fallbackGifs: [
        'https://media.tenor.com/NLjjpBb3aLkAAAAC/anime-wave.gif',
        'https://media.tenor.com/HY-1cZrhEBQAAAAC/wave-anime.gif',
        'https://media.tenor.com/L0kJ4TRW1REAAAAC/anime-wave.gif',
        'https://media.tenor.com/oI-nVJPBGfwAAAAC/anime-wave.gif',
        'https://media.tenor.com/S7jgbjWg9a4AAAAC/cute-anime.gif'
    ]
});
