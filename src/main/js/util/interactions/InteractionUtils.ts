import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    MessageComponentInteraction,
    TextChannel
} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {BotConfig} from '../../bot/config/BotConfig';
import {DataHandlers} from '../data/DataHandlers';
import {Replies} from './Replies';
import {LogDebug} from '../logging/LogDebug';
import moment from 'moment';
import {Queue} from './Queue';
import {GuildData} from '../../bot/data/global/GuildData';

/**
 * {@link InteractionUtils InteractionUtils.ts}
 *
 * Functions needed by many interactions.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class InteractionUtils {
    /**
     * Executes a called subcommand if it exists
     *
     * @param interaction - An interaction that could've called a subcommand
     */
    public static async executeSubcommand(interaction: ChatInputCommandInteraction | AutocompleteInteraction) {
        const subcommand = BoarBotApp.getBot().getSubcommands().get(interaction.options.getSubcommand());

        if (!subcommand) return;

        const exports = require(subcommand.data.path);
        const commandClass = new exports.default();

        if (interaction.isAutocomplete()) {
            try {
                await commandClass.autocomplete(interaction);
            } catch (err: unknown) {
                await LogDebug.handleError(err, interaction);
            }
        } else if (interaction.isChatInputCommand()) {
            try {
                await commandClass.execute(interaction);
            } catch (err: unknown) {
                await LogDebug.handleError(err, interaction);
            }
        }
    }

    /**
     * Handles the beginning of most command interactions to prevent duplicate code
     *
     * @param config - Used to get the string to reply with
     * @param interaction - Interaction to reply to
     * @return Guild data parsed from JSON
     */
    public static async handleStart(
        interaction: ChatInputCommandInteraction,
        config: BotConfig
    ): Promise<GuildData | undefined> {
        if (!interaction.guild || !interaction.channel) return;

        const guildData = await DataHandlers.getGuildData(interaction.guild.id, interaction);
        if (!guildData) return;

        if (!guildData.fullySetup) {
            await Replies.currentConfigReply(interaction, config);
            return;
        }

        const acceptableChannels: string[] = [...guildData.channels];

        if (!acceptableChannels.includes(interaction.channel.id)) {
            await Replies.wrongChannelReply(interaction, config);
            return;
        }

        return guildData;
    }

    /**
     * Handles response to a user running an interaction while banned
     *
     * @param interaction - Interaction to reply to
     * @param config - Used to get the string to reply with
     * @param forceFollowup - Whether the reply should be a followup
     * @return Whether user is banned
     */
    public static async handleBanned(
        interaction: ChatInputCommandInteraction | MessageComponentInteraction, config: BotConfig, forceFollowup = false
    ): Promise<boolean> {
        const bannedUserData = DataHandlers.getGlobalData(
            DataHandlers.GlobalFile.BannedUsers
        ) as Record<string, number>;
        const unbanTime = bannedUserData[interaction.user.id];

        if (unbanTime && unbanTime > Date.now()) {
            await Replies.handleReply(
                interaction,
                config.stringConfig.bannedString.replace('%@', moment(unbanTime).fromNow()),
                config.colorConfig.error,
                undefined,
                undefined,
                forceFollowup
            );

            return true;
        } else if (unbanTime && unbanTime <= Date.now()) {
            await Queue.addQueue(async () => {
                try {
                    const bannedUserData = DataHandlers.getGlobalData(
                        DataHandlers.GlobalFile.BannedUsers
                    ) as Record<string, number>;
                    delete bannedUserData[interaction.user.id];
                    DataHandlers.saveGlobalData(bannedUserData, DataHandlers.GlobalFile.BannedUsers);
                } catch (err: unknown) {
                    await LogDebug.handleError(err, interaction);
                }
            }, 'unban_user' + interaction.id + 'global').catch((err: unknown) => {
                throw err;
            });
        }

        return false;
    }

    /**
     * Gets a text channel from ID
     *
     * @param channelID - ID of channel
     */
    public static async getTextChannel(channelID: string): Promise<TextChannel | undefined> {
        let channel: TextChannel;

        try {
            channel = await BoarBotApp.getBot().getClient().channels.fetch(channelID) as TextChannel;
        } catch {
            LogDebug.handleError(
                'Bot cannot find the channel.\nIs the channel ID \'' + channelID +
                '\' correct? Does the bot have view channel permissions?', undefined, false
            );
            return;
        }

        const memberMe = channel.guild.members.me;
        if (!memberMe) {
            LogDebug.handleError('Bot doesn\'t exist in the server the channel is in.', undefined, false);
            return;
        }

        const memberMePerms = memberMe.permissions.toArray();
        if (!memberMePerms.includes('SendMessages')) {
            LogDebug.handleError('Bot doesn\'t have permission to send messages to channel.', undefined, false);
            return;
        }

        return channel;
    }

    /**
     * Converts a boolean or undefined type to a true boolean
     *
     * @param val - Value to convert to true boolean
     */
    public static toBoolean(val: boolean | undefined): boolean {
        return val === undefined
            ? false
            : val;
    }
}
