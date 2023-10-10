import {CollectedBoar} from './CollectedBoar';
import {CollectedBadge} from './CollectedBadge';
import {CollectedPowerup} from './CollectedPowerup';
import {CollectedTheme} from './CollectedTheme';

/**
 * {@link CollectedItems CollectedItems.ts}
 *
 * Information for all collected items.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class CollectedItems {
    public boars = {} as Record<string, CollectedBoar>;
    public badges = {} as Record<string, CollectedBadge>;
    public powerups = {} as Record<string, CollectedPowerup>;
    public themes = {} as Record<string, CollectedTheme>;
}
