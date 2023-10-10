/**
 * {@link CommandConfigs CommandConfigs.ts}
 *
 * Stores all configurations for all commands for a bot
 * instance.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
import {BoarCommandConfig} from './BoarCommandConfig';
import {BoarDevCommandConfig} from './BoarDevCommandConfig';
import {BoarManageCommandConfig} from './BoarManageCommandConfig';

export class CommandConfigs {
    /**
     * {@link CommandConfig Command information} for {@link BoarCommand}
     */
    public readonly boar = new BoarCommandConfig();

    /**
     * {@link CommandConfig Command information} for {@link BoarDevCommand}
     */
    public readonly boarDev = new BoarDevCommandConfig();

    /**
     * {@link CommandConfig Command information} for {@link BoarManageCommand}
     */
    public readonly boarManage = new BoarManageCommandConfig();
}
