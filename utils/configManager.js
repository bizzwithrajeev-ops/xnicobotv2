const jsonStore = require('./jsonStore');
const log = require('./logger-styled');

class ConfigManager {
    constructor(configName) {
        this.storeName = configName;
    }

    load() {
        return jsonStore.read(this.storeName) || {};
    }

    save(config) {
        try {
            jsonStore.write(this.storeName, config);
            return true;
        } catch (error) {
            log.error(`Error saving config ${this.storeName}:`, error);
            return false;
        }
    }

    get(guildId, defaultValue = {}) {
        const config = this.load();
        return config[guildId] || defaultValue;
    }

    set(guildId, value) {
        const config = this.load();
        config[guildId] = value;
        return this.save(config);
    }

    update(guildId, updates) {
        const config = this.load();
        if (!config[guildId]) config[guildId] = {};
        config[guildId] = { ...config[guildId], ...updates };
        return this.save(config);
    }

    delete(guildId) {
        const config = this.load();
        delete config[guildId];
        return this.save(config);
    }
}

function get247Config(guildId) {
    const config247 = new ConfigManager('musicpanel-247');
    const guildConfig = config247.get(guildId);
    return guildConfig?.enabled || false;
}

function set247Config(guildId, enabled) {
    const config247 = new ConfigManager('musicpanel-247');
    return config247.set(guildId, { enabled });
}

module.exports = {
    ConfigManager,
    get247Config,
    set247Config
};
