export const dateToTimestamp = (date: string | Date): number =>
  new Date(date).getTime();

export const asciiToChar = (text: string): string => {
  const codes = [8211, 8217, 8220, 8221];
  codes.forEach((code) => {
    text = text.replace(`&#${code};`, String.fromCharCode(code));
  });
  return text;
};
