import { CustomerLogin } from "./CustomerLogin";

export const metadata = { title: "Log in" };

/** Customer sign-in. Staff use /admin/login. */
export default function LoginPage() {
  return <CustomerLogin />;
}
