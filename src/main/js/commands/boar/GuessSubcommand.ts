import {ChatInputCommandInteraction,} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {GuildData} from '../../bot/data/global/GuildData';

/**
 * {@link GuessSubcommand GuessSubcommand.ts}
 *
 * Allows a user to guess a value for a hunt
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class GuessSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.guess;
    private guildData?: GuildData;
    public readonly data = { name: this.subcommandInfo.name, path: __filename };

    /**
     * Handles the functionality for this subcommand
     *
     * @param interaction - The interaction that called the subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        this.guildData = await InteractionUtils.handleStart(interaction, this.config);
        if (!this.guildData) return;

        await interaction.deferReply({ ephemeral: true });

        const valInput = interaction.options.getString(this.subcommandInfo.args[0].name) ?? '';

        const guessInterpreterExports = require(this.config.pathConfig.guessInterpreterFile);
        const guessInterpreter = new guessInterpreterExports.default();

        guessInterpreter.interpret(interaction, valInput, this.config);
    }
}
