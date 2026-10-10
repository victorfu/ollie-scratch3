// `?lesson=` selects an example: the lesson number for titles like 第28課_完成作品, else the full title.
type Titled = {title: string};
const lessonNumber = (title: string) => /^第0*(\d+)課/.exec(title)?.[1];

export const LESSON_PARAM = 'lesson';

export function lessonParam(title: string): string {
  return lessonNumber(title) ?? title;
}

export function findLesson<T extends Titled>(examples: T[], value: string): T | undefined {
  const wanted = value.trim();
  if (/^\d+$/.test(wanted)) return examples.find(e => lessonNumber(e.title) === String(Number(wanted)));
  return examples.find(e => e.title === wanted);
}

// The URL for the current page with `lesson` set to the loaded example, or removed (null) for an imported file.
export function withLesson(href: string, value: string | null): string {
  const url = new URL(href);
  if (value === null) url.searchParams.delete(LESSON_PARAM);
  else url.searchParams.set(LESSON_PARAM, value);
  return url.pathname + url.search + url.hash;
}
