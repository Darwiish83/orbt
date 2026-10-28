import { withUserDb } from "@/db/scoped";
import { requireUser } from "@/modules/authz/session";
import { myProfile } from "@/modules/portal/customerApp";
import { SupportView } from "./SupportView";

export const metadata = { title: "Support" };

/** Customer App → Support / WhatsApp. */
export default async function SupportPage() {
  const user = await requireUser();
  const me = await withUserDb(user, (db) => myProfile(db, user));
  return <SupportView ref_={me.ref} />;
}
