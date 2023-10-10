import {SubcommandConfig} from './SubcommandConfig';
import {CommandConfig} from './CommandConfig';

/**
 * {@link BoarDevCommandConfig BoarDevCommandConfig.ts}
 *
 * Stores configurations for the {@link BoarDevCommand boar-dev command}
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class BoarDevCommandConfig extends CommandConfig {
    /**
     * {@link SubcommandConfig Subcommand information} for {@link GiveSubcommand}
     */
    public readonly give = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link BanSubcommand}
     */
    public readonly ban = new SubcommandConfig();
}
