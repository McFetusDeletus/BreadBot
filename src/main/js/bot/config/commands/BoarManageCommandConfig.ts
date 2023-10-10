import {SubcommandConfig} from './SubcommandConfig';
import {CommandConfig} from './CommandConfig';

/**
 * {@link BoarManageCommandConfig BoarManageCommandConfig.ts}
 *
 * Stores configurations for the {@link BoarManageCommand boar-manage command}
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class BoarManageCommandConfig extends CommandConfig {
    /**
     * {@link SubcommandConfig Subcommand information} for {@link SetupSubcommand}
     */
    public readonly setup = new SubcommandConfig();
}
