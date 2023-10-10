import {Guild, PermissionResolvable} from 'discord.js';

/**
 * {@link PermissionUtils PermissionUtils.ts}
 *
 * Deals with permission checking and more.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class PermissionUtils {
    /**
     * Gets whether bot has a permission
     *
     * @param guild
     * @param perm - The permissions to check
     */
    public static hasPerm(guild: Guild | null, perm: PermissionResolvable): boolean {
        if (guild === null || !guild.members.me) return false;
        return guild.members.me.permissions.has(perm);
    }
}
