import { Router } from 'express';
import { createMatchSchema } from '../validation/matches.js';
import { db } from '../db/db.js';
import { listMatchQuerySchema } from '../validation/matches.js';
import { matches } from '../db/schema.js'
import { desc } from 'drizzle-orm';

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get('/', async (req, res) => {
    const parsed = listMatchQuerySchema.safeParse(req.query);

    if(!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', details: JSON.stringify(parsed.error) });
    }

    const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

    try {

        const data = await db.select().from(matches).orderBy(desc(matches.createdAt)).limit(limit);
        res.json({ data });

        return res.status(200).json({ message: 'Matches fetched successfully', data });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch matches', details: JSON.stringify(error.message) });
    }
})

matchRouter.post('/', async (req, res) => {
    const parsed = createMatchSchema.safeParse(req.body);
    const { data: { startTime, endTime, homeScore, awayScore } } = parsed;

    if(!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', details: JSON.stringify(parsed.error) });
    }

    try {
        const [event] = await db.insert(matches).values({
            ...parsed.data,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            homeScore: homeScore ?? 0,
            awayScore: awayScore ?? 0,
            status: getMatchStatus(startTime, endTime),
        }).returning();

        return res.status(201).json({ message: 'Match created successfully', event });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to create match', details: JSON.stringify(error.message) });
    }
})