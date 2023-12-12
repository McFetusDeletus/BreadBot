import fs from 'fs';
import {
	Client, ClientUser, ColorResolvable, EmbedBuilder,
	Events,
	GatewayIntentBits, Options,
	Partials, TextChannel
} from 'discord.js';
import {Bot} from '../api/bot/Bot';
import {FormatStrings} from '../util/discord/FormatStrings';
import {ConfigHandler} from './handlers/ConfigHandler';
import {CommandHandler} from './handlers/CommandHandler';
import {EventHandler} from './handlers/EventHandler';
import {BotConfig} from './config/BotConfig';
import {Command} from '../api/commands/Command';
import {Subcommand} from '../api/commands/Subcommand';
import {LogDebug} from '../util/logging/LogDebug';
import {PowerupEvent} from '../feat/PowerupEvent';
import {Queue} from '../util/interactions/Queue';
import {DataHandlers} from '../util/data/DataHandlers';
import {CronJob} from 'cron';
import {BoarUser} from '../util/boar/BoarUser';
import axios from 'axios';
import {InteractionUtils} from '../util/interactions/InteractionUtils';
import crypto from 'crypto';
import {BoarUtils} from '../util/boar/BoarUtils';
import {ItemsData} from './data/global/ItemsData';
import {GitHubData} from './data/global/GitHubData';
import {GuildData} from './data/global/GuildData';

/**
 * {@link BoarBot BoarBot.ts}
 *
 * Creates a {@link Bot bot}, logs it in, then finds where
 * all event and command handlers are. Loads
 * other configurations as well.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class BoarBot implements Bot {
	private client = new Client({ intents:[] });
	private startTime = Date.now();
	private configHandler = new ConfigHandler();
	private commandHandler = new CommandHandler();
	private eventHandler = new EventHandler();

	/**
	 * Creates the bot by loading and registering global information
	 */
	public async create(): Promise<void> {
		this.buildClient();

		await this.loadConfig(true);
		this.registerCommands();
		this.registerListeners();
		this.fixGuildData();

		await this.login();
		await this.updateAllData();
		await this.onStart();
	}

	/**
	 * Builds the {@link Client} object with chosen options
	 */
	public buildClient(): void {
		this.client = new Client({
			partials: [
				Partials.Channel // For notifications
			],
			intents: [
				GatewayIntentBits.Guilds, // Enables bot to work in guilds
				GatewayIntentBits.DirectMessages // Allows users to toggle notifications off
			],
			sweepers: {
				...Options.DefaultSweeperSettings,
				messages: {
					interval: 10800,
					lifetime: 1800
				}
			}
		});
	}

	/**
	 * Returns the client object associated with the bot
	 */
	public getClient(): Client {
		return this.client;
	}

	/**
	 * Returns when the bot came online
	 */
	public getStartTime(): number {
		return this.startTime;
	}

	/**
	 * Finds config file and pulls it into the code
	 *
	 * @param firstLoad - Whether the config is being loaded for the first time
	 */
	public async loadConfig(firstLoad = false): Promise<void> {
		await this.configHandler.loadConfig(firstLoad);
	}

	/**
	 * Returns config information that was gathered from config file
	 */
	public getConfig(): BotConfig {
		return this.configHandler.getConfig();
	}

	/**
	 * Returns the SHA256 hash value of the config file
	 */
	public getConfigHash(): string {
		const configFile = fs.readFileSync('config.json');
		const hashSum = crypto.createHash('sha256');

		hashSum.update(configFile);

		return hashSum.digest('hex');
	}

	/**
	 * Registers command and subcommand information from files
	 */
	public registerCommands(): void {
		this.commandHandler.registerCommands();
	}

	/**
	 * Deploys both application and guild commands
	 */
	public async deployCommands(): Promise<void> {
		await this.commandHandler.deployCommands();
	}

	/**
	 * Returns command information like name, execute function, and more
	 */
	public getCommands(): Map<string, Command> {
		return this.commandHandler.getCommands();
	}

	/**
	 * Returns subcommand information like name and execute function
	 */
	public getSubcommands(): Map<string, Subcommand> {
		return this.commandHandler.getSubcommands();
	}

	/**
	 * Registers event listeners from files
	 */
	public registerListeners(): void {
		this.eventHandler.registerListeners();
	}

	/**
	 * Logs the bot in using token in env file
	 */
	public async login(): Promise<void> {
		try {
			LogDebug.log('Logging in...', this.getConfig());
			await this.client.login(process.env.TOKEN);
		} catch {
			await LogDebug.handleError('Client wasn\'t initialized or you used an invalid token!');
			process.exit(-1);
		}
	}

	/**
	 * Performs actions/functions needed on start
	 */
	public async onStart(): Promise<void> {
		try {
			LogDebug.log('Successfully logged in! Bot online!', this.getConfig());

			this.startNotificationCron();
			this.startQuestRefreshCron();
			this.startPowCron();
			this.startSpookCrons();
			this.startGlobalInterval();

			(this.client.user as ClientUser).setPresence({
				activities: [{
					name: "Info",
					state: "/boar help | boarbot.dev",
					type: 4
				}]
			});

			LogDebug.log('All functions online!', this.getConfig(), undefined, true);

			this.fetchAllUsers();
		} catch (err: unknown) {
			await LogDebug.handleError(err);
		}
	}

	/**
	 * Starts CronJob that sends notifications for /boar daily at 0:00 UTC
	 * @private
	 */
	private startNotificationCron(): void {
		new CronJob('0 0 * * *', async () => {
			const userDataFolder = this.getConfig().pathConfig.databaseFolder +
				this.getConfig().pathConfig.userDataFolder;

			fs.readdirSync(userDataFolder).forEach(async userFile => {
				const user = this.getClient().users.cache.get(userFile.split('.')[0]);

				if (!user) return;

				const boarUser = new BoarUser(user);

				if (boarUser.stats.general.notificationsOn) {
					const msgStrs = this.getConfig().stringConfig.notificationExtras;
					const dailyReadyStr = this.getConfig().stringConfig.notificationDailyReady;
					const stopStr = this.getConfig().stringConfig.notificationStopStr;

					const randMsgIndex = Math.floor(Math.random() * msgStrs.length);
					let randMsgStr = msgStrs[randMsgIndex];

					if (randMsgStr !== '') {
						randMsgStr = '## ' + randMsgStr + '\n';
					}

					const userDataFolder = this.getConfig().pathConfig.databaseFolder +
						this.getConfig().pathConfig.userDataFolder;
					const guildDataFolder = this.getConfig().pathConfig.databaseFolder +
						this.getConfig().pathConfig.guildDataFolder;

					switch (randMsgIndex) {
						case 5: {
							randMsgStr = randMsgStr.replace(
								'%@', Object.keys(this.getConfig().itemConfigs.boars).length.toLocaleString()
							);
							break;
						}

						case 7: {
							randMsgStr = randMsgStr.replace(
								'%@', fs.readdirSync(userDataFolder).length.toLocaleString()
							);
							break;
						}

						case 16: {
							randMsgStr = randMsgStr.replace(
								'%@', fs.readdirSync(guildDataFolder).length.toLocaleString()
							);
							break;
						}

						case 17: {
							randMsgStr = randMsgStr.replace('%@', boarUser.stats.general.boarStreak.toLocaleString());
							break;
						}

						case 20: {
							randMsgStr = msgStrs[0];
							break;
						}
					}

					const curDate = new Date();
					if (curDate.getMonth() === 9 && curDate.getDate() >= 24) {
						randMsgStr = '## ' + msgStrs[20] + '\n';
					}

					const notificationChannelID = boarUser.stats.general.notificationChannel
						? boarUser.stats.general.notificationChannel
						: this.getConfig().defaultChannel;

					try {
						await user.send(
							randMsgStr + dailyReadyStr + '\n# ' +
							FormatStrings.toBasicChannel(notificationChannelID) + stopStr
						);
					} catch (err: unknown) {
						LogDebug.handleError(err);
					}
				}
			});

			try {
				const pingChannel = await this.client.channels.fetch(this.getConfig().defaultChannel) as TextChannel;
				pingChannel.send(
					this.getConfig().stringConfig.notificationDailyReady + ' ' +
					this.getConfig().stringConfig.notificationServerPing
				);
			} catch (err: unknown) {
				LogDebug.handleError(err);
			}
		}, null, true, 'UTC');
	}

	/**
	 * Starts CronJob that sends spook messages for boar-o-ween
	 *
	 * @private
	 */
	private async startSpookCrons() {
		let spookChannel: TextChannel;

		try {
			spookChannel = await this.client.channels.fetch(this.getConfig().spookChannel) as TextChannel;
		} catch {
			LogDebug.log(
				'Invalid spook channel ID! Spook messages will not be sent for this bot instance.', this.getConfig()
			);
			return;
		}

		const spookMessages = this.getConfig().stringConfig.spookMessages;

		new CronJob('30 21 31 9 *', async () => {
			await spookChannel.send(spookMessages[0]);
		}, null, true, 'UTC');

		new CronJob('30 22 31 9 *', async () => {
			await spookChannel.send(spookMessages[1]);
		}, null, true, 'UTC');

		new CronJob('30 23 31 9 *', async () => {
			await spookChannel.send(spookMessages[2]);
		}, null, true, 'UTC');

		new CronJob('30 0 1 10 *', async () => {
			await spookChannel.send(spookMessages[3]);
		}, null, true, 'UTC');

		new CronJob('30 1 1 10 *', async () => {
			await spookChannel.send(spookMessages[4]);
		}, null, true, 'UTC');
	}

	/**
	 * Starts CronJob that automatically spawns Powerup Events
	 *
	 * @private
	 */
	private startPowCron() {
		const startMin = 30 - this.getConfig().numberConfig.powPlusMinusMins;
		const hourInterval = this.getConfig().numberConfig.powIntervalHours;

		new CronJob(`${startMin} */${hourInterval} * * *`, async () => {
			const delay = Math.floor(Math.random() * this.getConfig().numberConfig.powPlusMinusMins * 2 * 60000);

			await LogDebug.sleep(delay);

			new PowerupEvent();
		}, null, true);
	}

	/**
	 * Starts CronJob that refreshes weekly quests at 23:59 on Saturday UTC
	 *
	 * @private
	 */
	private startQuestRefreshCron() {
		new CronJob('59 23 * * 6', async () => {
			DataHandlers.updateQuestData(this.getConfig());
		}, null, true, 'UTC');
	}

	/**
	 * Starts interval that's called every two minutes for general purpose tasks such
	 * as refreshing the config file, sending update information, and removing wiped user data
	 *
	 * @private
	 */
	private startGlobalInterval(): void {
		let configHash = this.getConfigHash();

		setInterval(async () => {
			if (configHash !== this.getConfigHash()) {
				configHash = this.getConfigHash();
				await this.loadConfig();
			}

			const config = this.getConfig();

			LogDebug.log('Interaction Listeners: ' + this.client.listenerCount(Events.InteractionCreate), config);
			LogDebug.log(process.memoryUsage(), config);

			await this.sendUpdateInfo(await DataHandlers.getGithubData());
			this.removeWipeUsers();
		}, 120000);
	}

	/**
	 * Attempts to send GitHub update information to the updates channel
	 *
	 * @param githubData - The data including the last update PR URL
	 * @private
	 */
	private async sendUpdateInfo(githubData?: GitHubData): Promise<void> {
		const config = this.getConfig();

		try {
			if (!githubData) return;

			const pullReq = await axios.get(
				config.stringConfig.pullLink,
				{ headers: { Authorization: 'Token ' + process.env.GITHUB_TOKEN as string }}
			);

			const pullReqData = pullReq.data[0];

			if (pullReqData && pullReqData.html_url !== githubData.lastURL && pullReqData.merged_at !== null) {
				githubData.lastURL = pullReqData.html_url;

				fs.writeFileSync(
					config.pathConfig.databaseFolder + config.pathConfig.globalDataFolder +
					config.pathConfig.githubFileName,
					JSON.stringify(githubData)
				);

				const commitMsg = pullReqData.body;
				const commitName = pullReqData.title;
				const commitChannel = await InteractionUtils.getTextChannel(config.updatesChannel);
				const commitEmbed = new EmbedBuilder()
					.setColor(config.colorConfig.dark as ColorResolvable)
					.setTitle(commitName)
					.setURL(pullReqData.html_url)
					.setDescription(commitMsg.replace(commitName, '').substring(0, 500) + '...')
					.setThumbnail(config.stringConfig.githubImg);

				commitChannel?.send({ embeds: [commitEmbed] });
			}
		} catch (err: unknown) {
			LogDebug.handleError(err, undefined, false);
		}
	}

	/**
	 * Removes wiped user data if it's been 24 hours since they requested to be wiped
	 *
	 * @private
	 */
	private async removeWipeUsers(): Promise<void> {
		await Queue.addQueue(async () => {
			try {
				const wipeUsers = DataHandlers.getGlobalData(
					DataHandlers.GlobalFile.WipeUsers
				) as Record<string, number>;
				const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items) as ItemsData;
				const userDataFolder = this.getConfig().pathConfig.databaseFolder +
					this.getConfig().pathConfig.userDataFolder;

				for (const userID of Object.keys(wipeUsers)) {
					if (wipeUsers[userID] < Date.now()) {
						try {
							await DataHandlers.removeLeaderboardUser(userID);
							fs.rmSync(userDataFolder + userID + '.json');
						} catch (err: unknown) {
							LogDebug.handleError(err);
						}

						for (const itemTypeID of Object.keys(itemsData)) {
							for (const itemID of Object.keys(itemsData[itemTypeID])) {
								const itemData = itemsData[itemTypeID][itemID];

								for (let i=0; i<itemData.buyers.length; i++) {
									const buyOrder = itemData.buyers[i];

									if (buyOrder.userID === userID) {
										itemsData[itemTypeID][itemID].buyers.splice(i, 1);
									}
								}

								for (let i=0; i<itemData.sellers.length; i++) {
									const sellOrder = itemData.sellers[i];

									if (sellOrder.userID === userID) {
										itemsData[itemTypeID][itemID].sellers.splice(i, 1);
									}
								}
							}
						}

						delete wipeUsers[userID];

						DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);
						DataHandlers.saveGlobalData(wipeUsers, DataHandlers.GlobalFile.WipeUsers);
					}
				}
			} catch (err: unknown) {
				LogDebug.handleError(err);
			}
		}, 'wipe_user_global');
	}

	/**
	 * Fetches all user data from IDs to allow notifications to be sent
	 *
	 * @private
	 */
	private async fetchAllUsers(): Promise<void> {
		const userDataFolder = this.getConfig().pathConfig.databaseFolder +
			this.getConfig().pathConfig.userDataFolder;

		if (!fs.existsSync(userDataFolder)) {
			fs.mkdirSync(userDataFolder);
		}

		for (const userFile of fs.readdirSync(userDataFolder)) {
			try {
				this.getClient().users.fetch(userFile.split('.')[0]);
				await LogDebug.sleep(1000); // Cooldown to prevent hitting rate limit at bot start
			} catch {
				LogDebug.handleError('Failed to find user ' + userFile.split('.')[0]);
			}
		}
	}

	/**
	 * Updates global data files to the state they should be in for the
	 * current version
	 *
	 * @private
	 */
	private async updateAllData(): Promise<void> {
		const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items, true) as ItemsData;

		BoarUtils.orderGlobalBoars(itemsData, this.getConfig());
		DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);

		DataHandlers.getGlobalData(DataHandlers.GlobalFile.Leaderboards, true);
		DataHandlers.getGlobalData(DataHandlers.GlobalFile.BannedUsers, true);
		DataHandlers.getGlobalData(DataHandlers.GlobalFile.Powerups, true);
		DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest, true);
	}

	/**
	 * Deletes empty guild files (Guild was in the process of setting bot up)
	 *
	 * @private
	 */
	private fixGuildData(): void {
		const pathConfig = this.getConfig().pathConfig;

		const databaseFolder = pathConfig.databaseFolder;
		const guildDataFolder = databaseFolder + pathConfig.guildDataFolder;
		let guildDataFiles: string[];

		try {
			if (!fs.existsSync(databaseFolder)) {
				fs.mkdirSync(databaseFolder);
			}

			if (!fs.existsSync(guildDataFolder)) {
				fs.mkdirSync(guildDataFolder);
			}

			guildDataFiles = fs.readdirSync(guildDataFolder);
		} catch (err: unknown) {
			LogDebug.handleError(err);
			process.exit(-1);
		}

		for (const guildFile of guildDataFiles) {
			const guildData = JSON.parse(fs.readFileSync(guildDataFolder + guildFile, 'utf-8')) as GuildData;
			if (guildData.fullySetup) continue;

			fs.rmSync(guildDataFolder + guildFile);

			LogDebug.log('Deleted unfinished guild file: ' + guildFile, this.getConfig());
		}

		LogDebug.log('Guild data fixed!', this.getConfig())
	}
}
