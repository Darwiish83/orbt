import { Login } from "./Login";

export const metadata = { title: "Log in" };

/** The one sign-in page for staff and customers (ADR-021). */
export default function LoginPage() {
  return <Login />;
}
