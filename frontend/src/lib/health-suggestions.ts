// Curated suggestion lists for structured onboarding inputs.
// Keeping these client-side keeps autocomplete instant and predictable.

export const LANGUAGES = [
  "English",
  "Spanish",
  "Mandarin",
  "Hindi",
  "Arabic",
  "French",
  "Portuguese",
  "Russian",
  "Japanese",
  "German",
  "Korean",
  "Italian",
  "Turkish",
  "Vietnamese",
  "Polish",
  "Dutch",
  "Greek",
  "Hungarian",
  "Czech",
  "Swedish",
  "Norwegian",
  "Danish",
  "Finnish",
  "Hebrew",
  "Thai",
  "Indonesian",
  "Malay",
  "Tagalog",
  "Ukrainian",
  "Romanian",
] as const;

export const MEDICATIONS = [
  "Iron supplement",
  "Vitamin D",
  "Vitamin B12",
  "Multivitamin",
  "Ibuprofen",
  "Paracetamol",
  "Aspirin",
  "Amoxicillin",
  "Omeprazole",
  "Pantoprazole",
  "Metformin",
  "Insulin",
  "Lisinopril",
  "Atorvastatin",
  "Levothyroxine",
  "Albuterol inhaler",
  "Salbutamol inhaler",
  "Loratadine",
  "Cetirizine",
  "Sertraline",
  "Fluoxetine",
  "Birth control pill",
  "Folic acid",
  "Magnesium",
  "Calcium",
  "Probiotic",
];

export const CONDITIONS = [
  "Gastritis",
  "Acid reflux (GERD)",
  "Irritable bowel syndrome (IBS)",
  "Diabetes type 1",
  "Diabetes type 2",
  "Hypertension",
  "High cholesterol",
  "Asthma",
  "Migraine",
  "Anxiety",
  "Depression",
  "Hypothyroidism",
  "Hyperthyroidism",
  "Anemia",
  "Eczema",
  "Psoriasis",
  "Arthritis",
  "Endometriosis",
  "PCOS",
  "Crohn's disease",
  "Ulcerative colitis",
  "Sleep apnea",
  "Chronic back pain",
];

export const ALLERGIES = [
  "Penicillin",
  "Aspirin",
  "Ibuprofen",
  "Sulfa drugs",
  "Peanuts",
  "Tree nuts",
  "Shellfish",
  "Eggs",
  "Milk",
  "Soy",
  "Wheat / Gluten",
  "Sesame",
  "Latex",
  "Pollen",
  "Dust mites",
  "Pet dander",
  "Bee stings",
  "Iodine / Contrast dye",
];

export function splitCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinCsv(values: string[]): string {
  return values.map((v) => v.trim()).filter(Boolean).join(", ");
}
