/**
 * {@link CommandConfig CommandConfig.ts}
 *
 * Stores a specific command configuration
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class CommandConfig {
    public readonly name = '' as string;
    public readonly description = '' as string;
    public readonly perms?: bigint;
}
