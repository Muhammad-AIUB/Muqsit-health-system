import { redirect } from "next/navigation";

// The app lives on per-tab URLs (app/[tab]); the root just forwards
// to the default tab.
export default function Home() {
  redirect("/prescription");
}
