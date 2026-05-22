const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, SeparatorBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MediaGalleryBuilder, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const axios = require('axios');
const premiumManager = require('../../utils/premiumManager');
const botCustomizeUtil = require('../../utils/botCustomize');

const jsonStore = require('../../utils/jsonStore');
const { checkAndExpire } = require('../../utils/panelExpiration');
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const EMBED_COLORS = {
    'default': { name: 'Default', color: 0xCAD7E6, emoji: '🔵' },
    'red': { name: 'Red', color: 0xED4245, emoji: '🔴' },
    'green': { name: 'Green', color: 0x57F287, emoji: '🟢' },
    'yellow': { name: 'Yellow', color: 0xFEE75C, emoji: '🟡' },
    'purple': { name: 'Purple', color: 0x9B59B6, emoji: '🟣' },
    'pink': { name: 'Pink', color: 0xEB459E, emoji: '💗' },
    'orange': { name: 'Orange', color: 0xE67E22, emoji: '🟠' },
    'teal': { name: 'Teal', color: 0x1ABC9C, emoji: '🩵' },
    'gold': { name: 'Gold', color: 0xF1C40F, emoji: '<:Star:1473038501766369300>' },
    'navy': { name: 'Navy', color: 0x34495E, emoji: '🌑' },
    'black': { name: 'Black', color: 0x23272A, emoji: '⬛' },
    'white': { name: 'White', color: 0xFFFFFF, emoji: '⬜' }
};

const LANGUAGES = {
    'en': { name: 'English', emoji: '🇬🇧' },
    'es': { name: 'Español', emoji: '🇪🇸' },
    'fr': { name: 'Français', emoji: '🇫🇷' },
    'de': { name: 'Deutsch', emoji: '🇩🇪' },
    'pt': { name: 'Português', emoji: '🇧🇷' },
    'ru': { name: 'Русский', emoji: '🇷🇺' },
    'ja': { name: '日本語', emoji: '🇯🇵' },
    'ko': { name: '한국어', emoji: '🇰🇷' },
    'zh': { name: '中文', emoji: '🇨🇳' },
    'ar': { name: 'العربية', emoji: '🇸🇦' },
    'hi': { name: 'हिन्दी', emoji: '🇮🇳' },
    'tr': { name: 'Türkçe', emoji: '🇹🇷' }
};

function loadConfig() {
    try {
        if (!jsonStore.has('bot-customize')) {
            jsonStore.write('bot-customize', {});
            return {};
        }
        return jsonStore.read('bot-customize');
    } catch (e) {
        return {};
    }
}

function saveConfig(config) {
    jsonStore.write('bot-customize', config);
    botCustomizeUtil.invalidateCache();
}

function syncPrefixToFile(guildId, prefix) {
    try {
        let prefixes = {};
        if (jsonStore.has('prefixes')) {
            prefixes = jsonStore.read('prefixes');
        }
        if (prefix) {
            prefixes[guildId] = prefix;
        } else {
            delete prefixes[guildId];
        }
        jsonStore.write('prefixes', prefixes);
    } catch (e) {}
}

function getDefaultGuildConfig() {
    return {
        nickname: null,
        avatarUrl: null,
        bannerUrl: null,
        aboutText: null,
        prefix: null,
        embedColor: 'default',
        footerText: null,
        footerIcon: null,
        language: 'en',
        dmOnJoin: false,
        dmMessage: null,
        commandCooldown: 3,
        deleteCommands: false,
        ephemeralResponses: false
    };
}

function getGuildConfig(guildId) {
    const config = loadConfig();
    if (!config[guildId]) {
        config[guildId] = getDefaultGuildConfig();
        saveConfig(config);
    }
    return config[guildId];
}

function buildCustomizePanel(guildConfig, guild, client, page = 'main') {
    const container = new ContainerBuilder().setAccentColor(EMBED_COLORS[guildConfig.embedColor]?.color || 0xCAD7E6);

    const botMember = guild.members.me;
    const currentNick = botMember?.nickname || client.user.username;
    const hasGuildAvatar = guildConfig.avatarUrl ? true : false;

    if (page === 'main') {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Palette:1473039029476917461> Bot Customization\n-# Personalize how **${client.user.username}** looks and behaves in **${guild.name}**`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Status indicators
        const on = '`🟢`';
        const off = '`⚫`';
        const val = (v) => v ? `\`${v}\`` : '*Default*';

        let statusText = `### <:Settings:1473037894703779851> Current Configuration\n\n`;
        statusText += `<:Copy:1473039575302803629> **Nickname** — ${currentNick}\n`;
        statusText += `<:Picture:1473039568398843957> **Avatar** — ${hasGuildAvatar ? '`Custom`' : '*Default*'}\n`;
        statusText += `<:Picture:1473039568398843957> **Banner** — ${guildConfig.bannerUrl ? '`Custom`' : '*Not set*'}\n`;
        statusText += `<:Document:1473039496995143731> **About** — ${guildConfig.aboutText ? '`Configured`' : '*Not set*'}\n`;
        statusText += `<:Edit:1473037903625191580> **Prefix** — ${val(guildConfig.prefix)}\n`;
        statusText += `<:Palette:1473039029476917461> **Embed Color** — ${EMBED_COLORS[guildConfig.embedColor]?.name || 'Default'}\n`;
        statusText += `<:Bookopen:1473038576391557130> **Language** — ${LANGUAGES[guildConfig.language]?.name || 'English'}\n`;

        statusText += `\n<:Timer:1473039056710406204> **Cooldown** ${guildConfig.commandCooldown}s  •  `;
        statusText += `<:Trash:1473038090074591293> **Auto-Delete** ${guildConfig.deleteCommands ? on : off}  •  `;
        statusText += `<:Commentblock:1473370739351490794> **Ephemeral** ${guildConfig.ephemeralResponses ? on : off}  •  `;
        statusText += `<:Editalt:1473038138577256670> **DM Join** ${guildConfig.dmOnJoin ? on : off}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusText));

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### <:Document:1473039496995143731> Select a Category'));

        const categorySelect = new StringSelectMenuBuilder()
            .setCustomId('botcustom_category')
            .setPlaceholder('Choose what to customize...')
            .addOptions([
                { label: 'Appearance', description: 'Nickname, Avatar, Embed Colors', value: 'appearance', emoji: '<:Copy:1473039575302803629>' },
                { label: 'Profile', description: 'Banner, About/Bio for the bot', value: 'profile', emoji: '<:Bookopen:1473038576391557130>' },
                { label: 'Behavior', description: 'Prefix, Cooldowns, Response Settings', value: 'behavior', emoji: '<:Settings:1473037894703779851>' },
                { label: 'Messages', description: 'Footer, DM Messages, Language', value: 'messages', emoji: '<:Edit:1473037903625191580>' },
                { label: 'Reset All', description: 'Reset all settings to default', value: 'reset_all', emoji: '<:History:1473037847568318605>' }
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(categorySelect));

        const quickRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_preview')
                .setLabel('Preview')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Eye:1473038435056095242>'),
            new ButtonBuilder()
                .setCustomId('botcustom_export')
                .setLabel('Export Config')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Image:1473039533112033508>'),
            new ButtonBuilder()
                .setCustomId('botcustom_help')
                .setLabel('Help')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Lightbulbalt:1473038470787240009>')
        );

        container.addActionRowComponents(quickRow);

    } else if (page === 'appearance') {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Copy:1473039575302803629> Appearance Settings\n-# Customize how **${client.user.username}** looks in **${guild.name}**`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        let appearText = `<:Copy:1473039575302803629> **Nickname**\n-# ${currentNick}\n\n`;
        appearText += `<:Picture:1473039568398843957> **Per-Server Avatar**\n-# ${hasGuildAvatar ? 'Custom avatar active' : 'Using global avatar'}\n\n`;
        appearText += `<:Palette:1473039029476917461> **Embed Color**\n-# ${EMBED_COLORS[guildConfig.embedColor]?.name || 'Default'}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(appearText));

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_nickname')
                .setLabel('Nickname')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Copy:1473039575302803629>'),
            new ButtonBuilder()
                .setCustomId('botcustom_avatar')
                .setLabel('Avatar')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Picture:1473039568398843957>'),
            new ButtonBuilder()
                .setCustomId('botcustom_color')
                .setLabel('Embed Color')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Palette:1473039029476917461>')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_reset_nick')
                .setLabel('Reset Nick')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:History:1473037847568318605>'),
            new ButtonBuilder()
                .setCustomId('botcustom_reset_avatar')
                .setLabel('Reset Avatar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Trash:1473038090074591293>'),
            new ButtonBuilder()
                .setCustomId('botcustom_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Caretleft:1473038193057333409>')
        );

        container.addActionRowComponents(row1);
        container.addActionRowComponents(row2);

    } else if (page === 'behavior') {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Settings:1473037894703779851> Behavior Settings\n-# Control how **${client.user.username}** responds in **${guild.name}**`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        let behaveText = `<:Edit:1473037903625191580> **Custom Prefix**\n-# ${guildConfig.prefix ? `\`${guildConfig.prefix}\`` : 'Using default prefix'}\n\n`;
        behaveText += `<:Timer:1473039056710406204> **Command Cooldown**\n-# ${guildConfig.commandCooldown}s between commands\n\n`;
        behaveText += `<:Trash:1473038090074591293> **Auto-Delete Commands** — ${guildConfig.deleteCommands ? '`Enabled`' : '`Disabled`'}\n`;
        behaveText += `<:Commentblock:1473370739351490794> **Ephemeral Responses** — ${guildConfig.ephemeralResponses ? '`Enabled`' : '`Disabled`'}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(behaveText));

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_prefix')
                .setLabel('Set Prefix')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Edit:1473037903625191580>'),
            new ButtonBuilder()
                .setCustomId('botcustom_cooldown')
                .setLabel('Cooldown')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Timer:1473039056710406204>'),
            new ButtonBuilder()
                .setCustomId('botcustom_toggle_delete')
                .setLabel(guildConfig.deleteCommands ? 'Disable Delete' : 'Enable Delete')
                .setStyle(guildConfig.deleteCommands ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji('<:Trash:1473038090074591293>')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_toggle_ephemeral')
                .setLabel(guildConfig.ephemeralResponses ? 'Disable Ephemeral' : 'Enable Ephemeral')
                .setStyle(guildConfig.ephemeralResponses ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji('<:Commentblock:1473370739351490794>'),
            new ButtonBuilder()
                .setCustomId('botcustom_reset_prefix')
                .setLabel('Reset Prefix')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:History:1473037847568318605>'),
            new ButtonBuilder()
                .setCustomId('botcustom_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Caretleft:1473038193057333409>')
        );

        container.addActionRowComponents(row1);
        container.addActionRowComponents(row2);

    } else if (page === 'messages') {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Edit:1473037903625191580> Message Settings\n-# Customize bot messages and responses in **${guild.name}**`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        let msgText = `<:Bookopen:1473038576391557130> **Language**\n-# ${LANGUAGES[guildConfig.language]?.name || 'English'}\n\n`;
        msgText += `<:Document:1473039496995143731> **Custom Footer**\n-# ${guildConfig.footerText ? `"${guildConfig.footerText}"` : 'Using default footer'}\n\n`;
        msgText += `<:Picture:1473039568398843957> **Footer Icon**\n-# ${guildConfig.footerIcon ? 'Custom icon set' : 'Using default'}\n\n`;
        msgText += `<:Editalt:1473038138577256670> **DM on Join** — ${guildConfig.dmOnJoin ? '`Enabled`' : '`Disabled`'}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(msgText));

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_language')
                .setLabel('Language')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Bookopen:1473038576391557130>'),
            new ButtonBuilder()
                .setCustomId('botcustom_footer')
                .setLabel('Set Footer')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Document:1473039496995143731>'),
            new ButtonBuilder()
                .setCustomId('botcustom_footer_icon')
                .setLabel('Footer Icon')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Picture:1473039568398843957>')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_toggle_dm')
                .setLabel(guildConfig.dmOnJoin ? 'Disable DM' : 'Enable DM')
                .setStyle(guildConfig.dmOnJoin ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji('<:Editalt:1473038138577256670>'),
            new ButtonBuilder()
                .setCustomId('botcustom_dm_message')
                .setLabel('DM Message')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Editalt:1473038138577256670>')
                .setDisabled(!guildConfig.dmOnJoin),
            new ButtonBuilder()
                .setCustomId('botcustom_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Caretleft:1473038193057333409>')
        );

        container.addActionRowComponents(row1);
        container.addActionRowComponents(row2);

    } else if (page === 'profile') {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Bookopen:1473038576391557130> Profile Settings\n-# Customize the bot's identity in **${guild.name}**`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Show banner preview if set
        if (guildConfig.bannerUrl) {
            try {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(item => item.setURL(guildConfig.bannerUrl))
                );
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            } catch (e) {}
        }

        let profileText = `<:Picture:1473039568398843957> **Banner**\n`;
        profileText += guildConfig.bannerUrl
            ? `-# [Custom banner set](<${guildConfig.bannerUrl}>)\n\n`
            : `-# No banner configured. Set one to customize the bot's look.\n\n`;

        profileText += `<:Document:1473039496995143731> **About / Bio**\n`;
        profileText += guildConfig.aboutText
            ? `-# ${guildConfig.aboutText.substring(0, 200)}${guildConfig.aboutText.length > 200 ? '...' : ''}`
            : `-# No about text set. Add a description for the bot in this server.`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(profileText));

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_banner')
                .setLabel('Set Banner')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Picture:1473039568398843957>'),
            new ButtonBuilder()
                .setCustomId('botcustom_about')
                .setLabel('Set About')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Document:1473039496995143731>')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('botcustom_reset_banner')
                .setLabel('Reset Banner')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Trash:1473038090074591293>'),
            new ButtonBuilder()
                .setCustomId('botcustom_reset_about')
                .setLabel('Reset About')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Trash:1473038090074591293>'),
            new ButtonBuilder()
                .setCustomId('botcustom_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Caretleft:1473038193057333409>')
        );

        container.addActionRowComponents(row1);
        container.addActionRowComponents(row2);
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Per-guild customization allows unique bot configuration for each server')
    );

    return container;
}

async function setGuildAvatar(guildId, imageUrl) {
    try {
        let base64Image;
        
        if (imageUrl.startsWith('data:')) {
            base64Image = imageUrl;
        } else {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
            const buffer = Buffer.from(response.data);
            const contentType = response.headers['content-type'] || 'image/png';
            base64Image = `data:${contentType};base64,${buffer.toString('base64')}`;
        }

        await rest.patch(Routes.guildMember(guildId, '@me'), {
            body: { avatar: base64Image }
        });

        return { success: true };
    } catch (error) {
        console.error('Error setting guild avatar:', error.message);
        return { success: false, error: error.message };
    }
}

async function resetGuildAvatar(guildId) {
    try {
        await rest.patch(Routes.guildMember(guildId, '@me'), {
            body: { avatar: null }
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function setGuildBanner(guildId, imageUrl) {
    try {
        let base64Image;

        if (imageUrl.startsWith('data:')) {
            base64Image = imageUrl;
        } else {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
            const buffer = Buffer.from(response.data);
            const contentType = response.headers['content-type'] || 'image/png';
            base64Image = `data:${contentType};base64,${buffer.toString('base64')}`;
        }

        await rest.patch(Routes.guildMember(guildId, '@me'), {
            body: { banner: base64Image }
        });

        return { success: true };
    } catch (error) {
        console.error('Error setting guild banner:', error.message);
        return { success: false, error: error.message };
    }
}

async function resetGuildBanner(guildId) {
    try {
        await rest.patch(Routes.guildMember(guildId, '@me'), {
            body: { banner: null }
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    description: 'Bot Customize',
    usage: 'bot-customize',
    category: 'admin',
    data: new SlashCommandBuilder()
        .setName('bot-customize')
        .setDescription('Customize the bot\'s appearance and behavior in this server'),
    premiumOnly: true,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> You need **Manage Server** permission to customize the bot.', flags: MessageFlags.Ephemeral });
        }

        if (!premiumManager.hasPremiumAccess(interaction.user.id, interaction.guild?.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This feature requires **Premium**. Use `redeemkey` to activate or ask an admin to activate server premium.', flags: MessageFlags.Ephemeral });
        }

        const guildConfig = getGuildConfig(interaction.guild.id);
        const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'main');
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Server** permission to customize the bot.');
        }

        if (!premiumManager.hasPremiumAccess(message.author.id, message.guild?.id)) {
            return message.reply('<:Cancel:1473037949187657818> This feature requires **Premium**. Use `redeemkey` to activate or ask an admin to activate server premium.');
        }

        const guildConfig = getGuildConfig(message.guild.id);
        const container = buildCustomizePanel(guildConfig, message.guild, message.client, 'main');
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    getGuildConfig,
    loadConfig,
    saveConfig,
    EMBED_COLORS,
    LANGUAGES,

    async handleInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return false;

        const customId = interaction.customId;
        if (!customId.startsWith('botcustom_')) return false;

        // Check if config session has expired
        if (await checkAndExpire(interaction, 'config')) return true;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> You need **Manage Server** permission.', flags: MessageFlags.Ephemeral });
            return true;
        }

        if (!premiumManager.hasPremiumAccess(interaction.user.id, interaction.guild?.id)) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> This feature requires **Premium**. Use `redeemkey` to activate or ask an admin to activate server premium.', flags: MessageFlags.Ephemeral });
            return true;
        }

        const config = loadConfig();
        const guildId = interaction.guild.id;
        if (!config[guildId]) config[guildId] = getDefaultGuildConfig();
        const guildConfig = config[guildId];

        if (customId === 'botcustom_category' && interaction.isStringSelectMenu()) {
            const selected = interaction.values[0];
            
            if (selected === 'reset_all') {
                config[guildId] = getDefaultGuildConfig();
                saveConfig(config);
                syncPrefixToFile(guildId, null);
                
                try {
                    await interaction.guild.members.me.setNickname(null);
                    await resetGuildAvatar(guildId);
                    await resetGuildBanner(guildId);
                } catch (e) {}
                
                await interaction.reply({ content: '<:Checkedbox:1473038547165384804> All bot customization settings have been reset to default!', flags: MessageFlags.Ephemeral });
                
                const container = buildCustomizePanel(config[guildId], interaction.guild, interaction.client, 'main');
                try {
                    await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (e) {}
                return true;
            }
            
            const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, selected);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return true;
        }

        if (customId === 'botcustom_back') {
            const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'main');
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return true;
        }

        if (customId === 'botcustom_nickname') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_nickname_modal')
                .setTitle('Change Bot Nickname');

            const input = new TextInputBuilder()
                .setCustomId('nickname')
                .setLabel('New Nickname (max 32 characters)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter new nickname for this server')
                .setMaxLength(32)
                .setRequired(true);

            if (interaction.guild.members.me?.nickname) {
                input.setValue(interaction.guild.members.me.nickname);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_nickname_modal' && interaction.isModalSubmit()) {
            const newNick = interaction.fields.getTextInputValue('nickname').trim();

            try {
                await interaction.guild.members.me.setNickname(newNick);
                guildConfig.nickname = newNick;
                config[guildId] = guildConfig;
                saveConfig(config);

                await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Bot nickname changed to **${newNick}**!`, flags: MessageFlags.Ephemeral });

                try {
                    const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'appearance');
                    await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (e) {}
            } catch (error) {
                await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to change nickname: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        if (customId === 'botcustom_avatar') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_avatar_modal')
                .setTitle('Change Bot Avatar');

            const input = new TextInputBuilder()
                .setCustomId('avatar_url')
                .setLabel('Image URL (PNG, JPG, GIF)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('https://example.com/image.png')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_avatar_modal' && interaction.isModalSubmit()) {
            const avatarUrl = interaction.fields.getTextInputValue('avatar_url').trim();

            if (!avatarUrl.match(/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i) && !avatarUrl.startsWith('https://cdn.discordapp.com/')) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Please provide a valid image URL (PNG, JPG, GIF, or WebP).', flags: MessageFlags.Ephemeral });
                return true;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const result = await setGuildAvatar(guildId, avatarUrl);

            if (result.success) {
                guildConfig.avatarUrl = avatarUrl;
                config[guildId] = guildConfig;
                saveConfig(config);

                await interaction.editReply({ content: '<:Checkedbox:1473038547165384804> Bot avatar for this server has been updated!' });

                try {
                    const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'appearance');
                    await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (e) {}
            } else {
                await interaction.editReply({ content: `<:Cancel:1473037949187657818> Failed to set avatar: ${result.error}` });
            }
            return true;
        }

        if (customId === 'botcustom_color') {
            const colorSelect = new StringSelectMenuBuilder()
                .setCustomId('botcustom_color_select')
                .setPlaceholder('Select embed color...')
                .addOptions(Object.entries(EMBED_COLORS).map(([key, value]) => ({
                    label: value.name,
                    value: key,
                    emoji: value.emoji,
                    default: guildConfig.embedColor === key
                })));

            await interaction.reply({
                content: '<:Palette:1473039029476917461> **Select a new embed color:**',
                components: [new ActionRowBuilder().addComponents(colorSelect)],
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (customId === 'botcustom_color_select' && interaction.isStringSelectMenu()) {
            const selectedColor = interaction.values[0];
            guildConfig.embedColor = selectedColor;
            config[guildId] = guildConfig;
            saveConfig(config);

            await interaction.update({
                content: `<:Checkedbox:1473038547165384804> Embed color changed to **${EMBED_COLORS[selectedColor].name}**!`,
                components: []
            }).catch(() => {});

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'appearance');
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {}
            return true;
        }

        if (customId === 'botcustom_prefix') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_prefix_modal')
                .setTitle('Set Custom Prefix');

            const input = new TextInputBuilder()
                .setCustomId('prefix')
                .setLabel('Custom Prefix (1-5 characters)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., ! or >> or ?')
                .setMaxLength(5)
                .setMinLength(1)
                .setRequired(true);

            if (guildConfig.prefix) {
                input.setValue(guildConfig.prefix);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_prefix_modal' && interaction.isModalSubmit()) {
            const newPrefix = interaction.fields.getTextInputValue('prefix').trim();
            guildConfig.prefix = newPrefix;
            config[guildId] = guildConfig;
            saveConfig(config);
            syncPrefixToFile(guildId, newPrefix);

            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Custom prefix set to \`${newPrefix}\``, flags: MessageFlags.Ephemeral });

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'behavior');
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {}
            return true;
        }

        if (customId === 'botcustom_cooldown') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_cooldown_modal')
                .setTitle('Set Command Cooldown');

            const input = new TextInputBuilder()
                .setCustomId('cooldown')
                .setLabel('Cooldown in seconds (0-60)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 3')
                .setMaxLength(2)
                .setRequired(true)
                .setValue(String(guildConfig.commandCooldown || 3));

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_cooldown_modal' && interaction.isModalSubmit()) {
            const cooldownStr = interaction.fields.getTextInputValue('cooldown').trim();
            const cooldown = parseInt(cooldownStr);
            
            if (isNaN(cooldown) || cooldown < 0 || cooldown > 60) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Please enter a number between 0 and 60.', flags: MessageFlags.Ephemeral });
                return true;
            }

            guildConfig.commandCooldown = cooldown;
            config[guildId] = guildConfig;
            saveConfig(config);

            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Command cooldown set to **${cooldown}** seconds.`, flags: MessageFlags.Ephemeral });

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'behavior');
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {}
            return true;
        }

        if (customId === 'botcustom_toggle_delete') {
            guildConfig.deleteCommands = !guildConfig.deleteCommands;
            config[guildId] = guildConfig;
            saveConfig(config);

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'behavior');
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (updateErr) {
                await interaction.reply({ 
                    content: `<:Toggleon:1473038585501581312> Delete Commands: **${guildConfig.deleteCommands ? 'Enabled' : 'Disabled'}**`, 
                    flags: MessageFlags.Ephemeral 
                }).catch(() => {});
            }
            return true;
        }

        if (customId === 'botcustom_toggle_ephemeral') {
            guildConfig.ephemeralResponses = !guildConfig.ephemeralResponses;
            config[guildId] = guildConfig;
            saveConfig(config);

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'behavior');
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (updateErr) {
                await interaction.reply({ 
                    content: `<:Toggleon:1473038585501581312> Ephemeral Responses: **${guildConfig.ephemeralResponses ? 'Enabled' : 'Disabled'}**`, 
                    flags: MessageFlags.Ephemeral 
                }).catch(() => {});
            }
            return true;
        }

        if (customId === 'botcustom_language') {
            const langSelect = new StringSelectMenuBuilder()
                .setCustomId('botcustom_language_select')
                .setPlaceholder('Select language...')
                .addOptions(Object.entries(LANGUAGES).map(([key, value]) => ({
                    label: value.name,
                    value: key,
                    emoji: value.emoji,
                    default: guildConfig.language === key
                })));

            await interaction.reply({
                content: '<:Bookopen:1473038576391557130> **Select bot language:**',
                components: [new ActionRowBuilder().addComponents(langSelect)],
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (customId === 'botcustom_language_select' && interaction.isStringSelectMenu()) {
            const selectedLang = interaction.values[0];
            guildConfig.language = selectedLang;
            config[guildId] = guildConfig;
            saveConfig(config);

            await interaction.update({
                content: `<:Checkedbox:1473038547165384804> Language changed to **${LANGUAGES[selectedLang]?.name || selectedLang}**!`,
                components: []
            }).catch(() => {});
            return true;
        }

        if (customId === 'botcustom_footer') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_footer_modal')
                .setTitle('Set Custom Footer');

            const input = new TextInputBuilder()
                .setCustomId('footer')
                .setLabel('Footer Text (max 100 characters)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Powered by MyBot')
                .setMaxLength(100)
                .setRequired(false);

            if (guildConfig.footerText) {
                input.setValue(guildConfig.footerText);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_footer_modal' && interaction.isModalSubmit()) {
            const footerText = interaction.fields.getTextInputValue('footer').trim();
            guildConfig.footerText = footerText || null;
            config[guildId] = guildConfig;
            saveConfig(config);

            await interaction.reply({ 
                content: footerText ? `<:Checkedbox:1473038547165384804> Custom footer set: "${footerText}"` : '<:Checkedbox:1473038547165384804> Custom footer removed.', 
                flags: MessageFlags.Ephemeral 
            });

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'messages');
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {}
            return true;
        }

        if (customId === 'botcustom_footer_icon') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_footer_icon_modal')
                .setTitle('Set Footer Icon');

            const input = new TextInputBuilder()
                .setCustomId('icon_url')
                .setLabel('Icon URL (PNG, JPG, GIF)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('https://example.com/icon.png')
                .setRequired(false);

            if (guildConfig.footerIcon) {
                input.setValue(guildConfig.footerIcon);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_footer_icon_modal' && interaction.isModalSubmit()) {
            const iconUrl = interaction.fields.getTextInputValue('icon_url').trim();

            if (iconUrl && !iconUrl.match(/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i) && !iconUrl.startsWith('https://cdn.discordapp.com/')) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Please provide a valid image URL.', flags: MessageFlags.Ephemeral });
                return true;
            }

            guildConfig.footerIcon = iconUrl || null;
            config[guildId] = guildConfig;
            saveConfig(config);

            await interaction.reply({ 
                content: iconUrl ? '<:Checkedbox:1473038547165384804> Footer icon set!' : '<:Checkedbox:1473038547165384804> Footer icon removed.', 
                flags: MessageFlags.Ephemeral 
            });

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'messages');
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {}
            return true;
        }

        if (customId === 'botcustom_toggle_dm') {
            guildConfig.dmOnJoin = !guildConfig.dmOnJoin;
            config[guildId] = guildConfig;
            saveConfig(config);

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'messages');
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (updateErr) {
                await interaction.reply({ 
                    content: `<:Checkedbox:1473038547165384804> DM on Join: **${guildConfig.dmOnJoin ? 'Enabled' : 'Disabled'}**`, 
                    flags: MessageFlags.Ephemeral 
                }).catch(() => {});
            }
            return true;
        }

        if (customId === 'botcustom_dm_message') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_dm_message_modal')
                .setTitle('Set DM Welcome Message');

            const input = new TextInputBuilder()
                .setCustomId('dm_message')
                .setLabel('DM Message (Variables: {user}, {server})')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Welcome {user} to {server}!')
                .setMaxLength(1000)
                .setRequired(true);

            if (guildConfig.dmMessage) {
                input.setValue(guildConfig.dmMessage);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_dm_message_modal' && interaction.isModalSubmit()) {
            const dmMessage = interaction.fields.getTextInputValue('dm_message').trim();
            guildConfig.dmMessage = dmMessage;
            config[guildId] = guildConfig;
            saveConfig(config);

            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> DM welcome message updated!', flags: MessageFlags.Ephemeral });

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'messages');
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {}
            return true;
        }

        if (customId === 'botcustom_banner') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_banner_modal')
                .setTitle('Set Server Bot Banner');

            const input = new TextInputBuilder()
                .setCustomId('banner_url')
                .setLabel('Banner Image URL (PNG, JPG, GIF, WebP)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('https://example.com/banner.png')
                .setRequired(true);

            if (guildConfig.bannerUrl) {
                input.setValue(guildConfig.bannerUrl);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_banner_modal' && interaction.isModalSubmit()) {
            const bannerUrl = interaction.fields.getTextInputValue('banner_url').trim();

            // Must be HTTPS and an image (not video/mp4/mov)
            if (!bannerUrl.match(/^https?:\/\/.+/i)) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Please provide a valid URL starting with `https://`.', flags: MessageFlags.Ephemeral });
                return true;
            }
            // Block known non-image extensions
            if (/\.(mp4|mov|avi|mkv|webm|mp3|wav|ogg|pdf|zip|exe)(\?.*)?$/i.test(bannerUrl)) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Only image URLs are supported (PNG, JPG, GIF, WebP). Video/audio files are not allowed.', flags: MessageFlags.Ephemeral });
                return true;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const result = await setGuildBanner(guildId, bannerUrl);

            if (result.success) {
                guildConfig.bannerUrl = bannerUrl;
                config[guildId] = guildConfig;
                saveConfig(config);

                await interaction.editReply({ content: '<:Checkedbox:1473038547165384804> Bot banner for this server has been updated!' });

                try {
                    const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'profile');
                    await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (e) {}
            } else {
                await interaction.editReply({ content: `<:Cancel:1473037949187657818> Failed to set banner: ${result.error}` });
            }
            return true;
        }

        if (customId === 'botcustom_about') {
            const modal = new ModalBuilder()
                .setCustomId('botcustom_about_modal')
                .setTitle('Set Bot About / Bio');

            const input = new TextInputBuilder()
                .setCustomId('about_text')
                .setLabel('About Text (max 500 characters)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Write a description or bio for the bot in this server...')
                .setMaxLength(500)
                .setRequired(true);

            if (guildConfig.aboutText) {
                input.setValue(guildConfig.aboutText);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'botcustom_about_modal' && interaction.isModalSubmit()) {
            const aboutText = interaction.fields.getTextInputValue('about_text').trim();
            guildConfig.aboutText = aboutText || null;
            config[guildId] = guildConfig;
            saveConfig(config);

            await interaction.reply({ content: aboutText ? '<:Checkedbox:1473038547165384804> Bot about/bio updated!' : '<:Checkedbox:1473038547165384804> Bot about/bio removed.', flags: MessageFlags.Ephemeral });

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'profile');
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {}
            return true;
        }

        if (customId === 'botcustom_reset_banner') {
            await interaction.deferUpdate();

            const result = await resetGuildBanner(guildId);

            if (result.success) {
                guildConfig.bannerUrl = null;
                config[guildId] = guildConfig;
                saveConfig(config);

                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'profile');
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                // Still clear local config even if API fails
                guildConfig.bannerUrl = null;
                config[guildId] = guildConfig;
                saveConfig(config);

                await interaction.followUp({ content: `<:Cancel:1473037949187657818> Banner cleared locally but API reset failed: ${result.error}`, flags: MessageFlags.Ephemeral });

                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'profile');
                try { await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }); } catch (e) {}
            }
            return true;
        }

        if (customId === 'botcustom_reset_about') {
            guildConfig.aboutText = null;
            config[guildId] = guildConfig;
            saveConfig(config);

            try {
                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'profile');
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (updateErr) {
                await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Bot about/bio removed.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            return true;
        }

        if (customId === 'botcustom_preview') {
            const botMember = interaction.guild.members.me;
            const avatarUrl = botMember.displayAvatarURL({ dynamic: true, size: 256 });
            const nickname = botMember.nickname || interaction.client.user.username;

            let preview = `## <:Eye:1473038435056095242> Bot Preview for ${interaction.guild.name}\n\n`;
            preview += `**Nickname:** ${nickname}\n`;
            preview += `**Avatar:** [View](${avatarUrl})\n`;
            preview += `**Banner:** ${guildConfig.bannerUrl ? '[View](' + guildConfig.bannerUrl + ')' : 'Not set'}\n`;
            preview += `**About:** ${guildConfig.aboutText || 'Not set'}\n`;
            preview += `**Prefix:** ${guildConfig.prefix || 'Default'}\n`;
            preview += `**Embed Color:** ${EMBED_COLORS[guildConfig.embedColor]?.name || 'Default'}\n`;
            preview += `**Language:** ${LANGUAGES[guildConfig.language]?.name || 'English'}\n`;
            preview += `**Custom Footer:** ${guildConfig.footerText || 'None'}\n`;
            preview += `**Command Cooldown:** ${guildConfig.commandCooldown}s\n`;
            preview += `**Delete Commands:** ${guildConfig.deleteCommands ? 'Yes' : 'No'}\n`;
            preview += `**Ephemeral Responses:** ${guildConfig.ephemeralResponses ? 'Yes' : 'No'}\n`;
            preview += `**DM on Join:** ${guildConfig.dmOnJoin ? 'Enabled' : 'Disabled'}`;

            await interaction.reply({ content: preview, flags: MessageFlags.Ephemeral });
            return true;
        }

        if (customId === 'botcustom_export') {
            const exportData = JSON.stringify(guildConfig, null, 2);
            await interaction.reply({ 
                content: `<:Image:1473039533112033508> **Current Configuration:**\n\`\`\`json\n${exportData}\n\`\`\``, 
                flags: MessageFlags.Ephemeral 
            });
            return true;
        }

        if (customId === 'botcustom_reset_nick') {
            try {
                await interaction.guild.members.me.setNickname(null);
                guildConfig.nickname = null;
                config[guildId] = guildConfig;
                saveConfig(config);

                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'appearance');
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (error) {
                await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to reset nickname: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        if (customId === 'botcustom_reset_avatar') {
            await interaction.deferUpdate();

            const result = await resetGuildAvatar(guildId);

            if (result.success) {
                guildConfig.avatarUrl = null;
                config[guildId] = guildConfig;
                saveConfig(config);

                const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'appearance');
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                await interaction.followUp({ content: `<:Cancel:1473037949187657818> Failed to reset avatar: ${result.error}`, flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        if (customId === 'botcustom_reset_prefix') {
            guildConfig.prefix = null;
            config[guildId] = guildConfig;
            saveConfig(config);
            syncPrefixToFile(guildId, null);

            const container = buildCustomizePanel(guildConfig, interaction.guild, interaction.client, 'behavior');
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return true;
        }

        if (customId === 'botcustom_help') {
            const helpText = `# <:Palette:1473039029476917461> Bot Customization Help

## <:Copy:1473039575302803629> Appearance Settings
- **Nickname** - Set a unique nickname for the bot in this server
- **Avatar** - Set a custom avatar that only shows in this server
- **Embed Color** - Customize the color of bot embed messages

## <:Bookopen:1473038576391557130> Profile Settings
- **Banner** - Set a custom banner image for the bot's profile in this server
- **About** - Set a custom about/bio text for the bot in this server

## <:Settings:1473037894703779851> Behavior Settings
- **Custom Prefix** - Set a unique command prefix for this server
- **Command Cooldown** - Set cooldown between commands (0-60s)
- **Delete Commands** - Auto-delete command messages after execution
- **Ephemeral Responses** - Make bot responses only visible to command user

## <:Edit:1473037903625191580> Message Settings
- **Language** - Set the bot's response language
- **Custom Footer** - Add custom footer text to embed messages
- **Footer Icon** - Custom icon in embed footers
- **DM on Join** - Send welcome DM when users join

## Variables for DM Message
\`{user}\` - Username
\`{server}\` - Server name
\`{memberCount}\` - Total member count

## Notes
- Banner and About are stored per-server and used in bot profile commands
- Avatar/Nickname changes may take a few seconds to appear
- Prefix changes take effect immediately for all server members

-# Changes are saved and persist across bot restarts`;

            await interaction.reply({ content: helpText, flags: MessageFlags.Ephemeral });
            return true;
        }

        return false;
    }
};
