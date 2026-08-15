import { db } from './db'
import { encrypt } from './encrypt'

/**
 * Every ConnectorCredential write goes through this module. Values are
 * AES-256-GCM encrypted with the same encrypt.ts used for
 * Instance.snPassword/TwilioConnection.authToken — see M4 of the merge plan
 * for the proven Node<->Python compatibility this depends on
 * (voice_engine/connectors/zevox_crypto.py decrypts these at call time).
 *
 * `value` is a plain string for api_key secrets, or a JSON-stringified
 * {username,password} / {client_id,client_secret} object for basic_auth /
 * oauth2_client_credentials — mirrors zevox_credentials.py's resolve() shape.
 */

export async function createConnectorCredential(tenantId: string, kind: string, value: string): Promise<string> {
  const cred = await db.connectorCredential.create({
    data: { tenantId, kind, ciphertext: encrypt(value) },
  })
  return `local:${cred.id}`
}

export async function updateConnectorCredential(credentialId: string, tenantId: string, value: string): Promise<void> {
  const result = await db.connectorCredential.updateMany({
    where: { id: credentialId, tenantId },
    data: { ciphertext: encrypt(value) },
  })
  if (result.count === 0) throw new Error('Credential not found')
}
