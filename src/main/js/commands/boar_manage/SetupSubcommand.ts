import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType, ChatInputCommandInteraction, Client,
    Events, GuildBasedChannel, Interaction, InteractionCollector,
    ModalBuilder, PermissionsBitField, SelectMenuComponentOptionData,
    StringSelectMenuBuilder, StringSelectMenuInteraction, TextChannel,
    APISelectMenuOption
} from 'discord.js';
import fs from 'fs';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {DataHandlers} from '../../util/data/DataHandlers';
import {FormField} from '../../util/interactions/FormField';
import {FormatStrings} from '../../util/discord/FormatStrings';
import {LogDebug} from '../../util/logging/LogDebug';
import {CollectorUtils} from '../../util/discord/CollectorUtils';
import {ComponentUtils} from '../../util/discord/ComponentUtils';
import {Replies} from '../../util/interactions/Replies';
import {StringConfig} from '../../bot/config/StringConfig';
import {GuildData} from '../../bot/data/global/GuildData';
import {ComponentConfig} from "../../bot/config/commands/ComponentConfig";

/**
 * {@link SetupSubcommand SetupSubcommand.ts}
 *
 * Sets up the bot with style and channels.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class SetupSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boarManage.setup;
    private firstInter = {} as ChatInputCommandInteraction;
    private compInter = {} as StringSelectMenuInteraction | ButtonInteraction;
    private staticRows = [] as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    private setupFields = [] as FormField[];
    private guildDataPath = '';
    private guildData = {} as GuildData;
    private userResponses = { isSBServer: false, boarChannels: ['', '', ''] };
    private timerVars = { timeUntilNextCollect: 0, updateTime: setTimeout(() => {}) };
    private curField = 1;
    private modalShowing = {} as ModalBuilder;
    private curModalListener?: (submittedModal: Interaction) => Promise<void>;
    private collector = {} as InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>;
    public readonly data = { name: this.subcommandInfo.name, path: __filename };

    /**
     * Handles the functionality for this subcommand
     *
     * @param interaction - The interaction that called the subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild || !interaction.channel) return;
        
        await interaction.deferReply({ ephemeral: true });
        this.firstInter = interaction;

        this.config = BoarBotApp.getBot().getConfig();
        
        this.staticRows = this.getStaticRows();
        this.setupFields = this.getSetupFields(this.staticRows);

        this.guildDataPath = this.config.pathConfig.databaseFolder +
            this.config.pathConfig.guildDataFolder + interaction.guild.id + '.json';
        this.guildData = await DataHandlers.getGuildData(interaction.guild.id, interaction, true) as GuildData;

        // Stop prior collector that user may have open still to reduce number of listeners
        if (CollectorUtils.setupCollectors[interaction.user.id]) {
            const oldCollector = CollectorUtils.setupCollectors[interaction.user.id];

            setTimeout(() => {
                oldCollector.stop(CollectorUtils.Reasons.Overridden);
            }, 1000);
        }

        this.collector = await CollectorUtils.createCollector(
            interaction.channel as TextChannel, interaction.id, this.config.numberConfig
        ).catch(async (err: unknown) => {
            await DataHandlers.removeGuildFile(this.guildDataPath, this.guildData);
            throw err;
        });

        CollectorUtils.setupCollectors[interaction.user.id] = this.collector;

        this.collector.on('collect', async (inter: StringSelectMenuInteraction | ButtonInteraction) => {
            await this.handleCollect(inter);
        });

        this.collector.once('end', async (_, reason: string) => {
            await this.handleEndCollect(reason);
        });

        await this.setupFields[0].editReply(interaction).catch(async (err: unknown) => {
            await DataHandlers.removeGuildFile(this.guildDataPath, this.guildData);
            throw err;
        });
    }

    /**
     * Handles collecting and directing responses for those interactions
     *
     * @param inter - The interaction associated with a component interaction
     * @private
     */
    private async handleCollect(inter: StringSelectMenuInteraction | ButtonInteraction): Promise<void> {
        try {
            const canInteract = await CollectorUtils.canInteract(this.timerVars, Date.now(), inter);
            if (!canInteract) return;

            if (!inter.isMessageComponent()) return;

            if (!inter.customId.includes(this.firstInter.id)) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }

            this.compInter = inter;

            LogDebug.log(
                `${inter.customId.split('|')[0]} on field ${this.curField}`, this.config, this.firstInter
            );

            const setupRowConfig = this.config.commandConfigs.boarManage.setup.componentFields;
            const setupComponents = {
                boarSelect1: setupRowConfig[0][0].components[0],
                boarSelect2: setupRowConfig[0][1].components[0],
                boarSelect3: setupRowConfig[0][2].components[0],
                refreshBoar: setupRowConfig[0][3].components[0],
                findChannel: setupRowConfig[0][3].components[1],
                boarInfo: setupRowConfig[0][3].components[2],
                sbYes: setupRowConfig[1][0].components[0],
                sbNo: setupRowConfig[1][0].components[1],
                sbInfo: setupRowConfig[1][0].components[2],
                cancel: setupRowConfig[2][0].components[0],
                restart: setupRowConfig[2][0].components[1],
                next: setupRowConfig[2][0].components[2]
            };

            // User wants to input a channel via ID
            if (inter.customId.startsWith(setupComponents.findChannel.customId)) {
                await this.modalHandle(inter);
                clearInterval(this.timerVars.updateTime);
                return;
            }

            await inter.deferUpdate();

            switch (inter.customId.split('|')[0]) {
                // User wants to finish or go to next field
                case setupComponents.next.customId: {
                    if (this.curField === 2) {
                        this.collector.stop(CollectorUtils.Reasons.Finished);
                        break;
                    }

                    await this.doNext();
                    break;
                }

                // User wants to cancel setup
                case setupComponents.cancel.customId: {
                    this.collector.stop(CollectorUtils.Reasons.Cancelled);
                    break;
                }

                // User selects a boar channel
                case setupComponents.boarSelect1.customId:
                case setupComponents.boarSelect2.customId:
                case setupComponents.boarSelect3.customId: {
                    await this.doBoarSelect();
                    break;
                }

                // User wants to refresh a channel selection field or restart the setup process
                case setupComponents.refreshBoar.customId:
                case setupComponents.restart.customId: {
                    await this.doRefreshRestart(setupComponents);
                    break;
                }


                // User chooses if the server is an SB server or not
                case setupComponents.sbYes.customId:
                case setupComponents.sbNo.customId: {
                    await this.doSb(setupComponents);
                    break;
                }

                // User wants more information on boar channels
                case setupComponents.boarInfo.customId: {
                    await Replies.handleReply(
                        inter, this.config.stringConfig.setupInfoResponse1, undefined, undefined, undefined, true
                    );
                    break;
                }

                // User wants more information on SB boars
                case setupComponents.sbInfo.customId: {
                    await Replies.handleReply(
                        inter, this.config.stringConfig.setupInfoResponse2, undefined, undefined, undefined, true
                    );
                    break;
                }
            }
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        clearInterval(this.timerVars.updateTime);
    }

    /**
     * Handles when the user wants to go to the next field
     *
     * @private
     */
    private async doNext(): Promise<void> {
        const nextButton = this.staticRows[0].components[2] as ButtonBuilder;

        nextButton.setDisabled(true);
        nextButton.setStyle(ButtonStyle.Success);
        await this.setupFields[1].editReply(this.compInter);

        this.curField++;
    }

    /**
     * Handles when the user selects a boar channel
     *
     * @private
     */
    private async doBoarSelect(): Promise<void> {
        const selectInter = this.compInter as StringSelectMenuInteraction;

        // Gets index to change based on ending number in select menu ID
        const selectIndex = parseInt(this.compInter.customId.charAt(this.compInter.customId.lastIndexOf('_') + 1)) - 1;

        this.userResponses.boarChannels[selectIndex] = selectInter.values[0];

        // Gets the label of the chosen option
        const placeholder = selectInter.component.options.filter((option: APISelectMenuOption) => {
            return option.value === selectInter.values[0];
        })[0].label;

        // Refreshes all select menu options, changes placeholder, and tells user field is done
        await this.updateSelectField(placeholder, selectIndex);
    }

    /**
     * Handles when user would like to refresh the
     * select menus or restart completely
     *
     * @param setupComponents - Used to find if restarting and disabling the next button
     * @private
     */
    private async doRefreshRestart(setupComponents: Record<string, ComponentConfig>): Promise<void> {
        const strConfig = this.config.stringConfig;
        const isRestart = this.compInter.customId.startsWith(setupComponents.restart.customId);
        const nextButton = this.staticRows[0].components[2] as ButtonBuilder;

        if (isRestart || this.curField === 1) {
            this.userResponses.boarChannels = ['','',''];
        }

        // Undoes placeholders and shows newly added channels to the server in options
        await this.updateSelectField(strConfig.defaultSelectPlaceholder);

        if (!isRestart) {
            clearInterval(this.timerVars.updateTime);
            return;
        }

        for (const configField of this.setupFields) {
            configField.reset();
        }

        this.userResponses.isSBServer = false;

        this.curField = 1;

        nextButton.setStyle(ButtonStyle.Primary).setDisabled(true);

        await this.setupFields[0].editReply(this.firstInter);
    }

    /**
     * Handles when user chooses whether server is a SkyBlock server
     *
     * @param setupComponents - Used to find what user chose and getting labels to display back
     * @private
     */
    private async doSb(setupComponents: Record<string, ComponentConfig>): Promise<void> {
        const strConfig: StringConfig = this.config.stringConfig;
        this.userResponses.isSBServer = this.compInter.customId.startsWith(setupComponents.sbYes.customId);

        this.setupFields[1].content = strConfig.setupFinished2 + (this.userResponses.isSBServer
            ? setupComponents.sbYes.label
            : setupComponents.sbNo.label);

        this.staticRows[0].components[2].setDisabled(false);

        await this.setupFields[1].editReply(this.compInter);
    }

    /**
     * Handles when the collector is terminated
     *
     * @param reason - The reason the collector was terminated
     * @private
     */
    private async handleEndCollect(reason: string): Promise<void> {
        try {
            LogDebug.log('Ended collection with reason: ' + reason, this.config, this.firstInter);

            if (reason !== CollectorUtils.Reasons.Overridden) {
                delete CollectorUtils.setupCollectors[this.firstInter.user.id];
            }

            clearInterval(this.timerVars.updateTime);
            this.endModalListener(this.firstInter.client);

            const strConfig = this.config.stringConfig;

            let replyContent: string;
            let color: string | undefined;

            if (reason && reason !== CollectorUtils.Reasons.Finished || !this.compInter.guild) {
                await DataHandlers.removeGuildFile(this.guildDataPath, this.guildData);
            }

            switch (reason) {
                case CollectorUtils.Reasons.Cancelled:
                    replyContent = strConfig.setupCancelled;
                    color = this.config.colorConfig.error;
                    break;
                case CollectorUtils.Reasons.Error:
                    replyContent = strConfig.setupError;
                    color = this.config.colorConfig.error;
                    break;
                case CollectorUtils.Reasons.Expired:
                    replyContent = strConfig.setupExpired;
                    color = this.config.colorConfig.error;
                    break;
                case CollectorUtils.Reasons.Finished:
                    LogDebug.log(
                        `${this.firstInter.guild?.name} (${this.firstInter.guild?.id}) had BoarBot set up by ` +
                            `${this.firstInter.user.username} (${this.firstInter.user.id})`,
                        this.config,
                        undefined,
                        true
                    );

                    this.guildData = {
                        fullySetup: true,
                        isSBServer: this.userResponses.isSBServer,
                        channels: this.userResponses.boarChannels.filter((ch: string) => {
                            return ch !== '';
                        })
                    };

                    fs.writeFileSync(this.guildDataPath, JSON.stringify(this.guildData));

                    replyContent = strConfig.setupFinishedAll;
                    color = this.config.colorConfig.green;

                    break;
                default:
                    replyContent = strConfig.error;
                    break;
            }

            await Replies.handleReply(this.firstInter, replyContent, color);
        } catch (err: unknown) {
            await LogDebug.handleError(err, this.firstInter);
        }

        this.endModalListener(this.firstInter.client);
    }

    /**
     * Gets array of channel names and IDs for when
     * selecting channels the bot should work in
     *
     * @param interaction - Used to get up-to-date channel info
     * @param blackList - Channel IDs to ignore
     * @private
     */
    private getTextChannels(
        interaction: Interaction = this.firstInter,
        blackList?: string[]
    ): SelectMenuComponentOptionData[] {
        const strConfig = this.config.stringConfig;

        const channelOptions = [] as SelectMenuComponentOptionData[];
        const noChannelOptions = [{
            label: strConfig.emptySelect,
            value: strConfig.emptySelect
        }] as SelectMenuComponentOptionData[];

        const textChannels = interaction.guild?.channels.cache
            .filter((ch: GuildBasedChannel) => {
                return ch.type === ChannelType.GuildText && ch.guild && ch.guild.members.me &&
                    ch.permissionsFor(ch.guild.members.me).has([
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.AttachFiles
                    ]);
            }
        );

        if (!textChannels) {
            return noChannelOptions;
        }

        for (const txtCh of textChannels.values()) {
            if (blackList && blackList.includes(txtCh.id)) continue;

            let parentName: string;

            if (txtCh.parent) {
                parentName = txtCh.parent.name.toUpperCase();
            } else {
                parentName = strConfig.noParentChannel;
            }

            channelOptions.push({
                label: strConfig.channelOptionLabel
                    .replace('%@', txtCh.name)
                    .replace('%@', parentName)
                    .substring(0, 100),
                value: txtCh.id
            });
        }

        return channelOptions.length > 0
            ? channelOptions.slice(0, 25)
            : noChannelOptions;
    }

    /**
     * Sends modals and receives information on modal submission
     *
     * @param inter - Used to show the modal and create/remove listener
     * @private
     */
    private async modalHandle(inter: StringSelectMenuInteraction | ButtonInteraction): Promise<void> {
        const modals = this.config.commandConfigs.boarManage.setup.modals;

        this.modalShowing = new ModalBuilder(modals[this.curField-1]);
        this.modalShowing.setCustomId(modals[this.curField-1].customId + '|' + inter.id);
        await inter.showModal(this.modalShowing);

        this.curModalListener = this.modalListener;
        inter.client.on(Events.InteractionCreate, this.curModalListener);
    }

    /**
     * Handles when the user makes an interaction that could be a modal submission
     *
     * @param submittedModal - The interaction to respond to
     * @private
     */
    private modalListener = async (submittedModal: Interaction) => {
        try  {
            if (submittedModal.user.id !== this.firstInter.user.id) return;

            const isUserComponentInter = submittedModal.isMessageComponent() &&
                submittedModal.customId.endsWith(this.firstInter.id);
            const maintenanceBlock = this.config.maintenanceMode && !this.config.devs.includes(this.compInter.user.id);

            // If not a modal submission on current interaction, destroy the modal listener
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
            await submittedModal.guild.channels.fetch();

            const strConfig = this.config.stringConfig;

            const submittedChannelID = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            );
            const submittedChannel = submittedModal.guild.channels.cache.get(submittedChannelID);
            const notAlreadyChosen = !this.userResponses.boarChannels.includes(submittedChannelID);

            let submittedChannelName: string;
            let submittedChannelParentName = strConfig.noParentChannel;

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input value: ` + submittedChannelID,
                this.config,
                this.firstInter
            );

            // Checking if channel exists and getting properties of channel
            if (submittedChannel && submittedChannel.type === ChannelType.GuildText && notAlreadyChosen) {
                submittedChannelName = submittedChannel.name;

                if (submittedChannel.parent) {
                    submittedChannelParentName = submittedChannel.parent.name.toUpperCase();
                }
            } else {
                await Replies.handleReply(submittedModal, strConfig.notValidChannel);

                this.endModalListener(submittedModal.client);
                return;
            }

            const placeholder = strConfig.channelOptionLabel
                .replace('%@', submittedChannelName)
                .replace('%@', submittedChannelParentName)
                .substring(0, 100);

            // Last select menu index by default
            let selectIndex = 2;

            // Gets next select menu that can be changed, if all full, change last one
            for (let i=0; i<2; i++) {
                const selectMenu = this.setupFields[0].components[i].components[0] as StringSelectMenuBuilder;

                if (selectMenu.data.placeholder === strConfig.defaultSelectPlaceholder) {
                    selectIndex = i;
                    break;
                }
            }

            this.userResponses.boarChannels[selectIndex] = submittedChannelID;

            await this.updateSelectField(placeholder, selectIndex);
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    private endModalListener(client: Client) {
        clearInterval(this.timerVars.updateTime);
        if (this.curModalListener) {
            client.removeListener(Events.InteractionCreate, this.curModalListener);
            this.curModalListener = undefined;
        }
    }

    /**
     * Updates fields with select menus
     *
     * @param placeholder - The placeholder to use on the select menu(s)
     * @param selectIndex - Used to find what select menu to change if there's multiple
     * @private
     */
    private async updateSelectField(placeholder: string, selectIndex = 0): Promise<void> {
        const strConfig = this.config.stringConfig;
        const setupRowConfigs = this.config.commandConfigs.boarManage.setup.componentFields;
        const setupComponents = {
            boarRefresh: setupRowConfigs[0][3].components[0],
            restart: setupRowConfigs[2][0].components[1]
        };

        // Components that need to be changed

        const fieldOneSelectMenus = this.setupFields[0].components
            .slice(0,3) as ActionRowBuilder<StringSelectMenuBuilder>[];
        const nextButton = this.staticRows[0].components[2] as ButtonBuilder;

        // Information about the state of the interaction
        const chosenChannels = this.userResponses.boarChannels;
        const isRefresh = this.compInter.customId.startsWith(setupComponents.boarRefresh.customId) ||
            this.compInter.customId.startsWith(setupComponents.restart.customId);

        // Disables next button on refresh as it empties all select menus
        nextButton.setDisabled(isRefresh);

        // Update boar channel select menus
        for (const row of fieldOneSelectMenus) {
            const fieldOneSelectMenu = row.components[0] as StringSelectMenuBuilder;

            fieldOneSelectMenu.setOptions(...this.getTextChannels(this.compInter, chosenChannels))
                .setDisabled(this.getTextChannels(this.compInter, chosenChannels)[0].label === strConfig.emptySelect);

            if (isRefresh) {
                fieldOneSelectMenu.setPlaceholder(placeholder);
            }
        }

        // Edit boar channels field content based on if it's a refresh or not
        if (!isRefresh) {
            const selectMenu = this.setupFields[0].components[selectIndex].components[0] as StringSelectMenuBuilder;

            let channelsString = '';

            for (const channel of this.userResponses.boarChannels) {
                if (channel === '') continue;
                channelsString += FormatStrings.toBasicChannel(channel) + ' ';
            }

            selectMenu.setPlaceholder(placeholder);
            this.setupFields[0].content = strConfig.setupFinished1 + channelsString;

            await this.setupFields[0].editReply(this.compInter);
        } else {
            this.setupFields[0].content = strConfig.setupUnfinished1;
            await this.setupFields[0].editReply(this.compInter);
        }
    }

    /**
     * Creates a row on the bottom of all fields using configurations and returns it
     *
     * @private
     */
    private getStaticRows(): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
        const staticRowsConfig = this.config.commandConfigs.boarManage.setup.componentFields[2];
        const staticRows = ComponentUtils.makeRows(staticRowsConfig);

        ComponentUtils.addToIDs(staticRowsConfig, staticRows, this.firstInter.id);

        return staticRows;
    }

    /**
     * Creates {@link FormField form fields} from configurations and returns them
     *
     * @private
     * @param staticRows
     */
    private getSetupFields(staticRows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]): FormField[] {
        const strConfig = this.config.stringConfig;
        const setupFieldConfigs = this.config.commandConfigs.boarManage.setup.componentFields;

        const allFields = [] as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[][];

        for (const field in setupFieldConfigs) {
            const rowsConfig = setupFieldConfigs[field];
            const newRows = ComponentUtils.makeRows(rowsConfig);

            ComponentUtils.addToIDs(rowsConfig, newRows, this.firstInter.id, undefined, this.getTextChannels());

            allFields[field] = newRows;
            allFields[field].push(staticRows[0]);
        }

        return [
            new FormField(strConfig.setupUnfinished1, allFields[0]),
            new FormField(strConfig.setupUnfinished2, allFields[1])
        ];
    }
}
