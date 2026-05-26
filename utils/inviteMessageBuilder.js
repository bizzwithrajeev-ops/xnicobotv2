/**
 * Invite Message Builder
 * ──────────────────────
 * Handles variable replacement and Components V2 rendering for the
 * invite tracking system's custom messages (join / leave / vanity / alt).
 *
 * Variables are resolved against:
 *   - the joining/leaving member (user-level placeholders)
 *   - the guild (server-level placeholders)
 *   - the inviter, when known (invite-specific placeholders)
 *
 * Returned containers can be sent directly with `MessageFlags.IsComponentsV2`.
 */

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
} = require('discord.js');

// ── Default message templates ─────────────────────────────────────────────

const DEFAULT_MESSAGES = {
    join: {
        enabled: true,
        content:
            `# <:Userplus:1473038912212435086> A New Member Has Joined\n\n` +
            `<:User:1473038971398520977> {user} just landed in **{server}**.\n\n` +
            `### <:Bookopen:1473038576391557130> Invite Source\n` +
            `<:Caretright:1473038207221502106> **Invited By:** {invitermention}\n` +
            `<:Caretright:1473038207221502106> **Invite Code:** \`{invitecode}\`\n` +
            `<:Caretright:1473038207221502106> **Inviter Total:** \`{invitercount}\` invites\n\n` +
            `### <:Clipboard:1473039573037617162> Member Info\n` +
            `<:Caretright:1473038207221502106> **Account Created:** {usercreated}\n` +
            `<:Caretright:1473038207221502106> **Member #** \`{membercount}\``,
        accentColor: 0x57F287, // green
    },
    leave: {
        enabled: true,
        content:
            `# <:Userblock:1473038868184826149> Member Left\n\n` +
            `<:User:1473038971398520977> **{username}** has left **{server}**.\n\n` +
            `### <:Bookopen:1473038576391557130> Original Invite\n` +
            `<:Caretright:1473038207221502106> **Was Invited By:** {invitermention}\n` +
            `<:Caretright:1473038207221502106> **Invite Code:** \`{invitecode}\`\n` +
            `<:Caretright:1473038207221502106> **Inviter Total:** \`{invitercount}\` invites\n\n` +
            `### <:Clipboard:1473039573037617162> Member Stats\n` +
            `<:Caretright:1473038207221502106> **Members Now:** \`{membercount}\``,
        accentColor: 0xED4245, // red
    },
    vanity: {
        enabled: true,
        content:
            `# <:Userplus:1473038912212435086> Member Joined (Vanity / Unknown)\n\n` +
            `<:User:1473038971398520977> {user} joined **{server}** but the invite source could not be identified.\n\n` +
            `### <:Infotriangle:1473038460456800459> Possible Sources\n` +
            `<:Caretright:1473038207221502106> Vanity URL\n` +
            `<:Caretright:1473038207221502106> Server Discovery\n` +
            `<:Caretright:1473038207221502106> Direct invite from a deleted code\n\n` +
            `### <:Clipboard:1473039573037617162> Member Info\n` +
            `<:Caretright:1473038207221502106> **Account Created:** {usercreated}\n` +
            `<:Caretright:1473038207221502106> **Member #** \`{membercount}\``,
        accentColor: 0xFEE75C, // yellow
    },
    fake: {
        enabled: true,
        content:
            `# <:Shield:1473038669831995494> Suspicious Account Detected\n\n` +
            `<:Userblock:1473038868184826149> {user} has been flagged as a potential alt.\n\n` +
            `### <:Infotriangle:1473038460456800459> Detection Summary\n` +
            `<:Caretright:1473038207221502106> **Account Age:** \`{accountage} days\`\n` +
            `<:Caretright:1473038207221502106> **Risk Score:** \`{riskscore}/100\`\n` +
            `<:Caretright:1473038207221502106> **Invited By:** {invitermention}\n\n` +
            `### <:Clipboard:1473039573037617162> Indicators\n{flagslist}`,
        accentColor: 0xED4245, // red
    },
};

/**
 * Returns a deep clone of the default message configuration.
 */
function getDefaultMessages() {
    return JSON.parse(JSON.stringify(DEFAULT_MESSAGES));
}

/**
 * Returns the list of placeholder definitions used for the help panel.
 * Grouped for the Variables reference UI.
 */
function getVariableGroups() {
    return [
        {
            title: '<:User:1473038971398520977> User Variables',
            vars: [
                '{user}', '{usermention}', '{username}', '{displayname}',
                '{userid}', '{useravatar}', '{usercreated}', '{userjoined}',
                '{accountage}', '{joinposition}',
            ],
        },
        {
            title: '<:Userplus:1473038912212435086> Inviter Variables',
            vars: [
                '{inviter}', '{invitermention}', '{invitername}', '{inviterid}',
                '{invitercount}', '{invitercodes}',
            ],
        },
        {
            title: '<:Attach:1473037923979886694> Invite Variables',
            vars: [
                '{invitecode}', '{inviteurl}',
            ],
        },
        {
            title: '<:Shield:1473038669831995494> Alt Detection (fake message only)',
            vars: [
                '{riskscore}', '{risklevel}', '{flagslist}', '{flagscount}',
            ],
        },
        {
            title: '<:Bullhorn:1473038903157199093> Server Variables',
            vars: [
                '{server}', '{servername}', '{serverid}', '{servericon}',
                '{serverowner}', '{servercreated}', '{membercount}',
                '{humancount}', '{botcount}',
            ],
        },
        {
            title: '<:Timer:1473039056710406204> Time Variables',
            vars: [
                '{timestamp}', '{time}', '{date}', '{datetime}',
            ],
        },
    ];
}

/**
 * Replace placeholders inside a template string.
 *
 * @param {string} text - Raw template (may include {placeholders}).
 * @param {object} ctx
 * @param {import('discord.js').GuildMember} ctx.member
 * @param {import('discord.js').Guild}       ctx.guild
 * @param {object} [ctx.inviter]   - { id, user } shape (User or partial)
 * @param {object} [ctx.invite]    - { code, url, uses, totalForInviter }
 * @param {object} [ctx.alt]       - { riskScore, accountAgeDays, flags[] }
 */
function replaceInviteVariables(text, ctx) {
    if (!text || typeof text !== 'string') return '';
    if (!ctx?.member || !ctx?.guild) return text;

    const { member, guild, inviter, invite, alt } = ctx;
    const user = member.user || member;

    try {
        const now = Math.floor(Date.now() / 1000);
        const userCreatedTs = Math.floor(user.createdTimestamp / 1000);
        const userJoinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : now;
        const serverCreatedTs = Math.floor(guild.createdTimestamp / 1000);
        const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / (24 * 60 * 60 * 1000));

        // Bot/human counts — guard against non-Collection members.cache (e.g. plain Map in tests)
        let botCount = 0;
        let humanCount = guild.memberCount;
        try {
            if (typeof guild.members?.cache?.filter === 'function') {
                botCount = guild.members.cache.filter(m => m.user?.bot).size;
                humanCount = guild.memberCount - botCount;
            }
        } catch { /* ignore */ }

        // Inviter resolution — supports User instances or plain { id, username } objects
        const inviterUser = inviter?.user || inviter || null;
        const inviterId = inviterUser?.id || 'Unknown';
        const inviterMention = inviterUser?.id ? `<@${inviterUser.id}>` : '*Unknown*';
        const inviterName = inviterUser?.username || inviterUser?.tag || 'Unknown';
        const inviterCount = invite?.totalForInviter ?? 0;
        const inviterCodes = invite?.inviterCodeCount ?? 0;

        const inviteCode = invite?.code || 'Unknown';
        const inviteUrl = invite?.url || (invite?.code ? `https://discord.gg/${invite.code}` : 'Unknown');

        const riskScore = alt?.riskScore ?? 0;
        const riskLevel = riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';
        const flags = Array.isArray(alt?.flags) ? alt.flags : [];
        const flagsCount = flags.length;
        const flagsList = flags.length
            ? flags.map(f => `<:Caretright:1473038207221502106> ${f}`).join('\n')
            : '<:Caretright:1473038207221502106> *No specific indicators*';

        // Join position — only compute if member is a real GuildMember
        let joinPosition = 0;
        try {
            if (member.joinedTimestamp) {
                joinPosition = [...guild.members.cache.values()]
                    .filter(m => m.joinedTimestamp)
                    .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp)
                    .findIndex(m => m.id === member.id) + 1;
            }
        } catch { /* leaderboards on huge guilds may fail; ignore */ }

        const replacements = {
            // User
            '{user}': user.toString?.() || `<@${user.id}>`,
            '{usermention}': `<@${user.id}>`,
            '{username}': user.username || 'Unknown',
            '{displayname}': member.displayName || user.username || 'Unknown',
            '{userid}': user.id || 'Unknown',
            '{useravatar}': user.displayAvatarURL?.({ dynamic: true, size: 1024 }) || '',
            '{usercreated}': `<t:${userCreatedTs}:R>`,
            '{userjoined}': `<t:${userJoinedTs}:R>`,
            '{accountage}': accountAgeDays.toString(),
            '{joinposition}': joinPosition.toString(),

            // Inviter
            '{inviter}': inviterName,
            '{invitermention}': inviterMention,
            '{invitername}': inviterName,
            '{inviterid}': inviterId,
            '{invitercount}': inviterCount.toString(),
            '{invitercodes}': inviterCodes.toString(),

            // Invite
            '{invitecode}': inviteCode,
            '{inviteurl}': inviteUrl,

            // Alt detection
            '{riskscore}': riskScore.toString(),
            '{risklevel}': riskLevel,
            '{flagslist}': flagsList,
            '{flagscount}': flagsCount.toString(),

            // Server
            '{server}': guild.name,
            '{servername}': guild.name,
            '{serverid}': guild.id,
            '{servericon}': guild.iconURL?.({ dynamic: true, size: 1024 }) || '',
            '{serverowner}': `<@${guild.ownerId}>`,
            '{servercreated}': `<t:${serverCreatedTs}:R>`,
            '{membercount}': guild.memberCount.toString(),
            '{humancount}': humanCount.toString(),
            '{botcount}': botCount.toString(),

            // Time
            '{timestamp}': `<t:${now}:R>`,
            '{time}': `<t:${now}:T>`,
            '{date}': `<t:${now}:D>`,
            '{datetime}': `<t:${now}:F>`,
        };

        let result = text;
        for (const [key, value] of Object.entries(replacements)) {
            result = result.split(key).join(String(value ?? ''));
        }
        return result;
    } catch (err) {
        // Never throw — broken templates shouldn't take down the join handler.
        return text;
    }
}

/**
 * Build a Components V2 container for an invite event message.
 *
 * @param {string}   content     - Already-resolved content string (post-replace).
 * @param {number}   accentColor - Color for the container accent strip.
 * @param {string}   [footer]    - Optional footer text (rendered as small subtext).
 */
function buildContainer(content, accentColor = 0xCAD7E6, footer = 'xNico Invite Tracker') {
    const container = new ContainerBuilder().setAccentColor(accentColor);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content || '*No content*')
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${footer}`)
    );

    return container;
}

/**
 * Convenience: render a message config + context straight to a container.
 * Returns null if the message type is disabled or has no content.
 */
function renderMessage(messageConfig, ctx, footer = 'xNico Invite Tracker') {
    if (!messageConfig || messageConfig.enabled === false) return null;
    const raw = messageConfig.content;
    if (!raw || typeof raw !== 'string' || !raw.trim()) return null;

    const resolved = replaceInviteVariables(raw, ctx);
    if (!resolved.trim()) return null;

    return buildContainer(resolved, messageConfig.accentColor, footer);
}

module.exports = {
    DEFAULT_MESSAGES,
    getDefaultMessages,
    getVariableGroups,
    replaceInviteVariables,
    buildContainer,
    renderMessage,
};
