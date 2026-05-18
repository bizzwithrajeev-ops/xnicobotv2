const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, SeparatorBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
    try {
        if (!jsonStore.has('social-notify')) {
            jsonStore.write('social-notify', {});
            return {};
        }
        return jsonStore.read('social-notify');
    } catch { return {}; }
}

function saveConfig(config) {
    jsonStore.write('social-notify', config);
}

function getDefaultYouTubeConfig() {
    return {
        enabled: false,
        channels: [],
        notifyChannel: null,
        pingRole: null,
        message: '<:dnd:1473370101427343403> **{channel}** just uploaded a new video!\n\n**{title}**\n{url}',
        liveMessage: '🔴 **{channel}** is now **LIVE** on YouTube!\n\n**{title}**\n{url}',
        liveEnabled: true
    };
}

function ensureYouTubeConfig(config, guildId) {
    if (!config[guildId]) {
        config[guildId] = {
            youtube: getDefaultYouTubeConfig(),
            twitch: { enabled: false, streamers: [], notifyChannel: null, message: '🟣 **{streamer}** is now live on Twitch!\n\n**{title}**\nPlaying: {game}\n{url}', pingRole: null },
            instagram: { enabled: false, accounts: [], notifyChannel: null, message: '📸 **{account}** posted something new on Instagram!\n{url}', pingRole: null },
            facebook: { enabled: false, pages: [], notifyChannel: null, message: '📘 **{page}** posted something new!\n{url}', pingRole: null },
            twitter: { enabled: false, accounts: [], notifyChannel: null, message: '🐦 **{account}** just tweeted!\n{url}', pingRole: null },
            tiktok: { enabled: false, accounts: [], notifyChannel: null, message: '<:Music:1473039311057190972> **{account}** posted a new TikTok!\n{url}', pingRole: null }
        };
    }
    const yt = config[guildId].youtube;
    if (!yt) config[guildId].youtube = getDefaultYouTubeConfig();
    if (yt.liveMessage === undefined) yt.liveMessage = '🔴 **{channel}** is now **LIVE** on YouTube!\n\n**{title}**\n{url}';
    if (yt.liveEnabled === undefined) yt.liveEnabled = true;
    return config[guildId].youtube;
}

function buildPanel(ytConfig, guild) {
    const container = new ContainerBuilder().setAccentColor(0xFF0000);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# <:dnd:1473370101427343403> YouTube Notifications\n-# Get notified when YouTubers upload videos or go live')
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Status section
    const statusEmoji = ytConfig.enabled ? '<:online:1455550955679387743>' : '<:offline:1455550933508333662>';
    const channelText = ytConfig.notifyChannel ? `<#${ytConfig.notifyChannel}>` : '`Not Set`';
    const roleText = ytConfig.pingRole ? `<@&${ytConfig.pingRole}>` : '`None`';
    const liveText = ytConfig.liveEnabled ? '<:online:1455550955679387743> Enabled' : '<:offline:1455550933508333662> Disabled';

    let statusBlock = '```ansi\n\u001b[1;37m YouTube Notification Settings\n';
    statusBlock += '─────────────────────────────────\n';
    statusBlock += `\u001b[1;36m Status:        ${ytConfig.enabled ? '\u001b[1;32mEnabled' : '\u001b[1;31mDisabled'}\n`;
    statusBlock += `\u001b[1;36m Channels:      \u001b[1;33m${ytConfig.channels?.length || 0} tracked\n`;
    statusBlock += `\u001b[1;36m Live Alerts:   ${ytConfig.liveEnabled ? '\u001b[1;32mEnabled' : '\u001b[1;31mDisabled'}\n`;
    statusBlock += `\u001b[1;36m Check Interval:\u001b[1;37m Every 5 minutes\n`;
    statusBlock += '```';

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusBlock));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${statusEmoji} **Status:** ${ytConfig.enabled ? 'Enabled' : 'Disabled'}\n` +
            `<:Bullhorn:1473038903157199093> **Channel:** ${channelText}\n` +
            `<:Notificationon:1473038417691676784> **Ping Role:** ${roleText}\n` +
            `🔴 **Live Alerts:** ${liveText}`
        )
    );

    // Tracked channels list
    if (ytConfig.channels?.length > 0) {
        let chList = `\n**<:Document:1473039496995143731> Tracked YouTube Channels** (${ytConfig.channels.length}/25)\n`;
        ytConfig.channels.slice(0, 15).forEach((ch, i) => {
            chList += `> \`${i + 1}.\` [${ch}](https://youtube.com/${ch.startsWith('@') ? ch : `@${ch}`})\n`;
        });
        if (ytConfig.channels.length > 15) chList += `> -# +${ytConfig.channels.length - 15} more\n`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chList));
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('\n<:Cancel:1473037949187657818> **No YouTube channels tracked**\n-# Click **Add Channel** to start tracking')
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Buttons Row 1 - Core controls
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ytnotify_toggle')
            .setLabel(ytConfig.enabled ? 'Disable' : 'Enable')
            .setStyle(ytConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji(ytConfig.enabled ? '<:dnd:1473370101427343403>' : '<:online:1473369837245042762>'),
        new ButtonBuilder()
            .setCustomId('ytnotify_add')
            .setLabel('Add Channel')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('<:Add:1473038100862337035>'),
        new ButtonBuilder()
            .setCustomId('ytnotify_remove')
            .setLabel('Remove Channel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Trash:1473038090074591293>')
            .setDisabled(!ytConfig.channels?.length)
    );

    // Buttons Row 2 - Settings
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ytnotify_channel')
            .setLabel('Set Channel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Bullhorn:1473038903157199093>'),
        new ButtonBuilder()
            .setCustomId('ytnotify_role')
            .setLabel('Ping Role')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Notificationon:1473038417691676784>'),
        new ButtonBuilder()
            .setCustomId('ytnotify_message')
            .setLabel('Video Message')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Editalt:1473038138577256670>')
    );

    // Buttons Row 3 - Live & test
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ytnotify_live_toggle')
            .setLabel(ytConfig.liveEnabled ? 'Disable Live Alerts' : 'Enable Live Alerts')
            .setStyle(ytConfig.liveEnabled ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setEmoji('🔴'),
        new ButtonBuilder()
            .setCustomId('ytnotify_live_message')
            .setLabel('Live Message')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Editalt:1473038138577256670>'),
        new ButtonBuilder()
            .setCustomId('ytnotify_test')
            .setLabel('Send Test')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🧪')
    );

    container.addActionRowComponents(row1);
    container.addActionRowComponents(row2);
    container.addActionRowComponents(row3);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            '-# <:Infotriangle:1473038460456800459> Variables: `{channel}` `{title}` `{url}` `{videoId}` • Checks every 5 minutes'
        )
    );

    return container;
}

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('youtube-notify')
        .setDescription('Configure YouTube upload & livestream notifications')
        .setDefaultMemberPermissions(0x20),

    async execute(interaction) {
        const config = loadConfig();
        const ytConfig = ensureYouTubeConfig(config, interaction.guild.id);
        saveConfig(config);
        const container = buildPanel(ytConfig, interaction.guild);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Server** permission!');
        }
        const config = loadConfig();
        const ytConfig = ensureYouTubeConfig(config, message.guild.id);
        saveConfig(config);
        const container = buildPanel(ytConfig, message.guild);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit() && !interaction.isChannelSelectMenu()) return false;

        const customId = interaction.customId;
        if (!customId.startsWith('ytnotify_')) return false;

        const config = loadConfig();
        const guildId = interaction.guild.id;
        const ytConfig = ensureYouTubeConfig(config, guildId);

        // Toggle enable/disable
        if (customId === 'ytnotify_toggle') {
            ytConfig.enabled = !ytConfig.enabled;
            saveConfig(config);
            const container = buildPanel(ytConfig, interaction.guild);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // Toggle live alerts
        if (customId === 'ytnotify_live_toggle') {
            ytConfig.liveEnabled = !ytConfig.liveEnabled;
            saveConfig(config);
            const container = buildPanel(ytConfig, interaction.guild);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // Add channel modal
        if (customId === 'ytnotify_add') {
            const modal = new ModalBuilder()
                .setCustomId('ytnotify_modal_add')
                .setTitle('Add YouTube Channel');

            const input = new TextInputBuilder()
                .setCustomId('yt_channel')
                .setLabel('YouTube Channel (@handle or Channel ID)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('@MrBeast or UCX6OQ3DkcsbYNE6H8uQQuVA')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        // Add channel modal submit
        if (customId === 'ytnotify_modal_add' && interaction.isModalSubmit()) {
            const channel = interaction.fields.getTextInputValue('yt_channel').trim();

            if (!ytConfig.channels) ytConfig.channels = [];

            if (ytConfig.channels.includes(channel)) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> This channel is already being tracked!', flags: MessageFlags.Ephemeral });
                return true;
            }

            if (ytConfig.channels.length >= 25) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Maximum 25 channels!', flags: MessageFlags.Ephemeral });
                return true;
            }

            // Validate the channel exists by attempting to resolve
            let resolveMsg = '';
            try {
                const { resolveYouTubeChannelId } = require('../../utils/socialNotifyPoller');
                const channelId = await resolveYouTubeChannelId(channel);
                if (channelId) {
                    resolveMsg = `\n-# Resolved to channel ID: \`${channelId}\``;
                } else {
                    resolveMsg = '\n-# ⚠️ Could not verify channel — will retry on next poll';
                }
            } catch {
                resolveMsg = '\n-# ⚠️ Could not verify channel — will retry on next poll';
            }

            ytConfig.channels.push(channel);
            saveConfig(config);

            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Added **${channel}** to YouTube tracking!${resolveMsg}`, flags: MessageFlags.Ephemeral });
            try {
                const container = buildPanel(ytConfig, interaction.guild);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {}
            return true;
        }

        // Remove channel
        if (customId === 'ytnotify_remove') {
            if (!ytConfig.channels?.length) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> No channels to remove!', flags: MessageFlags.Ephemeral });
                return true;
            }

            const options = ytConfig.channels.slice(0, 25).map((ch, i) => ({
                label: ch.length > 50 ? ch.substring(0, 47) + '...' : ch,
                value: String(i),
                emoji: '<:dnd:1473370101427343403>'
            }));

            const select = new StringSelectMenuBuilder()
                .setCustomId('ytnotify_remove_select')
                .setPlaceholder('Select channel to remove')
                .addOptions(options);

            await interaction.reply({ content: '**Select a channel to remove:**', components: [new ActionRowBuilder().addComponents(select)], flags: MessageFlags.Ephemeral });
            return true;
        }

        // Remove channel select
        if (customId === 'ytnotify_remove_select' && interaction.isStringSelectMenu()) {
            const index = parseInt(interaction.values[0]);
            if (!ytConfig.channels?.[index]) {
                await interaction.update({ content: '<:Cancel:1473037949187657818> Channel not found!', components: [] });
                return true;
            }
            const removed = ytConfig.channels.splice(index, 1)[0];
            saveConfig(config);
            await interaction.update({ content: `<:Checkedbox:1473038547165384804> Removed **${removed}** from tracking!`, components: [] });
            return true;
        }

        // Set notification channel
        if (customId === 'ytnotify_channel') {
            const channelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('ytnotify_channel_select')
                .setPlaceholder('Select notification channel')
                .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

            await interaction.reply({ content: '**Select the channel for YouTube notifications:**', components: [new ActionRowBuilder().addComponents(channelSelect)], flags: MessageFlags.Ephemeral });
            return true;
        }

        // Channel select callback
        if (customId === 'ytnotify_channel_select' && interaction.isChannelSelectMenu()) {
            ytConfig.notifyChannel = interaction.values[0];
            saveConfig(config);
            await interaction.update({ content: `<:Checkedbox:1473038547165384804> YouTube notifications will be sent to <#${interaction.values[0]}>!`, components: [] });
            return true;
        }

        // Set ping role modal
        if (customId === 'ytnotify_role') {
            const modal = new ModalBuilder()
                .setCustomId('ytnotify_modal_role')
                .setTitle('Set Ping Role');

            const input = new TextInputBuilder()
                .setCustomId('role_id')
                .setLabel('Role ID (leave empty to disable ping)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678 or @everyone')
                .setRequired(false)
                .setValue(ytConfig.pingRole || '');

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        // Role modal submit
        if (customId === 'ytnotify_modal_role' && interaction.isModalSubmit()) {
            const roleId = interaction.fields.getTextInputValue('role_id').trim();
            ytConfig.pingRole = roleId || null;
            saveConfig(config);
            await interaction.reply({
                content: roleId ? `<:Checkedbox:1473038547165384804> Ping role set to <@&${roleId}>!` : '<:Checkedbox:1473038547165384804> Ping role disabled!',
                flags: MessageFlags.Ephemeral
            });
            try {
                const container = buildPanel(ytConfig, interaction.guild);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {}
            return true;
        }

        // Custom video message modal
        if (customId === 'ytnotify_message') {
            const modal = new ModalBuilder()
                .setCustomId('ytnotify_modal_message')
                .setTitle('Video Upload Message');

            const input = new TextInputBuilder()
                .setCustomId('custom_message')
                .setLabel('Notification message for new uploads')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('{channel} uploaded: {title}\n{url}')
                .setValue(ytConfig.message || '')
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        // Video message modal submit
        if (customId === 'ytnotify_modal_message' && interaction.isModalSubmit()) {
            ytConfig.message = interaction.fields.getTextInputValue('custom_message');
            saveConfig(config);
            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Video upload notification message saved!', flags: MessageFlags.Ephemeral });
            try {
                const container = buildPanel(ytConfig, interaction.guild);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {}
            return true;
        }

        // Live message modal
        if (customId === 'ytnotify_live_message') {
            const modal = new ModalBuilder()
                .setCustomId('ytnotify_modal_live_message')
                .setTitle('Livestream Message');

            const input = new TextInputBuilder()
                .setCustomId('live_message')
                .setLabel('Notification message for livestreams')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('🔴 {channel} is LIVE! {title}\n{url}')
                .setValue(ytConfig.liveMessage || '')
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        // Live message modal submit
        if (customId === 'ytnotify_modal_live_message' && interaction.isModalSubmit()) {
            ytConfig.liveMessage = interaction.fields.getTextInputValue('live_message');
            saveConfig(config);
            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Livestream notification message saved!', flags: MessageFlags.Ephemeral });
            try {
                const container = buildPanel(ytConfig, interaction.guild);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {}
            return true;
        }

        // Test notification
        if (customId === 'ytnotify_test') {
            if (!ytConfig.notifyChannel) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Set a notification channel first!', flags: MessageFlags.Ephemeral });
                return true;
            }

            const channel = interaction.guild.channels.cache.get(ytConfig.notifyChannel);
            if (!channel) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Notification channel not found! It may have been deleted.', flags: MessageFlags.Ephemeral });
                return true;
            }

            // Test video notification
            const testVideo = {
                channelName: 'Test Channel',
                title: '🎬 This is a Test Video Notification!',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                videoId: 'dQw4w9WgXcQ'
            };

            let testMessage = (ytConfig.message || '{channel} uploaded: {title}\n{url}')
                .replace(/{channel}/g, testVideo.channelName)
                .replace(/{title}/g, testVideo.title)
                .replace(/{url}/g, testVideo.url)
                .replace(/{videoId}/g, testVideo.videoId);

            const pingRole = ytConfig.pingRole ? `<@&${ytConfig.pingRole}> ` : '';

                        const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setAuthor({ name: testVideo.channelName, iconURL: 'https://i.imgur.com/3pGrCPv.png' })
                .setTitle(testVideo.title)
                .setURL(testVideo.url)
                .setImage(`https://img.youtube.com/vi/${testVideo.videoId}/maxresdefault.jpg`)
                .setTimestamp()
                .setFooter({ text: 'YouTube • Test Notification' });

            try {
                await channel.send({
                    content: `${pingRole}${testMessage}\n\n-# 🧪 This is a test notification`,
                    embeds: [embed]
                });
                await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Test notification sent to <#${channel.id}>!`, flags: MessageFlags.Ephemeral });
            } catch (error) {
                await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to send test: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        return false;
    }
};
