/**
 * {@link RarityConfig RarityConfig.ts}
 *
 * Stores a specific rarity configuration
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class RarityConfig {
    public readonly name = '' as string;
    public readonly pluralName = '' as string;
    public readonly weight = 0 as number;
    public readonly baseScore = 0 as number;
    public readonly fromDaily = false as boolean;
    public readonly enhancersNeeded = 0 as number;
    public readonly avgClones = 0 as number;
    public readonly boars = [] as string[];
}
