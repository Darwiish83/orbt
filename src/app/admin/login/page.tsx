import { AdminLogin } from "./AdminLogin";

export const metadata = { title: "Admin Login" };

/** Staff sign-in. Customers use /login. */
export default function AdminLoginPage() {
  return <AdminLogin />;
}
