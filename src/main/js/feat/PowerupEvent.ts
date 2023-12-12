import {LogDebug} from '../util/logging/LogDebug';
import {BoarBotApp} from '../BoarBotApp';
import {Queue} from '../util/interactions/Queue';
import {DataHandlers} from '../util/data/DataHandlers';
import fs from 'fs';
import {
    ActionRowBuilder, AttachmentBuilder,
    ButtonBuilder, ButtonInteraction, Channel,
    Message,
    TextChannel,
} from 'discord.js';
import {CollectorUtils} from '../util/discord/CollectorUtils';
import {BotConfig} from '../bot/config/BotConfig';
import {Replies} from '../util/interactions/Replies';
import {PromptConfig} from '../bot/config/prompts/PromptConfig';
import {NumberConfig} from '../bot/config/NumberConfig';
import {RowConfig} from '../bot/config/commands/RowConfig';
import {PowerupImageGenerator} from '../util/generators/PowerupImageGenerator';
import {BoarUser} from '../util/boar/BoarUser';
import {PromptData} from '../bot/data/user/stats/PromptData';
import {ItemConfig} from '../bot/config/items/ItemConfig';
import {InteractionUtils} from '../util/interactions/InteractionUtils';
import {PowerupData} from '../bot/data/global/PowerupData';
import {QuestData} from '../bot/data/global/QuestData';

/**
 * {@link PowerupSpawner PowerupEvent.ts}
 *
 * Handles sending powerups and collecting user interactions
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class PowerupEvent {
    private config = BoarBotApp.getBot().getConfig();
    private claimers = new Map<string, number>();
    private failers = new Map<string, number>();
    private powerupType = {} as ItemConfig;
    private powerupTypeID = '';
    private promptTypeID = '';
    private promptID = '';
    private powEndImage = {} as AttachmentBuilder;
    private interactions = [] as ButtonInteraction[];
    private numMsgs = 0;
    private numNotFinished = 0;
    private failedServers = {} as Record<string, number>;
    private msgsToStore = {} as Record<string, string[]>;
    private readyToEnd = false;

    constructor() {
        this.startSpawning();
    }

    /**
     * Sets a timeout for when the next powerup should spawn
     */
    private async startSpawning(): Promise<void> {
        const powerupData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Powerups) as PowerupData;

        let msgsToDelete = [] as Message[];

        for (const channelID of Object.keys(powerupData.messagesInfo)) {
            try {
                const channel = await BoarBotApp.getBot().getClient().channels.fetch(channelID) as TextChannel;
                const msgs = await this.getMsgsFromChannel(channel, powerupData);

                msgsToDelete = msgsToDelete.concat(msgs);
            } catch {}
        }

        this.failedServers = powerupData.failedServers;

        this.removeMsgs(msgsToDelete);
        this.doSpawn();
    }

    /**
     * Gets last powerup message from a channel
     *
     * @param channel
     * @param powerupData
     * @private
     */
    private async getMsgsFromChannel(channel: TextChannel, powerupData: PowerupData): Promise<Message[]> {
        const msgsToDelete = [] as Message[];

        for (const msgID of powerupData.messagesInfo[channel.id]) {
            try {
                msgsToDelete.push(await channel.messages.fetch(msgID));
            } catch {}
        }

        return msgsToDelete;
    }

    /**
     * Removes all messages to delete
     */
    private async removeMsgs(msgsToDelete: Message[]): Promise<void> {
        await Queue.addQueue(async () => {
            try {
                const powerupData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Powerups) as PowerupData;
                powerupData.messagesInfo = {};
                DataHandlers.saveGlobalData(powerupData, DataHandlers.GlobalFile.Powerups);
            } catch (err: unknown) {
                await LogDebug.handleError(err);
            }
        }, 'powDelMsgs' + 'global').catch((err: unknown) => {
            throw err;
        });

        for (let i=0; i<msgsToDelete.length; i++) {
            await msgsToDelete[i].delete().catch((err: unknown) => {
                LogDebug.log('Failed to delete message ' + (i + 1) + '/' + msgsToDelete.length, this.config);
                LogDebug.handleError(err);
            });
        }
    }

    /**
     * Spawns the powerup
     *
     * @private
     */
    private async doSpawn(): Promise<void> {
        try {
            const nums = this.config.numberConfig;
            const allBoarChannels = [] as TextChannel[];

            if (this.config.maintenanceMode) return;

            const guildDataFolder = this.config.pathConfig.databaseFolder + this.config.pathConfig.guildDataFolder;

            // Get all channels to send powerups in
            for (const guildFile of fs.readdirSync(guildDataFolder)) {
                const guildID = guildFile.split('.')[0];
                const guildData = await DataHandlers.getGuildData(guildID);
                if (!guildData) continue;

                const client = BoarBotApp.getBot().getClient();

                try {
                    await client.guilds.fetch(guildFile.split('.')[0]);
                    if (this.failedServers[guildID] !== undefined) {
                        delete this.failedServers[guildID];
                    }
                } catch {
                    if (this.failedServers[guildID] === undefined) {
                        this.failedServers[guildID] = 0;
                    }

                    this.failedServers[guildID]++;

                    if (this.failedServers[guildID] && this.failedServers[guildID] >= 3) {
                        try {
                            fs.rmSync(guildDataFolder + guildFile);
                            delete this.failedServers[guildID];
                        } catch {}
                    }

                    continue;
                }

                for (const channelID of guildData.channels) {
                    let channel: Channel | null;

                    try {
                        channel = await client.channels.fetch(channelID)
                    } catch {
                        continue;
                    }

                    if (channel) {
                        allBoarChannels.push(channel as TextChannel);
                    }
                }
            }

            const curTime = Date.now();

            const promptConfig = this.config.promptConfigs;
            const promptTypes = promptConfig.types;
            this.promptTypeID = Object.keys(promptTypes)[Math.floor(
                Math.random() * Object.keys(promptTypes).length
            )];
            this.promptID = this.getRandPromptID(this.promptTypeID, this.config);
            const chosenPrompt = promptTypes[this.promptTypeID][this.promptID] as PromptConfig;

            this.powerupTypeID = this.getRandPowerup(this.config);
            this.powerupType = this.config.itemConfigs.powerups[this.powerupTypeID];

            LogDebug.log(
                `Powerup Event spawning for ${this.powerupType.pluralName}, Prompt: ${chosenPrompt.name}`, this.config
            );

            const rightStyle = promptTypes[this.promptTypeID].rightStyle;
            const wrongStyle = promptTypes[this.promptTypeID].wrongStyle;

            const rowsConfig = promptConfig.rows;
            let rows = [] as ActionRowBuilder<ButtonBuilder>[];

            const powerupSpawnImage: AttachmentBuilder = await PowerupImageGenerator.makePowerupSpawnImage(
                this.powerupTypeID, promptTypes[this.promptTypeID], chosenPrompt, this.config
            );

            // Sends powerup message to all boar channels
            allBoarChannels.forEach(async channel => {
                try {
                    const collector = await CollectorUtils.createCollector(channel, curTime.toString(),
                        nums, false, nums.powDurationMillis
                    );

                    switch (this.promptTypeID) {
                        case 'emojiFind': {
                            rows = this.makeEmojiRows(chosenPrompt, rightStyle, wrongStyle, rowsConfig, curTime, nums);
                            break;
                        }

                        case 'trivia': {
                            rows = this.makeTriviaRows(chosenPrompt, rightStyle, wrongStyle, rowsConfig, curTime, nums);
                            break;
                        }

                        case 'fast': {
                            rows = this.makeFastRows(chosenPrompt, rightStyle, wrongStyle, rowsConfig, curTime, nums);
                            break;
                        }

                        case 'time': {
                            rows = this.makeClockRows(
                                chosenPrompt, rightStyle, wrongStyle, rowsConfig, curTime, nums, this.config
                            );
                            break;
                        }

                    }

                    const powMsg = {
                        msg: {} as Message,
                        time: Date.now() + this.config.numberConfig.powDurationMillis
                    };

                    try {
                        powMsg.msg = await channel.send({
                            files: [powerupSpawnImage],
                            components: rows
                        });
                        powMsg.time = Date.now();
                    } catch (err: unknown) {
                        return;
                    }

                    collector.on('collect', async (inter: ButtonInteraction) => {
                        await this.handleCollect(inter, powMsg.time, this.config);
                    });

                    collector.on('end', async (_, reason: string) => {
                        await this.handleEndCollect(reason, powMsg.msg, this.config);
                    });

                    this.numMsgs++;
                    this.numNotFinished++;

                    if (!this.msgsToStore[channel.id]) {
                        this.msgsToStore[channel.id] = [];
                    }

                    this.msgsToStore[channel.id].push(powMsg.msg.id);
                } catch {}
            });
        } catch (err: unknown) {
            await LogDebug.handleError((err as Error).stack);
        }
    }

    /**
     * Handles collecting and users  interacting with the powerup. Also
     * responds depending on correctness and attempt status
     *
     * @param inter - The interaction made by the user
     * @param powMsgTime - The time the powerup message was sent
     * @param config - Used to get config info
     * @private
     */
    private async handleCollect(
        inter: ButtonInteraction,
        powMsgTime: number,
        config: BotConfig
    ): Promise<void> {
        try {
            const interTime = Date.now();

            await inter.deferUpdate();

            const hasClaimed = this.claimers.has(inter.user.id);
            const fullyFailed = this.failers.has(inter.user.id)
                ? (this.failers.get(inter.user.id) as number) > 1
                : false;

            if (!hasClaimed && !fullyFailed && inter.customId.toLowerCase().includes('correct')) {
                const isBanned = await InteractionUtils.handleBanned(inter, config);
                if (isBanned) return;

                LogDebug.log(
                    `${inter.user.username} (${inter.user.id}) guessed CORRECT in Powerup Event`, config
                );

                const correctString = config.stringConfig.powRightFull;
                const rewardString = this.powerupType.rewardAmt + ' ' +
                    (this.powerupType.rewardAmt as number > 1
                        ? this.powerupType.pluralName
                        : this.powerupType.name);
                const timeToClaim = interTime - powMsgTime;

                this.claimers.set(inter.user.id, timeToClaim);
                this.interactions.push(inter);

                await Replies.handleReply(
                    inter, correctString,
                    config.colorConfig.font,
                    [config.stringConfig.powRight, timeToClaim.toLocaleString() + 'ms', rewardString],
                    [config.colorConfig.green, config.colorConfig.silver, config.colorConfig.powerup],
                    true
                );
            } else if (!hasClaimed && !fullyFailed) {
                LogDebug.log(
                    `${inter.user.username} (${inter.user.id}) guessed INCORRECT in Powerup Event`, config
                );

                if (this.failers.has(inter.user.id)) {
                    this.failers.set(inter.user.id, 2);

                    const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;
                    const powFailIndex = questData.curQuestIDs.indexOf('powFail');

                    if (powFailIndex >= 0) {
                        await Queue.addQueue(async () => {
                            const boarUser = new BoarUser(inter.user, true);
                            boarUser.stats.quests.progress[powFailIndex]++;
                            boarUser.updateUserData();
                        }, 'pow_fail' + inter.id + inter.user.id).catch((err: unknown) => {
                            throw err;
                        });
                    }

                    await Replies.handleReply(
                        inter,
                        config.stringConfig.powWrongSecond,
                        config.colorConfig.font,
                        [config.stringConfig.powWrong],
                        [config.colorConfig.error],
                        true
                    );
                } else {
                    this.failers.set(inter.user.id, 1);

                    await Replies.handleReply(
                        inter,
                        config.stringConfig.powWrongFirst,
                        config.colorConfig.font,
                        [config.stringConfig.powWrong],
                        [config.colorConfig.error],
                        true
                    );
                }
            } else if (fullyFailed) {
                await Replies.handleReply(
                    inter, config.stringConfig.powNoMore, config.colorConfig.error, undefined, undefined, true
                );
            } else {
                await Replies.handleReply(
                    inter, config.stringConfig.eventParticipated, config.colorConfig.error, undefined, undefined, true
                );
            }
        } catch (err: unknown) {
            await LogDebug.handleError(err);
        }
    }

    /**
     * Handles when the powerup ends, editing the message and
     * replying to all user interactions.
     *
     * @param reason - Reason for ending collection
     * @param powMsg - The powerup message to edit
     * @param config - Used to get config info
     * @private
     */
    private async handleEndCollect(reason: string, powMsg: Message, config: BotConfig): Promise<void> {
        try {
            if (reason === CollectorUtils.Reasons.Error) {
                return;
            }

            try {
                await powMsg.edit({
                    components: [new ActionRowBuilder<ButtonBuilder>(config.promptConfigs.rows[1])]
                });
            } catch {}

            // Gets percentages once all powerup messages are waiting for tabulation
            if (--this.numMsgs === 0) {
                this.claimers = new Map([...this.claimers.entries()]
                    .sort((a: [string, number], b: [string, number]) => {
                        return a[1] - b[1];
                    }));

                let topClaimer: [string, number] | undefined;
                let avgTime: number | undefined;

                if (this.claimers.size > 0) {
                    topClaimer = [...this.claimers][0];
                    avgTime = Math.round(
                        [...this.claimers.values()].reduce((sum: number, val: number) => {
                            return sum + val;
                        }, 0) / this.claimers.size
                    );
                }

                this.powEndImage = await PowerupImageGenerator.makePowerupEndImage(
                    this.powerupTypeID, topClaimer, avgTime, this.claimers.size,
                    this.promptID, this.promptTypeID, config
                );

                await this.finishPow(powMsg, config);

                this.readyToEnd = true;
                return;
            }


            // Waits until percentages have been calculated to finish (after last message has tabulated)
            const finishInterval = setInterval(async () => {
                if (this.readyToEnd) {
                    clearInterval(finishInterval);
                    await this.finishPow(powMsg, config);
                }
            }, 1000);
        } catch (err: unknown) {
            await LogDebug.handleError(err);
        }
    }

    /**
     * Gets a random prompt ID
     *
     * @param promptType - Used to get a prompt within the prompt type
     * @param config - Used for config info
     * @private
     */
    private getRandPromptID(promptType: string, config: BotConfig): string {
        const promptTypes = config.promptConfigs.types;
        const prompts = [] as string[];

        for (const promptTypeProperty of Object.keys(promptTypes[promptType])) {
            const isNotPromptConfig = typeof promptTypes[promptType][promptTypeProperty] === 'string' ||
                typeof promptTypes[promptType][promptTypeProperty] === 'number';

            if (isNotPromptConfig) continue;

            prompts.push(promptTypeProperty);
        }

        return prompts[Math.floor(Math.random() * prompts.length)];
    }

    /**
     * Gets a random powerup by ID
     *
     * @param config - Used to get all powerup types
     * @private
     */
    private getRandPowerup(config: BotConfig): string {
        const powerups = config.itemConfigs.powerups;
        const powerupIDs = Object.keys(powerups);

        let powerupID = powerupIDs[Math.floor(Math.random() * powerupIDs.length)];
        while (powerupID === 'enhancer') {
            powerupID = powerupIDs[Math.floor(Math.random() * powerupIDs.length)];
        }

        return powerupID;
    }

    /**
     * Creates a 4x4 button array of emojis with one being different
     *
     * @param prompt - Used to get which emojis to place
     * @param rightStyle - The style of button for right emoji
     * @param wrongStyle - The style of button for wrong emoji
     * @param rowsConfig - The buttons and their IDs
     * @param id - ID to place at the end of each button (timestamp of message)
     * @param nums - Used to get number configurations
     * @private
     */
    private makeEmojiRows(
        prompt: PromptConfig,
        rightStyle: number,
        wrongStyle: number,
        rowsConfig: RowConfig[],
        id: number,
        nums: NumberConfig
    ): ActionRowBuilder<ButtonBuilder>[] {
        const rows = [] as ActionRowBuilder<ButtonBuilder>[];

        const randEmojiIndex = Math.floor(Math.random() * nums.emojiRows * nums.emojiCols);

        const emoji1 = prompt.emoji1;
        const emoji2 = prompt.emoji2;

        let curIndex = 0;

        for (let i=0; i<nums.emojiRows; i++) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            for (let j=0; j<nums.emojiCols; j++) {
                let button: ButtonBuilder;

                if (curIndex === randEmojiIndex) {
                    button = new ButtonBuilder(rowsConfig[0].components[0]);
                    button.setEmoji(emoji1).setStyle(rightStyle).setCustomId(
                        rowsConfig[0].components[0].customId + '|' + id
                    );
                } else {
                    button = new ButtonBuilder(rowsConfig[0].components[1]);
                    button.setEmoji(emoji2).setStyle(wrongStyle).setCustomId(
                        rowsConfig[0].components[1].customId + curIndex + '|' + id
                    );
                }

                row.addComponents(button);
                curIndex++;
            }
            rows.push(row);
        }

        return rows;
    }

    /**
     * Makes a 2x2 button array of possible answer choices to a trivia question
     *
     * @param prompt - Used to get choices
     * @param rightStyle - The style of button for right answer
     * @param wrongStyle - The style of button for wrong answer
     * @param rowsConfig - The buttons and their IDs
     * @param id - ID to place at the end of each button (timestamp of message)
     * @param nums - Used to get number configurations
     * @private
     */
    private makeTriviaRows(
        prompt: PromptConfig,
        rightStyle: number,
        wrongStyle: number,
        rowsConfig: RowConfig[],
        id: number,
        nums: NumberConfig
    ) {
        const rows = [] as ActionRowBuilder<ButtonBuilder>[];

        const choices = [...prompt.choices];
        const answer = choices[0];

        let curIndex = 0;

        for (let i=0; i<nums.triviaRows; i++) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            for (let j=0; j<nums.triviaCols; j++) {
                const randChoice = choices[Math.floor(Math.random() * choices.length)];
                let button: ButtonBuilder;

                if (randChoice === answer) {
                    button = new ButtonBuilder(rowsConfig[0].components[0]);
                    button.setLabel(randChoice).setStyle(rightStyle).setCustomId(
                        rowsConfig[0].components[0].customId + '|' + id
                    );
                } else {
                    button = new ButtonBuilder(rowsConfig[0].components[1]);
                    button.setLabel(randChoice).setStyle(wrongStyle).setCustomId(
                        rowsConfig[0].components[1].customId + curIndex + '|' + id
                    );
                }

                choices.splice(choices.indexOf(randChoice), 1);
                row.addComponents(button);
                curIndex++;
            }
            rows.push(row);
        }

        return rows;
    }

    /**
     * Makes a predetermined array of green and red buttons
     *
     * @param prompt - Used to get the number of buttons
     * @param rightStyle - The style of button for right answer
     * @param wrongStyle - The style of button for wrong answer
     * @param rowsConfig - The buttons and their IDs
     * @param id - ID to place at the end of each button (timestamp of message)
     * @param nums - Used to get number configurations
     * @private
     */
    private makeFastRows(
        prompt: PromptConfig,
        rightStyle: number,
        wrongStyle: number,
        rowsConfig: RowConfig[],
        id: number,
        nums: NumberConfig
    ) {
        const rows = [] as ActionRowBuilder<ButtonBuilder>[];

        const numButtons = prompt.numButtons;
        const numRows = Math.ceil(numButtons / nums.fastCols);
        const randCorrectIndex = Math.floor(Math.random() * numButtons);

        let curIndex = 0;

        for (let i=0; i<numRows; i++) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            for (let j=0; j<Math.min(numButtons, nums.fastCols); j++) {
                let button: ButtonBuilder;

                if (curIndex === randCorrectIndex) {
                    button = new ButtonBuilder(rowsConfig[0].components[0]);
                    button.setLabel('️').setStyle(rightStyle).setCustomId(
                        rowsConfig[0].components[0].customId + '|' + id
                    );
                } else {
                    button = new ButtonBuilder(rowsConfig[0].components[1]);
                    button.setLabel('️').setStyle(wrongStyle).setCustomId(
                        rowsConfig[0].components[1].customId + curIndex + '|' + id
                    );
                }

                row.addComponents(button);
                curIndex++;
            }
            rows.push(row);
        }

        return rows;
    }

    private makeClockRows(
        prompt: PromptConfig,
        rightStyle: number,
        wrongStyle: number,
        rowsConfig: RowConfig[],
        id: number,
        nums: NumberConfig,
        config: BotConfig
    ) {
        const rows = [] as ActionRowBuilder<ButtonBuilder>[];

        const clocks = [];
        const rightClock = prompt.rightClock;

        for (const clockPrompt of Object.values(config.promptConfigs.types.time)) {
            if (typeof clockPrompt === 'string' || typeof clockPrompt === 'number') continue;
            clocks.push(clockPrompt.rightClock);
        }

        let curIndex = 0;

        for (let i=0; i<nums.emojiRows; i++) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            for (let j=0; j<nums.emojiCols; j++) {
                const randChoice = clocks[Math.floor(Math.random() * clocks.length)];
                let button: ButtonBuilder;

                if (randChoice === rightClock) {
                    button = new ButtonBuilder(rowsConfig[0].components[0]);
                    button.setEmoji(randChoice).setStyle(rightStyle).setCustomId(
                        rowsConfig[0].components[0].customId + '|' + id
                    );
                } else {
                    button = new ButtonBuilder(rowsConfig[0].components[1]);
                    button.setEmoji(randChoice).setStyle(wrongStyle).setCustomId(
                        rowsConfig[0].components[1].customId + curIndex + '|' + id
                    );
                }

                clocks.splice(clocks.indexOf(randChoice), 1);
                row.addComponents(button);
                curIndex++;
            }
            rows.push(row);
        }

        return rows;
    }

    /**
     * Handles when the powerup ends. Edits the spawn message and updates all user info
     *
     * @param powMsg - The message to update
     * @param config - Used to get config info
     * @private
     */
    private async finishPow(powMsg: Message, config: BotConfig) {
        try {
            try {
                await powMsg.edit({
                    files: [this.powEndImage],
                    components: []
                });
            } catch {}

            // Updates and restores information to what it should be once the final message is done processing
            if (--this.numNotFinished === 0) {
                LogDebug.log('Attempting to conclude Powerup Event', config);

                const topUserID = this.claimers.size > 0
                    ? [...this.claimers][0][0]
                    : undefined;

                for (const interaction of this.interactions) {
                    const strConfig = config.stringConfig;
                    const colorConfig = config.colorConfig;

                    const userTime = this.claimers.get(interaction.user.id);
                    const userPercent = (
                        ([...this.claimers.keys()].indexOf(interaction.user.id) + 1) / this.claimers.size
                    ) * 100;

                    if (!userTime) {
                        await LogDebug.handleError('Failed to find user\'s powerup data.', interaction);
                        continue;
                    }

                    await Queue.addQueue(async () => {
                        try {
                            const questConfig = config.questConfigs;
                            const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;
                            const powFirstIndex = questData.curQuestIDs.indexOf('powFirst');

                            const boarUser = new BoarUser(interaction.user, true);

                            const increasePowFirst = powFirstIndex >= 0 &&
                                userTime <= questConfig['powFirst'].questVals[Math.floor(powFirstIndex / 2)][0];

                            if (increasePowFirst) {
                                boarUser.stats.quests.progress[powFirstIndex]++;
                            }

                            if (boarUser.stats.general.firstDaily === 0) {
                                boarUser.stats.general.firstDaily = Date.now();
                            }

                            if (boarUser.user.id === topUserID) {
                                boarUser.stats.powerups.oneAttempts++;
                            }

                            const hasNewFastest = !boarUser.stats.powerups.fastestTime ||
                                userTime < boarUser.stats.powerups.fastestTime;

                            if (hasNewFastest) {
                                boarUser.stats.powerups.fastestTime = userTime;
                            }

                            if (!boarUser.stats.powerups.prompts[this.promptTypeID][this.promptID]) {
                                boarUser.stats.powerups.prompts[this.promptTypeID][this.promptID] = new PromptData();
                            }

                            boarUser.stats.powerups.prompts[this.promptTypeID][this.promptID].avg = (
                                boarUser.stats.powerups.prompts[this.promptTypeID][this.promptID].avg *
                                    boarUser.stats.powerups.prompts[this.promptTypeID][this.promptID].attempts++ +
                                    userPercent
                            ) / boarUser.stats.powerups.prompts[this.promptTypeID][this.promptID].attempts;

                            boarUser.stats.powerups.attempts++;

                            const powRewardAmt = this.powerupType.rewardAmt as number;

                            boarUser.itemCollection.powerups[this.powerupTypeID].numTotal += powRewardAmt;

                            boarUser.updateUserData();

                            const rewardString = this.powerupType.rewardAmt + ' ' +
                                (this.powerupType.rewardAmt as number > 1
                                    ? this.powerupType.pluralName
                                    : this.powerupType.name);

                            if (boarUser.stats.powerups.attempts > config.numberConfig.powExperiencedNum) {
                                await Replies.handleReply(
                                    interaction,
                                    strConfig.powResponseShort,
                                    config.colorConfig.font,
                                    [rewardString, 'Powerup Event'],
                                    [colorConfig.powerup, colorConfig.powerup],
                                    true
                                ).catch(() => {});
                            } else {
                                await Replies.handleReply(
                                    interaction,
                                    strConfig.powResponse,
                                    config.colorConfig.font,
                                    [
                                        rewardString,
                                        'Powerup Event',
                                        '/boar collection',
                                        'Powerups',
                                        '/boar help',
                                        'Powerups'
                                    ],
                                    [
                                        colorConfig.powerup,
                                        colorConfig.powerup,
                                        colorConfig.silver,
                                        colorConfig.powerup,
                                        colorConfig.silver,
                                        colorConfig.powerup
                                    ], true
                                ).catch(() => {});
                            }

                            await Queue.addQueue(async () => {
                                DataHandlers.updateLeaderboardData(boarUser, config, interaction);
                            }, 'pow_top' + interaction.id + 'global').catch((err: unknown) => {
                                throw err;
                            });
                        } catch (err: unknown) {
                            await LogDebug.handleError(err, interaction);
                        }
                    }, 'pow_update_stats' + interaction.id + interaction.user.id).catch((err: unknown) => {
                        throw err;
                    });
                }

                await Queue.addQueue(async () => {
                    try {
                        const powerupData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Powerups) as PowerupData;
                        powerupData.failedServers = this.failedServers;
                        powerupData.messagesInfo = this.msgsToStore;
                        DataHandlers.saveGlobalData(powerupData, DataHandlers.GlobalFile.Powerups);
                    } catch (err: unknown) {
                        await LogDebug.handleError(err);
                    }
                }, 'powUpdateTimer' + 'global').catch((err: unknown) => {
                    throw err;
                });

                LogDebug.log('Powerup Event finished.', config);
            }
        } catch (err: unknown) {
            await LogDebug.handleError(err);
        }
    }
}
