const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

function createContainer(accentColor = null) {
    const container = new ContainerBuilder();
    if (accentColor) {
        container.setAccentColor(accentColor);
    }
    return container;
}

function addTextDisplay(container, content) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return container;
}

function addSeparator(container, spacing = SeparatorSpacingSize.Small) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(spacing).setDivider(true));
    return container;
}

function createSection(text, thumbnailUrl = null) {
    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    if (thumbnailUrl) {
        section.setThumbnail(new ThumbnailBuilder().setURL(thumbnailUrl));
    }
    return section;
}

function createMediaGallery(items) {
    const gallery = new MediaGalleryBuilder();
    for (const item of items) {
        gallery.addItems(
            new MediaGalleryItemBuilder().setURL(item.url).setDescription(item.description || '')
        );
    }
    return gallery;
}

function formatDuration(ms) {
    if (!ms || ms < 0) return '0s';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function truncateText(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

function parseTimeString(str) {
    if (!str) return null;
    const regex = /(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)/gi;
    let totalMs = 0;
    let match;
    
    while ((match = regex.exec(str)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        if (unit.startsWith('s')) totalMs += value * 1000;
        else if (unit.startsWith('m') && !unit.startsWith('mo')) totalMs += value * 60 * 1000;
        else if (unit.startsWith('h')) totalMs += value * 60 * 60 * 1000;
        else if (unit.startsWith('d')) totalMs += value * 24 * 60 * 60 * 1000;
        else if (unit.startsWith('w')) totalMs += value * 7 * 24 * 60 * 60 * 1000;
    }
    
    return totalMs > 0 ? totalMs : null;
}

function getErrorContainer(message, emoji = '<:Cancel:1473037949187657818>') {
    return createContainer(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji} ${message}`));
}

function getSuccessContainer(message, emoji = '<:Checkedbox:1473038547165384804>') {
    return createContainer()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji} ${message}`));
}

function getInfoContainer(message, emoji = '<:Bookopen:1473038576391557130>') {
    return createContainer()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji} ${message}`));
}

function getWarningContainer(message, emoji = '<:Infotriangle:1473038460456800459>') {
    return createContainer(0xFEE75C)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji} ${message}`));
}

module.exports = {
    createContainer,
    addTextDisplay,
    addSeparator,
    createSection,
    createMediaGallery,
    formatDuration,
    formatNumber,
    truncateText,
    parseTimeString,
    getErrorContainer,
    getSuccessContainer,
    getInfoContainer,
    getWarningContainer,
    MessageFlags,
    SeparatorSpacingSize
};
