import { redirect } from "next/navigation";

// Guest messaging lives at /guest-chat
export default function InboxPage() {
  redirect("/guest-chat");
}
