/**
 * {@link ChoicesConfig ChoicesConfig.ts}
 *
 * Stores choice configurations for a subcommand argument
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class ChoicesConfig<T = string | number> {
    public readonly name = '' as string;
    public readonly value = '' as T;
}
