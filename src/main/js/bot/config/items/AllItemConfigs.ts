import {ItemConfigs} from './ItemConfigs';

/**
 * {@link AllItemConfigs AllItemConfigs.ts}
 *
 * Stores all item configurations for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class AllItemConfigs {
    readonly [itemType: string]: ItemConfigs;
    public readonly boars = new ItemConfigs();
    public readonly badges = new ItemConfigs();
    public readonly powerups = new ItemConfigs();
}
