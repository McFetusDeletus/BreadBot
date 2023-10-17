import {
    ActionRowBuilder, ButtonBuilder,
    ButtonInteraction,
    ChatInputCommandInteraction,
    InteractionCollector,
    StringSelectMenuBuilder, StringSelectMenuInteraction, TextChannel
} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {LogDebug} from '../../util/logging/LogDebug';
import {Replies} from '../../util/interactions/Replies';
import {CollectorUtils} from '../../util/discord/CollectorUtils';
import {ComponentUtils} from '../../util/discord/ComponentUtils';
import {Queue} from '../../util/interactions/Queue';
import {GuildData} from '../../bot/data/global/GuildData';
import {DataHandlers} from "../../util/data/DataHandlers";

/**
 * {@link SelfWipeSubcommand SelfWipeSubcommand.ts}
 *
 * Allows a user to delete all data tied to their account.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class SelfWipeSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.selfWipe;
    private guildData?: GuildData;
    private firstInter = {} as ChatInputCommandInteraction;
    private canDelete = false;
    private baseRows = [] as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    private collector = {} as InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>;
    private hasStopped = false;
    public readonly data = { name: this.subcommandInfo.name, path: __filename };

    /**
     * Handles the functionality for this subcommand
     *
     * @param interaction - The interaction that called the subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        this.guildData = await InteractionUtils.handleStart(interaction, this.config);
        if (!this.guildData) return;

        await interaction.deferReply({ ephemeral: true });
        this.firstInter = interaction;

        // Stop prior collector that user may have open still to reduce number of listeners
        if (CollectorUtils.selfWipeCollectors[interaction.user.id]) {
            const oldCollector = CollectorUtils.selfWipeCollectors[interaction.user.id];

            setTimeout(() => {
                oldCollector.stop(CollectorUtils.Reasons.Overridden)
            }, 1000);
        }

        this.collector = await CollectorUtils.createCollector(
            interaction.channel as TextChannel, interaction.id, this.config.numberConfig
        );

        CollectorUtils.selfWipeCollectors[interaction.user.id] = this.collector;

        this.collector.on('collect', async (inter: ButtonInteraction) => {
            await this.handleCollect(inter);
        });

        this.collector.once('end', async (_, reason: string) => {
            await this.handleEndCollect(reason);
        });

        this.showSelfWipe(true);
    }

    /**
     * Handles collecting button interactions
     *
     * @param inter - The button interaction
     * @private
     */
    private async handleCollect(inter: ButtonInteraction): Promise<void> {
        try {
            const selfWipeRowConfig = this.config.commandConfigs.boar.selfWipe.componentFields;
            const selfWipeComponents = {
                delete: selfWipeRowConfig[0][0].components[0],
                cancel: selfWipeRowConfig[0][0].components[1]
            };

            await inter.deferUpdate();

            switch (inter.customId.split('|')[0]) {
                // User wants to delete their data
                case selfWipeComponents.delete.customId: {
                    this.showSelfWipe();
                    break;
                }

                // User wants to cancel deletion process
                case selfWipeComponents.cancel.customId: {
                    this.collector.stop();
                    break;
                }
            }
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }
    }

    /**
     * Handles when the collection for navigating through collection is finished
     *
     * @param reason - Why the collection ended
     * @private
     */
    private async handleEndCollect(reason: string): Promise<void> {
        try {
            this.hasStopped = true;

            if (reason !== CollectorUtils.Reasons.Overridden) {
                delete CollectorUtils.selfWipeCollectors[this.firstInter.user.id];
            }

            LogDebug.log('Ended collection with reason: ' + reason, this.config, this.firstInter);

            if (reason === CollectorUtils.Reasons.Error) {
                await Replies.handleReply(
                    this.firstInter, this.config.stringConfig.setupError, this.config.colorConfig.error
                );
            }

            if (reason === CollectorUtils.Reasons.Finished) {
                await Queue.addQueue(async () => {
                    const wipeUsers = DataHandlers.getGlobalData(
                        DataHandlers.GlobalFile.WipeUsers
                    ) as Record<string, number>;

                    wipeUsers[this.firstInter.user.id] = Date.now() + 60000;

                    DataHandlers.saveGlobalData(wipeUsers, DataHandlers.GlobalFile.WipeUsers);
                }, 'self_wipe' + this.firstInter.id + 'global').catch((err: unknown) => {
                    throw err;
                });

                await this.firstInter.editReply({
                    content: this.config.stringConfig.deletedData,
                    components: []
                });

                return;
            }

            await this.firstInter.editReply({
                content: this.config.stringConfig.cancelDelete,
                components: []
            });
        } catch (err: unknown) {
            await LogDebug.handleError(err, this.firstInter);
        }
    }

    /**
     * Updates the deletion process message and buttons
     *
     * @private
     */
    private async showSelfWipe(firstRun = false) {
        try {
            this.disableButtons();

            if (this.canDelete) {
                this.collector.stop(CollectorUtils.Reasons.Finished);
                return;
            }

            if (firstRun) {
                this.initButtons();
            } else {
                this.canDelete = true;
            }

            const contentStr = firstRun
                ? this.config.stringConfig.deleteMsgOne
                : this.config.stringConfig.deleteMsgTwo;

            this.baseRows[0].components[1].setDisabled(false);

            if (this.hasStopped) return;

            await this.firstInter.editReply({ content: contentStr, components: this.baseRows });

            // Waits five seconds before enabling delete button
            setTimeout(async () => {
                if (this.collector.ended) return;

                this.baseRows[0].components[0].setDisabled(false);
                await this.firstInter.editReply({ content: contentStr, components: this.baseRows }).catch(() => {});
            }, 5000);
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }
    }

    /**
     * Creates the buttons and rows used for collection by adding information to IDs
     *
     * @private
     */
    private initButtons(): void {
        const selfWipeFieldConfigs = this.config.commandConfigs.boar.selfWipe.componentFields;
        const newRows = ComponentUtils.makeRows(selfWipeFieldConfigs[0]);

        ComponentUtils.addToIDs(selfWipeFieldConfigs[0], newRows, this.firstInter.id, this.firstInter.user.id);

        this.baseRows = newRows;
    }

    /**
     * Disables all buttons
     *
     * @private
     */
    private disableButtons(): void {
        for (const row of this.baseRows) {
            for (const component of row.components) {
                component.setDisabled(true);
            }
        }
    }
}
