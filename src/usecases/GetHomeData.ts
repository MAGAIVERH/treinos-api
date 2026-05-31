import dayjs from "dayjs";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";
import { normalizeWorkoutLabel } from "../lib/normalize-workout-label.js";
import {
  getMondayWeekDateKeys,
  getWeekUtcRange,
  toUserDateKey,
} from "../lib/user-calendar.js";

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
  date: string;
  timezoneOffsetMinutes?: number;
}

interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay?: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRestDay: boolean;
    weekDay: WeekDay;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercisesCount: number;
  };
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const timezoneOffsetMinutes = dto.timezoneOffsetMinutes ?? 0;
    const calendarDate = dto.date;

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: {
            exercises: true,
            sessions: true,
          },
        },
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Active workout plan not found");
    }

    const todayWeekDay = WEEKDAY_MAP[dayjs(calendarDate).day()];
    const todayWorkoutDay = workoutPlan.workoutDays.find((day) => day.weekDay === todayWeekDay);

    const { start: weekStart, end: weekEnd } = getWeekUtcRange(
      calendarDate,
      timezoneOffsetMinutes,
    );

    const weekSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlanId: workoutPlan.id,
        },
        startedAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    const weekDateKeys = getMondayWeekDateKeys(calendarDate);
    const consistencyByDay: OutputDto["consistencyByDay"] = {};

    for (const dateKey of weekDateKeys) {
      const daySessions = weekSessions.filter(
        (session) =>
          toUserDateKey(session.startedAt, timezoneOffsetMinutes) === dateKey,
      );

      consistencyByDay[dateKey] = {
        workoutDayStarted: daySessions.length > 0,
        workoutDayCompleted: daySessions.some((session) => session.completedAt !== null),
      };
    }

    const workoutStreak = await this.calculateStreak(
      workoutPlan.id,
      workoutPlan.workoutDays,
      calendarDate,
      timezoneOffsetMinutes,
    );

    return {
      activeWorkoutPlanId: workoutPlan.id,
      todayWorkoutDay:
        todayWorkoutDay && workoutPlan
          ? {
              workoutPlanId: workoutPlan.id,
              id: todayWorkoutDay.id,
              name: normalizeWorkoutLabel(todayWorkoutDay.name),
              isRestDay: todayWorkoutDay.isRestDay,
              weekDay: todayWorkoutDay.weekDay,
              estimatedDurationInSeconds: todayWorkoutDay.estimatedDurationInSeconds,
              coverImageUrl: todayWorkoutDay.coverImageUrl ?? undefined,
              exercisesCount: todayWorkoutDay.exercises.length,
            }
          : undefined,
      workoutStreak,
      consistencyByDay,
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
        streak++;
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
