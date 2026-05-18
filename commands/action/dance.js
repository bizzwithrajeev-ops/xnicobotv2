const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'dance',
    description: 'Dance with someone',
    verb: 'danced with',
    emoji: '💃🕺',
    searchQuery: 'anime dancing together',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/I5sG5G7LZloAAAAC/anime-dancing.gif',
        'https://media.tenor.com/kHU8Xt6d3AAAAAC/happy-dance.gif',
        'https://media.tenor.com/d0j6xP6QvPEAAAAC/anime-dance.gif',
        'https://media.tenor.com/C6M3kYr9L0MAAAAC/dancing-anime.gif',
        'https://media.tenor.com/XcH0uR4K-YYAAAAC/dance-anime.gif'
    ]
});
