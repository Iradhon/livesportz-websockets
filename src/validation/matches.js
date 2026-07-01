import { z } from "zod";

export const MATCH_STATUS = {
    SCHEDULED: 'scheduled',
    LIVE: 'live',
    FINISHED: 'finished',
}

export const listMatchQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
})

export const matchIdparamSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const matchIdParamSchema = matchIdparamSchema;

const isoDateString = z.iso.datetime();

export const createMatchSchema = z.object({
    sport: z.string().min(1),
    homeTeam: z.string().min(1),
    awayTeam: z.string().min(1),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
}).superRefine((data, ctx) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if(end <= start) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "endTime must be after startTime",
            path: ['endTime'],  
        })
    }
})

export const updateMatchSchema = z.object({
    homeTeam: z.coerce.number().int(1).optional(),
    awayTeam: z.coerce.number().int().optional(),
})
