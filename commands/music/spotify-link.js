const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, SeparatorBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');
const { checkAndExpire } = require('../../utils/panelExpiration');

function loadLinks() {
    try {
        if (!jsonStore.has('spotify-links')) return {};
        return jsonStore.read('spotify-links');
    } catch { return {}; }
}

function saveLinks(data) {
    jsonStore.write('spotify-links', data);
}

function loadFavorites() {
    try {
        if (!jsonStore.has('favorite_songs')) return [];
        return jsonStore.read('favorite_songs');
    } catch { return []; }
}

function buildProfilePanel(userId, links, favorites) {
    const profile = links[userId];
    const userFavs = favorites.filter(f => f.user_id === userId);
    const container = new ContainerBuilder().setAccentColor(0x1DB954);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# <:spotify:1473663456182800446> Spotify Profile\n-# Link your Spotify account and manage your music')
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (profile) {
        let profileText = `<:Checkedbox:1473038547165384804> **Linked Account**\n`;
        profileText += `> **Username:** \`${profile.username}\`\n`;
        if (profile.profileUrl) profileText += `> **Profile:** [Open on Spotify](${profile.profileUrl})\n`;
        if (profile.linkedAt) profileText += `> **Linked:** <t:${Math.floor(new Date(profile.linkedAt).getTime() / 1000)}:R>\n`;

        if (profile.playlists?.length > 0) {
            profileText += `\n**<:Music:1473039311057190972> Saved Playlists** (${profile.playlists.length})\n`;
            profile.playlists.slice(0, 10).forEach((pl, i) => {
                profileText += `> \`${i + 1}.\` [${pl.name}](${pl.url})\n`;
            });
            if (profile.playlists.length > 10) profileText += `> -# +${profile.playlists.length - 10} more\n`;
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(profileText));
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('<:Cancel:1473037949187657818> **No account linked**\n-# Click **Link Account** to connect your Spotify profile')
        );
    }

    if (userFavs.length > 0) {
        let favText = `\n**<:Heart:1473038659514007616> Favorite Songs** (${userFavs.length})\n`;
        userFavs.slice(0, 8).forEach((song, i) => {
            const dur = song.duration ? `\`${Math.floor(song.duration / 60000)}:${String(Math.floor((song.duration % 60000) / 1000)).padStart(2, '0')}\`` : '';
            favText += `> \`${i + 1}.\` **${song.title}** by ${song.author} ${dur}\n`;
        });
        if (userFavs.length > 8) favText += `> -# +${userFavs.length - 8} more\n`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(favText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('spotlink_link')
            .setLabel(profile ? 'Update Account' : 'Link Account')
            .setStyle(ButtonStyle.Success)
            .setEmoji('<:spotify:1473663456182800446>'),
        new ButtonBuilder()
            .setCustomId('spotlink_playlist')
            .setLabel('Add Playlist')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('<:Music:1473039311057190972>')
            .setDisabled(!profile),
        new ButtonBuilder()
            .setCustomId('spotlink_remove_playlist')
            .setLabel('Remove Playlist')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Trash:1473038090074591293>')
            .setDisabled(!profile || !profile.playlists?.length)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('spotlink_unlink')
            .setLabel('Unlink Account')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:Cancel:1473037949187657818>')
            .setDisabled(!profile),
        new ButtonBuilder()
            .setCustomId('spotlink_view')
            .setLabel('View Favorites')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Heart:1473038659514007616>')
            .setDisabled(userFavs.length === 0)
    );

    container.addActionRowComponents(row1);
    container.addActionRowComponents(row2);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# <:Infotriangle:1473038460456800459> Use /favorite while playing music to save songs')
    );

    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify-link')
        .setDescription('Link your Spotify profile and manage playlists')
        .addUserOption(option => option.setName('user').setDescription('View another user\'s profile').setRequired(false)),

    async execute(interaction) {
        const viewUser = interaction.options.getUser('user');
        if (viewUser && viewUser.id !== interaction.user.id) {
            return showOtherProfile(interaction, viewUser);
        }
        const links = loadLinks();
        const favorites = loadFavorites();
        const container = buildProfilePanel(interaction.user.id, links, favorites);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args) {
        const viewUser = message.mentions.users.first();
        if (viewUser && viewUser.id !== message.author.id) {
            return showOtherProfile(message, viewUser);
        }
        const links = loadLinks();
        const favorites = loadFavorites();
        const container = buildProfilePanel(message.author.id, links, favorites);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleInteraction(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('spotlink_')) return false;

        // Check if config session has expired
        if (await checkAndExpire(interaction, 'config')) return true;

        const userId = interaction.user.id;
        const links = loadLinks();
        const favorites = loadFavorites();

        if (customId === 'spotlink_link') {
            const current = links[userId];
            const modal = new ModalBuilder()
                .setCustomId('spotlink_modal_link')
                .setTitle('Link Spotify Account');

            const usernameInput = new TextInputBuilder()
                .setCustomId('spotify_username')
                .setLabel('Spotify Username')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('your_spotify_username')
                .setValue(current?.username || '')
                .setRequired(true);

            const urlInput = new TextInputBuilder()
                .setCustomId('spotify_url')
                .setLabel('Profile URL (optional)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://open.spotify.com/user/your_id')
                .setValue(current?.profileUrl || '')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(urlInput)
            );
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'spotlink_modal_link' && interaction.isModalSubmit()) {
            const username = interaction.fields.getTextInputValue('spotify_username').trim();
            const url = interaction.fields.getTextInputValue('spotify_url').trim();

            if (!links[userId]) links[userId] = {};
            links[userId].username = username;
            links[userId].linkedAt = new Date().toISOString();
            if (url) {
                // Validate it looks like a Spotify URL
                if (url.includes('open.spotify.com') || url.includes('spotify.com')) {
                    links[userId].profileUrl = url;
                } else {
                    links[userId].profileUrl = `https://open.spotify.com/user/${encodeURIComponent(url)}`;
                }
            }
            if (!links[userId].playlists) links[userId].playlists = [];

            saveLinks(links);

            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Spotify account linked as **${username}**!`, flags: MessageFlags.Ephemeral });
            try {
                const container = buildProfilePanel(userId, links, favorites);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {}
            return true;
        }

        if (customId === 'spotlink_playlist') {
            const modal = new ModalBuilder()
                .setCustomId('spotlink_modal_playlist')
                .setTitle('Add Spotify Playlist');

            const nameInput = new TextInputBuilder()
                .setCustomId('playlist_name')
                .setLabel('Playlist Name')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('My Favorites')
                .setRequired(true);

            const urlInput = new TextInputBuilder()
                .setCustomId('playlist_url')
                .setLabel('Playlist URL')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://open.spotify.com/playlist/...')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(urlInput)
            );
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'spotlink_modal_playlist' && interaction.isModalSubmit()) {
            const name = interaction.fields.getTextInputValue('playlist_name').trim();
            const url = interaction.fields.getTextInputValue('playlist_url').trim();

            if (!links[userId]) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Link your account first!', flags: MessageFlags.Ephemeral });
                return true;
            }

            if (!links[userId].playlists) links[userId].playlists = [];

            if (links[userId].playlists.length >= 25) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Maximum 25 playlists!', flags: MessageFlags.Ephemeral });
                return true;
            }

            links[userId].playlists.push({ name, url, addedAt: new Date().toISOString() });
            saveLinks(links);

            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Playlist **${name}** added!`, flags: MessageFlags.Ephemeral });
            try {
                const container = buildProfilePanel(userId, links, favorites);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {}
            return true;
        }

        if (customId === 'spotlink_remove_playlist') {
            if (!links[userId]?.playlists?.length) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> No playlists to remove!', flags: MessageFlags.Ephemeral });
                return true;
            }

                        const options = links[userId].playlists.slice(0, 25).map((pl, i) => ({
                label: pl.name.length > 50 ? pl.name.substring(0, 47) + '...' : pl.name,
                value: String(i),
                emoji: '<:Music:1473039311057190972>'
            }));

            const select = new StringSelectMenuBuilder()
                .setCustomId('spotlink_remove_select')
                .setPlaceholder('Select playlist to remove')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(select);
            await interaction.reply({ content: '**Select a playlist to remove:**', components: [row], flags: MessageFlags.Ephemeral });
            return true;
        }

        if (customId === 'spotlink_remove_select' && interaction.isStringSelectMenu()) {
            const index = parseInt(interaction.values[0]);
            if (!links[userId]?.playlists?.[index]) {
                await interaction.update({ content: '<:Cancel:1473037949187657818> Playlist not found!', components: [] });
                return true;
            }

            const removed = links[userId].playlists.splice(index, 1)[0];
            saveLinks(links);
            await interaction.update({ content: `<:Checkedbox:1473038547165384804> Removed **${removed.name}**!`, components: [] });
            return true;
        }

        if (customId === 'spotlink_unlink') {
            delete links[userId];
            saveLinks(links);

            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Spotify account unlinked!', flags: MessageFlags.Ephemeral });
            try {
                const container = buildProfilePanel(userId, links, favorites);
                await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {}
            return true;
        }

        if (customId === 'spotlink_view') {
            const userFavs = favorites.filter(f => f.user_id === userId);
            if (userFavs.length === 0) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> You have no favorite songs!', flags: MessageFlags.Ephemeral });
                return true;
            }

            let content = `# <:Heart:1473038659514007616> Your Favorite Songs\n\n`;
            userFavs.slice(0, 20).forEach((song, i) => {
                const dur = song.duration ? ` \`${Math.floor(song.duration / 60000)}:${String(Math.floor((song.duration % 60000) / 1000)).padStart(2, '0')}\`` : '';
                content += `\`${i + 1}.\` **${song.title}** by ${song.author}${dur}\n`;
                if (song.url) content += `> [Listen](${song.url})\n`;
            });
            if (userFavs.length > 20) content += `\n-# +${userFavs.length - 20} more songs`;

            const container = new ContainerBuilder()
                .setAccentColor(0x1DB954)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        return false;
    }
};

async function showOtherProfile(ctx, user) {
    const links = loadLinks();
    const favorites = loadFavorites();
    const profile = links[user.id];
    const userFavs = favorites.filter(f => f.user_id === user.id);

    const container = new ContainerBuilder().setAccentColor(0x1DB954);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# <:spotify:1473663456182800446> ${user.username}'s Spotify Profile`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (profile) {
        let text = `**Username:** \`${profile.username}\`\n`;
        if (profile.profileUrl) text += `**Profile:** [Open on Spotify](${profile.profileUrl})\n`;

        if (profile.playlists?.length > 0) {
            text += `\n**<:Music:1473039311057190972> Playlists** (${profile.playlists.length})\n`;
            profile.playlists.slice(0, 10).forEach((pl, i) => {
                text += `> \`${i + 1}.\` [${pl.name}](${pl.url})\n`;
            });
        }
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:Cancel:1473037949187657818> ${user.username} has not linked their Spotify account.`)
        );
    }

    if (userFavs.length > 0) {
        let favText = `\n**<:Heart:1473038659514007616> Favorite Songs** (${userFavs.length})\n`;
        userFavs.slice(0, 5).forEach((song, i) => {
            favText += `> \`${i + 1}.\` **${song.title}** by ${song.author}\n`;
        });
        if (userFavs.length > 5) favText += `> -# +${userFavs.length - 5} more\n`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(favText));
    }

    const isReply = ctx.reply !== undefined;
    const flags = ctx.isRepliable?.() ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2;
    await ctx.reply({ components: [container], flags });
}
