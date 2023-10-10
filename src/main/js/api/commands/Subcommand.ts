import {ChatInputCommandInteraction} from 'discord.js';

/**
 * {@link Subcommand Subcommand.ts}
 *
 * An interface used to create new subcommands.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export interface Subcommand {
    data: { name: string, path: string };
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
