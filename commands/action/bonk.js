const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'bonk',
    description: 'Bonk someone on the head',
    verb: 'bonked',
    emoji: ':hammer:',
    searchQuery: 'anime bonk head',
    aliases: ['bop'],
    fallbackGifs: [
        'https://media.tenor.com/wHe2MWpDyJkAAAAC/bonk-anime.gif',
        'https://media.tenor.com/Ws6Dm1ZS--IAAAAC/bonk-meme.gif',
        'https://media.tenor.com/hH-TFIVmSIEAAAAC/anime-bonk.gif',
        'https://media.tenor.com/fBvRlsEIOBkAAAAC/anime-slap.gif',
        'https://media.tenor.com/3eBYPJsVynYAAAAC/bonk-anime.gif'
    ]
});
