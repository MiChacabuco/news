import { Gobierno } from "./strategies";

export const handler = async () => {
  const gobierno = new Gobierno();
  await gobierno.start();
};
