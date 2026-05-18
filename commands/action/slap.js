const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'slap',
    description: 'Slap someone (just for fun!)',
    verb: 'slapped',
    emoji: ':punch:',
    searchQuery: 'anime slap',
    aliases: ['smack'],
    selfMessage: 'Find someone else to slap!',
    fallbackGifs: [
        'https://media.tenor.com/x8v1oNUOmg4AAAAC/rachel-green-jennifer-aniston.gif',
        'https://media.tenor.com/cOYzZjHIHe8AAAAC/anime-slap.gif',
        'https://media.tenor.com/EiJ3su_P6EQAAAAC/slap-bear.gif',
        'https://media.tenor.com/vPB1SmXZemcAAAAC/anime-slap.gif',
        'https://media.tenor.com/96KQLhH8uO4AAAAC/slap-girl.gif'
    ]
});
