import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Command} from '../../api/commands/Command';
import {InteractionUtils} from "../../util/interactions/InteractionUtils";

/**
 * {@link BoarManageCommand BoarManageCommand.ts}
 *
 * All management-only boar commands.
 *

 * @copyright WeslayCodes & Contributors 2023
 */
export default class BoarManageCommand implements Command {
    private config = BoarBotApp.getBot().getConfig();
    private commandInfo = this.config.commandConfigs.boarManage;
    public readonly data = new SlashCommandBuilder()
        .setName(this.commandInfo.name)
        .setDescription(this.commandInfo.description)
        .setDMPermission(false)
        .setDefaultMemberPermissions(this.commandInfo.perms)
        .addSubcommand(sub => sub.setName(this.commandInfo.setup.name)
            .setDescription(this.commandInfo.setup.description)
        );

    /**
     * Executes the called subcommand if it exists
     *
     * @param interaction - An interaction that could've called a boar-manage subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        InteractionUtils.executeSubcommand(interaction);
    }
}
