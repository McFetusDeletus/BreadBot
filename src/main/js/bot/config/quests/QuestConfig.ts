/**
 * {@link QuestConfig QuestConfig.ts}
 *
 * Stores a quest configuration for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class QuestConfig {
    public readonly description = '' as string;
    public readonly descriptionAlt = '' as string;
    public readonly lowerReward = '' as string;
    public readonly higherReward = '' as string;
    public readonly valType = '' as string;
    public readonly questVals = [] as [number, number][];
}
