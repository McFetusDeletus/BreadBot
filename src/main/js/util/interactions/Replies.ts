import {
    ChatInputCommandInteraction,
    MessageComponentInteraction,
    ModalSubmitInteraction
} from 'discord.js';
import {BotConfig} from '../../bot/config/BotConfig';
import {LogDebug} from '../logging/LogDebug';
import {BoarBotApp} from '../../BoarBotApp';
import {CustomEmbedGenerator} from '../generators/CustomEmbedGenerator';

/**
 * {@link Replies Replies.ts}
 *
 * A collection of replies that are commonly
 * executed.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class Replies {
    /**
     * Handles when user sends command when config file is actively being configured for the first time
     *
     * @param config - Used to get the string to reply with
     * @param interaction - Interaction to reply to
     */
    public static async currentConfigReply(interaction: ChatInputCommandInteraction, config: BotConfig): Promise<void> {
        LogDebug.log('Tried to run command while setup being configured', config, interaction);
        await Replies.handleReply(interaction, config.stringConfig.doingSetup, config.colorConfig.error);
    }

    /**
     * Handles when user sends command in channel not chosen in config
     *
     * @param interaction - Interaction to reply to
     * @param config - Used to get the string to reply with
     */
    public static async wrongChannelReply(interaction: ChatInputCommandInteraction, config: BotConfig): Promise<void> {
        LogDebug.log('Used in the wrong channel', config, interaction);
        await Replies.handleReply(interaction, config.stringConfig.wrongChannel, config.colorConfig.error);
    }

    /**
     * Handles when user sends command they don't have permission for
     *
     * @param config - Used to get the string to reply with
     * @param interaction - Interaction to reply to
     */
    public static async noPermsReply(interaction: ChatInputCommandInteraction, config: BotConfig): Promise<void> {
        LogDebug.log('Not a developer', config, interaction);
        await Replies.handleReply(interaction, config.stringConfig.noPermission, config.colorConfig.error);
    }

    /**
     * Handles when user sends command that has a cooldown too fast
     *
     * @param config - Used to get the string to reply with
     * @param interaction - Interaction to reply to
     */
    public static async onCooldownReply(interaction: ChatInputCommandInteraction, config: BotConfig): Promise<void> {
        LogDebug.log('Currently on cooldown', config, interaction);
        await Replies.handleReply(interaction, config.stringConfig.onCooldown, config.colorConfig.error);
    }

    /**
     * Handles reply to all types of interaction states
     *
     * @param interaction - Interaction to reply to
     * @param content - Content of the reply
     * @param color - Color of the embed
     * @param coloredContents - Secondary text to color
     * @param secondaryColors - Secondary colors
     * @param forceFollowup - Forces interaction reply to be a followup
     * @param ephemeral
     */
    public static async handleReply(
        interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
        content: string,
        color: string = BoarBotApp.getBot().getConfig().colorConfig.font,
        coloredContents?: string[],
        secondaryColors?: string[],
        forceFollowup = false,
        ephemeral = true
    ): Promise<void> {
        const embedImage = await CustomEmbedGenerator.makeEmbed(
            content, color, BoarBotApp.getBot().getConfig(), coloredContents, secondaryColors
        );

        if (!forceFollowup && interaction.deferred) {
            await interaction.editReply({
                content: '',
                files: [embedImage],
                components: []
            });
        } else if (forceFollowup || interaction.replied) {
            await interaction.followUp({
                content: '',
                files: [embedImage],
                components: [],
                ephemeral: ephemeral
            });
        } else {
            await interaction.reply({
                content: '',
                files: [embedImage],
                components: [],
                ephemeral: ephemeral
            });
        }
    }
}
