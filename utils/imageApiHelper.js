const apiKeyManager = require('./apiKeyManager');

function getConfiguredImageApiBaseUrl() {
    const configuredUrl = (apiKeyManager.resolve('image_api', 'url') || process.env.IMAGE_API_URL || '').trim();
    if (!configuredUrl) return null;

    try {
        const parsed = new URL(configuredUrl);
        const normalizedPath = parsed.pathname.replace(/\/+$/, '');
        return `${parsed.origin}${normalizedPath}`;
    } catch {
        return null;
    }
}

function isImageApiConfigured() {
    return getConfiguredImageApiBaseUrl() !== null;
}

function buildImageApiRequestUrl(endpoint, params = {}) {
    const imageApiBaseUrl = getConfiguredImageApiBaseUrl();
    if (!imageApiBaseUrl) {
        return null;
    }

    const safeEndpoint = String(endpoint || '').replace(/^\/+/, '');
    if (!safeEndpoint) return null;

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.set(key, String(value));
        }
    }

    const query = searchParams.toString();
    return query ? `${imageApiBaseUrl}/${safeEndpoint}?${query}` : `${imageApiBaseUrl}/${safeEndpoint}`;
}

function getImageApiUrl(endpoint, imageUrl, extraParams = {}) {
    if (!imageUrl) {
        return null;
    }

    return buildImageApiRequestUrl(endpoint, {
        image: imageUrl,
        ...extraParams
    });
}

function getUnavailableMessage() {
    return '<:Cancel:1473037949187657818> Image manipulation commands require an IMAGE_API_URL to be configured. Please contact the bot administrator.';
}

module.exports = {
    buildImageApiRequestUrl,
    isImageApiConfigured,
    getImageApiUrl,
    getUnavailableMessage
};
