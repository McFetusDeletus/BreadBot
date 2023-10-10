/**
 * {@link CollectedPowerup CollectedPowerup.ts}
 *
 * Information for a specific collected powerup.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class CollectedPowerup {
    public numTotal = 0;
    public highestTotal = 0;
    public numClaimed = 0;
    public numUsed = 0;
    public numActive?: number; // For miracle charms
    public numOpened?: number; // For gifts
    public curOut?: number; // For gifts
    public numSuccess?: number; // For clones
    public raritiesUsed?: number[]; // For clones and transmutations
}
