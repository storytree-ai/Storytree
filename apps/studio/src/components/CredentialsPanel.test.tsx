// @vitest-environment jsdom
//
// Stage-1 red-green of the desktop Credentials panel (credential-broker contracts 5–9, ADR-0179 /
// ADR-0070 two-stage). These pin GEOMETRY/BEHAVIOUR over an injected `desktopAuth` fake — NO
// appearance assertion lives here. Each test LEADS with its contract id.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { CredentialKind, DesktopAuthBridge } from "../lib/desktopAuth.js";
import { CredentialsPanel } from "./CredentialsPanel.js";
import { DesktopCredentialsDock } from "./DesktopCredentialsDock.js";

const KINDS: CredentialKind[] = ["oauth", "api-key", "cursor-api-key"];

function makeFake(): {
  store: ReturnType<typeof vi.fn<DesktopAuthBridge["store"]>>;
  status: ReturnType<typeof vi.fn<DesktopAuthBridge["status"]>>;
  signOut: ReturnType<typeof vi.fn<DesktopAuthBridge["signOut"]>>;
} {
  return {
    store: vi.fn<DesktopAuthBridge["store"]>(async () => {}),
    status: vi.fn<DesktopAuthBridge["status"]>(async () => false),
    signOut: vi.fn<DesktopAuthBridge["signOut"]>(async () => true),
  };
}

const flush = (): Promise<void> => act(async () => {});

beforeEach(() => {
  delete (window as unknown as { desktopAuth?: unknown }).desktopAuth;
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { desktopAuth?: unknown }).desktopAuth;
});

describe("CredentialsPanel — credentials-ui-feature-gated", () => {
  it("credentials-ui-feature-gated: without desktopAuth the dock is absent from the control surface", () => {
    const { container } = render(<DesktopCredentialsDock />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("region", { name: "Credentials" })).toBeNull();
  });

  it("credentials-ui-feature-gated: CredentialsPanel without auth prop or global returns null", () => {
    const { container } = render(<CredentialsPanel />);
    expect(container.innerHTML).toBe("");
  });
});

describe("CredentialsPanel — credentials-ui-three-independent-rows", () => {
  it("credentials-ui-three-independent-rows: three rows render with independent boolean status", async () => {
    const fake = makeFake();
    fake.status.mockImplementation(async (kind: CredentialKind) => kind === "cursor-api-key");
    render(<CredentialsPanel auth={fake} />);
    await flush();

    expect(screen.getByText("Claude subscription token")).toBeTruthy();
    expect(screen.getByText("Anthropic API key")).toBeTruthy();
    expect(screen.getByText("Cursor API key")).toBeTruthy();

    const rows = screen.getAllByText(/Saved|Not saved/);
    expect(rows).toHaveLength(3);
    expect(screen.getByText("Cursor API key").closest(".credentials-row")!.textContent).toContain("Saved");
    expect(screen.getAllByText("Not saved")).toHaveLength(2);
    expect(fake.status).toHaveBeenCalledTimes(3);
  });
});

describe("CredentialsPanel — credentials-ui-one-way-store", () => {
  it("credentials-ui-one-way-store: store calls desktopAuth.store once and clears input on success", async () => {
    const fake = makeFake();
    render(<CredentialsPanel auth={fake} />);
    await flush();

    const input = screen.getAllByLabelText(/input$/i)[2]!;
    fireEvent.change(input, { target: { value: "cursor-secret-value" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Store" })[2]!);
    await flush();

    expect(fake.store).toHaveBeenCalledTimes(1);
    expect(fake.store).toHaveBeenCalledWith("cursor-api-key", "cursor-secret-value");
    expect((input as HTMLInputElement).value).toBe("");
    expect(fake).not.toHaveProperty("get");
  });

  it("credentials-ui-one-way-store: input clears in finally when store rejects", async () => {
    const fake = makeFake();
    fake.store.mockRejectedValue(new Error("keychain refused"));
    render(<CredentialsPanel auth={fake} />);
    await flush();

    const input = screen.getAllByLabelText(/input$/i)[0]!;
    fireEvent.change(input, { target: { value: "oauth-token" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Store" })[0]!);
    await flush();

    expect(fake.store).toHaveBeenCalledWith("oauth", "oauth-token");
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Could not store the credential.")).toBeTruthy();
  });
});

describe("CredentialsPanel — credentials-ui-blank-refusal", () => {
  it("credentials-ui-blank-refusal: blank store does not call desktopAuth.store and shows value-free error", async () => {
    const fake = makeFake();
    render(<CredentialsPanel auth={fake} />);
    await flush();

    fireEvent.click(screen.getAllByRole("button", { name: "Store" })[1]!);
    await flush();

    expect(fake.store).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a value before storing.")).toBeTruthy();
  });

  it("credentials-ui-blank-refusal: whitespace-only input is refused", async () => {
    const fake = makeFake();
    render(<CredentialsPanel auth={fake} />);
    await flush();

    const input = screen.getAllByLabelText(/input$/i)[0]!;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getAllByRole("button", { name: "Store" })[0]!);
    await flush();

    expect(fake.store).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a value before storing.")).toBeTruthy();
  });
});

describe("CredentialsPanel — credentials-ui-per-kind-sign-out", () => {
  it("credentials-ui-per-kind-sign-out: sign-out one kind only affects that row", async () => {
    let oauthSaved = true;
    let apiKeySaved = true;
    const fake = makeFake();
    fake.status.mockImplementation(async (kind: CredentialKind) => {
      if (kind === "oauth") return oauthSaved;
      if (kind === "api-key") return apiKeySaved;
      return false;
    });
    fake.signOut.mockImplementation(async (kind: CredentialKind) => {
      if (kind === "oauth") oauthSaved = false;
      return true;
    });
    render(<CredentialsPanel auth={fake} />);
    await flush();

    const oauthRow = screen.getByText("Claude subscription token").closest(".credentials-row")!;
    fireEvent.click(oauthRow.querySelector("button.ghost")!);
    await flush();

    expect(fake.signOut).toHaveBeenCalledTimes(1);
    expect(fake.signOut).toHaveBeenCalledWith("oauth");
    expect(fake.status.mock.calls.filter(([k]) => k === "oauth").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Saved")).toHaveLength(1);
    expect(screen.getAllByText("Not saved")).toHaveLength(2);
  });
});

describe("DesktopCredentialsDock — feature detection with global", () => {
  it("opens the panel when desktopAuth is present on window", async () => {
    const fake = makeFake();
    (window as unknown as { desktopAuth: DesktopAuthBridge }).desktopAuth = fake;

    render(<DesktopCredentialsDock />);
    fireEvent.click(screen.getByRole("button", { name: "Open credentials" }));
    await flush();

    expect(screen.getByRole("region", { name: "Credentials" })).toBeTruthy();
    for (const kind of KINDS) {
      expect(screen.getByText(
        kind === "oauth"
          ? "Claude subscription token"
          : kind === "api-key"
            ? "Anthropic API key"
            : "Cursor API key",
      )).toBeTruthy();
    }
  });
});
