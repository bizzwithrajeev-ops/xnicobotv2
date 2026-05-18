const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'punch',
    description: 'Punch someone (in fun)',
    verb: 'punched',
    emoji: '👊',
    searchQuery: 'anime punch action',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/6LLRgY8h8WYAAAAC/anime-punch.gif',
        'https://media.tenor.com/h3vvPVb_7RIAAAAC/punch-anime.gif',
        'https://media.tenor.com/GQJdF_0oCX0AAAAC/combat-punch.gif',
        'https://media.tenor.com/iL0YsgAJh4QAAAAC/anime-fighting.gif',
        'https://media.tenor.com/s4VTJ9Cln0AAAAAC/anime-action.gif'
    ]
});
