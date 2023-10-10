import {SubcommandArgsConfig} from './SubcommandArgsConfig';
import {RowConfig} from './RowConfig';
import {ModalConfig} from './ModalConfig';

/**
 * {@link SubcommandConfig SubcommandConfig.ts}
 *
 * Stores a specific subcommand configuration
 * for a bot instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class SubcommandConfig {
    public readonly name = '' as string;
    public readonly description = '' as string;

    // Arguments the command uses
    public readonly args = [] as SubcommandArgsConfig[];

    // Components and modals associated with a command
    // NOTE: Types should expand as more commands with Components and Modals are added

    public readonly componentFields = [] as RowConfig[][];
    public readonly modals = [] as ModalConfig[];

}
