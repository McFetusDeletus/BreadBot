import {
    AttachmentBuilder,
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    User
} from 'discord.js';
import {BoarUser} from '../../util/boar/BoarUser';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {Replies} from '../../util/interactions/Replies';
import {LogDebug} from '../../util/logging/LogDebug';
import {ItemImageGenerator} from '../../util/generators/ItemImageGenerator';

/**
 * {@link GiveSubcommand GiveSubcommand.ts}
 *
 * Used to give a user a specific item.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class GiveSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private interaction = {} as ChatInputCommandInteraction;
    private userInput = {} as User;
    private idInput = '';
    private subcommandInfo = this.config.commandConfigs.boarDev.give;
    public readonly data = { name: this.subcommandInfo.name, path: __filename };

    /**
     * Handles the functionality for this subcommand
     *
     * @param interaction - The interaction that called the subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        this.config = BoarBotApp.getBot().getConfig();

        const guildData = await InteractionUtils.handleStart(interaction, this.config);
        if (!guildData) return;

        if (!this.config.devs.includes(interaction.user.id)) {
            await Replies.noPermsReply(interaction, this.config);
            return;
        }

        await interaction.deferReply({ ephemeral: true });
        this.interaction = interaction;

        const strConfig = this.config.stringConfig;

        // The user to give the item to
        const userInput = interaction.options.getUser(this.subcommandInfo.args[0].name);

        // The id of the item
        const idInput = interaction.options.getString(this.subcommandInfo.args[1].name);

        if (!userInput || !idInput) {
            await Replies.handleReply(interaction, strConfig.nullFound);
            return;
        }

        this.userInput = userInput;
        this.idInput = idInput;

        await this.doGive();
    }

    /**
     * Handles when an argument has options that need to be
     * autocompleted
     *
     * @param interaction - Used to get the entered value to autocomplete
     */
    public async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        if (!this.config.devs.includes(interaction.user.id)) {
            await interaction.respond(
                [{
                    name: "No Access",
                    value: "none"
                }]
            );
            return;
        }

        const strConfig = this.config.stringConfig;

        const focusedValue = interaction.options.getFocused().toLowerCase();

        const boarChoices = Object.keys(this.config.itemConfigs.boars).map((val: string) => {
            return val + ' | ' + strConfig.giveBoarChoiceTag;
        });

        const badgeChoices = Object.keys(this.config.itemConfigs.badges).map((val: string) => {
            return val + ' | ' + strConfig.giveBadgeChoiceTag;
        });

        const choices = boarChoices.concat(badgeChoices);
        const possibleChoices = choices.filter((choice: string) => {
            return choice.toLowerCase().includes(focusedValue);
        });

        // Shows choices that match input
        await interaction.respond(
            possibleChoices.map((choice: string) => {
                return { name: choice, value: choice };
            }).slice(0, 25)
        );
    }

    /**
     * Gives the user the item that was input and responds with an attachment of the item
     *
     * @private
     */
    private async doGive(): Promise<void> {
        const strConfig = this.config.stringConfig;

        const boarUser = new BoarUser(this.userInput, true);

        const inputID = this.idInput.split(' ')[0];
        const tag = this.idInput.split(' ')[2];
        let attachment: AttachmentBuilder | undefined;
        let bacteriaAttachment: AttachmentBuilder | undefined;
        let replyString = strConfig.giveBoar;

        const idNoExist = !tag || (tag !== strConfig.giveBoarChoiceTag && tag !== strConfig.giveBadgeChoiceTag) ||
            tag === strConfig.giveBoarChoiceTag && !this.config.itemConfigs.boars[inputID] ||
            tag === strConfig.giveBadgeChoiceTag && !this.config.itemConfigs.badges[inputID];

        if (idNoExist) {
            await Replies.handleReply(this.interaction, strConfig.giveBadID);
            return;
        }

        LogDebug.log(
            'Gave \'' + this.idInput + '\' to ' + this.userInput.username + '(' + this.userInput.id + ')',
            this.config, this.interaction, true
        );

        if (tag === strConfig.giveBoarChoiceTag) {
            const bacteriaEditions = await boarUser.addBoars(
                [this.idInput.split(' ')[0]], this.interaction, this.config
            );

            attachment = await new ItemImageGenerator(boarUser.user, inputID, strConfig.giveTitle, this.config)
                .handleImageCreate(false, this.interaction.user);

            if (bacteriaEditions.length > 0) {
                bacteriaAttachment = await new ItemImageGenerator(
                    boarUser.user, 'bacteria', strConfig.giveTitle, this.config
                ).handleImageCreate(false, this.interaction.user);
            }
        } else if (tag === strConfig.giveBadgeChoiceTag) {
            const hasBadge = await boarUser.addBadge(this.idInput.split(' ')[0], this.interaction);

            if (!hasBadge) {
                attachment = await new ItemImageGenerator(boarUser.user, inputID, strConfig.giveBadgeTitle, this.config)
                    .handleImageCreate(true, this.interaction.user);

                replyString = strConfig.giveBadge;
            } else {
                replyString = strConfig.giveBadgeHas;
            }
        }

        await Replies.handleReply(this.interaction, replyString);

        if (attachment) {
            await this.interaction.followUp({ files: [attachment] });
        }

        if (bacteriaAttachment) {
            await this.interaction.followUp({ files: [bacteriaAttachment] });
        }
    }
}
