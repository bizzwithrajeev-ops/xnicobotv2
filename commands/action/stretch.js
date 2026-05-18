const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'stretch',
    description: 'Stretch near someone',
    verb: 'stretched near',
    emoji: '🤸',
    searchQuery: 'anime stretching',
    nekosEndpoint: 'yawn',
    waifuEndpoint: null,
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/zxI8DUl_9OYAAAAC/anime-stretch.gif',
        'https://media.tenor.com/6cW_5_5n2O8AAAAC/stretching-anime.gif',
        'https://media.tenor.com/9BhfG_xNFh0AAAAC/stretch-yoga.gif',
        'https://media.tenor.com/lfxh1W9jPYUAAAAC/anime-exercise.gif',
        'https://media.tenor.com/SPVPF8dPVGkAAAAC/flexible-anime.gif'
    ]
});
