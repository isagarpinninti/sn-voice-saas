export default function PrivacyPage() {
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
        <h1 className="text-[28px] font-bold text-white tracking-[-0.02em] mb-2">Privacy Policy</h1>
        <p className="text-[13px] text-zinc-600 mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <p className="mb-6">ZeVox (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) provides AI voice agent services for ServiceNow, HaloITSM, and other backends you connect. This policy explains how we collect, use, and protect your information.</p>

        <H>1. What We Collect</H>
        <p className="mb-2"><strong className="text-white">Account data:</strong> Name, email address, and profile image from your Google or GitHub account when you sign in.</p>
        <p className="mb-2"><strong className="text-white">Backend credentials:</strong> Your ServiceNow instance URL, username, and password, and credentials for any additional connector you configure (e.g. a HaloITSM API key or OAuth client secret). These are encrypted at rest and used solely to communicate with the backend you connect.</p>
        <p className="mb-6"><strong className="text-white">Usage data:</strong> Call duration (minutes), number of calls, token counts, and tool execution metadata. We do not store conversation transcripts or audio on our servers.</p>

        <H>2. What We Don&apos;t Collect</H>
        <p className="mb-2">We do not store voice audio recordings. Audio is processed in real-time and discarded after the call ends.</p>
        <p className="mb-2">We do not store conversation transcripts. All conversation data is written directly to your ServiceNow instance.</p>
        <p className="mb-6">We do not store your LLM API keys. These are configured in your ServiceNow instance and read by our gateway at session start only.</p>

        <H>3. How Data Flows</H>
        <p className="mb-6">When a user speaks to the voice agent: audio is streamed to Deepgram for transcription, the transcript is sent to your LLM provider, the response is sent to Deepgram for speech synthesis, and audio is streamed back. All conversation metadata is logged in your ServiceNow instance. Our servers process audio in memory only — nothing is persisted.</p>

        <H>4. Third-Party Services</H>
        <p className="mb-2"><strong className="text-white">Deepgram:</strong> Speech-to-text and text-to-speech processing. Subject to <a href="https://deepgram.com/privacy" className="text-emerald-400 hover:underline">Deepgram&apos;s Privacy Policy</a>.</p>
        <p className="mb-2"><strong className="text-white">Your LLM provider:</strong> The LLM API key you configure determines where your conversation text is processed (Groq, OpenAI, etc.).</p>
        <p className="mb-6"><strong className="text-white">RevenueCat / Stripe:</strong> Payment processing. We do not store credit card information.</p>

        <H>5. Data Security</H>
        <p className="mb-6">All backend credentials (ServiceNow, and any other connector you configure) are encrypted at rest. All data in transit uses TLS 1.2+. We apply the principle of least privilege — our gateway only accesses the API endpoints required for voice agent operation.</p>

        <H>6. Data Retention</H>
        <p className="mb-6">Account and usage data is retained while your account is active. Upon deletion of your account, all associated data is permanently removed within 30 days.</p>

        <H>7. Your Rights</H>
        <p className="mb-6">You can export or delete your data at any time from the dashboard settings. For any privacy inquiries, contact us at <a href="mailto:privacy@zevox.com" className="text-emerald-400 hover:underline">privacy@zevox.com</a>.</p>

        <H>8. Changes</H>
        <p>We may update this policy from time to time. We will notify you of any material changes by email or through the dashboard.</p>

        <div className="mt-12 pt-6 border-t border-white/[0.04] text-[11px] text-zinc-700">
          ZeVox
        </div>
      </article>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[16px] font-semibold text-white mt-8 mb-3">{children}</h2>
}
