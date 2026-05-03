// Type stub for puppeteer (dynamically imported, fallback exists at runtime)
declare module 'puppeteer' {
  export interface PuppeteerLaunchOptions {
    headless?: boolean
  }
  export interface Browser {
    newPage(): Promise<Page>
    close(): Promise<void>
  }
  export interface Page {
    setContent(html: string, options?: { waitUntil?: string }): Promise<void>
    pdf(options?: {
      format?: string
      printBackground?: boolean
      margin?: { top?: string; bottom?: string; left?: string; right?: string }
    }): Promise<Buffer>
  }
  export function launch(options?: PuppeteerLaunchOptions): Promise<Browser>
}
