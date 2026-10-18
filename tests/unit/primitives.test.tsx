import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge, Button, Input, Tag } from "@/ui/primitives";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Book shipment</Button>);
    expect(screen.getByRole("button", { name: "Book shipment" })).toBeInTheDocument();
  });

  it("fires onClick when enabled", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Track</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled", () => {
    render(<Button disabled>Track</Button>);
    expect(screen.getByRole("button", { name: "Track" })).toBeDisabled();
  });
});

describe("Badge", () => {
  it("renders status text", () => {
    render(<Badge tone="success">Delivered</Badge>);
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("associates label with the input", () => {
    render(<Input label="Tracking number" />);
    expect(screen.getByLabelText("Tracking number")).toBeInTheDocument();
  });

  it("shows an error message over the hint", () => {
    render(<Input label="Weight" hint="In kilograms" error="Enter a positive weight" />);
    expect(screen.getByText("Enter a positive weight")).toBeInTheDocument();
    expect(screen.queryByText("In kilograms")).not.toBeInTheDocument();
  });
});

describe("Tag", () => {
  it("calls onRemove without triggering onClick", async () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <Tag onClick={onClick} onRemove={onRemove}>
        Air
      </Tag>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
});
