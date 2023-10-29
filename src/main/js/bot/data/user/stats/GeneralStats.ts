/**
 * {@link GeneralStats GeneralStats.ts}
 *
 * A collection of user general stats.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class GeneralStats {
    public lastDaily = 0;
    public numDailies = 0;
    public totalBoars = 0;
    public boarScore = 0;
    public favoriteBoar = '';
    public lastBoar = '';
    public firstDaily = 0;
    public boarStreak = 0;
    public highestStreak = 0;
    public multiplier = 1;
    public highestMulti = 0;
    public notificationsOn = false;
    public notificationChannel = '';
    public spookEditions?: number[];
    public spook2Stage?: number;
    public spook3Stage?: number;
    public truths?: boolean[];
    public unbanTime?: number; // No longer used, now stored globally
    public deletionTime?: number; // No longer used, now stored globally
}
