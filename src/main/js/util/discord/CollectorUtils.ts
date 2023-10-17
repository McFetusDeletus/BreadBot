import {
    ButtonInteraction,
    InteractionCollector, MessageComponentInteraction, StringSelectMenuInteraction, TextChannel,
} from 'discord.js';
import {NumberConfig} from '../../bot/config/NumberConfig';
import {Replies} from '../interactions/Replies';
import {BoarBotApp} from '../../BoarBotApp';

// Reasons for ending collection
enum Reasons {
    Finished = 'finished',
    Cancelled = 'cancelled',
    Error = 'error',
    Expired = 'idle',
    Overridden = 'overridden'
}

/**
 * {@link CollectorUtils CollectorUtils.ts}
 *
 * A collection of functions that collectors
 * use frequently.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class CollectorUtils {
    public static readonly Reasons = Reasons;
    public static marketCollectors = {} as Record<
        string, InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>
    >;
    public static collectionCollectors = {} as Record<
        string, InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>
    >;
    public static topCollectors = {} as Record<
        string, InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>
    >;
    public static setupCollectors = {} as Record<
        string, InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>
    >;
    public static helpCollectors = {} as Record<
        string, InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>
    >;
    public static selfWipeCollectors = {} as Record<
        string, InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>
    >;
    public static questsCollectors = {} as Record<
        string, InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>
    >;

    /**
     * Determines whether the interaction should be processed
     *
     * @param timerVars - Information regarding component cooldown
     * @param startTime - The starting time of the interaction
     * @param inter - Used if the interaction should be dumped
     */
    public static async canInteract(
        timerVars: { timeUntilNextCollect: number, updateTime: NodeJS.Timeout },
        startTime: number,
        inter?: ButtonInteraction | StringSelectMenuInteraction,
    ): Promise<boolean> {
        // If the collection attempt was too quick, cancel it
        if (inter && (startTime <= timerVars.timeUntilNextCollect || inter.component.disabled)) {
            await inter.deferUpdate();
            return false;
        }

        if (startTime <= timerVars.timeUntilNextCollect) {
            return false;
        }

        clearInterval(timerVars.updateTime);

        const config = BoarBotApp.getBot().getConfig();

        if (inter && !config.devs.includes(inter.user.id) && config.maintenanceMode) {
            return false;
        }

        // Updates time to collect every 100ms, preventing users from clicking too fast

        timerVars.timeUntilNextCollect = Date.now() + 300;
        timerVars.updateTime = setInterval(() => {
            timerVars.timeUntilNextCollect = Date.now() + 300;
        }, 100);

        return true;
    }

    /**
     * Creates and returns a message component collector
     *
     * @param channel - The channel to put the collector
     * @param id - The id to look for
     * @param nums - Used to get number configurations
     * @param excludeUser - Whether to exclude the user instead of it only being them
     * @param time - The time it takes for the collector to end
     * @private
     */
    public static async createCollector(
        channel: TextChannel,
        id: string,
        nums: NumberConfig,
        excludeUser = false,
        time?: number
    ): Promise<InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>> {
        // Only allows button presses from current interaction
        const filter = async (compInter: MessageComponentInteraction) => {
            const modifiers = compInter.customId.split('|').slice(1);
            const returnVal = modifiers[0] === id;

            const claimingOwnGift = compInter.customId.toLowerCase().startsWith('gift') && returnVal &&
                excludeUser && modifiers[1] === compInter.user.id;
            const notUsersInter = returnVal && modifiers.length > 1 &&
                excludeUser && modifiers[1] === compInter.user.id ||
                returnVal && modifiers.length > 1 && !excludeUser && modifiers[1] !== compInter.user.id;

            if (claimingOwnGift) {
                try {
                    await Replies.handleReply(
                        compInter, 'You can\'t claim your own gift!', BoarBotApp.getBot().getConfig().colorConfig.error
                    );
                } catch {}
            } else if (notUsersInter) {
                try {
                    await Replies.handleReply(
                        compInter,
                        'This isn\'t yours to interact with!',
                        BoarBotApp.getBot().getConfig().colorConfig.error
                    );
                } catch {}
            }

            if (modifiers.length > 1 && excludeUser) {
                return returnVal && modifiers[1] !== compInter.user.id;
            } else if (modifiers.length > 1) {
                return returnVal && modifiers[1] === compInter.user.id;
            }

            return returnVal;
        };

        if (!time) {
            return channel.createMessageComponentCollector({
                filter,
                idle: nums.collectorIdle
            }) as InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>;
        } else {
            return channel.createMessageComponentCollector({
                filter,
                time: time
            }) as InteractionCollector<ButtonInteraction | StringSelectMenuInteraction>;
        }
    }
}
