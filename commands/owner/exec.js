const { isOwner } = require('../../utils/helpers');
const { exec } = require('child_process');

const EXEC_TIMEOUT_MS = 30_000;
const MAX_BUFFER     = 1024 * 1024;   // 1 MB
const MAX_OUTPUT_LEN = 1900;

module.exports = {
    name: 'exec',
    prefix: 'exec',
    aliases: ['shell', 'cmd'],
    description: 'Execute a shell command on the host (owner only)',
    usage: 'exec <command>',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const command = args.join(' ').trim();
        if (!command) {
            return message.reply('<:Cancel:1473037949187657818> Provide a command to execute. Usage: `exec <command>`');
        }

        const msg = await message.reply('<:Lightning:1473038797540298792> Executing...');

        exec(command, { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout, stderr) => {
            const truncate = (s) => {
                if (!s) return '';
                return s.length > MAX_OUTPUT_LEN ? `${s.slice(0, MAX_OUTPUT_LEN)}\n…(truncated)` : s;
            };

            if (error && error.killed) {
                return msg.edit(`<:Cancel:1473037949187657818> **Timeout** after ${EXEC_TIMEOUT_MS / 1000}s.`).catch(() => {});
            }
            if (error) {
                return msg.edit(`<:Cancel:1473037949187657818> **Error:**\n\`\`\`\n${truncate(error.message)}\n\`\`\``).catch(() => {});
            }
            if (stderr) {
                return msg.edit(`<:Inforect:1473038624172937287> **Stderr:**\n\`\`\`\n${truncate(stderr)}\n\`\`\``).catch(() => {});
            }
            msg.edit(`<:Checkedbox:1473038547165384804> **Output:**\n\`\`\`\n${truncate(stdout) || 'No output'}\n\`\`\``).catch(() => {});
        });
    }
};
