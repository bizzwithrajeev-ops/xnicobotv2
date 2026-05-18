const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'yawn',
    description: 'Yawn in front of someone',
    verb: 'yawned in front of',
    emoji: '😴',
    searchQuery: 'anime yawning tired',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/t-UtR1YkS9oAAAAC/anime-yawn.gif',
        'https://media.tenor.com/D9K2JcsmVqAAAAAC/yawning-anime.gif',
        'https://media.tenor.com/OJmTHvQrBLgAAAAC/anime-tired.gif',
        'https://media.tenor.com/fD7TxELRp6AAAAAC/sleepy-anime.gif',
        'https://media.tenor.com/qgQTXHUKQ0wAAAAC/anime-sleep.gif'
    ]
});
