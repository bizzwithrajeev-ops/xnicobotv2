const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'cry',
    description: 'Cry with someone',
    verb: 'cried with',
    emoji: '😭',
    searchQuery: 'anime crying sad',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/3iQWEkKgqQEAAAAC/anime-cry.gif',
        'https://media.tenor.com/qm7b3flKQLoAAAAC/anime-crying.gif',
        'https://media.tenor.com/PbVBIp6ZYDYAAAAC/sad-anime.gif',
        'https://media.tenor.com/rz8fE0E0VQAAAAAC/crying-tears.gif',
        'https://media.tenor.com/kJ77WW0nJr4AAAAC/anime-sad.gif'
    ]
});
