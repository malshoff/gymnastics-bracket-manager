import {
    Group,
    Id,
    InputStage,
    Match,
    Participant,
    Round,
    Stage,
} from "../../custom-model";
import { GymnasticsMeet, GymnasticsMeetResults } from "../../gymnastics-types";
import * as helpers from "../../helpers";
import { Duel, OmitId, ParticipantSlot, Storage } from "../../types";

/**
 * Creates a gymnastics elimination stage.
 *
 * This class handles the creation of NCAA women's gymnastics tournament brackets
 * where 4 teams compete in each meet and the top 2 advance.
 */
export class GymnasticsStageCreator {
    private storage: Storage;
    private stage: InputStage;
    private updateMode: boolean;
    private enableByesInUpdate: boolean;
    private currentStageId!: Id;

    /**
     * Creates an instance of GymnasticsStageCreator.
     *
     * @param storage The implementation of Storage.
     * @param stage The stage to create.
     */
    constructor(storage: Storage, stage: InputStage) {
        this.storage = storage;
        this.stage = stage;
        this.stage.settings = this.stage.settings || {};
        this.updateMode = false;
        this.enableByesInUpdate = false;

        if (!this.stage.name)
            throw Error("You must provide a name for the stage.");

        if (this.stage.tournamentId === undefined)
            throw Error("You must provide a tournament id for the stage.");

        this.stage.settings.matchesChildCount =
            this.stage.settings.matchesChildCount || 0;
    }

    /**
     * Run the creation process for a gymnastics tournament.
     */
    public async run(): Promise<Stage> {
        const stage = await this.createGymnasticsElimination();

        if (stage.id === -1)
            throw Error("Something went wrong when creating the stage.");

        return stage;
    }

    /**
     * Enables the update mode.
     *
     * @param stageId ID of the stage.
     * @param enableByes Whether to use BYEs or TBDs for `null` values in an input seeding.
     */
    public setExisting(stageId: Id, enableByes: boolean): void {
        this.updateMode = true;
        this.currentStageId = stageId;
        this.enableByesInUpdate = enableByes;
    }

    /**
     * Creates a gymnastics elimination stage.
     *
     * This will create a tournament where 4 teams compete in each meet and the top 2 advance.
     */
    private async createGymnasticsElimination(): Promise<Stage> {
        // Ensure we have exactly 32 teams
        const slots = await this.getSlots();
        if (slots.length !== 32) {
            throw Error("Gymnastics elimination requires exactly 32 teams.");
        }

        const stage = await this.createStage();

        // Create a single group for all rounds
        const groupId = await this.insertGroup({
            stage_id: stage.id,
            number: 1,
        });

        if (groupId === -1) throw Error("Could not insert the group.");

        // Round 1: 8 meets of 4 teams each
        const round1Meets = this.createGymnasticsMeets(slots, 8);
        const round1Results = await this.createGymnasticsRound(
            stage.id,
            groupId,
            1,
            round1Meets
        );

        // Round 2: 4 meets of 4 teams each (16 teams from round 1)
        const round2Meets = this.createGymnasticsMeets(
            round1Results.advancing,
            4
        );
        const round2Results = await this.createGymnasticsRound(
            stage.id,
            groupId,
            2,
            round2Meets
        );

        // Round 3: 2 meets of 4 teams each (8 teams from round 2)
        const round3Meets = this.createGymnasticsMeets(
            round2Results.advancing,
            2
        );
        const round3Results = await this.createGymnasticsRound(
            stage.id,
            groupId,
            3,
            round3Meets
        );

        // Final round: 1 meet of 4 teams (4 teams from round 3)
        const finalMeet = this.createGymnasticsMeets(
            round3Results.advancing,
            1
        );
        await this.createGymnasticsRound(stage.id, groupId, 4, finalMeet);

        return stage;
    }

    /**
     * Creates gymnastics meets by grouping teams.
     *
     * @param teams The teams to distribute into meets.
     * @param meetCount The number of meets to create.
     */
    private createGymnasticsMeets(
        teams: ParticipantSlot[],
        meetCount: number
    ): GymnasticsMeet[] {
        const teamsPerMeet = 4;
        const meets: GymnasticsMeet[] = [];

        for (let i = 0; i < meetCount; i++) {
            const startIndex = i * teamsPerMeet;
            const meet: GymnasticsMeet = [
                teams[startIndex],
                teams[startIndex + 1],
                teams[startIndex + 2],
                teams[startIndex + 3],
            ];
            meets.push(meet);
        }

        return meets;
    }

    /**
     * Creates a round of gymnastics meets.
     *
     * @param stageId ID of the parent stage.
     * @param groupId ID of the parent group.
     * @param roundNumber Number of the round in the group.
     * @param meets The meets to create in this round.
     */
    private async createGymnasticsRound(
        stageId: Id,
        groupId: Id,
        roundNumber: number,
        meets: GymnasticsMeet[]
    ): Promise<GymnasticsMeetResults> {
        const roundId = await this.insertRound({
            number: roundNumber,
            stage_id: stageId,
            group_id: groupId,
        });

        if (roundId === -1) throw Error("Could not insert the round.");

        const advancing: ParticipantSlot[] = [];
        const eliminated: ParticipantSlot[] = [];

        for (let i = 0; i < meets.length; i++) {
            const meet = meets[i];
            await this.createGymnasticsMeet(
                stageId,
                groupId,
                roundId,
                i + 1,
                meet
            );

            // In a real implementation, we would determine advancing teams based on scores
            // For now, we'll just take the first two teams from each meet as advancing
            if (meet[0]) advancing.push(meet[0]);
            if (meet[1]) advancing.push(meet[1]);
            if (meet[2]) eliminated.push(meet[2]);
            if (meet[3]) eliminated.push(meet[3]);
        }

        return { advancing, eliminated };
    }

    /**
     * Creates a gymnastics meet with 4 teams.
     *
     * @param stageId ID of the parent stage.
     * @param groupId ID of the parent group.
     * @param roundId ID of the parent round.
     * @param meetNumber Number of the meet in the round.
     * @param teams The 4 teams in the meet.
     */
    private async createGymnasticsMeet(
        stageId: Id,
        groupId: Id,
        roundId: Id,
        meetNumber: number,
        teams: GymnasticsMeet
    ): Promise<void> {
        // For now, we'll create two separate matches to represent a gymnastics meet
        // This is a workaround since the current system only supports 2 opponents per match

        // First match: team1 vs team2
        await this.createMatch(
            stageId,
            groupId,
            roundId,
            meetNumber * 2 - 1,
            [teams[0], teams[1]],
            0
        );

        // Second match: team3 vs team4
        await this.createMatch(
            stageId,
            groupId,
            roundId,
            meetNumber * 2,
            [teams[2], teams[3]],
            0
        );
    }

    /**
     * Creates a match, possibly with match games.
     *
     * @param stageId ID of the parent stage.
     * @param groupId ID of the parent group.
     * @param roundId ID of the parent round.
     * @param matchNumber Number in the round.
     * @param opponents The two opponents matching against each other.
     * @param childCount Child count for this match (number of games).
     */
    private async createMatch(
        stageId: Id,
        groupId: Id,
        roundId: Id,
        matchNumber: number,
        opponents: Duel,
        childCount: number
    ): Promise<void> {
        const opponent1 = helpers.toResultWithPosition(opponents[0]);
        const opponent2 = helpers.toResultWithPosition(opponents[1]);

        let existing: Match | null = null;
        let status = helpers.getMatchStatus(opponents);

        if (this.updateMode) {
            existing = await this.storage.selectFirst("match", {
                round_id: roundId,
                number: matchNumber,
            });

            const currentChildCount = existing?.child_count;
            childCount =
                currentChildCount === undefined
                    ? childCount
                    : currentChildCount;

            if (existing) {
                // Keep the most advanced status when updating a match.
                const existingStatus = helpers.getMatchStatus(existing);
                if (existingStatus > status) status = existingStatus;
            }
        }

        const parentId = await this.insertMatch(
            {
                number: matchNumber,
                stage_id: stageId,
                group_id: groupId,
                round_id: roundId,
                child_count: childCount,
                status: status,
                ...helpers.getInferredResult(opponent1, opponent2),
            },
            existing
        );

        if (parentId === -1) throw Error("Could not insert the match.");

        for (let i = 0; i < childCount; i++) {
            const id = await this.insertMatchGame({
                number: i + 1,
                stage_id: stageId,
                parent_id: parentId,
                status: status,
                ...helpers.getInferredResult(
                    helpers.toResult(opponents[0]),
                    helpers.toResult(opponents[1])
                ),
            });

            if (id === -1) throw Error("Could not insert the match game.");
        }
    }

    /**
     * Returns a list of slots.
     * - If `seeding` was given, inserts them in the storage.
     * - If `size` was given, only returns a list of empty slots.
     */
    private async getSlots(): Promise<ParticipantSlot[]> {
        let seeding = this.stage.seedingIds || this.stage.seeding;
        const size = this.stage.settings?.size || seeding?.length || 0;

        if (size && !seeding)
            return Array.from({ length: size }, (_: ParticipantSlot, i) => ({
                id: null,
                position: i + 1,
            }));

        if (!seeding) throw Error("Either size or seeding must be given.");

        this.stage.settings = {
            ...this.stage.settings,
            size, // Always set the size.
        };

        helpers.ensureNoDuplicates(seeding);
        seeding = helpers.fixSeeding(seeding, size);

        if (
            this.stage.seedingIds !== undefined ||
            helpers.isSeedingWithIds(seeding)
        )
            return this.getSlotsUsingIds(seeding);

        return this.getSlotsUsingNames(seeding);
    }

    /**
     * Returns the list of slots with a seeding containing names. Participants may be added to database.
     *
     * @param seeding The seeding (names).
     */
    private async getSlotsUsingNames(
        seeding: any[]
    ): Promise<ParticipantSlot[]> {
        const participants = helpers.extractParticipantsFromSeeding(
            this.stage.tournamentId,
            seeding
        );

        if (!(await this.registerParticipants(participants)))
            throw Error("Error registering the participants.");

        // Get participants back with IDs.
        const added = await this.storage.select("participant", {
            tournament_id: this.stage.tournamentId,
        });
        if (!added) throw Error("Error getting registered participant.");

        return helpers.mapParticipantsNamesToDatabase(seeding, added);
    }

    /**
     * Returns the list of slots with a seeding containing IDs. No database mutation.
     *
     * @param seeding The seeding (IDs).
     */
    private async getSlotsUsingIds(seeding: any[]): Promise<ParticipantSlot[]> {
        const participants = await this.storage.select("participant", {
            tournament_id: this.stage.tournamentId,
        });
        if (!participants) throw Error("No available participants.");

        return helpers.mapParticipantsIdsToDatabase(seeding, participants);
    }

    /**
     * Inserts a stage or finds an existing one.
     *
     * @param stage The stage to insert.
     */
    private async insertStage(stage: OmitId<Stage>): Promise<Id> {
        let existing: Stage | null = null;

        if (this.updateMode) {
            existing = await this.storage.select("stage", this.currentStageId);
            if (!existing) throw Error("Stage not found.");

            const update: Stage = {
                ...existing,
                ...stage,
                settings: {
                    ...existing.settings,
                    ...stage.settings,
                },
            };

            if (
                !(await this.storage.update(
                    "stage",
                    this.currentStageId,
                    update
                ))
            )
                throw Error("Could not update the stage.");
        }

        if (!existing) return this.storage.insert("stage", stage);

        return existing.id;
    }

    /**
     * Inserts a group or finds an existing one.
     *
     * @param group The group to insert.
     */
    private async insertGroup(group: OmitId<Group>): Promise<Id> {
        let existing: Group | null = null;

        if (this.updateMode) {
            existing = await this.storage.selectFirst("group", {
                stage_id: group.stage_id,
                number: group.number,
            });
        }

        if (!existing) return this.storage.insert("group", group);

        return existing.id;
    }

    /**
     * Inserts a round or finds an existing one.
     *
     * @param round The round to insert.
     */
    private async insertRound(round: OmitId<Round>): Promise<Id> {
        let existing: Round | null = null;

        if (this.updateMode) {
            existing = await this.storage.selectFirst("round", {
                group_id: round.group_id,
                number: round.number,
            });
        }

        if (!existing) return this.storage.insert("round", round);

        return existing.id;
    }

    /**
     * Inserts a match or updates an existing one.
     *
     * @param match The match to insert.
     * @param existing An existing match corresponding to the current one.
     */
    private async insertMatch(
        match: OmitId<Match>,
        existing: Match | null
    ): Promise<Id> {
        if (!existing) return this.storage.insert("match", match);

        const updated = helpers.getUpdatedMatchResults(
            match,
            existing,
            this.enableByesInUpdate
        ) as Match;
        if (!(await this.storage.update("match", existing.id, updated)))
            throw Error("Could not update the match.");

        return existing.id;
    }

    /**
     * Inserts a match game or finds an existing one (and updates it).
     *
     * @param matchGame The match game to insert.
     */
    private async insertMatchGame(matchGame: OmitId<any>): Promise<Id> {
        let existing: any | null = null;

        if (this.updateMode) {
            existing = await this.storage.selectFirst("match_game", {
                parent_id: matchGame.parent_id,
                number: matchGame.number,
            });
        }

        if (!existing) return this.storage.insert("match_game", matchGame);

        const updated = helpers.getUpdatedMatchResults(
            matchGame,
            existing,
            this.enableByesInUpdate
        ) as any;
        if (!(await this.storage.update("match_game", existing.id, updated)))
            throw Error("Could not update the match game.");

        return existing.id;
    }

    /**
     * Inserts missing participants.
     *
     * @param participants The list of participants to process.
     */
    private async registerParticipants(
        participants: OmitId<Participant>[]
    ): Promise<boolean> {
        const existing = await this.storage.select("participant", {
            tournament_id: this.stage.tournamentId,
        });

        // Insert all if nothing.
        if (!existing || existing.length === 0)
            return this.storage.insert("participant", participants);

        // Insert only missing otherwise.
        for (const participant of participants) {
            if (existing.some((value) => value.name === participant.name))
                continue;

            const result = await this.storage.insert(
                "participant",
                participant
            );
            if (result === -1) return false;
        }

        return true;
    }

    /**
     * Creates a new stage.
     */
    private async createStage(): Promise<Stage> {
        const stageNumber = await this.getStageNumber();

        const stage: OmitId<Stage> = {
            tournament_id: this.stage.tournamentId,
            name: this.stage.name,
            type: "gymnastics_elimination", // Our new stage type
            number: stageNumber,
            settings: this.stage.settings || {},
        };

        const stageId = await this.insertStage(stage);

        if (stageId === -1) throw Error("Could not insert the stage.");

        return { ...stage, id: stageId };
    }

    /**
     * Gets the current stage number based on existing stages.
     */
    private async getStageNumber(): Promise<number> {
        const stages = await this.storage.select("stage", {
            tournament_id: this.stage.tournamentId,
        });
        const stageNumbers = stages?.map((stage) => stage.number ?? 0);

        if (this.stage.number !== undefined) {
            if (stageNumbers?.includes(this.stage.number))
                throw Error("The given stage number already exists.");

            return this.stage.number;
        }

        if (!stageNumbers?.length) return 1;

        const maxNumber = Math.max(...stageNumbers);
        return maxNumber + 1;
    }
}
