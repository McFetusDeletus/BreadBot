import {
    AttachmentBuilder,
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
import {CollectedBoar} from './CollectedBoar';
import {PowerupData} from './PowerupData';
import {ItemImageGenerator} from '../generators/ItemImageGenerator';
import {Replies} from '../interactions/Replies';
import {PromptTypeData} from './PromptTypeData';
import {BoarUtils} from './BoarUtils';

/**
 * {@link BoarUser BoarUser.ts}
 *
 * Handles the manipulation of a user's profile,
 * which is stored in JSON.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
export class BoarUser {
    public readonly user: User;

    public lastDaily: number = 0;
    public numDailies: number = 0;
    public totalBoars: number = 0;
    public boarScore: number = 0;
    public favoriteBoar: string = '';
    public lastBoar: string = '';
    public firstDaily: number = 0;
    public boarStreak: number = 0;
    public powerups: PowerupData = new PowerupData;
    public theme: string = 'normal';
    public themes: string[] = ['normal'];
    public badges: string[] = [];
    public boarCollection: Record<string, CollectedBoar> = {};

    /**
     * Creates a new BoarUser from data file.
     *
     * @param user - User to base BoarUser off of
     * @param createFile - Whether a file for the user should be made
     */
    constructor(user: User, createFile?: boolean) {
        this.user = user;

        const userData = this.refreshUserData(createFile);

        if (createFile || this.boarStreak > 0) {
            this.fixUserData(userData);
        }
    }

    /**
     * Returns user data from JSON file.
     * If it doesn't exist, write new file with empty data
     *
     * @param createFile - Whether a file for the user should be made
     * @return userData - User's parsed JSON data
     * @private
     */
    private getUserData(createFile?: boolean): any {
        let userDataJSON: string;
        const config = BoarBotApp.getBot().getConfig();
        const userFile = config.pathConfig.userDataFolder + this.user.id + '.json';

        try {
            userDataJSON = fs.readFileSync(userFile, 'utf-8');
        } catch {
            const { user, ...fixedObject } = this; // Returns object with all properties except user

            if (createFile) {
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

        userData.lastDaily = this.lastDaily;
        userData.numDailies = this.numDailies;
        userData.boarScore = this.boarScore;
        userData.totalBoars = this.totalBoars;
        userData.favoriteBoar = this.favoriteBoar;
        userData.lastBoar = this.lastBoar;
        userData.firstDaily = this.firstDaily;
        userData.boarStreak = this.boarStreak;
        userData.powerups = this.powerups;
        userData.theme = this.theme;
        userData.themes = this.themes;
        userData.badges = this.badges;
        userData.boarCollection = this.boarCollection;

        this.fixUserData(userData);
    }

    public refreshUserData(createFile: boolean = false): any {
        const userData = this.getUserData(createFile);

        this.lastDaily = userData.lastDaily;
        this.numDailies = userData.numDailies;
        this.totalBoars = userData.totalBoars;
        this.boarScore = userData.boarScore;
        this.favoriteBoar = userData.favoriteBoar;
        this.lastBoar = userData.lastBoar;
        this.firstDaily = userData.firstDaily;
        this.boarStreak = userData.boarStreak;
        this.powerups = userData.powerups;
        this.theme = userData.theme;
        this.themes = userData.themes;
        this.badges = userData.badges;
        this.boarCollection = userData.boarCollection;

        return userData;
    }

    /**
     * Fixes any potential issues with user data and
     * writes to JSON file
     *
     * @param userData - User's parsed JSON data
     * @private
     */
    private fixUserData(userData: any): void {
        const config = BoarBotApp.getBot().getConfig();
        const userFile = config.pathConfig.userDataFolder + this.user.id + '.json';

        const boarsGottenIDs = Object.keys(this.boarCollection);
        const twoDailiesAgo = Math.floor(new Date().setUTCHours(24,0,0,0)) - (1000 * 60 * 60 * 24 * 2);

        const nums = BoarBotApp.getBot().getConfig().numberConfig;

        for (const boarID of boarsGottenIDs) {
            if (boarID !in config.boarItemConfigs) continue;

            this.totalBoars -= this.boarCollection[boarID].num;
            delete this.boarCollection[boarID];

            if (this.lastBoar === boarID)
                this.lastBoar = '';

            if (this.favoriteBoar === boarID)
                this.favoriteBoar = '';
        }

        for (const promptType of Object.keys(this.powerups.promptData)) {
            if (!config.powerupConfig.promptTypes[promptType]) {
                delete this.powerups.promptData[promptType];
            }

            for (const promptID of Object.keys(this.powerups.promptData[promptType])) {
                if (!this.promptExists(promptType, promptID, config)) {
                    delete this.powerups.promptData[promptType][promptID];
                }
            }
        }

        for (const promptType of Object.keys(config.powerupConfig.promptTypes)) {
            if (!this.powerups.promptData[promptType]) {
                this.powerups.promptData[promptType] = new PromptTypeData;
            }
        }

        this.powerups.multiplier = Math.min(this.powerups.multiplier, nums.maxMulti);
        this.powerups.multiBoostTotal = Math.min(this.powerups.multiBoostTotal, nums.maxMultiBoost);
        this.powerups.numGifts = Math.min(this.powerups.numGifts, nums.maxPowBase);
        this.powerups.extraChanceTotal = Math.min(this.powerups.extraChanceTotal, nums.maxExtraChance);
        this.powerups.numEnhancers = Math.min(this.powerups.numEnhancers, nums.maxEnhancers);

        userData.boarCollection = this.boarCollection;
        userData.totalBoars = this.totalBoars;
        userData.favoriteBoar = this.favoriteBoar;
        userData.lastBoar = this.lastBoar;
        userData.powerups = this.powerups;

        if (this.lastDaily < twoDailiesAgo) {
            userData.powerups.multiplier = this.powerups.multiplier -= this.boarStreak;
            userData.boarStreak = this.boarStreak = 0;
        }

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
        const promptIDs: string[] = Object.keys(config.powerupConfig.promptTypes[promptType]);

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
     * @param sendAttachment
     */
    public async addBoars(
        config: BotConfig,
        boarIDs: string[],
        interaction: ChatInputCommandInteraction | MessageComponentInteraction,
        sendAttachment: boolean = false
    ): Promise<void> {
        // Config aliases
        const pathConfig = config.pathConfig;
        const strConfig = config.stringConfig;
        const numConfig = config.numberConfig;

        // Rarity information
        const rarities = config.rarityConfigs;
        const rarityInfos: RarityConfig[] = [];

        let randScores: number[] = [];

        for (let i=0; i<boarIDs.length; i++) {
            rarityInfos.push({} as RarityConfig);
            for (const rarity of rarities) {
                if (rarity.boars.includes(boarIDs[i])) {
                    rarityInfos[i] = BoarUtils.findRarity(boarIDs[i])[1];
                    break;
                }
            }
        }

        for (const info of rarityInfos) {
            if (Object.keys(info).length === 0 || boarIDs.length === 0) {
                await LogDebug.handleError(strConfig.dailyNoBoarFound, interaction);
                return;
            }
        }

        let boarEdition: number = 0;

        // Updates global edition data
        await Queue.addQueue(() => {
            LogDebug.sendDebug('Updating global edition info...', config, interaction);

            const globalData = DataHandlers.getGlobalData();

            // Sets edition numbers
            for (const boarID of boarIDs) {
                if (!globalData.editions[boarID])
                    globalData.editions[boarID] = 0;
                boarEdition = ++globalData.editions[boarID];
            }

            fs.writeFileSync(pathConfig.globalDataFile, JSON.stringify(globalData));

            LogDebug.sendDebug('Finished updating global edition info.', config, interaction);
        }, interaction.id + 'global');

        await Queue.addQueue(async () => {
            LogDebug.sendDebug('Updating user info...', config, interaction);
            const isDaily = interaction.isChatInputCommand()
                ? interaction.options.getSubcommand() === config.commandConfigs.boar.daily.name
                : false;

            this.refreshUserData();

            for (let i=0; i<boarIDs.length; i++) {
                const boarID = boarIDs[i];

                if (!this.boarCollection[boarID]) {
                    this.boarCollection[boarID] = new CollectedBoar;
                    this.boarCollection[boarID].firstObtained = Date.now();
                }

                this.boarCollection[boarID].num++;
                this.boarCollection[boarID].lastObtained = Date.now();

                if (boarEdition <= numConfig.maxTrackedEditions || rarityInfos[i].name === 'Special') {
                    this.boarCollection[boarID].editions.push(boarEdition);
                    this.boarCollection[boarID].editions.sort((a, b) => a-b);
                    this.boarCollection[boarID].editionDates.push(Date.now());
                    this.boarCollection[boarID].editionDates.sort((a, b) => a-b);
                }

                this.lastBoar = boarID;

                if (isDaily) {
                    randScores.push(Math.round(rarityInfos[i].baseScore * (Math.random() * (1.1 - .9) + .9)));
                    this.boarScore += randScores[randScores.length-1];
                }
            }

            this.totalBoars += boarIDs.length;

            this.updateUserData();
            await this.orderBoars(config, interaction);
            LogDebug.sendDebug('Finished updating user info.', config, interaction);
        }, interaction.id + interaction.user.id);

        // Information about interaction
        const wasGiven = interaction.isChatInputCommand()
            ? interaction.options.getSubcommand() === config.commandConfigs.boarDev.give.name
            : false;

        if (sendAttachment) {
            let attachmentTitles: string[] = [];

            // If the boars being added are a special boar (not from daily), change the title to reflect it
            for (let i=0; i<boarIDs.length; i++) {
                if (i === 0) {
                    attachmentTitles.push(strConfig.dailyTitle);
                } else {
                    attachmentTitles.push(strConfig.extraTitle);
                }

                if (rarityInfos[i].name === 'Special') {
                    attachmentTitles[i] = strConfig.giveSpecialTitle;
                } else if (wasGiven) {
                    attachmentTitles[i] = strConfig.giveTitle;
                }
            }

            LogDebug.sendDebug('Creating images...', config, interaction);

            const attachments: AttachmentBuilder[] = [];
            for (let i=0; i<boarIDs.length; i++) {
                attachments.push(
                    await new ItemImageGenerator(this, config, boarIDs[i], attachmentTitles[i])
                        .handleImageCreate(false, randScores[i])
                );
            }

            LogDebug.sendDebug('Images created', config, interaction);

            // If regular boar on '/boar daily', reply to interaction with attachment
            // If given, send as separate message and reply to interaction with success
            for (let i=0; i<boarIDs.length; i++) {
                if (wasGiven) {
                    await Replies.handleReply(interaction, strConfig.giveBoar);
                }

                if (i === 0 && !wasGiven) {
                    await interaction.editReply({ files: [attachments[i]] });
                } else {
                    await interaction.followUp({ files: [attachments[i]] });
                }
            }
        }
    }

    /**
     * Add a badge to a user's profile and send an image
     * @param config - Global config data parsed from JSON
     * @param badgeID - ID of badge to add
     * @param interaction - Interaction to reply to with image
     * @return success - The function fully executed
     */
    public async addBadge(
        config: BotConfig,
        badgeID: string,
        interaction: ChatInputCommandInteraction | MessageComponentInteraction
    ): Promise<void> {
        const strConfig = config.stringConfig;
        const giveCommandConfig = config.commandConfigs.boarDev.give;

        const wasGiven = interaction.isChatInputCommand()
            ? interaction.options.getSubcommand() === giveCommandConfig.name
            : false;

        if (wasGiven) {
            await Queue.addQueue(async () => {
                this.refreshUserData();
                const hasBadge = this.badges.includes(badgeID);
                if (hasBadge) {
                    await Replies.handleReply(interaction, strConfig.giveBadgeHas);
                    return;
                }

                this.badges.push(badgeID);
                this.updateUserData();
            }, interaction.id + interaction.user.id);
        } else {
            const hasBadge = this.badges.includes(badgeID);
            if (hasBadge) return;

            this.badges.push(badgeID);
            this.updateUserData();
        }

        const attachmentTitle = wasGiven
            ? strConfig.giveBadgeTitle
            : strConfig.obtainedBadgeTitle;

        const attachment = await new ItemImageGenerator(this, config, badgeID, attachmentTitle).handleImageCreate(true);

        // If gotten from regular means, followup interaction with image
        // If given, send as separate message and reply to interaction with success
        if (!wasGiven) {
            await interaction.followUp({ files: [attachment] });
        } else {
            await Replies.handleReply(interaction, strConfig.giveBadge);
            await interaction.followUp({ files: [attachment] });
        }
    }

    public async removeBadge(
        config: BotConfig,
        badgeID: string
    ): Promise<void> {
        if (!this.badges.includes(badgeID)) return;

        this.badges.splice(this.badges.indexOf(badgeID), 1);
        this.updateUserData();
    }

    /**
     * Reorder a user's boars to appear in order when viewing collection
     * @param config - Global config data parsed from JSON
     * @param interaction - Used to give badge if user has max uniques
     */
    public async orderBoars(
        config: BotConfig,
        interaction: ChatInputCommandInteraction | MessageComponentInteraction
    ): Promise<void> {
        const orderedRarities: RarityConfig[] = [...config.rarityConfigs]
            .sort((rarity1, rarity2) => { return rarity1.weight - rarity2.weight; });
        const obtainedBoars = Object.keys(this.boarCollection);
        let numSpecial = 0;
        let numZeroBoars = 0;

        let maxUniques = 0;

        for (const rarity of orderedRarities) {
            if (rarity.name !== 'Special') {
                maxUniques += rarity.boars.length;
            }
        }

        // Looping through all boar classes (Common -> Very Special)
        // FIX THIS, CREATE AND SORT MAP BASED ON WEIGHT INSTEAD OF REVERSING
        for (const rarity of orderedRarities) {
            const orderedBoars: string[] = [];
            const boarsOfRarity = rarity.boars;

            // Looping through user's boar collection
            for (let j=0; j<obtainedBoars.length; j++) {
                const curBoarID = obtainedBoars[j]; // ID of current boar
                const curBoarData = this.boarCollection[curBoarID];    // Data of current boar

                if (!boarsOfRarity.includes(curBoarID) || orderedBoars.includes(curBoarID))
                    continue;

                // Removes boar from front and add it to the back of the list to refresh the order
                delete this.boarCollection[curBoarID];
                this.boarCollection[curBoarID] = curBoarData;

                if (rarity.name == 'Special') {
                    numSpecial++;
                }

                if (this.boarCollection[curBoarID].num == 0) {
                    numZeroBoars++;
                }

                orderedBoars.push(curBoarID);
                j--;
            }
        }

        if (obtainedBoars.length-numSpecial-numZeroBoars >= maxUniques) {
            await this.addBadge(config, 'hunter', interaction);
        } else {
            await this.removeBadge(config, 'hunter');
        }

        this.updateUserData();
    }
}