const THEME = {
    COLORS: {
        PRIMARY: '#bcf1e4',
        SUCCESS: '#57F287',
        WARNING: '#FEE75C',
        DANGER: '#ED4245',
        INFO: '#bcf1e4',
        DARK: '#2C2F33',
        BLURPLE: '#bcf1e4',
        EMBED: 0xCAD7E6
    },

    EMOJIS: {
        SUCCESS: '<:Checkedbox:1473038547165384804>',
        ERROR: '<:Cancel:1473037949187657818>',
        WARNING: '<:Infotriangle:1473038460456800459>',
        INFO: '<:Inforect:1473038624172937287>',
        LOADING: '<a:Load:1479681956273852607>',
        ONLINE: '<:online:1485248286653943900>',
        OFFLINE: '<:dnd:1473370101427343403>',
        DND: '<:dnd:1455550955679387744>',
        IDLE: '<:idle:1455550955679387745>',
        TOGGLE_ON: '<:Toggleon:1473038585501581312>',
        TOGGLE_OFF: '<:Toggleoff:1473038582813032590>',

        SHIELD: '<:Shield:1473038669831995494>',
        SETTINGS: '<:Settings:1473037894703779851>',
        FOLDER: '<:Folder:1473039340425973972>',
        MUSIC: '<:Music:1473039311057190972>',
        PLAY: '<:Play:1473039266081800303>',
        QUEUE: '<:Bookopen:1473038576391557130>',
        VOLUME: '<:Volumeup:1473039290136002844>',
        LOOP: '<:Refresh:1473037911581528165>',

        MODERATE: '<:banhammer:1473367388597780592>',
        BAN: '<:Shield:1473038669831995494>',
        ADMIN: '<:Shield:1473038669831995494>',
        MESSAGES: '<:Chat:1473038936241864865>',

        LINK: '<:Attach:1473037923979886694>',
        MAIL: '<:Envelope:1473038885364695113>',
        PIN: '<:pin:1473038806612447500>',
        VOICE: '<:wvoice:1386229066104836126>',
        
        GIVEAWAY: '<:Money:1473377877239140529>',
        GAMES: '<:Gamepad:1473039216429498409>',
        DISCORD: '<:xnico:1486755083390550036>',
        UP: '<:Lightning:1473038797540298792>',
        SHINE: '<:Fire:1473038604812161218>',
        BOTS: '<:bots:1473368718120849500>',
        WAR: '<:Caretright:1473038207221502106>',
        
        YOUTUBE: '<:YoutubeLive:1435331502710722592>',
        SPOTIFY: '<:spotify:1473663456182800446>',
        SOUNDCLOUD: '<:soundCloud:1435332317341159424>',
        APPLE_MUSIC: '<:applemusic:1435332305919938680>',
        
        LIGHTNING: '<:Lightningalt:1473038679906844824>',
        ANNOUNCE: '<:Bullhorn:1473038903157199093>',
        
        ARROW_RIGHT: '▸',
        ARROW_LEFT: '◂',
        DOT: '•',
        BULLET: '◦',
        CHECK: '✓',
        CROSS: '✗',
        STAR: '★',
        EMPTY_STAR: '☆'
    },

    BRANDING: {
        FOOTER: 'xNico </>',
        FOOTER_ICON: null,
        NAME: 'Nico Bot',
        AUTHOR: 'Rajeev </>'
    },

    PANELS: {
        HEADER_STYLE: 'modern',
        USE_SEPARATORS: true,
        SEPARATOR_SIZE: 'Small'
    }
};

function formatStatus(enabled) {
    return enabled ? `<:Toggleon:1473038585501581312> Enabled` : `<:Toggleoff:1473038582813032590> Disabled`;
}

function formatCheck(enabled) {
    return enabled ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>';
}

function formatBulletList(items, emoji = THEME.EMOJIS.ARROW_RIGHT) {
    return items.map(item => `${emoji} ${item}`).join('\n');
}

function createHeader(title, emoji = '') {
    return `# ${emoji ? emoji + ' ' : ''}${title}`;
}

function createSubHeader(title, emoji = '') {
    return `## ${emoji ? emoji + ' ' : ''}${title}`;
}

function createSection(title, content, emoji = '') {
    return `### ${emoji ? emoji + ' ' : ''}${title}\n${content}`;
}

function createFooterText() {
    return `-# ${THEME.BRANDING.FOOTER}`;
}

function createStatusBadge(enabled, activeText = 'ACTIVE', inactiveText = 'INACTIVE') {
    if (enabled) {
        return `${THEME.EMOJIS.TOGGLE_ON} **${activeText}**`;
    }
    return `${THEME.EMOJIS.TOGGLE_OFF} **${inactiveText}**`;
}

function createProgressBar(current, max, length = 10, filledChar = '█', emptyChar = '░') {
    const filled = Math.round((current / max) * length);
    const empty = length - filled;
    return filledChar.repeat(filled) + emptyChar.repeat(empty);
}

function createProtectionRow(name, enabled, limit = null) {
    const status = formatCheck(enabled);
    const limitText = limit !== null ? ` \`${limit}\`` : '';
    return `${status} **${name}**${limitText}`;
}

function createInfoRow(label, value, emoji = '') {
    return `${emoji ? emoji + ' ' : ''}**${label}:** ${value}`;
}

function createEmbedFooter(customText = null) {
    return {
        text: customText ? `${customText} • ${THEME.BRANDING.FOOTER}` : THEME.BRANDING.FOOTER
    };
}

module.exports = {
    THEME,
    formatStatus,
    formatCheck,
    formatBulletList,
    createHeader,
    createSubHeader,
    createSection,
    createFooterText,
    createStatusBadge,
    createProgressBar,
    createProtectionRow,
    createInfoRow,
    createEmbedFooter
};
