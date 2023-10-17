import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ChatInputCommandInteraction, Client,
    Events,
    Interaction, InteractionCollector,
    MessageComponentInteraction,
    ModalBuilder,
    ModalSubmitInteraction,
    SelectMenuComponentOptionData,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextChannel
} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {Replies} from '../../util/interactions/Replies';
import {CollectorUtils} from '../../util/discord/CollectorUtils';
import {ComponentUtils} from '../../util/discord/ComponentUtils';
import {LogDebug} from '../../util/logging/LogDebug';
import {DataHandlers} from '../../util/data/DataHandlers';
import {MarketImageGenerator} from '../../util/generators/MarketImageGenerator';
import {BoarUser} from '../../util/boar/BoarUser';
import {BoarUtils} from '../../util/boar/BoarUtils';
import {Queue} from '../../util/interactions/Queue';
import {BuySellData} from '../../bot/data/global/BuySellData';
import {ItemsData} from '../../bot/data/global/ItemsData';
import {QuestData} from '../../bot/data/global/QuestData';
import {CollectedBoar} from '../../bot/data/user/collectibles/CollectedBoar';
import {BoardData} from '../../bot/data/global/BoardData';

enum View {
    Overview,
    BuySell,
    UserOrders
}

/**
 * {@link MarketSubcommand MarketSubcommand.ts}
 *
 * Used to buy and sell boars and items
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class MarketSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.market;
    private imageGen = {} as MarketImageGenerator;
    private firstInter = {} as ChatInputCommandInteraction;
    private compInter = {} as MessageComponentInteraction;
    private pricingData: {
        id: string,
        type: string,
        buyers: BuySellData[],
        sellers: BuySellData[],
        lastBuys: [curBestPrice: number, lastBestPrice: number, curBestUser: string],
        lastSells: [curBestPrice: number, lastBestPrice: number, curBestUser: string]
    }[] = [];
    private pricingDataSearchArr = [] as [name: string, index: number][];
    private boarUser = {} as BoarUser;
    private userBuyOrders = [] as {
        data: BuySellData,
        id: string,
        type: string,
        lastBuys: [curBestPrice: number, lastBestPrice: number, curBestUser: string],
        lastSells: [curBestPrice: number, lastBestPrice: number, curBestUser: string]
    }[];
    private userSellOrders = [] as {
        data: BuySellData,
        id: string,
        type: string,
        lastBuys: [curBestPrice: number, lastBestPrice: number, curBestUser: string],
        lastSells: [curBestPrice: number, lastBestPrice: number, curBestUser: string]
    }[];
    private curView = View.Overview;
    private curPage = 0;
    private curEdition = 0;
    private modalData = [0, 0, 0] as [num: number, price: number, edition: number];
    private maxPageOverview = 0;
    private baseRows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
    private optionalRows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
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

        await interaction.deferReply({ ephemeral: true });

        const isBanned = await InteractionUtils.handleBanned(interaction, this.config);
        if (isBanned) return;

        // Prevents opening market if it's closed
        if (!this.config.marketOpen && !this.config.devs.includes(interaction.user.id)) {
            await Replies.handleReply(
                interaction, this.config.stringConfig.marketClosed, this.config.colorConfig.error
            );
            return;
        }

        // Prevents opening market if the user's account is less than a month old
        if (interaction.user.createdTimestamp > Date.now() + this.config.numberConfig.oneDay * 30) {
            await Replies.handleReply(
                interaction, this.config.stringConfig.marketTooYoung, this.config.colorConfig.error
            );
            return;
        }

        this.firstInter = interaction;

        // View to start out in
        this.curView = interaction.options.getInteger(this.subcommandInfo.args[0].name) ?? View.Overview;

        // Page to start out on
        const pageInput = interaction.options.getString(this.subcommandInfo.args[1].name)?.toLowerCase()
            .replace(/\s+/g, '') ?? '1';

        await this.getPricingData();
        this.boarUser = new BoarUser(interaction.user);

        // Only allow orders to be viewed if the user has orders
        if (this.curView === View.UserOrders && this.userBuyOrders.concat(this.userSellOrders).length === 0) {
            this.curView = View.Overview;
        }

        this.maxPageOverview = Math.ceil(this.pricingData.length / this.config.numberConfig.marketPerPage) - 1;

        // Convert page input into actual page

        let pageVal = 1;
        if (!Number.isNaN(parseInt(pageInput))) {
            pageVal = parseInt(pageInput);
        } else if (this.curView === View.Overview) {
            // Maps boar search value to its overview page index
            const overviewSearchArr = this.pricingDataSearchArr.map((val: [string, number]) => {
                return [val[0], Math.ceil(val[1] / this.config.numberConfig.marketPerPage)] as [string, number];
            });

            pageVal = BoarUtils.getClosestName(pageInput.toLowerCase().replace(/\s+/g, ''), overviewSearchArr);
        } else if (this.curView === View.BuySell) {
            pageVal = BoarUtils.getClosestName(pageInput.toLowerCase().replace(/\s+/g, ''), this.pricingDataSearchArr);
        }

        this.setPage(pageVal);

        // Stop prior collector that user may have open still to reduce number of listeners
        if (CollectorUtils.marketCollectors[interaction.user.id]) {
            const oldCollector = CollectorUtils.marketCollectors[interaction.user.id];

            setTimeout(() => {
                oldCollector.stop(CollectorUtils.Reasons.Expired)
            }, 1000);
        }

        this.collector = CollectorUtils.marketCollectors[interaction.user.id] = await CollectorUtils.createCollector(
            interaction.channel as TextChannel, interaction.id, this.config.numberConfig
        );

        this.collector.on('collect', async (inter: ButtonInteraction | StringSelectMenuInteraction) => {
            await this.handleCollect(inter)
        });

        this.collector.once('end', async (_, reason: string) => {
            await this.handleEndCollect(reason);
        });

        this.imageGen = new MarketImageGenerator(
            this.pricingData, this.userBuyOrders, this.userSellOrders, this.config
        );
        await this.showMarket(true);
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
                `${inter.customId.split('|')[0]} on page ${this.curPage} in view ${this.curView}`,
                this.config,
                this.firstInter
            );

            const marketRowConfig = this.config.commandConfigs.boar.market.componentFields;
            const marketComponents = {
                leftPage: marketRowConfig[0][0].components[0],
                inputPage: marketRowConfig[0][0].components[1],
                rightPage: marketRowConfig[0][0].components[2],
                refresh: marketRowConfig[0][0].components[3],
                overviewView: marketRowConfig[0][1].components[0],
                buySellView: marketRowConfig[0][1].components[1],
                ordersView: marketRowConfig[0][1].components[2],
                instaBuy: marketRowConfig[1][0].components[0],
                instaSell: marketRowConfig[1][0].components[1],
                buyOrder: marketRowConfig[1][1].components[0],
                sellOrder: marketRowConfig[1][1].components[1],
                editionSelect: marketRowConfig[1][2].components[0],
                claimOrder: marketRowConfig[1][3].components[0],
                updateOrder: marketRowConfig[1][3].components[1],
                cancelOrder: marketRowConfig[1][3].components[2],
                selectOrder: marketRowConfig[1][4].components[0]
            };

            const isPageInput = inter.customId.startsWith(marketComponents.inputPage.customId);
            const isInstaBuy = inter.customId.startsWith(marketComponents.instaBuy.customId);
            const isInstaSell = inter.customId.startsWith(marketComponents.instaSell.customId);
            const isBuyOrder = inter.customId.startsWith(marketComponents.buyOrder.customId);
            const isSellOrder = inter.customId.startsWith(marketComponents.sellOrder.customId);
            const isUpdate = inter.customId.startsWith(marketComponents.updateOrder.customId);

            // User wants to input a page manually
            if (isPageInput) {
                await this.modalHandle(inter);

                if (this.undoRedButtons()) {
                    this.showMarket();
                }

                this.curEdition = 0;

                clearInterval(this.timerVars.updateTime);
                return;
            }

            let showModal = true;

            // User wants to insta buy or sell
            if (isInstaBuy || isInstaSell) {
                await Queue.addQueue(async () => {
                    showModal = await this.canInstaModal(inter, isInstaBuy, isInstaSell);
                }, 'market_insta' + inter.id + this.boarUser.user.id).catch((err: unknown) => {
                    throw err;
                });

                if (showModal) {
                    await this.modalHandle(inter);
                }

                clearInterval(this.timerVars.updateTime);
                return;
            }

            // User wants to buy order or sell offer
            if (isBuyOrder || isSellOrder) {
                await Queue.addQueue(async () => {
                    showModal = await this.canOrderModal(inter, isBuyOrder, isSellOrder);
                }, 'market_order' + inter.id + inter.user.id).catch((err: unknown) => {
                    throw err;
                });

                if (showModal) {
                    await this.modalHandle(inter);
                }

                clearInterval(this.timerVars.updateTime);
                return;
            }

            // User wants to update order
            if (isUpdate) {
                await Queue.addQueue(async () => {
                    showModal = await this.canUpdateModal(inter);
                }, 'market_update' + inter.id + inter.user.id).catch((err: unknown) => {
                    throw err;
                });

                if (showModal) {
                    await this.modalHandle(inter);
                }

                clearInterval(this.timerVars.updateTime);
                return;
            }

            await inter.deferUpdate();

            switch (inter.customId.split('|')[0]) {
                // User wants to go to previous page
                case marketComponents.leftPage.customId: {
                    this.curPage--;
                    this.curEdition = 0;
                    break;
                }

                // User wants to go to the next page
                case marketComponents.rightPage.customId: {
                    this.curPage++;
                    this.curEdition = 0;
                    break;
                }

                // User wants to refresh the market data
                case marketComponents.refresh.customId: {
                    await this.getPricingData();
                    await this.imageGen.updateInfo(this.pricingData, this.userBuyOrders, this.userSellOrders, this.config);
                    this.boarUser.refreshUserData();
                    this.curEdition = 0;
                    break;
                }

                // User wants see an overview of prices
                case marketComponents.overviewView.customId: {
                    this.curView = View.Overview;
                    this.curPage = 0;
                    this.curEdition = 0;
                    break;
                }

                // User wants to see more specific pricing information of an item
                case marketComponents.buySellView.customId: {
                    this.curView = View.BuySell;
                    this.curPage = 0;
                    this.curEdition = 0;
                    break;
                }

                // User wants to manage or view their orders
                case marketComponents.ordersView.customId: {
                    this.curView = View.UserOrders;
                    this.curPage = 0;
                    this.curEdition = 0;
                    break;
                }

                // User wants to change what edition to look at
                case marketComponents.editionSelect.customId: {
                    this.curEdition = Number.parseInt((inter as StringSelectMenuInteraction).values[0]);
                    break;
                }

                // User wants to claim an order
                case marketComponents.claimOrder.customId: {
                    await Queue.addQueue(async () => {
                        await this.doClaim();
                    }, 'market_claim' + this.compInter.id + this.compInter.user.id).catch((err: unknown) => {
                        throw err;
                    });
                    break;
                }

                // User wants to cancel an order
                case marketComponents.cancelOrder.customId: {
                    await Queue.addQueue(async () => {
                        await this.doCancel();
                    }, 'market_cancel' + this.compInter.id + this.compInter.user.id).catch((err: unknown) => {
                        throw err;
                    });
                    break;
                }

                // User wants to choose a specific order
                case marketComponents.selectOrder.customId: {
                    this.curPage = Number.parseInt((inter as StringSelectMenuInteraction).values[0]);
                    break;
                }
            }

            this.undoRedButtons();

            this.modalData = [0, 0, 0];
            await this.showMarket();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, inter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        clearInterval(this.timerVars.updateTime);
    }

    /**
     * Attempts to claim the filled items in an order
     *
     * @private
     */
    private async doClaim(): Promise<void> {
        let orderInfo: {
            data: BuySellData,
            id: string,
            type: string,
            lastBuys: [curBestPrice: number, lastBestPrice: number, curBestUser: string],
            lastSells: [curBestPrice: number, lastBestPrice: number, curBestUser: string]
        };
        let isSell = false;
        let numToClaim = 0;

        const strConfig = this.config.stringConfig;
        const colorConfig = this.config.colorConfig;

        // Gets order based on current page
        if (this.curPage < this.userBuyOrders.length) {
            orderInfo = this.userBuyOrders[this.curPage];
        } else {
            isSell = true;
            orderInfo = this.userSellOrders[this.curPage - this.userBuyOrders.length];
        }

        let foundOrder = false;

        await Queue.addQueue(async () => {
            try {
                const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;

                const buyOrders = itemsData[orderInfo.type][orderInfo.id].buyers;
                const sellOrders = itemsData[orderInfo.type][orderInfo.id].sellers;

                // Tries to find currently selected order in buy orders
                for (let i=0; i<buyOrders.length && !isSell; i++) {
                    const buyOrder = buyOrders[i];
                    const isSameOrder = buyOrder.userID === orderInfo.data.userID &&
                        buyOrder.listTime === orderInfo.data.listTime;

                    // Returns filled order items to user if the order was found
                    if (isSameOrder) {
                        foundOrder = true;

                        numToClaim = await this.returnOrderToUser(orderInfo, isSell, true);

                        const fullyFilled = orderInfo.data.num === orderInfo.data.filledAmount &&
                            orderInfo.data.filledAmount === orderInfo.data.claimedAmount + numToClaim;

                        if (fullyFilled) {
                            itemsData[orderInfo.type][orderInfo.id].buyers.splice(i, 1);
                            break;
                        }

                        itemsData[orderInfo.type][orderInfo.id].buyers[i].editions.splice(0, numToClaim);
                        itemsData[orderInfo.type][orderInfo.id].buyers[i].editionDates.splice(0, numToClaim);
                        itemsData[orderInfo.type][orderInfo.id].buyers[i].claimedAmount += numToClaim;

                        break;
                    }
                }

                // Tries to find currently selected order in sell orders
                for (let i=0; i<sellOrders.length && isSell; i++) {
                    const sellOrder = sellOrders[i];
                    const isSameOrder = sellOrder.userID === orderInfo.data.userID &&
                        sellOrder.listTime === orderInfo.data.listTime;

                    // Returns filled order bucks to user if the order was found
                    if (isSameOrder) {
                        foundOrder = true;

                        numToClaim = await this.returnOrderToUser(orderInfo, isSell, true);

                        const fullyFilled = orderInfo.data.num === orderInfo.data.filledAmount &&
                            orderInfo.data.filledAmount === orderInfo.data.claimedAmount + numToClaim;

                        if (fullyFilled) {
                            itemsData[orderInfo.type][orderInfo.id].sellers.splice(i, 1);
                            break;
                        }

                        itemsData[orderInfo.type][orderInfo.id].sellers[i].claimedAmount += numToClaim;

                        break;
                    }
                }

                DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
                await this.getPricingData();
                await this.imageGen.updateInfo(this.pricingData, this.userBuyOrders, this.userSellOrders, this.config);
            } catch (err: unknown) {
                await LogDebug.handleError(err, this.compInter);
            }
        }, 'market_claim' + this.compInter.id + 'global').catch((err: unknown) => {
            throw err;
        });

        if (!foundOrder) return;

        if (numToClaim > 0) {
            await Queue.addQueue(async () => {
                DataHandlers.updateLeaderboardData(this.boarUser, this.config, this.compInter);
            }, 'market_claim_top' + this.compInter.id + this.boarUser.user.id + 'global').catch((err: unknown) => {
                throw err;
            });

            // Tells user they successfully claimed the filled items/bucks in their order
            await Replies.handleReply(
                this.compInter, strConfig.marketClaimComplete, colorConfig.green, undefined, undefined, true
            );

            // Goes to first page if the order has been fully filled and claimed
            this.curPage = orderInfo.data.num === orderInfo.data.claimedAmount + numToClaim
                ? 0
                : this.curPage;
        } else {
            // Tells user they have the maximum amount of the item and claiming failed
            await Replies.handleReply(
                this.compInter, strConfig.marketMaxItems, colorConfig.error, undefined, undefined, true
            );
        }
    }

    /**
     * Attempts to cancel an order and return all items back to user
     *
     * @private
     */
    private async doCancel(): Promise<void> {
        let orderInfo: {
            data: BuySellData,
            id: string,
            type: string,
            lastBuys: [curBestPrice: number, lastBestPrice: number, curBestUser: string],
            lastSells: [curBestPrice: number, lastBestPrice: number, curBestUser: string]
        };
        let isSell = false;
        let canCancel = true;

        const strConfig = this.config.stringConfig;
        const colorConfig = this.config.colorConfig;

        // Gets order based on current page
        if (this.curPage < this.userBuyOrders.length) {
            orderInfo = this.userBuyOrders[this.curPage];
        } else {
            isSell = true;
            orderInfo = this.userSellOrders[this.curPage - this.userBuyOrders.length];
        }

        const itemRarity = BoarUtils.findRarity(orderInfo.id, this.config);
        const isSpecial = itemRarity[1].name === 'Special' && itemRarity[0] !== 0;

        // FIX THIS QUEUE
        await Queue.addQueue(async () => {
            try {
                const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;

                const buyOrders = itemsData[orderInfo.type][orderInfo.id].buyers;
                const sellOrders = itemsData[orderInfo.type][orderInfo.id].sellers;

                // Attempts to find the matching buy order for current order
                for (let i=0; i<buyOrders.length && !isSell; i++) {
                    const buyOrder = buyOrders[i];
                    const orderPrice = itemsData[orderInfo.type][orderInfo.id].buyers[i].price;
                    const itemLastBuy = itemsData[orderInfo.type][orderInfo.id].lastBuys[0];
                    const isSameOrder = buyOrder.userID === orderInfo.data.userID &&
                        buyOrder.listTime === orderInfo.data.listTime;
                    canCancel = orderInfo.data.filledAmount === buyOrder.filledAmount;

                    // Attempts to cancel the order if the order is the same as selected order
                    if (isSameOrder && canCancel) {
                        const hasEnoughRoom = (await this.returnOrderToUser(orderInfo, isSell, false)) > 0;

                        // Cancels order if there's enough room for the items
                        if (hasEnoughRoom) {
                            // Tells user they successfully cancelled their order
                            await Replies.handleReply(
                                this.compInter,
                                strConfig.marketCancelComplete,
                                colorConfig.green,
                                undefined,
                                undefined,
                                true
                            );

                            itemsData[orderInfo.type][orderInfo.id].buyers.splice(i, 1);

                            // Handles setting best buy prices after the cancel if the order was the best
                            if (!isSpecial && orderPrice === itemLastBuy) {
                                itemsData[orderInfo.type][orderInfo.id].lastBuys[0] = 0;
                                itemsData[orderInfo.type][orderInfo.id].lastBuys[2] = '';

                                for (const possibleOrder of itemsData[orderInfo.type][orderInfo.id].buyers) {
                                    const isFilled = possibleOrder.num === possibleOrder.filledAmount;
                                    const isExpired = possibleOrder.listTime +
                                        this.config.numberConfig.orderExpire < Date.now();

                                    if (!isFilled && !isExpired) {
                                        itemsData[orderInfo.type][orderInfo.id].lastBuys[0] = possibleOrder.price;
                                        itemsData[orderInfo.type][orderInfo.id].lastBuys[2] = possibleOrder.userID;
                                        break;
                                    }
                                }
                            }

                            this.curPage = 0;
                        } else {
                            // Tells user they don't have enough room to cancel the order
                            await Replies.handleReply(
                                this.compInter, strConfig.marketNoRoom, colorConfig.error, undefined, undefined, true
                            );
                        }

                        break;
                    } else if (isSameOrder) {
                        // Tells users they have items they need to claim before they cancel
                        await Replies.handleReply(
                            this.compInter, strConfig.marketMustClaim, colorConfig.green, undefined, undefined, true
                        );
                        break;
                    }
                }

                // Attempts to find the matching sell order for current order
                for (let i=0; i<sellOrders.length && isSell; i++) {
                    const sellOrder = sellOrders[i];
                    const isSameOrder = sellOrder.userID === orderInfo.data.userID &&
                        sellOrder.listTime === orderInfo.data.listTime;
                    const orderPrice = itemsData[orderInfo.type][orderInfo.id].sellers[i].price;
                    const itemLastSell = itemsData[orderInfo.type][orderInfo.id].lastSells[0];
                    canCancel = orderInfo.data.filledAmount === sellOrder.filledAmount;

                    // Attempts to cancel the order if the order is the same as selected order
                    if (isSameOrder && canCancel) {
                        const hasEnoughRoom = (await this.returnOrderToUser(orderInfo, isSell, false)) > 0;

                        // Cancels order if there's enough room for the items
                        if (hasEnoughRoom) {
                            // Tells user they successfully cancelled their order
                            await Replies.handleReply(
                                this.compInter,
                                strConfig.marketCancelComplete,
                                colorConfig.green,
                                undefined,
                                undefined,
                                true
                            );

                            itemsData[orderInfo.type][orderInfo.id].sellers.splice(i, 1);

                            // Handles setting best sell prices after the cancel if the order was the best
                            if (!isSpecial && orderPrice === itemLastSell) {
                                itemsData[orderInfo.type][orderInfo.id].lastSells[0] = 0;
                                itemsData[orderInfo.type][orderInfo.id].lastSells[2] = '';

                                for (const possibleOrder of itemsData[orderInfo.type][orderInfo.id].sellers) {
                                    const isFilled = possibleOrder.num === possibleOrder.filledAmount;
                                    const isExpired = possibleOrder.listTime +
                                        this.config.numberConfig.orderExpire < Date.now();

                                    if (!isFilled && !isExpired) {
                                        itemsData[orderInfo.type][orderInfo.id].lastSells[0] = possibleOrder.price;
                                        itemsData[orderInfo.type][orderInfo.id].lastSells[2] = possibleOrder.userID;
                                        break;
                                    }
                                }
                            }

                            this.curPage = 0;
                        } else {
                            // Tells user they don't have enough room to cancel the order
                            await Replies.handleReply(
                                this.compInter, strConfig.marketNoRoom, colorConfig.error, undefined, undefined, true
                            );
                        }

                        break;
                    } else if (isSameOrder) {
                        // Tells users they have items they need to claim before they cancel
                        await Replies.handleReply(
                            this.compInter, strConfig.marketMustClaim, colorConfig.green, undefined, undefined, true
                        );
                        break;
                    }
                }

                DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
                await this.getPricingData();
                await this.imageGen.updateInfo(
                    this.pricingData, this.userBuyOrders, this.userSellOrders, this.config
                );
            } catch (err: unknown) {
                await LogDebug.handleError(err, this.compInter);
            }
        }, 'market_cancel' + this.compInter.id + 'global').catch((err: unknown) => {
            throw err;
        });

        await Queue.addQueue(async () => {
            DataHandlers.updateLeaderboardData(this.boarUser, this.config, this.compInter);
        }, 'market_cancel_top' + this.compInter.id + this.boarUser.user.id + 'global').catch((err: unknown) => {
            throw err;
        });
    }

    /**
     * Gets the amount of an item/bucks to return to a user
     *
     * @param orderInfo - The order to examine for returns
     * @param isSell - Whether the order is for selling
     * @param isClaim - Whether the order is being claimed
     * @return Amount of items/bucks returned to user
     * @private
     */
    private async returnOrderToUser(
        orderInfo: {
            data: BuySellData,
            id: string,
            type: string,
            lastBuys: [curBestPrice: number, lastBestPrice: number, curBestUser: string],
            lastSells: [curBestPrice: number, lastBestPrice: number, curBestUser: string]
        },
        isSell: boolean,
        isClaim: boolean
    ): Promise<number> {
        let numToReturn;
        let hasEnoughRoom = true;

        const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;
        const isOwnOrder = this.firstInter.user.id !== orderInfo.data.userID;

        // This is meant to change whether items or bucks are returned
        // When cancelling, you get the opposite of what you wanted: your items back
        if (!isClaim) {
            isSell = !isSell;
        }

        this.boarUser.refreshUserData();

        if (isClaim) {
            numToReturn = orderInfo.data.filledAmount - orderInfo.data.claimedAmount;
        } else {
            numToReturn = orderInfo.data.num - orderInfo.data.filledAmount;
        }

        // Counts progress toward spend bucks quest if claiming a buy order
        if (!isSell && isClaim && !isOwnOrder) {
            const spendBucksIndex = questData.curQuestIDs.indexOf('spendBucks');
            this.boarUser.stats.quests.progress[spendBucksIndex] += numToReturn * orderInfo.data.price;
        }

        if (!isSell && orderInfo.type === 'boars') {
            const collectBoarIndex = questData.curQuestIDs.indexOf('collectBoar');

            // Adds boar entry to collection if it doesn't exist
            if (!this.boarUser.itemCollection.boars[orderInfo.id]) {
                this.boarUser.itemCollection.boars[orderInfo.id] = new CollectedBoar();
                this.boarUser.itemCollection.boars[orderInfo.id].firstObtained = Date.now();
            }

            // Updates last obtained boar only if claiming order
            if (isClaim) {
                this.boarUser.itemCollection.boars[orderInfo.id].lastObtained = Date.now();
                this.boarUser.stats.general.lastBoar = orderInfo.id;
            }

            const editions = this.boarUser.itemCollection.boars[orderInfo.id].editions;
            const editionDates = this.boarUser.itemCollection.boars[orderInfo.id].editionDates;

            this.boarUser.itemCollection.boars[orderInfo.id].editions = editions.concat(
                orderInfo.data.editions.slice(0, numToReturn)
            ).sort((a: number, b: number) => {
                return a - b;
            });

            this.boarUser.itemCollection.boars[orderInfo.id].editionDates = editionDates.concat(
                orderInfo.data.editionDates.slice(0, numToReturn)
            ).sort((a: number, b: number) => {
                return a - b;
            });

            this.boarUser.stats.general.totalBoars += numToReturn;
            this.boarUser.itemCollection.boars[orderInfo.id].num += numToReturn;

            const canCollectBoarQuest = collectBoarIndex >= 0 && isClaim && !isOwnOrder &&
                Math.floor(collectBoarIndex / 2) + 1 === BoarUtils.findRarity(orderInfo.id, this.config)[0];

            // Counts progress toward collecting boar rarity quest if claiming a boar buy order
            if (canCollectBoarQuest) {
                this.boarUser.stats.quests.progress[collectBoarIndex] += numToReturn;
            }
        } else if (!isSell && orderInfo.type === 'powerups') {
            const maxValue = orderInfo.id === 'enhancer'
                ? this.config.numberConfig.maxEnhancers
                : this.config.numberConfig.maxPowBase;

            const numPowerup = this.boarUser.itemCollection.powerups[orderInfo.id].numTotal;

            hasEnoughRoom = numPowerup + numToReturn <= maxValue;

            // Allows partial returns if claiming but not cancelling
            if (isClaim) {
                numToReturn = Math.min(numToReturn, maxValue - numPowerup);
            }

            // Adds powerup items to inventory if there's room
            if (hasEnoughRoom || isClaim) {
                this.boarUser.itemCollection.powerups[orderInfo.id].numTotal += numToReturn;
            }
        } else if (isClaim) {
            // Counts collect bucks quest progress if claiming a sell order
            if (!isOwnOrder) {
                const collectBucksIndex = questData.curQuestIDs.indexOf('collectBucks');
                this.boarUser.stats.quests.progress[collectBucksIndex] += numToReturn * orderInfo.data.price;
            }

            this.boarUser.stats.general.boarScore += numToReturn * orderInfo.data.price;
        } else {
            this.boarUser.stats.general.boarScore += numToReturn * orderInfo.data.price;
        }

        await this.boarUser.orderBoars(this.compInter, this.config);
        this.boarUser.updateUserData();

        return !hasEnoughRoom && !isClaim
            ? 0
            : numToReturn;
    }

    /**
     * Handles all logic for Buy Now and Sell Now button pressing.
     * Returns whether to show a modal
     *
     * @param inter - The interaction to reply to
     * @param isInstaBuy - If buying now
     * @param isInstaSell - If selling now
     * @return Whether the modal should be shown to user
     * @private
     */
    private async canInstaModal(
        inter: MessageComponentInteraction,
        isInstaBuy: boolean,
        isInstaSell: boolean
    ): Promise<boolean> {
        try {
            this.boarUser.refreshUserData();
            let itemData = this.pricingData[this.curPage];
            let showModal = true;
            let undoRed = true;

            const strConfig = this.config.stringConfig;
            const nums = this.config.numberConfig;
            const colorConfig = this.config.colorConfig;

            const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;

            let specialSellOrder = new BuySellData();
            const itemRarity = BoarUtils.findRarity(itemData.id, this.config);
            const isSpecial = itemRarity[1].name === 'Special' && itemRarity[0] !== 0;

            // Grabs sell order to use for instant buying special
            if (isInstaBuy && isSpecial) {
                for (const sellOrder of itemData.sellers) {
                    const noEditionExists = sellOrder.num === sellOrder.filledAmount ||
                        sellOrder.listTime + nums.orderExpire < Date.now() ||
                        sellOrder.editions[0] !== this.curEdition;

                    if (noEditionExists) continue;

                    specialSellOrder = sellOrder;

                    break;
                }
            }

            const noEditionBucks = isInstaBuy && this.curEdition > 0 &&
                this.boarUser.stats.general.boarScore < specialSellOrder.price;
            const noItemBucks = isInstaBuy && this.boarUser.stats.general.boarScore < itemData.sellers[0].price;

            const noHaveEdition = isInstaSell && this.curEdition > 0 &&
                this.boarUser.itemCollection.boars[itemData.id] &&
                !this.boarUser.itemCollection.boars[itemData.id].editions.includes(this.curEdition);

            const noHaveItems = isInstaSell && (itemData.type === 'boars' &&
                !this.boarUser.itemCollection.boars[itemData.id] ||
                itemData.type === 'powerups' && !this.boarUser.itemCollection.powerups[itemData.id]);

            const completeBuy = isInstaBuy && (this.optionalRows[0].components[0] as ButtonBuilder).data.style === 4;
            const completeSell = isInstaSell && (this.optionalRows[0].components[1] as ButtonBuilder).data.style === 4;

            if (noEditionBucks || noItemBucks) {
                await inter.deferUpdate();
                showModal = false;

                // Tells user they don't have enough bucks to buy item
                await Replies.handleReply(
                    inter, strConfig.marketNoBucks, colorConfig.error, undefined, undefined, true
                );
            } else if (noHaveEdition) {
                await inter.deferUpdate();
                showModal = false;

                // Tells user they don't have the edition required to sell item
                await Replies.handleReply(
                    inter, strConfig.marketNoEdition, colorConfig.error, undefined, undefined, true
                );
            } else if (noHaveItems) {
                await inter.deferUpdate();
                showModal = false;

                // Tells user they don't have the required items to sell
                await Replies.handleReply(
                    inter, strConfig.marketNoItems, colorConfig.error, undefined, undefined, true
                );
            } else if (completeBuy) {
                await inter.deferUpdate();
                showModal = false;

                let prices = '';
                let userIDs = '';

                const hasNoEnhancerRoom = itemData.id === 'enhancer' &&
                    this.modalData[0] + this.boarUser.itemCollection.powerups.enhancer.numTotal > nums.maxEnhancers;

                if (hasNoEnhancerRoom) {
                    // Tells user they don't have enough room for item
                    await Replies.handleReply(
                        inter, strConfig.marketNoRoom, colorConfig.error, undefined, undefined, true
                    );
                } else if (this.boarUser.stats.general.boarScore >= this.modalData[1]) {
                    let failedBuy = false;

                    // Used to keep track of fill amounts for individual orders
                    const orderFillAmounts = [] as number[];

                    let editionOrderIndex = -1;

                    await Queue.addQueue(async () => {
                        try {
                            const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;
                            const newItemData = itemsData[itemData.type][itemData.id];

                            let curPrice = 0;

                            if (this.curEdition === 0) {
                                let numGrabbed = 0;
                                let curIndex = 0;

                                // Attempts to grab price of all items combined across orders
                                while (numGrabbed < this.modalData[0]) {
                                    if (curIndex >= newItemData.sellers.length) break;

                                    let numToAdd = 0;

                                    // Adds amount left in current order or amount left to satisfy insta buy
                                    numToAdd = Math.min(
                                        this.modalData[0] - numGrabbed,
                                        newItemData.sellers[curIndex].listTime + nums.orderExpire < Date.now()
                                            ? 0
                                            : newItemData.sellers[curIndex].num -
                                                newItemData.sellers[curIndex].filledAmount
                                    );

                                    // Adds on to the price based on amount added from current order
                                    curPrice += newItemData.sellers[curIndex].price * numToAdd;

                                    const filledAmt = newItemData.sellers[curIndex].filledAmount;
                                    const ordAmt = newItemData.sellers[curIndex].num;

                                    // Gets price of order and ID of user that made order for logging
                                    if (filledAmt !== ordAmt) {
                                        prices += '$' + newItemData.sellers[curIndex].price + ' ';
                                        userIDs += newItemData.sellers[curIndex].userID + ' ';
                                    }

                                    numGrabbed += numToAdd;
                                    orderFillAmounts.push(numToAdd);
                                    curIndex++;
                                }

                                if (this.modalData[0] !== numGrabbed) {
                                    // Tells user there's not enough orders for their purchase
                                    await Replies.handleReply(
                                        inter, strConfig.marketNoOrders, colorConfig.error, undefined, undefined, true
                                    );

                                    failedBuy = true;
                                    return;
                                }
                            } else {
                                // Tries to get up-to-date order price for special boar edition
                                for (const instaBuy of newItemData.sellers) {
                                    const noEditionExists: boolean = instaBuy.num === instaBuy.filledAmount ||
                                        instaBuy.listTime + nums.orderExpire < Date.now() ||
                                        instaBuy.editions[0] !== this.curEdition;

                                    editionOrderIndex++;

                                    if (noEditionExists) continue;

                                    prices += '$' + instaBuy.price;
                                    userIDs += instaBuy.userID;

                                    curPrice = instaBuy.price;

                                    break;
                                }

                                if (curPrice === 0) {
                                    // Tells user the edition they want isn't available
                                    await Replies.handleReply(
                                        inter,
                                        strConfig.marketNoEditionOrders,
                                        colorConfig.error,
                                        undefined,
                                        undefined,
                                        true
                                    );

                                    failedBuy = true;
                                    return;
                                }
                            }

                            if (this.modalData[1] < curPrice) {
                                // Tells user the price has updated not in their favor
                                await Replies.handleReply(
                                    inter,
                                    strConfig.marketUpdatedInstaBuy.replace('%@', curPrice.toLocaleString()),
                                    colorConfig.error,
                                    undefined,
                                    undefined,
                                    true
                                );

                                this.modalData[1] = curPrice;
                                undoRed = false;
                                failedBuy = true;
                                return;
                            }

                            // Fills sell orders that were gathered when finding price
                            for (let i=0; i<orderFillAmounts.length; i++) {
                                newItemData.sellers[i].filledAmount += orderFillAmounts[i];
                                if (i === orderFillAmounts.length-1) {
                                    newItemData.lastSells[1] = newItemData.sellers[i].price;
                                }
                            }

                            // Fills sell order for special boar edition
                            if (editionOrderIndex >= 0) {
                                newItemData.sellers[editionOrderIndex].filledAmount = 1;
                            }

                            // Updates best sell prices for item if it's not special
                            if (!isSpecial) {
                                itemsData[itemData.type][itemData.id].lastSells[0] = 0;
                                itemsData[itemData.type][itemData.id].lastSells[2] = '';

                                for (const possibleOrder of itemsData[itemData.type][itemData.id].sellers) {
                                    const isFilled = possibleOrder.num === possibleOrder.filledAmount;
                                    const isExpired = possibleOrder.listTime +
                                        this.config.numberConfig.orderExpire < Date.now();

                                    if (!isFilled && !isExpired) {
                                        itemsData[itemData.type][itemData.id].lastSells[0] = possibleOrder.price;
                                        itemsData[itemData.type][itemData.id].lastSells[2] = possibleOrder.userID;

                                        break;
                                    }
                                }
                            }

                            DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
                            await this.getPricingData();
                            await this.imageGen.updateInfo(
                                this.pricingData, this.userBuyOrders, this.userSellOrders, this.config
                            );
                        } catch (err: unknown) {
                            failedBuy = true;
                            await LogDebug.handleError(err, inter);
                        }
                    }, 'market_insta_b' + inter.id + 'global').catch((err: unknown) => {
                        throw err;
                    });

                    const isOwnOrder = userIDs.includes(this.firstInter.user.id);

                    if (!failedBuy && itemData.type === 'boars') {
                        const collectBoarIndex = questData.curQuestIDs.indexOf('collectBoar');

                        itemData = this.pricingData[this.curPage];

                        // Adds entry for boar if user doesn't have it in their collection
                        if (!this.boarUser.itemCollection.boars[itemData.id]) {
                            this.boarUser.itemCollection.boars[itemData.id] = new CollectedBoar();
                            this.boarUser.itemCollection.boars[itemData.id].firstObtained = Date.now();
                        }

                        this.boarUser.itemCollection.boars[itemData.id].num += this.modalData[0];
                        this.boarUser.itemCollection.boars[itemData.id].lastObtained = Date.now();
                        this.boarUser.stats.general.totalBoars += this.modalData[0];
                        this.boarUser.stats.general.lastBoar = itemData.id;

                        const editions = this.boarUser.itemCollection.boars[itemData.id].editions;
                        const editionDates = this.boarUser.itemCollection.boars[itemData.id].editionDates;

                        if (this.curEdition === 0) {
                            // Gets edition info from orders and puts it in user collection
                            for (let i=0; i<orderFillAmounts.length; i++) {
                                if (itemData.sellers[i].editions.length === 0) continue;

                                this.boarUser.itemCollection.boars[itemData.id].editions = editions.concat(
                                    itemData.sellers[i].editions.slice(0, orderFillAmounts[i])
                                ).sort((a: number, b: number) => {
                                    return a - b;
                                });

                                this.boarUser.itemCollection.boars[itemData.id].editionDates = editionDates.concat(
                                    itemData.sellers[i].editionDates.slice(0, orderFillAmounts[i])
                                ).sort((a: number, b: number) => {
                                    return a - b;
                                });
                            }
                        } else {
                            let specialSellOrder = new BuySellData();

                            // Gets sell order for special boar edition
                            for (const sellOrder of itemData.sellers) {
                                if (sellOrder.editions[0] !== this.curEdition) continue;

                                specialSellOrder = sellOrder;
                            }

                            this.boarUser.itemCollection.boars[itemData.id].editions = editions.concat(
                                [this.curEdition]
                            ).sort((a: number, b: number) => {
                                return a - b;
                            });

                            this.boarUser.itemCollection.boars[itemData.id].editionDates = editionDates.concat(
                                specialSellOrder.editionDates
                            ).sort((a: number, b: number) => {
                                return a - b;
                            });

                            this.curEdition = 0;
                        }

                        const canCollectBoarQuest = collectBoarIndex >= 0 && !isOwnOrder &&
                            Math.floor(collectBoarIndex / 2) + 1 === BoarUtils.findRarity(itemData.id, this.config)[0];

                        // Counts progress toward collect boar quest
                        if (canCollectBoarQuest) {
                            this.boarUser.stats.quests.progress[collectBoarIndex] += this.modalData[0];
                        }
                    } else if (!failedBuy && itemData.type === 'powerups') {
                        this.boarUser.itemCollection.powerups[itemData.id].numTotal += this.modalData[0];
                    }

                    if (!failedBuy) {
                        LogDebug.log(
                            `Bought ${this.modalData[0]} of ${itemData.id} for ${prices.trim()} from ${userIDs.trim()}`,
                            this.config,
                            inter,
                            true
                        );

                        this.boarUser.stats.general.boarScore -= this.modalData[1];

                        // Counts progress toward spend bucks quest when buying
                        if (!isOwnOrder) {
                            const spendBucksIndex = questData.curQuestIDs.indexOf('spendBucks');
                            this.boarUser.stats.quests.progress[spendBucksIndex] += this.modalData[1];
                        }

                        await this.boarUser.orderBoars(this.compInter, this.config);
                        this.boarUser.updateUserData();

                        await Queue.addQueue(async () => {
                            DataHandlers.updateLeaderboardData(this.boarUser, this.config, inter)
                        }, 'market_insta_b_top' + inter.id + this.boarUser.user.id + 'global').catch((err: unknown) => {
                            throw err;
                        });

                        // Tells user they successfully bought their item(s)
                        await Replies.handleReply(
                            inter, strConfig.marketInstaComplete, colorConfig.green, undefined, undefined, true
                        );
                    }
                } else {
                    // Tells user they don't have enough bucks for their item(s)
                    await Replies.handleReply(
                        inter, strConfig.marketNoBucks, colorConfig.error, undefined, undefined, true
                    );
                }
            } else if (completeSell) {
                await inter.deferUpdate();
                showModal = false;

                let prices = '';
                let userIDs = '';

                const hasSpecial = this.curEdition > 0 &&
                    this.boarUser.itemCollection.boars[itemData.id].num >= this.modalData[0] &&
                    this.boarUser.itemCollection.boars[itemData.id].editions.includes(this.curEdition);
                const hasBoars = itemData.type === 'boars' &&
                    this.boarUser.itemCollection.boars[itemData.id].num >= this.modalData[0];
                const hasPowerups = itemData.type === 'powerups' &&
                    this.boarUser.itemCollection.powerups[itemData.id].numTotal >= this.modalData[0];

                if (hasSpecial || hasBoars || hasPowerups) {
                    let failedSale = false;
                    const orderFillAmounts = [] as number[];
                    let editionOrderIndex = -1;

                    await Queue.addQueue(async () => {
                        try {
                            const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;
                            const newItemData = itemsData[itemData.type][itemData.id];

                            let curPrice = 0;

                            if (this.curEdition === 0) {
                                let numGrabbed = 0;
                                let curIndex = 0;

                                // Attempts to grab price of all items combined across orders
                                while (numGrabbed < this.modalData[0]) {
                                    if (curIndex >= newItemData.buyers.length) break;

                                    let numToAdd = 0;

                                    // Adds amount left in current order or amount left to satisfy insta sell
                                    numToAdd = Math.min(
                                        this.modalData[0] - numGrabbed,
                                        newItemData.buyers[curIndex].listTime + nums.orderExpire < Date.now()
                                            ? 0
                                            : newItemData.buyers[curIndex].num -
                                                newItemData.buyers[curIndex].filledAmount
                                    );

                                    // Adds on to the price based on amount added from current order
                                    curPrice += newItemData.buyers[curIndex].price * numToAdd;

                                    const filledAmt = newItemData.buyers[curIndex].filledAmount;
                                    const numAmt = newItemData.buyers[curIndex].num;

                                    // Gets price of order and ID of user that made order for logging
                                    if (filledAmt !== numAmt) {
                                        prices += '$' + newItemData.buyers[curIndex].price + ' ';
                                        userIDs += newItemData.buyers[curIndex].userID + ' ';
                                    }

                                    numGrabbed += numToAdd;
                                    orderFillAmounts.push(numToAdd);
                                    curIndex++;
                                }

                                if (this.modalData[0] !== numGrabbed) {
                                    // Tells user there's not enough orders for their sale
                                    await Replies.handleReply(
                                        inter, strConfig.marketNoOrders, colorConfig.error, undefined, undefined, true
                                    );

                                    failedSale = true;
                                    return;
                                }
                            } else {
                                // Grabs the index of the buy order with the edition the user wants to sell
                                for (const instaSell of newItemData.buyers) {
                                    const noEditionExists: boolean = instaSell.num === instaSell.filledAmount ||
                                        instaSell.listTime + nums.orderExpire < Date.now() ||
                                        instaSell.editions[0] !== this.curEdition;

                                    editionOrderIndex++;

                                    if (noEditionExists) continue;

                                    prices += '$' + instaSell.price;
                                    userIDs += instaSell.userID;

                                    curPrice = instaSell.price;

                                    break;
                                }

                                if (curPrice === 0) {
                                    // Tells user there's no buy orders for the edition the user wants to sell
                                    await Replies.handleReply(
                                        inter,
                                        strConfig.marketNoEditionOrders,
                                        colorConfig.error,
                                        undefined,
                                        undefined,
                                        true
                                    );

                                    failedSale = true;
                                    return;
                                }
                            }

                            if (this.modalData[1] > curPrice) {
                                // Tells user the price changed not in their favor
                                await Replies.handleReply(
                                    inter,
                                    strConfig.marketUpdatedInstaSell.replace('%@', curPrice.toLocaleString()),
                                    colorConfig.error,
                                    undefined,
                                    undefined,
                                    true
                                );

                                this.modalData[1] = curPrice;
                                undoRed = false;
                                failedSale = true;
                                return;
                            }

                            // Fills buy orders that were grabbed and also adds edition data
                            for (let i=0; i<orderFillAmounts.length; i++) {
                                if (itemData.type === 'boars') {
                                    const editions = this.boarUser.itemCollection.boars[itemData.id].editions;

                                    const editionIndex = editions.length - orderFillAmounts[i];
                                    const editionLength = editions.length;

                                    newItemData.buyers[i].editions = newItemData.buyers[i].editions.concat(
                                        this.boarUser.itemCollection.boars[itemData.id].editions.splice(
                                            editionIndex, editionLength
                                        )
                                    ).sort((a: number, b: number) => {
                                        return a - b;
                                    });

                                    newItemData.buyers[i].editionDates = newItemData.buyers[i].editionDates.concat(
                                        this.boarUser.itemCollection.boars[itemData.id].editionDates.splice(
                                            editionIndex, editionLength
                                        )
                                    ).sort((a: number, b: number) => {
                                        return a - b;
                                    });
                                }

                                newItemData.buyers[i].filledAmount += orderFillAmounts[i];

                                if (i === orderFillAmounts.length-1) {
                                    newItemData.lastBuys[1] = newItemData.buyers[i].price;
                                }
                            }

                            // Fills buy order for special boar edition
                            if (editionOrderIndex >= 0) {
                                const editionIndex = this.boarUser.itemCollection.boars[itemData.id].editions
                                    .indexOf(this.curEdition);

                                this.boarUser.itemCollection.boars[itemData.id].editions.splice(editionIndex, 1);

                                const newEditionDates = newItemData.buyers[editionOrderIndex].editionDates;

                                newItemData.buyers[editionOrderIndex].editionDates = newEditionDates.concat(
                                    this.boarUser.itemCollection.boars[itemData.id].editionDates.splice(
                                        editionIndex, 1
                                    )
                                ).sort((a: number, b: number) => {
                                    return a - b;
                                });

                                newItemData.buyers[editionOrderIndex].filledAmount = 1;

                                this.curEdition = 0;
                            }

                            // Sets best buy price for item sold
                            if (!isSpecial) {
                                itemsData[itemData.type][itemData.id].lastBuys[0] = 0;
                                itemsData[itemData.type][itemData.id].lastBuys[2] = '';

                                for (const possibleOrder of itemsData[itemData.type][itemData.id].buyers) {
                                    const isFilled = possibleOrder.num === possibleOrder.filledAmount;
                                    const isExpired = possibleOrder.listTime +
                                        this.config.numberConfig.orderExpire < Date.now();

                                    if (!isFilled && !isExpired) {
                                        itemsData[itemData.type][itemData.id].lastBuys[0] = possibleOrder.price;
                                        itemsData[itemData.type][itemData.id].lastBuys[2] = possibleOrder.userID;

                                        break;
                                    }
                                }
                            }

                            DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
                            await this.getPricingData();
                            await this.imageGen.updateInfo(
                                this.pricingData, this.userBuyOrders, this.userSellOrders, this.config
                            );
                        } catch (err: unknown) {
                            failedSale = true;
                            await LogDebug.handleError(err, inter);
                        }
                    }, 'market_insta_s' + inter.id + 'global').catch((err: unknown) => {
                        throw err;
                    });

                    const isOwnOrder = userIDs.includes(this.firstInter.user.id);

                    if (!failedSale) {
                        LogDebug.log(
                            `Sold ${this.modalData[0]} of ${itemData.id} for ${prices} to ${userIDs}`,
                            this.config,
                            inter,
                            true
                        );

                        if (itemData.type === 'boars') {
                            this.boarUser.itemCollection.boars[itemData.id].num -= this.modalData[0];
                            this.boarUser.stats.general.totalBoars -= this.modalData[0];
                        } else {
                            this.boarUser.itemCollection.powerups[itemData.id].numTotal -= this.modalData[0];
                        }

                        if (!isOwnOrder) {
                            const collectBucksIndex = questData.curQuestIDs.indexOf('collectBucks');
                            this.boarUser.stats.quests.progress[collectBucksIndex] += this.modalData[1];
                        }

                        this.boarUser.stats.general.boarScore += this.modalData[1];
                        await this.boarUser.orderBoars(this.compInter, this.config);
                        this.boarUser.updateUserData();

                        await Queue.addQueue(async () => {
                            DataHandlers.updateLeaderboardData(this.boarUser, this.config, inter)
                        }, 'market_insta_s_top' + inter.id + this.boarUser.user.id + 'global').catch((err: unknown) => {
                            throw err;
                        });

                        // Tells user they successfully sold their item(s)
                        await Replies.handleReply(
                            inter, strConfig.marketInstaComplete, colorConfig.green, undefined, undefined, true
                        );
                    }
                } else if (this.curEdition > 0) {
                    // Tells user there's no buy order for the edition they're trying to sell
                    await Replies.handleReply(
                        inter, strConfig.marketNoEdition, colorConfig.error, undefined, undefined, true
                    );
                } else {
                    // Tells user there's no buy order for the items they're trying to sell
                    await Replies.handleReply(
                        inter, strConfig.marketNoItems, colorConfig.error, undefined, undefined, true
                    );
                }
            }

            if (undoRed) {
                this.undoRedButtons();
            }

            if (!showModal) {
                this.showMarket();
            }

            return showModal;
        } catch (err: unknown) {
            await LogDebug.handleError(err, inter);
            return false;
        }
    }

    /**
     * Handles all logic for Buy Order and Sell Offer button pressing.
     * Returns whether to show a modal
     *
     * @param inter - The interaction to reply to
     * @param isBuyOrder - If setting up buy order
     * @param isSellOrder - If setting up sell order
     * @return Whether to show modal to user
     * @private
     */
    private async canOrderModal(
        inter: MessageComponentInteraction,
        isBuyOrder: boolean,
        isSellOrder: boolean
    ): Promise<boolean> {
        try {
            this.boarUser.refreshUserData();
            const itemData = this.pricingData[this.curPage];
            let showModal = true;

            const strConfig = this.config.stringConfig;
            const colorConfig = this.config.colorConfig;

            const itemRarity = BoarUtils.findRarity(itemData.id, this.config);
            const isSpecial = itemRarity[1].name === 'Special' && itemRarity[0] !== 0;

            const boarData = this.boarUser.itemCollection.boars[itemData.id];
            const powData = this.boarUser.itemCollection.powerups[itemData.id];

            const hasNoBoar = isSellOrder && itemData.type === 'boars' && (!boarData || boarData.num === 0);
            const hasNoPow = isSellOrder && itemData.type === 'powerups' && (!powData || powData.numTotal === 0);

            const maxOrders = this.config.numberConfig.marketMaxOrders;
            const atMaxOrders = this.userBuyOrders.length + this.userSellOrders.length >= maxOrders;

            if (hasNoBoar || hasNoPow) {
                await inter.deferUpdate();
                showModal = false;

                // Tells user they don't have the required item to set up a buy order
                await Replies.handleReply(
                    inter, strConfig.marketNoItems, colorConfig.error, undefined, undefined, true
                );
            } else if (atMaxOrders) {
                await inter.deferUpdate();
                showModal = false;

                // Tells user they've hit the maximum number of orders
                await Replies.handleReply(
                    inter, strConfig.marketMaxOrders, colorConfig.error, undefined, undefined, true
                );
            } else if (isBuyOrder && (this.optionalRows[1].components[0] as ButtonBuilder).data.style === 4) {
                await inter.deferUpdate();
                showModal = false;

                if (this.boarUser.stats.general.boarScore >= this.modalData[0] * this.modalData[1]) {
                    await Queue.addQueue(async () => {
                        try {
                            const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;
                            const order = {
                                userID: inter.user.id,
                                num: this.modalData[0],
                                price: this.modalData[1],
                                editions: this.modalData[2] > 0 ? [this.modalData[2]] : [],
                                editionDates: [],
                                listTime: Date.now(),
                                filledAmount: 0,
                                claimedAmount: 0
                            } as BuySellData;

                            // Adds user's buy order to orders

                            itemsData[itemData.type][itemData.id].buyers.push(order);
                            itemsData[itemData.type][itemData.id].buyers.sort((a: BuySellData, b: BuySellData) => {
                                return b.price - a.price;
                            });

                            // Sets best buy order information
                            if (!isSpecial) {
                                let highestBuyOrder = new BuySellData();

                                const numBuyOrders = itemsData[itemData.type][itemData.id].buyers.length;

                                for (let i=0; i<numBuyOrders; i++) {
                                    const buyData = itemsData[itemData.type][itemData.id].buyers[i];
                                    const ordExpireDur = this.config.numberConfig.orderExpire;
                                    const isExpired = buyData.listTime + ordExpireDur < Date.now();
                                    const isFilled = buyData.num === buyData.filledAmount;

                                    if (!isExpired && !isFilled) {
                                        highestBuyOrder = buyData;
                                        break;
                                    }
                                }

                                itemsData[itemData.type][itemData.id].lastBuys[0] = highestBuyOrder.price;
                                itemsData[itemData.type][itemData.id].lastBuys[2] = highestBuyOrder.userID;
                            }

                            DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
                            await this.getPricingData();
                            await this.imageGen.updateInfo(
                                this.pricingData, this.userBuyOrders, this.userSellOrders, this.config
                            );
                        } catch (err: unknown) {
                            await LogDebug.handleError(err, inter);
                        }
                    }, 'market_order_b' + inter.id + 'global').catch((err: unknown) => {
                        throw err;
                    });

                    this.boarUser.stats.general.boarScore -= this.modalData[0] * this.modalData[1];
                    await this.boarUser.orderBoars(this.compInter, this.config);
                    this.boarUser.updateUserData();

                    await Queue.addQueue(async () => {
                        DataHandlers.updateLeaderboardData(this.boarUser, this.config, inter)
                    }, 'market_order_b_top' + inter.id + this.boarUser.user.id + 'global').catch((err: unknown) => {
                        throw err;
                    });

                    // Tells user they successfully set up buy order
                    await Replies.handleReply(
                        inter, strConfig.marketOrderComplete, colorConfig.green, undefined, undefined, true
                    );
                } else {
                    // Tells user they don't have enough bucks to set up buy order
                    await Replies.handleReply(
                        inter, strConfig.marketNoBucks, colorConfig.error, undefined, undefined, true
                    );
                }
            } else if (isSellOrder && (this.optionalRows[1].components[1] as ButtonBuilder).data.style === 4) {
                await inter.deferUpdate();
                showModal = false;

                const hasEdition = this.modalData[2] > 0 &&
                    this.boarUser.itemCollection.boars[itemData.id].num >= this.modalData[0] &&
                    this.boarUser.itemCollection.boars[itemData.id].editions.includes(this.modalData[2]);
                const hasBoars = itemData.type === 'boars' &&
                    this.boarUser.itemCollection.boars[itemData.id].num >= this.modalData[0];
                const hasPows = itemData.type === 'powerups' &&
                    this.boarUser.itemCollection.powerups[itemData.id].numTotal >= this.modalData[0];

                if (hasEdition || hasBoars || hasPows) {
                    // Assumes it's impossible to have more than 1000 unique editions for a boar
                    let editionIndex = 1000;

                    if (itemData.type === 'boars') {
                        // If selling a specific edition, get the index of it
                        // If selling items that have hidden editions, grab the higher editions first
                        editionIndex = this.modalData[2] > 0
                            ? this.boarUser.itemCollection.boars[itemData.id].editions.indexOf(this.modalData[2])
                            : this.boarUser.itemCollection.boars[itemData.id].num - this.modalData[0];
                    }

                    await Queue.addQueue(async () => {
                        try {
                            const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;

                            // Removes editions from user's inventory on sell order
                            // 100 used since max edition for non-specials is 100

                            const editions = itemData.type === 'boars'
                                ? this.boarUser.itemCollection.boars[itemData.id]
                                    .editions.splice(editionIndex, this.modalData[2] > 0 ? 1 : 100)
                                : [];
                            const editionDates = itemData.type === 'boars'
                                ? this.boarUser.itemCollection.boars[itemData.id]
                                    .editionDates.splice(editionIndex, this.modalData[2] > 0 ? 1 : 100)
                                : [];

                            const order = {
                                userID: inter.user.id,
                                num: this.modalData[0],
                                price: this.modalData[1],
                                editions: editions,
                                editionDates: editionDates,
                                listTime: Date.now(),
                                filledAmount: 0,
                                claimedAmount: 0
                            } as BuySellData;

                            // Adds order to sell orders

                            itemsData[itemData.type][itemData.id].sellers.push(order);
                            itemsData[itemData.type][itemData.id].sellers.sort((a: BuySellData, b: BuySellData) => {
                                return a.price - b.price;
                            });

                            // Updates best sell price if not a special
                            if (!isSpecial) {
                                let lowestSellOrder = new BuySellData();

                                for (let i=0; i<itemsData[itemData.type][itemData.id].sellers.length; i++) {
                                    const sellData = itemsData[itemData.type][itemData.id].sellers[i];
                                    const ordExpireDur = this.config.numberConfig.orderExpire;
                                    const isExpired = sellData.listTime + ordExpireDur < Date.now();
                                    const isFilled = sellData.num === sellData.filledAmount;

                                    if (!isExpired && !isFilled) {
                                        lowestSellOrder = sellData;

                                        break;
                                    }
                                }

                                itemsData[itemData.type][itemData.id].lastSells[0] = lowestSellOrder.price;
                                itemsData[itemData.type][itemData.id].lastSells[2] = lowestSellOrder.userID;
                            }

                            DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
                            await this.getPricingData();
                            await this.imageGen.updateInfo(
                                this.pricingData, this.userBuyOrders, this.userSellOrders, this.config
                            );
                        } catch (err: unknown) {
                            await LogDebug.handleError(err, inter);
                        }
                    }, 'market_order_s' + inter.id + 'global').catch((err: unknown) => {
                        throw err;
                    });

                    if (itemData.type === 'boars') {
                        this.boarUser.itemCollection.boars[itemData.id].num -= this.modalData[0];
                        this.boarUser.stats.general.totalBoars -= this.modalData[0];
                    } else {
                        this.boarUser.itemCollection.powerups[itemData.id].numTotal -= this.modalData[0];
                    }

                    await this.boarUser.orderBoars(this.compInter, this.config);
                    this.boarUser.updateUserData();

                    await Queue.addQueue(async () => {
                        DataHandlers.updateLeaderboardData(this.boarUser, this.config, inter)
                    }, 'market_order_s_top' + inter.id + this.boarUser.user.id + 'global').catch((err: unknown) => {
                        throw err;
                    });

                    // Tells user they successfully set up sell order
                    await Replies.handleReply(
                        inter, strConfig.marketOrderComplete, colorConfig.green, undefined, undefined, true
                    );
                } else if (this.modalData[2] > 0) {
                    // Tells user they don't have the edition they're trying to sell
                    await Replies.handleReply(
                        inter, strConfig.marketNoEdition, colorConfig.error, undefined, undefined, true
                    );
                } else {
                    // Tells user they don't have enough items to make sell order
                    await Replies.handleReply(
                        inter, strConfig.marketNoItems, colorConfig.error, undefined, undefined, true
                    );
                }
            }

            this.undoRedButtons();

            if (!showModal) {
                this.showMarket();
            }

            return showModal;
        } catch (err: unknown) {
            await LogDebug.handleError(err, inter);
            return false;
        }
    }

    /**
     * Handles all logic for Update button press.
     * Returns whether to show modal
     *
     * @param inter - The interaction to reply to
     * @return Whether to show modal to user
     * @private
     */
    private async canUpdateModal(inter: MessageComponentInteraction): Promise<boolean> {
        try {
            this.boarUser.refreshUserData();

            let showModal = true;
            let orderInfo: {
                data: BuySellData,
                id: string,
                type: string,
                lastBuys: [number, number, string],
                lastSells: [number, number, string]
            };
            let isSell = false;

            const strConfig = this.config.stringConfig;
            const colorConfig = this.config.colorConfig;

            // Finds order that's currently selected
            if (this.curPage < this.userBuyOrders.length) {
                orderInfo = this.userBuyOrders[this.curPage];
            } else {
                isSell = true;
                orderInfo = this.userSellOrders[this.curPage - this.userBuyOrders.length];
            }

            const itemRarity = BoarUtils.findRarity(orderInfo.id, this.config);
            const isSpecial = itemRarity[1].name === 'Special' && itemRarity[0] !== 0;
            let foundOrder = false;

            await Queue.addQueue(async () => {
                try {
                    const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;

                    const buyOrders = itemsData[orderInfo.type][orderInfo.id].buyers;
                    const sellOrders = itemsData[orderInfo.type][orderInfo.id].sellers;

                    // Attempts to get up-to-date buy order info and update it
                    for (let i=0; i<buyOrders.length && !isSell; i++) {
                        const buyOrder = buyOrders[i];
                        const isSameOrder = buyOrder.userID === orderInfo.data.userID &&
                            buyOrder.listTime === orderInfo.data.listTime;
                        const canUpdate = orderInfo.data.filledAmount === buyOrder.filledAmount;

                        // Attempts to update order if found and doesn't have unclaimed items
                        if (isSameOrder && canUpdate) {
                            if ((this.optionalRows[3].components[1] as ButtonBuilder).data.style === 4) {
                                await inter.deferUpdate();
                                showModal = false;
                                foundOrder = true;

                                const bucksNeeded = (this.modalData[1] - buyOrder.price) *
                                    (buyOrder.num - buyOrder.filledAmount);

                                if (bucksNeeded > this.boarUser.stats.general.boarScore) {
                                    // Tells user they don't have enough bucks for their update
                                    await Replies.handleReply(
                                        inter, strConfig.marketNoBucks, colorConfig.error, undefined, undefined, true
                                    );
                                } else {
                                    this.boarUser.stats.general.boarScore -= (this.modalData[1] - buyOrder.price) *
                                        (buyOrder.num - buyOrder.filledAmount);
                                    await this.boarUser.orderBoars(this.compInter, this.config);
                                    this.boarUser.updateUserData();

                                    // Updates order info

                                    itemsData[orderInfo.type][orderInfo.id].buyers[i].price = this.modalData[1];
                                    itemsData[orderInfo.type][orderInfo.id].buyers[i].listTime = Date.now();

                                    const newOrderData = itemsData[orderInfo.type][orderInfo.id].buyers.splice(i, 1)[0];
                                    itemsData[orderInfo.type][orderInfo.id].buyers.push(newOrderData);

                                    // Resorts buy orders to put best orders first
                                    itemsData[orderInfo.type][orderInfo.id].buyers
                                        .sort((a: BuySellData, b: BuySellData) => {
                                            return b.price - a.price;
                                        });

                                    // Updates the best buy order if it's not a special
                                    if (!isSpecial) {
                                        let highestBuyOrder = new BuySellData();

                                        const numBuyOrders = itemsData[orderInfo.type][orderInfo.id].buyers.length;

                                        for (let i=0; i<numBuyOrders; i++) {
                                            const buyData = itemsData[orderInfo.type][orderInfo.id].buyers[i];
                                            const ordExpireDur = this.config.numberConfig.orderExpire;
                                            const isExpired = buyData.listTime + ordExpireDur < Date.now();
                                            const isFilled = buyData.num === buyData.filledAmount;

                                            if (!isExpired && !isFilled) {
                                                highestBuyOrder = buyData;

                                                break;
                                            }
                                        }

                                        itemsData[orderInfo.type][orderInfo.id].lastBuys[0] = highestBuyOrder.price;
                                        itemsData[orderInfo.type][orderInfo.id].lastBuys[2] = highestBuyOrder.userID;
                                    }

                                    // Tells user they successfully updated their order
                                    await Replies.handleReply(
                                        inter,
                                        strConfig.marketUpdateComplete,
                                        colorConfig.green,
                                        undefined,
                                        undefined,
                                        true
                                    );
                                }
                            } else {
                                foundOrder = true;
                            }

                            break;
                        } else if (isSameOrder) {
                            await inter.deferUpdate();
                            showModal = false;
                            foundOrder = true;

                            // Tells user they have items to claim before they can update
                            await Replies.handleReply(
                                inter, strConfig.marketMustClaim, colorConfig.error, undefined, undefined, true
                            );

                            break;
                        }
                    }

                    // Attempts to get up-to-date sell order info and update it
                    for (let i=0; i<sellOrders.length && isSell; i++) {
                        const sellOrder = sellOrders[i];
                        const isSameOrder = sellOrder.userID === orderInfo.data.userID &&
                            sellOrder.listTime === orderInfo.data.listTime;
                        const canUpdate = orderInfo.data.filledAmount === sellOrder.filledAmount;

                        // Attempts to update order if found and doesn't have unclaimed items
                        if (isSameOrder && canUpdate) {
                            if ((this.optionalRows[3].components[1] as ButtonBuilder).data.style === 4) {
                                await inter.deferUpdate();
                                showModal = false;
                                foundOrder = true;

                                // Updates order info

                                itemsData[orderInfo.type][orderInfo.id].sellers[i].price = this.modalData[1];
                                itemsData[orderInfo.type][orderInfo.id].sellers[i].listTime = Date.now();

                                const newOrderData = itemsData[orderInfo.type][orderInfo.id].sellers.splice(i, 1)[0];
                                itemsData[orderInfo.type][orderInfo.id].sellers.push(newOrderData);

                                // Resorts sell orders to put best orders first
                                itemsData[orderInfo.type][orderInfo.id].sellers
                                    .sort((a: BuySellData, b: BuySellData) => {
                                        return a.price - b.price;
                                    });

                                // Updates the best sell order if it's not a special
                                if (!isSpecial) {
                                    let lowestSellOrder = new BuySellData();

                                    const numSellOrders = itemsData[orderInfo.type][orderInfo.id].sellers.length;

                                    for (let i=0; i<numSellOrders; i++) {
                                        const sellData = itemsData[orderInfo.type][orderInfo.id].sellers[i];
                                        const isExpired = sellData.listTime +
                                            this.config.numberConfig.orderExpire < Date.now();
                                        const isFilled = sellData.num === sellData.filledAmount;

                                        if (!isExpired && !isFilled) {
                                            lowestSellOrder = sellData;

                                            break;
                                        }
                                    }

                                    itemsData[orderInfo.type][orderInfo.id].lastSells[0] = lowestSellOrder.price;
                                    itemsData[orderInfo.type][orderInfo.id].lastSells[2] = lowestSellOrder.userID;
                                }

                                // Tells user they successfully updated their sell order
                                await Replies.handleReply(
                                    inter, strConfig.marketUpdateComplete, colorConfig.green, undefined, undefined, true
                                );
                            } else {
                                foundOrder = true;
                            }

                            break;
                        } else if (isSameOrder) {
                            await inter.deferUpdate();
                            showModal = false;
                            foundOrder = true;

                            // Tells user they have bucks to claim before they can update
                            await Replies.handleReply(
                                inter, strConfig.marketMustClaim, colorConfig.error, undefined, undefined, true
                            );

                            break;
                        }
                    }

                    DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
                    await this.getPricingData();
                    await this.imageGen.updateInfo(
                        this.pricingData, this.userBuyOrders, this.userSellOrders, this.config
                    );
                } catch (err: unknown) {
                    await LogDebug.handleError(err, this.compInter);
                }
            }, 'market_update_2' + this.compInter.id + 'global').catch((err: unknown) => {
                throw err;
            });

            this.undoRedButtons();

            showModal = showModal && foundOrder;

            if (!showModal) {
                await this.showMarket();
            }

            return showModal;
        } catch (err: unknown) {
            await LogDebug.handleError(err, inter);
            return false;
        }
    }

    /**
     * Handles when the collection for navigating through market is finished
     *
     * @param reason - Why the collection ended
     * @private
     */
    private async handleEndCollect(reason: string): Promise<void> {
        try {
            this.hasStopped = true;
            delete CollectorUtils.marketCollectors[this.firstInter.user.id];

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
     * Gets all pricing data and user's orders
     *
     * @private
     */
    private async getPricingData(): Promise<void> {
        const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;
        const curItem = this.pricingData.length > 0
            ? this.pricingData[this.curPage]
            : undefined;

        this.pricingData = [];
        this.pricingDataSearchArr = [];
        this.userBuyOrders = [];
        this.userSellOrders = [];

        // Loops through each item and gets its most recent buy and sell data
        for (const itemType of Object.keys(itemsData)) {
            for (const itemID of Object.keys(itemsData[itemType])) {
                this.pricingData.push({
                    id: itemID,
                    type: itemType,
                    buyers: itemsData[itemType][itemID].buyers,
                    sellers: itemsData[itemType][itemID].sellers,
                    lastBuys: itemsData[itemType][itemID].lastBuys,
                    lastSells: itemsData[itemType][itemID].lastSells
                });

                this.pricingDataSearchArr.push([
                    this.config.itemConfigs[itemType][itemID].name.toLowerCase().replace(/\s+/g, ''),
                    this.pricingData.length
                ]);
            }
        }

        // Loops through grabbed recent buy and sell data and gets orders that are from current user
        for (const priceData of this.pricingData) {
            for (const sellData of priceData.sellers) {
                if (sellData.userID !== this.firstInter.user.id) continue;
                this.userSellOrders.push({
                    data: sellData,
                    id: priceData.id,
                    type: priceData.type,
                    lastBuys: priceData.lastBuys,
                    lastSells: priceData.lastSells
                });
            }

            for (const buyData of priceData.buyers) {
                if (buyData.userID !== this.firstInter.user.id) continue;
                this.userBuyOrders.push({
                    data: buyData,
                    id: priceData.id,
                    type: priceData.type,
                    lastBuys: priceData.lastBuys,
                    lastSells: priceData.lastSells
                });
            }
        }

        // Brings the user back to the item they were on since it could've changed
        while (this.curView === View.BuySell && curItem && this.pricingData[this.curPage].id !== curItem.id) {
            this.curPage++;
        }
    }

    /**
     * Sends a modal with the right title and id based on user input
     *
     * @param inter - Used to show the modal and create/remove listener
     * @private
     */
    private async modalHandle(inter: MessageComponentInteraction): Promise<void> {
        const modals = this.config.commandConfigs.boar.market.modals;
        const marketRowConfig = this.config.commandConfigs.boar.market.componentFields;
        let modalNum = 0;
        let modalTitle = modals[0].title;

        const isInstaBuy = inter.customId.startsWith(marketRowConfig[1][0].components[0].customId);
        const isInstaSell = inter.customId.startsWith(marketRowConfig[1][0].components[1].customId);
        const isBuyOrder = inter.customId.startsWith(marketRowConfig[1][1].components[0].customId);
        const isSellOrder = inter.customId.startsWith(marketRowConfig[1][1].components[1].customId);
        const isUpdate = inter.customId.startsWith(marketRowConfig[1][3].components[1].customId);

        const itemType = !isUpdate
            ? this.pricingData[this.curPage].type
            : this.userBuyOrders.concat(this.userSellOrders)[this.curPage].type;
        const itemID = !isUpdate
            ? this.pricingData[this.curPage].id
            : this.userBuyOrders.concat(this.userSellOrders)[this.curPage].id;
        const itemData = this.config.itemConfigs[itemType][itemID];
        const itemRarity = BoarUtils.findRarity(itemID, this.config);
        const isSpecial = itemRarity[1].name === 'Special' && itemRarity[0] !== 0;

        let updateEdition = 0;

        if (isUpdate && isSpecial) {
            updateEdition = this.userBuyOrders.concat(this.userSellOrders)[this.curPage].data.editions[0];
        }

        if ((isInstaBuy || isInstaSell) && !isSpecial) {
            modalNum = 1;
            modalTitle = (isInstaBuy
                ? marketRowConfig[1][0].components[0].label
                : marketRowConfig[1][0].components[1].label) + ': ' + itemData.pluralName;
        }

        if ((isInstaBuy || isInstaSell) && isSpecial) {
            modalNum = 2;
            modalTitle = (isInstaBuy
                ? marketRowConfig[1][0].components[0].label
                : marketRowConfig[1][0].components[1].label) + ': ' + itemData.name + ' #' + this.curEdition;
        }

        if ((isBuyOrder || isSellOrder) && !isSpecial) {
            modalNum = 3;
            modalTitle = (isBuyOrder
                ? marketRowConfig[1][1].components[0].label
                : marketRowConfig[1][1].components[1].label) + ': ' + itemData.pluralName;
        }

        if ((isBuyOrder || isSellOrder) && isSpecial) {
            modalNum = 4;
            modalTitle = (isBuyOrder
                ? marketRowConfig[1][1].components[0].label
                : marketRowConfig[1][1].components[1].label) + ': ' + itemData.name;
        }

        if (isUpdate) {
            modalNum = 5;
            modalTitle = modals[modalNum].title + itemData.name + (isSpecial
                ? ' #' + updateEdition
                : '')
        }

        this.modalShowing = new ModalBuilder(modals[modalNum]);
        this.modalShowing.setCustomId(modals[modalNum].customId + '|' + inter.id);
        this.modalShowing.setTitle(modalTitle);
        await inter.showModal(this.modalShowing);

        if (modalNum === 0) {
            this.curModalListener = this.modalListenerPage;
        } else if (modalNum === 1) {
            this.curModalListener = this.modalListenerInsta;
        } else if (modalNum === 2) {
            this.curModalListener = this.modalListenerInstaSpecial;
        } else if (modalNum === 3) {
            this.curModalListener = this.modalListenerOrder;
        } else if (modalNum === 4) {
            this.curModalListener = this.modalListenerOrderSpecial;
        } else {
            this.curModalListener = this.modalListenerUpdate;
        }

        inter.client.on(Events.InteractionCreate, this.curModalListener);
    }

    /**
     * Handles page input that was input in modal
     *
     * @param submittedModal - The interaction to respond to
     * @private
     */
    private modalListenerPage = async (submittedModal: Interaction): Promise<void> => {
        try  {
            if (!await this.beginModal(submittedModal)) return;
            submittedModal = submittedModal as ModalSubmitInteraction;

            const submittedPage = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input value: ` + submittedPage, this.config, this.firstInter
            );

            // Convert page input into actual page

            let pageVal = 1;
            if (!Number.isNaN(parseInt(submittedPage))) {
                pageVal = parseInt(submittedPage);
            } else if (this.curView === View.Overview) {
                // Maps boar search value to its overview page index
                const overviewSearchArr = this.pricingDataSearchArr.map((val: [name: string, index: number]) => {
                    return [val[0], Math.ceil(val[1] / this.config.numberConfig.marketPerPage)] as [string, number];
                });

                pageVal = BoarUtils.getClosestName(submittedPage.toLowerCase().replace(/\s+/g, ''), overviewSearchArr);
            } else if (this.curView === View.BuySell) {
                pageVal = BoarUtils.getClosestName(
                    submittedPage.toLowerCase().replace(/\s+/g, ''), this.pricingDataSearchArr
                );
            }

            this.setPage(pageVal);

            await this.showMarket();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Handles input for a buy now or sell now
     *
     * @param submittedModal - The interaction to respond to
     */
    private modalListenerInsta = async (submittedModal: Interaction): Promise<void> => {
        try {
            if (!await this.beginModal(submittedModal)) return;
            submittedModal = submittedModal as ModalSubmitInteraction;

            const strConfig = this.config.stringConfig;
            const colorConfig = this.config.colorConfig;

            const isInstaBuy = this.modalShowing.data.title?.startsWith(
                this.config.commandConfigs.boar.market.componentFields[1][0].components[0].label
            );
            const responseStr = isInstaBuy ? strConfig.marketConfirmInstaBuy : strConfig.marketConfirmInstaSell;

            const submittedNum = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input value: ` + submittedNum, this.config, this.firstInter
            );

            let numVal = 0;

            if (!Number.isNaN(parseInt(submittedNum))) {
                numVal = parseInt(submittedNum);
            }

            if (numVal <= 0) {
                // Tells user the amount they entered is bad
                await Replies.handleReply(
                    submittedModal, strConfig.marketInvalid, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            this.boarUser.refreshUserData();

            await this.getPricingData();
            await this.imageGen.updateInfo(this.pricingData, this.userBuyOrders, this.userSellOrders, this.config);

            const itemData = this.pricingData[this.curPage];

            const hasNoBoars = itemData.type === 'boars' && this.boarUser.itemCollection.boars[itemData.id] &&
                this.boarUser.itemCollection.boars[itemData.id].num < numVal;
            const hasNoPows = itemData.type === 'powerups' &&
                this.boarUser.itemCollection.powerups[itemData.id].numTotal < numVal;

            if (!isInstaBuy && (hasNoBoars || hasNoPows)) {
                // Tells user they don't have enough items for their sell
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoItems, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            let numGrabbed = 0;
            let curPrice = 0;
            let curIndex = 0;

            // Attempts to grab the price of items based on amount input
            while (numGrabbed < numVal) {
                let numToAdd = 0;

                if (isInstaBuy && curIndex < itemData.sellers.length) {
                    numToAdd = Math.min(
                        numVal - numGrabbed,
                        itemData.sellers[curIndex].listTime + this.config.numberConfig.orderExpire < Date.now()
                            ? 0
                            : itemData.sellers[curIndex].num - itemData.sellers[curIndex].filledAmount
                    );

                    curPrice += itemData.sellers[curIndex].price * numToAdd;
                } else if (curIndex < itemData.buyers.length) {
                    numToAdd = Math.min(
                        numVal - numGrabbed,
                        itemData.buyers[curIndex].listTime + this.config.numberConfig.orderExpire < Date.now()
                            ? 0
                            : itemData.buyers[curIndex].num - itemData.buyers[curIndex].filledAmount
                    );

                    curPrice += itemData.buyers[curIndex].price * numToAdd;
                } else {
                    break;
                }

                numGrabbed += numToAdd;
                curIndex++;
            }

            if (numVal !== numGrabbed) {
                // Tells user there's not enough orders to sell/buy to/from
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoOrders, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            const itemName = numVal + 'x ' + (numVal > 1
                ? this.config.itemConfigs[itemData.type][itemData.id].pluralName
                : this.config.itemConfigs[itemData.type][itemData.id].name);

            // Asks the user to confirm their buy/sell with relevant info
            await Replies.handleReply(
                submittedModal,
                responseStr.replace('%@', itemName).replace('%@', curPrice.toLocaleString()),
                colorConfig.font,
                undefined,
                undefined,
                true
            );

            if (isInstaBuy) {
                (this.optionalRows[0].components[0] as ButtonBuilder).setStyle(4);
            } else {
                (this.optionalRows[0].components[1] as ButtonBuilder).setStyle(4);
            }

            this.modalData = [numVal, curPrice, 0];

            await this.showMarket();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Handles input for a buy now or sell now for specials
     *
     * @param submittedModal - The interaction to respond to
     */
    private modalListenerInstaSpecial = async (submittedModal: Interaction): Promise<void> => {
        try  {
            if (!await this.beginModal(submittedModal)) return;
            submittedModal = submittedModal as ModalSubmitInteraction;

            const strConfig = this.config.stringConfig;
            const nums = this.config.numberConfig;
            const colorConfig = this.config.colorConfig;

            const isInstaBuy = this.modalShowing.data.title?.startsWith(
                this.config.commandConfigs.boar.market.componentFields[1][0].components[0].label
            );
            const responseStr = isInstaBuy ? strConfig.marketConfirmInstaBuy : strConfig.marketConfirmInstaSell;

            const submittedNum = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input value: ` + submittedNum, this.config, this.firstInter
            );

            let editionVal = 0;

            if (!Number.isNaN(parseInt(submittedNum))) {
                editionVal = parseInt(submittedNum);
            }

            if (editionVal <= 0) {
                // Tells user the edition they entered is bad
                await Replies.handleReply(
                    submittedModal, strConfig.marketInvalid, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            this.boarUser.refreshUserData();

            await this.getPricingData();
            await this.imageGen.updateInfo(this.pricingData, this.userBuyOrders, this.userSellOrders, this.config);

            const itemData = this.pricingData[this.curPage];

            if (!isInstaBuy && !this.boarUser.itemCollection.boars[itemData.id].editions.includes(this.curEdition)) {
                // Tells user they don't have the edition to sell
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoEdition, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (editionVal !== this.curEdition) {
                // Tells user the edition they entered doesn't match the edition they're on
                await Replies.handleReply(
                    submittedModal, strConfig.marketWrongEdition, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            let curPrice = 0;

            if (isInstaBuy) {
                // Tries to see if sell order for edition exists still
                for (const sellOrder of itemData.sellers) {
                    const noEditionExists = sellOrder.num === sellOrder.filledAmount ||
                        sellOrder.listTime + nums.orderExpire < Date.now() ||
                        sellOrder.editions[0] !== this.curEdition;

                    if (noEditionExists) continue;

                    curPrice = sellOrder.price;

                    break;
                }
            } else {
                // Tries to see if buy order for edition exists still
                for (const buyOrder of itemData.buyers) {
                    const noEditionExists = buyOrder.num === buyOrder.filledAmount ||
                        buyOrder.listTime + nums.orderExpire < Date.now() ||
                        buyOrder.editions[0] !== this.curEdition;

                    if (noEditionExists) continue;

                    curPrice = buyOrder.price;

                    break;
                }
            }

            if (curPrice === 0) {
                // Tells user there's no orders for the edition they're trying to buy/sell
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoEditionOrders, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            const itemName = this.config.itemConfigs[itemData.type][itemData.id].name + ' #' + this.curEdition;

            // Sends user confirmation with relevant details
            await Replies.handleReply(
                submittedModal,
                responseStr.replace('%@', itemName).replace('%@', curPrice.toLocaleString()),
                colorConfig.font,
                undefined,
                undefined,
                true
            );

            if (isInstaBuy) {
                (this.optionalRows[0].components[0] as ButtonBuilder).setStyle(4);
            } else {
                (this.optionalRows[0].components[1] as ButtonBuilder).setStyle(4);
            }

            this.modalData = [1, curPrice, this.curEdition];

            await this.showMarket();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Handles input for a buy order or sell offer
     *
     * @param submittedModal - The interaction to respond to
     */
    private modalListenerOrder = async (submittedModal: Interaction): Promise<void> => {
        try  {
            if (!await this.beginModal(submittedModal)) return;
            submittedModal = submittedModal as ModalSubmitInteraction;

            const strConfig = this.config.stringConfig;
            const colorConfig = this.config.colorConfig;

            const isBuyOrder = this.modalShowing.data.title?.startsWith(
                this.config.commandConfigs.boar.market.componentFields[1][1].components[0].label
            );

            const responseStr = isBuyOrder ? strConfig.marketConfirmBuyOrder : strConfig.marketConfirmSellOrder;

            const submittedNum = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');
            const submittedPrice = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[1].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input values: ${submittedNum}, ${submittedPrice}`,
                this.config,
                this.firstInter
            );

            let numVal = 0;
            let priceVal = 0;

            if (!Number.isNaN(parseInt(submittedNum))) {
                numVal = parseInt(submittedNum);
            }

            if (!Number.isNaN(parseInt(submittedPrice))) {
                priceVal = parseInt(submittedPrice);
            }

            if (numVal <= 0 || priceVal <= 0) {
                // Tells user they input something bad
                await Replies.handleReply(
                    submittedModal, strConfig.marketInvalid, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (isBuyOrder && numVal > 1000) {
                // Tells user they're trying to buy too many items
                await Replies.handleReply(
                    submittedModal, strConfig.marketTooMany, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            this.boarUser.refreshUserData();

            if (this.userBuyOrders.length + this.userSellOrders.length >= this.config.numberConfig.marketMaxOrders) {
                // Tells user they hit the maximum number of orders
                await Replies.handleReply(
                    submittedModal, strConfig.marketMaxOrders, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            await this.getPricingData();
            await this.imageGen.updateInfo(this.pricingData, this.userBuyOrders, this.userSellOrders, this.config);

            const itemData = this.pricingData[this.curPage];

            let minBuyVal: number;
            let maxBuyVal: number;
            let minSellVal: number;
            let maxSellVal: number;

            const hasBestOrder = isBuyOrder && itemData.lastBuys[2] === this.firstInter.user.id ||
                !isBuyOrder && itemData.lastSells[2] === this.firstInter.user.id;

            if (hasBestOrder) {
                // Tells user they currently have the best order
                await Replies.handleReply(
                    submittedModal, strConfig.marketBestOrder, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (itemData.lastBuys[0] === 0) {
                minBuyVal = itemData.lastBuys[1] / this.config.numberConfig.marketRange;
                maxBuyVal = itemData.lastBuys[1] * this.config.numberConfig.marketRange;
            } else {
                minBuyVal = itemData.lastBuys[0] / this.config.numberConfig.marketRange;
                maxBuyVal = itemData.lastBuys[0] * this.config.numberConfig.marketRange;
            }

            if (itemData.lastSells[0] === 0) {
                minSellVal = itemData.lastSells[1] / this.config.numberConfig.marketRange;
                maxSellVal = itemData.lastSells[1] * this.config.numberConfig.marketRange;
            } else {
                minSellVal = itemData.lastSells[0] / this.config.numberConfig.marketRange;
                maxSellVal = itemData.lastSells[0] * this.config.numberConfig.marketRange;
            }

            minSellVal = Math.ceil(minSellVal);
            minBuyVal = Math.ceil(minBuyVal);

            const isTooCheap = isBuyOrder && minBuyVal > 0 && priceVal < minBuyVal ||
                !isBuyOrder && minSellVal > 0 && priceVal < minSellVal;
            const isTooExpensive = isBuyOrder && maxBuyVal > 0 && priceVal > maxBuyVal ||
                !isBuyOrder && maxSellVal > 0 && priceVal > maxSellVal;

            const noBoars = itemData.type === 'boars' && this.boarUser.itemCollection.boars[itemData.id] &&
                this.boarUser.itemCollection.boars[itemData.id].num < numVal;
            const noPows = itemData.type === 'powerups' &&
                this.boarUser.itemCollection.powerups[itemData.id].numTotal < numVal;

            if (isTooCheap) {
                // Tells user the price they tried to set was too low
                await Replies.handleReply(
                    submittedModal,
                    isBuyOrder
                        ? strConfig.marketTooCheap.replace('%@', minBuyVal.toLocaleString())
                        : strConfig.marketTooCheap.replace('%@', minSellVal.toLocaleString()),
                    colorConfig.error,
                    undefined,
                    undefined,
                    true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (isTooExpensive) {
                // Tells user the price they tried to set was too high
                await Replies.handleReply(
                    submittedModal,
                    isBuyOrder
                        ? strConfig.marketTooExpensive.replace('%@', maxBuyVal.toLocaleString())
                        : strConfig.marketTooExpensive.replace('%@', maxSellVal.toLocaleString()),
                    colorConfig.error,
                    undefined,
                    undefined,
                    true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (!isBuyOrder && (noBoars || noPows)) {
                // Tells user they don't have the items to set up the sell order
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoItems, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            const price = priceVal * numVal;

            const leaderboardsData = DataHandlers.getGlobalData(
                DataHandlers.GlobalFile.Leaderboards
            ) as Record<string, BoardData>;

            const bucksBoardData = leaderboardsData['bucks'];
            let maxBucks = this.config.numberConfig.marketMaxBucks;

            // Sets max bucks to top bucks user's bucks times 10
            for (const userID of Object.keys(bucksBoardData.userData)) {
                maxBucks = Math.max(maxBucks, (bucksBoardData.userData[userID] as [string, number])[1] * 10);
            }

            if (!isBuyOrder && (priceVal === null || priceVal > maxBucks)) {
                // Tells user their sell order has too much value
                await Replies.handleReply(
                    submittedModal,
                    strConfig.marketTooHigh.replace('%@', maxBucks.toLocaleString()),
                    colorConfig.error,
                    undefined,
                    undefined,
                    true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (isBuyOrder && price > this.boarUser.stats.general.boarScore) {
                // Tells user they don't have enough bucks for their buy order
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoBucks, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            const itemName = numVal + 'x ' + (numVal > 1
                ? this.config.itemConfigs[itemData.type][itemData.id].pluralName
                : this.config.itemConfigs[itemData.type][itemData.id].name);

            // Sends user confirmation with relevant info
            await Replies.handleReply(
                submittedModal,
                responseStr.replace('%@', itemName).replace('%@', price.toLocaleString()),
                colorConfig.font,
                undefined,
                undefined,
                true
            );

            if (isBuyOrder) {
                (this.optionalRows[1].components[0] as ButtonBuilder).setStyle(4);
            } else {
                (this.optionalRows[1].components[1] as ButtonBuilder).setStyle(4);
            }

            this.modalData = [numVal, priceVal, 0];

            await this.showMarket();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Handles input for a buy order or sell offer for specials
     *
     * @param submittedModal - The interaction to respond to
     */
    private modalListenerOrderSpecial = async (submittedModal: Interaction): Promise<void> => {
        try  {
            if (!await this.beginModal(submittedModal)) return;
            submittedModal = submittedModal as ModalSubmitInteraction;

            const strConfig = this.config.stringConfig;
            const colorConfig = this.config.colorConfig;

            const isBuyOrder = this.modalShowing.data.title?.startsWith(
                this.config.commandConfigs.boar.market.componentFields[1][1].components[0].label
            );
            const responseStr = isBuyOrder ? strConfig.marketConfirmBuyOrder : strConfig.marketConfirmSellOrder;

            const submittedEdition = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');
            const submittedPrice = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[1].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input values: ${submittedEdition}, ${submittedPrice}`,
                this.config,
                this.firstInter
            );

            let editionVal = 0;
            let priceVal = 0;

            if (!Number.isNaN(parseInt(submittedEdition))) {
                editionVal = parseInt(submittedEdition);
            }

            if (!Number.isNaN(parseInt(submittedPrice))) {
                priceVal = parseInt(submittedPrice);
            }

            if (editionVal <= 0 || priceVal <= 0) {
                // Tells user they input something bad
                await Replies.handleReply(
                    submittedModal, strConfig.marketInvalid, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            this.boarUser.refreshUserData();

            if (this.userBuyOrders.length + this.userSellOrders.length >= this.config.numberConfig.marketMaxOrders) {
                // Tells user they hit max orders
                await Replies.handleReply(
                    submittedModal, strConfig.marketMaxOrders, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            await this.getPricingData();
            await this.imageGen.updateInfo(this.pricingData, this.userBuyOrders, this.userSellOrders, this.config);

            const itemData = this.pricingData[this.curPage];

            const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;
            const curEdition = itemsData[itemData.type][itemData.id].curEdition as number;

            if (editionVal > curEdition) {
                // Tells user the edition they entered isn't possible to exist
                await Replies.handleReply(
                    submittedModal, strConfig.marketEditionHigh, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            const hasEdition = this.boarUser.itemCollection.boars[itemData.id] &&
                this.boarUser.itemCollection.boars[itemData.id].editions.includes(editionVal);

            if (!isBuyOrder && !hasEdition) {
                // Tells user the edition isn't in market
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoEdition, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            let isSellingEdition = false;

            for (const sellOrder of itemData.sellers) {
                if (sellOrder.userID === this.compInter.user.id && sellOrder.editions[0] === editionVal) {
                    isSellingEdition = true;
                    break;
                }
            }

            if (isBuyOrder && (hasEdition || isSellingEdition)) {
                // Tells user they can't buy an edition they have
                await Replies.handleReply(
                    submittedModal, strConfig.marketHasEdition, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            const leaderboardsData = DataHandlers.getGlobalData(
                DataHandlers.GlobalFile.Leaderboards
            ) as Record<string, BoardData>;

            const bucksBoardData = leaderboardsData['bucks'];
            let maxBucks = this.config.numberConfig.marketMaxBucks;

            // Sets max bucks to top bucks user's bucks times 10
            for (const userID of Object.keys(bucksBoardData.userData)) {
                maxBucks = Math.max(maxBucks, (bucksBoardData.userData[userID] as [string, number])[1] * 10);
            }

            if (!isBuyOrder && priceVal > maxBucks) {
                // Tells user their order is over maximum
                await Replies.handleReply(
                    submittedModal,
                    strConfig.marketTooHigh.replace('%@', maxBucks.toLocaleString()),
                    colorConfig.error,
                    undefined,
                    undefined,
                    true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (isBuyOrder && priceVal > this.boarUser.stats.general.boarScore) {
                // Tells user they don't have enough bucks for their buy order
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoBucks, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            const itemName = this.config.itemConfigs[itemData.type][itemData.id].name + ' #' + editionVal;

            // Sends confirmation to user with relevant info
            await Replies.handleReply(
                submittedModal,
                responseStr.replace('%@', itemName).replace('%@', priceVal.toLocaleString()),
                colorConfig.font,
                undefined,
                undefined,
                true
            );

            if (isBuyOrder) {
                (this.optionalRows[1].components[0] as ButtonBuilder).setStyle(4);
            } else {
                (this.optionalRows[1].components[1] as ButtonBuilder).setStyle(4);
            }

            this.modalData = [1, priceVal, editionVal];

            await this.showMarket();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Handles input for an order price update
     *
     * @param submittedModal - The interaction to respond to
     */
    private modalListenerUpdate = async (submittedModal: Interaction): Promise<void> => {
        try  {
            if (!await this.beginModal(submittedModal)) return;
            submittedModal = submittedModal as ModalSubmitInteraction;

            const strConfig = this.config.stringConfig;
            const colorConfig = this.config.colorConfig;

            const submittedPrice = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            ).toLowerCase().replace(/\s+/g, '');

            LogDebug.log(
                `${submittedModal.customId.split('|')[0]} input value: ` + submittedPrice, this.config, this.firstInter
            );

            let priceVal = 0;

            if (!Number.isNaN(parseInt(submittedPrice))) {
                priceVal = parseInt(submittedPrice);
            }

            if (priceVal <= 0) {
                // Tells user the price they entered is bad
                await Replies.handleReply(
                    submittedModal, strConfig.marketInvalid, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            this.boarUser.refreshUserData();

            await this.getPricingData();
            await this.imageGen.updateInfo(this.pricingData, this.userBuyOrders, this.userSellOrders, this.config);

            const itemData = this.userBuyOrders.concat(this.userSellOrders)[this.curPage];
            const itemRarity = BoarUtils.findRarity(itemData.id, this.config);
            const isSpecial = itemRarity[1].name === 'Special' && itemRarity[0] !== 0;
            const oldPrice = itemData.data.price * (itemData.data.num - itemData.data.filledAmount);
            const newPrice = priceVal * (itemData.data.num - itemData.data.filledAmount);
            const isBuyOrder = this.curPage < this.userBuyOrders.length;
            const responseStr = newPrice > oldPrice
                ? strConfig.marketConfirmUpdateIncrease
                : strConfig.marketConfirmUpdateDecrease;

            const leaderboardsData = DataHandlers.getGlobalData(
                DataHandlers.GlobalFile.Leaderboards
            ) as Record<string, BoardData>;

            const bucksBoardData = leaderboardsData['bucks'];
            let maxBucks = this.config.numberConfig.marketMaxBucks;

            // Gets maximum amount of bucks from top bucks user times 10
            for (const userID of Object.keys(bucksBoardData.userData)) {
                maxBucks = Math.max(maxBucks, (bucksBoardData.userData[userID] as [string, number])[1] * 10);
            }

            let minBuyVal: number;
            let maxBuyVal: number;
            let minSellVal: number;
            let maxSellVal: number;

            const hasBestOrder = isBuyOrder && itemData.lastBuys[2] === this.firstInter.user.id ||
                !isBuyOrder && itemData.lastSells[2] === this.firstInter.user.id;
            const isNotExpired = itemData.data.listTime + this.config.numberConfig.orderExpire >= Date.now();

            if (hasBestOrder && isNotExpired) {
                // Tells user they currently have the best order
                await Replies.handleReply(
                    submittedModal, strConfig.marketBestOrder, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (itemData.lastBuys[0] === 0) {
                minBuyVal = itemData.lastBuys[1] / this.config.numberConfig.marketRange;
                maxBuyVal = itemData.lastBuys[1] * this.config.numberConfig.marketRange;
            } else {
                minBuyVal = itemData.lastBuys[0] / this.config.numberConfig.marketRange;
                maxBuyVal = itemData.lastBuys[0] * this.config.numberConfig.marketRange;
            }

            if (itemData.lastSells[0] === 0) {
                minSellVal = itemData.lastSells[1] / this.config.numberConfig.marketRange;
                maxSellVal = itemData.lastSells[1] * this.config.numberConfig.marketRange;
            } else {
                minSellVal = itemData.lastSells[0] / this.config.numberConfig.marketRange;
                maxSellVal = itemData.lastSells[0] * this.config.numberConfig.marketRange;
            }

            minSellVal = Math.ceil(minSellVal);
            minBuyVal = Math.ceil(minBuyVal);

            const isTooCheap = isBuyOrder && minBuyVal > 0 && priceVal < minBuyVal ||
                !isBuyOrder && minSellVal > 0 && priceVal < minSellVal;
            const isTooExpensive = isBuyOrder && maxBuyVal > 0 && priceVal > maxBuyVal ||
                !isBuyOrder && maxSellVal > 0 && priceVal > maxSellVal;

            if (isTooCheap) {
                // Tells user the price they entered is too low
                await Replies.handleReply(
                    submittedModal,
                    isBuyOrder
                        ? strConfig.marketTooCheap.replace('%@', minBuyVal.toLocaleString())
                        : strConfig.marketTooCheap.replace('%@', minSellVal.toLocaleString()),
                    colorConfig.error,
                    undefined,
                    undefined,
                    true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (isTooExpensive) {
                // Tells user the price they entered is too high
                await Replies.handleReply(
                    submittedModal,
                    isBuyOrder
                        ? strConfig.marketTooExpensive.replace('%@', maxBuyVal.toLocaleString())
                        : strConfig.marketTooExpensive.replace('%@', maxSellVal.toLocaleString()),
                    colorConfig.error,
                    undefined,
                    undefined,
                    true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (!isBuyOrder && (priceVal === null || priceVal > maxBucks)) {
                // Tells user the price they entered is higher than max
                await Replies.handleReply(
                    submittedModal,
                    strConfig.marketTooHigh.replace('%@', maxBucks.toLocaleString()),
                    colorConfig.error,
                    undefined,
                    undefined,
                    true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (isBuyOrder && newPrice - oldPrice > this.boarUser.stats.general.boarScore) {
                // Tells user they don't have enough bucks to update
                await Replies.handleReply(
                    submittedModal, strConfig.marketNoBucks, colorConfig.error, undefined, undefined, true
                );

                this.endModalListener(submittedModal.client);
                return;
            }

            if (itemData.data.filledAmount !== itemData.data.claimedAmount) {
                // Tells user they have items/bucks to claim first
                await Replies.handleReply(
                    submittedModal, strConfig.marketMustClaim, colorConfig.error, undefined, undefined, true
                );
            }

            const itemName = this.config.itemConfigs[itemData.type][itemData.id].name + (isSpecial
                ? ' #' + itemData.data.editions[0]
                : '');

            // Sends user confirmation for update with relevant info
            await Replies.handleReply(
                submittedModal,
                responseStr.replace('%@', itemName).replace('%@', oldPrice.toLocaleString())
                    .replace('%@', newPrice.toLocaleString()),
                colorConfig.font,
                undefined,
                undefined,
                true
            );

            (this.optionalRows[3].components[1] as ButtonBuilder).setStyle(4);

            this.modalData = [0, priceVal, 0];

            await this.showMarket();
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Performs the beginning actions of a modal input
     *
     * @param submittedModal - The interaction to respond to
     * @return Whether modal interaction is valid and can be processed
     * @private
     */
    private async beginModal(submittedModal: Interaction): Promise<boolean> {
        if (submittedModal.user.id !== this.firstInter.user.id) return false;

        const isUserComponentInter = submittedModal.isMessageComponent() &&
            submittedModal.customId.endsWith(this.firstInter.id + '|' + this.firstInter.user.id);
        const maintenanceBlock = this.config.maintenanceMode && !this.config.devs.includes(this.compInter.user.id);

        if (isUserComponentInter || maintenanceBlock) {
            this.endModalListener(submittedModal.client);
            return false;
        }

        // Updates the cooldown to interact again
        const canInteract = await CollectorUtils.canInteract(this.timerVars, Date.now());

        if (!canInteract) {
            this.endModalListener(submittedModal.client);
            return false;
        }

        const invalidSubmittedModal = !submittedModal.isModalSubmit() || this.collector.ended ||
            !submittedModal.guild || submittedModal.customId !== this.modalShowing.data.custom_id;

        if (invalidSubmittedModal) {
            this.endModalListener(submittedModal.client);
            return false;
        }

        await submittedModal.deferUpdate();
        return true;
    }

    /**
     * Ends the current modal being shown
     *
     * @param client - Used to end the modal
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
     * Shows the market image that meets user's inputs
     *
     * @param firstRun - Whether this is the first time this function is being run
     * @private
     */
    private async showMarket(firstRun = false): Promise<void> {
        try {
            if (firstRun) {
                this.initButtons();
            }

            this.disableButtons();

            const nums = this.config.numberConfig;

            const rowsToAdd = [] as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];

            // Sets view to overview if user was in orders but no longer has any
            if (this.userBuyOrders.concat(this.userSellOrders).length === 0 && this.curView === View.UserOrders) {
                this.curView = View.Overview;
            }

            // Enables back button if not on first page
            this.baseRows[0].components[0].setDisabled(this.curPage === 0);

            // Enables search button if there's more than one page
            this.baseRows[0].components[1].setDisabled(
                this.curView === View.Overview && this.maxPageOverview === 0 ||
                this.curView === View.BuySell && this.pricingData.length - 1 === 0 ||
                this.curView === View.UserOrders && this.userBuyOrders.concat(this.userSellOrders).length - 1 === 0
            );

            // Enables next button if not on last page
            this.baseRows[0].components[2].setDisabled(
                this.curView === View.Overview && this.curPage === this.maxPageOverview ||
                this.curView === View.BuySell && this.curPage === this.pricingData.length - 1 ||
                this.curView === View.UserOrders &&
                this.curPage === this.userBuyOrders.concat(this.userSellOrders).length - 1
            );

            // Enables refresh button
            this.baseRows[0].components[3].setDisabled(false);

            // Enables overview button if not on it
            this.baseRows[1].components[0].setDisabled(this.curView === View.Overview);

            // Enables buy/sell button if not on it
            this.baseRows[1].components[1].setDisabled(this.curView === View.BuySell);

            // Enables orders button if not on it and user has orders
            this.baseRows[1].components[2].setDisabled(
                this.curView === View.UserOrders || this.userBuyOrders.concat(this.userSellOrders).length === 0
            );

            if (this.curView === View.BuySell) {
                const item = this.pricingData[this.curPage];
                const itemRarity = BoarUtils.findRarity(item.id, this.config);
                const isSpecial = itemRarity[0] !== 0
                    ? itemRarity[1].name === 'Special'
                    : false;

                rowsToAdd.push(this.optionalRows[0]);
                rowsToAdd.push(this.optionalRows[1]);

                let nonFilledBuys = 0;
                let nonFilledSells = 0;

                // Gets all non-filled sell orders
                for (const sellOrder of item.sellers) {
                    const notFilled = sellOrder.num !== sellOrder.filledAmount &&
                        sellOrder.listTime + nums.orderExpire >= Date.now();

                    if (notFilled) {
                        nonFilledBuys++;
                    }
                }

                // Gets all non-filled buy orders
                for (const buyOrder of item.buyers) {
                    const notFilled = buyOrder.num !== buyOrder.filledAmount &&
                        buyOrder.listTime + nums.orderExpire >= Date.now();

                    if (notFilled) {
                        nonFilledSells++;
                    }
                }

                // Enables insta buy button if there's sell orders
                this.optionalRows[0].components[0].setDisabled(nonFilledBuys === 0);

                // Enables insta sell button if there's buy orders
                this.optionalRows[0].components[1].setDisabled(nonFilledSells === 0);

                // Enables buy order button
                this.optionalRows[1].components[0].setDisabled(false);

                // Enables sell order button
                this.optionalRows[1].components[1].setDisabled(false);

                if (isSpecial) {
                    let selectOptions = [] as SelectMenuComponentOptionData[];
                    const instaBuyEditions = [] as number[];
                    const instaSellEditions = [] as number[];

                    // Gets all non-filled special sell orders to put in select menu
                    for (const sellOrder of item.sellers) {
                        const isFilled = sellOrder.num === sellOrder.filledAmount ||
                            sellOrder.listTime + nums.orderExpire < Date.now();

                        if (isFilled) continue;

                        const editionNum = sellOrder.editions[0] as number;

                        if (!instaBuyEditions.includes(editionNum)) {
                            selectOptions.push({
                                label: 'Edition #' + editionNum,
                                value: editionNum.toString()
                            });
                        }

                        instaBuyEditions.push(editionNum);
                    }

                    // Gets all non-filled special buy orders to put in select menu
                    for (const buyOrder of item.buyers) {
                        const isFilled = buyOrder.num === buyOrder.filledAmount ||
                            buyOrder.listTime + nums.orderExpire < Date.now();

                        if (isFilled) continue;

                        const editionNum = buyOrder.editions[0] as number;

                        if (!instaBuyEditions.includes(editionNum) && !instaSellEditions.includes(editionNum)) {
                            selectOptions.push({
                                label: 'Edition #' + editionNum,
                                value: editionNum.toString()
                            });
                        }

                        instaSellEditions.push(editionNum);
                    }

                    if (selectOptions.length === 0) {
                        selectOptions.push({
                            label: this.config.stringConfig.emptySelect,
                            value: this.config.stringConfig.emptySelect
                        });
                    } else {
                        // Enables select menu for specials
                        this.optionalRows[2].components[0].setDisabled(false);

                        if (this.curEdition === 0 && instaBuyEditions.length > 0) {
                            this.curEdition = instaBuyEditions[0];
                        } else if (this.curEdition === 0) {
                            this.curEdition = instaSellEditions[0];
                        }
                    }

                    selectOptions = selectOptions.slice(0, 25);

                    // Adds options to special select menu
                    (this.optionalRows[2].components[0] as StringSelectMenuBuilder).setOptions(selectOptions);

                    // Enables insta buy on special if there's orders for the edition
                    this.optionalRows[0].components[0].setDisabled(!instaBuyEditions.includes(this.curEdition));

                    // Enables insta sell on special if there's orders for the edition
                    this.optionalRows[0].components[1].setDisabled(!instaSellEditions.includes(this.curEdition));
                    rowsToAdd.push(this.optionalRows[2]);
                }
            }

            if (this.curView === View.UserOrders) {
                const selectOptions = [] as SelectMenuComponentOptionData[];

                // Adds options for select menu for user buy orders
                for (let i=0; i<this.userBuyOrders.length; i++) {
                    const buyOrder = this.userBuyOrders[i];
                    const rarity = BoarUtils.findRarity(buyOrder.id, this.config);
                    const isSpecial = rarity[1].name === 'Special' && rarity[0] !== 0;

                    const itemName = this.config.itemConfigs[buyOrder.type][buyOrder.id].name + (isSpecial
                        ? ' #' + buyOrder.data.editions[0]
                        : '');

                    selectOptions.push({
                        label: 'BUY: ' + itemName + ' [$' + buyOrder.data.price.toLocaleString() + ']',
                        value: i.toString()
                    });
                }

                // Adds options for select menu for user sell orders
                for (let i=this.userBuyOrders.length; i<this.userBuyOrders.length+this.userSellOrders.length; i++) {
                    const sellOrder = this.userSellOrders[i - this.userBuyOrders.length];
                    const rarity = BoarUtils.findRarity(sellOrder.id, this.config);
                    const isSpecial = rarity[1].name === 'Special' && rarity[0] !== 0;

                    const itemName = this.config.itemConfigs[sellOrder.type][sellOrder.id].name + (isSpecial
                        ? ' #' + sellOrder.data.editions[0]
                        : '');

                    selectOptions.push({
                        label: 'SELL: ' + itemName + ' [$' + sellOrder.data.price.toLocaleString() + ']',
                        value: i.toString()
                    });
                }

                if (selectOptions.length === 0) {
                    selectOptions.push({
                        label: this.config.stringConfig.emptySelect,
                        value: this.config.stringConfig.emptySelect
                    });
                } else {
                    // Enables select menu for user orders
                    this.optionalRows[4].components[0].setDisabled(false);
                }

                // Adds options to user orders select menu
                (this.optionalRows[4].components[0] as StringSelectMenuBuilder).setOptions(selectOptions);

                let orderInfo: {
                    data: BuySellData,
                    id: string,
                    type: string,
                    lastBuys: [number, number, string],
                    lastSells: [number, number, string]
                };

                if (this.curPage < this.userBuyOrders.length) {
                    orderInfo = this.userBuyOrders[this.curPage];
                } else {
                    orderInfo = this.userSellOrders[this.curPage - this.userBuyOrders.length];
                }

                // Enables claim button if there's items to claim
                this.optionalRows[3].components[0].setDisabled(
                    orderInfo.data.claimedAmount === orderInfo.data.filledAmount
                );

                const orderUnclaimed = orderInfo.data.filledAmount === orderInfo.data.num ||
                    orderInfo.data.claimedAmount !== orderInfo.data.filledAmount;

                // Enables update and cancel buttons if order doesn't have unclaimed bucks/items
                if (orderUnclaimed) {
                    this.optionalRows[3].components[1].setDisabled(true);
                    this.optionalRows[3].components[2].setDisabled(true);
                    this.undoRedButtons();
                } else {
                    this.optionalRows[3].components[1].setDisabled(false);
                    this.optionalRows[3].components[2].setDisabled(false);
                }

                rowsToAdd.push(this.optionalRows[3]);
                rowsToAdd.push(this.optionalRows[4]);
            }

            let imageToSend: AttachmentBuilder;

            if (this.curView === View.Overview) {
                imageToSend = await this.imageGen.makeOverviewImage(this.curPage);
            } else if (this.curView === View.BuySell) {
                imageToSend = await this.imageGen.makeBuySellImage(this.curPage, this.curEdition);
            } else {
                imageToSend = await this.imageGen.makeOrdersImage(this.curPage);
            }

            if (this.hasStopped) return;

            await this.firstInter.editReply({
                files: [imageToSend],
                components: this.baseRows.concat(rowsToAdd)
            });
        } catch (err: unknown) {
            const canStop = await LogDebug.handleError(err, this.firstInter);
            if (canStop) {
                this.collector.stop(CollectorUtils.Reasons.Error);
            }
        }
    }

    /**
     * Disables all buttons
     *
     * @private
     */
    private disableButtons(): void {
        for (const row of this.baseRows.concat(this.optionalRows)) {
            for (const component of row.components) {
                component.setDisabled(true);
            }
        }
    }

    /**
     * Undoes all red confirmation buttons and returns if one has been undone
     *
     * @return Whether a red button was turned back to green
     * @private
     */
    private undoRedButtons(): boolean {
        const fixedRed = (this.optionalRows[0].components[0] as ButtonBuilder).data.style === 4 ||
            (this.optionalRows[0].components[1] as ButtonBuilder).data.style === 4 ||
            (this.optionalRows[1].components[0] as ButtonBuilder).data.style === 4 ||
            (this.optionalRows[1].components[1] as ButtonBuilder).data.style === 4 ||
            (this.optionalRows[3].components[1] as ButtonBuilder).data.style === 4;

        (this.optionalRows[0].components[0] as ButtonBuilder).setStyle(3);
        (this.optionalRows[0].components[1] as ButtonBuilder).setStyle(3);
        (this.optionalRows[1].components[0] as ButtonBuilder).setStyle(3);
        (this.optionalRows[1].components[1] as ButtonBuilder).setStyle(3);
        (this.optionalRows[3].components[1] as ButtonBuilder).setStyle(3);

        return fixedRed;
    }

    /**
     * Initializes all buttons/menus with appropriate IDs
     *
     * @private
     */
    private initButtons(): void {
        const marketFieldConfigs = this.config.commandConfigs.boar.market.componentFields;

        for (let i=0; i<marketFieldConfigs.length; i++) {
            const newRows = ComponentUtils.makeRows(marketFieldConfigs[i]);

            ComponentUtils.addToIDs(
                marketFieldConfigs[i],
                newRows,
                this.firstInter.id,
                this.firstInter.user.id,
                [{ label: this.config.stringConfig.emptySelect, value: this.config.stringConfig.emptySelect }]
            );

            if (i === 0) {
                this.baseRows = newRows
            } else {
                this.optionalRows = newRows;
            }
        }
    }

    /**
     * Sets the current page based on the view
     *
     * @param pageVal - The page to attempt to go to
     * @private
     */
    private setPage(
        pageVal: number
    ): void {
        if (this.curView === View.Overview) {
            this.curPage = Math.max(Math.min(pageVal-1, this.maxPageOverview), 0);
        } else if (this.curView === View.BuySell) {
            this.curPage = Math.max(Math.min(pageVal-1, this.pricingData.length-1), 0);
        } else {
            this.curPage = Math.max(Math.min(pageVal-1, this.userBuyOrders.concat(this.userSellOrders).length-1), 0);
        }
    }
}
