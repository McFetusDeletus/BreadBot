import {
    ChatInputCommandInteraction,
    Client,
    Events, ForumChannel,
    Interaction,
    ModalBuilder
} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {Subcommand} from '../../api/commands/Subcommand';
import {InteractionUtils} from '../../util/interactions/InteractionUtils';
import {LogDebug} from '../../util/logging/LogDebug';
import {Replies} from '../../util/interactions/Replies';
import {GuildData} from '../../bot/data/global/GuildData';

/**
 * {@link ReportSubcommand ReportSubcommand.ts}
 *
 * Allows a user to report a bug or exploit and sends
 * it in the reports forum channel
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class ReportSubcommand implements Subcommand {
    private config = BoarBotApp.getBot().getConfig();
    private subcommandInfo = this.config.commandConfigs.boar.report;
    private guildData?: GuildData;
    private interaction = {} as ChatInputCommandInteraction;
    private modalShowing = {} as ModalBuilder;
    private curModalListener?: (submittedModal: Interaction) => Promise<void>;
    public readonly data = { name: this.subcommandInfo.name, path: __filename };

    /**
     * Handles the functionality for this subcommand
     *
     * @param interaction - The interaction that called the subcommand
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        this.guildData = await InteractionUtils.handleStart(interaction, this.config);
        if (!this.guildData) return;

        const isBanned = await InteractionUtils.handleBanned(interaction, this.config);
        if (isBanned) return;

        this.interaction = interaction;
        await this.modalHandle(interaction);
    }

    /**
     * Sends the modal that gets report input
     *
     * @param inter - Used to show the modal and create/remove listener
     * @private
     */
    private async modalHandle(inter: ChatInputCommandInteraction): Promise<void> {
        const modals = this.config.commandConfigs.boar.report.modals;

        this.modalShowing = new ModalBuilder(modals[0]);
        this.modalShowing.setCustomId(modals[0].customId + '|' + inter.id);
        await inter.showModal(this.modalShowing);

        this.curModalListener = this.modalListener;

        inter.client.on(Events.InteractionCreate, this.curModalListener);

        // Forces the modal listener to end after two minutes
        setTimeout(() => {
            this.endModalListener(inter.client);
        }, 120000);
    }

    /**
     * Handles report input that was input in modal
     *
     * @param submittedModal - The interaction to respond to
     * @private
     */
    private modalListener = async (submittedModal: Interaction): Promise<void> => {
        try  {
            if (submittedModal.user.id !== this.interaction.user.id) return;

            const maintenanceBlocked = this.config.maintenanceMode &&
                !this.config.devs.includes(this.interaction.user.id);

            if (maintenanceBlocked) {
                this.endModalListener(submittedModal.client);
                return;
            }

            const invalidSubmittedModal = !submittedModal.isModalSubmit() ||
                !submittedModal.guild || submittedModal.customId !== this.modalShowing.data.custom_id;

            if (invalidSubmittedModal) {
                this.endModalListener(submittedModal.client);
                return;
            }

            await submittedModal.deferUpdate();

            const submittedTitle: string = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[0].components[0].data.custom_id as string
            );

            const submittedDetails: string = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[1].components[0].data.custom_id as string
            );

            const submittedLink: string = submittedModal.fields.getTextInputValue(
                this.modalShowing.components[2].components[0].data.custom_id as string
            );

            // Tells user their report has been recorded
            await Replies.handleReply(
                submittedModal, this.config.stringConfig.sentReport, undefined, undefined, undefined, true, true
            );

            // Sends report to reports channel
            await this.sendReport(submittedTitle, submittedDetails, submittedLink);
        } catch (err: unknown) {
            await LogDebug.handleError(err, this.interaction);
        }

        this.endModalListener(submittedModal.client);
    };

    /**
     * Ends the current modal listener that's active
     *
     * @param client - Used to remove the listener
     * @private
     */
    private endModalListener(client: Client) {
        if (this.curModalListener) {
            client.removeListener(Events.InteractionCreate, this.curModalListener);
            this.curModalListener = undefined;
        }
    }

    /**
     * Sends report information to reports forum channel
     *
     * @param title - Title of forum post
     * @param post - Content of forum post
     * @param link - Relevant link for report
     * @private
     */
    private async sendReport(title: string, post: string, link: string): Promise<void> {
        try {
            const reportsChannelID = this.config.reportsChannel;
            const reportsChannel = await this.interaction.client.channels.fetch(reportsChannelID) as ForumChannel;

            // Sections post so the full report can be sent
            const postDivided = post.match(/[\s\S]{1,1800}/g) as string[];

            // Sends report with user who made the report and the content
            const newThreadChannel = await reportsChannel.threads.create({
                name: title.substring(0, 100),
                message: {
                    content: '**Report from <@' + this.interaction.user.id + '> ' + this.interaction.user.username +
                        ' **\n\n' + postDivided[0] + (link !== '' && postDivided.length === 1 ? '\n\n' + link : '')
                }
            });

            // Sends each section of the post to avoid text limit
            for (let i=1; i<postDivided.length; i++) {
                await newThreadChannel.send(postDivided[i] +
                    (link !== '' && i === postDivided.length - 1 ? '\n\n**Link:** ' + link : '')
                );
            }
        } catch (err: unknown) {
            await LogDebug.handleError(err, this.interaction);
        }
    }
}
