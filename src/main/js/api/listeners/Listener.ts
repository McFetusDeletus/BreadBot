import {Events, Interaction, Message} from 'discord.js';

/**
 * {@link Listener Listener.ts}
 *
 * An interface used to create new listeners.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export interface Listener {
    eventName: Events;
    execute(...args: Interaction[] | Message[]): Promise<void>;
}
