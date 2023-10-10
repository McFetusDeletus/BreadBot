import {Events, Message} from 'discord.js';
import {Listener} from '../api/listeners/Listener';
import {BoarBotApp} from '../BoarBotApp';
import {LogDebug} from '../util/logging/LogDebug';
import {Queue} from '../util/interactions/Queue';
import {BoarUser} from '../util/boar/BoarUser';

/**
 * {@link MessageListener MessageListener.ts}
 *
 * An event that runs when someone sends a
 * message that the bot can read.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export default class MessageListener implements Listener {
	public readonly eventName: Events = Events.MessageCreate;

	/**
	 * Handles message send to the bot (Only DM Reports)
	 *
	 * @param message - The message to reply to and log
	 */
	public async execute(message: Message): Promise<void> {
		const config = BoarBotApp.getBot().getConfig();

		const ignoreMsg = config.maintenanceMode || !message.channel.isDMBased() ||
			message.author.id === message.client.user.id;

		if (ignoreMsg) return;

		if (message.content.trim().toLowerCase() === 'stop') {
			await Queue.addQueue(async () => {
				try {
					const boarUser = new BoarUser(message.author);

					const notificationsOff = boarUser.stats.general.notificationsOn !== undefined &&
						!boarUser.stats.general.notificationsOn;

					if (notificationsOff) return;

					boarUser.stats.general.notificationsOn = false;
					boarUser.updateUserData();

					LogDebug.log(
						`${message.author.username} (${message.author.id}) turned OFF notifications`,
						config,
						undefined,
						true
					);

					await message.reply('Successfully turned off notifications!');
				} catch (err: unknown) {
					await LogDebug.handleError(err);
				}
			}, 'msg_notify' + message.id + message.author.id).catch((err: unknown) => {
				LogDebug.handleError(err);
			});
		}
	}
}
