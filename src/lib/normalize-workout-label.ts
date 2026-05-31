/**
 * Maps legacy Portuguese workout labels to English for the US app.
 * Applied on read/write so existing plans display correctly.
 */

const EXACT_LABELS: Record<string, string> = {
  Pernas: "Legs",
  Descanso: "Rest",
  "Dia de Descanso": "Rest Day",
};

const PHRASE_REPLACEMENTS: Array<[string, string]> = [
  ["Push - Peito, Ombro e Tríceps", "Push - Chest, Shoulders and Triceps"],
  ["Pull - Costas e Bíceps", "Pull - Back and Biceps"],
  ["Upper - Parte Superior do Corpo", "Upper Body"],
  ["Lower - Parte Inferior do Corpo", "Lower Body"],
  ["Parte Superior do Corpo", "Upper Body"],
  ["Parte Inferior do Corpo", "Lower Body"],
  ["Supino Reto com Halteres", "Dumbbell Bench Press"],
  ["Supino Inclinado com Halteres", "Incline Dumbbell Press"],
  ["Desenvolvimento de Ombro com Halteres", "Dumbbell Shoulder Press"],
  ["Desenvolvimento com Halteres", "Dumbbell Shoulder Press"],
  ["Crucifixo Inclinado", "Incline Dumbbell Fly"],
  ["Crucifixo Reto", "Dumbbell Fly"],
  ["Elevação Lateral", "Lateral Raise"],
  ["Elevação Frontal", "Front Raise"],
  ["Tríceps Testa", "Skull Crusher"],
  ["Tríceps Pulley", "Triceps Pushdown"],
  ["Tríceps Corda", "Rope Triceps Pushdown"],
  ["Rosca Direta", "Barbell Curl"],
  ["Rosca Alternada", "Alternating Dumbbell Curl"],
  ["Rosca Martelo", "Hammer Curl"],
  ["Puxada Frontal", "Lat Pulldown"],
  ["Puxada Alta", "Lat Pulldown"],
  ["Remada Curvada", "Bent-Over Row"],
  ["Remada Baixa", "Seated Cable Row"],
  ["Agachamento Livre", "Barbell Squat"],
  ["Leg Press", "Leg Press"],
  ["Cadeira Extensora", "Leg Extension"],
  ["Cadeira Flexora", "Leg Curl"],
  ["Stiff", "Romanian Deadlift"],
  ["Levantamento Terra", "Deadlift"],
  ["Afundo", "Lunge"],
  ["Passada", "Walking Lunge"],
  ["Panturrilha em Pé", "Standing Calf Raise"],
  ["Abdominal Crunch", "Crunch"],
  ["Prancha", "Plank"],
  ["com Halteres", "with Dumbbells"],
  ["com Barra", "with Barbell"],
  ["na Polia", "on Cable"],
  ["na Máquina", "on Machine"],
  ["Peito, Ombro e Tríceps", "Chest, Shoulders and Triceps"],
  ["Costas e Bíceps", "Back and Biceps"],
  ["Ombro e Tríceps", "Shoulders and Triceps"],
  ["Peito e Tríceps", "Chest and Triceps"],
];

const WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Peito/gi, "Chest"],
  [/Costas/gi, "Back"],
  [/Ombros?/gi, "Shoulders"],
  [/Tríceps/gi, "Triceps"],
  [/Bíceps/gi, "Biceps"],
  [/Pernas/gi, "Legs"],
  [/Glúteos/gi, "Glutes"],
  [/Quadríceps/gi, "Quads"],
  [/Posterior/gi, "Hamstrings"],
  [/Panturrilha/gi, "Calves"],
  [/Abdômen/gi, "Core"],
  [/Abdominal/gi, "Core"],
  [/Supino/gi, "Bench Press"],
  [/Halteres/gi, "Dumbbells"],
  [/Barra/gi, "Barbell"],
  [/Desenvolvimento/gi, "Press"],
  [/Crucifixo/gi, "Fly"],
  [/Elevação/gi, "Raise"],
  [/Rosca/gi, "Curl"],
  [/Remada/gi, "Row"],
  [/Puxada/gi, "Pulldown"],
  [/Agachamento/gi, "Squat"],
  [/Afundo/gi, "Lunge"],
];

const sortedPhrases = [...PHRASE_REPLACEMENTS].sort(
  (a, b) => b[0].length - a[0].length,
);

export function normalizeWorkoutLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;

  const exact = EXACT_LABELS[trimmed];
  if (exact) return exact;

  let result = trimmed;
  for (const [from, to] of sortedPhrases) {
    if (result.includes(from)) {
      result = result.split(from).join(to);
    }
  }

  for (const [pattern, replacement] of WORD_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result.replace(/\s{2,}/g, " ").trim();
}
