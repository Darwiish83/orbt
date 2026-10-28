import { withUserDb } from "@/db/scoped";
import { requireUser } from "@/modules/authz/session";
import { myProfile } from "@/modules/portal/customerApp";
import { logout } from "@/app/login/actions";
import { ProfileView } from "./ProfileView";

export const metadata = { title: "Profile" };

/** Customer App → Profile (spec A10). */
export default async function MyProfilePage() {
  const user = await requireUser();
  const me = await withUserDb(user, (db) => myProfile(db, user));
  return <ProfileView me={me} onLogout={logout} />;
}
