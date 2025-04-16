const chai = require('chai');
chai.use(require('chai-as-promised'));

const assert = chai.assert;
const { BracketsManager } = require('../dist');
const { JsonDatabase } = require('brackets-json-db');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

describe('Gymnastics Elimination Tournament', () => {
    beforeEach(() => {
        storage.reset();
    });

    it('should create a gymnastics elimination tournament with 32 teams', async () => {
        // Create an array of 32 team names
        const teams = Array.from({ length: 32 }, (_, i) => `Team ${i + 1}`);

        await manager.create.stage({
            name: 'NCAA Gymnastics Tournament',
            tournamentId: 0,
            type: 'gymnastics_elimination',
            seeding: teams,
        });

        const stage = await storage.select('stage', 0);
        assert.strictEqual(stage.name, 'NCAA Gymnastics Tournament');
        assert.strictEqual(stage.type, 'gymnastics_elimination');

        // Check that we have the correct number of groups, rounds, and matches
        const groups = await storage.select('group');
        assert.strictEqual(groups.length, 1); // One main group

        const rounds = await storage.select('round');
        assert.strictEqual(rounds.length, 4); // 4 rounds (8 meets, 4 meets, 2 meets, 1 meet)

        // In our implementation, we create 2 matches per meet (to handle 4 teams)
        // So we should have 8*2 + 4*2 + 2*2 + 1*2 = 30 matches
        const matches = await storage.select('match');
        assert.strictEqual(matches.length, 30);
    });

    it('should throw an error if not exactly 32 teams are provided', async () => {
        // Create an array of 16 team names (not enough)
        const teams = Array.from({ length: 16 }, (_, i) => `Team ${i + 1}`);

        await assert.isRejected(
            manager.create.stage({
                name: 'NCAA Gymnastics Tournament',
                tournamentId: 0,
                type: 'gymnastics_elimination',
                seeding: teams,
            }),
            'Gymnastics elimination requires exactly 32 teams.'
        );
    });
});
