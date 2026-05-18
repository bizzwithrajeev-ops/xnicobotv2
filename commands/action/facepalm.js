const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'facepalm',
    description: 'Facepalm at someone',
    verb: 'facepalmed at',
    emoji: '🤦',
    searchQuery: 'anime facepalm fail',
    aliases: ['facedesk'],
    fallbackGifs: [
        'https://media.tenor.com/wTqTGCCLXfAAAAAC/facepalm-anime.gif',
        'https://media.tenor.com/gGN9NeB_GYAAAAAC/anime-facepalm.gif',
        'https://media.tenor.com/aUQmgq1W0m4AAAAC/disappointed-anime.gif',
        'https://media.tenor.com/NM6jqNClM98AAAAC/anime-fail.gif',
        'https://media.tenor.com/lx8ypH1qjUEAAAAC/anime-dissapointed.gif'
    ]
});
