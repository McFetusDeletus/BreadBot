import {OutcomeSubConfig} from './OutcomeSubConfig';

/**
 * {@link OutcomeConfig OutcomeConfig.ts}
 *
 * Stores an outcome configuration for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */

export class OutcomeConfig {
    public readonly weight = 0 as number;
    public readonly category = '' as string;
    public readonly suboutcomes = [] as OutcomeSubConfig[];
}
