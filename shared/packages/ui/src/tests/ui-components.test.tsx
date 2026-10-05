import { LanguageProvider } from "@sanny/i18n";
import { ThemeProvider } from "@sanny/styles";
import type { ReactNode } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  ButtonGroup,
  Checkbox,
  Error as ErrorPage,
  Settings,
  ToastViewport,
  showErrorToast,
  showToast,
} from "../index";

function renderWithProviders(ui: ReactNode) {
  return render(
    <ThemeProvider>
      <LanguageProvider>{ui}</LanguageProvider>
    </ThemeProvider>,
  );
}

function prepareEnglishLightPreferences() {
  localStorage.setItem("language", "en");
  document.cookie = "language=en; path=/";
  localStorage.setItem("theme", "light");
  document.cookie = "theme=light; path=/";
}

describe("shared UI controls", () => {
  it("keeps buttons keyboard operable and respects the native disabled state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ButtonGroup>
        <Button type="button" onClick={onClick}>
          Save
        </Button>
        <Button type="button" disabled onClick={onClick}>
          Delete
        </Button>
      </ButtonGroup>,
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(saveButton).toHaveClass("btn", "btn--primary");
    expect(deleteButton).toBeDisabled();

    await user.click(saveButton);
    await user.click(deleteButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("associates a checkbox with its label and displays validation feedback", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Receive updates" error="Choose an option" />);

    const checkbox = screen.getByRole("checkbox", {
      name: "Receive updates",
    });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("Choose an option")).toBeVisible();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});

describe("shared UI feedback", () => {
  it("announces errors as alerts and lets users dismiss them", async () => {
    const user = userEvent.setup();
    prepareEnglishLightPreferences();
    renderWithProviders(<ToastViewport />);

    act(() => {
      showErrorToast(new Error("Save failed"), "Request failed");
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Save failed");

    await user.click(
      within(alert).getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces status feedback and invokes its accessible action", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    prepareEnglishLightPreferences();
    renderWithProviders(<ToastViewport />);

    act(() => {
      showToast("Profile saved", {
        kind: "info",
        durationMs: 0,
        action: { label: "Undo", onClick: onUndo },
      });
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Profile saved");

    await user.click(within(status).getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});

describe("shared settings and error page", () => {
  it("persists theme and language control changes", async () => {
    const user = userEvent.setup();
    prepareEnglishLightPreferences();
    renderWithProviders(<Settings />);

    await user.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(screen.getByText("Theme: dark")).toBeVisible();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Switch to German" }));
    expect(screen.getByRole("heading", { name: "Darstellung" })).toBeVisible();
    expect(screen.getByText("Sprache: de")).toBeVisible();
    expect(document.documentElement).toHaveAttribute("lang", "de");
    expect(localStorage.getItem("language")).toBe("de");
  });

  it("renders translated not-found content and a home link", () => {
    prepareEnglishLightPreferences();
    const router = createMemoryRouter(
      [{ path: "*", element: <ErrorPage status={404} /> }],
      { initialEntries: ["/missing"] },
    );
    renderWithProviders(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Page Not Found" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
