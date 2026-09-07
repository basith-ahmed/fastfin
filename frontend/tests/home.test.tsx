import { render, screen } from "@testing-library/react";

import Home from "@/app/page";

describe("Home", () => {
  it("renders the FastFin landing page", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "FastFin" })).toBeInTheDocument();
    expect(screen.getByText("Evidence-grounded PDF fact intelligence")).toBeInTheDocument();
  });
});
