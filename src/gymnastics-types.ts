import { Id, Result } from "./custom-model";
import { ParticipantSlot } from "./types";

/**
 * A gymnastics meet with 4 teams competing.
 */
export type GymnasticsMeet = [
    ParticipantSlot,
    ParticipantSlot,
    ParticipantSlot,
    ParticipantSlot
];

/**
 * The results of a participant in a gymnastics meet.
 */
export interface GymnasticsParticipantResult {
    /** If `null`, the participant is to be determined. */
    id: Id | null;
    /** Indicates where the participant comes from. */
    position?: number;
    /** If this participant forfeits, they are eliminated. */
    forfeit?: boolean;
    /** The current score of the participant. */
    score?: number;
    /** Tells what is the result of the meet for this participant. */
    result?: Result;
    /** The rank of the participant in the meet (1-4). */
    rank?: number;
}

/**
 * A gymnastics match with 4 teams.
 */
export interface GymnasticsMatchResults {
    /** Status of the match. */
    status: number;
    /** First team in the meet. */
    team1: GymnasticsParticipantResult | null;
    /** Second team in the meet. */
    team2: GymnasticsParticipantResult | null;
    /** Third team in the meet. */
    team3: GymnasticsParticipantResult | null;
    /** Fourth team in the meet. */
    team4: GymnasticsParticipantResult | null;
}

/**
 * Contains the advancing teams and eliminated teams from a gymnastics meet.
 */
export interface GymnasticsMeetResults {
    /**
     * The list of teams that advance (top 2 from each meet).
     */
    advancing: ParticipantSlot[];

    /**
     * The list of teams that are eliminated (bottom 2 from each meet).
     */
    eliminated: ParticipantSlot[];
}
