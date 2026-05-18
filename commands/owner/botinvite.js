const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, OAuth2Scopes, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botinvite')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Generate bot invite link with custom permissions'),
    prefix: 'botinvite',
    name: 'botinvite',
    description: 'Generate bot OAuth2 invite link',
    usage: 'botinvite',
    category: 'owner',
    aliases: ['generateinvite', 'invitelink', 'oauth'],

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }
        await this.showInvite(interaction, interaction.client);
    },

    async executePrefix(message) {
        if (!isOwner(message.author.id)) return;
        await this.showInvite(message, message.client);
    },

    async showInvite(context, client) {
        const adminInvite = client.generateInvite({
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
            permissions: [PermissionsBitField.Flags.Administrator]
        });

        const standardInvite = client.generateInvite({
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
            permissions: [
                PermissionsBitField.Flags.ManageGuild,
                PermissionsBitField.Flags.ManageRoles,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.KickMembers,
                PermissionsBitField.Flags.BanMembers,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.UseExternalEmojis,
                PermissionsBitField.Flags.AddReactions,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
                PermissionsBitField.Flags.ManageNicknames,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.CreateInstantInvite,
                PermissionsBitField.Flags.ModerateMembers
            ]
        });

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Key:1473038690606649375> Bot Invite Links\n` +
                    `**Bot:** ${client.user.username} (\`${client.user.id}\`)\n` +
                    `**Servers:** ${client.guilds.cache.size}`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `<:Shield:1473038669831995494> **Admin Invite** (full permissions)\n> ${adminInvite}\n\n` +
                    `<:Lock:1473038513749491773> **Standard Invite** (recommended permissions)\n> ${standardInvite}`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Admin Invite').setStyle(ButtonStyle.Link).setURL(adminInvite).setEmoji('<:Shield:1473038669831995494>'),
                    new ButtonBuilder().setLabel('Standard Invite').setStyle(ButtonStyle.Link).setURL(standardInvite).setEmoji('<:Lock:1473038513749491773>')
                )
            );

        const opts = { components: [container], flags: MessageFlags.IsComponentsV2 };
        if (context.reply) return context.reply(opts);
    }
};
