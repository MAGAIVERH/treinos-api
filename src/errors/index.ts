export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class WorkoutPlanNotActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkoutPlanNotActiveError";
  }
}

export class SessionAlreadyStartedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionAlreadyStartedError";
  }
}

export class RestDayWorkoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestDayWorkoutError";
  }
}
