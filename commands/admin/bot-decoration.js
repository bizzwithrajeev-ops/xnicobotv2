const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const premiumManager = require('../../utils/premiumManager');
const jsonStore = require('../../utils/jsonStore');

// Font styles for bot name (Unicode text transformations - ONLY OPTION FOR BOTS)
const FONT_STYLES = {
    normal: {
        name: 'Normal',
        emoji: '📝',
        transform: (text) => text,
        example: 'xNico Bot'
    },
    bold: {
        name: 'Bold',
        emoji: '🔤',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 119743);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 119737);
            if (code >= 48 && code <= 57) return String.fromCharCode(code + 120734);
            return c;
        }).join(''),
        example: '𝘅𝗡𝗶𝗰𝗼 𝗕𝗼𝘁'
    },
    italic: {
        name: 'Italic',
        emoji: '📐',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 119795);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 119789);
            return c;
        }).join(''),
        example: '𝑥𝑁𝑖𝑐𝑜 𝐵𝑜𝑡'
    },
    script: {
        name: 'Script',
        emoji: '✍️',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 119951);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 119945);
            return c;
        }).join(''),
        example: '𝓍𝒩𝒾𝒸𝑜 𝐵𝑜𝓉'
    },
    monospace: {
        name: 'Monospace',
        emoji: '💻',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 120367);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 120361);
            if (code >= 48 && code <= 57) return String.fromCharCode(code + 120774);
            return c;
        }).join(''),
        example: '𝚡𝙽𝚒𝚌𝚘 𝙱𝚘𝚝'
    },
    fraktur: {
        name: 'Fraktur',
        emoji: '🎭',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 120003);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 119997);
            return c;
        }).join(''),
        example: '𝔵𝔑𝔦𝔠𝔬 𝔅𝔬𝔱'
    },
    double: {
        name: 'Double-Struck',
        emoji: '🎯',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 120055);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 120049);
            if (code >= 48 && code <= 57) return String.fromCharCode(code + 120734);
            return c;
        }).join(''),
        example: '𝕩ℕ𝕚𝕔𝕠 𝔹𝕠𝕥'
    },
    smallcaps: {
        name: 'Small Caps',
        emoji: '🔠',
        transform: (text) => text.toUpperCase().split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 120211);
            return c;
        }).join(''),
        example: 'ꭙɴɪᴄᴏ ʙᴏᴛ'
    },
    circled: {
        name: 'Circled',
        emoji: '⭕',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 9333);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 9327);
            if (code >= 48 && code <= 57) return String.fromCharCode(code + 9263);
            return c;
        }).join(''),
        example: 'ⓧⓃⓘⓒⓞ Ⓑⓞⓣ'
    },
    squared: {
        name: 'Squared',
        emoji: '⬜',
        transform: (text) => text.toUpperCase().split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 127280);
            return c;
        }).join(''),
        example: '🆇🅽🅸🅲🅾 🅱🅾🆃'
    },
    cursive: {
        name: 'Cursive',
        emoji: '🖋️',
        transform: (text) => text.split('').map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(code + 119951);
            if (code >= 97 && code <= 122) return String.fromCharCode(code + 119945);
            return c;
        }).join(''),
        example: '𝓍𝒩𝒾𝒸𝑜 𝐵𝑜𝓉'
    }
};

// Avatar decoration emojis/symbols
const AVATAR_DECORATIONS = {
    none: { name: 'None', emoji: '❌', prefix: '', suffix: '' },
    crown: { name: 'Crown', emoji: '👑', prefix: '👑 ', suffix: '' },
    star: { name: 'Star', emoji: '⭐', prefix: '⭐ ', suffix: '' },
    fire: { name: 'Fire', emoji: '🔥', prefix: '🔥 ', suffix: '' },
    sparkles: { name: 'Sparkles', emoji: '✨', prefix: '✨ ', suffix: ' ✨' },
    diamond: { name: 'Diamond', emoji: '💎', prefix: '💎 ', suffix: '' },
    rocket: { name: 'Rocket', emoji: '🚀', prefix: '🚀 ', suffix: '' },
    lightning: { name: 'Lightning', emoji: '⚡', prefix: '⚡ ', suffix: '' },
    hearts: { name: 'Hearts', emoji: '💕', prefix: '💕 ', suffix: ' 💕' },
    music: { name: 'Music', emoji: '🎵', prefix: '🎵 ', suffix: '' },
    game: { name: 'Game', emoji: '🎮', prefix: '🎮 ', suffix: '' },
    trophy: { name: 'Trophy', emoji: '🏆', prefix: '🏆 ', suffix: '' },
    verified: { name: 'Verified', emoji: '✅', prefix: '', suffix: ' ✅' },
    vip: { name: 'VIP', emoji: '👑', prefix: '[VIP] ', suffix: '' },
    premium: { name: 'Premium', emoji: '⭐', prefix: '[⭐] ', suffix: '' },
    brackets: { name: 'Brackets', emoji: '〚〛', prefix: '〚', suffix: '〛' },
    arrows: { name: 'Arrows', emoji: '➤', prefix: '➤ ', suffix: ' ➤' },
    waves: { name: 'Waves', emoji: '〜', prefix: '〜 ', suffix: ' 〜' }
};

function loadDecorations() {
    if (!jsonStore.has('bot-decorations')) {
        jsonStore.write('bot-decorations', {});
        return {};
    }
    return jsonStore.read('bot-decorations');
}

function saveDecorations(data) {
    jsonStore.writeImmediate('bot-decorations', data).catch(() => {});
}

function getGuildDecoration(guildId) {
    const decorations = loadDecorations();
    if (!decorations[guildId]) {
        decorations[guildId] = {
            enabled: false,
            fontStyle: 'normal',
            decoration: 'none',
            customPrefix: '',
            customSuffix: ''
        };
        saveDecorations(decorations);
    }
    return decorations[guildId];
}

function applyNameStyling(name, config) {
    if (!config.enabled) return name;
    
    // Apply font style
    let styled = FONT_STYLES[config.fontStyle]?.transform(name) || name;
    
    // Apply decoration
    const deco = AVATAR_DECORATIONS[config.decoration];
    if (deco) {
        styled = deco.prefix + styled + deco.suffix;
    }
    
    // Apply custom prefix/suffix
    if (config.customPrefix) styled = config.customPrefix + ' ' + styled;
    if (config.customSuffix) styled = styled + ' ' + config.customSuffix;
    
    return styled.substring(0, 32); // Discord limit
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-decoration')
        .setDescription('[Premium] Customize bot display name with fonts & decorations (server-only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    prefix: 'bot-decoration',
    description: '[Premium] Customize bot display name with Unicode fonts & emoji decorations (server-only)',
    usage: 'bot-decoration',
    category: 'admin',
    aliases: ['botdeco', 'botstyle', 'botname'],
    premiumOnly: true,

    async execute(interaction) {
        await showDecorationPanel(interaction, false);
    },

    async executePrefix(message) {
        await showDecorationPanel(message, true);
    }
};

async function showDecorationPanel(target, isPrefix) {
    const guildId = target.guild?.id || target.guildId;
    const config = getGuildDecoration(guildId);
    
    const currentStyle = FONT_STYLES[config.fontStyle] || FONT_STYLES.normal;
    const currentDeco = AVATAR_DECORATIONS[config.decoration] || AVATAR_DECORATIONS.none;
    
    // Preview the current styling
    const botName = target.guild?.members?.me?.displayName || target.client?.user?.username || 'xNico Bot';
    const previewName = applyNameStyling(botName, config);
    
    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🎨 Bot Name Styling (Unicode Only)\n\n` +
            `Apply Unicode font transformations to bot nickname.\n\n` +
            `-# ⚠️ **CRITICAL:** Discord Nitro Display Name Styles (Gradient/Neon/Pop) are USER-ONLY features and NOT available to bots via ANY API endpoint. This command only provides Unicode font transformations for nicknames.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    
    // Show current configuration
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Choose Font** ${currentStyle.emoji}\n` +
        `Current: **${currentStyle.name}**\n\n` +
        `**Choose Decoration** ${currentDeco.emoji}\n` +
        `Current: **${currentDeco.name}**\n\n` +
        `**Preview:**\n` +
        `### ${previewName}\n\n` +
        `**Status:** ${config.enabled ? '✅ Active' : '⚠️ Disabled - click Enable to activate'}`
    ));
    
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    
    // Font selection row
    const fontRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`botdeco_font_${guildId}`)
                .setLabel('Select Font Style')
                .setEmoji('🔤')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`botdeco_decoration_${guildId}`)
                .setLabel('Select Decoration')
                .setEmoji('✨')
                .setStyle(ButtonStyle.Primary)
        );
    
    // Custom & actions row
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`botdeco_custom_${guildId}`)
                .setLabel('Custom Prefix/Suffix')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`botdeco_toggle_${guildId}`)
                .setLabel(config.enabled ? 'Disable' : 'Enable')
                .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        );
    
    // Apply & reset row
    const controlRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`botdeco_apply_${guildId}`)
                .setLabel('Apply to Bot')
                .setEmoji('🚀')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!config.enabled),
            new ButtonBuilder()
                .setCustomId(`botdeco_preview_${guildId}`)
                .setLabel('Refresh Preview')
                .setEmoji('👁️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`botdeco_reset_${guildId}`)
                .setLabel('Reset All')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Danger)
        );
    
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# 👑 Premium Feature • **CONFIRMED BY RESEARCH:** Discord's Display Name Styles API is restricted to Nitro USER accounts ONLY. Bots can ONLY use Unicode text transformations for nicknames. The styled display names you see on user profiles (like in your screenshot) cannot be replicated for bot accounts through any official or undocumented API.`
    ));
    
    const reply = { 
        components: [container], 
        actionRows: [fontRow, actionRow, controlRow],
        flags: MessageFlags.IsComponentsV2
    };
    
    if (isPrefix) {
        return target.reply(reply);
    }
    return target.reply(reply);
}

// Button interactions handler (to be added to interactionCreate event)
module.exports.handleInteraction = async function(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('botdeco_')) return;
    
    const parts = customId.split('_');
    const action = parts[1];
    const guildId = parts[2];
    
    if (action === 'font') {
        await showFontSelector(interaction, guildId);
    } else if (action === 'decoration') {
        await showDecorationSelector(interaction, guildId);
    } else if (action === 'custom') {
        await showCustomModal(interaction, guildId);
    } else if (action === 'toggle') {
        await toggleDecoration(interaction, guildId);
    } else if (action === 'apply') {
        await applyDecoration(interaction, guildId);
    } else if (action === 'reset') {
        await resetDecoration(interaction, guildId);
    } else if (action === 'fontselect') {
        await selectFont(interaction, guildId);
    } else if (action === 'decoselect') {
        await selectDecoration(interaction, guildId);
    } else if (action === 'customsave') {
        await saveCustomText(interaction, guildId);
    }
};

async function showFontSelector(interaction, guildId) {
    const options = Object.entries(FONT_STYLES).map(([key, style]) => 
        new StringSelectMenuOptionBuilder()
            .setLabel(style.name)
            .setValue(`botdeco_selectfont_${guildId}_${key}`)
            .setEmoji(style.emoji)
            .setDescription(`Example: ${style.example}`)
    );
    
    const select = new StringSelectMenuBuilder()
        .setCustomId(`botdeco_fontselect_${guildId}`)
        .setPlaceholder('Choose a font style')
        .addOptions(options.slice(0, 25)); // Discord limit
    
    const row = new ActionRowBuilder().addComponents(select);
    
    await interaction.reply({
        content: '🔤 **Select a font style:**',
        actionRows: [row],
        flags: MessageFlags.Ephemeral
    });
}

async function showDecorationSelector(interaction, guildId) {
    const options = Object.entries(AVATAR_DECORATIONS).map(([key, deco]) => 
        new StringSelectMenuOptionBuilder()
            .setLabel(deco.name)
            .setValue(`botdeco_selectdeco_${guildId}_${key}`)
            .setEmoji(deco.emoji)
            .setDescription(`${deco.prefix}Name${deco.suffix}`)
    );
    
    const select = new StringSelectMenuBuilder()
        .setCustomId(`botdeco_decoselect_${guildId}`)
        .setPlaceholder('Choose a decoration')
        .addOptions(options.slice(0, 25)); // Discord limit
    
    const row = new ActionRowBuilder().addComponents(select);
    
    await interaction.reply({
        content: '✨ **Select a decoration:**',
        actionRows: [row],
        flags: MessageFlags.Ephemeral
    });
}

async function showCustomModal(interaction, guildId) {
    const config = getGuildDecoration(guildId);
    
    const modal = new ModalBuilder()
        .setCustomId(`botdeco_customsave_${guildId}`)
        .setTitle('Custom Prefix & Suffix');
    
    const prefixInput = new TextInputBuilder()
        .setCustomId('prefix')
        .setLabel('Custom Prefix (before name)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('[VIP] or ⭐ or 《')
        .setMaxLength(10)
        .setRequired(false)
        .setValue(config.customPrefix || '');
    
    const suffixInput = new TextInputBuilder()
        .setCustomId('suffix')
        .setLabel('Custom Suffix (after name)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('⭐ or 》 or ™')
        .setMaxLength(10)
        .setRequired(false)
        .setValue(config.customSuffix || '');
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(prefixInput),
        new ActionRowBuilder().addComponents(suffixInput)
    );
    
    await interaction.showModal(modal);
}

async function toggleDecoration(interaction, guildId) {
    const decorations = loadDecorations();
    const config = decorations[guildId] || getGuildDecoration(guildId);
    
    config.enabled = !config.enabled;
    decorations[guildId] = config;
    saveDecorations(decorations);
    
    const container = new ContainerBuilder()
        .setAccentColor(config.enabled ? 0x57F287 : 0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# ${config.enabled ? '✅' : '❌'} Decoration ${config.enabled ? 'Enabled' : 'Disabled'}\n\n` +
            `Bot name decorations are now **${config.enabled ? 'active' : 'inactive'}** for this server.\n\n` +
            `-# Refreshing panel...`
        ));
    
    await interaction.update({ components: [container], actionRows: [], flags: MessageFlags.IsComponentsV2 });
    
    // Refresh panel after 1.5 seconds
    setTimeout(async () => {
        try {
            await showDecorationPanel(interaction, false);
        } catch (e) {
            console.error('[BotDeco] Failed to refresh panel:', e);
        }
    }, 1500);
}

async function applyDecoration(interaction, guildId) {
    const config = getGuildDecoration(guildId);
    
    if (!config.enabled) {
        await interaction.reply({
            content: '❌ **Decorations are disabled!** Enable them first.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        const botMember = interaction.guild.members.me;
        const currentName = botMember.displayName;
        const styledName = applyNameStyling(currentName, config);
        
        await botMember.setNickname(styledName);
        
        const container = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ✅ Decoration Applied!\n\n` +
                `Bot name has been updated with your styling.\n\n` +
                `**New Name:** ${styledName}`
            ));
        
        await interaction.update({ components: [container], actionRows: [], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
        await interaction.reply({
            content: `❌ **Failed to apply decoration:** ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function resetDecoration(interaction, guildId) {
    const decorations = loadDecorations();
    decorations[guildId] = {
        enabled: false,
        fontStyle: 'normal',
        decoration: 'none',
        customPrefix: '',
        customSuffix: ''
    };
    saveDecorations(decorations);
    
    const container = new ContainerBuilder()
        .setAccentColor(0xFEE75C)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🔄 Decoration Reset\n\n` +
            `All decoration settings have been reset to defaults.\n\n` +
            `-# Refreshing panel...`
        ));
    
    await interaction.update({ components: [container], actionRows: [], flags: MessageFlags.IsComponentsV2 });
    
    // Refresh panel after 1.5 seconds
    setTimeout(async () => {
        try {
            await showDecorationPanel(interaction, false);
        } catch (e) {
            console.error('[BotDeco] Failed to refresh panel:', e);
        }
    }, 1500);
}

async function selectFont(interaction, guildId) {
    const value = interaction.values[0];
    const fontKey = value.split('_').pop();
    const decorations = loadDecorations();
    const config = decorations[guildId] || getGuildDecoration(guildId);
    
    config.fontStyle = fontKey;
    decorations[guildId] = config;
    saveDecorations(decorations);
    
    const style = FONT_STYLES[fontKey];
    await interaction.update({
        content: `✅ **Font changed to ${style.emoji} ${style.name}**\n\nExample: ${style.example}`,
        components: []
    });
}

async function selectDecoration(interaction, guildId) {
    const value = interaction.values[0];
    const decoKey = value.split('_').pop();
    const decorations = loadDecorations();
    const config = decorations[guildId] || getGuildDecoration(guildId);
    
    config.decoration = decoKey;
    decorations[guildId] = config;
    saveDecorations(decorations);
    
    const deco = AVATAR_DECORATIONS[decoKey];
    await interaction.update({
        content: `✅ **Decoration changed to ${deco.emoji} ${deco.name}**\n\nFormat: ${deco.prefix}Name${deco.suffix}`,
        components: []
    });
}

async function saveCustomText(interaction, guildId) {
    const prefix = interaction.fields.getTextInputValue('prefix');
    const suffix = interaction.fields.getTextInputValue('suffix');
    
    const decorations = loadDecorations();
    const config = decorations[guildId] || getGuildDecoration(guildId);
    
    config.customPrefix = prefix.trim();
    config.customSuffix = suffix.trim();
    decorations[guildId] = config;
    saveDecorations(decorations);
    
    await interaction.reply({
        content: `✅ **Custom text saved!**\n\nPrefix: \`${prefix || 'None'}\`\nSuffix: \`${suffix || 'None'}\``,
        flags: MessageFlags.Ephemeral
    });
}

// Export the apply function so it can be used elsewhere
module.exports.applyNameStyling = applyNameStyling;
module.exports.getGuildDecoration = getGuildDecoration;
