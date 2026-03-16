export type DeventClientOptions = {
  apiKey: string;
  baseUrl?: string;
};

export class DeventClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: DeventClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'http://localhost:3001/v1';
  }

  async track(event: string, data: Record<string, unknown> = {}): Promise<void> {
    const response = await fetch(`${this.baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        event,
        data,
        source: 'sdk',
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to track event: ${message}`);
    }
  }
}
