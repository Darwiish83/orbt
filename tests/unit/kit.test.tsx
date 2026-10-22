import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DataTable, Flag, isoOf, KV, ReceiptPaper, SearchBox, Seg, StatusBadge } from "@/ui/kit";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const wrap = (ui: ReactNode, lang: "en" | "so" = "en") => render(<I18nProvider initialLang={lang}>{ui}</I18nProvider>);

describe("countries / Flag", () => {
  it("maps English names, design aliases and ISO codes", () => {
    expect(isoOf("Turkey")).toBe("tr");
    expect(isoOf("Soomaaliya")).toBe("so");
    expect(isoOf("UAE")).toBe("ae");
    expect(isoOf("KE")).toBe("ke");
    expect(isoOf("Atlantis")).toBe("");
  });

  it("Flag points at the bundled SVG and renders nothing when unknown", () => {
    const { container, rerender } = wrap(<Flag country="India" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/flags/in.svg");
    rerender(
      <I18nProvider>
        <Flag country="" />
      </I18nProvider>,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("StatusBadge / KV", () => {
  it("translates the status label", () => {
    wrap(<StatusBadge status="Paid" />, "so");
    expect(screen.queryByText("Paid")).not.toBeInTheDocument();
  });

  it("KV shows label and value", () => {
    wrap(<KV label="Customer Reference" value="OR-3001" mono />);
    expect(screen.getByText("Customer Reference")).toBeInTheDocument();
    expect(screen.getByText("OR-3001")).toBeInTheDocument();
  });
});

describe("Seg / SearchBox", () => {
  it("Seg exposes radios and reports the picked value", async () => {
    const onChange = vi.fn();
    wrap(<Seg value="all" onChange={onChange} options={[["all", "All Shipments"], ["Air", "Air Freight", "Plane"]]} />);
    expect(screen.getByRole("radio", { name: "All Shipments" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: /Air Freight/ }));
    expect(onChange).toHaveBeenCalledWith("Air");
  });

  it("SearchBox is labelled by its placeholder", async () => {
    const onChange = vi.fn();
    wrap(<SearchBox value="" onChange={onChange} placeholder="Search tracking number" />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search tracking number" }), "W");
    expect(onChange).toHaveBeenCalledWith("W");
  });
});

describe("DataTable", () => {
  const cols = [
    { key: "no", label: "Invoice No.", mono: true },
    { key: "amount", label: "Amount", align: "right" as const },
  ];

  it("renders rows and the empty state", () => {
    const { rerender } = wrap(<DataTable cols={cols} rows={[{ no: "INV-1", amount: "$10.00" }]} />);
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    rerender(
      <I18nProvider>
        <DataTable cols={cols} rows={[]} />
      </I18nProvider>,
    );
    expect(screen.getByText("No records found")).toBeInTheDocument();
  });

  it("navigates only to local paths from hrefKey", async () => {
    push.mockClear();
    wrap(
      <DataTable
        cols={cols}
        hrefKey="href"
        rows={[
          { no: "INV-1", amount: "1", href: "/finance/inv-1" },
          { no: "INV-2", amount: "2", href: "//evil.example" },
          { no: "INV-3", amount: "3", href: "https://evil.example" },
        ]}
      />,
    );
    await userEvent.click(screen.getByText("INV-1"));
    await userEvent.click(screen.getByText("INV-2"));
    await userEvent.click(screen.getByText("INV-3"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/finance/inv-1");
  });
});

describe("ReceiptPaper", () => {
  const r = {
    receiptNo: "RCP-2026-1042",
    amount: "250.5",
    customerName: "Ayaan Ali",
    customerRef: "OR-3001",
    invoiceNo: "INV-2026-0007",
    date: "2026-10-02",
    bank: "Premier Bank",
    balance: "0.00",
  };

  it("shows the amount, references and bank logo; Paid when nothing remains", () => {
    const { container } = wrap(<ReceiptPaper r={r} />);
    expect(screen.getByText("$250.50")).toBeInTheDocument();
    expect(screen.getByText("RCP-2026-1042")).toBeInTheDocument();
    expect(screen.getByText("02 Oct 2026")).toBeInTheDocument();
    expect(container.querySelector('img[src="/banks/premier.png"]')).not.toBeNull();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("is Partial Paid when a balance remains", () => {
    wrap(<ReceiptPaper r={{ ...r, balance: "10.00" }} />);
    expect(screen.getByText("Partial Paid")).toBeInTheDocument();
  });
});
