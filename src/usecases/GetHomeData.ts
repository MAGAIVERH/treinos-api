import dayjs from "dayjs";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { buildWeekConsistencyByDay } from "../lib/consistency-by-day.js";
import { prisma } from "../lib/db.js";
import { normalizeWorkoutLabel } from "../lib/normalize-workout-label.js";
import { calculateWorkoutStreak } from "../lib/workout-streak.js";
import {
  getMondayWeekDateKeys,
  getWeekUtcRange,
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
      include: {
        workoutDay: {
          select: { isRestDay: true },
        },
      },
    });

    const weekDateKeys = getMondayWeekDateKeys(calendarDate);
    const consistencyByDay = buildWeekConsistencyByDay(
      weekDateKeys,
      weekSessions.map((session) => ({
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        isRestDay: session.workoutDay.isRestDay,
      })),
      timezoneOffsetMinutes,
    );

    const workoutStreak = await calculateWorkoutStreak(
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
}
