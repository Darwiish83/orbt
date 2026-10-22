import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Checkbox,
  Dialog,
  Icon,
  IconButton,
  Radio,
  Select,
  ShipmentRow,
  Switch,
  Tabs,
  Toast,
  Tooltip,
  TrackingTimeline,
} from "@/ui/primitives";

describe("IconButton", () => {
  it("exposes its label as the accessible name", async () => {
    const onClick = vi.fn();
    render(<IconButton label="Notifications" icon={<Icon name="Bell" />} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button so it never submits a form", () => {
    render(<IconButton label="Add" icon={<Icon name="Plus" />} />);
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("type", "button");
  });
});

describe("Select", () => {
  it("labels the select and renders string and object options", () => {
    render(<Select label="Service" options={["Express Air", { value: "sea", label: "Standard Sea" }]} />);
    const sel = screen.getByLabelText("Service");
    expect(sel).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Standard Sea" })).toHaveValue("sea");
  });

  it("marks the field invalid and shows the error", () => {
    render(<Select label="Mode" options={["Air"]} error="Choose a mode" />);
    expect(screen.getByLabelText("Mode")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose a mode")).toBeInTheDocument();
  });
});

describe("Checkbox / Radio / Switch", () => {
  it("Checkbox reports the new checked state", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Cargo insurance" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Cargo insurance" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("Radio reports its value", async () => {
    const onChange = vi.fn();
    render(<Radio name="sp" value="express" label="Express" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Express" }));
    expect(onChange).toHaveBeenCalledWith("express");
  });

  it("Switch toggles via its button and its label", async () => {
    const onChange = vi.fn();
    render(<Switch label="SMS updates" checked onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "SMS updates" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sw);
    await userEvent.click(screen.getByText("SMS updates"));
    expect(onChange).toHaveBeenNthCalledWith(1, false);
    expect(onChange).toHaveBeenNthCalledWith(2, false);
  });

  it("disabled Switch ignores clicks", async () => {
    const onChange = vi.fn();
    render(<Switch label="Off" disabled onChange={onChange} />);
    await userEvent.click(screen.getByText("Off"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Tabs", () => {
  it("marks the active tab and shows counts", async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        value="invoices"
        onChange={onChange}
        tabs={[{ value: "invoices", label: "Invoices", count: 4 }, "Statement"]}
      />,
    );
    expect(screen.getByRole("tab", { name: /Invoices/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Statement" }));
    expect(onChange).toHaveBeenCalledWith("Statement");
  });
});

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(<Dialog open={false} title="Logout" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is labelled by its title and closes on Escape and the close button", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Logout" onClose={onClose}>
        Are you sure?
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Logout" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close when clicking inside the panel", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Edit" onClose={onClose}>
        Body text
      </Dialog>,
    );
    await userEvent.click(screen.getByText("Body text"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Toast / Tooltip", () => {
  it("Toast uses role=alert for danger and status otherwise", () => {
    const { rerender } = render(<Toast tone="danger" title="Upload failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
    rerender(<Toast title="Saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("Tooltip appears on hover", async () => {
    render(
      <Tooltip content="Chargeable weight">
        <span>Hover me</span>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.hover(screen.getByText("Hover me"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Chargeable weight");
  });
});

describe("TrackingTimeline / ShipmentRow", () => {
  it("marks the current step", () => {
    render(
      <TrackingTimeline
        events={[
          { title: "Departed", state: "done" },
          { title: "In Transit", location: "Flight", time: "Tue", state: "current" },
          { title: "Arrived", state: "upcoming" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Flight")).toBeInTheDocument();
  });

  it("ShipmentRow shows the status label, overridable for translation", () => {
    const { rerender } = render(<ShipmentRow id="W-12" origin="Istanbul" destination="Mogadishu" status="delayed" />);
    expect(screen.getByText("Delayed")).toBeInTheDocument();
    rerender(<ShipmentRow id="W-12" origin="Istanbul" destination="Mogadishu" status="delayed" statusLabel="Daahay" />);
    expect(screen.getByText("Daahay")).toBeInTheDocument();
  });
});
