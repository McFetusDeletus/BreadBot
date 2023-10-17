import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ChatInputCommandInteraction,
    InteractionCollector,
    SelectMenuComponentOptionData,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextChannel
} from 'discord.js';
import fs from 'fs';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {CollectorUtils} from '../../util/discord/CollectorUtils';
import {ComponentUtils} from '../../util/discord/ComponentUtils';
import {LogDebug} from '../../util/logging/LogDebug';
import {Replies} from '../../util/interactions/Replies';
import {ChoicesConfig} from '../../bot/config/commands/ChoicesConfig';

enum Area {
    General = 0,
    Powerups = 1,
    Market = 2,
    BadgeBoar = 3
}

/**
 * {@link HelpSubcommand HelpSubcommand.ts}
 *
 * Used to see information about the bot.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class HelpSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.help;
    private firstInter = {} as ChatInputCommandInteraction;
    private helpImages = [] as string[][];
    private curArea = Area.General;
    private curPage = 0;
    private rows = [] as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    private timerVars = { timeUntilNextCollect: 0, updateTime: setTimeout(() => {}) };
    private collector = {} as InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>;
    private hasStopped = false;
    public readonly data = { name: this.subcommandInfo.name, path: __filename };

    /**
     * Handles the functionality for this subcommand
     *
     * @param interaction - The interaction that called the subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const guildData = await InteractionUtils.handleStart(interaction, this.config);
        if (!guildData) return;

        await interaction.deferReply({ ephemeral: true });

        this.firstInter = interaction;

        const pathConfig = this.config.pathConfig;
        const otherAssets = pathConfig.otherAssets;

        this.helpImages = [
            [otherAssets + pathConfig.helpGeneral1, otherAssets + pathConfig.helpGeneral2],
            [otherAssets + pathConfig.helpPowerup1, otherAssets + pathConfig.helpPowerup2],
            [otherAssets + pathConfig.helpMarket1, otherAssets + pathConfig.helpMarket2],
            [
                otherAssets + pathConfig.helpBadgeBoar1,
                otherAssets + pathConfig.helpBadgeBoar2,
                otherAssets + pathConfig.helpBadgeBoar3
            ]
        ];

        // The help area to start out in
        this.curArea = interaction.options.getInteger(this.subcommandInfo.args[0].name) ?? Area.General;

        // The page to start out on
        this.curPage = interaction.options.getInteger(this.subcommandInfo.args[1].name) ?? 0;

        this.curPage = Math.max(0, this.curPage);
        this.curPage = Math.min(this.helpImages[this.curArea].length-1, this.curPage);

        // Stop prior collector that user may have open still to reduce number of listeners
        if (CollectorUtils.helpCollectors[interaction.user.id]) {
            const oldCollector = CollectorUtils.helpCollectors[interaction.user.id];

            setTimeout(() => {
                oldCollector.stop(CollectorUtils.Reasons.Expired)
            }, 1000);
        }

        this.collector = await CollectorUtils.createCollector(
            interaction.channel as TextChannel, interaction.id, this.config.numberConfig
        );

        CollectorUtils.helpCollectors[interaction.user.id] = this.collector;

        this.collector.on('collect', async (inter: ButtonInteraction | StringSelectMenuInteraction) => {
            await this.handleCollect(inter);
        });

        this.collector.once('end', async (_, reason: string) => {
            await this.handleEndCollect(reason);
        });

        await this.showHelp(true);
    }

    /**
     * Handles collecting button and select menu interactions
     *
     * @param inter - The button interaction
     * @private
     */
    private async handleCollect(inter: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
        try {
            const canInteract = await CollectorUtils.canInteract(this.timerVars, Date.now(), inter);
            if (!canInteract) return;

            if (!inter.isMessageComponent()) return;

            if (!inter.customId.includes(this.firstInter.id)) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }

            LogDebug.log(
                `${inter.customId.split('|')[0]} on page ${this.curPage} in area ${this.curArea}`,
                this.config,
                this.firstInter
            );

            const helpRowConfig = this.config.commandConfigs.boar.help.componentFields;
            const helpComponents = {
                leftPage: helpRowConfig[0][0].components[0],
                rightPage: helpRowConfig[0][0].components[1],
                areaSelect: helpRowConfig[0][1].components[0]
            };

            await inter.deferUpdate();

            switch (inter.customId.split('|')[0]) {
                // User wants to go to previous page
                case helpComponents.leftPage.customId: {
                    this.curPage--;
                    break;
                }

                // User wants to go to the next page
                case helpComponents.rightPage.customId: {
                    this.curPage++;
                    break;
                }

                // User wants to change what area of help to view
                case helpComponents.areaSelect.customId: {
                    this.curArea = Number.parseInt((inter as StringSelectMenuInteraction).values[0]) as Area;
                    this.curPage = 0;
                    break;
                }
            }

            await this.showHelp();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        clearInterval(this.timerVars.updateTime);
    }

    /**
     * Handles when the collection for navigating through help menu is finished
     *
     * @param reason - Why the collection ended
     * @private
     */
    private async handleEndCollect(reason: string): Promise<void> {
        try {
            this.hasStopped = true;
            delete CollectorUtils.helpCollectors[this.firstInter.user.id];

            LogDebug.log('Ended collection with reason: ' + reason, this.config, this.firstInter);

            clearInterval(this.timerVars.updateTime);

            if (reason == CollectorUtils.Reasons.Error) {
                await Replies.handleReply(
                    this.firstInter, this.config.stringConfig.setupError, this.config.colorConfig.error
                );
            }

            // Clears components from interaction
            await this.firstInter.editReply({
                components: []
            });
        } catch (err: unknown) {
            await LogDebug.handleError(err, this.firstInter);
        }
    }

    /**
     * Displays the help image and modifies button states
     *
     * @param firstRun - Whether the running of the function is the first
     * @private
     */
    private async showHelp(firstRun = false): Promise<void> {
        try {
            if (firstRun) {
                this.initButtons();
            }

            // Disables all buttons
            for (const row of this.rows) {
                for (const component of row.components) {
                    component.setDisabled(true);
                }
            }

            // Enables back button if not on first page
            this.rows[0].components[0].setDisabled(this.curPage === 0);

            // Enables next button if not on last page of area
            this.rows[0].components[1].setDisabled(this.curPage === this.helpImages[this.curArea].length - 1);

            // Enables area select menu
            this.rows[1].components[0].setDisabled(false);

            if (this.hasStopped) return;

            // Edits the help image with the currently selected one
            await this.firstInter.editReply({
                files: [fs.readFileSync(this.helpImages[this.curArea][this.curPage])],
                components: this.rows
            });
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
        const helpFieldConfigs = this.config.commandConfigs.boar.help.componentFields;
        const selectOptions = [] as SelectMenuComponentOptionData[];

        const choices = this.config.commandConfigs.boar.help.args[0].choices as ChoicesConfig[];

        for (const choice of choices) {
            selectOptions.push({
                label: choice.name,
                value: choice.value.toString()
            });
        }

        for (let i=0; i<helpFieldConfigs.length; i++) {
            const newRows = ComponentUtils.makeRows(helpFieldConfigs[i]);

            ComponentUtils.addToIDs(
                helpFieldConfigs[i], newRows, this.firstInter.id, this.firstInter.user.id, selectOptions
            );

            this.rows = newRows;
        }
    }
}
