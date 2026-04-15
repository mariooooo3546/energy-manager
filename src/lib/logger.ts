import { getStore } from "./storage";
import { Decision } from "./types";

const MAX_DECISIONS = 200;

export class DecisionLogger {
  async log(decision: Decision): Promise<void> {
    const history = await this.readAll();
    history.push(decision);
    const trimmed = history.slice(-MAX_DECISIONS);
    await getStore().set("decisions", trimmed);
  }

  async getHistory(limit: number): Promise<Decision[]> {
    const all = await this.readAll();
    return all.slice(-limit);
  }

  async readAll(): Promise<Decision[]> {
    return (await getStore().get<Decision[]>("decisions")) ?? [];
  }
}
