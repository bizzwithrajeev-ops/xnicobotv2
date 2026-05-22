'use strict';

const {
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
    SectionBuilder, ThumbnailBuilder, AuditLogEvent, MessageFlags, ChannelType,
    WebhookClient, EmbedBuilder
} = require('discord.js');

const jsonStore = require('./jsonStore');
const log = require('./logger-styled');

/* ═══════════════════════════════════════════════════════
   ACCENT COLORS  (used for ContainerBuilder)
   ═══════════════════════════════════════════════════════ */
const Colors = {
    success:    0x57F287,
    error:      0xED4245,
    warning:    0xFEE75C,
    info:       0xCAD7E6,
    muted:      0x99AAB5,
    moderation: 0xE67E22,
    join:       0x57F287,
    leave:      0xED4245,
    update:     0xCAD7E6,
    voice:      0x9B59B6,
    server:     0x3498DB,
    thread:     0x1ABC9C,
    invite:     0xE91E63,
    timeout:    0xF39C12,
    emoji:      0xE67E22,
    boost:      0xF47FFF,
};

/* ═══════════════════════════════════════════════════════
   CUSTOM EMOJIS
   ═══════════════════════════════════════════════════════ */
const E = {
    success:    '<:Checkedbox:1473038547165384804>',
    error:      '<:Cancel:1473037949187657818>',
    settings:   '<:Settings:1473037894703779851>',
    shield:     '<:Shield:1473038669831995494>',
    moderate:   '<:banhammer:1473367388597780592>',
    pin:        '<:Pin:1473038806612447500>',
    mail:       '<:Envelope:1473038885364695113>',
    read:       '<:Bookopen:1473038576391557130>',
    messages:   '<:Chat:1473038936241864865>',
    info:       '<:Inforect:1473038624172937287>',
    stats:      '<:Lightning:1473038797540298792>',
    discord:    '<:xnico:1486755083390550036>',
    shine:      '<:Fire:1473038604812161218>',
    volume:     '<:Volumeup:1473039290136002844>',
    mute:       '<:Volumeoff:1473039301414621427>',
    link:       '<:Attach:1473037923979886694>',
    bolt:       '<:Lightning:1473038797540298792>',
    announce:   '<:Bullhorn:1473038903157199093>',
    dot:        '<:Caretright:1473038207221502106>',
    giveaway:   '<:Money:1473377877239140529>',
    games:      '<:Gamepad:1473039216429498409>',
    folder:     '<:Folder:1473039340425973972>',
    palette:    '<:Palette:1473039029476917461>',
    wdot:       '<:Server:1473039204417142844>',
    voice:      '<:Microphone:1473039293088927996>',
    boost:      '<:Sketch:1473038248493453352>',
    clock:      '<:Clock:1473039102113878056>',
    user:       '<:User:1473038971398520977>',
    copy:       '<:Copy:1473039575302803629>',
    eye:        '<:Eye:1473038435056095242>',
    lock:       '<:Lock:1473038513749491773>',
    unlock:     '<:Unlock:1473038516639236269>',
};

/* ═══════════════════════════════════════════════════════
   CONFIG HELPERS (cached)
   ═══════════════════════════════════════════════════════ */
let _logsCache = null;
let _logsCacheTime = 0;
const CACHE_TTL = 10_000;

function loadLogs() {
    const now = Date.now();
    if (_logsCache && (now - _logsCacheTime) < CACHE_TTL) return _logsCache;
    try {
        if (!jsonStore.has('logs')) return {};
        _logsCache = jsonStore.read('logs');
        _logsCacheTime = now;
        return _logsCache;
    } catch { return {}; }
}

function invalidateCache() { _logsCache = null; }

function getLogChannel(guild, type) {
    const logs = loadLogs();
    const guildLogs = logs[guild.id];
    if (!guildLogs || !guildLogs[type]) return null;
    return guild.channels.cache.get(guildLogs[type]);
}

/**
 * Get the log delivery mode for a guild ('bot' or 'webhook').
 * Defaults to 'bot' if not configured.
 */
function getLogMode(guild) {
    const logs = loadLogs();
    const guildLogs = logs[guild.id];
    if (!guildLogs) return 'bot';
    return guildLogs.mode || 'bot';
}

/**
 * Get the webhook URL for a specific log type in a guild.
 * Returns null if not configured.
 */
function getLogWebhook(guild, type) {
    const logs = loadLogs();
    const guildLogs = logs[guild.id];
    if (!guildLogs || !guildLogs.webhooks || !guildLogs.webhooks[type]) return null;
    return guildLogs.webhooks[type];
}

/* Webhook client cache to avoid recreating clients repeatedly */
const _webhookClients = new Map();
const WEBHOOK_CACHE_TTL = 300_000; // 5 minutes

function getOrCreateWebhookClient(url) {
    const cached = _webhookClients.get(url);
    if (cached && (Date.now() - cached.time) < WEBHOOK_CACHE_TTL) return cached.client;
    try {
        const client = new WebhookClient({ url });
        _webhookClients.set(url, { client, time: Date.now() });
        return client;
    } catch {
        return null;
    }
}

/* ═══════════════════════════════════════════════════════
   V2 COMPONENT HELPERS
   ═══════════════════════════════════════════════════════ */
function ts(date = new Date()) { return `<t:${Math.floor(date.getTime() / 1000)}:F>`; }
function tsR(date) { return `<t:${Math.floor(date.getTime() / 1000)}:R>`; }

function buildLogContainer(accentColor) {
    return new ContainerBuilder().setAccentColor(accentColor);
}

function text(content) {
    return new TextDisplayBuilder().setContent(content);
}

function separator(small = true) {
    return new SeparatorBuilder().setSpacing(small ? SeparatorSpacingSize.Small : SeparatorSpacingSize.Large).setDivider(true);
}

function section(textContent, thumbnailUrl) {
    const s = new SectionBuilder()
        .addTextDisplayComponents(text(textContent));
    if (thumbnailUrl) {
        s.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));
    }
    return s;
}

/**
 * Send a log message. Supports both bot channel messages and webhook delivery.
 * All log messages suppress pings — mentions display as text but never notify.
 * @param {import('discord.js').TextChannel} channel - The log channel
 * @param {ContainerBuilder} container - The Components V2 container
 * @param {import('discord.js').Guild} [guild] - The guild (needed for webhook mode lookup)
 * @param {string} [logType] - The log type key (message/member/voice/server/moderation)
 */
async function sendLog(channel, container, guild, logType) {
    const noMentions = { parse: [] }; // Suppress ALL pings (users, roles, everyone)

    // Check if webhook mode is enabled and a webhook URL is configured
    if (guild && logType) {
        const mode = getLogMode(guild);
        if (mode === 'webhook') {
            const webhookUrl = getLogWebhook(guild, logType);
            if (webhookUrl) {
                try {
                    const webhookClient = getOrCreateWebhookClient(webhookUrl);
                    if (webhookClient) {
                        await webhookClient.send({
                            components: [container],
                            allowedMentions: noMentions,
                            flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications
                        });
                        return;
                    }
                } catch (whErr) {
                    // Webhook failed – fall back to bot channel message
                    log.error(`Logger: Webhook send failed for ${logType} in ${guild.id}:`, whErr.message);
                }
            }
            // If webhook URL is missing but mode is webhook, fall through to bot send
        }
    }

    // Bot channel message (default) – suppress notifications and all pings
    try {
        await channel.send({
            components: [container],
            allowedMentions: noMentions,
            flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications
        });
    } catch (error) {
        try {
            await channel.send({
                components: [container],
                allowedMentions: noMentions,
                flags: MessageFlags.SuppressNotifications
            });
        } catch (e) {
            log.error('Logger: Failed to send log:', e.message);
        }
    }
}

/* ═══════════════════════════════════════════════════════
   <:Editalt:1473038138577256670> MESSAGE LOGS
   ═══════════════════════════════════════════════════════ */

async function logMessageDelete(message) {
    if (!message.guild || message.author?.bot) return;
    const channel = getLogChannel(message.guild, 'message');
    if (!channel) return;

    const content = message.content
        ? (message.content.length > 1000 ? message.content.substring(0, 997) + '...' : message.content)
        : '*No text content*';

    let attachments = '';
    if (message.attachments?.size > 0) {
        attachments = message.attachments.map(a => `> ${E.link} [${a.name || 'file'}](${a.proxyURL})`).slice(0, 5).join('\n');
        if (message.attachments.size > 5) attachments += `\n> *...and ${message.attachments.size - 5} more*`;
    }

    const c = buildLogContainer(Colors.error);
    c.addSectionComponents(
        section(
            `# ${E.error} Message Deleted\n` +
            `${E.messages} **Author:** ${message.author?.username || 'Unknown'} (\`${message.author?.id || 'Unknown'}\`)\n` +
            `${E.pin} **Channel:** ${message.channel}\n` +
            `${E.discord} **User ID:** \`${message.author?.id || 'Unknown'}\``,
            message.author?.displayAvatarURL?.({ size: 128 }) || undefined
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(
        `### ${E.read} Content\n` +
        `>>> ${content}`
    ));

    if (attachments) {
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`### ${E.link} Attachments\n${attachments}`));
    }

    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Message ID: ${message.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, message.guild, 'message');
}

async function logMessageUpdate(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const channel = getLogChannel(newMessage.guild, 'message');
    if (!channel) return;

    const before = oldMessage.content
        ? (oldMessage.content.length > 500 ? oldMessage.content.substring(0, 497) + '...' : oldMessage.content)
        : '*No content*';
    const after = newMessage.content
        ? (newMessage.content.length > 500 ? newMessage.content.substring(0, 497) + '...' : newMessage.content)
        : '*No content*';

    const c = buildLogContainer(Colors.warning);
    c.addSectionComponents(
        section(
            `# ${E.settings} Message Edited\n` +
            `${E.messages} **Author:** ${newMessage.author.username} (\`${newMessage.author.id}\`)\n` +
            `${E.pin} **Channel:** ${newMessage.channel}\n` +
            `${E.link} **[Jump to Message](${newMessage.url})**`,
            newMessage.author.displayAvatarURL({ size: 128 })
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(
        `### ${E.error} Before\n>>> ${before}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(
        `### ${E.success} After\n>>> ${after}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Message ID: ${newMessage.id} • User ID: ${newMessage.author.id}`));

    await sendLog(channel, c, newMessage.guild, 'message');
}

async function logMessageBulkDelete(messages, ch) {
    if (!ch.guild) return;
    const logChannel = getLogChannel(ch.guild, 'message');
    if (!logChannel) return;

    const uniqueAuthors = [...new Set(messages.filter(m => m.author).map(m => m.author.id))];
    const msgArray = [...messages.values()];
    const preview = msgArray
        .filter(m => m.content)
        .slice(0, 5)
        .map(m => `> **${m.author?.username || 'Unknown'}:** ${m.content.substring(0, 80)}${m.content.length > 80 ? '...' : ''}`)
        .join('\n');

    const c = buildLogContainer(Colors.error);
    c.addTextDisplayComponents(text(
        `# ${E.error} Bulk Message Delete\n` +
        `${E.messages} **Messages Deleted:** ${messages.size}\n` +
        `${E.pin} **Channel:** ${ch}\n` +
        `${E.discord} **Unique Authors:** ${uniqueAuthors.length}`
    ));
    if (preview) {
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`### ${E.read} Preview\n${preview}`));
    }
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Channel ID: ${ch.id} • ${tsR(new Date())}`));

    await sendLog(logChannel, c, ch.guild, 'message');
}

/* ═══════════════════════════════════════════════════════
   <:User:1473038971398520977> MEMBER LOGS
   ═══════════════════════════════════════════════════════ */

async function logMemberJoin(member) {
    const channel = getLogChannel(member.guild, 'member');
    if (!channel) return;

    const accountAge = Date.now() - member.user.createdTimestamp;
    const days = Math.floor(accountAge / (1000 * 60 * 60 * 24));
    const risk = days < 1 ? `${E.error} **Very New (< 1 day)**` :
                 days < 7 ? `${E.info} **New Account (${days}d)**` :
                 `${E.success} **Established (${days}d)**`;

    const c = buildLogContainer(Colors.join);
    c.addSectionComponents(
        section(
            `# ${E.success} Member Joined\n` +
            `${E.shine} **User:** ${member.user.username} (\`${member.user.id}\`)\n` +
            `${E.discord} **User ID:** \`${member.id}\`\n` +
            `${E.stats} **Member #${member.guild.memberCount}**`,
            member.user.displayAvatarURL({ size: 256 })
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(
        `### ${E.info} Account Info\n` +
        `> ${E.read} **Created:** ${tsR(member.user.createdAt)}\n` +
        `> ${E.shield} **Risk Level:** ${risk}\n` +
        `> ${E.moderate} **Bot:** ${member.user.bot ? 'Yes' : 'No'}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${member.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, member.guild, 'member');
}

async function logMemberLeave(member) {
    const channel = getLogChannel(member.guild, 'member');
    if (!channel) return;
    if (!member.user) return;

    const roles = member.roles?.cache
        ?.filter(r => r.id !== member.guild.id)
        ?.sort((a, b) => b.position - a.position)
        ?.map(r => r.toString())
        ?.slice(0, 15) || [];

    let rolesDisplay = roles.length > 0 ? roles.join(' ') : '*No roles*';
    if (rolesDisplay.length > 900) rolesDisplay = rolesDisplay.substring(0, 897) + '...';

    const memberDuration = member.joinedAt
        ? Math.floor((Date.now() - member.joinedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

    const c = buildLogContainer(Colors.leave);
    c.addSectionComponents(
        section(
            `# ${E.error} Member Left\n` +
            `${E.shine} **User:** ${member.user.username || 'Unknown'} (\`${member.user.id}\`)\n` +
            `${E.discord} **User ID:** \`${member.id}\`\n` +
            `${E.stats} **Members Now:** ${member.guild.memberCount}`,
            member.user.displayAvatarURL?.({ size: 256 }) || undefined
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(
        `### ${E.info} Membership Info\n` +
        `> ${E.read} **Joined:** ${member.joinedAt ? tsR(member.joinedAt) : 'Unknown'}\n` +
        `> ${E.moderate} **Time in Server:** ${memberDuration !== null ? `${memberDuration} days` : 'Unknown'}\n` +
        `> ${E.palette} **Roles Had:** ${rolesDisplay}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${member.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, member.guild, 'member');
}

async function logMemberUpdate(oldMember, newMember) {
    const channel = getLogChannel(newMember.guild, 'member');
    if (!channel) return;

    const changes = [];

    // Nickname change
    if (oldMember.nickname !== newMember.nickname) {
        changes.push(
            `### ${E.settings} Nickname Changed\n` +
            `> ${E.error} **Before:** ${oldMember.nickname || '*None*'}\n` +
            `> ${E.success} **After:** ${newMember.nickname || '*None*'}`
        );
    }

    // Role changes
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (addedRoles.size > 0) {
        changes.push(`### ${E.success} Roles Added\n> ${addedRoles.map(r => r.toString()).join(' ')}`);
    }
    if (removedRoles.size > 0) {
        changes.push(`### ${E.error} Roles Removed\n> ${removedRoles.map(r => r.toString()).join(' ')}`);
    }

    // Server-specific avatar change
    if (oldMember.avatar !== newMember.avatar) {
        const oldAvatar = oldMember.avatar ? oldMember.displayAvatarURL({ size: 256 }) : null;
        const newAvatar = newMember.avatar ? newMember.displayAvatarURL({ size: 256 }) : null;
        changes.push(
            `### ${E.palette} Server Avatar Changed\n` +
            `> ${E.error} **Before:** ${oldAvatar ? `[Old Avatar](${oldAvatar})` : '*None*'}\n` +
            `> ${E.success} **After:** ${newAvatar ? `[New Avatar](${newAvatar})` : '*None*'}`
        );
    }

    // Timeout change
    if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        if (newMember.communicationDisabledUntilTimestamp && newMember.communicationDisabledUntilTimestamp > Date.now()) {
            changes.push(
                `### ${E.mute} Member Timed Out\n` +
                `> ${E.moderate} **Timeout Until:** <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>\n` +
                `> ${E.read} **Expires:** ${tsR(new Date(newMember.communicationDisabledUntilTimestamp))}`
            );
        } else if (oldMember.communicationDisabledUntilTimestamp && (!newMember.communicationDisabledUntilTimestamp || newMember.communicationDisabledUntilTimestamp <= Date.now())) {
            changes.push(`### ${E.success} Timeout Removed\n> ${E.shine} Member can speak again`);
        }
    }

    // Boost status
    if (!oldMember.premiumSince && newMember.premiumSince) {
        changes.push(`### ${E.boost} Started Boosting\n> ${E.shine} Now boosting the server!`);
    } else if (oldMember.premiumSince && !newMember.premiumSince) {
        changes.push(`### ${E.error} Stopped Boosting\n> Member is no longer boosting`);
    }

    // Pending verification
    if (oldMember.pending && !newMember.pending) {
        changes.push(`### ${E.success} Passed Membership Screening\n> Member completed the membership gate`);
    }

    if (changes.length === 0) return;

    const c = buildLogContainer(Colors.update);
    c.addSectionComponents(
        section(
            `# ${E.settings} Member Updated\n` +
            `${E.shine} **User:** ${newMember.user.username} (\`${newMember.user.id}\`)\n` +
            `${E.discord} **User ID:** \`${newMember.id}\``,
            newMember.user.displayAvatarURL({ size: 128 })
        )
    );

    for (const change of changes) {
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(change));
    }

    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${newMember.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, newMember.guild, 'member');
}

/* ═══════════════════════════════════════════════════════
   <:Bookopen:1473038576391557130> USER UPDATE LOGS (avatar, username, global name, banner)
   ═══════════════════════════════════════════════════════ */

async function logUserUpdate(oldUser, newUser, client) {
    const guilds = client.guilds.cache.filter(g => g.members.cache.has(newUser.id));

    for (const [, guild] of guilds) {
        const channel = getLogChannel(guild, 'member');
        if (!channel) continue;

        const changes = [];

        // Username change
        if (oldUser.username !== newUser.username) {
            changes.push(
                `### ${E.settings} Username Changed\n` +
                `> ${E.error} **Before:** \`${oldUser.username}\`\n` +
                `> ${E.success} **After:** \`${newUser.username}\``
            );
        }

        // Display name (global name) change
        if (oldUser.globalName !== newUser.globalName) {
            changes.push(
                `### ${E.shine} Display Name Changed\n` +
                `> ${E.error} **Before:** ${oldUser.globalName || '*None*'}\n` +
                `> ${E.success} **After:** ${newUser.globalName || '*None*'}`
            );
        }

        // Avatar change
        if (oldUser.avatar !== newUser.avatar) {
            const oldUrl = oldUser.avatar ? oldUser.displayAvatarURL({ size: 256 }) : null;
            const newUrl = newUser.avatar ? newUser.displayAvatarURL({ size: 256 }) : null;
            changes.push(
                `### ${E.palette} Avatar Changed\n` +
                `> ${E.error} **Before:** ${oldUrl ? `[Old Avatar](${oldUrl})` : '*Default*'}\n` +
                `> ${E.success} **After:** ${newUrl ? `[New Avatar](${newUrl})` : '*Default*'}`
            );
        }

        // Banner change
        if (oldUser.banner !== newUser.banner) {
            changes.push(`### ${E.palette} Banner Changed\n> User updated their profile banner`);
        }

        // Discriminator change
        if (oldUser.discriminator !== newUser.discriminator) {
            changes.push(
                `### ${E.discord} Discriminator Changed\n` +
                `> **Before:** #${oldUser.discriminator} → **After:** #${newUser.discriminator}`
            );
        }

        if (changes.length === 0) continue;

        const c = buildLogContainer(Colors.update);
        c.addSectionComponents(
            section(
                `# ${E.discord} User Profile Updated\n` +
                `${E.shine} **User:** ${newUser.username} (\`${newUser.id}\`)\n` +
                `${E.discord} **User ID:** \`${newUser.id}\``,
                newUser.displayAvatarURL({ size: 256 })
            )
        );

        for (const change of changes) {
            c.addSeparatorComponents(separator());
            c.addTextDisplayComponents(text(change));
        }

        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${newUser.id} • ${tsR(new Date())}`));

        await sendLog(channel, c, guild, 'member');
    }
}

/* ═══════════════════════════════════════════════════════
   <:Volumeup:1473039290136002844> VOICE LOGS
   ═══════════════════════════════════════════════════════ */

async function logVoiceStateUpdate(oldState, newState) {
    const channel = getLogChannel(newState.guild, 'voice');
    if (!channel) return;

    const member = newState.member;
    if (!member || !member.user) return;

    const avatar = member.user.displayAvatarURL?.({ size: 128 }) || undefined;
    const tag = member.user.username || 'Unknown User';

    // Voice Join
    if (!oldState.channel && newState.channel) {
        const memberCount = newState.channel.members?.size || 1;
        const c = buildLogContainer(Colors.join);
        c.addSectionComponents(
            section(
                `# ${E.success} Voice Channel Join\n` +
                `${E.shine} **User:** ${tag} (\`${member.user.id}\`)\n` +
                `${E.volume} **Channel:** ${newState.channel.name}\n` +
                `${E.discord} **Members in VC:** ${memberCount}`,
                avatar
            )
        );
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`-# ${E.wdot} Channel ID: ${newState.channel.id} • User ID: ${member.id}`));
        return sendLog(channel, c, newState.guild, 'voice');
    }

    // Voice Leave
    if (oldState.channel && !newState.channel) {
        const remaining = oldState.channel.members?.size || 0;
        const c = buildLogContainer(Colors.leave);
        c.addSectionComponents(
            section(
                `# ${E.error} Voice Channel Leave\n` +
                `${E.shine} **User:** ${tag} (\`${member.user.id}\`)\n` +
                `${E.mute} **Channel:** ${oldState.channel.name}\n` +
                `${E.discord} **Remaining:** ${remaining === 0 ? 'Channel empty' : `${remaining} members`}`,
                avatar
            )
        );
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`-# ${E.wdot} Channel ID: ${oldState.channel.id} • User ID: ${member.id}`));
        return sendLog(channel, c, newState.guild, 'voice');
    }

    // Voice Switch
    if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        const c = buildLogContainer(Colors.voice);
        c.addSectionComponents(
            section(
                `# ${E.voice} Voice Channel Switch\n` +
                `${E.shine} **User:** ${tag} (\`${member.user.id}\`)\n` +
                `${E.error} **From:** ${oldState.channel.name}\n` +
                `${E.success} **To:** ${newState.channel.name}`,
                avatar
            )
        );
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${member.id} • ${tsR(new Date())}`));
        return sendLog(channel, c, newState.guild, 'voice');
    }

    // Voice State Changes (mute/deaf/stream/video/suppress)
    const voiceChanges = [];
    if (oldState.selfMute !== newState.selfMute) {
        voiceChanges.push(`> ${newState.selfMute ? E.mute : E.volume} **Self Mute:** ${newState.selfMute ? 'Muted' : 'Unmuted'}`);
    }
    if (oldState.selfDeaf !== newState.selfDeaf) {
        voiceChanges.push(`> ${newState.selfDeaf ? E.mute : E.volume} **Self Deaf:** ${newState.selfDeaf ? 'Deafened' : 'Undeafened'}`);
    }
    if (oldState.serverMute !== newState.serverMute) {
        voiceChanges.push(`> ${newState.serverMute ? E.error : E.success} **Server Mute:** ${newState.serverMute ? 'Muted' : 'Unmuted'}`);
    }
    if (oldState.serverDeaf !== newState.serverDeaf) {
        voiceChanges.push(`> ${newState.serverDeaf ? E.error : E.success} **Server Deaf:** ${newState.serverDeaf ? 'Deafened' : 'Undeafened'}`);
    }
    if (oldState.streaming !== newState.streaming) {
        voiceChanges.push(`> ${newState.streaming ? E.bolt : E.wdot} **Streaming:** ${newState.streaming ? 'Started' : 'Stopped'}`);
    }
    if (oldState.selfVideo !== newState.selfVideo) {
        voiceChanges.push(`> ${newState.selfVideo ? E.success : E.error} **Camera:** ${newState.selfVideo ? 'Turned On' : 'Turned Off'}`);
    }
    if (oldState.suppress !== newState.suppress) {
        voiceChanges.push(`> ${newState.suppress ? E.mute : E.volume} **Stage Suppressed:** ${newState.suppress ? 'Yes' : 'No'}`);
    }

    if (voiceChanges.length > 0 && newState.channel) {
        const c = buildLogContainer(Colors.update);
        c.addSectionComponents(
            section(
                `# ${E.settings} Voice State Update\n` +
                `${E.shine} **User:** ${tag} (\`${member.user.id}\`)\n` +
                `${E.volume} **Channel:** ${newState.channel.name}`,
                avatar
            )
        );
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`### ${E.info} Changes\n${voiceChanges.join('\n')}`));
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${member.id} • ${tsR(new Date())}`));
        return sendLog(channel, c, newState.guild, 'voice');
    }
}

/* ═══════════════════════════════════════════════════════
   🏗️ CHANNEL LOGS
   ═══════════════════════════════════════════════════════ */

const CHANNEL_TYPE_NAMES = {
    [ChannelType.GuildText]: 'Text Channel',
    [ChannelType.GuildVoice]: 'Voice Channel',
    [ChannelType.GuildCategory]: 'Category',
    [ChannelType.GuildAnnouncement]: 'Announcement',
    [ChannelType.GuildStageVoice]: 'Stage Channel',
    [ChannelType.GuildForum]: 'Forum Channel',
    [ChannelType.GuildMedia]: 'Media Channel',
    [ChannelType.PublicThread]: 'Public Thread',
    [ChannelType.PrivateThread]: 'Private Thread',
    [ChannelType.AnnouncementThread]: 'Announcement Thread',
};

async function logChannelCreate(ch) {
    if (!ch.guild) return;
    const logChannel = getLogChannel(ch.guild, 'server');
    if (!logChannel) return;

    const typeName = CHANNEL_TYPE_NAMES[ch.type] || `Type ${ch.type}`;

    const c = buildLogContainer(Colors.success);
    c.addTextDisplayComponents(text(
        `# ${E.success} Channel Created\n` +
        `${E.pin} **Channel:** ${ch}\n` +
        `${E.read} **Type:** ${typeName}\n` +
        `${E.discord} **Channel ID:** \`${ch.id}\`` +
        (ch.parent ? `\n${E.folder} **Category:** ${ch.parent.name}` : '')
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Channel ID: ${ch.id} • ${tsR(new Date())}`));

    await sendLog(logChannel, c, ch.guild, 'server');
}

async function logChannelDelete(ch) {
    if (!ch.guild) return;
    const logChannel = getLogChannel(ch.guild, 'server');
    if (!logChannel) return;

    const typeName = CHANNEL_TYPE_NAMES[ch.type] || `Type ${ch.type}`;

    const c = buildLogContainer(Colors.error);
    c.addTextDisplayComponents(text(
        `# ${E.error} Channel Deleted\n` +
        `${E.pin} **Channel:** #${ch.name}\n` +
        `${E.read} **Type:** ${typeName}\n` +
        `${E.discord} **Channel ID:** \`${ch.id}\`` +
        (ch.parent ? `\n${E.folder} **Was in:** ${ch.parent.name}` : '')
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Channel ID: ${ch.id} • ${tsR(new Date())}`));

    await sendLog(logChannel, c, ch.guild, 'server');
}

async function logChannelUpdate(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    const channel = getLogChannel(newChannel.guild, 'server');
    if (!channel) return;

    const changes = [];

    if (oldChannel.name !== newChannel.name) {
        changes.push(`> ${E.settings} **Name:** \`${oldChannel.name}\` → \`${newChannel.name}\``);
    }
    if (oldChannel.topic !== newChannel.topic) {
        const oldTopic = (oldChannel.topic || '*None*').substring(0, 100);
        const newTopic = (newChannel.topic || '*None*').substring(0, 100);
        changes.push(`> ${E.read} **Topic:** ${oldTopic} → ${newTopic}`);
    }
    if (oldChannel.nsfw !== newChannel.nsfw) {
        changes.push(`> ${E.error} **NSFW:** ${oldChannel.nsfw ? 'On' : 'Off'} → ${newChannel.nsfw ? 'On' : 'Off'}`);
    }
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push(`> ${E.moderate} **Slowmode:** ${oldChannel.rateLimitPerUser || 0}s → ${newChannel.rateLimitPerUser || 0}s`);
    }
    if (oldChannel.bitrate !== newChannel.bitrate) {
        changes.push(`> ${E.volume} **Bitrate:** ${(oldChannel.bitrate || 0) / 1000}kbps → ${(newChannel.bitrate || 0) / 1000}kbps`);
    }
    if (oldChannel.userLimit !== newChannel.userLimit) {
        changes.push(`> ${E.discord} **User Limit:** ${oldChannel.userLimit || '∞'} → ${newChannel.userLimit || '∞'}`);
    }
    if (oldChannel.parentId !== newChannel.parentId) {
        changes.push(`> ${E.folder} **Category:** ${oldChannel.parent?.name || '*None*'} → ${newChannel.parent?.name || '*None*'}`);
    }

    if (changes.length === 0) return;

    const c = buildLogContainer(Colors.update);
    c.addTextDisplayComponents(text(
        `# ${E.settings} Channel Updated\n` +
        `${E.pin} **Channel:** ${newChannel}\n` +
        `${E.discord} **Channel ID:** \`${newChannel.id}\``
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`### ${E.info} Changes\n${changes.join('\n')}`));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Channel ID: ${newChannel.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, newChannel.guild, 'server');
}

/* ═══════════════════════════════════════════════════════
   <:Userplus:1473038912212435086> ROLE LOGS
   ═══════════════════════════════════════════════════════ */

async function logRoleCreate(role) {
    const channel = getLogChannel(role.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(role.color || Colors.success);
    c.addTextDisplayComponents(text(
        `# ${E.success} Role Created\n` +
        `${E.shield} **Role:** ${role}\n` +
        `${E.discord} **Role ID:** \`${role.id}\`\n` +
        `${E.palette} **Color:** ${role.hexColor}\n` +
        `${E.stats} **Position:** #${role.position}\n` +
        `${E.moderate} **Hoisted:** ${role.hoist ? 'Yes' : 'No'} • **Mentionable:** ${role.mentionable ? 'Yes' : 'No'}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Role ID: ${role.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, role.guild, 'server');
}

async function logRoleDelete(role) {
    const channel = getLogChannel(role.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.error);
    c.addTextDisplayComponents(text(
        `# ${E.error} Role Deleted\n` +
        `${E.shield} **Role:** @${role.name}\n` +
        `${E.discord} **Role ID:** \`${role.id}\`\n` +
        `${E.palette} **Color:** ${role.hexColor}\n` +
        `${E.stats} **Had Position:** #${role.position}\n` +
        `${E.discord} **Had Members:** ${role.members?.size || 0}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Role ID: ${role.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, role.guild, 'server');
}

async function logRoleUpdate(oldRole, newRole) {
    const channel = getLogChannel(newRole.guild, 'server');
    if (!channel) return;

    const changes = [];

    if (oldRole.name !== newRole.name) {
        changes.push(`> ${E.settings} **Name:** \`${oldRole.name}\` → \`${newRole.name}\``);
    }
    if (oldRole.color !== newRole.color) {
        changes.push(`> ${E.palette} **Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
    }
    if (oldRole.hoist !== newRole.hoist) {
        changes.push(`> ${E.stats} **Hoisted:** ${oldRole.hoist ? 'Yes' : 'No'} → ${newRole.hoist ? 'Yes' : 'No'}`);
    }
    if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(`> ${E.announce} **Mentionable:** ${oldRole.mentionable ? 'Yes' : 'No'} → ${newRole.mentionable ? 'Yes' : 'No'}`);
    }
    if (oldRole.icon !== newRole.icon) {
        changes.push(`> ${E.shine} **Icon:** Changed`);
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        const added = newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p));
        const removed = oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p));
        if (added.length > 0) changes.push(`> ${E.success} **Perms Added:** ${added.slice(0, 8).join(', ')}${added.length > 8 ? ` +${added.length - 8} more` : ''}`);
        if (removed.length > 0) changes.push(`> ${E.error} **Perms Removed:** ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ` +${removed.length - 8} more` : ''}`);
    }

    if (changes.length === 0) return;

    const c = buildLogContainer(newRole.color || Colors.update);
    c.addTextDisplayComponents(text(
        `# ${E.settings} Role Updated\n` +
        `${E.shield} **Role:** ${newRole}\n` +
        `${E.discord} **Role ID:** \`${newRole.id}\``
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`### ${E.info} Changes\n${changes.join('\n')}`));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Role ID: ${newRole.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, newRole.guild, 'server');
}

/* ═══════════════════════════════════════════════════════
   🏛️ GUILD UPDATE LOGS
   ═══════════════════════════════════════════════════════ */

async function logGuildUpdate(oldGuild, newGuild) {
    const channel = getLogChannel(newGuild, 'server');
    if (!channel) return;

    const changes = [];

    if (oldGuild.name !== newGuild.name) {
        changes.push(`> ${E.settings} **Name:** \`${oldGuild.name}\` → \`${newGuild.name}\``);
    }
    if (oldGuild.icon !== newGuild.icon) {
        const newIcon = newGuild.iconURL({ size: 256 });
        changes.push(`> ${E.palette} **Icon:** ${newIcon ? `[Updated](${newIcon})` : 'Removed'}`);
    }
    if (oldGuild.banner !== newGuild.banner) {
        changes.push(`> ${E.palette} **Banner:** ${newGuild.banner ? 'Updated' : 'Removed'}`);
    }
    if (oldGuild.splash !== newGuild.splash) {
        changes.push(`> ${E.shine} **Invite Splash:** ${newGuild.splash ? 'Updated' : 'Removed'}`);
    }
    if (oldGuild.description !== newGuild.description) {
        changes.push(`> ${E.read} **Description:** ${newGuild.description || '*Removed*'}`);
    }
    if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        changes.push(`> ${E.link} **Vanity URL:** \`${oldGuild.vanityURLCode || 'None'}\` → \`${newGuild.vanityURLCode || 'None'}\``);
    }
    if (oldGuild.ownerId !== newGuild.ownerId) {
        changes.push(`> ${E.shield} **Owner:** <@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`);
    }
    if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        const levels = ['None', 'Low', 'Medium', 'High', 'Very High'];
        changes.push(`> ${E.moderate} **Verification:** ${levels[oldGuild.verificationLevel] || '?'} → ${levels[newGuild.verificationLevel] || '?'}`);
    }
    if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
        const filters = ['Disabled', 'Members without roles', 'All members'];
        changes.push(`> ${E.shield} **Content Filter:** ${filters[oldGuild.explicitContentFilter] || '?'} → ${filters[newGuild.explicitContentFilter] || '?'}`);
    }
    if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
        changes.push(`> ${E.messages} **Notifications:** ${oldGuild.defaultMessageNotifications === 0 ? 'All Messages' : 'Only Mentions'} → ${newGuild.defaultMessageNotifications === 0 ? 'All Messages' : 'Only Mentions'}`);
    }
    if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
        changes.push(`> ${E.pin} **System Channel:** ${newGuild.systemChannelId ? `<#${newGuild.systemChannelId}>` : '*None*'}`);
    }
    if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) {
        changes.push(`> ${E.read} **Rules Channel:** ${newGuild.rulesChannelId ? `<#${newGuild.rulesChannelId}>` : '*None*'}`);
    }
    if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
        changes.push(`> ${E.mute} **AFK Channel:** ${newGuild.afkChannelId ? `<#${newGuild.afkChannelId}>` : '*None*'}`);
    }
    if (oldGuild.afkTimeout !== newGuild.afkTimeout) {
        changes.push(`> ${E.moderate} **AFK Timeout:** ${oldGuild.afkTimeout / 60}min → ${newGuild.afkTimeout / 60}min`);
    }
    if (oldGuild.premiumTier !== newGuild.premiumTier) {
        changes.push(`> ${E.boost} **Boost Level:** Tier ${oldGuild.premiumTier} → Tier ${newGuild.premiumTier}`);
    }
    if (oldGuild.preferredLocale !== newGuild.preferredLocale) {
        changes.push(`> ${E.discord} **Locale:** ${oldGuild.preferredLocale} → ${newGuild.preferredLocale}`);
    }
    if (oldGuild.nsfwLevel !== newGuild.nsfwLevel) {
        changes.push(`> ${E.error} **NSFW Level:** ${oldGuild.nsfwLevel} → ${newGuild.nsfwLevel}`);
    }

    if (changes.length === 0) return;

    const c = buildLogContainer(Colors.server);
    c.addTextDisplayComponents(text(
        `# ${E.settings} Server Updated\n` +
        `${E.discord} **Server:** ${newGuild.name}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`### ${E.info} Changes\n${changes.join('\n')}`));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Guild ID: ${newGuild.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, newGuild, 'server');
}

/* ═══════════════════════════════════════════════════════
   <:banhammer:1473367388597780592> MODERATION LOGS
   ═══════════════════════════════════════════════════════ */

async function logBan(guild, user) {
    const channel = getLogChannel(guild, 'moderation');
    if (!channel) return;

    let moderator = null, reason = null;
    try {
        const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
        const entry = auditLogs.entries.first();
        if (entry && entry.target.id === user.id && (Date.now() - entry.createdTimestamp) < 10_000) {
            moderator = entry.executor;
            reason = entry.reason;
        }
    } catch {}

    const c = buildLogContainer(Colors.error);
    c.addSectionComponents(
        section(
            `# ${E.error} Member Banned\n` +
            `${E.shine} **User:** ${user.username} (\`${user.id}\`)\n` +
            `${E.discord} **User ID:** \`${user.id}\`` +
            (moderator ? `\n${E.shield} **Moderator:** ${moderator.username} (\`${moderator.id}\`)` : '') +
            `\n${E.read} **Reason:** ${reason || '*No reason provided*'}`,
            user.displayAvatarURL({ size: 256 })
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${user.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, guild, 'moderation');
}

async function logUnban(guild, user) {
    const channel = getLogChannel(guild, 'moderation');
    if (!channel) return;

    let moderator = null;
    try {
        const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
        const entry = auditLogs.entries.first();
        if (entry && entry.target.id === user.id && (Date.now() - entry.createdTimestamp) < 10_000) {
            moderator = entry.executor;
        }
    } catch {}

    const c = buildLogContainer(Colors.success);
    c.addSectionComponents(
        section(
            `# ${E.success} Member Unbanned\n` +
            `${E.shine} **User:** ${user.username} (\`${user.id}\`)\n` +
            `${E.discord} **User ID:** \`${user.id}\`` +
            (moderator ? `\n${E.shield} **Moderator:** ${moderator.username} (\`${moderator.id}\`)` : ''),
            user.displayAvatarURL({ size: 256 })
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${user.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, guild, 'moderation');
}

async function logMemberKick(member, executor, reason) {
    const channel = getLogChannel(member.guild, 'moderation');
    if (!channel) return;

    const c = buildLogContainer(Colors.moderation);
    c.addSectionComponents(
        section(
            `# ${E.moderate} Member Kicked\n` +
            `${E.shine} **User:** ${member.user.username} (\`${member.user.id}\`)\n` +
            `${E.discord} **User ID:** \`${member.id}\`\n` +
            `${E.shield} **Moderator:** ${executor ? `${executor.username} (\`${executor.id}\`)` : '*Unknown*'}\n` +
            `${E.read} **Reason:** ${reason || '*No reason provided*'}`,
            member.user.displayAvatarURL({ size: 256 })
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${member.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, member.guild, 'moderation');
}

async function logTimeout(member, executor, duration, reason) {
    const channel = getLogChannel(member.guild, 'moderation');
    if (!channel) return;

    const c = buildLogContainer(Colors.timeout);
    c.addSectionComponents(
        section(
            `# ${E.mute} Member Timed Out\n` +
            `${E.shine} **User:** ${member.user.username} (\`${member.user.id}\`)\n` +
            `${E.discord} **User ID:** \`${member.id}\`\n` +
            `${E.shield} **Moderator:** ${executor ? `${executor.username} (\`${executor.id}\`)` : '*Unknown*'}\n` +
            `${E.moderate} **Duration:** ${duration || 'Unknown'}\n` +
            `${E.read} **Reason:** ${reason || '*No reason provided*'}`,
            member.user.displayAvatarURL({ size: 256 })
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} User ID: ${member.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, member.guild, 'moderation');
}

/* ═══════════════════════════════════════════════════════
   😄 EMOJI & STICKER LOGS
   ═══════════════════════════════════════════════════════ */

async function logEmojiCreate(emoji) {
    const channel = getLogChannel(emoji.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.success);
    c.addTextDisplayComponents(text(
        `# ${E.success} Emoji Added\n` +
        `${E.shine} **Emoji:** ${emoji} \`:${emoji.name}:\`\n` +
        `${E.discord} **Emoji ID:** \`${emoji.id}\`\n` +
        `${E.read} **Animated:** ${emoji.animated ? 'Yes' : 'No'}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Emoji ID: ${emoji.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, emoji.guild, 'server');
}

async function logEmojiDelete(emoji) {
    const channel = getLogChannel(emoji.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.error);
    c.addTextDisplayComponents(text(
        `# ${E.error} Emoji Removed\n` +
        `${E.shine} **Name:** :${emoji.name}:\n` +
        `${E.discord} **Emoji ID:** \`${emoji.id}\`\n` +
        `${E.read} **Was Animated:** ${emoji.animated ? 'Yes' : 'No'}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Emoji ID: ${emoji.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, emoji.guild, 'server');
}

async function logEmojiUpdate(oldEmoji, newEmoji) {
    const channel = getLogChannel(newEmoji.guild, 'server');
    if (!channel) return;

    const changes = [];
    if (oldEmoji.name !== newEmoji.name) {
        changes.push(`> ${E.settings} **Name:** \`:${oldEmoji.name}:\` → \`:${newEmoji.name}:\``);
    }

    if (changes.length === 0) return;

    const c = buildLogContainer(Colors.update);
    c.addTextDisplayComponents(text(
        `# ${E.settings} Emoji Updated\n` +
        `${E.shine} **Emoji:** ${newEmoji}\n` +
        `${E.discord} **Emoji ID:** \`${newEmoji.id}\``
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`### ${E.info} Changes\n${changes.join('\n')}`));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Emoji ID: ${newEmoji.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, newEmoji.guild, 'server');
}

async function logStickerCreate(sticker) {
    if (!sticker.guild) return;
    const channel = getLogChannel(sticker.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.success);
    c.addTextDisplayComponents(text(
        `# ${E.success} Sticker Added\n` +
        `${E.shine} **Name:** ${sticker.name}\n` +
        `${E.read} **Description:** ${sticker.description || '*None*'}\n` +
        `${E.discord} **Sticker ID:** \`${sticker.id}\``
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Sticker ID: ${sticker.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, sticker.guild, 'server');
}

async function logStickerDelete(sticker) {
    if (!sticker.guild) return;
    const channel = getLogChannel(sticker.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.error);
    c.addTextDisplayComponents(text(
        `# ${E.error} Sticker Removed\n` +
        `${E.shine} **Name:** ${sticker.name}\n` +
        `${E.discord} **Sticker ID:** \`${sticker.id}\``
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Sticker ID: ${sticker.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, sticker.guild, 'server');
}

/* ═══════════════════════════════════════════════════════
   🧵 THREAD LOGS
   ═══════════════════════════════════════════════════════ */

async function logThreadCreate(thread) {
    if (!thread.guild) return;
    const channel = getLogChannel(thread.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.thread);
    c.addTextDisplayComponents(text(
        `# ${E.success} Thread Created\n` +
        `${E.pin} **Thread:** ${thread}\n` +
        `${E.read} **Type:** ${CHANNEL_TYPE_NAMES[thread.type] || 'Thread'}\n` +
        `${E.discord} **Thread ID:** \`${thread.id}\`\n` +
        `${E.folder} **Parent:** ${thread.parent || '*Unknown*'}\n` +
        `${E.shine} **Owner:** <@${thread.ownerId}>`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Thread ID: ${thread.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, thread.guild, 'server');
}

async function logThreadDelete(thread) {
    if (!thread.guild) return;
    const channel = getLogChannel(thread.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.error);
    c.addTextDisplayComponents(text(
        `# ${E.error} Thread Deleted\n` +
        `${E.pin} **Thread:** #${thread.name}\n` +
        `${E.discord} **Thread ID:** \`${thread.id}\``
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Thread ID: ${thread.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, thread.guild, 'server');
}

/* ═══════════════════════════════════════════════════════
   <:Attach:1473037923979886694> INVITE LOGS
   ═══════════════════════════════════════════════════════ */

async function logInviteCreate(invite) {
    if (!invite.guild) return;
    const channel = getLogChannel(invite.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.invite);
    c.addTextDisplayComponents(text(
        `# ${E.link} Invite Created\n` +
        `${E.shine} **Code:** \`${invite.code}\`\n` +
        `${E.discord} **Creator:** ${invite.inviter || '*Unknown*'}\n` +
        `${E.pin} **Channel:** ${invite.channel || '*Unknown*'}\n` +
        `${E.moderate} **Max Uses:** ${invite.maxUses || 'Unlimited'}\n` +
        `${E.read} **Expires:** ${invite.expiresAt ? tsR(invite.expiresAt) : 'Never'}\n` +
        `${E.info} **Temporary:** ${invite.temporary ? 'Yes' : 'No'}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Invite Code: ${invite.code} • ${tsR(new Date())}`));

    await sendLog(channel, c, invite.guild, 'server');
}

async function logInviteDelete(invite) {
    if (!invite.guild) return;
    const channel = getLogChannel(invite.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.muted);
    c.addTextDisplayComponents(text(
        `# ${E.error} Invite Deleted\n` +
        `${E.shine} **Code:** \`${invite.code}\`\n` +
        `${E.pin} **Channel:** ${invite.channel || '*Unknown*'}\n` +
        `${E.stats} **Uses:** ${invite.uses ?? 'Unknown'}`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Invite Code: ${invite.code} • ${tsR(new Date())}`));

    await sendLog(channel, c, invite.guild, 'server');
}

/* ═══════════════════════════════════════════════════════
   <:Bookopen:1473038576391557130> WEBHOOK LOGS
   ═══════════════════════════════════════════════════════ */

async function logWebhookUpdate(ch) {
    if (!ch.guild) return;
    const channel = getLogChannel(ch.guild, 'server');
    if (!channel) return;

    const c = buildLogContainer(Colors.update);
    c.addTextDisplayComponents(text(
        `# ${E.settings} Webhook Updated\n` +
        `${E.pin} **Channel:** ${ch}\n` +
        `${E.discord} **Channel ID:** \`${ch.id}\`\n` +
        `-# A webhook in this channel was created, updated, or deleted`
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} Channel ID: ${ch.id} • ${tsR(new Date())}`));

    await sendLog(channel, c, ch.guild, 'server');
}

/* ═══════════════════════════════════════════════════════
   <:Lightning:1473038797540298792> AUTOMOD ACTION LOGS
   ═══════════════════════════════════════════════════════ */

async function logAutomodAction(guild, data) {
    const channel = getLogChannel(guild, 'automod');
    if (!channel) return;

    const { user, action, reason, rule, channelId, content } = data;
    const actionLabels = { block: 'Message Blocked', timeout: 'User Timed Out', alert: 'Alert Sent', flag: 'Message Flagged' };

    const c = buildLogContainer(Colors.warning);
    c.addTextDisplayComponents(text(
        `# ${E.shield} AutoMod Action\n` +
        `${E.moderate} **Action:** ${actionLabels[action] || action}\n` +
        `${E.shine} **User:** ${user?.username || 'Unknown'} (\`${user?.id || '?'}\`)\n` +
        `${E.pin} **Channel:** ${channelId ? `<#${channelId}>` : 'Unknown'}\n` +
        `${E.read} **Rule:** ${rule || 'Custom Rule'}`
    ));
    if (content) {
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`### ${E.messages} Flagged Content\n>>> ${content.slice(0, 500)}`));
    }
    if (reason) {
        c.addSeparatorComponents(separator());
        c.addTextDisplayComponents(text(`### ${E.info} Reason\n> ${reason}`));
    }
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} ${tsR(new Date())}`));

    await sendLog(channel, c, guild, 'automod');
}

/* ═══════════════════════════════════════════════════════
   <:Sketch:1473038248493453352> BOOST LOGS
   ═══════════════════════════════════════════════════════ */

async function logBoostEvent(member, started) {
    const channel = getLogChannel(member.guild, 'boost');
    if (!channel) return;

    const c = buildLogContainer(Colors.boost);
    c.addSectionComponents(
        section(
            `# ${E.boost} Server ${started ? 'Boosted' : 'Unboost'}\n` +
            `${E.shine} **User:** ${member.user.username} (\`${member.user.id}\`)\n` +
            `${E.boost} **Boost Level:** ${member.guild.premiumTier}\n` +
            `${E.stats} **Total Boosts:** ${member.guild.premiumSubscriptionCount || 0}`,
            member.user.displayAvatarURL({ size: 256 })
        )
    );
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} ${started ? 'Started boosting' : 'Stopped boosting'} • ${tsR(new Date())}`));

    await sendLog(channel, c, member.guild, 'boost');
}

/* ═══════════════════════════════════════════════════════
   <:Gamepad:1473039216429498409> COMMAND USAGE LOGS
   ═══════════════════════════════════════════════════════ */

async function logCommandUsage(guild, user, commandName, channelId, type = 'slash') {
    const channel = getLogChannel(guild, 'commands');
    if (!channel) return;

    const c = buildLogContainer(Colors.info);
    c.addTextDisplayComponents(text(
        `${E.games} **${user.username}** used \`${type === 'slash' ? '/' : '-'}${commandName}\` in <#${channelId}>`
    ));

    await sendLog(channel, c, guild, 'commands');
}

/* ═══════════════════════════════════════════════════════
   <:Shield:1473038669831995494> SECURITY EVENT LOGS
   (Anti-Nuke triggers, Anti-Raid actions, Anti-Alt detections,
    Threat / Emergency mode, Vanity Guard, Whitelist edits, etc.)

   These all route through the `'security'` log channel category.
   `logging-setup.js` exposes a "Security Logs" toggle so guilds
   can pick which channel receives these events.
   ═══════════════════════════════════════════════════════ */

/**
 * Anti-Nuke trigger executed (a user hit the limit and was punished).
 *
 * @param {Guild} guild
 * @param {Object} payload
 *   - executor:    { id, username, tag? } the offender
 *   - action:      string action key ('ban'|'kick'|'channel'|...)
 *   - punishment:  string, e.g. 'remove_roles' / 'ban' / 'kick_bot'
 *   - limit:       number
 *   - timeWindow:  ms
 *   - violations:  number
 *   - target:      optional string identifier (channel name etc.)
 */
async function logAntinukeTrigger(guild, payload) {
    const channel = getLogChannel(guild, 'security');
    if (!channel) return;

    const accentMap = { ban: 0xFF0000, kick: 0xFF6600, kick_both: 0xFF0000, kick_bot: 0xFF6600, ban_bot: 0xFF0000, remove_roles: 0xFFA500, timeout: 0xFFCC00 };
    const accent = accentMap[payload.punishment] || 0xED4245;

    const c = buildLogContainer(accent);
    c.addTextDisplayComponents(text(
        `# ${E.shield} Anti-Nuke Triggered\n` +
        `${E.shine} **Threat:** \`${payload.action}\`\n` +
        `${E.user} **Offender:** ${payload.executor?.username || 'Unknown'} (<@${payload.executor?.id}>)\n` +
        `${E.bolt} **Violations:** \`${payload.violations}\` / \`${payload.limit}\` in \`${Math.round((payload.timeWindow || 0) / 1000)}s\`\n` +
        `${E.moderate} **Punishment:** \`${payload.punishment}\`` +
        (payload.target ? `\n${E.read} **Target:** \`${payload.target}\`` : '')
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} ${tsR(new Date())}`));

    await sendLog(channel, c, guild, 'security');
}

/**
 * Anti-Raid action: a member was kicked/banned for joining during a raid burst,
 * or the guild was auto-locked / unlocked.
 *
 * @param {Guild} guild
 * @param {Object} payload
 *   - kind:         'kick' | 'ban' | 'lockdown_on' | 'lockdown_off'
 *   - user?:        affected user (for kick/ban)
 *   - reason:       string
 *   - joinRate?:    number (joins-per-window when triggered)
 */
async function logAntiraidAction(guild, payload) {
    const channel = getLogChannel(guild, 'security');
    if (!channel) return;

    const titleMap = {
        kick:           'Anti-Raid Kick',
        ban:            'Anti-Raid Ban',
        lockdown_on:    'Anti-Raid Lockdown Engaged',
        lockdown_off:   'Anti-Raid Lockdown Released',
    };
    const accentMap = {
        kick:           0xFF6600,
        ban:            0xFF0000,
        lockdown_on:    0xED4245,
        lockdown_off:   0x57F287,
    };

    const c = buildLogContainer(accentMap[payload.kind] || 0xED4245);
    let body =
        `# ${E.shield} ${titleMap[payload.kind] || 'Anti-Raid Action'}\n`;
    if (payload.user) {
        body += `${E.user} **User:** ${payload.user.username || payload.user.tag || 'Unknown'} (<@${payload.user.id}>)\n`;
    }
    if (payload.joinRate != null) {
        body += `${E.bolt} **Join rate:** \`${payload.joinRate}\` in window\n`;
    }
    body += `${E.read} **Reason:** ${payload.reason || 'Anti-raid trigger'}\n`;

    c.addTextDisplayComponents(text(body.trimEnd()));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} ${tsR(new Date())}`));

    await sendLog(channel, c, guild, 'security');
}

/**
 * Anti-Alt: an account younger than the configured min-age tried to join.
 *
 * @param {Guild} guild
 * @param {Object} payload
 *   - user:        the user
 *   - accountAge:  ms since account creation
 *   - minAge:      configured threshold, ms
 *   - action:      'kick' | 'ban' | 'flag'
 */
async function logAntialtDetection(guild, payload) {
    const channel = getLogChannel(guild, 'security');
    if (!channel) return;

    const days = Math.round((payload.accountAge || 0) / 86_400_000);
    const minDays = Math.round((payload.minAge || 0) / 86_400_000);

    const c = buildLogContainer(payload.action === 'ban' ? 0xFF0000 : 0xFF6600);
    c.addTextDisplayComponents(text(
        `# ${E.shield} Anti-Alt Detected\n` +
        `${E.user} **User:** ${payload.user?.username || 'Unknown'} (<@${payload.user?.id}>)\n` +
        `${E.clock} **Account age:** \`${days}d\` (minimum: \`${minDays}d\`)\n` +
        `${E.moderate} **Action:** \`${payload.action || 'flag'}\``
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} ${tsR(new Date())}`));

    await sendLog(channel, c, guild, 'security');
}

/**
 * Vanity Guard: vanity URL change attempt detected (and possibly reverted).
 *
 * @param {Guild} guild
 * @param {Object} payload
 *   - executor:    { id, username }
 *   - oldVanity:   string|null
 *   - newVanity:   string|null
 *   - reverted:    bool
 *   - punishment:  string|null  (e.g. 'kick'|'ban'|'none')
 */
async function logVanityGuard(guild, payload) {
    const channel = getLogChannel(guild, 'security');
    if (!channel) return;

    const c = buildLogContainer(payload.reverted ? 0xFEE75C : 0xED4245);
    c.addTextDisplayComponents(text(
        `# ${E.shield} Vanity Guard Triggered\n` +
        `${E.link} **Vanity:** \`${payload.oldVanity || 'none'}\` → \`${payload.newVanity || 'none'}\`\n` +
        (payload.executor
            ? `${E.user} **Executor:** ${payload.executor.username || 'Unknown'} (<@${payload.executor.id}>)\n`
            : `${E.user} **Executor:** *unknown* (no audit log entry)\n`) +
        `${E.moderate} **Result:** ${payload.reverted ? 'Reverted' : 'Could NOT revert (boost tier <3)'}` +
        (payload.punishment && payload.punishment !== 'none' ? `\n${E.shine} **Punishment:** \`${payload.punishment}\`` : '')
    ));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(text(`-# ${E.wdot} ${tsR(new Date())}`));

    await sendLog(channel, c, guild, 'security');
}

/**
 * Threat / Emergency / Super-threat mode toggled.
 *
 * @param {Guild} guild
 * @param {Object} payload
 *   - mode:        'threat' | 'super-threat' | 'emergency'
 *   - enabled:     boolean
 *   - actor:       { id, username }
 *   - extra?:      string (e.g. roles affected)
 */
async function logThreatMode(guild, payload) {
    const channel = getLogChannel(guild, 'security');
    if (!channel) return;

    const labelMap = {
        threat:         'Threat Mode',
        'super-threat': 'Super Threat Mode',
        emergency:      'Emergency Mode',
    };
    const label = labelMap[payload.mode] || 'Security Mode';

    const c = buildLogContainer(payload.enabled ? 0xED4245 : 0x57F287);
    c.addTextDisplayComponents(text(
        `# ${E.shield} ${label} ${payload.enabled ? 'Engaged' : 'Released'}\n` +
        (payload.actor
            ? `${E.user} **Actor:** ${payload.actor.username || 'Unknown'} (<@${payload.actor.id}>)\n`
            : '') +
        (payload.extra ? `${E.info} ${payload.extra}\n` : '') +
        `${E.clock} **At:** ${tsR(new Date())}`
    ));

    await sendLog(channel, c, guild, 'security');
}

/**
 * Whitelist add/remove for antinuke or automod.
 *
 * @param {Guild} guild
 * @param {Object} payload
 *   - kind:        'antinuke' | 'automod'
 *   - operation:   'add' | 'remove' | 'reset'
 *   - subjectType: 'user' | 'role'
 *   - subjectId:   string
 *   - actor:       { id, username }
 */
async function logWhitelistChange(guild, payload) {
    const channel = getLogChannel(guild, 'security');
    if (!channel) return;

    const verb = payload.operation === 'remove' ? 'Removed from'
              : payload.operation === 'reset'  ? 'Reset'
              :                                  'Added to';
    const target = payload.subjectType === 'role' ? `<@&${payload.subjectId}>` : `<@${payload.subjectId}>`;

    const c = buildLogContainer(Colors.update);
    c.addTextDisplayComponents(text(
        `# ${E.shield} ${payload.kind === 'automod' ? 'AutoMod' : 'Anti-Nuke'} Whitelist\n` +
        `${E.read} **Action:** ${verb} ${payload.kind} whitelist\n` +
        (payload.subjectId ? `${E.user} **Subject:** ${target} (\`${payload.subjectId}\`)\n` : '') +
        (payload.actor ? `${E.user} **By:** ${payload.actor.username || 'Unknown'} (<@${payload.actor.id}>)` : '')
    ));

    await sendLog(channel, c, guild, 'security');
}

/**
 * Catch-all for security configuration changes that don't fit elsewhere
 * (botblock toggle, blacklisted-word added, quicksetup applied, ...).
 *
 * @param {Guild} guild
 * @param {Object} payload
 *   - title:   short title, e.g. 'Bot-Block Channel'
 *   - body:    multi-line markdown body
 *   - actor?:  { id, username }
 *   - kind?:   'enable' | 'disable' | 'change'  (controls accent color)
 */
async function logSecurityConfigChange(guild, payload) {
    const channel = getLogChannel(guild, 'security');
    if (!channel) return;

    const accentMap = { enable: 0x57F287, disable: 0xED4245, change: 0xCAD7E6 };
    const c = buildLogContainer(accentMap[payload.kind] || 0xCAD7E6);
    c.addTextDisplayComponents(text(
        `# ${E.shield} ${payload.title || 'Security Config Update'}\n` +
        (payload.body || '') +
        (payload.actor ? `\n${E.user} **By:** ${payload.actor.username || 'Unknown'} (<@${payload.actor.id}>)` : '')
    ));

    await sendLog(channel, c, guild, 'security');
}

/* ═══════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════ */

module.exports = {
    // Message
    logMessageDelete,
    logMessageUpdate,
    logMessageBulkDelete,
    // Member
    logMemberJoin,
    logMemberLeave,
    logMemberUpdate,
    // User (avatar, username, display name, banner)
    logUserUpdate,
    // Voice
    logVoiceStateUpdate,
    // Channels
    logChannelCreate,
    logChannelDelete,
    logChannelUpdate,
    // Guild
    logGuildUpdate,
    // Roles
    logRoleCreate,
    logRoleDelete,
    logRoleUpdate,
    // Moderation
    logBan,
    logUnban,
    logMemberKick,
    logTimeout,
    // Emoji & Stickers
    logEmojiCreate,
    logEmojiDelete,
    logEmojiUpdate,
    logStickerCreate,
    logStickerDelete,
    // Threads
    logThreadCreate,
    logThreadDelete,
    // Invites
    logInviteCreate,
    logInviteDelete,
    // AutoMod
    logAutomodAction,
    // Boost
    logBoostEvent,
    // Commands
    logCommandUsage,
    // Security (anti-nuke, anti-raid, anti-alt, vanity guard, threat / emergency, whitelist)
    logAntinukeTrigger,
    logAntiraidAction,
    logAntialtDetection,
    logVanityGuard,
    logThreatMode,
    logWhitelistChange,
    logSecurityConfigChange,
    // Helpers
    invalidateCache,
    getLogChannel,
    sendLog,
    // Webhooks
    logWebhookUpdate,
    // Config helpers
    loadLogs,
    getLogChannel,
    getLogMode,
    getLogWebhook,
    invalidateCache,
};
