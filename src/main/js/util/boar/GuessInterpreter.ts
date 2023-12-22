import {ChatInputCommandInteraction} from "discord.js";
import {Replies} from "../interactions/Replies";
import {BotConfig} from "../../bot/config/BotConfig";
import {BoarUser} from "./BoarUser";
import {Queue} from "../interactions/Queue";
import {LogDebug} from "../logging/LogDebug";
import fs from "fs";
import {ItemImageGenerator} from "../generators/ItemImageGenerator";

/**
 * {@link GuessInterpreter GuessInterpreter.ts}
 *
 * Handles the value a user input with /boar guess
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class GuessInterpreter {

    public async interpret(
        interaction: ChatInputCommandInteraction,
        valInput: string,
        config: BotConfig
    ): Promise<void> {
        const boarUser = new BoarUser(interaction.user, true);

        LogDebug.log('Guessed: ' + valInput, config, interaction, true);

        const spookStart1 = 1698787800000;
        const spookStart2 = 1698791400000;
        const spookStart3 = 1698795000000;
        const spookStart4 = 1698798600000;
        const spookStart5 = 1698802200000;
        const spookEnd = 1698901199000;

        const truth1Close = 'jylhavypztlylsfhwhdu';
        const truth1CloseReply = 'Seems you\'re a smart one. You\'re closer to the truth but further from your goal.';

        const truth1Ans = 'creatorismerelyapawn';
        const truth1Reply = 'You\'ve caught our eye with your wisdom.';

        const truth2Ans = 'boarfadius,boargalos,boardrick';
        const truth2Reply = 'Our names. Learn them well.';

        const truth3Ans = 'overseersofallthatisbo4r';
        const truth3Reply = 'Indeed. But we are much more than that. Interstellar beings? Gods? That\'s for you to find out.';

        const truth4Ans = 'theuppercouncilreignssupreme';
        const truth4Reply = 'It seems you now know what we call ourselves. We acknowledge your support.';

        const truth5Ans = 'thr33wholenewboars';
        const truth5Reply = 'New? We\'ve been here all along.';

        const truthsComplete = boarUser.stats.general.truths
            ? boarUser.stats.general.truths
            : [false, false, false, false, false];

        const curTime = Date.now();
        valInput = valInput.toLowerCase().replace(/\s+/g, '');

        if (!truthsComplete[0] && curTime >= spookStart1 && valInput === truth1Close) {
            await Replies.handleReply(interaction, truth1CloseReply);
            return;
        }

        if (!truthsComplete[0] && curTime >= spookStart1 && valInput === truth1Ans) {
            await this.doTruthReply(interaction, boarUser, truth1Reply, 0, config);
            return;
        }

        if (!truthsComplete[1] && curTime >= spookStart2 && valInput === truth2Ans) {
            await this.doTruthReply(interaction, boarUser, truth2Reply, 1, config);
            return;
        }

        if (!truthsComplete[2] && curTime >= spookStart3 && valInput === truth3Ans) {
            await this.doTruthReply(interaction, boarUser, truth3Reply, 2, config);
            return;
        }

        if (!truthsComplete[3] && curTime >= spookStart4 && valInput === truth4Ans) {
            await this.doTruthReply(interaction, boarUser, truth4Reply, 3, config);
            return;
        }

        if (!truthsComplete[4] && curTime >= spookStart5 && valInput === truth5Ans) {
            await this.doTruthReply(interaction, boarUser, truth5Reply, 4, config);
            return;
        }

        if (curTime < spookStart1 || curTime > spookEnd) {
            await Replies.handleReply(interaction, 'There\'s nothing to guess!');
            return;
        }

        const spook1Ans = '12221321123012201201131213211300132213101230132112301303121212201313122012101311';
        const spook1Reply = 'Bet that took a while, you got it right! Check your inventory to see your rewards!';

        const spook2Ans = [
            'grassskirt',
            'donotwant',
            'gentlemen',
            '67trees',
            'statue44'
        ];
        const spook2Replies = [
            'Nice! Want to go back in time to 2014? Here\'s the next image: imgur.com/StG9f0w',
            'Good job! This next game used to be a massively popular flash game. Here\'s the next image: imgur.com/rT1AIgr',
            'Correct! Have your phone handy? I\'m sure most of you have at least heard of this next one. Here\'s the next image: imgur.com/GZgCkKA',
            'Yep! Time to go a little bit "Old School" with the following game. Here\'s the next image: imgur.com/U8trsGt',
            'You mean to tell me you played ALL those games and found ALL those items? Respect. Check your inventory to see your rewards!'
        ];

        const spook3Ans = [
            'surprises',
            '44',
            'rainbowdiamondlegendboar',
            'sugardaddy',
            'bermudagrass',
            '168',
            'powerofcompletion',
            boarUser.stats.general.boarScore.toString(),
            '1025590776861819012',
            '9007199254740991',
            'pumpkinboar',
            'moontzu',
            'taxidermy',
            'babysharkdance',
            'sewerfish',
            boarUser.user.username.toLowerCase().replace(/\s+/g, ''),
            '2013',
            'simon',
            'boarnderwear',
            'hanginthere',
            '5'
        ];
        const spook3Replies = [
            'Adult wild boars have quite a few teeth. How many? Find out yourself to get to the next step.',
            'There were only four boars added in boar game\'s inception. What was the name of the rarest of these boars?',
            'Spooky Boar enjoys a very specific candy. This candy is known as "America\'s oldest and most popular milk caramel lollipop." What is this candy?',
            'If you\'ve gotten to this point, you\'re probably a chronic internet user that\'s forgotten what grass looks like. Let\'s fix that! What\'s the name of a grass that has grey-green blades, slightly purple tinged stems, and has seed heads that are produced in a cluster of two to six spikes?',
            'Man, you\'re good at this. Only true boar fans know the answer to this question, though. If I have 0 boar blessings, how many miracle charms do I need for at least 100,000 boar blessings?',
            'Spooky Boar really likes playing the Bingo gamemode of Hypixel Skyblock. What\'s the name of the Bingo Pet\'s mythic perk?',
            'Wow, you clearly play a lot of boar game! How much do you have in boar bucks?',
            'Just a few more questions left! What is BoarBot\'s user ID?',
            'What is the positive safe integer limit in JavaScript?',
            'There\'s only one immortal boar in boar game. What is it?',
            'In Hypixel Skyblock, Sun Tzu has a brother. What is his name?',
            'What is Realistic Boar?',
            'What YouTube video has the most views?',
            'What item do you need for the Eerie Treat in Hypixel SkyBlock?',
            'What is your username?',
            'In what year did Minecraft Java Edition 1.6.1 come out?',
            'What is the first name of the owner of Hypixel?',
            'You can get a special boar exclusively from Boar Gifts. What is the name of this boar?',
            'What does the text on the Wet Napkin say in Hypixel SkyBlock?',
            'The final question. Except it\'s not a question. IT\'S RNG! Guess a number from 1-5.',
            'Nice job! You were the first to finish the trivia! Check your inventory to see your rewards!'
        ];

        const spook4Ans = '14mi45ndu=26373554klenzendorfandromeda';
        const spook4Reply = 'Not a valid -- Just kidding! You got it right! I bet you\'re exhausted. Check your inventory to see your rewards!';

        const spook5Ans = '9h6hh0rgbrcxbli';
        const spook5Reply = 'Correct! Did you enjoy touring Boar Manor? Check your inventory to see your rewards!';

        const spooksComplete = boarUser.stats.general.spookEditions
            ? boarUser.stats.general.spookEditions
            : [0, 0, 0, 0, 0];

        const spook2Stage = boarUser.stats.general.spook2Stage
            ? boarUser.stats.general.spook2Stage
            : 0;
        const spook3Stage = boarUser.stats.general.spook3Stage
            ? boarUser.stats.general.spook3Stage
            : 0;

        if (spooksComplete[0] === 0 && valInput === spook1Ans) {
            await this.doSpookReply(interaction, boarUser, 0, spook1Reply, true, config);
            return;
        }

        if (spooksComplete[1] === 0 && valInput === spook2Ans[spook2Stage] && spook2Stage < spook2Ans.length-1 && curTime >= spookStart2) {
            await Queue.addQueue(async () => {
                try {
                    boarUser.refreshUserData();

                    if (boarUser.stats.general.spook2Stage === undefined) {
                        boarUser.stats.general.spook2Stage = 0;
                    }

                    boarUser.stats.general.spook2Stage++;

                    boarUser.updateUserData();
                } catch (err: unknown) {
                    LogDebug.handleError(err, interaction);
                }
            }, 'spook2_update' + interaction.id + interaction.user.id).catch((err: unknown) => {
                LogDebug.handleError(err, interaction);
            });

            await this.doSpookReply(interaction, boarUser, 1, spook2Replies[spook2Stage], false, config);
            return;
        }

        if (spooksComplete[1] === 0 && valInput === spook2Ans[spook2Stage] && curTime >= spookStart2) {
            await this.doSpookReply(interaction, boarUser, 1, spook2Replies[spook2Stage], true, config);
            return;
        }

        if (spooksComplete[2] === 0 && valInput === spook3Ans[spook3Stage] && spook3Stage < spook3Ans.length-1 && curTime >= spookStart3) {
            await Queue.addQueue(async () => {
                try {
                    boarUser.refreshUserData();

                    if (boarUser.stats.general.spook3Stage === undefined) {
                        boarUser.stats.general.spook3Stage = 0;
                    }

                    boarUser.stats.general.spook3Stage++;

                    boarUser.updateUserData();
                } catch (err: unknown) {
                    LogDebug.handleError(err, interaction);
                }
            }, 'spook3_update' + interaction.id + interaction.user.id).catch((err: unknown) => {
                LogDebug.handleError(err, interaction);
            });

            await this.doSpookReply(interaction, boarUser, 2, spook3Replies[spook3Stage], false, config);
            return;
        }

        if (spooksComplete[2] === 0 && valInput === spook3Ans[spook3Stage] && curTime >= spookStart3) {
            await this.doSpookReply(interaction, boarUser, 2, spook3Replies[spook3Stage], true, config);
            return;
        }

        let spook3Reset = false;

        await Queue.addQueue(async () => {
            try {
                boarUser.refreshUserData();

                if (boarUser.stats.general.spook3Stage && boarUser.stats.general.spook3Stage > 0) {
                    spook3Reset = true;
                }

                boarUser.stats.general.spook3Stage = 0;
                boarUser.updateUserData();
            } catch (err: unknown) {
                LogDebug.handleError(err, interaction);
            }
        }, 'spook3_reset' + interaction.id + interaction.user.id).catch((err: unknown) => {
            LogDebug.handleError(err, interaction);
        });

        if (spooksComplete[3] === 0 && valInput === spook4Ans && curTime >= spookStart4) {
            await this.doSpookReply(interaction, boarUser, 3, spook4Reply, true, config);
            return;
        }

        if (spooksComplete[4] === 0 && valInput === spook5Ans && curTime >= spookStart5) {
            await this.doSpookReply(interaction, boarUser, 4, spook5Reply, true, config);
            return;
        }

        let invalidReply = 'Not a valid guess!';

        if (spook3Reset) {
            invalidReply += ' Your progress on the trivia was reset! Start from question #1 again!';
        }

        Replies.handleReply(interaction, invalidReply);
    }

    private async doTruthReply(
        interaction: ChatInputCommandInteraction,
        boarUser: BoarUser,
        replyStr: string,
        index: number,
        config: BotConfig
    ): Promise<void> {
        const [truthsLeft, giveTrophy] = await this.updateTruths(interaction, boarUser, index);
        let endingStr = ' Truths left: ' + truthsLeft;

        if (truthsLeft === 0) {
            endingStr = ' It seems our presence is no longer a secret. It is now possible for you to find us. Under what conditions? Let\'s just say you have to be very lucky.';
        }

        Replies.handleReply(interaction, replyStr + endingStr);

        if (giveTrophy) {
            await boarUser.addBoars(['trophy'], interaction, config);

            const attachment = await new ItemImageGenerator(
                boarUser.user, 'trophy', 'Truth Seeker!', config
            ).handleImageCreate();

            await interaction.followUp({ files: [attachment] });
        }
    }

    private async updateTruths(
        interaction: ChatInputCommandInteraction,
        boarUser: BoarUser,
        index: number
    ): Promise<[number, boolean]> {
        let truthsLeft = -1;
        let shouldGetTrophy = false;

        await Queue.addQueue(async () => {
            try {
                boarUser.refreshUserData();

                if (!boarUser.stats.general.truths) {
                    boarUser.stats.general.truths = [false, false, false, false, false];
                }

                boarUser.stats.general.truths[index] = true;
                truthsLeft = boarUser.stats.general.truths.filter((val: boolean) => {
                    return !val;
                }).length;

                await Queue.addQueue(async () => {
                    try {
                        const spookData = JSON.parse(fs.readFileSync('database/global/spook.json', 'utf-8'));

                        if (truthsLeft === 0) {
                            shouldGetTrophy = ++spookData.spookNumSolved[5] === 1;
                        }

                        fs.writeFileSync('database/global/spook.json', JSON.stringify(spookData));
                    } catch (err: unknown) {
                        LogDebug.handleError(err);
                    }
                }, 'truth_ed' + interaction.id + 'global').catch((err: unknown) => {
                    LogDebug.handleError(err, interaction);
                });

                boarUser.updateUserData();
            } catch (err: unknown) {
                LogDebug.handleError(err);
            }
        }, 'truth_inc' + interaction.id + boarUser.user.id).catch((err: unknown) => {
            LogDebug.handleError(err, interaction);
        });

        return [truthsLeft, shouldGetTrophy];
    }

    private async doSpookReply(
        interaction: ChatInputCommandInteraction,
        boarUser: BoarUser,
        index: number,
        replyStr: string,
        lastStep: boolean,
        config: BotConfig
    ): Promise<void> {
        let boarIDs = [] as string[];

        if (lastStep) {
            boarIDs = await this.updateSpook(interaction, boarUser, index, config);

            if (boarIDs.length === 0) {
                await Replies.handleReply(interaction, 'You already got a Spooky Boar this Boar-O-Ween! Once all three Spooky Boars are gotten for this hunt, you\'ll be able to submit the right answer.');
                return;
            }
        }

        await Replies.handleReply(interaction, replyStr);

        for (let i=0; i<boarIDs.length; i++) {
            const score = i === 0
                ? config.rarityConfigs[0].baseScore
                : 0;

            const attachment = await new ItemImageGenerator(
                boarUser.user, boarIDs[i], 'Boar-O-Ween!', config
            ).handleImageCreate(false, undefined, undefined, undefined, score);

            await interaction.followUp({ files: [attachment] });
        }
    }

    private async updateSpook(
        interaction: ChatInputCommandInteraction,
        boarUser: BoarUser,
        index: number,
        config: BotConfig
    ): Promise<string[]> {
        let spookEdition = 0;

        await Queue.addQueue(async () => {
            try {
                boarUser.refreshUserData();

                if (!boarUser.stats.general.spookEditions) {
                    boarUser.stats.general.spookEditions = [0, 0, 0, 0, 0];
                }

                if (boarUser.stats.general.spookEditions[index] > 0) return;

                let shouldNotGetYet = false;

                await Queue.addQueue(async () => {
                    try {
                        const spookData = JSON.parse(fs.readFileSync('database/global/spook.json', 'utf-8'));

                        const gotSpooky = [1, 2, 3].some(val => boarUser.stats.general.spookEditions?.includes(val));
                        const spookNumSolved = spookData.spookNumSolved[index];

                        if (gotSpooky && spookNumSolved <= 2) {
                            shouldNotGetYet = true;
                            return;
                        }

                        spookEdition = ++spookData.spookNumSolved[index];

                        fs.writeFileSync('database/global/spook.json', JSON.stringify(spookData));
                    } catch (err: unknown) {
                        LogDebug.handleError(err);
                    }
                }, 'spook_ed' + interaction.id + 'global').catch((err: unknown) => {
                    LogDebug.handleError(err, interaction);
                });

                if (shouldNotGetYet) return;

                boarUser.stats.general.spookEditions[index] = spookEdition;
                boarUser.itemCollection.powerups.enhancer.numTotal++;
                boarUser.itemCollection.powerups.gift.numTotal += 3;
                boarUser.itemCollection.powerups.miracle.numTotal += 5;
                boarUser.itemCollection.powerups.clone.numTotal += 5;

                boarUser.updateUserData();
            } catch (err: unknown) {
                LogDebug.handleError(err);
            }
        }, 'spook_ed' + interaction.id + boarUser.user.id).catch((err: unknown) => {
            LogDebug.handleError(err, interaction);
        });

        const boarIDs = [] as string[];

        if (spookEdition === 0) {
            return boarIDs;
        }

        switch (index) {
            case 0: {
                boarIDs.push('witch');
                break;
            }

            case 1: {
                boarIDs.push('candy');
                break;
            }

            case 2: {
                boarIDs.push('tombstone');
                break;
            }

            case 3: {
                boarIDs.push('mummy');
                break;
            }

            case 4: {
                boarIDs.push('fortune');
                break;
            }
        }

        if (spookEdition <= 3) {
            boarIDs.push('spooky');
        }

        await boarUser.addBoars(boarIDs, interaction, config, [config.rarityConfigs[0].baseScore]);

        return boarIDs;
    }
}
