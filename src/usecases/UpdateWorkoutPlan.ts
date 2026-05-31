import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";
import { normalizeWorkoutLabel } from "../lib/normalize-workout-label.js";

interface InputDto {
  userId: string;
  workoutPlanId?: string;
  workoutDays: Array<{
    workoutDayId: string;
    name?: string;
    isRest?: boolean;
    estimatedDurationInSeconds?: number;
    coverImageUrl?: string;
    exercises?: Array<{
      order: number;
      name: string;
      sets: number;
      reps: number;
      restTimeInSeconds: number;
    }>;
  }>;
}

interface OutputDto {
  id: string;
  name: string;
  workoutDays: Array<{
    id: string;
    name: string;
    weekDay: WeekDay;
    isRestDay: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercises: Array<{
      id: string;
      order: number;
      name: string;
      sets: number;
      reps: number;
      restTimeInSeconds: number;
    }>;
  }>;
}

export class UpdateWorkoutPlan {
  async execute(dto: InputDto): Promise<OutputDto> {
    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        userId: dto.userId,
        ...(dto.workoutPlanId ? { id: dto.workoutPlanId } : { isActive: true }),
      },
      include: {
        workoutDays: true,
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Workout plan not found");
    }

    const workoutDayIds = new Set(workoutPlan.workoutDays.map((day) => day.id));

    for (const dayUpdate of dto.workoutDays) {
      if (!workoutDayIds.has(dayUpdate.workoutDayId)) {
        throw new NotFoundError(`Workout day ${dayUpdate.workoutDayId} not found`);
      }
    }

    return prisma.$transaction(async (tx) => {
      for (const dayUpdate of dto.workoutDays) {
        await tx.workoutDay.update({
          where: { id: dayUpdate.workoutDayId },
          data: {
            ...(dayUpdate.name !== undefined
              ? { name: normalizeWorkoutLabel(dayUpdate.name) }
              : {}),
            ...(dayUpdate.isRest !== undefined ? { isRestDay: dayUpdate.isRest } : {}),
            ...(dayUpdate.estimatedDurationInSeconds !== undefined
              ? { estimatedDurationInSeconds: dayUpdate.estimatedDurationInSeconds }
              : {}),
            ...(dayUpdate.coverImageUrl !== undefined
              ? { coverImageUrl: dayUpdate.coverImageUrl }
              : {}),
          },
        });

        if (dayUpdate.exercises !== undefined) {
          await tx.workoutExercise.deleteMany({
            where: { workoutDayId: dayUpdate.workoutDayId },
          });

          if (dayUpdate.exercises.length > 0) {
            await tx.workoutExercise.createMany({
              data: dayUpdate.exercises.map((exercise) => ({
                id: crypto.randomUUID(),
                workoutDayId: dayUpdate.workoutDayId,
                name: normalizeWorkoutLabel(exercise.name),
                order: exercise.order,
                sets: exercise.sets,
                reps: exercise.reps,
                restTimeInSeconds: exercise.restTimeInSeconds,
              })),
            });
          }
        }
      }

      const result = await tx.workoutPlan.findUnique({
        where: { id: workoutPlan.id },
        include: {
          workoutDays: {
            include: {
              exercises: { orderBy: { order: "asc" } },
            },
          },
        },
      });

      if (!result) {
        throw new NotFoundError("Workout plan not found");
      }

      return {
        id: result.id,
        name: normalizeWorkoutLabel(result.name),
        workoutDays: result.workoutDays.map((day) => ({
          id: day.id,
          name: normalizeWorkoutLabel(day.name),
          weekDay: day.weekDay,
          isRestDay: day.isRestDay,
          estimatedDurationInSeconds: day.estimatedDurationInSeconds,
          coverImageUrl: day.coverImageUrl ?? undefined,
          exercises: day.exercises.map((exercise) => ({
            id: exercise.id,
            order: exercise.order,
            name: normalizeWorkoutLabel(exercise.name),
            sets: exercise.sets,
            reps: exercise.reps,
            restTimeInSeconds: exercise.restTimeInSeconds,
          })),
        })),
      };
    });
  }
}
