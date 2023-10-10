import {GeneralStats} from './GeneralStats';
import {PowerupStats} from './PowerupStats';
import {QuestStats} from './QuestStats';

/**
 * {@link UserStats UserStats.ts}
 *
 * A collection of user stats.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class UserStats {
    public general = new GeneralStats();
    public powerups = new PowerupStats();
    public quests = new QuestStats();
}
