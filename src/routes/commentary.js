import { Router } from "express";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { createCommentarySchema, listCommentaryQuerySchema } from "../validation/commentary.js";
import { matchIdParamSchema } from "../validation/matches.js";
import { desc, eq } from "drizzle-orm";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRouter.get("/", async (req, res) => {
    const parsedParams = matchIdParamSchema.safeParse(req.params);

    if(!parsedParams.success) {
        return res.status(400).json({ error: "Invalid match id", details: parsedParams.error.issues });
    }

    const parsedQuery = listCommentaryQuerySchema.safeParse(req.query);

    if(!parsedQuery.success) {
        return res.status(400).json({ error: "Invalid query parameters", details: parsedQuery.error.issues });
    }

    const limit = Math.min(parsedQuery.data.limit ?? MAX_LIMIT, MAX_LIMIT);

    try {
        const data = await db
            .select()
            .from(commentary)
            .where(eq(commentary.matchId, parsedParams.data.id))
            .orderBy(desc(commentary.createdAt))
            .limit(limit);

        return res.status(200).json({ message: "Commentary fetched successfully", data });
    } catch (error) {
        const details = error instanceof Error ? error.message : "Unknown error";
        return res.status(500).json({ error: "Failed to fetch commentary", details });
    }
})

commentaryRouter.post("/", async (req, res) => {
    const parsedParams = matchIdParamSchema.safeParse(req.params);

    if(!parsedParams.success) {
        return res.status(400).json({ error: "Invalid match id", details: parsedParams.error.issues });
    }

    const parsedBody = createCommentarySchema.safeParse(req.body);

    if(!parsedBody.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsedBody.error.issues });
    }

    const { minutes, ...data } = parsedBody.data;

    try {
        const [event] = await db.insert(commentary).values({
            ...data,
            matchId: parsedParams.data.id,
            minute: minutes,
        }).returning();

        if(req.app.locals.broadcastCommentary) {
            req.app.locals.broadcastCommentary(event.matchId, event);
        }

        return res.status(201).json({ message: "Commentary created successfully", event });
    } catch (error) {
        const details = error instanceof Error ? error.message : "Unknown error";
        return res.status(500).json({ error: "Failed to create commentary", details });
    }
})
