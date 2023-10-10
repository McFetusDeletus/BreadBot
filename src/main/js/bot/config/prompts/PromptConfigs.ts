import {PromptTypeConfigs} from './PromptTypeConfigs';
import {RowConfig} from '../commands/RowConfig';

/**
 * {@link PromptConfigs PromptConfigs.ts}
 *
 * Stores powerup configurations for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class PromptConfigs {
    public readonly types = new PromptTypeConfigs();
    public readonly rows = [] as RowConfig[];
}
