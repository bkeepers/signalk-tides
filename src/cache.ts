import { join } from "path";
import { writeFile, readFile, mkdir } from "fs/promises";

export default class FileCache {
  constructor(public readonly path: string) {
  }

  async get(key: string): Promise<any | undefined> {
    try {
      const content = await readFile(this.getKey(key), 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      return undefined;
    }
  }

  async set(key: string, value: any) {
    // Ensure directory exists
    await mkdir(this.path, { recursive: true });
    return writeFile(this.getKey(key), JSON.stringify(value));
  }

  getKey(key: string): string {
    return join(this.path, `${key}.json`);
  }
}
