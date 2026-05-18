const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'stare',
    description: 'Stare at someone',
    verb: 'stared at',
    emoji: '👀',
    searchQuery: 'anime stare intense',
    aliases: ['glare'],
    fallbackGifs: [
        'https://media.tenor.com/pj06YT9EaVEAAAAC/stare-anime.gif',
        'https://media.tenor.com/3R0NQsqvD3EAAAAC/anime-stare.gif',
        'https://media.tenor.com/B5YBSbTPB0wAAAAC/intense-stare.gif',
        'https://media.tenor.com/lSNpZILoZAUAAAAC/anime-glare.gif',
        'https://media.tenor.com/NWFDUfKb808AAAAC/serious-stare.gif'
    ]
});
