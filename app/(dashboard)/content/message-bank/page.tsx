import { getAccessContext } from "@/lib/auth";
import { getMessageBank, getPrompts } from "@/lib/queries/content";
import { MessageBankEditor } from "@/components/content/MessageBankEditor";

export const dynamic = "force-dynamic";

export default async function MessageBankPage() {
  const ctx = await getAccessContext();
  const [bank, prompts] = await Promise.all([getMessageBank(), getPrompts()]);

  return (
    <div className="p-6">
      <MessageBankEditor bank={bank} prompts={prompts} isAdmin={ctx?.isAdmin ?? false} />
    </div>
  );
}
