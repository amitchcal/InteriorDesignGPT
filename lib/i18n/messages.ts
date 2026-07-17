import enIN from "@/messages/en-IN.json";
import enUS from "@/messages/en-US.json";

/**
 * Direct message access by locale, for code that runs outside a request (the
 * worker). next-intl's getTranslations depends on request storage the worker
 * doesn't have; the message files are plain JSON, so read them directly.
 */
const CATALOGUES: Record<string, typeof enIN> = {
  "en-IN": enIN,
  "en-US": enUS,
};

export function getMessages(locale: string): typeof enIN {
  return CATALOGUES[locale] ?? enIN;
}
