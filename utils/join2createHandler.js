const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildSuccessResponse, buildErrorResponse, BRANDING } = require('./responseBuilder');

const jsonStore = require('./jsonStore');
const log = require('./logger-styled');
const getConfig = () => jsonStore.has('join2create') ? jsonStore.read('join2create') : {};
const saveConfig = c => jsonStore.write('join2create', c);

const CV2_EPH = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const ok = (t, d) => ({ components: [buildSuccessResponse(t, d)], flags: CV2_EPH });
const err = (t, d) => ({ components: [buildErrorResponse(t, d)], flags: CV2_EPH });

const OWNER_PERMS = { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true };
const MEMBER_PERMS = { ViewChannel: true, Connect: true, ManageChannels: false, MoveMembers: false, MuteMembers: false, DeafenMembers: false };

// Modal definitions — { customId, title, fieldId, label, placeholder }
function showModal(interaction, id, title, fieldId, label, placeholder, maxLen) {
    const modal = new ModalBuilder().setCustomId(id).setTitle(title);
    const input = new TextInputBuilder().setCustomId(fieldId).setLabel(label)
        .setStyle(TextInputStyle.Short).setPlaceholder(placeholder).setRequired(true);
    if (maxLen) input.setMaxLength(maxLen);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
}

// Resolve user from modal input
async function resolveUser(interaction, guild) {
    const id = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
    const member = await guild.members.fetch(id).catch(() => null);
    if (!member) await interaction.reply(err('User Not Found', 'Could not find that user. Make sure the ID is correct.'));
    return member;
}

// --- Voice state handler ---
async function handleVoiceStateUpdate(oldState, newState) {
    const config = getConfig();
    const gc = config[newState.guild.id];
    if (!gc?.enabled) return;
    if (!gc.activeChannels) gc.activeChannels = {};

    if (newState.channel?.id === gc.triggerChannelId) {
        const uid = newState.member.id;
        if (gc.activeChannels[uid]) {
            const ch = newState.guild.channels.cache.get(gc.activeChannels[uid]);
            if (ch) { await newState.member.voice.setChannel(ch); return; }
        }
        try {
            const guild = newState.guild;
            let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'Temporary Channels');
            if (!cat) cat = await guild.channels.create({ name: 'Temporary Channels', type: ChannelType.GuildCategory, position: 0 });

            const vc = await guild.channels.create({
                name: `${newState.member.user.username}'s Channel`, type: ChannelType.GuildVoice,
                parent: cat.id, userLimit: 0, bitrate: Math.min(guild.premiumTier >= 1 ? 128000 : 96000, 96000),
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                    { id: uid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers] }
                ]
            });
            gc.activeChannels[uid] = vc.id;
            saveConfig(config);
            await newState.member.voice.setChannel(vc);
        } catch (e) { log.error('Error creating temp channel:', e); }
    }

    // Cleanup empty channels
    if (oldState.channel && gc.activeChannels) {
        for (const [oid, cid] of Object.entries(gc.activeChannels)) {
            const ch = oldState.guild.channels.cache.get(cid);
            if (!ch) { delete gc.activeChannels[oid]; saveConfig(config); continue; }
            if (ch.members.size === 0) {
                try { await ch.delete(); } catch {}
                delete gc.activeChannels[oid]; saveConfig(config);
            }
        }
        const cat = oldState.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'Temporary Channels');
        if (cat?.children.cache.size === 0) try { await cat.delete(); } catch {}
    }
}

// --- Button handler ---
async function handleJ2CButtons(interaction) {
    const action = interaction.customId.replace('j2c_', '');
    const config = getConfig();
    const gc = config[interaction.guild.id];
    if (!gc?.enabled) return interaction.reply(err('System Disabled', 'Join-to-create is not enabled in this server.'));

    const uid = interaction.user.id;
    const guild = interaction.guild;
    const chId = gc.activeChannels[uid];
    const channel = chId ? guild.channels.cache.get(chId) : null;

    if (!chId && action !== 'claim') return interaction.reply(err('No Channel', 'You don\'t have a temporary voice channel. Join the trigger channel to create one.'));
    if (!channel && action !== 'claim') return interaction.reply(err('Channel Gone', 'Your voice channel no longer exists.'));

    // Modal-based actions
    const modals = {
        rename:  ['j2c_rename_modal', 'Rename Voice Channel', 'channel_name', 'New Channel Name', 'Enter new channel name', 100],
        limit:   ['j2c_limit_modal', 'Set User Limit', 'user_limit', 'User Limit (0 for unlimited)', '0-99', 2],
        bitrate: ['j2c_bitrate_modal', 'Set Bitrate', 'bitrate', 'Bitrate (kbps)', '8-384', 3],
        transfer:['j2c_transfer_modal', 'Transfer Ownership', 'user_id', 'User ID or @mention', 'Enter user ID'],
        kick:    ['j2c_kick_modal', 'Kick User from Channel', 'user_id', 'User ID to kick', 'Enter user ID or @mention'],
        block:   ['j2c_block_modal', 'Block User from Channel', 'user_id', 'User ID to block', 'Enter user ID or @mention'],
        unblock: ['j2c_unblock_modal', 'Unblock User from Channel', 'user_id', 'User ID to unblock', 'Enter user ID or @mention'],
        permit:  ['j2c_permit_modal', 'Permit User to Join', 'user_id', 'User ID to permit (bypass lock)', 'Enter user ID or @mention'],
        trust:   ['j2c_trust_modal', 'Trust User (Co-Owner)', 'user_id', 'User ID to trust', 'Enter user ID — they can manage the channel'],
        untrust: ['j2c_untrust_modal', 'Untrust User', 'user_id', 'User ID to untrust', 'Enter user ID to remove co-owner'],
        region:  ['j2c_region_modal', 'Set Voice Region', 'region', 'Region (auto, us-west, eu-west, etc.)', 'auto, us-west, eu-west, singapore']
    };
    if (modals[action]) return showModal(interaction, ...modals[action]);

    // Permission toggle actions
    const toggles = {
        lock:   [{ Connect: false }, 'Channel Locked', '<:Lock:1473038513749491773> Your channel is now **locked**.'],
        unlock: [{ Connect: true }, 'Channel Unlocked', '<:Unlock:1473038516639236269> Your channel is now **unlocked**.'],
        hide:   [{ ViewChannel: false }, 'Channel Hidden', '<:Eyeclosed:1473038425085972521> Your channel is now **hidden**.'],
        unhide: [{ ViewChannel: true }, 'Channel Visible', '<:Eye:1473038435056095242> Your channel is now **visible**.']
    };
    if (toggles[action]) {
        const [perms, title, desc] = toggles[action];
        try { await channel.permissionOverwrites.edit(guild.id, perms); return interaction.reply(ok(title, desc)); }
        catch { return interaction.reply(err(`${action} Failed`, 'Failed to update channel. Check bot permissions.')); }
    }

    if (action === 'claim') {
        if (!interaction.member.voice.channel) return interaction.reply(err('Not in Channel', 'You must be in a temporary voice channel to claim it.'));
        const ch = interaction.member.voice.channel;
        const ownerId = Object.keys(gc.activeChannels).find(k => gc.activeChannels[k] === ch.id);
        if (!ownerId) return interaction.reply(err('Invalid Channel', 'This is not a temporary voice channel.'));
        const owner = await guild.members.fetch(ownerId).catch(() => null);
        if (owner && ch.members.has(ownerId)) return interaction.reply(err('Owner Present', 'The channel owner is still in the channel.'));
        gc.activeChannels[uid] = ch.id; delete gc.activeChannels[ownerId]; saveConfig(config);
        await ch.permissionOverwrites.edit(uid, OWNER_PERMS);
        return interaction.reply(ok('Channel Claimed', '<a:Crown:1473366446984663123> You are now the **owner** of this channel.'));
    }

    if (action === 'delete') {
        try {
            await interaction.reply(ok('Channel Deleted', '<:Trash:1473038090074591293> Your voice channel is being deleted.'));
            delete gc.activeChannels[uid]; saveConfig(config); await channel.delete();
        } catch { await interaction.reply(err('Delete Failed', 'Failed to delete channel.')).catch(() => {}); }
        return;
    }

    if (action === 'invite') {
        try {
            const inv = await channel.createInvite({ maxAge: 3600, maxUses: 10, unique: true });
            const container = new ContainerBuilder().setAccentColor(0x5865F2)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:Attach:1473037923979886694> Voice Channel Invite`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Channel:** ${channel.name}\n**Link:** ${inv.url}\n**Expires:** <t:${Math.floor(Date.now() / 1000) + 3600}:R>\n**Max Uses:** \`10\`\n\n-# Share this link to invite others`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            return interaction.reply({ components: [container], flags: CV2_EPH });
        } catch { return interaction.reply(err('Invite Failed', 'Failed to create invite. Check bot permissions.')); }
    }

    if (action === 'info') {
        const mc = channel.members.size, ul = channel.userLimit || 'Unlimited', br = Math.round(channel.bitrate / 1000);
        const locked = !channel.permissionsFor(guild.id)?.has('Connect'), hidden = !channel.permissionsFor(guild.id)?.has('ViewChannel');
        const on = '<:Toggleon:1473038585501581312>', off = '<:Toggleoff:1473038582813032590>';
        const members = channel.members.map(m => m.user.username).slice(0, 10).join(', ') || 'Empty';

        const container = new ContainerBuilder().setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:Document:1473039496995143731> Channel Information`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:Volumeup:1473039290136002844> ${channel.name}\n**Members:** \`${mc}${ul !== 'Unlimited' ? `/${ul}` : ''}\` · **Bitrate:** \`${br} kbps\` · **Region:** \`${channel.rtcRegion || 'Auto'}\``))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${locked ? on : off} **Locked** · ${hidden ? on : off} **Hidden** · **Created:** <t:${Math.floor(channel.createdTimestamp / 1000)}:R>`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Members:** ${members}${mc > 10 ? ` +${mc - 10} more` : ''}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
        return interaction.reply({ components: [container], flags: CV2_EPH });
    }
}

// --- Modal handler ---
async function handleJ2CModals(interaction) {
    const action = interaction.customId.replace('j2c_', '').replace('_modal', '');
    const config = getConfig();
    const gc = config[interaction.guild.id];
    if (!gc?.enabled) return interaction.reply(err('System Disabled', 'Join-to-create is not enabled in this server.'));

    const chId = gc.activeChannels[interaction.user.id];
    if (!chId) return interaction.reply(err('No Channel', 'You don\'t have an active temporary voice channel.'));
    const guild = interaction.guild, channel = guild.channels.cache.get(chId);
    if (!channel) return interaction.reply(err('Channel Gone', 'Your voice channel no longer exists.'));

    if (action === 'rename') {
        const name = interaction.fields.getTextInputValue('channel_name');
        await channel.setName(name);
        return interaction.reply(ok('Renamed', `<:Editalt:1473038138577256670> Channel renamed to **${name}**.`));
    }

    if (action === 'limit') {
        const n = parseInt(interaction.fields.getTextInputValue('user_limit'));
        if (isNaN(n) || n < 0 || n > 99) return interaction.reply(err('Invalid Limit', 'Must be **0–99**. Use `0` for unlimited.'));
        await channel.setUserLimit(n);
        return interaction.reply(ok('Limit Set', `<:User:1473038971398520977> User limit set to **${n === 0 ? 'Unlimited' : n}**.`));
    }

    if (action === 'bitrate') {
        const n = parseInt(interaction.fields.getTextInputValue('bitrate'));
        if (isNaN(n) || n < 8 || n > 384) return interaction.reply(err('Invalid Bitrate', 'Must be **8–384** kbps.'));
        const max = guild.premiumTier >= 3 ? 384 : guild.premiumTier >= 2 ? 256 : guild.premiumTier >= 1 ? 128 : 96;
        const final = Math.min(n, max);
        await channel.setBitrate(final * 1000);
        return interaction.reply(ok('Bitrate Set', `<:Volumeup:1473039290136002844> Bitrate set to **${final} kbps**.`));
    }

    if (action === 'transfer') {
        const target = await resolveUser(interaction, guild);
        if (!target) return;
        if (!channel.members.has(target.id)) return interaction.reply(err('Not in Channel', 'That user must be in the channel.'));
        gc.activeChannels[target.id] = chId; delete gc.activeChannels[interaction.user.id]; saveConfig(config);
        await channel.permissionOverwrites.edit(interaction.user.id, MEMBER_PERMS);
        await channel.permissionOverwrites.edit(target.id, OWNER_PERMS);
        return interaction.reply(ok('Transferred', `<:transfer:1479780506718437396> Ownership transferred to ${target}.`));
    }

    if (action === 'kick') {
        const target = await resolveUser(interaction, guild);
        if (!target) return;
        if (target.id === interaction.user.id) return interaction.reply(err('Invalid', 'You cannot kick yourself.'));
        if (!channel.members.has(target.id)) return interaction.reply(err('Not in Channel', 'That user is not in your channel.'));
        try { await target.voice.disconnect(); return interaction.reply(ok('Kicked', `<:dnd:1473370101427343403> Kicked **${target.user.username}**.`)); }
        catch { return interaction.reply(err('Failed', 'Failed to kick the user.')); }
    }

    if (action === 'block') {
        const target = await resolveUser(interaction, guild);
        if (!target) return;
        if (target.id === interaction.user.id) return interaction.reply(err('Invalid', 'You cannot block yourself.'));
        try {
            await channel.permissionOverwrites.edit(target.id, { Connect: false, ViewChannel: false });
            if (channel.members.has(target.id)) await target.voice.disconnect();
            return interaction.reply(ok('Blocked', `<:Commentblock:1473370739351490794> Blocked **${target.user.username}**.`));
        } catch { return interaction.reply(err('Failed', 'Failed to block the user.')); }
    }

    if (action === 'unblock') {
        const target = await resolveUser(interaction, guild);
        if (!target) return;
        try { await channel.permissionOverwrites.delete(target.id); return interaction.reply(ok('Unblocked', `<:Checkedbox:1473038547165384804> Unblocked **${target.user.username}**.`)); }
        catch { return interaction.reply(err('Failed', 'Failed to unblock the user.')); }
    }

    if (action === 'permit') {
        const target = await resolveUser(interaction, guild);
        if (!target) return;
        try { await channel.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true }); return interaction.reply(ok('Permitted', `<:Userplus:1473038912212435086> Permitted **${target.user.username}** (bypasses lock).`)); }
        catch { return interaction.reply(err('Failed', 'Failed to permit the user.')); }
    }

    if (action === 'trust') {
        const target = await resolveUser(interaction, guild);
        if (!target) return;
        if (target.id === interaction.user.id) return interaction.reply(err('Invalid', 'You are already the owner.'));
        try { await channel.permissionOverwrites.edit(target.id, OWNER_PERMS); return interaction.reply(ok('Trusted', `<:trust:1479780674532671673> Trusted **${target.user.username}** as co-owner.`)); }
        catch { return interaction.reply(err('Failed', 'Failed to trust the user.')); }
    }

    if (action === 'untrust') {
        const target = await resolveUser(interaction, guild);
        if (!target) return;
        try { await channel.permissionOverwrites.edit(target.id, MEMBER_PERMS); return interaction.reply(ok('Untrusted', `<:untrust:1479780596971737149> Removed trust from **${target.user.username}**.`)); }
        catch { return interaction.reply(err('Failed', 'Failed to untrust the user.')); }
    }

    if (action === 'region') {
        const input = interaction.fields.getTextInputValue('region').toLowerCase().trim();
        const valid = ['auto','us-west','us-east','us-central','us-south','eu-west','eu-central','singapore','brazil','hongkong','russia','japan','southafrica','sydney','india'];
        if (!valid.includes(input)) return interaction.reply(err('Invalid Region', `Valid: \`${valid.join('`, `')}\``));
        try { await channel.setRTCRegion(input === 'auto' ? null : input); return interaction.reply(ok('Region Set', `<:rocket:1479780552276967465> Region set to **${input === 'auto' ? 'Automatic' : input}**.`)); }
        catch { return interaction.reply(err('Failed', 'Failed to change voice region.')); }
    }
}

module.exports = { handleVoiceStateUpdate, handleJ2CButtons, handleJ2CModals };
