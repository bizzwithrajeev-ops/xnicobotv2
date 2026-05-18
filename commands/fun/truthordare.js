const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const truths = [
    "What's the most embarrassing thing you've ever done?",
    "What's your biggest fear?",
    "Have you ever lied to your best friend?",
    "What's your most embarrassing nickname?",
    "What's the worst gift you've ever received?",
    "Have you ever cheated on a test?",
    "What's your biggest secret?",
    "Who was your first crush?",
    "What's the most childish thing you still do?",
    "Have you ever gossiped about someone in this server?",
    "What's something you've never told anyone?",
    "What's your worst habit?",
    "Have you ever broken something and blamed someone else?",
    "What's the longest you've gone without showering?",
    "What's your most embarrassing online search?",
    "Have you ever stalked someone on social media?",
    "What's the weirdest dream you've ever had?",
    "What's something illegal you've done?",
    "Who's the last person you stalked on social media?",
    "What's your biggest insecurity?"
];

const dares = [
    "Change your Discord status to something embarrassing for 1 hour",
    "Send a message in all caps for the next 10 messages",
    "Change your nickname to something chosen by the person above you",
    "Post an embarrassing selfie in this channel",
    "DM a random person in this server and tell them a joke",
    "Speak in third person for the next 5 messages",
    "Use only emojis to communicate for 5 minutes",
    "Let someone else write your Discord status for the next hour",
    "Send a voice message singing your favorite song",
    "React to every message in this channel for the next 5 minutes",
    "Type with your eyes closed for your next message",
    "Change your profile picture to something embarrassing for 24 hours",
    "Do 20 pushups and post proof",
    "Make up a rap about the person above you",
    "Post your most embarrassing photo",
    "Let the group choose your nickname for a week",
    "Send a message to your crush (or tell us who they are)",
    "Do your best impression of someone in the server",
    "Speak in rhymes for the next 3 messages",
    "Post your browser history screenshot (filtered appropriately)"
];

function getChallenge(type) {
    if (type === 'truth') {
        return {
            text: truths[Math.floor(Math.random() * truths.length)],
            color: 0x3498DB,
            emoji: '<:Bullhorn:1473038903157199093>'
        };
    } else {
        return {
            text: dares[Math.floor(Math.random() * dares.length)],
            color: 0xE74C3C,
            emoji: '<:Bookmark:1473038643492028517>'
        };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('truthordare')
        .setDescription('Play Truth or Dare')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Choose truth or dare')
                .setRequired(true)
                .addChoices(
                    { name: 'Truth', value: 'truth' },
                    { name: 'Dare', value: 'dare' }
                )),

    prefix: 'truthordare',
    description: 'Play Truth or Dare - get a random challenge!',
    usage: 'truthordare <truth|dare>',
    category: 'games',
    aliases: ['tod', 'truth', 'dare'],

    async execute(interaction) {
        const choice = interaction.options.getString('choice');
        const challenge = getChallenge(choice);
        
        const container = new ContainerBuilder()
            .setAccentColor(challenge.color)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ${challenge.emoji} ${choice.charAt(0).toUpperCase() + choice.slice(1)}\n\n${challenge.text}`
                )
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const choice = args[0]?.toLowerCase();

        if (!choice || !['truth', 'dare'].includes(choice)) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# 🎲 Truth or Dare\n\nChoose your challenge!\n\n` +
                        `**Usage:** \`-truthordare truth\` or \`-truthordare dare\`\n\n` +
                        `<:Bullhorn:1473038903157199093> **Truth:** Answer a personal question honestly\n` +
                        `<:Bookmark:1473038643492028517> **Dare:** Complete a challenging task`
                    )
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const challenge = getChallenge(choice);
        
        const container = new ContainerBuilder()
            .setAccentColor(challenge.color)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ${challenge.emoji} ${choice.charAt(0).toUpperCase() + choice.slice(1)}\n\n${challenge.text}`
                )
            );

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
