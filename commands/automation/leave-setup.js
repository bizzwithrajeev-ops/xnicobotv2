const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
    if (!jsonStore.has('welcomer')) {
        jsonStore.write('welcomer', {});
        return {};
    }
    return jsonStore.read('welcomer');
}

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('leave-setup')
        .setDescription('Interactive setup for the leave message system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const config = loadConfig();
        const guildConfig = config[interaction.guild.id] || {};

        const container = this.buildPanel(guildConfig, interaction.guild);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need Manage Guild permission to use this command!');
        }

        const config = loadConfig();
        const guildConfig = config[message.guild.id] || {};

        const container = this.buildPanel(guildConfig, message.guild);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    buildPanel(guildConfig, guild) {
        const controlButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('leave_setup_channel')
                    .setLabel('Set Channel')
                    .setStyle(guildConfig.leaveChannelId ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setEmoji('📺'),
                new ButtonBuilder()
                    .setCustomId('welcomer_leave_msg')
                    .setLabel('Set Message')
                    .setStyle(guildConfig.leaveMessage ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setEmoji('<:Envelope:1473038885364695113>'),
                new ButtonBuilder()
                    .setCustomId('welcomer_leave_toggle')
                    .setLabel(guildConfig.leaveEnabled ? 'Disable' : 'Enable')
                    .setStyle(guildConfig.leaveEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
                    .setEmoji(guildConfig.leaveEnabled ? '<:Toggleoff:1473038582813032590>' : '<:Toggleon:1473038585501581312>'),
                new ButtonBuilder()
                    .setCustomId('leave_preview')
                    .setLabel('Preview')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:Eye:1473038435056095242>')
            );

        const leaveMsg = guildConfig.leaveMessage || 'Goodbye {username}! <:Userplus:1473038912212435086>';
        const previewMsg = leaveMsg.length > 50 ? leaveMsg.substring(0, 50) + '...' : leaveMsg;

        return new ContainerBuilder()
            .setAccentColor(guildConfig.leaveEnabled ? 0x57F287 : 0xED4245)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(
                        `# <:Userplus:1473038912212435086> Leave Message System\n\n` +
                        `Send automatic goodbye messages when members leave your server.\n\n` +
                        `### <:Bookopen:1473038576391557130> Current Configuration\n` +
                        `**Status:** ${guildConfig.leaveEnabled ? '<:online:1485248286653943900> Enabled' : '<:offline:1485248289690616041> Disabled'}\n` +
                        `**Channel:** ${guildConfig.leaveChannelId ? `<#${guildConfig.leaveChannelId}>` : '*Not set (will use welcome channel)*'}\n` +
                        `**Message:** \`${previewMsg}\`\n\n` +
                        `### <:Chat:1473038936241864865> How to Use\n` +
                        `**1.** Click **Set Channel** to choose where leave messages appear\n` +
                        `**2.** Click **Set Message** to customize your goodbye message\n` +
                        `**3.** Click **Enable** to activate leave messages\n` +
                        `**4.** Use **Preview** to see how messages will look\n\n` +
                        `### <:Edit:1473037903625191580> Available Variables\n` +
                        `\`{user}\` - Member mention | \`{username}\` - Username\n` +
                        `\`{displayname}\` - Display name | \`{server}\` - Server name\n` +
                        `\`{membercount}\` - Total members | \`{userid}\` - User ID`
                    )
            )
            .addActionRowComponents(controlButtons);
    }
};
