const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'pet',
    description: 'Give someone a gentle pet/pat',
    verb: 'petted',
    emoji: ':sparkling_heart:',
    searchQuery: 'anime head pat',
    nekosEndpoint: 'pat',
    waifuEndpoint: 'pat',
    aliases: ['headpat'],
    fallbackGifs: [
        'https://media.tenor.com/UoYdF_MT9nsAAAAC/anime-pat.gif',
        'https://media.tenor.com/XS70kt7cAngAAAAC/head-pat-pat.gif',
        'https://media.tenor.com/tNT9Rsi_GX8AAAAC/anime-pet.gif',
        'https://media.tenor.com/N41zOEBwcosAAAAC/anime-head-pat.gif',
        'https://media.tenor.com/FpZU-B_yKIkAAAAC/pat-head-pat.gif'
    ]
});
