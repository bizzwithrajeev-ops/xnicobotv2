const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, buildAutomodPanel } = require('../../utils/panels/automodPanel');
const { buildPermissionDenied } = require('../../utils/responseBuilder');
const { registerPanel } = require('../../utils/panelRegistry');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure automatic moderation system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const guildConfig = getGuildConfig(guildId);
        const container = buildAutomodPanel(guildConfig);
        const reply = await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2, fetchReply: true });
        registerPanel(guildId, 'automod', interaction.channel.id, reply.id);
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const container = buildPermissionDenied('Manage Guild');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const guildId = message.guild.id;
        const guildConfig = getGuildConfig(guildId);
        const container = buildAutomodPanel(guildConfig);

        const reply = await message.reply({ 
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });

        registerPanel(guildId, 'automod', message.channel.id, reply.id);
    }
};