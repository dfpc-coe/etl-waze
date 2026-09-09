import type { Static, TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { Event } from '@tak-ps/etl';
import ETL, { SchemaType, handler as internal, local, fetch, Feature, DataFlowType, InvocationType } from '@tak-ps/etl';

const InputSchema = Type.Object({
    'WAZE_PARTNER_ID': Type.String({
        description: 'Waze for Cities Partner ID - the numeric ID in the feed URL after /partners/'
    }),
    'WAZE_TOKEN': Type.String({
        description: 'Waze Feed Token - the UUID in the feed URL after /waze-feeds/'
    }),
    'WAZE_API_URL': Type.String({
        default: 'https://www.waze.com/partnerhub-api',
        description: 'Waze Partner Hub API Base URL'
    }),
    'WAZE_TYPE': Type.String({
        default: 'alerts',
        enum: ['alerts', 'jams', 'irregularities'],
        description: 'Which feed collection to ingest - alerts (user reports as Points), jams (traffic jams as Lines) or irregularities (unusual traffic as Lines)'
    }),
    'Minimum Reliability': Type.Integer({
        default: 0,
        minimum: 0,
        maximum: 10,
        description: 'Alerts only - drop Alerts with a reliability score below this value (0-10)'
    }),
    'DEBUG': Type.Boolean({
        default: false,
        description: 'Print results in logs'
    })
});

const AlertOutput = Type.Object({
    type: Type.String({ description: 'Alert type - ACCIDENT, HAZARD, JAM, ROAD_CLOSED, WEATHERHAZARD' }),
    subtype: Type.Optional(Type.String({ description: 'Alert subtype' })),
    description: Type.Optional(Type.String({ description: 'User supplied report description' })),
    street: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    road_type: Type.Optional(Type.Integer({ description: 'Waze road type code' })),
    published: Type.String({ description: 'ISO8601 time the report was published' }),
    reliability: Type.Optional(Type.Integer({ description: 'Reliability score (0-10)' })),
    confidence: Type.Optional(Type.Integer({ description: 'Confidence score (0-10)' })),
    report_rating: Type.Optional(Type.Integer({ description: 'Rating of the reporting user (0-6)' })),
    thumbs_up: Type.Optional(Type.Integer({ description: 'Number of thumbs up from other users' })),
    municipality_report: Type.Optional(Type.Boolean({ description: 'Reported by a municipality user' })),
    magvar: Type.Optional(Type.Integer({ description: 'Direction of travel of the reporter in degrees' }))
});

const JamOutput = Type.Object({
    street: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    road_type: Type.Optional(Type.Integer({ description: 'Waze road type code' })),
    published: Type.String({ description: 'ISO8601 time the jam was detected' }),
    level: Type.Integer({ description: 'Jam level - 0 free flow to 5 blocked' }),
    speed_kmh: Type.Optional(Type.Number({ description: 'Current average speed in km/h' })),
    length_m: Type.Optional(Type.Integer({ description: 'Length of the jam in meters' })),
    delay_s: Type.Optional(Type.Integer({ description: 'Delay in seconds compared to free flow (-1 = blocked)' })),
    start_node: Type.Optional(Type.String()),
    end_node: Type.Optional(Type.String()),
    blocking_alert: Type.Optional(Type.String({ description: 'UUID of the alert blocking the jam' }))
});

const IrregularityOutput = Type.Object({
    type: Type.Optional(Type.String({ description: 'Irregularity size - SMALL, MEDIUM, LARGE, HUGE' })),
    street: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    published: Type.String({ description: 'ISO8601 time the irregularity was detected' }),
    updated: Type.Optional(Type.String({ description: 'ISO8601 time the irregularity was last updated' })),
    level: Type.Integer({ description: 'Jam level - 0 free flow to 5 blocked' }),
    severity: Type.Optional(Type.Number({ description: 'Severity (0-5)' })),
    speed_kmh: Type.Optional(Type.Number({ description: 'Current average speed in km/h' })),
    regular_speed_kmh: Type.Optional(Type.Number({ description: 'Historic average speed in km/h' })),
    length_m: Type.Optional(Type.Integer({ description: 'Length in meters' })),
    delay_s: Type.Optional(Type.Integer({ description: 'Delay in seconds compared to regular speed' })),
    trend: Type.Optional(Type.Integer({ description: 'Trend - 1 improving, 0 steady, -1 worsening' })),
    drivers: Type.Optional(Type.Integer({ description: 'Number of Waze users in the irregularity' })),
    alert_count: Type.Optional(Type.Integer({ description: 'Number of alerts within the irregularity' })),
    start_node: Type.Optional(Type.String()),
    end_node: Type.Optional(Type.String()),
    highway: Type.Optional(Type.Boolean())
});

const OutputSchemas: Record<string, TSchema> = {
    alerts: AlertOutput,
    jams: JamOutput,
    irregularities: IrregularityOutput
};

const WazePoint = Type.Object({
    x: Type.Number(),
    y: Type.Number()
});

const WazeAlert = Type.Object({
    uuid: Type.String(),
    type: Type.String(),
    subtype: Type.Optional(Type.String()),
    pubMillis: Type.Number(),
    location: WazePoint,
    street: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    roadType: Type.Optional(Type.Integer()),
    reportDescription: Type.Optional(Type.String()),
    reportByMunicipalityUser: Type.Optional(Type.String()),
    reportRating: Type.Optional(Type.Integer()),
    confidence: Type.Optional(Type.Integer()),
    reliability: Type.Optional(Type.Integer()),
    nThumbsUp: Type.Optional(Type.Integer()),
    magvar: Type.Optional(Type.Integer())
}, { additionalProperties: true });

const WazeJam = Type.Object({
    uuid: Type.Union([Type.String(), Type.Number()]),
    line: Type.Array(WazePoint),
    pubMillis: Type.Number(),
    speedKMH: Type.Optional(Type.Number()),
    length: Type.Optional(Type.Integer()),
    delay: Type.Optional(Type.Integer()),
    level: Type.Optional(Type.Integer()),
    street: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    roadType: Type.Optional(Type.Integer()),
    startNode: Type.Optional(Type.String()),
    endNode: Type.Optional(Type.String()),
    blockingAlertUuid: Type.Optional(Type.String())
}, { additionalProperties: true });

const WazeIrregularity = Type.Object({
    id: Type.Union([Type.String(), Type.Number()]),
    line: Type.Array(WazePoint),
    detectionDateMillis: Type.Union([Type.String(), Type.Number()]),
    updateDateMillis: Type.Optional(Type.Union([Type.String(), Type.Number()])),
    speed: Type.Optional(Type.Number()),
    regularSpeed: Type.Optional(Type.Number()),
    delaySeconds: Type.Optional(Type.Integer()),
    length: Type.Optional(Type.Integer()),
    trend: Type.Optional(Type.Integer()),
    severity: Type.Optional(Type.Number()),
    jamLevel: Type.Optional(Type.Integer()),
    driversCount: Type.Optional(Type.Integer()),
    alertCount: Type.Optional(Type.Integer()),
    highway: Type.Optional(Type.Boolean()),
    type: Type.Optional(Type.String()),
    street: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    startNode: Type.Optional(Type.String()),
    endNode: Type.Optional(Type.String())
}, { additionalProperties: true });

const WazeFeed = Type.Object({
    alerts: Type.Optional(Type.Array(WazeAlert)),
    jams: Type.Optional(Type.Array(WazeJam)),
    irregularities: Type.Optional(Type.Array(WazeIrregularity))
}, { additionalProperties: true });

const AlertColor: Record<string, string> = {
    ACCIDENT: '#d63939',
    ROAD_CLOSED: '#1f2937',
    HAZARD: '#f59f00',
    JAM: '#ffd43b',
    WEATHERHAZARD: '#4299e1',
    POLICE: '#206bc4',
    CHIT_CHAT: '#6c7a91'
};

const JamColor: Record<number, string> = {
    0: '#74b816',
    1: '#ffd43b',
    2: '#ffa94d',
    3: '#f76707',
    4: '#d63939',
    5: '#1f2937'
};

function humanize(value: string): string {
    return value.toLowerCase().split('_')
        .filter((word) => word.length)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function where(item: { street?: string; city?: string }): string | undefined {
    return [item.street, item.city].filter((v) => v).join(', ') || undefined;
}

export default class Task extends ETL {
    static name = 'etl-waze'
    static flow = [ DataFlowType.Incoming ];
    static invocation = [ InvocationType.Schedule ];

    async schema(
        type: SchemaType = SchemaType.Input,
        flow: DataFlowType = DataFlowType.Incoming
    ): Promise<TSchema> {
        if (flow === DataFlowType.Incoming) {
            if (type === SchemaType.Input) {
                return InputSchema;
            } else {
                return OutputSchemas[await this.wazeType()];
            }
        } else {
            return Type.Object({});
        }
    }

    async wazeType(): Promise<string> {
        try {
            const env = await this.env(Type.Partial(InputSchema));
            if (env.WAZE_TYPE && OutputSchemas[env.WAZE_TYPE]) return env.WAZE_TYPE;
        } catch (err) {
            console.log(`ok - could not read layer environment, defaulting to alerts: ${err instanceof Error ? err.message : String(err)}`);
        }

        return 'alerts';
    }

    async control(): Promise<void> {
        const env = await this.env(InputSchema);

        const url = new URL(`${env.WAZE_API_URL.replace(/\/$/, '')}/partners/${encodeURIComponent(env.WAZE_PARTNER_ID)}/waze-feeds/${encodeURIComponent(env.WAZE_TOKEN)}`);
        url.searchParams.set('format', '1');

        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
            throw new Error(`Waze Feed request failed (${res.status}): ${await res.text()}`);
        }

        const feed = await res.typed(WazeFeed);

        const features: Static<typeof Feature.InputFeature>[] = [];

        if (env.WAZE_TYPE === 'jams') {
            for (const jam of feed.jams || []) {
                if (jam.line.length < 2) continue;
                features.push(this.jamFeature(jam));
            }
        } else if (env.WAZE_TYPE === 'irregularities') {
            for (const irregularity of feed.irregularities || []) {
                if (irregularity.line.length < 2) continue;
                features.push(this.irregularityFeature(irregularity));
            }
        } else {
            for (const alert of feed.alerts || []) {
                if ((alert.reliability ?? 0) < env['Minimum Reliability']) continue;
                features.push(this.alertFeature(alert));
            }
        }

        console.log(`ok - ${env.WAZE_TYPE}: ${features.length} features`);

        const fc: Static<typeof Feature.InputFeatureCollection> = {
            type: 'FeatureCollection',
            features: features
        }

        await this.submit(fc);
    }

    alertFeature(alert: Static<typeof WazeAlert>): Static<typeof Feature.InputFeature> {
        const published = new Date(alert.pubMillis).toISOString();
        const label = alert.subtype ? humanize(alert.subtype) : humanize(alert.type);
        const location = where(alert);

        const remarks = [
            label,
            alert.reportDescription,
            location,
            alert.reliability !== undefined ? `Reliability: ${alert.reliability}/10` : undefined,
            `Reported: ${published}`
        ].filter((v) => v).join('\n');

        return {
            id: `waze-alert-${alert.uuid}`,
            type: 'Feature',
            properties: {
                type: 'a-f-G',
                how: 'h-e',
                time: published,
                start: published,
                callsign: location ? `${label} - ${location}` : label,
                remarks,
                'marker-color': AlertColor[alert.type] || '#6c7a91',
                metadata: {
                    type: alert.type,
                    subtype: alert.subtype || undefined,
                    description: alert.reportDescription,
                    street: alert.street,
                    city: alert.city,
                    country: alert.country,
                    road_type: alert.roadType,
                    published,
                    reliability: alert.reliability,
                    confidence: alert.confidence,
                    report_rating: alert.reportRating,
                    thumbs_up: alert.nThumbsUp,
                    municipality_report: alert.reportByMunicipalityUser === 'true',
                    magvar: alert.magvar
                }
            },
            geometry: {
                type: 'Point',
                coordinates: [alert.location.x, alert.location.y]
            }
        };
    }

    jamFeature(jam: Static<typeof WazeJam>): Static<typeof Feature.InputFeature> {
        const published = new Date(jam.pubMillis).toISOString();
        const level = jam.level ?? 0;
        const location = where(jam);
        const route = [jam.startNode, jam.endNode].filter((v) => v).join(' to ') || undefined;

        const remarks = [
            `Traffic Jam - Level ${level}/5`,
            location,
            route,
            jam.speedKMH !== undefined ? `Speed: ${Math.round(jam.speedKMH)} km/h` : undefined,
            jam.length !== undefined ? `Length: ${jam.length} m` : undefined,
            jam.delay !== undefined ? (jam.delay < 0 ? 'Delay: Blocked' : `Delay: ${Math.round(jam.delay / 60)} min`) : undefined,
            `Detected: ${published}`
        ].filter((v) => v).join('\n');

        return {
            id: `waze-jam-${jam.uuid}`,
            type: 'Feature',
            properties: {
                type: 'u-d-f',
                how: 'm-g',
                time: published,
                start: published,
                callsign: location ? `Jam L${level} - ${location}` : `Jam L${level}`,
                remarks,
                stroke: JamColor[level] || JamColor[0],
                'stroke-width': 4,
                'stroke-opacity': 0.9,
                metadata: {
                    street: jam.street,
                    city: jam.city,
                    country: jam.country,
                    road_type: jam.roadType,
                    published,
                    level,
                    speed_kmh: jam.speedKMH,
                    length_m: jam.length,
                    delay_s: jam.delay,
                    start_node: jam.startNode,
                    end_node: jam.endNode,
                    blocking_alert: jam.blockingAlertUuid
                }
            },
            geometry: {
                type: 'LineString',
                coordinates: jam.line.map((p) => [p.x, p.y])
            }
        };
    }

    irregularityFeature(irregularity: Static<typeof WazeIrregularity>): Static<typeof Feature.InputFeature> {
        const published = new Date(Number(irregularity.detectionDateMillis)).toISOString();
        const updated = irregularity.updateDateMillis !== undefined
            ? new Date(Number(irregularity.updateDateMillis)).toISOString()
            : undefined;
        const level = irregularity.jamLevel ?? 0;
        const location = where(irregularity);
        const route = [irregularity.startNode, irregularity.endNode].filter((v) => v).join(' to ') || undefined;

        const trend = irregularity.trend === undefined ? undefined
            : irregularity.trend > 0 ? 'Improving'
            : irregularity.trend < 0 ? 'Worsening'
            : 'Steady';

        const remarks = [
            `Unusual Traffic${irregularity.type ? ` - ${humanize(irregularity.type)}` : ''}`,
            location,
            route,
            irregularity.severity !== undefined ? `Severity: ${irregularity.severity}/5` : undefined,
            irregularity.speed !== undefined ? `Speed: ${Math.round(irregularity.speed)} km/h${irregularity.regularSpeed !== undefined ? ` (normally ${Math.round(irregularity.regularSpeed)} km/h)` : ''}` : undefined,
            irregularity.length !== undefined ? `Length: ${irregularity.length} m` : undefined,
            irregularity.delaySeconds !== undefined ? `Delay: ${Math.round(irregularity.delaySeconds / 60)} min` : undefined,
            trend ? `Trend: ${trend}` : undefined,
            `Detected: ${published}`,
            updated ? `Updated: ${updated}` : undefined
        ].filter((v) => v).join('\n');

        return {
            id: `waze-irregularity-${irregularity.id}`,
            type: 'Feature',
            properties: {
                type: 'u-d-f',
                how: 'm-g',
                time: updated || published,
                start: published,
                callsign: location ? `Unusual Traffic - ${location}` : 'Unusual Traffic',
                remarks,
                stroke: JamColor[level] || JamColor[0],
                'stroke-width': 4,
                'stroke-opacity': 0.9,
                'stroke-style': 'dashed',
                metadata: {
                    type: irregularity.type,
                    street: irregularity.street,
                    city: irregularity.city,
                    country: irregularity.country,
                    published,
                    updated,
                    level,
                    severity: irregularity.severity,
                    speed_kmh: irregularity.speed,
                    regular_speed_kmh: irregularity.regularSpeed,
                    length_m: irregularity.length,
                    delay_s: irregularity.delaySeconds,
                    trend: irregularity.trend,
                    drivers: irregularity.driversCount,
                    alert_count: irregularity.alertCount,
                    start_node: irregularity.startNode,
                    end_node: irregularity.endNode,
                    highway: irregularity.highway
                }
            },
            geometry: {
                type: 'LineString',
                coordinates: irregularity.line.map((p) => [p.x, p.y])
            }
        };
    }
}

await local(await Task.init(import.meta.url), import.meta.url);
export async function handler(event: Event = {}) {
    return await internal(await Task.init(import.meta.url), event);
}
