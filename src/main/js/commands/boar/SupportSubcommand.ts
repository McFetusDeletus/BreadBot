import {ChatInputCommandInteraction,} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {GuildData} from '../../bot/data/global/GuildData';

/**
 * {@link SupportSubcommand SupportSubcommand.ts}
 *
 * Sends the user BoarBot's Patreon link
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class SupportSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.support;
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

        await interaction.reply({
            ephemeral: true,
            content: this.config.stringConfig.supportStr + this.config.stringConfig.supportLink
        })
    }
}
