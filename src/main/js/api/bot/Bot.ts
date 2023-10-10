import {BotConfig} from '../../bot/config/BotConfig';
import {Command} from '../commands/Command';
import {Client} from 'discord.js';
import {Subcommand} from '../commands/Subcommand';

/**
 * {@link Bot Bot.ts}
 *
 * An interface used to handle a new bot.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export interface Bot {
    buildClient(): void;
    getClient(): Client;
    getStartTime(): number;
    loadConfig(firstLoad: boolean): void;
    getConfig(): BotConfig;
    getConfigHash(): string;
    registerCommands(): void;
    getCommands(): Map<string, Command>;
    getSubcommands(): Map<string, Subcommand>;
    deployCommands(): void;
    registerListeners(): void;
    onStart(): void;
    login(): void;
}
