import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Events,
    Interaction,
} from 'discord.js';
import {Listener} from '../api/listeners/Listener';
import {BotConfig} from '../bot/config/BotConfig';
import {BoarBotApp} from '../BoarBotApp';
import {LogDebug} from '../util/logging/LogDebug';
import {Cooldown} from '../util/interactions/Cooldown';
import {Replies} from '../util/interactions/Replies';
import {PermissionUtils} from '../util/discord/PermissionUtils';
import {CustomEmbedGenerator} from '../util/generators/CustomEmbedGenerator';
import {Queue} from '../util/interactions/Queue';
import {DataHandlers} from '../util/data/DataHandlers';

/**
 * {@link InteractionListener InteractionListener.ts}
 *
 * An event that runs once the bot detects an
 * interaction.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class InteractionListener implements Listener {
    public readonly eventName = Events.InteractionCreate;
    private interaction = null as ChatInputCommandInteraction | AutocompleteInteraction | null;
    private config = {} as BotConfig;

    /**
     * Executes the called subcommand group if it exists
     *
     * @param interaction - The interaction to handle
     */
    public async execute(interaction: Interaction): Promise<void> {
        if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;

        this.config = BoarBotApp.getBot().getConfig();
        this.interaction = interaction;

        try {
            if (!await this.handleMaintenance()) return;
        } catch (err: unknown) {
            await LogDebug.handleError(err, interaction);
            return;
        }

        const command = BoarBotApp.getBot().getCommands().get(interaction.commandName);

        if (command) {
            LogDebug.log('Started interaction', this.config, interaction);

            if (interaction.isChatInputCommand()) {
                let onCooldown: boolean;

                let wipeUsers = DataHandlers.getGlobalData(
                    DataHandlers.GlobalFile.WipeUsers
                ) as Record<string, number>;

                if (wipeUsers[interaction.user.id] !== undefined) {
                    await Queue.addQueue(async () => {
                        wipeUsers = DataHandlers.getGlobalData(
                            DataHandlers.GlobalFile.WipeUsers
                        ) as Record<string, number>;

                        delete wipeUsers[interaction.user.id];

                        DataHandlers.saveGlobalData(wipeUsers, DataHandlers.GlobalFile.WipeUsers);
                    }, 'undo_wipe' + interaction.id + 'global');
                }

                try {
                    onCooldown = await Cooldown.handleCooldown(interaction as ChatInputCommandInteraction, this.config);
                } catch (err: unknown) {
                    await LogDebug.handleError(err, interaction);
                    return;
                }

                if (onCooldown) return;
            }

            try {
                await command.execute(interaction);

                const missingPerms = interaction.isChatInputCommand() &&
                    (!PermissionUtils.hasPerm(interaction.guild, 'ViewChannel') ||
                    !PermissionUtils.hasPerm(interaction.guild, 'SendMessages') ||
                    !PermissionUtils.hasPerm(interaction.guild, 'AttachFiles'));

                if (missingPerms && Math.random() < .01) {
                    await LogDebug.sleep(60000);

                    if (interaction.ephemeral) return;

                    await interaction.followUp({
                        files: [
                            await CustomEmbedGenerator.makeEmbed(
                                this.config.stringConfig.eventsDisabled, this.config.colorConfig.error, this.config
                            )
                        ]
                    });
                }
            } catch (err: unknown) {
                await LogDebug.handleError(err, interaction);
                return;
            }

            LogDebug.log('End of interaction', this.config, interaction);
        }
    }

    /**
     * Stops interaction from going through if maintenance occurring
     *
     * @private
     */
    private async handleMaintenance(): Promise<boolean> {
        if (!this.interaction || !this.config) return false;

        const strConfig = this.config.stringConfig;

        const inMaintenance = this.config.maintenanceMode && !this.interaction.isAutocomplete()
            && !this.config.devs.includes(this.interaction.user.id);

        if (inMaintenance) {
            await Replies.handleReply(
                this.interaction as ChatInputCommandInteraction,
                strConfig.maintenance,
                this.config.colorConfig.maintenance
            );
            return false;
        }

        return true;
    }
}
