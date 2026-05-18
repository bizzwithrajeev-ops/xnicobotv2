const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'kiss',
    description: 'Give someone a kiss',
    verb: 'kissed',
    emoji: ':kissing_heart:',
    searchQuery: 'anime kiss',
    aliases: ['smooch'],
    selfMessage: 'Try finding someone else!',
    fallbackGifs: [
        'https://media.tenor.com/sOu1GcGPGH4AAAAC/kiss-anime.gif',
        'https://media.tenor.com/Y6cm2lOwwKAAAAAC/anime-kiss.gif',
        'https://media.tenor.com/G-pKjg94WfsAAAAC/kiss-love.gif',
        'https://media.tenor.com/FrFSJrHWJ-MAAAAC/anime-kiss-cheek.gif',
        'https://media.tenor.com/e-FMCnUqGPEAAAAC/anime-kiss.gif'
    ]
});
