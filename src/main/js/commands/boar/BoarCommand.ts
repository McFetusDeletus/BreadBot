import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Command} from '../../api/commands/Command';
import {ChoicesConfig} from '../../bot/config/commands/ChoicesConfig';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';

/**
 * {@link BoarCommand BoarCommand.ts}
 *
 * All main boar commands.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class BoarCommand implements Command {
    private config = BoarBotApp.getBot().getConfig();
    private commandInfo = this.config.commandConfigs.boar;
    public readonly data = new SlashCommandBuilder()
        .setName(this.commandInfo.name)
        .setDescription(this.commandInfo.description)
        .setDMPermission(false)
        .setDefaultMemberPermissions(this.commandInfo.perms)
        .addSubcommand(sub => sub.setName(this.commandInfo.help.name)
            .setDescription(this.commandInfo.help.description)
            .addIntegerOption(option => option.setName(this.commandInfo.help.args[0].name)
                .setDescription(this.commandInfo.help.args[0].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.help.args[0].required))
                .setChoices(...this.commandInfo.help.args[0].choices as ChoicesConfig<number>[])
            )
            .addIntegerOption(option => option.setName(this.commandInfo.help.args[1].name)
                .setDescription(this.commandInfo.help.args[1].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.help.args[1].required))
            )
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.daily.name)
            .setDescription(this.commandInfo.daily.description)
            .addStringOption(option => option.setName(this.commandInfo.daily.args[0].name)
                .setDescription(this.commandInfo.daily.args[0].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.daily.args[0].required))
                .setChoices(...this.commandInfo.daily.args[0].choices as ChoicesConfig<string>[])
            )
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.collection.name)
            .setDescription(this.commandInfo.collection.description)
            .addUserOption(option => option.setName(this.commandInfo.collection.args[0].name)
                .setDescription(this.commandInfo.collection.args[0].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.collection.args[0].required))
            )
            .addIntegerOption(option => option.setName(this.commandInfo.collection.args[1].name)
                .setDescription(this.commandInfo.collection.args[1].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.collection.args[1].required))
                .setChoices(...this.commandInfo.collection.args[1].choices as ChoicesConfig<number>[])
            )
            .addStringOption(option => option.setName(this.commandInfo.collection.args[2].name)
                .setDescription(this.commandInfo.collection.args[2].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.collection.args[2].required))
            )
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.top.name)
            .setDescription(this.commandInfo.top.description)
            .addStringOption(option => option.setName(this.commandInfo.top.args[0].name)
                .setDescription(this.commandInfo.top.args[0].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.top.args[0].required))
                .setChoices(...this.commandInfo.top.args[0].choices as ChoicesConfig<string>[])
            )
            .addUserOption(option => option.setName(this.commandInfo.top.args[1].name)
                .setDescription(this.commandInfo.top.args[1].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.top.args[1].required))
            )
            .addIntegerOption(option => option.setName(this.commandInfo.top.args[2].name)
                .setDescription(this.commandInfo.top.args[2].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.top.args[2].required))
            )
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.market.name)
            .setDescription(this.commandInfo.market.description)
            .addIntegerOption(option => option.setName(this.commandInfo.market.args[0].name)
                .setDescription(this.commandInfo.market.args[0].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.market.args[0].required))
                .setChoices(...this.commandInfo.market.args[0].choices as ChoicesConfig<number>[])
            )
            .addStringOption(option => option.setName(this.commandInfo.market.args[1].name)
                .setDescription(this.commandInfo.market.args[1].description)
                .setRequired(InteractionUtils.toBoolean(this.commandInfo.market.args[1].required))
            )
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.report.name)
            .setDescription(this.commandInfo.report.description)
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.selfWipe.name)
            .setDescription(this.commandInfo.selfWipe.description)
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.gift.name)
            .setDescription(this.commandInfo.gift.description)
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.quests.name)
            .setDescription(this.commandInfo.quests.description)
        )
        .addSubcommand(sub => sub.setName(this.commandInfo.support.name)
            .setDescription(this.commandInfo.support.description)
        );

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        InteractionUtils.executeSubcommand(interaction);
    }
}
