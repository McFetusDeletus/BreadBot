/**
 * {@link SubcommandArgsConfig SubcommandArgsConfig.ts}
 *
 * Stores subcommand argument configurations for a bot
 * instance.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
import {ChoicesConfig} from './ChoicesConfig';

export class SubcommandArgsConfig {
    public readonly name = '' as string;
    public readonly description = '' as string;
    public readonly required = false as boolean;
    public readonly autocomplete = false as boolean;
    public readonly choices = [] as ChoicesConfig[];
}