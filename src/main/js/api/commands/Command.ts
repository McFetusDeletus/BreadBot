import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

/**
 * {@link Command Command.ts}
 *
 * An interface used to create new commands.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export interface Command {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction | AutocompleteInteraction): Promise<void>;
}
