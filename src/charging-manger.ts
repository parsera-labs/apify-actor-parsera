import { Actor, log, type ActorRun, type Dataset } from 'apify';
import type { Dataset as DatasetInfo } from 'apify-client';
// eslint-disable-next-line import/no-extraneous-dependencies
import { got, type HTTPError } from 'got-scraping';

// TODO: Parse possible error issues
const chargeRequest = async <ChargeEventId extends string>(event: ChargeEventId, count: number): Promise<void> => {
    const url = `${Actor.config.get('apiBaseUrl')}v2/actor-runs/${Actor.config.get('actorRunId')}/charge?token=${Actor.config.get('token')}`;
    const now = Date.now();
    await got.post(url, {
        retry: {
            limit: 5,
        },
        json: {
            eventName: event,
            count,
        },
        headers: {
            'idempotency-key': `${process.env.ACTOR_RUN_ID}-${event}-${now}`,
        },
    }).catch((err: HTTPError) => {
        log.error('The charging request failed with the following message', { message: err.message });
    });
};

/**
 * We get this from API under `pricingInfo` key when querying run info, if run is PPE
 */
interface ApifyApiPricingInfo<ChargeEventId extends string> {
    pricingModel: 'PAY_PER_EVENT',
    pricingPerEvent: {
        actorChargeEvents: Record<ChargeEventId, {
            eventTitle: string,
            eventDescription: string,
            eventPriceUsd: number,
        }>
    },
}

/**
 * Alongside `pricingInfo` (`PricingInfoPPE`), run info from API will contain this under `chargedEventCounts` key, if run is PPE
 */
type ApifyApiChargedEventCounts<ChargeEventId extends string> = Record<ChargeEventId, number>;

export interface ActorRunCorrectType<ChargeEventId extends string> extends ActorRun {
    pricingInfo?: ApifyApiPricingInfo<ChargeEventId>,
    chargedEventCounts?: ApifyApiChargedEventCounts<ChargeEventId>,
    options: ActorRun['options'] & {
        maxTotalChargeUsd?: number,
    }
}

type ChargeState<ChargeEventId extends string> = Record<ChargeEventId, { chargeCount: number, eventPriceUsd: number, eventTitle: string }>;

interface ChargeResult {
    chargedCount: number,
    eventChargeLimitReached: boolean,
    outcome: 'event_not_registered' | 'charge_limit_reached' | 'charge_successful',
}

/**
 * Handles everything related to PPE (Price Per Event)
 */
export class ChargingManager<ChargeEventId extends string> {
    /**
     * Can be infinity if not specified by the user
     */
    readonly maxTotalChargeUsd: number = Infinity;
    /**
     * If PPE is on, contains info on how much each event costs and how many times it was charged for;
     * Will only contain events relevant to the current miniactor
     * This is loaded from run endpoint at start and then incremented in memory
     */
    private chargeState: ChargeState<ChargeEventId>;
    private readonly metadataDataset: Dataset;

    // For Static methods
    private static _instance: ChargingManager<string> | undefined;
    // For Static methods
    private static isBeingInitialized = false;
    private constructor(initialChargeState: ChargeState<ChargeEventId>, metadataDataset: Dataset, maxTotalChargeUsd?: number) {
        this.chargeState = initialChargeState;
        this.metadataDataset = metadataDataset;
        if (maxTotalChargeUsd) {
            this.maxTotalChargeUsd = maxTotalChargeUsd;
        }
    }

    /**
     * Queries the API to figure out the number of results pushed so far and PPE info
     * (especially useful in case of a migration or an abortion); for the global number of results,
     * also sets up persisting at the KVStore
     */
    public static async initialize<ChargeEventId extends string>(): Promise<ChargingManager<ChargeEventId>> {
        // To test locally, set ACTOR_RUN_ID=<platform run with PPE enabled>
        const runInfo = await Actor.apifyClient.run(Actor.getEnv().actorRunId!).get() as ActorRunCorrectType<ChargeEventId>;

        const chargeState = {} as ChargeState<ChargeEventId>;

        if (runInfo.chargedEventCounts && runInfo.pricingInfo?.pricingPerEvent?.actorChargeEvents) {
            for (const eventId of Object.keys(runInfo.pricingInfo.pricingPerEvent.actorChargeEvents)) {
                chargeState[eventId as ChargeEventId] = {
                    chargeCount: runInfo.chargedEventCounts[eventId as ChargeEventId] ?? 0,
                    eventPriceUsd: runInfo.pricingInfo.pricingPerEvent.actorChargeEvents[eventId as ChargeEventId].eventPriceUsd,
                    eventTitle: runInfo.pricingInfo.pricingPerEvent.actorChargeEvents[eventId as ChargeEventId].eventTitle,
                };
            }
        }

        log.debug('CHARGING_MANAGER] Initialized with maxTotalChargeUsd and charge state:', chargeState);

        // We use unnamed dataset so it is deleted with data retention. Because of that, we have to persist its ID
        let metadataDatasetInfo = await Actor.getValue('METADATA_DATASET_INFO') as DatasetInfo | null;

        if (!metadataDatasetInfo) {
            metadataDatasetInfo = await Actor.apifyClient.datasets().getOrCreate();
            await Actor.setValue('METADATA_DATASET_INFO', metadataDatasetInfo);
        }
        const metadataDataset = await Actor.openDataset(metadataDatasetInfo.id);

        return new ChargingManager<ChargeEventId>(chargeState, metadataDataset, runInfo.options.maxTotalChargeUsd);
    }

    /**
     * How much more money PPE events can charge before reaching the max cost per run
     */
    public remainingChargeBudgetUsd(): number {
        // Infinity stays at infinity
        let remainingBudgetUsd = this.maxTotalChargeUsd;
        for (const eventId of Object.keys(this.chargeState)) {
            remainingBudgetUsd -= this.chargeState[eventId as ChargeEventId].chargeCount * this.chargeState[eventId as ChargeEventId].eventPriceUsd;
        }
        // Keeping float precision issues at bay
        return Number(remainingBudgetUsd.toFixed(6));
    }

    /**
     * How many events of a given type can still be charged for before reaching the limit;
     * If the event is not registered, returns Infinity (free of charge)
     */
    public eventChargeCountTillLimit(event: ChargeEventId): number {
        if (!this.chargeState[event]) {
            return Infinity;
        }
        // First round as Math.floor(4.9999999999999999) will incorrectly return 5
        return Math.floor(Number((this.remainingChargeBudgetUsd() / (this.chargeState[event].eventPriceUsd)).toFixed(4)));
    }

    /**
     * Will charge for the specified event within PPE model (no-op if not PPE or no such event is present in this miniactor).
     * Unregistered events are 'free of charge' (eventChargeLimitReached: false)
     * metadata length represent count of events to charge for (add empty objects at minimum)
     */
    public async charge(event: ChargeEventId, metadata: Record<string, unknown>[]): Promise<ChargeResult> {
        if (!this.chargeState[event]) {
            return { chargedCount: 0, outcome: 'event_not_registered', eventChargeLimitReached: false };
        }

        const remainingEventChargeCount = this.eventChargeCountTillLimit(event);
        if (remainingEventChargeCount <= 0) {
            return { chargedCount: 0, outcome: 'charge_limit_reached', eventChargeLimitReached: true };
        }

        const chargeableCount = Math.min(metadata.length, remainingEventChargeCount);
        // Locally, we just skip this but do everything else as test
        if (Actor.isAtHome()) {
            await chargeRequest<ChargeEventId>(event, chargeableCount);
        }

        this.chargeState[event].chargeCount += chargeableCount;

        const eventMetadataItems = [];
        for (let i = 0; i < chargeableCount; i++) {
            eventMetadataItems.push({
                eventId: event,
                eventTitle: this.chargeState[event].eventTitle,
                eventPriceUsd: this.chargeState[event].eventPriceUsd,
                timestamp: new Date().toISOString(),
                metadata: metadata[i],
            });
        }
        await this.metadataDataset.pushData(eventMetadataItems);

        const remainingEventChargeCountAfterCharge = this.eventChargeCountTillLimit(event);

        const chargeResult: ChargeResult = {
            chargedCount: chargeableCount,
            outcome: 'charge_successful',
            eventChargeLimitReached: remainingEventChargeCountAfterCharge <= 0,
        };

        log.debug(`[CHARGING_MANAGER] Charged for ${chargeableCount} ${event} events, remaining events: ${remainingEventChargeCountAfterCharge} `
            + `remaining cost: ${this.remainingChargeBudgetUsd()}, charge result:`, chargeResult);

        return chargeResult;
    }

    public chargedEventCount(eventId: ChargeEventId): number {
        return this.chargeState[eventId].chargeCount;
    }

    /**
     * If multiple methods initialize, only one does, others wait for the instance
     */
    static async getDefaultInitializedInstance<ChargeEventId extends string>(): Promise<ChargingManager<ChargeEventId>> {
        if (!this._instance && !this.isBeingInitialized) {
            this.isBeingInitialized = true;
            this._instance = await this.initialize<ChargeEventId>();
            this.isBeingInitialized = false;
        }

        while (!this._instance) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        return this._instance;
    }

    // Below are all methods converted to static
    // They have to be async so we can dynamically initialize on the first use of any method
    // Not sure if this is better or worse than forcing to call .init() first
    static async remainingChargeBudgetUsd<ChargeEventId extends string>(): Promise<number> {
        const chargingManager = await this.getDefaultInitializedInstance<ChargeEventId>();
        return chargingManager.remainingChargeBudgetUsd();
    }

    static async eventChargeCountTillLimit<ChargeEventId extends string>(event: ChargeEventId): Promise<number> {
        const chargingManager = await this.getDefaultInitializedInstance<ChargeEventId>();
        return chargingManager.eventChargeCountTillLimit(event);
    }

    static async charge<ChargeEventId extends string>(event: ChargeEventId, metadata: Record<string, unknown>[]): Promise<ChargeResult> {
        const chargingManager = await this.getDefaultInitializedInstance<ChargeEventId>();
        return chargingManager.charge(event, metadata);
    }

    static async chargedEventCount<ChargeEventId extends string>(eventId: ChargeEventId): Promise<number> {
        const chargingManager = await this.getDefaultInitializedInstance<ChargeEventId>();
        return chargingManager.chargedEventCount(eventId);
    }

    static async getMaxTotalChargeUsd(): Promise<number> {
        const chargingManager = await this.getDefaultInitializedInstance<string>();
        return chargingManager.maxTotalChargeUsd ?? Infinity;
    }
}
