import dayjs from "dayjs";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";
import { toUserDateKey, userDateToUtcRange } from "../lib/user-calendar.js";

const WEEKDAY_MAP: Record<number, WeekDay> = {
  0: WeekDay.Sunday,
  1: WeekDay.Monday,
  2: WeekDay.Tuesday,
  3: WeekDay.Wednesday,
  4: WeekDay.Thursday,
  5: WeekDay.Friday,
  6: WeekDay.Saturday,
};

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
    });

    const consistencyByDay: OutputDto["consistencyByDay"] = {};

    sessions.forEach((session) => {
      const dateKey = toUserDateKey(session.startedAt, timezoneOffsetMinutes);

      if (!consistencyByDay[dateKey]) {
        consistencyByDay[dateKey] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
      }

      consistencyByDay[dateKey].workoutDayStarted = true;

      if (session.completedAt !== null) {
        consistencyByDay[dateKey].workoutDayCompleted = true;
      }
    });

    const completedSessions = sessions.filter((s) => s.completedAt !== null);
    const completedWorkoutsCount = completedSessions.length;
    const conclusionRate = sessions.length > 0 ? completedWorkoutsCount / sessions.length : 0;

    const totalTimeInSeconds = completedSessions.reduce((total, session) => {
      const durationMs = session.completedAt!.getTime() - session.startedAt.getTime();
      return total + Math.floor(durationMs / 1000);
    }, 0);

    const workoutStreak = await this.calculateStreak(
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

  private async calculateStreak(
    workoutPlanId: string,
    workoutDays: Array<{
      weekDay: string;
      isRestDay: boolean;
    }>,
    calendarDate: string,
    timezoneOffsetMinutes: number,
  ): Promise<number> {
    const planWeekDays = new Set(workoutDays.map((d) => d.weekDay));
    const restWeekDays = new Set(workoutDays.filter((d) => d.isRestDay).map((d) => d.weekDay));

    const allSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: { workoutPlanId },
        completedAt: { not: null },
      },
      select: { startedAt: true },
    });

    const completedDates = new Set(
      allSessions.map((s) => toUserDateKey(s.startedAt, timezoneOffsetMinutes)),
    );

    let streak = 0;
    let day = dayjs(calendarDate);

    for (let i = 0; i < 365; i++) {
      const weekDay = WEEKDAY_MAP[day.day()];

      if (!planWeekDays.has(weekDay)) {
        day = day.subtract(1, "day");
        continue;
      }

      if (restWeekDays.has(weekDay)) {
        day = day.subtract(1, "day");
        continue;
      }

      const dateKey = day.format("YYYY-MM-DD");
      if (completedDates.has(dateKey)) {
        streak++;
        day = day.subtract(1, "day");
        continue;
      }

      break;
    }

    return streak;
  }
}
