import {SubcommandConfig} from './SubcommandConfig';
import {CommandConfig} from './CommandConfig';

/**
 * {@link BoarCommandConfig BoarCommandConfig.ts}
 *
 * Stores configurations for the {@link BoarCommand boar command}
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class BoarCommandConfig extends CommandConfig {
    /**
     * {@link SubcommandConfig Subcommand information} for {@link HelpSubcommand}
     */
    public readonly help = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link DailySubcommand}
     */
    public readonly daily = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link CollectionSubcommand}
     */
    public readonly collection = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link TopSubcommand}
     */
    public readonly top = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link MarketSubcommand}
     */
    public readonly market = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link ReportSubcommand}
     */
    public readonly report = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link SelfWipeSubcommand}
     */
    public readonly selfWipe = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link GiftSubcommand}
     */
    public readonly gift = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link QuestsSubcommand}
     */
    public readonly quests = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link SupportSubcommand}
     */
    public readonly support = new SubcommandConfig();

    /**
     * {@link SubcommandConfig Subcommand information} for {@link GuessSubcommand}
     */
    public readonly guess = new SubcommandConfig();
}
