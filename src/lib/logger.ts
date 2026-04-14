import fs from "fs";
import path from "path";
import { Decision } from "./types";

export class DecisionLogger {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(process.cwd(), "data", "decisions.json");
  }

  log(decision: Decision): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const history = this.readAll();
    history.push(decision);
    fs.writeFileSync(this.filePath, JSON.stringify(history, null, 2));
  }

  getHistory(limit: number): Decision[] {
    return this.readAll().reverse().slice(0, limit);
  }

  private readAll(): Decision[] {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, "utf-8");
    return JSON.parse(raw);
  }
}
