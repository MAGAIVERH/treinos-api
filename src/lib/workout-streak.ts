import dayjs from "dayjs";

import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "./db.js";
import { toUserDateKey } from "./user-calendar.js";

const WEEKDAY_MAP: Record<number, WeekDay> = {
  0: WeekDay.Sunday,
  1: WeekDay.Monday,
  2: WeekDay.Tuesday,
  3: WeekDay.Wednesday,
  4: WeekDay.Thursday,
  5: WeekDay.Friday,
  6: WeekDay.Saturday,
};

type WorkoutDayLike = {
  weekDay: string;
  isRestDay: boolean;
};

/**
 * Counts consecutive completed workout days ending on `calendarDate`.
 * Rest days are skipped (they neither increment nor break the streak).
 */
export async function calculateWorkoutStreak(
  workoutPlanId: string,
  workoutDays: WorkoutDayLike[],
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
