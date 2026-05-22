const fs = require('fs');
const path = require('path');

const folders = ['music', 'voice', 'basic', 'fun', 'action', 'admin', 'automation', 'utility', 'owner', 'economy', 'leveling', 'image', 'social', 'backup', 'webhook', 'dm', 'stats'];
const names = new Map();
const conflicts = [];

for (const f of folders) {
    const p = path.join('commands', f);
    if (!fs.existsSync(p)) continue;
    for (const file of fs.readdirSync(p).filter(x => x.endsWith('.js'))) {
        try {
            const c = require(path.resolve(p, file));
            const cmdName = c.data?.name || file.replace('.js', '');
            if (names.has(cmdName)) {
                conflicts.push(`${cmdName}: ${names.get(cmdName)} <-> ${f}/${file}`);
            } else {
                names.set(cmdName, `${f}/${file}`);
            }
            if (c.aliases && Array.isArray(c.aliases)) {
                for (const a of c.aliases) {
                    if (names.has(a)) {
                        conflicts.push(`alias '${a}': ${names.get(a)} <-> ${f}/${file}`);
                    } else {
                        names.set(a, `${f}/${file}`);
                    }
                }
            }
        } catch (e) {}
    }
}

console.log('Total conflicts:', conflicts.length);
conflicts.forEach(x => console.log('  ', x));
