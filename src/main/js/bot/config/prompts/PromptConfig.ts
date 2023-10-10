import {RowConfig} from '../commands/RowConfig';

/**
 * {@link PromptConfig PromptConfig.ts}
 *
 * Stores a powerup prompt configuration for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class PromptConfig {
    public readonly name = '' as string;
    public readonly description = '' as string;
    public readonly rows = [] as RowConfig[];
    public readonly emoji1 = '' as string;
    public readonly emoji2 = '' as string;
    public readonly choices = ['', '', '', ''];
    public readonly numButtons = 0 as number;
    public readonly rightClock = '' as string;
}
