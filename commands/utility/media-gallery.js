const { 
    ContainerBuilder, TextDisplayBuilder, MessageFlags, 
    MediaGalleryBuilder, MediaGalleryItemBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');

const { checkAndExpire } = require('../../utils/panelExpiration');

const activeSessions = new Map();

function getSession(key) {
    if (!activeSessions.has(key)) {
        activeSessions.set(key, {
            title: '',
            description: '',
            images: [],
            accentColor: 0xCAD7E6
        });
    }
    return activeSessions.get(key);
}

function buildGalleryPanel(session) {
    const container = new ContainerBuilder()
        .setAccentColor(session.accentColor || 0xCAD7E6);

    let content = `# <:Picture:1473039568398843957> Media Gallery Builder\n\n`;
    content += `**Title:** ${session.title || '*Not set*'}\n`;
    content += `**Description:** ${session.description || '*Not set*'}\n`;
    content += `**Images:** ${session.images.length}/10\n\n`;

    if (session.images.length > 0) {
        content += `### Gallery Preview\n`;
        session.images.forEach((url, i) => {
            const shortUrl = url.length > 50 ? url.substring(0, 50) + '...' : url;
            content += `\`${i + 1}.\` ${shortUrl}\n`;
        });
    } else {
        content += `-# Click **Add Image** to start building your gallery`;
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    // Row 1: Setup
    const setupRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mediagallery_add_image')
            .setLabel('Add Image')
            .setEmoji('<:Picture:1473039568398843957>')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('mediagallery_add_url')
            .setLabel('Add URL')
            .setEmoji('<:Attach:1473037923979886694>')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('mediagallery_remove')
            .setLabel('Remove')
            .setEmoji('<:Trash:1473038090074591293>')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(session.images.length === 0),
        new ButtonBuilder()
            .setCustomId('mediagallery_edit_text')
            .setLabel('Edit Text')
            .setEmoji('<:Editalt:1473038138577256670>')
            .setStyle(ButtonStyle.Secondary)
    );
    container.addActionRowComponents(setupRow);

    // Row 2: Actions
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mediagallery_preview')
            .setLabel('Preview')
            .setEmoji('<:Eye:1473038435056095242>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(session.images.length === 0),
        new ButtonBuilder()
            .setCustomId('mediagallery_send')
            .setLabel('Send to Channel')
            .setEmoji('<:Image:1473039533112033508>')
            .setStyle(ButtonStyle.Success)
            .setDisabled(session.images.length === 0),
        new ButtonBuilder()
            .setCustomId('mediagallery_clear')
            .setEmoji('<:Trash:1473038090074591293>')
            .setLabel('Clear All')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(session.images.length === 0)
    );
    container.addActionRowComponents(actionRow);

    return container;
}

function buildGalleryOutput(session) {
    const container = new ContainerBuilder()
        .setAccentColor(session.accentColor || 0xCAD7E6);

    if (session.title || session.description) {
        let text = '';
        if (session.title) text += `# ${session.title}\n`;
        if (session.description) text += `${session.description}`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    }

    if (session.images.length > 0) {
        const gallery = new MediaGalleryBuilder();
        for (const url of session.images) {
            gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
        }
        container.addMediaGalleryComponents(gallery);
    }

    return container;
}

module.exports = {
    prefix: 'media-gallery',
    description: 'Build and send media galleries with Components v2',
    usage: 'media-gallery',
    category: 'utility',
    aliases: ['gallery', 'mediagallery', 'mg'],

    async executePrefix(message) {
        const key = `${message.guild.id}-${message.author.id}`;
        const session = getSession(key);
        const container = buildGalleryPanel(session);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleInteraction(interaction) {
        if (!interaction.guild) return false;
        const customId = interaction.customId;
        if (!customId.startsWith('mediagallery_')) return false;

        // Check if builder session has expired
        if (await checkAndExpire(interaction, 'builder')) return true;

        const key = `${interaction.guild.id}-${interaction.user.id}`;
        const session = getSession(key);

        if (customId === 'mediagallery_add_url') {
            if (session.images.length >= 10) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Maximum 10 images per gallery!', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder()
                .setCustomId('mediagallery_modal_add_url')
                .setTitle('Add Image URL');

            const urlInput = new TextInputBuilder()
                .setCustomId('image_url')
                .setLabel('Image URL (one per line, max 10 total)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('https://example.com/image1.png\nhttps://example.com/image2.png')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'mediagallery_add_image') {
            await interaction.reply({ 
                content: '<:Picture:1473039568398843957> **Send an image** in this channel within 30 seconds and I\'ll add it to your gallery!',
                flags: MessageFlags.Ephemeral 
            });

            const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
            try {
                const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
                const msg = collected.first();
                const imageUrls = [...msg.attachments.values()]
                    .filter(a => a.contentType?.startsWith('image/'))
                    .map(a => a.url);

                if (imageUrls.length === 0) {
                    await interaction.followUp({ content: '<:Cancel:1473037949187657818> No images found in that message!', flags: MessageFlags.Ephemeral });
                    return true;
                }

                const space = 10 - session.images.length;
                const toAdd = imageUrls.slice(0, space);
                session.images.push(...toAdd);

                const container = buildGalleryPanel(session);
                await interaction.message.edit({ components: [container] });
                await msg.delete().catch(() => {});
                await interaction.followUp({ content: `<:Checkedbox:1473038547165384804> Added ${toAdd.length} image(s)!`, flags: MessageFlags.Ephemeral });
            } catch {
                await interaction.followUp({ content: '<:Cancel:1473037949187657818> Timed out. No image received.', flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        if (customId === 'mediagallery_remove') {
            if (session.images.length === 0) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Gallery is empty!', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder()
                .setCustomId('mediagallery_modal_remove')
                .setTitle('Remove Image');

            const indexInput = new TextInputBuilder()
                .setCustomId('image_index')
                .setLabel(`Image number to remove (1-${session.images.length})`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('1')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(indexInput));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'mediagallery_edit_text') {
            const modal = new ModalBuilder()
                .setCustomId('mediagallery_modal_edit_text')
                .setTitle('Edit Gallery Text');

            const titleInput = new TextInputBuilder()
                .setCustomId('gallery_title')
                .setLabel('Gallery Title')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('My Photo Gallery')
                .setValue(session.title || '')
                .setRequired(false);

            const descInput = new TextInputBuilder()
                .setCustomId('gallery_description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('A collection of photos...')
                .setValue(session.description || '')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descInput)
            );
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'mediagallery_preview') {
            if (session.images.length === 0) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Add some images first!', flags: MessageFlags.Ephemeral });
            }
            const output = buildGalleryOutput(session);
            await interaction.reply({ components: [output], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        if (customId === 'mediagallery_send') {
            if (session.images.length === 0) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Add some images first!', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder()
                .setCustomId('mediagallery_modal_send')
                .setTitle('Send Gallery');

            const channelInput = new TextInputBuilder()
                .setCustomId('channel_id')
                .setLabel('Channel ID or #mention')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(interaction.channel.id)
                .setValue(interaction.channel.id)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'mediagallery_clear') {
            session.images = [];
            session.title = '';
            session.description = '';
            const container = buildGalleryPanel(session);
            await interaction.update({ components: [container] });
            return true;
        }

        return false;
    },

    async handleModalSubmit(interaction) {
        if (!interaction.guild) return false;
        const customId = interaction.customId;
        if (!customId.startsWith('mediagallery_modal_')) return false;

        const key = `${interaction.guild.id}-${interaction.user.id}`;
        const session = getSession(key);

        if (customId === 'mediagallery_modal_add_url') {
            const raw = interaction.fields.getTextInputValue('image_url').trim();
            const urls = raw.split('\n').map(u => u.trim()).filter(u => u.match(/^https?:\/\/.+/i));

            if (urls.length === 0) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> No valid URLs found!', flags: MessageFlags.Ephemeral });
                return true;
            }

            const space = 10 - session.images.length;
            const toAdd = urls.slice(0, space);
            session.images.push(...toAdd);

            const container = buildGalleryPanel(session);
            try { await interaction.message.edit({ components: [container] }); } catch {}

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: `<:Checkedbox:1473038547165384804> Added ${toAdd.length} image(s)!${urls.length > space ? ` (${urls.length - space} skipped — limit 10)` : ''}`, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Added ${toAdd.length} image(s)!${urls.length > space ? ` (${urls.length - space} skipped — limit 10)` : ''}`, flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        if (customId === 'mediagallery_modal_remove') {
            const idx = parseInt(interaction.fields.getTextInputValue('image_index').trim(), 10) - 1;
            if (isNaN(idx) || idx < 0 || idx >= session.images.length) {
                await interaction.reply({ content: `<:Cancel:1473037949187657818> Invalid index! Use 1-${session.images.length}`, flags: MessageFlags.Ephemeral });
                return true;
            }

            session.images.splice(idx, 1);
            const container = buildGalleryPanel(session);
            try { await interaction.message.edit({ components: [container] }); } catch {}
            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Image removed!', flags: MessageFlags.Ephemeral });
            return true;
        }

        if (customId === 'mediagallery_modal_edit_text') {
            session.title = interaction.fields.getTextInputValue('gallery_title') || '';
            session.description = interaction.fields.getTextInputValue('gallery_description') || '';

            const container = buildGalleryPanel(session);
            try { await interaction.message.edit({ components: [container] }); } catch {}
            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Text updated!', flags: MessageFlags.Ephemeral });
            return true;
        }

        if (customId === 'mediagallery_modal_send') {
            let channelId = interaction.fields.getTextInputValue('channel_id').trim().replace(/<#|>/g, '');
            const channel = interaction.guild.channels.cache.get(channelId);
            
            if (!channel) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid channel!', flags: MessageFlags.Ephemeral });
                return true;
            }

            try {
                const output = buildGalleryOutput(session);
                await channel.send({ components: [output], flags: MessageFlags.IsComponentsV2 });
                await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Gallery sent to <#${channelId}>!`, flags: MessageFlags.Ephemeral });
            } catch (error) {
                await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to send: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        return false;
    }
};
