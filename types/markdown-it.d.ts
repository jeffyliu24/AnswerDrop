declare module "markdown-it" {
  export default class MarkdownIt {
    constructor(options?: Record<string, unknown>);
    readonly renderer: {
      rules: Record<string, (...args: any[]) => string>;
      render(tokens: any[], options: any, env: any): string;
    };
    readonly inline: {
      ruler: {
        before(
          name: string,
          rule: string,
          fn: (...args: any[]) => boolean,
        ): void;
      };
    };
    readonly block: {
      ruler: {
        before(
          name: string,
          rule: string,
          fn: (...args: any[]) => boolean,
          options?: any,
        ): void;
      };
    };
    readonly core: {
      ruler: { push(name: string, fn: (...args: any[]) => void): void };
    };
    readonly options: Record<string, unknown>;
    parse(markdown: string, env: Record<string, unknown>): any[];
    render(markdown: string): string;
  }
}
