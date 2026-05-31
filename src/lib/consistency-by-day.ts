import { toUserDateKey } from "./user-calendar.js";

export type ConsistencyDay = {
  workoutDayCompleted: boolean;
  workoutDayStarted: boolean;
};

type SessionLike = {
  startedAt: Date;
  completedAt: Date | null;
  isRestDay?: boolean;
};

export function buildConsistencyByDayFromSessions(
  sessions: SessionLike[],
  timezoneOffsetMinutes: number,
): Record<string, ConsistencyDay> {
  const consistencyByDay: Record<string, ConsistencyDay> = {};

  for (const session of sessions) {
    if (session.isRestDay) continue;

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
  }

  return consistencyByDay;
}

export function buildWeekConsistencyByDay(
  weekDateKeys: string[],
  sessions: SessionLike[],
  timezoneOffsetMinutes: number,
): Record<string, ConsistencyDay> {
  const fromSessions = buildConsistencyByDayFromSessions(sessions, timezoneOffsetMinutes);
  const consistencyByDay: Record<string, ConsistencyDay> = {};

  for (const dateKey of weekDateKeys) {
    consistencyByDay[dateKey] =
      fromSessions[dateKey] ?? {
        workoutDayCompleted: false,
        workoutDayStarted: false,
      };
  }

  return consistencyByDay;
}
