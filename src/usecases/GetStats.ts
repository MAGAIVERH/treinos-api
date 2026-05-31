import { NotFoundError } from "../errors/index.js";
import { buildConsistencyByDayFromSessions } from "../lib/consistency-by-day.js";
import { prisma } from "../lib/db.js";
import { calculateWorkoutStreak } from "../lib/workout-streak.js";
import { userDateToUtcRange } from "../lib/user-calendar.js";

interface InputDto {
  userId: string;
  from: string;
  to: string;
  timezoneOffsetMinutes?: number;
}

interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const timezoneOffsetMinutes = dto.timezoneOffsetMinutes ?? 0;
    const fromRange = userDateToUtcRange(dto.from, timezoneOffsetMinutes);
    const toRange = userDateToUtcRange(dto.to, timezoneOffsetMinutes);

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: { sessions: true },
        },
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Active workout plan not found");
    }

    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlanId: workoutPlan.id,
        },
        startedAt: {
          gte: fromRange.start,
          lte: toRange.end,
        },
      },
      include: {
        workoutDay: {
          select: { isRestDay: true },
        },
      },
    });

    const trainingSessions = sessions.filter((session) => !session.workoutDay.isRestDay);

    const consistencyByDay = buildConsistencyByDayFromSessions(
      trainingSessions.map((session) => ({
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        isRestDay: session.workoutDay.isRestDay,
      })),
      timezoneOffsetMinutes,
    );

    const completedSessions = trainingSessions.filter((s) => s.completedAt !== null);
    const completedWorkoutsCount = completedSessions.length;
    const conclusionRate =
      trainingSessions.length > 0 ? completedWorkoutsCount / trainingSessions.length : 0;

    const totalTimeInSeconds = completedSessions.reduce((total, session) => {
      const durationMs = session.completedAt!.getTime() - session.startedAt.getTime();
      return total + Math.floor(durationMs / 1000);
    }, 0);

    const workoutStreak = await calculateWorkoutStreak(
      workoutPlan.id,
      workoutPlan.workoutDays,
      dto.to,
      timezoneOffsetMinutes,
    );

    return {
      workoutStreak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate,
      totalTimeInSeconds,
    };
  }
}
