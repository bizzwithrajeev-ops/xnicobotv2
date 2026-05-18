'use strict';

const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const { getLeaderboard } = require('../../utils/database');

const TYPE_CONFIG = {
    messages: {
        field: 'analytics.totalMessages',
        label: 'Messages',
        emoji: '<:Bookopen:1473038576391557130>',
        format: v => `${Number(v).toLocaleString()} msgs`,
        color: 0x5865F2,
    },
    voice: {
        field: 'analytics.voiceTime',
        label: 'Voice Time',
        emoji: '<:Volumeup:1473039290136002844>',
        format: v => {
            const s = Number(v) || 0;
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        },
        color: 0xa78bfa,
    },
    xp: {
        field: 'leveling.xp',
        label: 'XP',
        emoji: '<a:loading:1506015728871149770>',
        format: v => `${Number(v).toLocaleString()} XP`,
        color: 0xfbbf24,
    },
    invites: {
        field: 'invites.invites',
        label: 'Invites',
        emoji: '<:Bullhorn:1473038903157199093>',
        format: v => `${Number(v).toLocaleString()} invites`,
        color: 0x34d399,
    },
};

const MEDALS = ['🥇', '🥈', '🥉'];

async function buildTopStatsContainer(guild, type, client) {
    const cfg = TYPE_CONFIG[type];
    const lb  = await getLeaderboard(guild.id, cfg.field, 10);

    // Resolve usernames in parallel — fail gracefully if members left the guild
    const resolved = await Promise.all(
        lb.map(async (entry, i) => {
            const value = entry[cfg.field.split('.')[0]]?.[cfg.field.split('.')[1]] || 0;
            if (value === 0) return null;
            let display = `\`${entry.userId}\``;
            try {
                const member = await guild.members.fetch(entry.userId);
                display = member.user.username;
            } catch {
                try {
                    const user = await client.users.fetch(entry.userId);
                    display = user.username;
                } catch {}
            }
            const medal = MEDALS[i] || `**${i + 1}.**`;
            return `${medal} **${display}** — ${cfg.format(value)}`;
        })
    );

    const lines = resolved.filter(Boolean);
    const bodyText = lines.length > 0
        ? lines.join('\n')
        : '-# No data recorded yet — activity will appear here over time.';

    const typeLabels = Object.entries(TYPE_CONFIG)
        .map(([k, v]) => `\`${k}\``)
        .join('  ');

    return new ContainerBuilder()
        .setAccentColor(cfg.color)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## ${cfg.emoji}  Top ${cfg.label} — ${guild.name}\n` +
                        `-# Showing top ${lines.length || 0} members by ${cfg.label.toLowerCase()}`
                    )
                )
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: guild.iconURL({ size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png' } }))
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# Other types: ${typeLabels}\n` +
                `-# Use \`/memberstats\` to view your own detailed stats`
            )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('topstats')
        .setDescription('View a server leaderboard for various activity metrics')
        .addStringOption(o =>
            o.setName('type')
                .setDescription('Stat type to rank by')
                .setRequired(false)
                .addChoices(
                    { name: '💬 Messages',   value: 'messages' },
                    { name: '🔊 Voice Time', value: 'voice'    },
                    { name: '⚡ XP',         value: 'xp'       },
                    { name: '📨 Invites',    value: 'invites'  },
                )
        ),

    prefix: 'topstats',
    aliases: ['topstat', 'statslb'],
    description: 'View a server leaderboard for various activity metrics',
    usage: 'topstats [messages|voice|xp|invites]',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const type = interaction.options.getString('type') || 'messages';

        try {
            const container = await buildTopStatsContainer(interaction.guild, type, interaction.client);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('topstats error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to fetch leaderboard data.' });
        }
    },

    async executePrefix(message, args) {
        const validTypes = Object.keys(TYPE_CONFIG);
        const type = validTypes.includes(args[0]?.toLowerCase()) ? args[0].toLowerCase() : 'messages';

        try {
            const container = await buildTopStatsContainer(message.guild, type, message.client);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('topstats prefix error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to fetch leaderboard data.');
        }
    }
};
