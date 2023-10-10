/**
 * {@link BoardData BoardData.ts}
 *
 * Stores information about a specific leaderboard
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class BoardData {
    public topUser?: string; // ID of top user
    public userData = {} as Record<string, [userID: string, value: number]>; // Leaderboard data for all users
}
