import {
    ActionRowBuilder,
    ButtonBuilder,
    ComponentType, SelectMenuComponentOptionData, StringSelectMenuBuilder
} from 'discord.js';
import {RowConfig} from '../../bot/config/commands/RowConfig';
import {ComponentConfig} from '../../bot/config/commands/ComponentConfig';

/**
 * {@link ComponentUtils ComponentUtils.ts}
 *
 * A collection of functions that collectors
 * use frequently.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class ComponentUtils {
    /**
     * Adds an addition to all custom ids in an action row
     *
     * @param rowsConfig - The configuration of a collection of rows
     * @param rows - The rows to modify
     * @param id - The ID to append to the custom ID
     * @param userID - A user ID to append
     * @param options - Options to add to a select menu
     * @return Updated row with addition to ids
     */
    public static addToIDs(
        rowsConfig: RowConfig[],
        rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[],
        id: string,
        userID?: string,
        options?: SelectMenuComponentOptionData[]
    ): void {
        let rowIndex = 0;

        for (const row of rows) {
            for (const component in row.components) {
                const componentConfig: ComponentConfig = rowsConfig[rowIndex].components[component];
                let curID = componentConfig.customId + '|' + id;

                if (userID) {
                    curID += '|' + userID;
                }

                row.components[component].setCustomId(curID);
            }

            if (options) {
                ComponentUtils.addOptionsToSelectRow(row, options);
            }

            rowIndex++;
        }
    }

    /**
     * Adds options to the select menu in a row
     *
     * @param row - The row to update
     * @param options - The options to add to the select menu
     */
    public static addOptionsToSelectRow(
        row: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
        options: SelectMenuComponentOptionData[]
    ): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder> {
        if (row.components[0].data.type === ComponentType.StringSelect) {
            (row.components[0] as StringSelectMenuBuilder).setOptions(...options);
        }

        return row;
    }

    /**
     * Makes rows from row configuration data
     *
     * @param rowsConfig - Row configuration data
     */
    public static makeRows(rowsConfig: RowConfig[]): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
        const newRows = [] as ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];

        for (const rowConfig of rowsConfig) {
            newRows.push(new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>(rowConfig));
        }

        return newRows;
    }
}
