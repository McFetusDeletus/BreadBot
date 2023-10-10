import {ComponentType} from 'discord.js';
import {ComponentConfig} from './ComponentConfig';

/**
 * {@link RowConfig RowConfig.ts}
 *
 * Stores configurations for a component row
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class RowConfig {
    public readonly type = ComponentType.ActionRow;
    public readonly components = [] as ComponentConfig[];
}
