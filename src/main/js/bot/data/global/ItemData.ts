import {BuySellData} from './BuySellData';

/**
 * {@link ItemData ItemData.ts}
 *
 * Stores information about an item globally
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class ItemData {
    public curEdition?: number;
    public buyers = [] as BuySellData[];
    public sellers = [] as BuySellData[];
    public lastBuys = [0, 0, ''] as [curBestPrice: number, lastBestPrice: number, curBestUser: string];
    public lastSells = [0, 0, ''] as [curBestPrice: number, lastBestPrice: number, curBestUser: string];
}
