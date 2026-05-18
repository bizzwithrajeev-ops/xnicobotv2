const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'peck',
    description: 'Give someone a quick peck',
    verb: 'gave a peck to',
    emoji: '😘',
    searchQuery: 'anime peck kiss',
    aliases: ['quickkiss'],
    fallbackGifs: [
        'https://media.tenor.com/0aK9Q4v0x6EAAAAC/anime-peck.gif',
        'https://media.tenor.com/fmA5WQYxU0wAAAAC/peck-kiss-anime.gif',
        'https://media.tenor.com/Y6cm2lOwwKAAAAAC/anime-kiss.gif',
        'https://media.tenor.com/sOu1GcGPGH4AAAAC/kiss-anime.gif',
        'https://media.tenor.com/e-FMCnUqGPEAAAAC/anime-kiss.gif'
    ]
});
