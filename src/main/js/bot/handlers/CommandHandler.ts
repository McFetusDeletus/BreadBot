import {Routes} from 'discord-api-types/v10';
import {BotConfig} from '../config/BotConfig';
import fs from 'fs';
import {Command} from '../../api/commands/Command';
import {REST} from '@discordjs/rest';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder} from 'discord.js';
import {LogDebug} from '../../util/logging/LogDebug';
import * as path from "path";

/**
 * {@link CommandHandler CommandHandler.ts}
 *
 * Handles setting, getting, and deploying commands
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class CommandHandler {
    private commands = new Map<string, Command>();
    private subcommands = new Map<string, Subcommand>();

    /**
     * Sets up all the {@link Command commands} the bot can use
     */
    public registerCommands(): void {
        const config = BoarBotApp.getBot().getConfig();

        let commandFolders: string[];

        try {
            commandFolders = fs.readdirSync(path.resolve(__dirname, config.pathConfig.commands));
        } catch {
            LogDebug.handleError('Unable to find command directory provided in \'config.json\'!');
            process.exit(-1);
        }

        const allFiles = this.findCommandFiles(commandFolders, config);
        this.registerCommandFiles(allFiles, config);
    }

    /**
     * Finds all command and subcommand files
     *
     * @param config - The config file to use. Parameterized to prevent bugs when updating config
     * @param commandFolders - All folders that store commands
     * @return All command and subcommand files
     * @private
     */
    private findCommandFiles(commandFolders: string[], config: BotConfig): string[][] {
        let allCommandFiles = [] as string[];
        let allSubcommandFiles = [] as string[];

        for (const commandFolder of commandFolders) {
            const folderFiles = fs.readdirSync(path.resolve(__dirname, config.pathConfig.commands + commandFolder));

            const subcommandFiles = folderFiles.filter((fname: string) => {
                return fname.toLowerCase().includes('subcommand');
            });

            subcommandFiles.forEach((fname: string, index: number, arr: string[]) => {
                arr[index] = commandFolder + '/' + fname;
            });

            allSubcommandFiles = allSubcommandFiles.concat(subcommandFiles);

            const commandFile = folderFiles.find((fname: string) => {
                return !subcommandFiles.includes(fname);
            });

            if (!commandFile) {
                LogDebug.handleError(`Command folder '${commandFolder}' has no command class file!`);
                process.exit(-1);
            }

            folderFiles.forEach((fname: string, index: number, arr: string[]) => {
                arr[index] = commandFolder + '/' + fname;
            });

            allCommandFiles = allCommandFiles.concat(folderFiles);
        }

        return [allCommandFiles, allSubcommandFiles];
    }

    /**
     * Registers commands from their respective files
     *
     * @param config - The config file to use. Parameterized to prevent bugs when updating config
     * @param allFiles - All command and subcommand files
     * @private
     */
    private registerCommandFiles(allFiles: string[][], config: BotConfig): void {
        const commandFiles = allFiles[0];
        const subcommandFiles = allFiles[1];

        for (const commandFile of commandFiles) {
            try {
                const exports = require('../../commands/' + commandFile);
                const commandClass = new exports.default();

                if (!subcommandFiles.includes(commandFile)) {
                    this.commands.set(commandClass.data.name, commandClass as Command);
                } else {
                    this.subcommands.set(commandClass.data.name, commandClass as Subcommand);
                }

                LogDebug.log('Successfully found and set command: ' + commandClass.data.name, config);
            } catch (err: unknown) {
                LogDebug.handleError(err);
                process.exit(-1);
            }
        }
    }

    /**
     * Grabs the {@link Map} storing {@link Command} data
     */
    public getCommands(): Map<string, Command> {
        return this.commands;
    }

    /**
     * Grabs the {@link Map} storing {@link Subcommand} data
     */
    public getSubcommands(): Map<string, Subcommand> {
        return this.subcommands;
    }

    /**
     * Deploys application commands to Discord's API
     */
    public async deployCommands(): Promise<void> {
        const config = BoarBotApp.getBot().getConfig();

        const applicationCommandData = [] as (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder)[];
        const guildCommandData  = [] as (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder)[];

        for (const command of [...this.commands.values()]) {
            if (command.data.toJSON().default_member_permissions?.includes('0')) {
                guildCommandData.push(command.data);
                continue;
            }

            applicationCommandData.push(command.data);
        }

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN as string);
        await this.deployApplicationCommands(rest, applicationCommandData, config);
        await this.deployGuildCommands(rest, guildCommandData, config);
    }

    /**
     * Deploys application commands
     *
     * @param rest - API authorization
     * @param commandData - Application command data
     * @param config - The config file to use. Parameterized to prevent bugs when updating config
     * @private
     */
    private async deployApplicationCommands(
        rest: REST,
        commandData: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder[],
        config: BotConfig
    ): Promise<void> {
        try {
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID as string), { body: commandData });

            LogDebug.log('Application commands have successfully been registered!', config);
        } catch (err: unknown) {
            await LogDebug.handleError(err);
        }
    }

    /**
     * Deploys guild application commands
     *
     * @param rest - API authorization
     * @param commandData - Guild application command data
     * @param config - The config file to use. Parameterized to prevent bugs when updating config
     * @private
     */
    private async deployGuildCommands(
        rest: REST,
        commandData: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder[],
        config: BotConfig
    ): Promise<void> {
        try {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID as string, process.env.GUILD_ID as string),
                { body: commandData }
            );

            LogDebug.log('Guild commands have successfully been registered!', config);
        } catch (err: unknown) {
            await LogDebug.handleError(err);
        }
    }
}

