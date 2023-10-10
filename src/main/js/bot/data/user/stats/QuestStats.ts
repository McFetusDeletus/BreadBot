/**
 * {@link QuestStats QuestStats.ts}
 *
 * A collection of user quest stats.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class QuestStats {
    public questWeekStart = 0;

    // User's progress for all seven quests
    public progress = [0, 0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number, number];

    // User's claim status for all seven quests (last is bonus reward claim status)
    public claimed = [0, 0, 0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number, number, number];

    public totalCompleted = 0;
    public totalFullCompleted = 0;
}
