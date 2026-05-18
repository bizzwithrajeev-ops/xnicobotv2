const { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, SeparatorBuilder, MediaGalleryBuilder, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const botCustomize = require('../../utils/botCustomize');

module.exports = {
    data: null,
    prefix: 'botprofile',
    aliases: ['bp-info', 'bot-profile'],
    description: 'View the bot\'s per-server profile (nick, avatar, banner, about)',
    usage: 'botprofile',
    category: 'admin',

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need Manage Server permission to use this command!');
        }

        try {
            const botMember = message.guild.members.me;
            const guildId = message.guild.id;
            const guildCustom = botCustomize.getConfig(guildId);
            const accentColor = botCustomize.getEmbedColor(guildId);

            const hasCustomNickname = botMember.nickname !== null;
            const hasCustomAvatar = !!guildCustom.avatarUrl;
            const hasCustomBanner = !!guildCustom.bannerUrl;
            const hasAbout = !!guildCustom.aboutText;

            const globalAvatar = message.client.user.displayAvatarURL({ size: 256 });
            const serverAvatar = botMember.displayAvatarURL({ size: 256 });
            const globalName = message.client.user.username;
            const serverName = botMember.nickname || globalName;

            const container = new ContainerBuilder().setAccentColor(accentColor);

            // Banner preview if set
            if (hasCustomBanner) {
                try {
                    container.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(item => item.setURL(guildCustom.bannerUrl))
                    );
                } catch (e) {}
            }

            // Header with avatar thumbnail
            let headerText = `# <:bots:1473368718120849500> Bot Server Profile\n`;
            headerText += `-# Showing how **${message.client.user.username}** appears in **${message.guild.name}**\n`;

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(serverAvatar));
            container.addSectionComponents(section);

            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

            // Identity section
            let identityText = `### <:Copy:1473039575302803629> Identity\n`;
            identityText += `> <:Edit:1473037903625191580> **Display Name:** ${serverName}\n`;
            identityText += `> -# ${hasCustomNickname ? '<:Checkedbox:1473038547165384804> Custom nickname set' : '<:Cancel:1473037949187657818> Using global name'}\n`;
            identityText += `> <:Picture:1473039568398843957> **Avatar:** ${hasCustomAvatar ? '[Custom per-server avatar](' + guildCustom.avatarUrl + ')' : '[Global avatar](' + globalAvatar + ')'}\n`;
            identityText += `> -# ${hasCustomAvatar ? '<:Checkedbox:1473038547165384804> Per-server avatar active' : '<:Cancel:1473037949187657818> Using global avatar'}\n`;
            identityText += `> <:Picture:1473039568398843957> **Banner:** ${hasCustomBanner ? '[Custom banner](' + guildCustom.bannerUrl + ')' : 'Not set'}\n`;
            identityText += `> -# ${hasCustomBanner ? '<:Checkedbox:1473038547165384804> Custom banner set' : '<:Cancel:1473037949187657818> No banner configured'}`;

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(identityText));

            // About section
            if (hasAbout) {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                let aboutText = `### <:Document:1473039496995143731> About / Bio\n`;
                aboutText += `> ${guildCustom.aboutText.substring(0, 300)}${guildCustom.aboutText.length > 300 ? '...' : ''}`;
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(aboutText));
            }

            // Settings overview
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            let settingsText = `### <:Settings:1473037894703779851> Server Settings\n`;
            settingsText += `> <:Edit:1473037903625191580> **Prefix:** ${guildCustom.prefix ? `\`${guildCustom.prefix}\`` : 'Default'}\n`;
            settingsText += `> <:Palette:1473039029476917461> **Embed Color:** ${botCustomize.getEmbedColorName(guildId)}\n`;
            settingsText += `> <:Bookopen:1473038576391557130> **Language:** ${guildCustom.language || 'en'}\n`;
            settingsText += `> <:Timer:1473039056710406204> **Cooldown:** ${guildCustom.commandCooldown}s`;

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(settingsText));

            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent('-# Use `bot-customize` to modify these settings • Requires Premium')
            );

            // Customize button
            container.addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('botcustom_category')
                    .setLabel('Open Customization Panel')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('<:Palette:1473039029476917461>')
                    .setDisabled(true)
            ));

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[BotProfile] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
