/**
 * {@link Queue Queue.ts}
 *
 * Handles the queue that sensitive parts of code
 * must go through to ensure no overwriting
 * occurs.
 *
 * @copyright WeslayCodes & Contributors 2023
 */
export class Queue {
    // [1-10] are queues for users based on last digit of ID
    // [0] is a queue for global changes
    private static queues = [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}] as Record<string, () => void>[];
    private static queueRunning = [false, false, false, false, false, false, false, false, false, false];

    /**
     * Adds a function to a queue based on its ID number.
     * Used to prevent premature writing/reading
     *
     * @param func - Function to add to queue
     * @param id - ID of queue item
     */
    public static async addQueue(func: () => void, id: string): Promise<unknown> {
        const queueIndex = id.endsWith('global') ? 0 : parseInt(id[id.length-1]) + 1;
        Queue.queues[queueIndex][id] = func;

        if (!Queue.queueRunning[queueIndex]) {
            Queue.queueRunning[queueIndex] = true;
            Queue.runQueue(queueIndex);
        }

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                reject('Took too long to run queue item. ID: ' + id);
            }, 180000);

            const processInterval = setInterval(() => {
                if (!Queue.queues[queueIndex][id]) {
                    clearInterval(processInterval);
                    resolve('Queue item successfully processed.');
                }
            }, 100);
        })
    }

    /**
     * Runs the queue while there are items in it
     *
     * @param queueIndex - Which of all the queues to run
     * @private
     */
    private static async runQueue(queueIndex: number): Promise<void> {
        if (Object.keys(Queue.queues[queueIndex]).length === 0) {
            Queue.queueRunning[queueIndex] = false
        }

        if (Object.keys(Queue.queues[queueIndex]).length > 0) {
            Queue.queueRunning[queueIndex] = true;

            await Queue.queues[queueIndex][Object.keys(Queue.queues[queueIndex])[0]]();
            delete Queue.queues[queueIndex][Object.keys(Queue.queues[queueIndex])[0]];

            Queue.runQueue(queueIndex);
        }
    }
}
