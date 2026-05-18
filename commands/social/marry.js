const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('marry')
        .setDescription('Propose marriage to another user')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to propose to')
                .setRequired(true)),

    prefix: 'marry',
    description: 'Propose marriage to another user',
    usage: 'marry <@user>',
    category: 'social',
    aliases: ['propose'],

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        await proposeMarriage(interaction, user, true);
    },

    async executePrefix(message, args) {
        const user = message.mentions.users.first();
        if (!user) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing User\n\nPlease mention someone to propose to!\n\n**Usage:** \`-marry @user\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }

        await proposeMarriage(message, user, false);
    }
};

async function proposeMarriage(context, user, isInteraction) {
    const author = isInteraction ? context.user : context.author;
    const channel = context.channel;

    if (user.id === author.id) {
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Can't Marry Yourself\n\nYou cannot marry yourself!`
                )
            );
        if (isInteraction) {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }

    if (user.bot) {
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Can't Marry Bots\n\nYou cannot marry a bot!`
                )
            );
        if (isInteraction) {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }

    let config = {};

    if (jsonStore.has('marriages')) {
        config = jsonStore.read('marriages');
    }

    if (config[author.id]) {
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Already Married\n\nYou are already married!`
                )
            );
        if (isInteraction) {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }

    if (config[user.id]) {
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> User Already Married\n\n${user.username} is already married!`
                )
            );
        if (isInteraction) {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 💍 Marriage Proposal\n\n` +
                `**${author.username}** is proposing to **${user.username}**!\n\n` +
                `**${user.username}**, do you accept? Type **yes** or **no**`
            )
        );

    if (isInteraction) {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const filter = m => m.author.id === user.id && ['yes', 'no'].includes(m.content.toLowerCase());
    const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] }).catch(() => null);

    if (!collected || collected.first().content.toLowerCase() === 'no') {
        const rejectContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 💔 Proposal Rejected\n\nThe proposal was rejected or timed out.`
                )
            );
        return channel.send({ components: [rejectContainer], flags: MessageFlags.IsComponentsV2 });
    }

    config[author.id] = {
        partner: user.id,
        date: Date.now()
    };
    config[user.id] = {
        partner: author.id,
        date: Date.now()
    };

    jsonStore.write('marriages', config);

    const successContainer = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 💑 Just Married!\n\n` +
                `**${author.username}** and **${user.username}** are now married!\n\n` +
                `<:Present:1473038450465706076> Congratulations to the happy couple!`
            )
        );
    await channel.send({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
}
