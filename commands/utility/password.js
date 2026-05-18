const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

function generatePassword(length, includeNumbers, includeSymbols, includeUppercase) {
    let charset = 'abcdefghijklmnopqrstuvwxyz';
    
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
}

function buildPasswordContainer(password, length, includeNumbers, includeSymbols, includeUppercase) {
    const yes = '<:Checkedbox:1473038547165384804>';
    const no = '<:Cancel:1473037949187657818>';
    
    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Key:1473038690606649375> Password Generated\n\n\`\`\`${password}\`\`\``)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `📏 **Length:** ${length} characters\n` +
                `🔢 **Numbers:** ${includeNumbers ? yes : no}\n` +
                `🔣 **Symbols:** ${includeSymbols ? yes : no}\n` +
                `<:Microphone:1473039293088927996> **Uppercase:** ${includeUppercase ? yes : no}\n\n` +
                `*<:Inforect:1473038624172937287> Keep your password safe!*`
            )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('password')
        .setDescription('Generate a secure random password')
        .addIntegerOption(option =>
            option.setName('length')
                .setDescription('Password length (8-128)')
                .setMinValue(8)
                .setMaxValue(128)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('numbers')
                .setDescription('Include numbers (default: true)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('symbols')
                .setDescription('Include symbols (default: true)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('uppercase')
                .setDescription('Include uppercase letters (default: true)')
                .setRequired(false)),

    async execute(interaction) {
        const length = interaction.options.getInteger('length') || 16;
        const includeNumbers = interaction.options.getBoolean('numbers') ?? true;
        const includeSymbols = interaction.options.getBoolean('symbols') ?? true;
        const includeUppercase = interaction.options.getBoolean('uppercase') ?? true;

        const password = generatePassword(length, includeNumbers, includeSymbols, includeUppercase);
        const container = buildPasswordContainer(password, length, includeNumbers, includeSymbols, includeUppercase);

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args) {
        const length = parseInt(args[0]) || 16;
        
        if (length < 8 || length > 128) {
            return message.reply('<:Cancel:1473037949187657818> Password length must be between 8 and 128 characters!');
        }

        const password = generatePassword(length, true, true, true);
        const container = buildPasswordContainer(password, length, true, true, true);

        const msg = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        
        setTimeout(async () => {
            try {
                await msg.delete();
            } catch (error) {
                console.log('Could not delete password message');
            }
        }, 60000);
    }
};
