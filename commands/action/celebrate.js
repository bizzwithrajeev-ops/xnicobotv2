const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'celebrate',
    description: 'Celebrate with someone',
    verb: 'celebrated with',
    emoji: '🎉',
    searchQuery: 'anime celebrating happy',
    nekosEndpoint: 'happy',
    waifuEndpoint: 'happy',
    aliases: ['party', 'cheer'],
    fallbackGifs: [
        'https://media.tenor.com/lqznMYwKP4MAAAAC/anime-celebrate.gif',
        'https://media.tenor.com/uKGH3FVl1rEAAAAC/celebrate-anime.gif',
        'https://media.tenor.com/3I00A0DlFEwAAAAC/party-anime.gif',
        'https://media.tenor.com/Z5QHWO6EgBIAAAAC/anime-party.gif',
        'https://media.tenor.com/jOIDCTVR_RIAAAAC/happy-celebrate.gif'
    ]
});
