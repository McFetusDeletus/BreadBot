import {ItemConfig} from './ItemConfig';

/**
 * {@link ItemConfigs ItemConfigs.ts}
 *
 * Stores a set of item configurations for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class ItemConfigs {
    readonly [itemKey: string]: ItemConfig;
}
