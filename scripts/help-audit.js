'use strict';

/**
 * Audits which commands aren't yet listed in utils/helpCategories.js.
 * Prints two lists:
 *   1. UNMAPPED — commands present on disk that aren't in any help category
 *   2. ORPHANED — help-category entries whose command files no longer exist
 */

const fs = require('fs');
const path = require('path');
const {
    COMMAND_CATEGORY_MAP,
    CATEGORY_GROUP_RULES,
    NEW_COMMANDS,
} = require('../utils/helpCategories');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

// ── Walk every command folder and collect (name, folder) pairs ──
const onDisk = new Map();
for (const folder of fs.readdirSync(COMMANDS_DIR)) {
    const folderPath = path.join(COMMANDS_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath)) {
        if (!file.endsWith('.js')) continue;
        const full = path.join(folderPath, file);
        let mod;
        try {
            mod = require(full);
        } catch (e) {
            console.log(`[load-fail] ${file}: ${e.message}`);
            continue;
        }
        const name =
            mod?.name ||
            mod?.prefix ||
            mod?.data?.name ||
            file.replace(/\.js$/, '');
        if (!name || typeof name !== 'string') continue;
        if (!onDisk.has(name)) onDisk.set(name, { folder, file });
    }
}

// ── Find unmapped commands ──
const unmapped = [];
for (const [name, info] of onDisk.entries()) {
    if (!COMMAND_CATEGORY_MAP.has(name)) {
        unmapped.push({ name, ...info });
    }
}

// ── Find orphaned help entries ──
const orphaned = [];
for (const [cat, groups] of Object.entries(CATEGORY_GROUP_RULES)) {
    for (const group of groups) {
        for (const cmd of group.cmds) {
            if (!onDisk.has(cmd)) {
                orphaned.push({ category: cat, group: group.name, cmd });
            }
        }
    }
}

console.log('───────────────────────────────────────────────');
console.log(`Total commands on disk:  ${onDisk.size}`);
console.log(`Mapped in help menu:     ${onDisk.size - unmapped.length}`);
console.log(`Unmapped (NEW):          ${unmapped.length}`);
console.log(`Orphaned in help:        ${orphaned.length}`);
console.log(`Already in NEW_COMMANDS: ${NEW_COMMANDS.size}`);
console.log('───────────────────────────────────────────────');

if (unmapped.length) {
    console.log('\n## UNMAPPED COMMANDS (need to be added to a help category)\n');
    // Group by folder for easier slotting
    const byFolder = {};
    for (const u of unmapped) {
        if (!byFolder[u.folder]) byFolder[u.folder] = [];
        byFolder[u.folder].push(u.name);
    }
    for (const folder of Object.keys(byFolder).sort()) {
        console.log(`### ${folder}/  (${byFolder[folder].length})`);
        for (const n of byFolder[folder].sort()) console.log(`  - ${n}`);
    }
}

if (orphaned.length) {
    console.log('\n## ORPHANED HELP ENTRIES (referenced but no file)\n');
    for (const o of orphaned) {
        console.log(`  - ${o.cmd}  → ${o.category}/${o.group}`);
    }
}
