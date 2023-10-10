/**
 * {@link BuySellData BuySellData.ts}
 *
 * Stores information a buy/sell entry of an item
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class BuySellData {
    public userID = '';
    public price = 0;
    public num = 0;
    public editions = [] as number[];
    public editionDates = [] as number[];
    public listTime = 0;
    public filledAmount = 0;
    public claimedAmount = 0;
}
