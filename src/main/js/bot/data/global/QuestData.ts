/**
 * {@link QuestData QuestData.ts}
 *
 * Stores data for quests globally
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class QuestData {
    questsStartTimestamp = 1;

    // All 7 quests in ID form, with easiest coming first and hardest coming last
    curQuestIDs = ['', '', '', '', '', '', ''] as [string, string, string, string, string, string, string]
}
