const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'tickle',
    description: 'Tickle someone',
    verb: 'tickled',
    emoji: ':laughing:',
    searchQuery: 'anime tickle',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/DBi_GkB8AzEAAAAC/anime-tickle.gif',
        'https://media.tenor.com/SEaV03CU7UwAAAAC/tickle-anime.gif',
        'https://media.tenor.com/Gq8hzrXJv2wAAAAC/anime-tickle.gif',
        'https://media.tenor.com/Mfvd4dHxBUMAAAAC/tickle-anime.gif',
        'https://media.tenor.com/IiUG88KLkNcAAAAC/anime-tickle.gif'
    ]
});
