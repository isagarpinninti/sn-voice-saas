export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <nav className="sticky top-0 z-50 glass">
        <div className="max-w-[700px] mx-auto px-6 h-14 flex items-center">
          <a href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /></svg>
            </div>
            <span className="text-[13px] font-semibold">ZeVox</span>
          </a>
        </div>
      </nav>

      <article className="max-w-[700px] mx-auto px-6 py-16 text-[14px] text-zinc-400 leading-[1.8]">
        <h1 className="text-[28px] font-bold text-white tracking-[-0.02em] mb-2">Terms of Service</h1>
        <p className="text-[13px] text-zinc-600 mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <p className="mb-6">These terms govern your use of ZeVox, an AI voice agent platform for ServiceNow, operated by ZeTechno.</p>

        <H>1. Service Description</H>
        <p className="mb-6">ZeVox provides a voice gateway that enables AI-powered voice conversations with ServiceNow. The service includes speech-to-text processing, text-to-speech synthesis, and a real-time voice pipeline. All agent configuration, tool execution, and conversation data storage occurs on your ServiceNow instance.</p>

        <H>2. Accounts</H>
        <p className="mb-6">You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials, API tokens, and ServiceNow connection details. You must notify us immediately of any unauthorized use.</p>

        <H>3. Free Trial</H>
        <p className="mb-6">New accounts receive a one-time allocation of 50 minutes of voice processing. This trial does not renew. Once the 50 minutes are consumed, you must upgrade to a paid plan to continue using the service.</p>

        <H>4. Paid Plans</H>
        <p className="mb-6">Paid subscriptions are billed monthly. Minutes reset at the beginning of each billing cycle. Overage charges apply at the rates specified on the pricing page when you exceed your plan&apos;s minute allocation. You may upgrade, downgrade, or cancel at any time. Upon cancellation, you retain access until the end of your current billing period.</p>

        <H>5. Acceptable Use</H>
        <p className="mb-2">You agree not to:</p>
        <ul className="space-y-1 mb-6 pl-4">
          <li>• Use the service for any illegal or harmful purpose</li>
          <li>• Attempt to reverse-engineer, decompile, or extract the gateway source code</li>
          <li>• Share your API tokens with unauthorized parties</li>
          <li>• Use the service to process data subject to regulations (HIPAA, PCI-DSS) without appropriate safeguards on your end</li>
          <li>• Exceed rate limits or attempt to circumvent usage tracking</li>
        </ul>

        <H>6. Your Data</H>
        <p className="mb-6">You retain full ownership of all data processed through the service. Conversation content, tool outputs, and user interactions are stored on your ServiceNow instance, not on our servers. We process audio in real-time memory only. See our <a href="/privacy" className="text-emerald-400 hover:underline">Privacy Policy</a> for full details.</p>

        <H>7. ServiceNow Credentials</H>
        <p className="mb-6">You are responsible for creating and managing the ServiceNow service account used by ZeVox. We recommend creating a dedicated account with the minimum required roles. Credentials are encrypted at rest on our servers and used solely for API communication with your instance.</p>

        <H>8. Availability</H>
        <p className="mb-6">We target 99.9% uptime for paid plans but do not guarantee it for the free tier. We reserve the right to perform maintenance with reasonable notice. The voice gateway depends on third-party services (Deepgram, your LLM provider) whose availability is outside our control.</p>

        <H>9. Limitation of Liability</H>
        <p className="mb-6">ZeVox is provided &quot;as is&quot;. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.</p>

        <H>10. Changes</H>
        <p className="mb-6">We may update these terms from time to time. Material changes will be communicated via email or dashboard notification at least 30 days in advance. Continued use of the service after changes take effect constitutes acceptance.</p>

        <H>11. Contact</H>
        <p>For questions about these terms, contact <a href="mailto:legal@zevox.com" className="text-emerald-400 hover:underline">legal@zevox.com</a>.</p>

        <div className="mt-12 pt-6 border-t border-white/[0.04] text-[11px] text-zinc-700">
          ZeVox — A ZeTechno Product
        </div>
      </article>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[16px] font-semibold text-white mt-8 mb-3">{children}</h2>
}
