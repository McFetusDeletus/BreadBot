/**
 * {@link ColorConfig ColorConfig.ts}
 *
 * Stores number configurations for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class ColorConfig {
    readonly [colorKey: string]: string;

    // Colors used in custom images

    public readonly dark = '#000000' as string;
    public readonly mid = '#000000' as string;
    public readonly light = '#000000' as string;
    public readonly font = '#000000' as string;

    // Colors for different item types

    public readonly badge = '#000000' as string;
    public readonly powerup = '#000000' as string;
    public readonly bucks = '#000000' as string;

    // Leaderboard colors

    public readonly gold = '#000000' as string;
    public readonly silver = '#000000' as string; // Used for slight emphasis too
    public readonly bronze = '#000000' as string;

    // General purpose colors

    public readonly green = '#000000' as string;
    public readonly maintenance = '#000000' as string;
    public readonly error = '#000000' as string;

    // Boar rarity colors

    public readonly rarity1 = '#000000' as string;
    public readonly rarity2 = '#000000' as string;
    public readonly rarity3 = '#000000' as string;
    public readonly rarity4 = '#000000' as string;
    public readonly rarity5 = '#000000' as string;
    public readonly rarity6 = '#000000' as string;
    public readonly rarity7 = '#000000' as string;
}
