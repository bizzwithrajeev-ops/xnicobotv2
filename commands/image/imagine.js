const { SlashCommandBuilder, AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { isImageApiConfigured, getUnavailableMessage } = require('../../utils/imageCommandHelper');
const { buildImageApiRequestUrl } = require('../../utils/imageApiHelper');
const log = require('../../utils/logger-styled');

const DEFAULT_SIZE = 'square';

function truncate(text, maxLength = 220) {
    const value = String(text || '').trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

function parsePrefixArgs(args) {
    const result = {
        prompt: '',
        negative: '',
        style: '',
        size: DEFAULT_SIZE,
        model: ''
    };

    const promptParts = [];

    for (const arg of args) {
        if (arg.startsWith('--negative=')) {
            result.negative = arg.slice('--negative='.length).trim();
            continue;
        }
        if (arg.startsWith('--style=')) {
            result.style = arg.slice('--style='.length).trim();
            continue;
        }
        if (arg.startsWith('--size=')) {
            result.size = arg.slice('--size='.length).trim().toLowerCase() || DEFAULT_SIZE;
            continue;
        }
        if (arg.startsWith('--model=')) {
            result.model = arg.slice('--model='.length).trim();
            continue;
        }

        promptParts.push(arg);
    }

    result.prompt = promptParts.join(' ').trim();
    return result;
}

function normalizeSize(size) {
    const value = String(size || '').toLowerCase();
    return ['square', 'portrait', 'landscape'].includes(value) ? value : DEFAULT_SIZE;
}

function buildImagineContainer(options) {
    const lines = [
        '# <:Image:1473039533112033508> AI Image Generated',
        '',
        `**Prompt:** ${truncate(options.prompt)}`,
        `**Size:** ${options.size}`
    ];

    if (options.style) {
        lines.push(`**Style:** ${truncate(options.style, 120)}`);
    }

    if (options.negative) {
        lines.push(`**Negative Prompt:** ${truncate(options.negative, 120)}`);
    }

    if (options.model) {
        lines.push(`**Model:** ${truncate(options.model, 80)}`);
    }

    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(lines.join('\n'))
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://imagine.png')
            )
        );
}

function buildImagineApiUrl(options) {
    return buildImageApiRequestUrl('imagine', {
        prompt: options.prompt,
        negative: options.negative,
        style: options.style,
        size: options.size,
        model: options.model
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imagine')
        .setDescription('Generate an AI image from a prompt')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('Describe the image you want to generate')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('negative')
                .setDescription('Things to avoid in the image')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('style')
                .setDescription('Optional style, e.g. cinematic, anime, realistic')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('size')
                .setDescription('Image aspect preset')
                .setRequired(false)
                .addChoices(
                    { name: 'Square', value: 'square' },
                    { name: 'Portrait', value: 'portrait' },
                    { name: 'Landscape', value: 'landscape' }
                )
        )
        .addStringOption(option =>
            option.setName('model')
                .setDescription('Optional image model name for your API')
                .setRequired(false)
        ),
    prefix: 'imagine',
    name: 'imagine',
    description: 'Generate an AI image from a prompt',
    usage: 'imagine <prompt> [--style=cinematic] [--size=square] [--negative=blurry] [--model=model-name]',
    category: 'image',
    aliases: ['imggen', 'aiimage', 'generateimage'],

    async execute(interaction) {
        if (!isImageApiConfigured()) {
            return interaction.reply({ content: getUnavailableMessage(), flags: MessageFlags.Ephemeral });
        }

        const prompt = interaction.options.getString('prompt', true).trim();
        const negative = interaction.options.getString('negative')?.trim() || '';
        const style = interaction.options.getString('style')?.trim() || '';
        const size = normalizeSize(interaction.options.getString('size'));
        const model = interaction.options.getString('model')?.trim() || '';

        if (!prompt) {
            const container = buildErrorResponse('Missing Prompt', 'Please provide a prompt for the image you want to generate.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        try {
            const apiUrl = buildImagineApiUrl({ prompt, negative, style, size, model });
            if (!apiUrl) {
                return interaction.editReply({ content: getUnavailableMessage() });
            }

            const attachment = new AttachmentBuilder(apiUrl, { name: 'imagine.png' });
            const container = buildImagineContainer({ prompt, negative, style, size, model });
            await interaction.editReply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            log.error('[IMAGE] imagine error:', error.message);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate the image. Check your image API configuration and try again.' });
        }
    },

    async executePrefix(message, args) {
        if (!isImageApiConfigured()) {
            return message.reply(getUnavailableMessage());
        }

        const parsed = parsePrefixArgs(args);
        parsed.size = normalizeSize(parsed.size);

        if (!parsed.prompt) {
            const container = buildErrorResponse(
                'Missing Prompt',
                'Please provide a prompt for the image you want to generate.',
                '**Example:** `imagine futuristic cyberpunk city at sunset --style=cinematic --size=landscape`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const apiUrl = buildImagineApiUrl(parsed);
            if (!apiUrl) {
                return message.reply(getUnavailableMessage());
            }

            const attachment = new AttachmentBuilder(apiUrl, { name: 'imagine.png' });
            const container = buildImagineContainer(parsed);
            await message.reply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            log.error('[IMAGE] imagine error:', error.message);
            await message.reply('<:Cancel:1473037949187657818> Failed to generate the image. Check your image API configuration and try again.');
        }
    }
};