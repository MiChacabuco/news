export const atob = (from: string) =>
  Buffer.from(from, "base64").toString("binary");

export const logWarmState = (action: string, warm: boolean) => {
  console.log({ action, warm });
};
