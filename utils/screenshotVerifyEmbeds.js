'use strict';

/**
 * Screenshot Verification — UI builders
 * ──────────────────────────────────────────────────────────────────
 * All Components V2 containers used by the screenshot verification
 * system. Kept in one file because the manager (auto pipeline) and
 * the command (interactive panels) both render review embeds.
 */

const {
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder
} = require('discord.js');

const { BRANDING } = require('./responseBuilder');
const {
    TASK_PRESETS, ACTION_PRESETS, countByStatus, MAX_TASKS_PER_GUILD
} = require('./screenshotVerifyManagerShared');

/* ═══════════════════════════════════════════════════════════════════
   FORMATTING HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function formatDuration(ms) {
    if (!ms || ms <= 0) return 'None';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function modeBadge(mode) {
    if (mode === 'auto')   return '<:Lightning:1473038797540298792> Auto';
    if (mode === 'review') return '<:Shield:1473038669831995494> Manual Review';
    return '<:Settings:1473037894703779851> Hybrid';
}

function actionSummary(action) {
    const preset = ACTION_PRESETS[action.type];
    const label = preset?.label || action.type;
    let detail = '';
    if (action.type === 'add_role' || action.type === 'remove_role') {
        detail = action.roleId ? ` <@&${action.roleId}>` : ' `(role missing)`';
    } else if (action.type === 'send_channel') {
        detail = action.channelId ? ` <#${action.channelId}>` : ' `(channel missing)`';
    }
    return `${preset?.emoji || '<:Caretright:1473038207221502106>'} ${label}${detail}`;
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN SETUP PANEL
   ═══════════════════════════════════════════════════════════════════ */

function buildSetupPanel(guild, cfg) {
    const counts = countByStatus(guild.id);
    const tasks  = cfg.tasks || [];

    const ready = !!(cfg.submissionChannelId
        && (cfg.mode === 'auto' || cfg.reviewChannelId)
        && tasks.length > 0
        && tasks.every(t => t.actions && t.actions.length > 0));

    let content = `# <:Document:1473039496995143731> Screenshot Verification\n`;
    content += `-# Smart, AI-assisted screenshot proof system with custom tasks and actions\n\n`;

    content += `### <:Settings:1473037894703779851> Status\n`;
    content += `> ${cfg.enabled
        ? '<:Toggleon:1473038585501581312> **Active**'
        : '<:Toggleoff:1473038582813032590> **Disabled**'}`;
    content += ` · ${ready ? 'Configured' : '`Setup incomplete`'}\n`;
    content += `> **Mode:** ${modeBadge(cfg.mode)} · **Confidence:** \`${cfg.confidenceThreshold}%\`\n\n`;

    content += `### <:Settings:1473037894703779851> Channels\n`;
    content += `> <:Chat:1473038936241864865> **Submission Channel:** ${cfg.submissionChannelId ? `<#${cfg.submissionChannelId}>` : '`Not set`'}\n`;
    content += `> <:Shield:1473038669831995494> **Review Channel:** ${cfg.reviewChannelId ? `<#${cfg.reviewChannelId}>` : '`Not set`'}\n`;
    content += `> <:Document:1473039496995143731> **Log Channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : '`None`'}\n\n`;

    content += `### <:Bookopen:1473038576391557130> Tasks (${tasks.length}/${MAX_TASKS_PER_GUILD})\n`;
    if (tasks.length === 0) {
        content += `> *No tasks yet — add one below to start verifying.*\n\n`;
    } else {
        for (const t of tasks.slice(0, 6)) {
            const preset = TASK_PRESETS[t.type] || TASK_PRESETS.custom;
            const acts = (t.actions || []).map(a => ACTION_PRESETS[a.type]?.emoji || '·').join(' ');
            content += `> ${preset.emoji} **${t.name}**`;
            if (t.target) content += ` · \`${t.target}\``;
            content += ` · \`${(t.actions || []).length} action${(t.actions || []).length === 1 ? '' : 's'}\``;
            if (acts) content += ` ${acts}`;
            content += `\n`;
        }
        if (tasks.length > 6) content += `> -# +${tasks.length - 6} more\n`;
        content += `\n`;
    }

    content += `### <:Settings:1473037894703779851> Behavior\n`;
    content += `> <:Alarm:1473039068546732214> **Cooldown:** \`${formatDuration(cfg.cooldown)}\`\n`;
    content += `> <:Editalt:1473038138577256670> **Auto-delete Source:** \`${cfg.autoDelete ? 'On' : 'Off'}\`\n`;
    content += `> <:Lock:1473038513749491773> **Hide From Verified:** \`${cfg.hideAfterVerify === false ? 'Off' : 'On'}\`\n\n`;

    content += `### <:Invoice:1473039492217835550> Statistics\n`;
    content += `> <:Lightning:1473038797540298792> Pending: \`${counts.pending}\` · `;
    content += `<:Checkedbox:1473038547165384804> Approved: \`${counts.approved}\` · `;
    content += `<:Cancel:1473037949187657818> Rejected: \`${counts.rejected}\``;

    const container = new ContainerBuilder()
        .setAccentColor(cfg.enabled ? 0x57F287 : (ready ? 0xFEE75C : 0xED4245))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sshot_toggle')
            .setLabel(cfg.enabled ? 'Disable' : 'Enable')
            .setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji(cfg.enabled
                ? '<:Toggleoff:1473038582813032590>'
                : '<:Toggleon:1473038585501581312>')
            .setDisabled(!cfg.enabled && !ready),
        new ButtonBuilder()
            .setCustomId('sshot_task_new')
            .setLabel('New Task')
            .setStyle(ButtonStyle.Success)
            .setEmoji('<:Add:1473038100862337035>')
            .setDisabled(tasks.length >= MAX_TASKS_PER_GUILD),
        new ButtonBuilder()
            .setCustomId('sshot_send_panel')
            .setLabel('Send User Panel')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('<:Document:1473039496995143731>')
            .setDisabled(!ready)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sshot_set_channel')
            .setLabel('Submission Channel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Chat:1473038936241864865>'),
        new ButtonBuilder()
            .setCustomId('sshot_set_review')
            .setLabel('Review Channel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Shield:1473038669831995494>'),
        new ButtonBuilder()
            .setCustomId('sshot_set_log')
            .setLabel('Log Channel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Document:1473039496995143731>'),
        new ButtonBuilder()
            .setCustomId('sshot_settings')
            .setLabel('Behavior')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Settings:1473037894703779851>')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sshot_pending')
            .setLabel(`Pending (${counts.pending})`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Lightning:1473038797540298792>'),
        new ButtonBuilder()
            .setCustomId('sshot_messages')
            .setLabel('Approve/Reject DM')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Chat:1473038936241864865>'),
        new ButtonBuilder()
            .setCustomId('sshot_apply_privacy')
            .setLabel('Apply Privacy')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('<:Lock:1473038513749491773>')
            .setDisabled(!cfg.submissionChannelId),
        new ButtonBuilder()
            .setCustomId('sshot_toggle_hide')
            .setLabel(cfg.hideAfterVerify === false ? 'Show After Verify' : 'Hide After Verify')
            .setStyle(cfg.hideAfterVerify === false ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setEmoji(cfg.hideAfterVerify === false ? '<:Unlock:1473038516639236269>' : '<:Lock:1473038513749491773>'),
        new ButtonBuilder()
            .setCustomId('sshot_reset')
            .setLabel('Reset')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:Trash:1473038090074591293>')
    );

    container.addActionRowComponents(row1, row2, row3);

    // Task picker (jump straight to a task editor) — only if there are tasks
    if (tasks.length > 0) {
        const opts = tasks.slice(0, 25).map(t => {
            const preset = TASK_PRESETS[t.type] || TASK_PRESETS.custom;
            return {
                label: t.name.slice(0, 100),
                description: (t.target || preset.label).slice(0, 100),
                value: `edit_${t.id}`
            };
        });
        const select = new StringSelectMenuBuilder()
            .setCustomId('sshot_task_select')
            .setPlaceholder('Edit a task…')
            .addOptions(opts);
        container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return container;
}

/* ═══════════════════════════════════════════════════════════════════
   TASK EDITOR PANEL
   ═══════════════════════════════════════════════════════════════════ */

function buildTaskEditor(guild, cfg, task) {
    const preset = TASK_PRESETS[task.type] || TASK_PRESETS.custom;

    let content = `# ${preset.emoji} Task: ${task.name}\n`;
    content += `-# Configure how this task is detected and what happens on success\n\n`;

    content += `### <:Settings:1473037894703779851> Configuration\n`;
    content += `> <:Bookmark:1473039494604132423> **ID:** \`${task.id}\`\n`;
    content += `> <:Edit:1473037903625191580> **Type:** ${preset.label}\n`;
    content += `> <:Attach:1473037923979886694> **Target:** ${task.target ? `\`${task.target}\`` : '`Not set`'}\n`;
    if (task.description) {
        content += `> <:Bookopen:1473038576391557130> **Description:**\n> ${task.description.replace(/\n/g, '\n> ')}\n`;
    }
    if (task.keywords?.length) {
        content += `> <:Lightbulbalt:1473038470787240009> **Keywords:** ${task.keywords.map(k => `\`${k}\``).join(', ')}\n`;
    }

    content += `\n### <:Lightning:1473038797540298792> Actions on Success (${(task.actions || []).length}/8)\n`;
    if (!task.actions?.length) {
        content += `> *No actions yet — without actions, approval has no effect.*\n`;
    } else {
        for (const a of task.actions) {
            content += `> ${actionSummary(a)}\n`;
        }
    }

    const container = new ContainerBuilder()
        .setAccentColor((task.actions?.length ?? 0) > 0 ? 0x57F287 : 0xFEE75C)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sshot_task_edit_${task.id}`)
            .setLabel('Edit Details')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('<:Editalt:1473038138577256670>'),
        new ButtonBuilder()
            .setCustomId(`sshot_task_keywords_${task.id}`)
            .setLabel('Edit Keywords')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Lightbulbalt:1473038470787240009>'),
        new ButtonBuilder()
            .setCustomId(`sshot_task_back`)
            .setLabel('Back')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Caretright:1473038207221502106>'),
        new ButtonBuilder()
            .setCustomId(`sshot_task_delete_${task.id}`)
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:Trash:1473038090074591293>')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sshot_act_addrole_${task.id}`)
            .setLabel('+ Add Role')
            .setStyle(ButtonStyle.Success)
            .setEmoji('<:Userplus:1473038912212435086>'),
        new ButtonBuilder()
            .setCustomId(`sshot_act_remrole_${task.id}`)
            .setLabel('+ Remove Role')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Trash:1473038090074591293>'),
        new ButtonBuilder()
            .setCustomId(`sshot_act_sendch_${task.id}`)
            .setLabel('+ Channel Msg')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Chat:1473038936241864865>'),
        new ButtonBuilder()
            .setCustomId(`sshot_act_senddm_${task.id}`)
            .setLabel('+ DM User')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Envelope:1473038885364695113>')
    );

    container.addActionRowComponents(row1, row2);

    if (task.actions?.length) {
        const opts = task.actions.slice(0, 25).map(a => ({
            label: (ACTION_PRESETS[a.type]?.label || a.type).slice(0, 100),
            description: (a.roleId ? `Role ${a.roleId}` : a.channelId ? `Channel ${a.channelId}` : (a.content || '').slice(0, 90)).slice(0, 100),
            value: `del_${a.id}`,
            emoji: ACTION_PRESETS[a.type]?.emoji ? undefined : undefined
        }));
        const sel = new StringSelectMenuBuilder()
            .setCustomId(`sshot_act_remove_${task.id}`)
            .setPlaceholder('Remove an action…')
            .addOptions(opts);
        container.addActionRowComponents(new ActionRowBuilder().addComponents(sel));
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return container;
}

/* ═══════════════════════════════════════════════════════════════════
   USER-FACING SUBMIT PANEL (the public message)
   ═══════════════════════════════════════════════════════════════════ */

function buildUserPanel(cfg) {
    const tasks = cfg.tasks || [];

    let content = `# <:Document:1473039496995143731> Verification\n\n`;
    content += `Complete one of the tasks below, then post your screenshot in this channel `;
    content += `or click **Submit Screenshot**.\n\n`;

    if (!tasks.length) {
        content += `> *No tasks configured.*`;
    } else {
        content += `### <:Bookopen:1473038576391557130> Available Tasks\n`;
        for (const t of tasks) {
            const preset = TASK_PRESETS[t.type] || TASK_PRESETS.custom;
            content += `\n**${preset.emoji} ${t.name}**`;
            if (t.target) content += ` · \`${t.target}\``;
            if (t.description) content += `\n> ${t.description.replace(/\n/g, '\n> ')}`;
        }
    }

    content += `\n\n### <:Lightning:1473038797540298792> How it works\n`;
    if (cfg.mode === 'auto')   content += `> Our AI verifier checks your screenshot **automatically**. Approved submissions trigger your role + actions instantly.`;
    if (cfg.mode === 'hybrid') content += `> Our AI verifier checks your screenshot. Strong matches are approved automatically; uncertain ones are reviewed by staff.`;
    if (cfg.mode === 'review') content += `> Every submission is reviewed by staff. You'll get a DM with the result.`;

    const container = new ContainerBuilder()
        .setAccentColor(cfg.color || 0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    if (tasks.length > 0) {
        const opts = tasks.slice(0, 25).map(t => {
            const preset = TASK_PRESETS[t.type] || TASK_PRESETS.custom;
            return {
                label: t.name.slice(0, 100),
                description: (t.target || preset.label).slice(0, 100),
                value: t.id
            };
        });
        const select = new StringSelectMenuBuilder()
            .setCustomId('sshot_user_pick_task')
            .setPlaceholder('Pick the task you completed…')
            .addOptions(opts);
        container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
    }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sshot_user_submit')
            .setLabel('Submit Screenshot')
            .setStyle(ButtonStyle.Success)
            .setEmoji('<:Document:1473039496995143731>')
    ));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return container;
}

/* ═══════════════════════════════════════════════════════════════════
   REVIEW MESSAGE (mod-facing)
   ═══════════════════════════════════════════════════════════════════ */

function buildReviewMessage(submission, task, cfg, ai) {
    const preset = TASK_PRESETS[task?.type] || TASK_PRESETS.custom;

    let content = `# <:Document:1473039496995143731> New Submission\n\n`;
    content += `<:User:1473038971398520977> **Submitter:** <@${submission.userId}> (\`${submission.userId}\`)\n`;
    content += `${preset.emoji} **Task:** ${task ? task.name : '`unknown`'}`;
    if (task?.target) content += ` · \`${task.target}\``;
    content += `\n<:Bookmark:1473039494604132423> **ID:** \`${submission.id}\`\n`;
    content += `<:Alarm:1473039068546732214> **Submitted:** <t:${Math.floor(submission.submittedAt / 1000)}:R>\n`;

    if (ai) {
        const aiBadge = ai.matched
            ? '<:Checkedbox:1473038547165384804> AI Match'
            : '<:Cancel:1473037949187657818> AI No-Match';
        content += `<:Lightning:1473038797540298792> **AI:** ${aiBadge} · \`${ai.confidence ?? 0}%\` confidence\n`;
        if (ai.reasoning) content += `> ${ai.reasoning}\n`;
    } else {
        content += `<:Lightning:1473038797540298792> **AI:** *Not available — manual review*\n`;
    }

    if (submission.note) {
        content += `\n<:Chat:1473038936241864865> **User Note:** ${submission.note}`;
    }

    const accent = ai?.matched && (ai.confidence ?? 0) >= (cfg.confidenceThreshold ?? 75)
        ? 0x57F287
        : (ai && !ai.matched ? 0xED4245 : 0xFEE75C);

    return new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(submission.imageUrl)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`sshot_approve_${submission.id}`)
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('<:Checkedbox:1473038547165384804>'),
                new ButtonBuilder()
                    .setCustomId(`sshot_reject_${submission.id}`)
                    .setLabel('Reject')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('<:Cancel:1473037949187657818>'),
                new ButtonBuilder()
                    .setCustomId(`sshot_rejectreason_${submission.id}`)
                    .setLabel('Reject with Reason')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:Chat:1473038936241864865>'),
                new ButtonBuilder()
                    .setCustomId(`sshot_reassign_${submission.id}`)
                    .setLabel('Re-assign Task')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:Editalt:1473038138577256670>')
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

function buildReviewedMessage(submission, task, cfg, action, moderatorId, reason, actionResults = []) {
    const isApprove = action === 'approved';
    const accent  = isApprove ? 0x57F287 : 0xED4245;
    const emoji   = isApprove
        ? '<:Checkedbox:1473038547165384804>'
        : '<:Cancel:1473037949187657818>';
    const title   = isApprove
        ? (submission.decision === 'auto' ? 'Auto-Approved' : 'Approved')
        : (submission.decision === 'auto' ? 'Auto-Rejected' : 'Rejected');

    let content = `# ${emoji} ${title}\n\n`;
    content += `<:User:1473038971398520977> **Submitter:** <@${submission.userId}>\n`;
    content += `<:Bookmark:1473039494604132423> **ID:** \`${submission.id}\`\n`;
    content += `<:Bookopen:1473038576391557130> **Task:** ${task?.name || '`unknown`'}\n`;
    content += `<:Shield:1473038669831995494> **Reviewer:** ${moderatorId === submission.reviewedBy && submission.decision === 'auto' ? 'AI' : `<@${moderatorId}>`}\n`;
    content += `<:Alarm:1473039068546732214> **Reviewed:** <t:${Math.floor(Date.now() / 1000)}:R>`;

    if (submission.ai) {
        content += `\n<:Lightning:1473038797540298792> **AI Confidence:** \`${submission.ai.confidence ?? 0}%\``;
    }
    if (reason) {
        content += `\n<:Chat:1473038936241864865> **Reason:** ${reason}`;
    }

    if (isApprove && actionResults?.length) {
        content += `\n\n### <:Lightning:1473038797540298792> Actions Executed\n`;
        for (const r of actionResults) {
            const ok = r.ok ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>';
            const lbl = ACTION_PRESETS[r.action.type]?.label || r.action.type;
            content += `> ${ok} **${lbl}** · ${r.message}\n`;
        }
    }

    return new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(submission.imageUrl)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

module.exports = {
    buildSetupPanel,
    buildTaskEditor,
    buildUserPanel,
    buildReviewMessage,
    buildReviewedMessage,
    formatDuration
};
