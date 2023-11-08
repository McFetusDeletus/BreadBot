import {
    ChatInputCommandInteraction
} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {LogDebug} from '../../util/logging/LogDebug';
import {Replies} from '../../util/interactions/Replies';
import {Queue} from '../../util/interactions/Queue';
import {BoarUser} from '../../util/boar/BoarUser';
import {BoarGift} from '../../feat/BoarGift';
import {GuildData} from '../../bot/data/global/GuildData';

/**
 * {@link GiftSubcommand GiftSubcommand.ts}
 *
 * Allows a user to send a Boar Gift if they have one
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class GiftSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.gift;
    private guildData?: GuildData;
    private interaction = {} as ChatInputCommandInteraction;
    public readonly data = { name: this.subcommandInfo.name, path: __filename };

    /**
     * Handles the functionality for this subcommand
     *
     * @param interaction - The interaction that called the subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        this.guildData = await InteractionUtils.handleStart(interaction, this.config);
        if (!this.guildData) return;

        const isBanned = await InteractionUtils.handleBanned(interaction, this.config);
        if (isBanned) return;

        await interaction.deferReply({ ephemeral: true });
        this.interaction = interaction;

        await this.sendGift();
    }

    /**
     * Sends gift message to current channel
     *
     * @private
     */
    private async sendGift() {
        let boarUser = {} as BoarUser;

        let shouldGift = true;

        await Queue.addQueue(async () => {
            try {
                boarUser = new BoarUser(this.interaction.user);

                // Tells user they don't have any gifts
                if (!boarUser.itemCollection.powerups.gift || boarUser.itemCollection.powerups.gift.numTotal <= 0) {
                    await Replies.handleReply(
                        this.interaction, this.config.stringConfig.giftNone, this.config.colorConfig.error
                    );
                    shouldGift = false;
                    return;
                }

                const curOutVal = boarUser.itemCollection.powerups.gift.curOut;

                // Tells user they currently have a gift sent out
                if (curOutVal && curOutVal + 30000 >= Date.now()) {
                    await Replies.handleReply(
                        this.interaction, this.config.stringConfig.giftOut, this.config.colorConfig.error
                    );
                    shouldGift = false;
                    return;
                }

                boarUser.itemCollection.powerups.gift.curOut = Date.now();
                boarUser.updateUserData();
            } catch (err: unknown) {
                LogDebug.handleError(err, this.interaction);
            }
        }, 'gift_send' + this.interaction.id + this.interaction.user.id).catch((err: unknown) => {
            throw err;
        });

        if (!shouldGift) return;

        // Sends gift message out to current channel
        await new BoarGift(boarUser, this.config).sendMessage(this.interaction);

        // Tells user they successfully sent the gift
        await Replies.handleReply(
            this.interaction, this.config.stringConfig.giftSent, this.config.colorConfig.green
        );
    }
}
