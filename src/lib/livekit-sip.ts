import 'server-only'
import { SipClient } from 'livekit-server-sdk'
import { SIPDispatchRule, SIPDispatchRuleIndividual } from '@livekit/protocol'

/**
 * Registers phone numbers with self-hosted LiveKit SIP (see the merge plan's
 * LiveKit phone path). Twilio still terminates the actual PSTN call — as a
 * plain SIP trunk (Elastic SIP Trunking) pointed at this deployment's
 * livekit-sip service — but no Twilio SDK, Media Streams, or TwiML is
 * involved from here on; the call becomes a LiveKit room the moment it
 * reaches livekit-sip. See voice_engine/livekit_server.py for the other
 * half (webhook receiver + bot dispatch).
 *
 * One inbound trunk + one dispatch rule per ZeVox phone number, keyed by
 * e164. Room names follow `phone-{agentId}-{random}` — livekit_server.py
 * parses the agentId back out to resolve which agent config to load.
 */

const LIVEKIT_HOST = process.env.LIVEKIT_HOST || 'http://localhost:7880'
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || ''
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || ''

function getSipClient(): SipClient | null {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null
  return new SipClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
}

export interface LiveKitSipRegistration {
  trunkId: string
  dispatchRuleId: string
}

/**
 * Idempotent: if a trunk/rule already exists for this e164 (matched by
 * name), it's left as-is rather than duplicated. Call this whenever a
 * PhoneNumber's agentId changes (buy, import, or reassignment) so the room
 * prefix always reflects the currently-assigned agent.
 */
export async function registerPhoneNumberWithLiveKit(e164: string, agentId: string): Promise<LiveKitSipRegistration | null> {
  const sip = getSipClient()
  if (!sip) return null // LiveKit not configured — phone number stays legacy-Twilio-only

  const trunkName = `zevox-${e164}`
  const existingTrunks = await sip.listSipInboundTrunk({ numbers: [e164] })
  let trunkId = existingTrunks.find((t) => t.name === trunkName)?.sipTrunkId

  if (!trunkId) {
    const trunk = await sip.createSipInboundTrunk(trunkName, [e164])
    trunkId = trunk.sipTrunkId
  }

  const ruleName = `zevox-${e164}`
  const existingRules = await sip.listSipDispatchRule({ trunkIds: [trunkId] })
  const existingRule = existingRules.find((r) => r.name === ruleName)
  if (existingRule?.sipDispatchRuleId) {
    // Agent may have changed since the rule was created — update the room prefix.
    await sip.updateSipDispatchRuleFields(existingRule.sipDispatchRuleId, {
      rule: new SIPDispatchRule({
        rule: {
          case: 'dispatchRuleIndividual',
          value: new SIPDispatchRuleIndividual({ roomPrefix: `phone-${agentId}-` }),
        },
      }),
    })
    return { trunkId, dispatchRuleId: existingRule.sipDispatchRuleId }
  }

  const rule = await sip.createSipDispatchRule(
    { type: 'individual', roomPrefix: `phone-${agentId}-` },
    { name: ruleName, trunkIds: [trunkId] },
  )
  return { trunkId, dispatchRuleId: rule.sipDispatchRuleId }
}

export async function unregisterPhoneNumberFromLiveKit(e164: string): Promise<void> {
  const sip = getSipClient()
  if (!sip) return

  const trunkName = `zevox-${e164}`
  const trunks = await sip.listSipInboundTrunk({ numbers: [e164] })
  const trunk = trunks.find((t) => t.name === trunkName)
  if (!trunk) return

  const rules = await sip.listSipDispatchRule({ trunkIds: [trunk.sipTrunkId] })
  await Promise.all(rules.map((r) => sip.deleteSipDispatchRule(r.sipDispatchRuleId)))
  await sip.deleteSipTrunk(trunk.sipTrunkId)
}
