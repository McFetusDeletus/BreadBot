import {ItemData} from './ItemData';

/**
 * {@link ItemsData ItemsData.ts}
 *
 * Stores information all items globally
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class ItemsData {
    [itemType: string]: Record<string, ItemData>
    public powerups = {} as Record<string, ItemData>;
    public boars = {} as Record<string, ItemData>;
}
