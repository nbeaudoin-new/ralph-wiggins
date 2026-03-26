#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, Browser, Page } from "playwright";

// ── Singleton browser + page session ──────────────────────────────────────────
let browser: Browser | null = null;
let page: Page | null = null;

async function getPage(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  if (!page || page.isClosed()) {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();
  }
  return page;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}

// ── MCP Server ─────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "playwright-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ───────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "navigate",
      description: "Navigate the browser to a URL and wait for the page to load.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to." },
          wait_until: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle"],
            description: "When to consider navigation complete. Default: load.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "scrape",
      description:
        "Navigate to a URL and return the page title + cleaned text content in one step.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to scrape." },
          wait_for_selector: {
            type: "string",
            description: "Optional CSS selector to wait for before extracting content.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "get_html",
      description: "Return the full HTML source of the current page.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_text",
      description: "Extract visible text from the current page or a specific CSS selector.",
      inputSchema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "Optional CSS selector. If omitted, returns full page text.",
          },
        },
      },
    },
    {
      name: "get_links",
      description: "Extract all hyperlinks (href + text) from the current page.",
      inputSchema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "Optional CSS selector to scope the search. Default: 'a'.",
          },
        },
      },
    },
    {
      name: "screenshot",
      description: "Take a screenshot of the current page and return it as a base64 PNG.",
      inputSchema: {
        type: "object",
        properties: {
          full_page: {
            type: "boolean",
            description: "Capture the full scrollable page. Default: false.",
          },
          selector: {
            type: "string",
            description: "Optional CSS selector to screenshot a specific element.",
          },
        },
      },
    },
    {
      name: "click",
      description: "Click on an element matching a CSS selector.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector to click." },
          timeout: {
            type: "number",
            description: "Max wait time in ms. Default: 5000.",
          },
        },
        required: ["selector"],
      },
    },
    {
      name: "fill",
      description: "Type text into an input field matching a CSS selector.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector for the input field." },
          value: { type: "string", description: "Text to type into the field." },
        },
        required: ["selector", "value"],
      },
    },
    {
      name: "select",
      description: "Select an option in a <select> dropdown by value or label.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector for the <select> element." },
          value: { type: "string", description: "The option value or visible text to select." },
        },
        required: ["selector", "value"],
      },
    },
    {
      name: "wait_for",
      description: "Wait for a CSS selector to appear on the page.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector to wait for." },
          timeout: {
            type: "number",
            description: "Max wait time in ms. Default: 10000.",
          },
          state: {
            type: "string",
            enum: ["attached", "detached", "visible", "hidden"],
            description: "Element state to wait for. Default: visible.",
          },
        },
        required: ["selector"],
      },
    },
    {
      name: "evaluate",
      description:
        "Run arbitrary JavaScript in the page context and return the result.",
      inputSchema: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "JavaScript expression or function body to execute.",
          },
        },
        required: ["script"],
      },
    },
    {
      name: "scroll",
      description: "Scroll the page to a position or element.",
      inputSchema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "Optional CSS selector to scroll into view.",
          },
          x: { type: "number", description: "Horizontal scroll position." },
          y: { type: "number", description: "Vertical scroll position." },
        },
      },
    },
    {
      name: "get_current_url",
      description: "Return the current page URL.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "close_browser",
      description: "Close the browser session and free resources.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

// ── Tool handlers ──────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      // ── navigate ──────────────────────────────────────────────────────────
      case "navigate": {
        const p = await getPage();
        const waitUntil = (a.wait_until as "load" | "domcontentloaded" | "networkidle") ?? "load";
        await p.goto(a.url as string, { waitUntil, timeout: 30_000 });
        const title = await p.title();
        const url = p.url();
        return { content: [{ type: "text", text: `Navigated to: ${url}\nTitle: ${title}` }] };
      }

      // ── scrape ────────────────────────────────────────────────────────────
      case "scrape": {
        const p = await getPage();
        await p.goto(a.url as string, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (a.wait_for_selector) {
          await p.waitForSelector(a.wait_for_selector as string, { timeout: 10_000 });
        }
        const title = await p.title();
        const url = p.url();
        // Extract clean readable text, stripping scripts/styles
        const text = await p.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("script,style,noscript,iframe,svg").forEach((el) => el.remove());
          return clone.innerText.replace(/\n{3,}/g, "\n\n").trim();
        });
        return {
          content: [
            {
              type: "text",
              text: `URL: ${url}\nTitle: ${title}\n\n---\n\n${text}`,
            },
          ],
        };
      }

      // ── get_html ──────────────────────────────────────────────────────────
      case "get_html": {
        const p = await getPage();
        const html = await p.content();
        return { content: [{ type: "text", text: html }] };
      }

      // ── get_text ──────────────────────────────────────────────────────────
      case "get_text": {
        const p = await getPage();
        let text: string;
        if (a.selector) {
          const el = await p.locator(a.selector as string).first();
          text = (await el.innerText()) ?? "";
        } else {
          text = await p.evaluate(() => {
            const clone = document.body.cloneNode(true) as HTMLElement;
            clone.querySelectorAll("script,style,noscript").forEach((el) => el.remove());
            return clone.innerText.replace(/\n{3,}/g, "\n\n").trim();
          });
        }
        return { content: [{ type: "text", text }] };
      }

      // ── get_links ─────────────────────────────────────────────────────────
      case "get_links": {
        const p = await getPage();
        const selector = (a.selector as string) ?? "a";
        const links = await p.evaluate((sel: string) => {
          return Array.from(document.querySelectorAll(sel))
            .map((el) => {
              const anchor = el as HTMLAnchorElement;
              return { href: anchor.href, text: anchor.innerText.trim() };
            })
            .filter((l) => l.href && !l.href.startsWith("javascript:"));
        }, selector);
        const formatted = links
          .map((l, i) => `${i + 1}. [${l.text || "(no text)"}](${l.href})`)
          .join("\n");
        return {
          content: [{ type: "text", text: `Found ${links.length} links:\n\n${formatted}` }],
        };
      }

      // ── screenshot ────────────────────────────────────────────────────────
      case "screenshot": {
        const p = await getPage();
        let buffer: Buffer;
        if (a.selector) {
          const el = p.locator(a.selector as string).first();
          buffer = await el.screenshot({ type: "png" });
        } else {
          buffer = await p.screenshot({
            type: "png",
            fullPage: (a.full_page as boolean) ?? false,
          });
        }
        const base64 = buffer.toString("base64");
        return {
          content: [
            {
              type: "image",
              data: base64,
              mimeType: "image/png",
            },
          ],
        };
      }

      // ── click ─────────────────────────────────────────────────────────────
      case "click": {
        const p = await getPage();
        const timeout = (a.timeout as number) ?? 5_000;
        await p.click(a.selector as string, { timeout });
        await p.waitForLoadState("domcontentloaded").catch(() => {});
        return {
          content: [{ type: "text", text: `Clicked: ${a.selector}\nCurrent URL: ${p.url()}` }],
        };
      }

      // ── fill ──────────────────────────────────────────────────────────────
      case "fill": {
        const p = await getPage();
        await p.fill(a.selector as string, a.value as string);
        return { content: [{ type: "text", text: `Filled "${a.selector}" with value.` }] };
      }

      // ── select ────────────────────────────────────────────────────────────
      case "select": {
        const p = await getPage();
        await p.selectOption(a.selector as string, { label: a.value as string });
        return { content: [{ type: "text", text: `Selected "${a.value}" in ${a.selector}` }] };
      }

      // ── wait_for ──────────────────────────────────────────────────────────
      case "wait_for": {
        const p = await getPage();
        const state = (a.state as "attached" | "detached" | "visible" | "hidden") ?? "visible";
        const timeout = (a.timeout as number) ?? 10_000;
        await p.waitForSelector(a.selector as string, { state, timeout });
        return { content: [{ type: "text", text: `Element "${a.selector}" is ${state}.` }] };
      }

      // ── evaluate ──────────────────────────────────────────────────────────
      case "evaluate": {
        const p = await getPage();
        const result = await p.evaluate(a.script as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // ── scroll ────────────────────────────────────────────────────────────
      case "scroll": {
        const p = await getPage();
        if (a.selector) {
          await p.locator(a.selector as string).first().scrollIntoViewIfNeeded();
        } else {
          await p.evaluate(
            ({ x, y }: { x: number; y: number }) => window.scrollTo(x, y),
            { x: (a.x as number) ?? 0, y: (a.y as number) ?? 0 }
          );
        }
        return { content: [{ type: "text", text: "Scrolled." }] };
      }

      // ── get_current_url ───────────────────────────────────────────────────
      case "get_current_url": {
        const p = await getPage();
        return { content: [{ type: "text", text: p.url() }] };
      }

      // ── close_browser ─────────────────────────────────────────────────────
      case "close_browser": {
        await closeBrowser();
        return { content: [{ type: "text", text: "Browser closed." }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("SIGINT", async () => {
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
