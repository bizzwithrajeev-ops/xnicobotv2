const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { getProviderStatus, GOOGLE_VOICES, AZURE_VOICES } = require('../../utils/ttsEngine');

const jsonStore = require('../../utils/jsonStore');
// Import the language map from speak.js
let LANG_MAP;
try {
    LANG_MAP = require('./speak').LANG_MAP;
} catch {
    LANG_MAP = { en: { tts: 'en', label: 'English' }, hi: { tts: 'hi', label: 'Hindi' }, hinglish: { tts: 'hi', label: 'Hinglish' } };
}

module.exports = {
    data: null,
    prefix: 'speak-config',
    description: 'Configure default speak language and voice for server',
    usage: 'speak-config <lang_code | voice male/female | status>',
    category: 'voice',
    aliases: ['speakconfig', 'ttsconfig'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const errContainer = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Permission Denied\n\nYou need **Manage Server** permission to use this command.'));
            return message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
        }

        let guilds = [];
        if (jsonStore.has('guilds')) {
            guilds = jsonStore.read('guilds');
        }
        let guild = guilds.find(g => g.guild_id === message.guild.id);

        // Sub-command: voice gender
        if (args[0]?.toLowerCase() === 'voice') {
            const gender = args[1]?.toLowerCase();
            if (gender !== 'male' && gender !== 'female') {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Settings:1473037894703779851> Voice Gender\n\n` +
                        `**Usage:** \`-speak-config voice <male|female>\`\n\n` +
                        `**Current:** \`${guild?.speak?.voice_gender || 'female'}\`\n\n` +
                        `\`female\` — Female voice (default)\n` +
                        `\`male\` — Male voice\n\n` +
                        `-# Voice varies by provider: Google Neural2, Azure Neural, or Google TTS`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (!guild) {
                guild = { guild_id: message.guild.id };
                guilds.push(guild);
            }
            if (!guild.speak) guild.speak = {};
            guild.speak.voice_gender = gender;
            guild.updated_at = new Date().toISOString();
            jsonStore.write('guilds', guilds);

            const voiceEmoji = gender === 'male' ? '👨' : '👩';
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Voice Updated\n\n` +
                    `${voiceEmoji} Default voice set to **${gender}**.\n\n` +
                    `-# Try it: \`-speak नमस्ते दोस्तों\``
                ));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Sub-command: status - show TTS provider info
        if (args[0]?.toLowerCase() === 'status') {
            const providers = getProviderStatus();
            const currentLang = guild?.speak?.default_lang || 'hi';
            const currentGender = guild?.speak?.voice_gender || 'female';
            const langEntry = LANG_MAP[currentLang] || { tts: 'hi', label: 'Hindi' };
            const ttsCode = langEntry.tts;

            let content = `# <:Settings:1473037894703779851> TTS Status\n\n`;
            content += `### <:Invoice:1473039492217835550> Current Settings\n`;
            content += `**Language:** ${langEntry.label} (\`${currentLang}\`)\n`;
            content += `**Voice:** ${currentGender}\n\n`;
            content += `### 🔌 TTS Providers\n`;
            content += `${providers.googleCloud ? '<:online:1473369837245042762>' : '<:dnd:1473370101427343403>'} **Google Cloud TTS** — ${providers.googleCloud ? 'Active (Neural2 — natural voice)' : 'Not configured'}\n`;
            content += `${providers.azure ? '<:online:1473369837245042762>' : '<:dnd:1473370101427343403>'} **Azure Speech** — ${providers.azure ? 'Active (Neural — natural voice)' : 'Not configured'}\n`;
            content += `${providers.googleTranslate ? '<:online:1473369837245042762>' : '<:dnd:1473370101427343403>'} **Google Translate** — Always available (basic voice)\n\n`;

            if (providers.googleCloud) {
                const gv = GOOGLE_VOICES[ttsCode];
                if (gv) {
                    content += `### 🧠 Active Voice for ${langEntry.label}\n`;
                    content += `**Google Cloud:** \`${currentGender === 'male' ? gv.male : gv.female}\`\n`;
                }
            } else if (providers.azure) {
                const av = AZURE_VOICES[ttsCode];
                if (av) {
                    content += `### 🧠 Active Voice for ${langEntry.label}\n`;
                    content += `**Azure:** \`${currentGender === 'male' ? av.male : av.female}\`\n`;
                }
            }

            if (!providers.googleCloud && !providers.azure) {
                content += `### <:Lightbulbalt:1473038470787240009> Want Natural Voice?\n`;
                content += `Use \`-apikeys\` to configure:\n`;
                content += `**Google Cloud TTS** — \`google_tts\` API key\n`;
                content += `**Azure Speech** — \`azure_tts\` API key + region\n\n`;
                content += `-# Free tiers: Google 1M chars/mo, Azure 500K chars/mo`;
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Set language
        const lang = args[0]?.toLowerCase();

        if (!lang || !LANG_MAP[lang]) {
            // Build a nice categorized help
            const currentLang = guild?.speak?.default_lang || 'hi';
            const currentGender = guild?.speak?.voice_gender || 'female';

            let content = `# <:Settings:1473037894703779851> Speak Configuration\n\n`;
            content += `**Current:** Language: \`${currentLang}\` | Voice: \`${currentGender}\`\n\n`;
            content += `**Usage:**\n`;
            content += `\`-speak-config <lang_code>\` — Set default language\n`;
            content += `\`-speak-config voice <male|female>\` — Set voice gender\n`;
            content += `\`-speak-config status\` — Show TTS providers & info\n\n`;
            content += `### 🇮🇳 Hindi / Hinglish\n`;
            content += `\`hi\` / \`hindi\` — देवनागरी (pure Hindi — natural voice)\n`;
            content += `\`hinglish\` / \`hi-en\` — Hinglish (Roman script)\n\n`;
            content += `### 🇮🇳 Indian Languages\n`;
            content += `\`bn\` Bengali • \`ta\` Tamil • \`te\` Telugu\n`;
            content += `\`mr\` Marathi • \`gu\` Gujarati • \`kn\` Kannada\n`;
            content += `\`pa\` Punjabi • \`ur\` Urdu • \`ml\` Malayalam\n\n`;
            content += `### 🌍 International\n`;
            content += `\`en\` English • \`es\` Spanish • \`fr\` French\n`;
            content += `\`de\` German • \`ja\` Japanese • \`ar\` Arabic\n`;
            content += `\`ru\` Russian • \`pt\` Portuguese • \`ko\` Korean\n`;
            content += `\`zh\` Chinese • \`tr\` Turkish • \`it\` Italian\n\n`;
            content += `**Example:** \`-speak-config hi\` then \`-speak-config voice male\``;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const langEntry = LANG_MAP[lang];
        const guildId = message.guild.id;

        if (!guild) {
            guild = { guild_id: guildId };
            guilds.push(guild);
        }

        if (!guild.speak) guild.speak = {};
        guild.speak.default_lang = lang;
        guild.updated_at = new Date().toISOString();

        jsonStore.write('guilds', guilds);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(
                        `# <:Checkedbox:1473038547165384804> Config Updated\n\n` +
                        `Default speech language set to **${langEntry.label}** (\`${lang}\`).\n\n` +
                        `Now \`-speak नमस्ते\` will use **${langEntry.label}** by default.\n\n` +
                        `-# Tip: Use \`-speak-config voice male\` or \`-speak-config voice female\` to change voice`
                    )
            );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
