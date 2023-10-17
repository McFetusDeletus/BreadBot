import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Client,
    Events,
    Interaction,
    InteractionCollector,
    MessageComponentInteraction,
    ModalBuilder,
    SelectMenuComponentOptionData,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextChannel,
    User
} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {DataHandlers} from '../../util/data/DataHandlers';
import {LeaderboardImageGenerator} from '../../util/generators/LeaderboardImageGenerator';
import {Replies} from '../../util/interactions/Replies';
import {CollectorUtils} from '../../util/discord/CollectorUtils';
import {ComponentUtils} from '../../util/discord/ComponentUtils';
import {LogDebug} from '../../util/logging/LogDebug';
import {BoarUser} from '../../util/boar/BoarUser';
import {Queue} from '../../util/interactions/Queue';
import {BoardData} from '../../bot/data/global/BoardData';
import {ChoicesConfig} from '../../bot/config/commands/ChoicesConfig';

enum Board {
    Bucks = 'bucks',
    Total = 'total',
    Uniques = 'uniques',
    UniquesSB = 'uniquesSB',
    Streak = 'streak',
    Attempts = 'attempts',
    TopAttempts = 'topAttempts',
    GiftsUsed = 'giftsUsed',
    Multiplier = 'multiplier',
    Fastest = 'fastest'
}

/**
 * {@link TopSubcommand TopSubcommand.ts}
 *
 * Used to see leaderboards that rank player stats
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class TopSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.top;
    private firstInter = {} as ChatInputCommandInteraction;
    private compInter = {} as MessageComponentInteraction;
    private imageGen = {} as LeaderboardImageGenerator;
    private leaderboardData = {} as Record<string, BoardData>;
    private curBoard = Board.Bucks;
    private curBoardData = [] as [string, [string, number]][];
    private curPage = 0;
    private maxPage = 0;
    private rows = [] as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    private timerVars = { timeUntilNextCollect: 0, updateTime: setTimeout(() => {}) };
    private modalShowing = {} as ModalBuilder;
    private curModalListener?: (submittedModal: Interaction) => Promise<void>;
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

        await interaction.deferReply();

        this.firstInter = interaction;

        // Leaderboard to start out in
        this.curBoard = interaction.options.getString(this.subcommandInfo.args[0].name) as Board | null ?? Board.Bucks;

        // Used to get the page of the board a user is on
        const userInput: User | null = interaction.options.getUser(this.subcommandInfo.args[1].name);

        // Used to get the page to start out on
        const pageInput: number = interaction.options.getInteger(this.subcommandInfo.args[2].name) ?? 1;

        this.leaderboardData = DataHandlers.getGlobalData(
            DataHandlers.GlobalFile.Leaderboards
        ) as Record<string, BoardData>;

        this.curBoardData = Object.entries(
            this.leaderboardData[this.curBoard].userData
        ) as [string, [string, number]][];

        if (this.curBoard !== Board.Fastest) {
            this.curBoardData.sort((a: [string, [string, number]], b: [string, [string, number]]) => {
                return b[1][1] - a[1][1];
            });
        } else {
            this.curBoardData.sort((a: [string, [string, number]], b: [string, [string, number]]) => {
                return a[1][1] - b[1][1];
            });
        }

        await this.doAthleteBadge();

        this.maxPage = Math.ceil(this.curBoardData.length / this.config.numberConfig.leaderboardNumPlayers) - 1;
        this.maxPage = Math.max(0, this.maxPage);

        if (userInput === null || this.getUserIndex(userInput.id) === -1) {
            this.curPage = Math.max(Math.min(pageInput-1, this.maxPage), 0);
        } else {
            this.curPage = Math.max(
                Math.ceil(this.getUserIndex(userInput.id) / this.config.numberConfig.leaderboardNumPlayers) - 1, 0
            );
        }

        // Stop prior collector that user may have open still to reduce number of listeners
        if (CollectorUtils.topCollectors[interaction.user.id]) {
            const oldCollector = CollectorUtils.topCollectors[interaction.user.id];

            setTimeout(() => {
                oldCollector.stop(CollectorUtils.Reasons.Expired);
            }, 1000);
        }

        this.collector = await CollectorUtils.createCollector(
            interaction.channel as TextChannel, interaction.id, this.config.numberConfig
        );

        CollectorUtils.topCollectors[interaction.user.id] = this.collector;

        this.collector.on('collect', async (inter: ButtonInteraction | StringSelectMenuInteraction) => {
            await this.handleCollect(inter);
        });

        this.collector.once('end', async (_, reason: string) => {
            await this.handleEndCollect(reason);
        });

        this.imageGen = new LeaderboardImageGenerator(this.curBoardData, this.curBoard, this.config);
        await this.showLeaderboard(true);

        if (userInput && this.getUserIndex(userInput.id) === -1) {
            // Tells user the user they searched for isn't in the board they searched in
            await Replies.handleReply(
                interaction,
                this.config.stringConfig.notInBoard,
                this.config.colorConfig.error,
                undefined,
                undefined,
                true
            );
        }
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

            this.compInter = inter;

            LogDebug.log(
                `${inter.customId.split('|')[0]} on page ${this.curPage} in board ${this.curBoard}`,
                this.config, this.firstInter
            );

            const leaderRowConfig = this.config.commandConfigs.boar.top.componentFields;
            const leaderComponents = {
                leftPage: leaderRowConfig[0][0].components[0],
                inputPage: leaderRowConfig[0][0].components[1],
                rightPage: leaderRowConfig[0][0].components[2],
                refresh: leaderRowConfig[0][0].components[3],
                boardSelect: leaderRowConfig[0][1].components[0]
            };

            // User wants to input a page manually
            if (inter.customId.startsWith(leaderComponents.inputPage.customId)) {
                await this.modalHandle(inter);
                clearInterval(this.timerVars.updateTime);
                return;
            }

            await inter.deferUpdate();

            switch (inter.customId.split('|')[0]) {
                // User wants to go to previous page
                case leaderComponents.leftPage.customId: {
                    this.curPage--;
                    break;
                }

                // User wants to go to the next page
                case leaderComponents.rightPage.customId: {
                    this.curPage++;
                    break;
                }

                // User wants to go to refresh data
                case leaderComponents.refresh.customId: {
                    this.leaderboardData = DataHandlers.getGlobalData(
                        DataHandlers.GlobalFile.Leaderboards
                    ) as Record<string, BoardData>;

                    this.curBoardData = Object.entries(
                        this.leaderboardData[this.curBoard].userData
                    ) as [string, [string, number]][];

                    if (this.curBoard !== Board.Fastest) {
                        this.curBoardData.sort((a: [string, [string, number]], b: [string, [string, number]]) => {
                            return b[1][1] - a[1][1];
                        });
                    } else {
                        this.curBoardData.sort((a: [string, [string, number]], b: [string, [string, number]]) => {
                            return a[1][1] - b[1][1];
                        });
                    }

                    await this.doAthleteBadge();
                    this.maxPage = Math.ceil(
                        this.curBoardData.length / this.config.numberConfig.leaderboardNumPlayers
                    ) - 1;
                    await this.imageGen.updateInfo(this.curBoardData, this.curBoard, this.config);

                    break;
                }

                // User wants to change the boars they're viewing
                case leaderComponents.boardSelect.customId: {
                    this.curBoard = (this.compInter as StringSelectMenuInteraction).values[0] as Board;
                    this.curBoardData = Object.entries(
                        this.leaderboardData[this.curBoard].userData
                    ) as [string, [string, number]][];

                    if (this.curBoard !== Board.Fastest) {
                        this.curBoardData.sort((a: [string, [string, number]], b: [string, [string, number]]) => {
                            return b[1][1] - a[1][1];
                        });
                    } else {
                        this.curBoardData.sort((a: [string, [string, number]], b: [string, [string, number]]) => {
                            return a[1][1] - b[1][1];
                        });
                    }

                    await this.doAthleteBadge();
                    this.maxPage = Math.ceil(
                        this.curBoardData.length / this.config.numberConfig.leaderboardNumPlayers
                    ) - 1;
                    await this.imageGen.updateInfo(this.curBoardData, this.curBoard, this.config);
                    this.curPage = 0;

                    break;
                }
            }

            this.curPage = Math.max(Math.min(this.curPage, this.maxPage-1), 0);

            await this.showLeaderboard();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        clearInterval(this.timerVars.updateTime);
    }

    /**
     * Handles when the collection for navigating through leaderboard menu
     *
     * @param reason - Why the collection ended
     * @private
     */
    private async handleEndCollect(reason: string): Promise<void> {
        try {
            this.hasStopped = true;
            delete CollectorUtils.topCollectors[this.firstInter.user.id];

            LogDebug.log('Ended collection with reason: ' + reason, this.config, this.firstInter);

            clearInterval(this.timerVars.updateTime);
            this.endModalListener(this.firstInter.client);

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
     * Sends the modal that gets page input
     *
     * @param inter - Used to show the modal and create/remove listener
     * @private
     */
    private async modalHandle(inter: MessageComponentInteraction): Promise<void> {
        const modals = this.config.commandConfigs.boar.top.modals;

        this.modalShowing = new ModalBuilder(modals[0]);
        this.modalShowing.setCustomId(modals[0].customId + '|' + inter.id);
        await inter.showModal(this.modalShowing);
        this.curModalListener = this.modalListener;

        inter.client.on(Events.InteractionCreate, this.curModalListener);
    }

    /**
     * Handles page input that was input in modal
     *
     * @param submittedModal - The interaction to respond to
     * @private
     */
    private modalListener = async (submittedModal: Interaction): Promise<void> => {
        try  {
            if (submittedModal.user.id !== this.firstInter.user.id) return;

            const isUserComponentInter = submittedModal.isMessageComponent() &&
                submittedModal.customId.endsWith(this.firstInter.id + '|' + this.firstInter.user.id);
            const maintenanceBlock = this.config.maintenanceMode && !this.config.devs.includes(this.compInter.user.id);

            if (isUserComponentInter || maintenanceBlock) {
                this.endModalListener(submittedModal.client);
                return;
            }

            // Updates the cooldown to interact again
            const canInteract = await CollectorUtils.canInteract(this.timerVars, Date.now());

            if (!canInteract) {
                this.endModalListener(submittedModal.client);
                return;
            }

            const invalidSubmittedModal = !submittedModal.isModalSubmit() || this.collector.ended ||
                !submittedModal.guild || submittedModal.customId !== this.modalShowing.data.custom_id;

            if (invalidSubmittedModal) {
                this.endModalListener(submittedModal.client);
                return;
            }

            await submittedModal.deferUpdate();

            const submittedPage = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input value: ` + submittedPage, this.config, this.firstInter
            );

            let pageVal = 1;
            if (!Number.isNaN(parseInt(submittedPage))) {
                pageVal = parseInt(submittedPage);
            }

            this.curPage = Math.max(Math.min(pageVal-1, this.maxPage), 0);

            await this.showLeaderboard();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Ends the current modal listener that's active
     *
     * @param client - Used to remove the listener
     * @private
     */
    private endModalListener(client: Client): void {
        clearInterval(this.timerVars.updateTime);
        if (this.curModalListener) {
            client.removeListener(Events.InteractionCreate, this.curModalListener);
            this.curModalListener = undefined;
        }
    }

    /**
     * Displays the leaderboard image and modifies button states
     *
     * @private
     */
    private async showLeaderboard(firstRun = false): Promise<void> {
        try {
            if (firstRun) {
                this.initButtons();
            }

            for (const row of this.rows) {
                for (const component of row.components) {
                    component.setDisabled(true);
                }
            }

            // Enables back button if not on first page
            this.rows[0].components[0].setDisabled(this.curPage === 0);

            // Enables search button if there's more than one page
            this.rows[0].components[1].setDisabled(this.maxPage === 0);

            // Enables next button if not on first page
            this.rows[0].components[2].setDisabled(this.curPage === this.maxPage);

            // Enables refresh button
            this.rows[0].components[3].setDisabled(false);

            // Enables select menu for choosing leaderboard
            this.rows[1].components[0].setDisabled(false);

            if (this.hasStopped) return;

            await this.firstInter.editReply({
                files: [await this.imageGen.makeLeaderboardImage(this.curPage)],
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
        const leaderFieldConfigs = this.config.commandConfigs.boar.top.componentFields;
        const selectOptions = [] as SelectMenuComponentOptionData[];

        const choices = this.config.commandConfigs.boar.top.args[0].choices as ChoicesConfig[];

        for (const choice of choices) {
            selectOptions.push({
                label: choice.name,
                value: choice.value as string
            });
        }

        for (let i=0; i<leaderFieldConfigs.length; i++) {
            const newRows = ComponentUtils.makeRows(leaderFieldConfigs[i]);

            ComponentUtils.addToIDs(
                leaderFieldConfigs[i], newRows, this.firstInter.id, this.firstInter.user.id, selectOptions
            );

            this.rows = newRows;
        }
    }

    /**
     * Gets the index position of user on leaderboard
     *
     * @param idInput - User ID input to look for
     * @private
     */
    private getUserIndex(idInput: string): number {
        let i = 1;

        for (const [id] of this.curBoardData) {
            if (id === idInput) return i;

            i++;
        }

        return -1;
    }

    /**
     * Attempts to give the top user of the current board the athlete badge
     *
     * @private
     */
    private async doAthleteBadge(): Promise<void> {
        const newTopUserID = this.curBoardData.length > 0
            ? this.curBoardData[0][0]
            : undefined;
        const oldTopUserID = this.leaderboardData[this.curBoard].topUser;

        if (newTopUserID && newTopUserID !== oldTopUserID) {
            try {
                const newTopUser = this.firstInter.client.users.cache.get(newTopUserID);

                if (!newTopUser) return;

                const newTopBoarUser = new BoarUser(newTopUser);
                await newTopBoarUser.addBadge('athlete', this.firstInter);

                await Queue.addQueue(async () => {
                    const boardsData = DataHandlers.getGlobalData(
                        DataHandlers.GlobalFile.Leaderboards
                    ) as Record<string, BoardData>;

                    boardsData[this.curBoard].topUser = newTopUserID;

                    DataHandlers.saveGlobalData(boardsData, DataHandlers.GlobalFile.Leaderboards);
                }, 'set_top' + newTopUserID + 'global').catch((err: unknown) => {
                    throw err;
                });
            } catch {}
        }
    }
}
