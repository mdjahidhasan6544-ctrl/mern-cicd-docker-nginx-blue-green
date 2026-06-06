import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DeviceWarning from "../../src/components/DeviceWarning.jsx";

describe("<DeviceWarning />", () => {
  it("renders nothing when message is empty", () => {
    const { container } = render(<DeviceWarning message="" onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the alert banner with the message when message is set", () => {
    render(<DeviceWarning message="You are signed in on 2 devices" onClose={() => {}} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("You are signed in on 2 devices");
    expect(alert).toHaveTextContent("Device limit reached");
  });

  it("calls onClose when the Dismiss button is clicked", () => {
    const onClose = vi.fn();
    render(<DeviceWarning message="Limit reached" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
