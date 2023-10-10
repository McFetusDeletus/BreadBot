import {
    ActionRowBuilder, ButtonBuilder, ButtonInteraction, ChatInputCommandInteraction,
    ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuInteraction
} from 'discord.js';

/**
 * {@link FormField FormField.ts}
 *
 * Handles each field of a linear form.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class FormField {
    private readonly defaultContent: string;
    public content: string;
    public components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];

    /**
     * Create a field in a form
     *
     * @param content - Message content in the form
     * @param components - Components (Buttons, Select Menus) in the form
     */
    constructor(content: string, components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]) {
        this.defaultContent = content;
        this.content = content;
        this.components = components ? components : [];
    }

    /**
     * Edits the reply to be this field
     *
     * @param interaction - Interaction to be edited
     */
    public async editReply(
        interaction:
            | ChatInputCommandInteraction
            | StringSelectMenuInteraction
            | ButtonInteraction
            | ModalSubmitInteraction
    ): Promise<void> {
        await interaction.editReply({
            content: this.content,
            components: [...this.components]
        });
    }

    /**
     * Resets the field back to its original contents
     */
    public reset(): void { this.content = this.defaultContent; }
}
