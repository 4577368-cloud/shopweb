import type { Locale } from "../config";
import { en, type Dictionary } from "./en";
import { fr } from "./fr";
import { es } from "./es";
import { zh } from "./zh";

export const messages: Record<Locale, Dictionary> = {
  en,
  fr,
  es,
  zh,
};
