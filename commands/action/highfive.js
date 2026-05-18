const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'highfive',
    description: 'High five someone',
    verb: 'high-fived',
    emoji: ':raised_hands:',
    searchQuery: 'anime high five',
    aliases: ['hifive', 'hi5'],
    fallbackGifs: [
        'https://media.tenor.com/OEtj5GKOfPMAAAAC/anime-high-five.gif',
        'https://media.tenor.com/kea3JuJiTH4AAAAC/high-five-anime.gif',
        'https://media.tenor.com/Ry3-0mbj3CwAAAAC/anime-high-five.gif',
        'https://media.tenor.com/ItmNCr-YFf4AAAAC/high-five-anime.gif',
        'https://media.tenor.com/QCNP2V8p3jkAAAAC/anime-high-five.gif'
    ]
});
