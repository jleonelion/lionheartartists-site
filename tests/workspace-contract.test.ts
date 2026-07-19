import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function linkTargets(html: string): string[] {
  return [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((target) => {
      return !target.startsWith("#")
        && !target.startsWith("http://")
        && !target.startsWith("https://")
        && !target.startsWith("mailto:")
        && !target.startsWith("tel:")
        && !target.startsWith("data:");
    })
    .map((target) => target.split("#")[0].split("?")[0])
    .filter(Boolean);
}

function formControlNames(html: string): string[] {
  return [...html.matchAll(/\bname=["']([^"']+)["']/g)].map((match) => match[1]);
}

function requiredControlNames(html: string): string[] {
  const requiredControls = [...html.matchAll(/<(input|select|textarea)\b[^>]*\brequired\b[^>]*>/g)];
  return requiredControls
    .map((match) => match[0].match(/\bname=["']([^"']+)["']/)?.[1])
    .filter((name): name is string => Boolean(name));
}

describe("LionHeart workspace contract", () => {
  test("keeps the static page set and deployment files intact", () => {
    for (const path of [
      "index.html",
      "apply.html",
      "privacy.html",
      "CNAME",
      "wrangler.jsonc",
      "apps-script/Code.gs",
      "apps-script/appsscript.json",
      "SHEET_SCHEMA.md",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }

    expect(read("CNAME").trim()).toBe("lionheartartists.com");
  });

  test("keeps home page navigation anchored to rendered sections", () => {
    const html = read("index.html");
    const expectedSections = ["about", "services", "industries", "values", "apply"];

    for (const section of expectedSections) {
      expect(html).toContain(`href="#${section}"`);
      expect(html).toContain(`id="${section}"`);
    }

    expect(html).toContain("const sections = document.querySelectorAll('section[id]')");
    expect(html).toContain("const navLinks = document.querySelectorAll('nav a')");
    expect(html).toContain('href="apply.html"');
  });

  test("keeps all same-site links and image assets resolvable", () => {
    for (const page of ["index.html", "apply.html", "privacy.html"]) {
      const html = read(page);
      const missingTargets = linkTargets(html).filter((target) => {
        return !target.startsWith("/") && !existsSync(join(root, target));
      });

      expect(missingTargets, `${page} has broken local references`).toEqual([]);
    }

    expect(readdirSync(join(root, "assets")).length).toBeGreaterThan(0);
  });

  test("keeps the phone number synchronized across user-facing surfaces", () => {
    const phone = "424-777-9493";

    expect(read("index.html")).toContain(phone);
    expect(read("apply.html")).toContain(phone);
    expect(read("privacy.html")).toContain(phone);
    expect(read("apps-script/Code.gs")).toContain(phone);
  });

  test("keeps the intake form wired to Turnstile, Apps Script, and privacy consent", () => {
    const html = read("apply.html");

    expect(html).toContain('<form id="apply-form" novalidate>');
    expect(html).toContain('class="cf-turnstile"');
    expect(html).toContain('data-sitekey="0x4AAAAAADB--yvUYC5nOzI3"');
    expect(html).toContain("const APPS_SCRIPT_URL = 'https://script.google.com/macros/");
    expect(html).toContain('name="consent" required');
    expect(html).toContain('href="privacy.html"');
    expect(html).toContain("payload.turnstileToken = turnstileToken");
    expect(html).toContain("delete payload['cf-turnstile-response']");
  });

  test("keeps required form fields aligned with Apps Script validation", () => {
    const applyHtml = read("apply.html");
    const script = read("apps-script/Code.gs");
    const names = new Set(formControlNames(applyHtml));
    const requiredNames = new Set(requiredControlNames(applyHtml));

    const requiredByBackend = [
      "parentName",
      "parentEmail",
      "parentPhone",
      "relationship",
      "location",
      "childFirstName",
      "childDob",
      "childGender",
      "goals",
      "consent",
    ];

    for (const field of requiredByBackend) {
      expect(names.has(field), `apply.html contains ${field}`).toBe(true);
      expect(requiredNames.has(field), `apply.html requires ${field}`).toBe(true);
      expect(script).toContain(field);
    }

    for (const fileField of ["headshot", "fullLength"]) {
      expect(names.has(fileField), `apply.html contains ${fileField}`).toBe(true);
      expect(requiredNames.has(fileField), `apply.html requires ${fileField}`).toBe(true);
    }
  });
});
