import {AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Command} from '../../api/commands/Command';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';

/**
 * {@link BoarDevCommand BoarDevCommand.ts}
 *
 * All dev-only boar commands.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class BoarDevCommand implements Command {
    private config = BoarBotApp.getBot().getConfig();
    private commandInfo = this.config.commandConfigs.boarDev;
    public readonly data = new SlashCommandBuilder()
        .setName(this.commandInfo.name)
        .setDescription(this.commandInfo.description)
        .setDMPermission(false)
        .setDefaultMemberPermissions(this.commandInfo.perms)
        .addSubcommand(sub => sub.setName(this.commandInfo.give.name)
            .setDescription(this.commandInfo.give.description)
            .addUserOption(option => option.setName(this.commandInfo.give.args[0].name)
                .setDescription(this.commandInfo.give.args[0].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.give.args[0].required))
            )
            .addStringOption(option => option.setName(this.commandInfo.give.args[1].name)
                .setDescription(this.commandInfo.give.args[1].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.give.args[1].required))
                .setAutocomplete(InteractionUtils.toBoolean(this.commandInfo.give.args[1].autocomplete))
            )
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.ban.name)
            .setDescription(this.commandInfo.ban.description)
            .addUserOption(option => option.setName(this.commandInfo.ban.args[0].name)
                .setDescription(this.commandInfo.ban.args[0].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.ban.args[0].required))
            )
            .addIntegerOption(option => option.setName(this.commandInfo.ban.args[1].name)
                .setDescription(this.commandInfo.ban.args[1].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.ban.args[1].required))
            )
        );

    public async execute(interaction: AutocompleteInteraction | ChatInputCommandInteraction): Promise<void> {
        InteractionUtils.executeSubcommand(interaction);
    }
}
