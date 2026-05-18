/**
 * Syncs bot automod config to Discord's native AutoMod rules.
 * When users configure automod via the bot panel, this pushes the config
 * to Discord's server-level AutoMod so it works at the API level (real-time,
 * even if the bot is offline).
 * 
 * Discord AutoMod Limits:
 * - Max 6 rules per guild total
 * - Max 1 rule per Spam trigger
 * - Max 1 rule per KeywordPreset trigger  
 * - Max 1 rule per MentionSpam trigger
 * - Max 6 rules per Keyword trigger (we use 3: Bad Words, Invites, Links)
 * 
 * Our 6 native rules: Bad Words, Anti-Spam, Invite Blocker, Mass Mentions, Link Filter, Content Filter
 * Caps Lock filter = bot-side only (no Discord AutoMod equivalent)
 */

const { AutoModerationRuleTriggerType, AutoModerationRuleEventType, AutoModerationActionType, AutoModerationRuleKeywordPresetType } = require('discord.js');
const log = require('./logger-styled');

const BOT_RULE_PREFIX = 'XnicoBot: ';

// Old rule names to clean up (from before combining presets)
const LEGACY_RULE_NAMES = ['Anti-Profanity', 'Sexual Content', 'Anti-Slurs'];

/**
 * Map bot action names to Discord AutoMod action objects
 */
/**
 * Discord's AutoMod API rejects `Timeout` actions on Spam-trigger
 * rules with `AUTO_MODERATION_ACTION_TYPE_DISALLOWED`. Timeout is
 * only valid on Keyword, KeywordPreset, and MentionSpam triggers.
 *
 * `triggerType` is optional — when omitted we keep the legacy
 * "always allow timeout" behaviour, matching the existing call sites
 * for Keyword/MentionSpam/KeywordPreset rules. When the caller does
 * pass it, we silently downgrade timeout → block message for the
 * unsupported trigger types instead of crashing the upsert.
 */
function mapAction(action, logChannelId, triggerType) {
    const actions = [];

    // Block message for destructive actions
    if (['delete', 'timeout', 'kick', 'ban'].includes(action)) {
        actions.push({
            type: AutoModerationActionType.BlockMessage,
            metadata: { customMessage: '<:Shield:1473038669831995494> Message blocked by xNico AutoMod' }
        });
    }

    // Add timeout for timeout action — but only on triggers Discord allows.
    // Spam (1) and HarmfulLink (4) cannot accept Timeout actions.
    const timeoutAllowedTriggers = new Set([
        AutoModerationRuleTriggerType.Keyword,         // 1
        AutoModerationRuleTriggerType.KeywordPreset,   // 4
        AutoModerationRuleTriggerType.MentionSpam,     // 5
        AutoModerationRuleTriggerType.MemberProfile    // 6
    ]);
    const timeoutAllowed = triggerType === undefined || timeoutAllowedTriggers.has(triggerType);

    if (action === 'timeout' && timeoutAllowed) {
        actions.push({
            type: AutoModerationActionType.Timeout,
            metadata: { durationSeconds: 300 }
        });
    }

    // Send alert to log channel if configured
    if (logChannelId) {
        actions.push({
            type: AutoModerationActionType.SendAlertMessage,
            metadata: { channelId: logChannelId }
        });
    }

    // Warn = just alert, no block (unless no log channel)
    if (action === 'warn' && !logChannelId) {
        actions.push({
            type: AutoModerationActionType.BlockMessage,
            metadata: { customMessage: '<:Infotriangle:1473038460456800459> Your message was flagged by AutoMod' }
        });
    }

    // Fallback: must have at least one action
    if (actions.length === 0) {
        actions.push({
            type: AutoModerationActionType.BlockMessage,
            metadata: { customMessage: '<:Shield:1473038669831995494> Message blocked by xNico AutoMod' }
        });
    }

    return actions;
}

/**
 * Build exempt roles and channels arrays from config
 */
function buildExemptions(config) {
    const exemptRoles = [];
    const exemptChannels = [];

    if (config.ignoredRoles?.length) {
        exemptRoles.push(...config.ignoredRoles.filter(r => r));
    }
    if (config.bypassRoleId) {
        exemptRoles.push(config.bypassRoleId);
    }
    if (config.ignoredChannels?.length) {
        exemptChannels.push(...config.ignoredChannels.filter(c => c));
    }

    return {
        exemptRoles: [...new Set(exemptRoles)].slice(0, 20),
        exemptChannels: [...new Set(exemptChannels)].slice(0, 50)
    };
}

/**
 * Find ALL existing bot-managed rules in the guild (including legacy names)
 */
async function findBotRules(guild) {
    try {
        const rules = await guild.autoModerationRules.fetch();
        const botRules = {};
        for (const [, rule] of rules) {
            if (rule.name.startsWith(BOT_RULE_PREFIX)) {
                const type = rule.name.replace(BOT_RULE_PREFIX, '');
                botRules[type] = rule;
            }
        }
        return botRules;
    } catch (e) {
        log.error('[AutoMod Sync] Failed to fetch rules for ' + guild.name + ': ' + e.message);
        return {};
    }
}

/**
 * Create or update a Discord AutoMod rule
 */
async function upsertRule(guild, existingRule, name, options) {
    const fullName = BOT_RULE_PREFIX + name;
    try {
        if (existingRule) {
            await existingRule.edit({ ...options, name: fullName });
            log.info('[AutoMod Sync] Updated rule "' + fullName + '" in ' + guild.name);
            return true;
        } else {
            await guild.autoModerationRules.create({
                ...options,
                name: fullName,
                eventType: AutoModerationRuleEventType.MessageSend
            });
            log.info('[AutoMod Sync] Created rule "' + fullName + '" in ' + guild.name);
            return true;
        }
    } catch (e) {
        log.error('[AutoMod Sync] Failed to upsert rule "' + fullName + '" in ' + guild.name + ': ' + e.message);
        return false;
    }
}

/**
 * Delete a rule if it exists
 */
async function deleteRuleIfExists(existingRule) {
    if (existingRule) {
        try {
            await existingRule.delete();
            return true;
        } catch (e) {
            // Ignore — rule may have already been deleted
        }
    }
    return false;
}

/**
 * Clean up old legacy rules that were created before combining presets
 */
async function cleanupLegacyRules(botRules) {
    for (const legacyName of LEGACY_RULE_NAMES) {
        if (botRules[legacyName]) {
            await deleteRuleIfExists(botRules[legacyName]);
            log.info('[AutoMod Sync] Cleaned up legacy rule: ' + legacyName);
            delete botRules[legacyName];
        }
    }
}

/**
 * Main sync function — call this whenever automod config is saved
 * Deploys up to 6 Discord AutoMod rules:
 *   1. Bad Words (Keyword)
 *   2. Anti-Spam (Spam)
 *   3. Invite Blocker (Keyword)
 *   4. Mass Mentions (MentionSpam)
 *   5. Link Filter (Keyword)
 *   6. Content Filter (KeywordPreset — combines Profanity + Sexual + Slurs)
 */
async function syncToDiscord(guild, config) {
    if (!guild || !config) return;

    const me = guild.members.me;
    if (!me?.permissions?.has('ManageGuild')) {
        log.warning('[AutoMod Sync] Missing ManageGuild permission in ' + guild.name);
        return;
    }

    try {
        const botRules = await findBotRules(guild);
        const { exemptRoles, exemptChannels } = buildExemptions(config);
        const logChannelId = config.logChannel || null;
        const on = config.enabled;

        // STEP 1: Clean up old legacy preset rules FIRST
        await cleanupLegacyRules(botRules);

        // RULE 1: Bad Words (Keyword)
        if (on && config.badWords?.enabled && config.badWords.words?.length > 0) {
            const keywords = config.badWords.words
                .filter(w => w && w.length <= 60)
                .slice(0, 1000);

            if (keywords.length > 0) {
                await upsertRule(guild, botRules['Bad Words'], 'Bad Words', {
                    triggerType: AutoModerationRuleTriggerType.Keyword,
                    triggerMetadata: { keywordFilter: keywords },
                    actions: mapAction(config.badWords.action || 'delete', logChannelId),
                    enabled: true,
                    exemptRoles,
                    exemptChannels
                });
            } else {
                await deleteRuleIfExists(botRules['Bad Words']);
            }
        } else {
            await deleteRuleIfExists(botRules['Bad Words']);
        }

        // RULE 2: Anti-Spam (Spam)
        if (on && config.spam?.enabled) {
            await upsertRule(guild, botRules['Anti-Spam'], 'Anti-Spam', {
                triggerType: AutoModerationRuleTriggerType.Spam,
                triggerMetadata: {},
                // Spam-trigger rules cannot use Timeout actions — pass
                // the triggerType so mapAction() downgrades correctly.
                actions: mapAction(config.spam.action || 'delete', logChannelId, AutoModerationRuleTriggerType.Spam),
                enabled: true,
                exemptRoles,
                exemptChannels
            });
        } else {
            await deleteRuleIfExists(botRules['Anti-Spam']);
        }

        // RULE 3: Invite Blocker (Keyword regex)
        if (on && config.invites?.enabled) {
            await upsertRule(guild, botRules['Invite Blocker'], 'Invite Blocker', {
                triggerType: AutoModerationRuleTriggerType.Keyword,
                triggerMetadata: {
                    regexPatterns: [
                        'discord\\.gg/[a-zA-Z0-9\\-]+',
                        'discord(app)?\\.com/invite/[a-zA-Z0-9\\-]+',
                        'dsc\\.gg/[a-zA-Z0-9\\-]+'
                    ]
                },
                actions: mapAction(config.invites.action || 'delete', logChannelId),
                enabled: true,
                exemptRoles,
                exemptChannels
            });
        } else {
            await deleteRuleIfExists(botRules['Invite Blocker']);
        }

        // RULE 4: Mass Mentions (MentionSpam)
        if (on && config.massMention?.enabled) {
            await upsertRule(guild, botRules['Mass Mentions'], 'Mass Mentions', {
                triggerType: AutoModerationRuleTriggerType.MentionSpam,
                triggerMetadata: { mentionTotalLimit: config.massMention.limit || 5 },
                actions: mapAction(config.massMention.action || 'delete', logChannelId),
                enabled: true,
                exemptRoles,
                exemptChannels
            });
        } else {
            await deleteRuleIfExists(botRules['Mass Mentions']);
        }

        // RULE 5: Link Filter (Keyword regex)
        if (on && config.links?.enabled) {
            await upsertRule(guild, botRules['Link Filter'], 'Link Filter', {
                triggerType: AutoModerationRuleTriggerType.Keyword,
                triggerMetadata: {
                    regexPatterns: [
                        'https?://[^\\s]+',
                        'www\\.[^\\s]+'
                    ],
                    allowList: (config.links.whitelist || []).slice(0, 100)
                },
                actions: mapAction(config.links.action || 'delete', logChannelId),
                enabled: true,
                exemptRoles,
                exemptChannels
            });
        } else {
            await deleteRuleIfExists(botRules['Link Filter']);
        }

        // RULE 6: Content Filter (KeywordPreset — SINGLE rule, Discord limit = 1)
        // Combines Profanity + SexualContent + Slurs into one rule
        const enabledPresets = [];
        if (config.profanity?.enabled) {
            enabledPresets.push(AutoModerationRuleKeywordPresetType.Profanity);
        }
        if (config.sexualContent?.enabled) {
            enabledPresets.push(AutoModerationRuleKeywordPresetType.SexualContent);
        }
        if (config.slurs?.enabled) {
            enabledPresets.push(AutoModerationRuleKeywordPresetType.Slurs);
        }

        if (on && enabledPresets.length > 0) {
            await upsertRule(guild, botRules['Content Filter'], 'Content Filter', {
                triggerType: AutoModerationRuleTriggerType.KeywordPreset,
                triggerMetadata: { presets: enabledPresets },
                actions: mapAction('delete', logChannelId),
                enabled: true,
                exemptRoles,
                exemptChannels
            });
        } else {
            await deleteRuleIfExists(botRules['Content Filter']);
        }

        // Caps Lock = bot-side only (no Discord AutoMod equivalent)

        log.info('[AutoMod Sync] Synced all rules for ' + guild.name);
    } catch (error) {
        log.error('[AutoMod Sync] Error syncing ' + guild.name + ': ' + error.message);
    }
}

/**
 * Remove all bot-managed AutoMod rules (when automod is fully disabled)
 */
async function removeAllBotRules(guild) {
    if (!guild) return;
    try {
        const botRules = await findBotRules(guild);
        for (const [name, rule] of Object.entries(botRules)) {
            await rule.delete().catch(() => {});
        }
        log.info('[AutoMod Sync] Removed all bot rules from ' + guild.name);
    } catch (e) {
        log.error('[AutoMod Sync] Error removing rules: ' + e.message);
    }
}

module.exports = { syncToDiscord, removeAllBotRules, BOT_RULE_PREFIX };
