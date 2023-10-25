import {
    ChatInputCommandInteraction,
    MessageComponentInteraction,
    User
} from 'discord.js';
import fs from 'fs';
import {BoarBotApp} from '../../BoarBotApp';
import {BotConfig} from '../../bot/config/BotConfig';
import {RarityConfig} from '../../bot/config/items/RarityConfig';
import {Queue} from '../interactions/Queue';
import {DataHandlers} from '../data/DataHandlers';
import {LogDebug} from '../logging/LogDebug';
import {CollectedBoar} from '../../bot/data/user/collectibles/CollectedBoar';
import {PromptTypeData} from '../../bot/data/user/stats/PromptTypeData';
import {BoarUtils} from './BoarUtils';
import {CollectedItems} from '../../bot/data/user/collectibles/CollectedItems';
import {UserStats} from '../../bot/data/user/stats/UserStats';
import {CollectedBadge} from '../../bot/data/user/collectibles/CollectedBadge';
import {CollectedPowerup} from '../../bot/data/user/collectibles/CollectedPowerup';
import {QuestStats} from '../../bot/data/user/stats/QuestStats';
import {QuestData} from '../../bot/data/global/QuestData';
import {ItemsData} from '../../bot/data/global/ItemsData';
import {ItemData} from '../../bot/data/global/ItemData';

/**
 * {@link BoarUser BoarUser.ts}
 *
 * Handles the manipulation of a user's profile,
 * which is stored in JSON.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class BoarUser {
    public readonly user: User;

    public itemCollection = new CollectedItems();
    public stats = new UserStats();

    /**
     * Creates a new BoarUser from data file.
     *
     * @param user - User or user ID to base BoarUser off of
     * @param createFile - Whether a file for the user should be made
     */
    constructor(user: User, createFile?: boolean) {
        this.user = user;

        const userData = this.refreshUserData(createFile);

        const shouldFixData = createFile || this.stats.general.firstDaily > 0 || this.stats.general.totalBoars > 0 ||
            Object.keys(this.itemCollection.badges).length > 0;

        if (shouldFixData) {
            this.fixUserData(userData);
        }
    }

    /**
     * Returns user data from JSON file.
     * If it doesn't exist, write new file with empty data
     *
     * @param createFile - Whether a file for the user should be made
     * @return User's parsed JSON data
     * @private
     */
    private getUserData(createFile?: boolean): Omit<
        BoarUser,
        | "user"
        | "updateUserData"
        | "refreshUserData"
        | "addBoars"
        | "addBadge"
        | "removeBadge"
        | "orderBoars"
    > {
        let userDataJSON: string;
        const config = BoarBotApp.getBot().getConfig();
        const userFile = config.pathConfig.databaseFolder + config.pathConfig.userDataFolder + this.user.id + '.json';

        try {
            userDataJSON = fs.readFileSync(userFile, 'utf-8');
        } catch {
            const { user, ...fixedObject } = this; // Returns object with all properties except user

            if (createFile) {
                LogDebug.log(`New user! ${user.username} (${user.id}) had their file created`, config, undefined, true);
                fs.writeFileSync(userFile, JSON.stringify(fixedObject));
                userDataJSON = fs.readFileSync(userFile, 'utf-8');
            } else {
                return fixedObject;
            }
        }

        return JSON.parse(userDataJSON);
    }

    /**
     * Updates user data in JSON file and in this instance
     */
    public updateUserData(): void {
        const userData = this.getUserData();

        const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;
        const dailyQuestIndex = questData.curQuestIDs.indexOf('daily');
        const cloneBoarsIndex = questData.curQuestIDs.indexOf('cloneBoars');
        const cloneRarityIndex = questData.curQuestIDs.indexOf('cloneRarity');
        const sendGiftsIndex = questData.curQuestIDs.indexOf('sendGifts');
        const openGiftsIndex = questData.curQuestIDs.indexOf('openGifts');
        const powParticipateIndex = questData.curQuestIDs.indexOf('powParticipate');

        this.stats.quests.progress[dailyQuestIndex] += this.stats.general.numDailies -
            userData.stats.general.numDailies;
        this.stats.quests.progress[cloneBoarsIndex] += (this.itemCollection.powerups.clone.numSuccess as number) -
            (userData.itemCollection.powerups.clone.numSuccess as number);

        const cloneRaritiesNew = userData.itemCollection.powerups.clone.raritiesUsed as number[];
        const cloneRarities = this.itemCollection.powerups.clone.raritiesUsed as number[];
        this.stats.quests.progress[cloneRarityIndex] += cloneRarities[Math.floor(cloneRarityIndex / 2) + 1] -
            cloneRaritiesNew[Math.floor(cloneRarityIndex / 2) + 1];

        this.stats.quests.progress[sendGiftsIndex] += this.itemCollection.powerups.gift.numUsed -
            userData.itemCollection.powerups.gift.numUsed;

        const giftsOpenedNew = userData.itemCollection.powerups.gift.numOpened as number;
        const giftsOpened = this.itemCollection.powerups.gift.numOpened as number;
        this.stats.quests.progress[openGiftsIndex] += giftsOpened - giftsOpenedNew;

        this.stats.quests.progress[powParticipateIndex] += this.stats.powerups.attempts -
            userData.stats.powerups.attempts;

        for (const powerupID of Object.keys(this.itemCollection.powerups)) {
            this.itemCollection.powerups[powerupID].highestTotal = Math.max(
                this.itemCollection.powerups[powerupID].numTotal, this.itemCollection.powerups[powerupID].highestTotal
            );
            this.itemCollection.powerups[powerupID].numClaimed += Math.max(
                this.itemCollection.powerups[powerupID].numTotal - userData.itemCollection.powerups[powerupID].numTotal,
                0
            )
        }

        userData.itemCollection = this.itemCollection;
        userData.stats = this.stats;

        this.fixUserData(userData);
    }

    /**
     * Refreshes data stored in the code by reading the JSON file again
     *
     * @param createFile - Whether to create a file if it doesn't exist
     */
    public refreshUserData(createFile = false): Omit<
        BoarUser,
        | "user"
        | "updateUserData"
        | "refreshUserData"
        | "addBoars"
        | "addBadge"
        | "removeBadge"
        | "orderBoars"
    > {
        const userData = this.getUserData(createFile);

        this.itemCollection = userData.itemCollection;
        this.stats = userData.stats;

        return userData;
    }

    /**
     * Fixes any potential issues with user data and
     * writes to JSON file
     *
     * @param userData - User's parsed JSON data
     * @private
     */
    private fixUserData(userData: Omit<
        BoarUser,
        | "user"
        | "updateUserData"
        | "refreshUserData"
        | "addBoars"
        | "addBadge"
        | "removeBadge"
        | "orderBoars"
    >): void {
        const config = BoarBotApp.getBot().getConfig();
        const userFile = config.pathConfig.databaseFolder + config.pathConfig.userDataFolder + this.user.id + '.json';

        const boarsGottenIDs = Object.keys(this.itemCollection.boars);
        const twoDailiesAgo = new Date().setUTCHours(24,0,0,0) - config.numberConfig.oneDay * 2;

        const nums = BoarBotApp.getBot().getConfig().numberConfig;

        for (const boarID of boarsGottenIDs) {
            if (Object.keys(config.itemConfigs.boars).includes(boarID)) continue;

            this.stats.general.totalBoars -= this.itemCollection.boars[boarID].num;
            delete this.itemCollection.boars[boarID];

            if (this.stats.general.lastBoar === boarID)
                this.stats.general.lastBoar = '';

            if (this.stats.general.favoriteBoar === boarID)
                this.stats.general.favoriteBoar = '';
        }

        for (const promptType of Object.keys(config.promptConfigs.types)) {
            if (!this.stats.powerups.prompts[promptType]) {
                this.stats.powerups.prompts[promptType] = new PromptTypeData();
            }
        }

        for (const promptType of Object.keys(this.stats.powerups.prompts)) {
            if (!config.promptConfigs.types[promptType]) {
                delete this.stats.powerups.prompts[promptType];
                continue;
            }

            for (const promptID of Object.keys(this.stats.powerups.prompts[promptType])) {
                if (!this.promptExists(promptType, promptID, config)) {
                    delete this.stats.powerups.prompts[promptType][promptID];
                }
            }
        }

        if (!this.stats.quests) {
            this.stats.quests = new QuestStats();
        }

        const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;
        if (this.stats.quests.questWeekStart !== questData.questsStartTimestamp) {
            this.stats.quests.questWeekStart = questData.questsStartTimestamp;
            this.stats.quests.progress = [0,0,0,0,0,0,0];
            this.stats.quests.claimed = [0,0,0,0,0,0,0,0];
        }

        if (!this.itemCollection.powerups.miracle) {
            this.itemCollection.powerups.miracle = new CollectedPowerup();
            this.itemCollection.powerups.miracle.numActive = 0;
        }

        if (!this.itemCollection.powerups.gift) {
            this.itemCollection.powerups.gift = new CollectedPowerup();
            this.itemCollection.powerups.gift.numOpened = 0;
        }

        if (!this.itemCollection.powerups.enhancer) {
            this.itemCollection.powerups.enhancer = new CollectedPowerup();
            this.itemCollection.powerups.enhancer.raritiesUsed = [0,0,0,0,0,0,0];
        }

        if (!this.itemCollection.powerups.clone) {
            this.itemCollection.powerups.clone = new CollectedPowerup();
            this.itemCollection.powerups.clone.numSuccess = 0;
            this.itemCollection.powerups.clone.raritiesUsed = [0,0,0,0,0,0,0,0,0];
        }

        if ((this.itemCollection.powerups.clone.raritiesUsed as number[]).length === 7) {
            (this.itemCollection.powerups.clone.raritiesUsed as number[]).push(0);
            (this.itemCollection.powerups.clone.raritiesUsed as number[]).unshift(0);
        }

        this.itemCollection.powerups.miracle.numTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.miracle.numTotal, nums.maxPowBase)
        );
        this.itemCollection.powerups.miracle.highestTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.miracle.highestTotal, nums.maxPowBase)
        );
        this.itemCollection.powerups.gift.numTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.gift.numTotal, nums.maxSmallPow)
        );
        this.itemCollection.powerups.gift.highestTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.gift.highestTotal, nums.maxSmallPow)
        );
        this.itemCollection.powerups.enhancer.numTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.enhancer.numTotal, nums.maxEnhancers)
        );
        this.itemCollection.powerups.enhancer.highestTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.enhancer.highestTotal, nums.maxEnhancers)
        );
        this.itemCollection.powerups.clone.numTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.clone.numTotal, nums.maxSmallPow)
        );
        this.itemCollection.powerups.clone.highestTotal = Math.max(
            0, Math.min(this.itemCollection.powerups.clone.highestTotal, nums.maxSmallPow)
        );

        if (!this.stats.general.highestStreak) {
            this.stats.general.highestStreak = this.stats.general.boarStreak;
        }

        if (this.stats.general.lastDaily < twoDailiesAgo) {
            this.stats.general.boarStreak = 0;
        }

        this.stats.general.highestStreak = Math.max(this.stats.general.boarStreak, this.stats.general.highestStreak);

        if (this.stats.general.unbanTime !== undefined) {
            this.stats.general.unbanTime = undefined;
        }

        let uniques = 0;

        for (const boarID of Object.keys(this.itemCollection.boars)) {
            if (this.itemCollection.boars[boarID].num > 0) {
                uniques++;
            }
        }

        this.stats.general.multiplier = uniques + this.stats.general.highestStreak;
        this.stats.general.multiplier = Math.min(this.stats.general.multiplier, nums.maxPowBase);

        let visualMulti = this.stats.general.multiplier + 1;
        const numMiraclesActive = this.itemCollection.powerups.miracle.numActive as number;
        for (let i=0; i<numMiraclesActive; i++) {
            visualMulti += Math.min(Math.ceil(visualMulti * 0.1), config.numberConfig.miracleIncreaseMax);
        }
        visualMulti--;

        this.stats.general.highestMulti = Math.max(visualMulti, this.stats.general.highestMulti);

        this.stats.general.boarScore = Math.max(Math.min(this.stats.general.boarScore, nums.maxScore), 0);

        userData.itemCollection = this.itemCollection;
        userData.stats = this.stats;

        fs.writeFileSync(userFile, JSON.stringify(userData));
    }

    /**
     * Returns whether a given prompt type and id in that prompt type exist in config
     *
     * @param promptType - The type of prompt to search through
     * @param promptID - The ID to find
     * @param config - Used to get prompt data
     * @private
     */
    private promptExists(promptType: string, promptID: string, config: BotConfig): boolean {
        const promptIDs = Object.keys(config.promptConfigs.types[promptType]);

        for (let i=0; i<promptIDs.length; i++) {
            if (promptIDs[i] === promptID) return true;
        }

        return false;
    }

    /**
     * Add a boar to a user's collection and send an image
     *
     * @param config - Global config data parsed from JSON
     * @param boarIDs - IDs of boars to add
     * @param interaction - Interaction to reply to with image
     * @param scores - The scores to add to a user's score
     */
    public async addBoars(
        boarIDs: string[],
        interaction: ChatInputCommandInteraction | MessageComponentInteraction,
        config: BotConfig,
        scores: number[] = []
    ): Promise<number[]> {
        // Config aliases
        const strConfig = config.stringConfig;
        const numConfig = config.numberConfig;
        const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;

        // Rarity information
        const rarities = config.rarityConfigs;
        const rarityInfos = [] as [number, RarityConfig][];

        for (let i=0; i<boarIDs.length; i++) {
            for (const rarity of rarities) {
                if (rarity.boars.includes(boarIDs[i])) {
                    rarityInfos[i] = BoarUtils.findRarity(boarIDs[i], config);
                    break;
                }
            }
        }

        for (const [index] of rarityInfos) {
            if (index === 0 || boarIDs.length === 0) {
                await LogDebug.handleError(strConfig.dailyNoBoarFound, interaction);
                return [];
            }
        }

        const boarEditions = [] as number[];
        const bacteriaEditions = [] as number[];

        // Updates global edition data
        await Queue.addQueue(async () => {
            try {
                LogDebug.log('Updating global edition info...', config, interaction);
                const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;

                // Sets edition numbers
                for (let i=0; i<boarIDs.length; i++) {
                    const boarID = boarIDs[i];
                    const rarityName = rarityInfos[i][1].name;

                    if (!itemsData.boars[boarID]) {
                        LogDebug.log(`First edition of ${boarID}`, config, interaction, true);

                        itemsData.boars[boarID] = new ItemData();
                        itemsData.boars[boarID].curEdition = 0;
                        const lastBuySell = rarityInfos[i][1].baseScore === 1
                            ? 4
                            : rarityInfos[i][1].baseScore;
                        itemsData.boars[boarID].lastBuys[1] = lastBuySell;
                        itemsData.boars[boarID].lastSells[1] = lastBuySell;

                        if (rarityName !== 'Special' && rarityName !== 'Wicked') {
                            let specialEdition = 0;
                            if (!itemsData.boars['bacteria']) {
                                itemsData.boars['bacteria'] = new ItemData();
                                itemsData.boars['bacteria'].curEdition = 0;
                            }

                            specialEdition = ++(itemsData.boars['bacteria'].curEdition as number);
                            bacteriaEditions.push(specialEdition);
                        }
                    }
                    boarEditions.push(++(itemsData.boars[boarID].curEdition as number));
                }

                BoarUtils.orderGlobalBoars(itemsData, config);
                DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
            } catch (err: unknown) {
                await LogDebug.handleError(err, interaction);
            }
        }, 'boar_user_editions' + interaction.id + 'global').catch((err: unknown) => {
            throw err;
        });

        await Queue.addQueue(async () => {
            try {
                LogDebug.log('Updating user info...', config, interaction);
                this.refreshUserData();

                for (let i=0; i<boarIDs.length; i++) {
                    const collectBoarIndex = questData.curQuestIDs.indexOf('collectBoar');
                    const collectBucksIndex = questData.curQuestIDs.indexOf('collectBucks');
                    const boarID = boarIDs[i];

                    LogDebug.log(`Adding ${boarID} to collection`, config, interaction, true);

                    this.stats.quests.progress[collectBucksIndex] += scores[i]
                        ? scores[i]
                        : 0;

                    if (collectBoarIndex >= 0 && Math.floor(collectBoarIndex / 2) + 1 === rarityInfos[i][0]) {
                        this.stats.quests.progress[collectBoarIndex]++;
                    }

                    if (!this.itemCollection.boars[boarID]) {
                        this.itemCollection.boars[boarID] = new CollectedBoar();
                        this.itemCollection.boars[boarID].firstObtained = Date.now();
                    }

                    this.itemCollection.boars[boarID].num++;
                    this.itemCollection.boars[boarID].lastObtained = Date.now();

                    if (boarEditions[i] <= numConfig.maxTrackedEditions || rarityInfos[i][1].name === 'Special') {
                        this.itemCollection.boars[boarID].editions.push(boarEditions[i]);
                        this.itemCollection.boars[boarID].editions.sort((a: number, b: number) => {
                            return a - b;
                        });
                        this.itemCollection.boars[boarID].editionDates.push(Date.now());
                        this.itemCollection.boars[boarID].editionDates.sort((a: number, b: number) => {
                            return a - b;
                        });
                    }

                    this.stats.general.lastBoar = boarID;
                    this.stats.general.boarScore += scores[i] ? scores[i] : 0;
                }

                this.stats.general.totalBoars += boarIDs.length;

                await this.orderBoars(interaction, config);
                this.updateUserData();
            } catch (err: unknown) {
                await LogDebug.handleError(err, interaction);
            }
        }, 'boar_user_boar' + interaction.id + this.user.id).catch((err: unknown) => {
            throw err;
        });

        if (bacteriaEditions.length > 0) {
            await Queue.addQueue(async () => {
                this.refreshUserData();

                LogDebug.log(`Adding bacteria to collection`, config, interaction, true);

                if (!this.itemCollection.boars['bacteria']) {
                    this.itemCollection.boars['bacteria'] = new CollectedBoar();
                    this.itemCollection.boars['bacteria'].firstObtained = Date.now();
                }

                this.itemCollection.boars['bacteria'].num += bacteriaEditions.length;
                this.itemCollection.boars['bacteria'].lastObtained = Date.now();

                this.itemCollection.boars['bacteria'].editions =
                    this.itemCollection.boars['bacteria'].editions.concat(bacteriaEditions);
                this.itemCollection.boars['bacteria'].editions.sort((a: number, b: number) => {
                    return a - b;
                });

                this.itemCollection.boars['bacteria'].editionDates = this.itemCollection.boars['bacteria'].editionDates
                    .concat(Array(bacteriaEditions.length).fill(Date.now()));
                this.itemCollection.boars['bacteria'].editionDates.sort((a: number, b: number) => {
                    return a - b;
                });

                this.stats.general.lastBoar = 'bacteria';

                this.stats.general.totalBoars += bacteriaEditions.length;

                await this.orderBoars(interaction, config);
                this.updateUserData();
            }, 'boar_user_bacteria' + interaction.id + this.user.id).catch((err: unknown) => {
                throw err;
            });
        }

        await Queue.addQueue(async () => {
            DataHandlers.updateLeaderboardData(this, config, interaction)
        }, 'boar_user_top' + interaction.id + 'global').catch((err: unknown) => {
            throw err;
        });

        return boarEditions;
    }

    /**
     * Add a badge to a user's profile and send an image
     *
     * @param badgeID - ID of badge to add
     * @param interaction - Interaction to reply to with image
     * @param inQueue - Whether there's currently a queue running (prevents endless waiting)
     * @return Whether the function fully executed
     */
    public async addBadge(
        badgeID: string,
        interaction: ChatInputCommandInteraction | MessageComponentInteraction,
        inQueue = false
    ): Promise<boolean> {
        let hasBadge = false;

        if (inQueue) {
            hasBadge = this.addBadgeToUser(badgeID);
        } else {
            await Queue.addQueue(async () => {
                this.refreshUserData();
                hasBadge = this.addBadgeToUser(badgeID);
                this.updateUserData();
            }, 'boar_user_badge' + interaction.id + this.user.id).catch((err: unknown) => {
                throw err;
            });
        }

        if (!hasBadge) {
            LogDebug.log(`Added ${badgeID} badge to collection`, BoarBotApp.getBot().getConfig(), interaction, true);
        }

        return hasBadge;
    }

    /**
     * Changes the badge data for user by actually adding it
     *
     * @param badgeID - The ID of the badge
     * @private
     */
    private addBadgeToUser(badgeID: string): boolean {
        const hasBadge = this.itemCollection.badges[badgeID] !== undefined &&
            this.itemCollection.badges[badgeID].possession;

        if (hasBadge) {
            return hasBadge;
        }

        if (!this.itemCollection.badges[badgeID]) {
            this.itemCollection.badges[badgeID] = new CollectedBadge();
            this.itemCollection.badges[badgeID].firstObtained = Date.now();
        }

        this.itemCollection.badges[badgeID].possession = true;
        this.itemCollection.badges[badgeID].curObtained = Date.now();

        return hasBadge;
    }

    /**
     * Removes a badge if a user has it
     *
     * @param badgeID - ID of badge to remove
     * @param interaction
     * @param inQueue
     */
    public async removeBadge(
        badgeID: string,
        interaction: ChatInputCommandInteraction | MessageComponentInteraction,
        inQueue = false,
    ): Promise<void> {
        if (!this.itemCollection.badges[badgeID] || !this.itemCollection.badges[badgeID].possession) return;

        if (inQueue) {
            this.removeBadgeFromUser(badgeID);
        } else {
            await Queue.addQueue(async () => {
                this.refreshUserData();
                this.removeBadgeFromUser(badgeID);
                this.updateUserData();
            }, 'boar_user_rem_badge' + interaction.id + this.user.id).catch((err: unknown) => {
                throw err;
            });
        }

        LogDebug.log(`Removed ${badgeID} badge from collection`, BoarBotApp.getBot().getConfig(), interaction, true);

        this.updateUserData();
    }

    /**
     * Changes the badge data for user by actually removing it
     *
     * @param badgeID - The ID of the badge
     * @private
     */
    private removeBadgeFromUser(badgeID: string) {
        this.itemCollection.badges[badgeID].possession = false;
        this.itemCollection.badges[badgeID].curObtained = -1;
        this.itemCollection.badges[badgeID].lastLost = Date.now();
        this.itemCollection.badges[badgeID].timesLost++;
    }

    /**
     * Reorder a user's boars to appear in order when viewing collection
     *
     * @param config - Global config data parsed from JSON
     * @param interaction - Used to give badge if user has max uniques
     */
    public async orderBoars(
        interaction: ChatInputCommandInteraction | MessageComponentInteraction,
        config: BotConfig
    ): Promise<void> {
        const obtainedBoars = Object.keys(this.itemCollection.boars);

        const orderedRarities = [...config.rarityConfigs.slice(0,config.rarityConfigs.length-1)]
            .sort((rarity1: RarityConfig, rarity2: RarityConfig) => {
                return rarity1.weight - rarity2.weight;
            });

        let numSpecial = 0;
        let numZeroBoars = 0;
        let maxUniques = 0;

        const guildData = await DataHandlers.getGuildData(interaction.guild?.id);
        const isSBServer = guildData?.isSBServer;

        for (const rarity of orderedRarities) {
            if (rarity.name !== 'Special') {
                maxUniques += rarity.boars.length;
            }
        }

        for (const boarID of Object.keys(config.itemConfigs.boars)) {
            const boarInfo = config.itemConfigs.boars[boarID];
            if (!isSBServer && boarInfo.isSB) {
                maxUniques--;
            }
        }

        // Looping through all boar classes (Common -> Special)
        for (const rarity of orderedRarities) {
            const orderedBoars = [] as string[];
            const boarsOfRarity = rarity.boars;

            // Looping through user's boar collection
            for (let j=0; j<obtainedBoars.length; j++) {
                const curBoarID = obtainedBoars[j]; // ID of current boar
                const curBoarData = this.itemCollection.boars[curBoarID]; // Data of current boar

                if (!boarsOfRarity.includes(curBoarID) || orderedBoars.includes(curBoarID)) continue;

                // Removes boar from front and add it to the back of the list to refresh the order
                delete this.itemCollection.boars[curBoarID];
                this.itemCollection.boars[curBoarID] = curBoarData;

                if (rarity.name == 'Special') {
                    numSpecial++;
                }

                if (this.itemCollection.boars[curBoarID].num == 0) {
                    numZeroBoars++;
                }

                orderedBoars.push(curBoarID);
                j--;
            }
        }

        if (obtainedBoars.length-numSpecial-numZeroBoars >= maxUniques) {
            await this.addBadge('hunter', interaction, true);
        } else {
            await this.removeBadge('hunter', interaction, true);
        }
    }
}
