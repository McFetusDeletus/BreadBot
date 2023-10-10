/**
 * {@link SubcommandArgsConfig SubcommandArgsConfig.ts}
 *
 * Stores subcommand argument configurations for a bot
 * instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
import {ChoicesConfig} from './ChoicesConfig';

export class SubcommandArgsConfig {
    public readonly name = '' as string;
    public readonly description = '' as string;
    public readonly required?: boolean;
    public readonly autocomplete?: boolean;
    public readonly choices?: ChoicesConfig[];
}
