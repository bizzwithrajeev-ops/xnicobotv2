const { Events, EmbedBuilder, AutoModerationActionType, AutoModerationRuleTriggerType, MessageFlags } = require('discord.js');
const log = require('../utils/logger-styled');
const path = require('path');
const fs = require('fs');
const jsonStore = require('../utils/jsonStore');

const automodConfigPath = path.join(__dirname, '..', 'datas', 'automod.json');

function loadAutomodConfig() {
    try {
        if (jsonStore.has('automod')) {
            return jsonStore.read('automod');
        }
    } catch (e) {}
    return {};
}

const ACTION_LABELS = {
    [AutoModerationActionType.BlockMessage]: '<:Cancel:1473037949187657818> Message Blocked',
    [AutoModerationActionType.SendAlertMessage]: '<:Infotriangle:1473038460456800459> Alert Sent',
    [AutoModerationActionType.Timeout]: '<:Timer:1473039056710406204> User Timed Out',
    [AutoModerationActionType.BlockMemberInteraction]: '<:Volumeoff:1473039301414621427> Interaction Blocked'
};

const TRIGGER_LABELS = {
    [AutoModerationRuleTriggerType.Keyword]: 'Keyword Filter',
    [AutoModerationRuleTriggerType.Spam]: 'Spam Detection',
    [AutoModerationRuleTriggerType.KeywordPreset]: 'Keyword Preset',
    [AutoModerationRuleTriggerType.MentionSpam]: 'Mention Spam',
    [AutoModerationRuleTriggerType.MemberProfile]: 'Member Profile'
};

module.exports = {
    name: Events.AutoModerationActionExecution,
    async execute(action, client) {
        try {
            const { guild, action: automodAction, ruleId, ruleTriggerType, userId, channelId, content, matchedKeyword, matchedContent } = action;

            // Fetch rule name
            let ruleName = 'Unknown Rule';
            try {
                const rule = await guild.autoModerationRules.fetch(ruleId).catch(() => null);
                if (rule) ruleName = rule.name;
            } catch (e) {}

            const user = await client.users.fetch(userId).catch(() => null);
            const userTag = user ? user.tag : `Unknown (${userId})`;
            const channelMention = channelId ? `<#${channelId}>` : 'N/A';
            const actionLabel = ACTION_LABELS[automodAction.type] || `Action Type ${automodAction.type}`;
            const triggerLabel = TRIGGER_LABELS[ruleTriggerType] || `Trigger ${ruleTriggerType}`;

            log.info(`[AutoMod] ${guild.name} | ${actionLabel} | Rule: ${ruleName} | User: ${userTag}`);

            // Build log embed
            const embed = new EmbedBuilder()
                .setColor(automodAction.type === AutoModerationActionType.Timeout ? 0xFF4444 :
                           automodAction.type === AutoModerationActionType.BlockMessage ? 0xFFA500 : 0x5865F2)
                .setAuthor({ name: `AutoMod · ${actionLabel}`, iconURL: guild.iconURL({ dynamic: true }) })
                .setThumbnail(user?.displayAvatarURL({ dynamic: true }) || null)
                .addFields(
                    { name: '<:User:1473038971398520977> User', value: user ? `${user} (\`${userTag}\`)` : `\`${userId}\``, inline: true },
                    { name: '<:Pin:1473038806612447500> Channel', value: channelMention, inline: true },
                    { name: '<:Document:1473039496995143731> Rule', value: `\`${ruleName}\``, inline: true },
                    { name: '<:Search:1473038053219106847> Trigger', value: triggerLabel, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Rule ID: ${ruleId}` });

            if (matchedKeyword) {
                embed.addFields({ name: '<:Key:1473038690606649375> Matched Keyword', value: `\`${matchedKeyword}\``, inline: true });
            }
            if (matchedContent) {
                const truncated = matchedContent.length > 200 ? matchedContent.substring(0, 200) + '...' : matchedContent;
                embed.addFields({ name: '<:Chat:1473038936241864865> Matched Content', value: `\`\`\`${truncated}\`\`\``, inline: false });
            }
            if (content) {
                const truncated = content.length > 300 ? content.substring(0, 300) + '...' : content;
                embed.addFields({ name: '<:Edit:1473037903625191580> Full Message', value: `\`\`\`${truncated}\`\`\``, inline: false });
            }
            if (automodAction.type === AutoModerationActionType.Timeout && automodAction.metadata?.durationSeconds) {
                const dur = automodAction.metadata.durationSeconds;
                const durStr = dur >= 3600 ? `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m` :
                               dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`;
                embed.addFields({ name: '<:Timer:1473039056710406204> Timeout Duration', value: durStr, inline: true });
            }

            // Send to the bot's configured automod log channel
            const automodConfig = loadAutomodConfig();
            const guildConfig = automodConfig[guild.id];
            if (guildConfig?.logChannel) {
                const logChannel = guild.channels.cache.get(guildConfig.logChannel);
                if (logChannel) {
                    await logChannel.send({ embeds: [embed], flags: MessageFlags.SuppressNotifications }).catch(e => {
                        log.error(`[AutoMod] Failed to send log to ${guildConfig.logChannel}: ${e.message}`);
                    });
                }
            }

            // Enforce kick/ban actions (Discord AutoMod only supports block/timeout/alert natively)
            if (automodAction.type === AutoModerationActionType.BlockMessage && guildConfig && user) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member && member.manageable) {
                    // Determine which rule triggered and what action the user configured
                    let configuredAction = null;
                    if (ruleName.includes('Bad Words')) configuredAction = guildConfig.badWords?.action;
                    else if (ruleName.includes('Anti-Spam')) configuredAction = guildConfig.spam?.action;
                    else if (ruleName.includes('Link Filter')) configuredAction = guildConfig.links?.action;
                    else if (ruleName.includes('Invite Blocker')) configuredAction = guildConfig.invites?.action;
                    else if (ruleName.includes('Mass Mentions')) configuredAction = guildConfig.massMention?.action;
                    else if (ruleName.includes('Content Filter')) {
                        // Use most severe action among enabled preset filters
                        const actions = ['delete', 'warn', 'timeout', 'kick', 'ban'];
                        const presetActions = [
                            guildConfig.profanity?.enabled && guildConfig.profanity?.action,
                            guildConfig.sexualContent?.enabled && guildConfig.sexualContent?.action,
                            guildConfig.slurs?.enabled && guildConfig.slurs?.action
                        ].filter(Boolean);
                        configuredAction = presetActions.sort((a, b) => actions.indexOf(b) - actions.indexOf(a))[0] || 'delete';
                    }

                    if (configuredAction === 'kick') {
                        await member.kick('AutoMod: ' + ruleName).catch(e => {
                            log.error(`[AutoMod] Failed to kick ${userTag}: ${e.message}`);
                        });
                        log.info(`[AutoMod] Kicked ${userTag} in ${guild.name} for rule: ${ruleName}`);
                    } else if (configuredAction === 'ban') {
                        await member.ban({ reason: 'AutoMod: ' + ruleName, deleteMessageSeconds: 86400 }).catch(e => {
                            log.error(`[AutoMod] Failed to ban ${userTag}: ${e.message}`);
                        });
                        log.info(`[AutoMod] Banned ${userTag} in ${guild.name} for rule: ${ruleName}`);
                    }
                }
            }

            // Also send to the alert channel if the action is SendAlertMessage
            if (automodAction.type === AutoModerationActionType.SendAlertMessage && automodAction.metadata?.channelId) {
                const alertChannel = guild.channels.cache.get(automodAction.metadata.channelId);
                if (alertChannel && alertChannel.id !== guildConfig?.logChannel) {
                    await alertChannel.send({ embeds: [embed], flags: MessageFlags.SuppressNotifications }).catch(() => {});
                }
            }

        } catch (error) {
            log.error('[AutoMod] Error handling AutoModActionExecution event:', error);
        }
    }
};
