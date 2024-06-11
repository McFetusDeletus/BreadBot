import {RarityConfig} from '../../bot/config/items/RarityConfig';
import {BotConfig} from '../../bot/config/BotConfig';
import {GuildData} from '../../bot/data/global/GuildData';
import {ItemsData} from '../../bot/data/global/ItemsData';

/**
 * {@link BoarUtils BoarUtils.ts}
 *
 * Functions used specifically for boar functionality.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class BoarUtils {
    /**
     * Finds the rarity index from a given boar ID
     *
     * @param boarID - Boar ID to get rarity for
     * @param config - Used to get rarity weights
     * @return Rarity index (0) and rarity config (1) tuple
     */
    public static findRarity(boarID: string, config: BotConfig): [number, RarityConfig] {
        const orderedRarities = [...config.rarityConfigs].sort((rarity1: RarityConfig, rarity2: RarityConfig) => {
            return rarity2.weight - rarity1.weight;
        });

        for (let i=0; i<orderedRarities.length; i++) {
            const boarExists = orderedRarities[i].boars.includes(boarID);

            if (!boarExists) continue;

            return [i + 1, orderedRarities[i]];
        }

        return [0, orderedRarities[orderedRarities.length-1]]; // Shouldn't ever trigger with proper config validation
    }

    /**
     * Finds a boar that meets the requirements of the
     * guild and isn't blacklisted
     *
     * @param rarityIndex - The rarity index that's being checked
     * @param config - Used to get boar and rarity information
     * @param guildData - Used to see if a boar should be ignored
     * @private
     */
    public static findValid(rarityIndex: number, guildData: GuildData | undefined, config: BotConfig): string {
        const rarities = config.rarityConfigs;
        const boarIDs = config.itemConfigs.boars;
        const randomBoar = Math.random();

        // Stores the IDs of the current rarity being checked

        const validRarityBoars = [] as string[];
        for (const boarID of rarities[rarityIndex].boars) {
            const blacklistType = boarIDs[boarID];

            validRarityBoars.push(boarID);
        }

        if (validRarityBoars.length == 0) {
            return '';
        }

        return validRarityBoars[Math.floor(randomBoar * validRarityBoars.length)];
    }

    /**
     * Gets the boar to give to the user
     *
     * @param config - Used to get valid boars and debug
     * @param guildData - Used to see if a boar should be ignored
     * @param rarityWeights - Map of weights and their indexes
     * @param extraVals - User's chances of extra boars
     * @private
     */
    public static getRandBoars(
        guildData: GuildData | undefined,
        rarityWeights: Map<number, number>,
        config: BotConfig,
        extraVals: number[] = [],
    ): string[] {
        const boarIDs = [] as string[];
        let numBoars = 1;

        // Sorts from the lowest weight to the highest weight
        rarityWeights = new Map([...rarityWeights.entries()].sort((a: [number, number], b: [number, number]) => {
            return a[1] - b[1];
        }));
        const weightTotal = [...rarityWeights.values()].reduce((curSum: number, weight: number) => {
            return curSum + weight;
        });

        // Sets probabilities by adding the previous probability to the current probability

        let prevProb = 0;
        const probabilities = new Map([...rarityWeights.entries()].map((val: [number, number]) => {
            const prob: [number, number] = [val[0], val[1] / weightTotal + prevProb];
            prevProb = prob[1];
            return prob;
        }));

        extraVals.forEach(percentage => {
            if (Math.random() * 100 < percentage) {
                numBoars++;
            }
        });

        for (let i=0; i<numBoars; i++) {
            const randomRarity = Math.random();

            // Finds the rarity that was rolled and adds a random boar from that rarity to user profile
            for (const probabilityInfo of probabilities) {
                const rarityIndex = probabilityInfo[0];
                const probability = probabilityInfo[1];

                // Goes to next probability if randomRarity is higher
                // Keeps going if it's the rarity with the highest probability
                if (randomRarity > probability && Math.max(...probabilities.values()) !== probability) continue;

                const boarGotten = BoarUtils.findValid(rarityIndex, guildData, config);

                boarIDs.push(boarGotten);
                break;
            }
        }

        return boarIDs;
    }

    /**
     * Returns a map storing rarity weights and their indexes
     *
     * @param config - Used to get rarity information
     * @private
     */
    public static getBaseRarityWeights(config: BotConfig): Map<number, number> {
        const rarities = config.rarityConfigs;
        const rarityWeights = new Map<number, number>();

        // Gets weight of each rarity and assigns it to Map object with its index
        for (let i=0; i<rarities.length; i++) {
            let weight = rarities[i].weight;

            if (!rarities[i].fromDaily) {
                weight = 0;
            }

            const curDate = new Date();
            const isHalloWeek = curDate.getMonth() === 9 && curDate.getDate() >= 24;
            const isFestiveWeek = curDate.getMonth() === 11 && curDate.getDate() >= 24;

            if ((isHalloWeek || isFestiveWeek) && rarities[i].name === 'Common') {
                weight = 0;
            }

            if (isHalloWeek && rarities[i].name === 'Wicked') {
                weight = rarities[2].weight;
            }

            if (isFestiveWeek && rarities[i].name === 'Festive') {
                weight = rarities[2].weight;
            }

            rarityWeights.set(i, weight);
        }

        return rarityWeights;
    }

    /**
     * Applies the user multiplier to rarity weights using an arc-tan function
     *
     * @param userMultiplier - Used to increase weight
     * @param rarityWeights - Map of weights and their indexes
     * @param config - Used for rarity increase constant
     * @private
     */
    public static applyMultiplier(
        userMultiplier: number, rarityWeights: Map<number, number>, config: BotConfig
    ): Map<number, number> {
        // Sorts from the highest weight to the lowest weight
        const newWeights = new Map<number, number>(
            [...rarityWeights.entries()].sort((a: [number, number], b: [number, number]) => {
                return b[1] - a[1];
            })
        );

        const highestWeight = newWeights.values().next().value;
        const rarityIncreaseConst = config.numberConfig.rarityIncreaseConst;

        // Increases probability by increasing weight
        // https://www.desmos.com/calculator/74inrkixxa | x = multiplier, o = weight
        for (const weightInfo of newWeights) {
            const rarityIndex = weightInfo[0];
            const oldWeight = weightInfo[1];

            if (oldWeight == 0) continue;

            newWeights.set(
                rarityIndex,
                oldWeight * (Math.atan(((userMultiplier - 1) * oldWeight) / rarityIncreaseConst) *
                    (highestWeight - oldWeight) / oldWeight + 1)
            );
        }

        // Restores the original order of the Map
        return new Map([...newWeights.entries()].sort((a: [number, number], b: [number, number]) => {
            return a[0] - b[0];
        }));
    }

    /**
     * Finds the closest boar name (w/o spaces) to an input
     *
     * @param input - Used as input in finding the closest boar name
     * @param searchArr - The array of boar names and an associated number value (usually a page number)
     */
    public static getClosestName(input: string, searchArr: [string, number][]): number {
        let posToReturn;

        searchArr.every(val => {
            if (!val[0].includes(input)) return true;
            posToReturn = val[1];
        });

        if (posToReturn !== undefined) {
            return posToReturn;
        }

        const sortedSearchArr = searchArr.sort((a: [string, number], b: [string, number]) => {
            return a[0].localeCompare(b[0]);
        });

        sortedSearchArr.every((val, index) => {
            if (index !== searchArr.length-1 && input > val[0]) return true;
            posToReturn = val[1];
        });

        if (posToReturn !== undefined) {
            return posToReturn;
        } else {
            return 0;
        }
    }

    /**
     * Orders the boars in the global itemsData file, so they show up right in /boar market
     *
     * @param itemsData - All the items and their global data
     * @param config - Used to get rarity configurations
     */
    public static orderGlobalBoars(itemsData: ItemsData, config: BotConfig): void {
        const globalBoars = Object.keys(itemsData.boars);

        const orderedRarities = [...config.rarityConfigs.slice(0,config.rarityConfigs.length-1)]
            .sort((rarity1: RarityConfig, rarity2: RarityConfig) => {
                return rarity1.weight - rarity2.weight;
            });

        // Looping through all boar classes (Common -> Special)
        for (const rarity of orderedRarities) {
            const orderedBoars = [] as string[];
            const boarsOfRarity = rarity.boars;

            // Looping through user's boar collection
            for (let j=0; j<globalBoars.length; j++) {
                const curBoarID = globalBoars[j]; // ID of current boar
                const curBoarData = itemsData.boars[curBoarID]; // Data of current boar

                if (!boarsOfRarity.includes(curBoarID) || orderedBoars.includes(curBoarID)) continue;

                // Removes boar from front and add it to the back of the list to refresh the order
                delete itemsData.boars[curBoarID];
                itemsData.boars[curBoarID] = curBoarData;

                orderedBoars.push(curBoarID);
                j--;
            }
        }
    }
}
